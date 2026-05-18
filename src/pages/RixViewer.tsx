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
  } | null>(null);

  const [reports, setReports] = useState<ReportMemoryEntry[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() => getActiveId());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
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
      | { autoSendQuestion?: string; reportId?: string; sessionId?: string }
      | null;
    if (!st?.autoSendQuestion || !st?.sessionId || !st?.reportId) return;
    if (autoSentRef.current === st.reportId) return;
    autoSentRef.current = st.reportId;

    setActiveId(st.reportId);
    setActiveIdState(st.reportId);
    if (userId) {
      void listReports(userId).then(setReports);
    }

    setPending({
      question: st.autoSendQuestion,
      sessionId: st.sessionId,
      reportId: st.reportId,
    });

    // Switch chat context to the new dedicated session.
    loadConversation(st.sessionId);

    // Clear navigation state to avoid resends on reload/back.
    navigate(location.pathname, { replace: true, state: {} });
  }, [location, navigate, loadConversation, userId]);

  // Step 2: Once the chat context has actually switched to the report's
  // session, fire the compiled question. This avoids the fragile setTimeout
  // and guarantees the user sees the loading state.
  useEffect(() => {
    if (!pending) return;
    if (!userId) return; // wait for auth to resolve
    if (sessionId !== pending.sessionId) return;
    if (isLoadingHistory) return; // wait for history hydration to finish
    const q = pending.question;
    setPending(null);
    sendMessage(q, { skipNormalization: true });
  }, [pending, sessionId, sendMessage, userId, isLoadingHistory]);

  const activeReport = useMemo(
    () => reports.find((r) => r.id === activeId) ?? null,
    [reports, activeId],
  );

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
    setRenameValue(entry.customName || entry.title);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    await renameReport(userId, renamingId, renameValue);
    setRenamingId(null);
    setRenameValue("");
    await refresh();
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

  const isGenerating = !!pending || (isLoading && messages.length === 0);
  const isEmpty =
    !isLoading &&
    !isLoadingHistory &&
    !pending &&
    messages.length === 0 &&
    reports.length === 0;

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
                          className="h-6 text-xs px-1.5"
                        />
                        <button
                          type="button"
                          onClick={() => void commitRename()}
                          className="text-primary hover:text-primary/80"
                          aria-label="Guardar nombre"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
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
      <Header />

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

          {messages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
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
                </>
              )}
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
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
            <div className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)]">
              {MemoryList}
            </div>
            <Card className="min-w-0 max-w-full overflow-x-hidden shadow-card">
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