import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FileBarChart2, Download, Pencil, Plus, Loader2, Trash2, RefreshCw, Check, X } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { useChatContext } from "@/contexts/ChatContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanies } from "@/hooks/useCompanies";
import { useLatestBatchDate } from "@/hooks/useLatestBatchDate";
import { compileFiltersToQuestion } from "@/lib/reports/compileQuestion";
import { buildReportTitle } from "@/lib/reports/reportMemory";
import type { CompanyMeta } from "@/lib/reports/coherenceEngine";
import type { FilterState } from "@/lib/reports/filterState";
import { RegenerateDialog } from "@/components/reports/RegenerateDialog";
import { ComparisonReport } from "@/components/reports/ComparisonReport";
import { ProfileReport } from "@/components/reports/ProfileReport";
import { downloadReportPdf } from "@/lib/reports/downloadReportPdf";
import {
  listReports,
  getActiveId,
  setActiveId,
  removeReport,
  clearAll,
  renameReport,
  addReport,
  ReportMemoryEntry,
} from "@/lib/reports/reportMemory";
import { toast } from "@/hooks/use-toast";

// Persist `pending` across remounts caused by auth-state churn. Without
// this, a TOKEN_REFRESHED or transient `isAuthenticated=false→true` flip
// during the visor mount drops the in-memory pending and the report is
// never dispatched (root cause of the 2026-05-24 incident).
const PENDING_STORAGE_KEY = "repindex.rixviewer.pending";
const PENDING_MAX_AGE_MS = 2 * 60 * 1000; // 2 min — stale pendings are dropped.
type PendingSend = { question: string; sessionId: string; reportId: string; ts?: number };
function loadPersistedPending(): PendingSend | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.question === "string" &&
      typeof parsed.sessionId === "string" &&
      typeof parsed.reportId === "string"
    ) {
      const ts = typeof parsed.ts === "number" ? parsed.ts : 0;
      if (Date.now() - ts > PENDING_MAX_AGE_MS) {
        try { window.sessionStorage.removeItem(PENDING_STORAGE_KEY); } catch { /* noop */ }
        return null;
      }
      return parsed as PendingSend;
    }
  } catch { /* noop */ }
  return null;
}
function persistPending(p: PendingSend | null) {
  if (typeof window === "undefined") return;
  try {
    if (p) window.sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify({ ...p, ts: Date.now() }));
    else window.sessionStorage.removeItem(PENDING_STORAGE_KEY);
  } catch { /* noop */ }
}

export default function RixViewer() {
  const {
    sessionId,
    messages,
    isLoading,
    isLoadingHistory,
    loadingMessage,
    sendMessage,
    loadConversation,
    downloadAsTxt,
    downloadAsJson,
    downloadAsHtml,
    language,
  } = useChatContext();

  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { data: companiesRaw } = useCompanies();
  const { data: lastBatchDate } = useLatestBatchDate();
  const companies: CompanyMeta[] = useMemo(
    () =>
      (companiesRaw ?? []).map((c) => ({
        ticker: c.ticker,
        issuer_name: c.issuer_name,
        sector_category: c.sector_category ?? null,
        subsector: (c as any).subsector ?? null,
        ibex_family_code: c.ibex_family_code ?? null,
        cotiza_en_bolsa: typeof (c as any).cotiza_en_bolsa === "boolean" ? (c as any).cotiza_en_bolsa : null,
        verified_competitors: Array.isArray((c as any).verified_competitors)
          ? ((c as any).verified_competitors as unknown[])
              .map((x) => (typeof x === "string" ? x : String(x)))
              .filter((x) => x && x.length > 0)
          : null,
      })),
    [companiesRaw],
  );
  const autoSentRef = useRef<string | null>(null);
  // Pending send: waits until sessionId matches the report's session
  // before firing sendMessage, so the user always sees a clear
  // "Generando informe…" indicator and the request lands on the right session.
  const [pending, setPending] = useState<{
    question: string;
    sessionId: string;
    reportId: string;
  } | null>(() => loadPersistedPending());
  const pendingSinceRef = useRef<number | null>(null);
  const retryNudgeRef = useRef<number | null>(null);
  const errorToastRef = useRef<number | null>(null);

  const [reports, setReports] = useState<ReportMemoryEntry[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() => getActiveId());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameOriginalRef = useRef<string>("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setReports(await listReports(userId));
    setActiveIdState(getActiveId());
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
  }, [userId, refresh]);

  // Step 1: Receive a freshly generated report from /informes and queue it.
  useEffect(() => {
    const st = location.state as
      | { autoSendQuestion?: string; reportId?: string; sessionId?: string; deterministic?: boolean }
      | null;
    if (!st?.sessionId || !st?.reportId) return;
    if (autoSentRef.current === st.reportId) return;
    autoSentRef.current = st.reportId;

    setActiveId(st.reportId);
    setActiveIdState(st.reportId);
    if (userId) {
      void listReports(userId).then(setReports);
    }

    // Switch chat context to the report's dedicated session.
    loadConversation(st.sessionId);

    // Only queue an LLM dispatch when a question was provided (non-comparativa).
    if (st.autoSendQuestion) {
      const next: PendingSend = {
        question: st.autoSendQuestion,
        sessionId: st.sessionId,
        reportId: st.reportId,
      };
      setPending(next);
      persistPending(next);
      pendingSinceRef.current = Date.now();
    }

    // Clear navigation state to avoid resends on reload/back.
    navigate(location.pathname, { replace: true, state: {} });
  }, [location, navigate, loadConversation, userId]);

  // Step 2: Once the chat context has actually switched to the report's
  // session, fire the compiled question. This avoids the fragile setTimeout
  // and guarantees the user sees the loading state.
  useEffect(() => {
    if (!pending) return;
    if (!userId) {
      console.warn("[RixViewer] auto-send blocked: userId not ready");
      return;
    }
    if (sessionId !== pending.sessionId) {
      console.warn(
        "[RixViewer] auto-send blocked: sessionId mismatch",
        { contextSession: sessionId, pendingSession: pending.sessionId },
      );
      return;
    }
    if (isLoadingHistory) {
      console.warn("[RixViewer] auto-send blocked: history still hydrating");
      return;
    }
    const q = pending.question;
    setPending(null);
    persistPending(null);
    pendingSinceRef.current = null;
    if (retryNudgeRef.current) { window.clearTimeout(retryNudgeRef.current); retryNudgeRef.current = null; }
    if (errorToastRef.current) { window.clearTimeout(errorToastRef.current); errorToastRef.current = null; }
    sendMessage(q, { skipNormalization: true });
  }, [pending, sessionId, sendMessage, userId, isLoadingHistory]);

  // Watchdog: if `pending` stays unresolved due to auth/session churn,
  // (a) re-fire loadConversation after 8s, (b) surface a retry toast after 15s.
  useEffect(() => {
    if (!pending) return;
    if (retryNudgeRef.current) return; // already scheduled

    retryNudgeRef.current = window.setTimeout(() => {
      retryNudgeRef.current = null;
      // Re-assert the conversation switch in case the ChatContext drifted
      // (auth flip-flop occasionally rotates sessionId mid-mount).
      console.warn("[RixViewer] watchdog nudging loadConversation()", pending.sessionId);
      loadConversation(pending.sessionId);
    }, 8000);

    errorToastRef.current = window.setTimeout(() => {
      errorToastRef.current = null;
      toast({
        title: "El informe no se ha lanzado",
        description:
          "Hubo una interrupción al iniciar la consulta. Pulsa “Reintentar informe” para relanzarlo.",
        variant: "destructive",
      });
    }, 15000);

    return () => {
      if (retryNudgeRef.current) { window.clearTimeout(retryNudgeRef.current); retryNudgeRef.current = null; }
      if (errorToastRef.current) { window.clearTimeout(errorToastRef.current); errorToastRef.current = null; }
    };
  }, [pending, loadConversation]);

  // Manual relaunch: rebuild `pending` from the active report and force
  // the chat context onto its session. Surfaced as a button when the
  // active report has no messages and we are not currently loading.
  const handleRelaunchActive = useCallback(() => {
    const target = reports.find((r) => r.id === activeId);
    if (!target) return;
    const next: PendingSend = {
      question: target.question,
      sessionId: target.sessionId,
      reportId: target.id,
    };
    autoSentRef.current = null;
    setPending(next);
    persistPending(next);
    pendingSinceRef.current = Date.now();
    loadConversation(target.sessionId);
  }, [reports, activeId, loadConversation]);

  const activeReport = useMemo(
    () => reports.find((r) => r.id === activeId) ?? null,
    [reports, activeId],
  );

  // Comparativa reports are rendered by a DETERMINISTIC frontend component
  // (ComparisonReport). We must not dispatch the compiled question to the
  // chat agent for these, so there's no LLM narrative for comparativas.
  const isComparativeActive = !!(
    activeReport &&
    (activeReport.filters?.tickers?.value?.length ?? 0) >= 2
  );
  const isProfileActive = !!(
    activeReport &&
    (activeReport.filters?.tickers?.value?.length ?? 0) === 1
  );
  const isDeterministicActive = isComparativeActive || isProfileActive;

  const reportCaptureRef = useRef<HTMLDivElement | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadDeterministicPdf = useCallback(async () => {
    if (!reportCaptureRef.current || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      const entityLabel =
        activeReport?.customName ||
        activeReport?.title ||
        (activeReport?.filters?.tickers?.value ?? []).join("-") ||
        "informe";
      const safe = entityLabel
        .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 80) || "informe";
      const week = new Date().toISOString().slice(0, 10);
      const filename = `RepIndex-${safe}-${week}.pdf`;
      await downloadReportPdf(reportCaptureRef.current, filename);
    } catch (err) {
      console.error("[pdf] download failed", err);
      toast({
        title: "No se pudo generar el PDF",
        description: "Inténtalo de nuevo en unos segundos.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [activeReport, isDownloadingPdf]);

  // If a pending auto-send belongs to a deterministic report (perfil o
  // comparativa), drop it silently — nunca llamamos al LLM en esos casos.
  useEffect(() => {
    if (!pending) return;
    const target = reports.find((r) => r.id === pending.reportId);
    if (!target) return;
    const n = target.filters?.tickers?.value?.length ?? 0;
    const isDet = n >= 1;
    if (isDet) {
      setPending(null);
      persistPending(null);
      pendingSinceRef.current = null;
      if (retryNudgeRef.current) { window.clearTimeout(retryNudgeRef.current); retryNudgeRef.current = null; }
      if (errorToastRef.current) { window.clearTimeout(errorToastRef.current); errorToastRef.current = null; }
    }
  }, [pending, reports]);

  const handleSelect = (entry: ReportMemoryEntry) => {
    if (entry.id === activeId) return;
    setActiveId(entry.id);
    setActiveIdState(entry.id);
    loadConversation(entry.sessionId);
  };

  const handleRemove = async (id: string) => {
    await removeReport(userId, id);
    await refresh();
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await handleRemove(id);
  };

  const startRename = (entry: ReportMemoryEntry) => {
    setRenamingId(entry.id);
    const original = entry.customName || entry.title;
    setRenameValue(original);
    renameOriginalRef.current = original;
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const next = renameValue.trim();
    const original = renameOriginalRef.current.trim();
    // No-op si no cambió: sólo cerrar el input
    if (next === original) {
      setRenamingId(null);
      setRenameValue("");
      return;
    }
    const res = await renameReport(userId, renamingId, renameValue);
    setRenamingId(null);
    setRenameValue("");
    await refresh();
    if (res.ok) {
      toast({ title: "Nombre actualizado" });
    } else {
      toast({
        title: "No se pudo guardar el nombre",
        description: res.error ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleRegenerate = async (filters: FilterState) => {
    if (!activeReport || !userId) return;
    setIsRegenerating(true);
    try {
      const question = compileFiltersToQuestion(filters, companies);
      const newSessionId = crypto.randomUUID();
      const baseName = activeReport.customName || activeReport.title;
      const entry = await addReport(userId, {
        title: buildReportTitle(filters, companies),
        question,
        sessionId: newSessionId,
        filters,
        summary: activeReport.summary,
      });
      if (!entry) {
        setIsRegenerating(false);
        return;
      }
      await renameReport(userId, entry.id, `${baseName} (actualizado)`);
      await refresh();
      setRegenOpen(false);
      navigate("/visor", {
        state: {
          autoSendQuestion: question,
          reportId: entry.id,
          sessionId: newSessionId,
        },
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDuplicateAndEdit = (filters: FilterState) => {
    setRegenOpen(false);
    navigate("/informes", { state: { prefilFilters: filters } });
  };

  const handleClearAll = async () => {
    await clearAll(userId);
    await refresh();
  };

  const handleNew = () => navigate("/informes");

  const handleEditFilters = () => {
    if (!activeReport) return;
    navigate("/informes", { state: { prefilFilters: activeReport.filters } });
  };

  const isGenerating = !isDeterministicActive && (!!pending || (isLoading && messages.length === 0));
  const isEmpty =
    !isLoading &&
    !isLoadingHistory &&
    !pending &&
    messages.length === 0 &&
    reports.length === 0;

  // Active report selected, but no messages and no in-flight work →
  // probable failed auto-send. Show a relaunch CTA.
  const showRelaunchActive =
    !!activeReport &&
    !isDeterministicActive &&
    !isLoading &&
    !isLoadingHistory &&
    !pending &&
    messages.length === 0;

  // Lightweight inline list (avoids extra component file dependency surface)
  const MemoryList = (
    <aside className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Informes cargados
        </h2>
        <span className="text-xs text-muted-foreground">{reports.length}</span>
      </div>

      <Button onClick={handleNew} size="sm" className="gap-1.5 justify-start">
        <Plus className="h-3.5 w-3.5" /> Nuevo informe
      </Button>

      <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-1 -mr-1 max-h-[60vh]">
        {reports.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-2 py-3">
            Aún no has generado ningún informe.
          </p>
        ) : (
          reports.map((r) => {
            const isActive = r.id === activeId;
            const displayName = r.customName || r.title;
            const isRenaming = renamingId === r.id;
            return (
              <div
                key={r.id}
                onClick={() => !isRenaming && handleSelect(r)}
                className={`group relative rounded-md border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <FileBarChart2
                    className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commitRename();
                            else if (e.key === "Escape") cancelRename();
                          }}
                          onBlur={() => {
                            // Autosave al perder foco: si el valor cambió, persistimos.
                            // Si no cambió, commitRename detecta el no-op y solo cierra el input.
                            if (renamingId) void commitRename();
                          }}
                          className="h-6 text-xs px-1.5"
                        />
                        <button
                          type="button"
                          // mouseDown dispara antes del blur del Input para evitar doble commit
                          onMouseDown={(e) => {
                            e.preventDefault();
                            void commitRename();
                          }}
                          className="text-primary hover:text-primary/80"
                          aria-label="Guardar nombre"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            cancelRename();
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs font-medium truncate">{displayName}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(r.createdAt).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(r);
                        }}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        aria-label="Renombrar"
                        title="Renombrar"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteId(r.id);
                        }}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        aria-label="Eliminar"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {reports.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearAll}
          className="text-xs text-muted-foreground justify-start"
        >
          Limpiar memoria
        </Button>
      )}
    </aside>
  );

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Visor de Informes RIX | RepIndex</title>
        <meta
          name="description"
          content="Visor de informes RIX deterministas con narrativa V2 completa, 9 epígrafes y bibliografía verificada."
        />
      </Helmet>
      <div className="no-print">
        <Header />
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          main.container { max-width: 100% !important; padding: 0 !important; }
          .rix-comparison-print-grid { display: block !important; }
          .rix-comparison-print-grid > aside { display: none !important; }
          .rix-comparison-print-grid > .rix-print-content { max-width: 100% !important; }
          .rix-print-content .shadow-card,
          .rix-print-content [class*="shadow"] { box-shadow: none !important; }
          .rix-print-content .card,
          .rix-print-content [class*="rounded"] { break-inside: avoid; page-break-inside: avoid; }
          .rix-print-content h1, .rix-print-content h2, .rix-print-content h3 { page-break-after: avoid; }
          .rix-print-content section, .rix-print-content .card { break-inside: avoid; }
          .rix-print-content a { color: #1a56db !important; text-decoration: underline; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <main className="container max-w-screen-2xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileBarChart2 className="h-6 w-6 text-primary" />
              Visor de Informes RIX
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Resultados deterministas con narrativa V2 · 9 epígrafes · bibliografía verificada
            </p>
          </div>

          {(messages.length > 0 || isDeterministicActive) && (
            <div className="flex flex-wrap items-center gap-2 no-print">
              {activeReport && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleEditFilters}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar filtros
                  </Button>
                  {!isDeterministicActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setRegenOpen(true)}
                    disabled={isRegenerating || isLoading}
                    title="Edita los filtros y relanza el informe con la última versión del agente"
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Regenerar informe
                  </Button>
                  )}
                </>
              )}
              {isDeterministicActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleDownloadDeterministicPdf}
                  disabled={isDownloadingPdf}
                >
                  {isDownloadingPdf ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando PDF…
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" /> Descargar PDF
                    </>
                  )}
                </Button>
              ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background border z-50">
                  <DropdownMenuItem onClick={downloadAsHtml} className="font-medium">
                    Descargar informe (HTML)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadAsTxt}>TXT</DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadAsJson}>JSON</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </div>
          )}
        </div>

        {isEmpty ? (
          <Card className="max-w-2xl mx-auto mt-12">
            <CardContent className="py-12 text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <FileBarChart2 className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Aún no has generado ningún informe</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Construye un informe con los 11 filtros bidireccionales del constructor
                  y obtendrás aquí la narrativa V2 completa con 9 epígrafes + bibliografía.
                </p>
              </div>
              <Button size="lg" onClick={handleNew} className="gap-2 mt-2">
                <Plus className="h-4 w-4" /> Crear informe RIX
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rix-comparison-print-grid grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
            <aside className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] no-print">
              {MemoryList}
            </aside>
            <Card className="rix-print-content min-w-0 max-w-full overflow-x-hidden shadow-card">
              <CardContent className="pt-6 min-w-0 max-w-full overflow-x-hidden">
                {isGenerating && (
                  <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        Generando informe RIX…
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {loadingMessage || "Consultando los 6 modelos de IA y consolidando la narrativa V2."}
                      </p>
                    </div>
                  </div>
                )}
                {showRelaunchActive && (
                  <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Este informe no llegó a ejecutarse
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Posible interrupción de sesión durante el lanzamiento. Puedes relanzarlo sin perder los filtros.
                      </p>
                    </div>
                    <Button size="sm" onClick={handleRelaunchActive} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" /> Reintentar informe
                    </Button>
                  </div>
                )}
                {isComparativeActive && activeReport ? (
                  <ComparisonReport
                    tickers={activeReport.filters.tickers.value}
                  />
                ) : isProfileActive && activeReport ? (
                  <ProfileReport
                    ticker={activeReport.filters.tickers.value[0]}
                  />
                ) : (
                  <ChatMessages
                    messages={messages}
                    isLoading={isLoading}
                    isLoadingHistory={isLoadingHistory}
                    loadingMessage={loadingMessage}
                    onSuggestedQuestion={() => undefined}
                    onStarterPrompt={() => undefined}
                    compact={false}
                    sessionId={sessionId}
                    languageCode={language.code}
                    unboundedHeight
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <AlertDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este informe?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El informe se eliminará de tu memoria
              y de la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeReport && (
        <RegenerateDialog
          open={regenOpen}
          onOpenChange={setRegenOpen}
          initialFilters={activeReport.filters}
          companies={companies}
          lastBatchDate={lastBatchDate ?? null}
          isRegenerating={isRegenerating}
          onRegenerate={(f) => void handleRegenerate(f)}
          onDuplicateAndEdit={handleDuplicateAndEdit}
        />
      )}
    </div>
  );
}