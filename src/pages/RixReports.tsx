import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FileBarChart2, RotateCcw, Send } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { useCompanies } from "@/hooks/useCompanies";
import { useLatestBatchDate } from "@/hooks/useLatestBatchDate";
import {
  createInitialFilterState,
  FilterState,
  setFilter,
  reanchorWindow,
} from "@/lib/reports/filterState";
import { runCoherence, CompanyMeta } from "@/lib/reports/coherenceEngine";
import { FilterPanel } from "@/components/reports/FilterPanel";
import { LivePreview } from "@/components/reports/LivePreview";
import { compileFiltersToQuestion } from "@/lib/reports/compileQuestion";
import { addReport, buildReportTitle } from "@/lib/reports/reportMemory";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export default function RixReports() {
  const { data: companiesRaw, isLoading } = useCompanies();
  const { data: lastBatchDate } = useLatestBatchDate();
  const [state, setState] = useState<FilterState>(createInitialFilterState());
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Rehydrate filters when arriving from "Editar filtros" in the viewer.
  useEffect(() => {
    const st = location.state as { prefilFilters?: FilterState } | null;
    if (st?.prefilFilters) {
      setState(st.prefilFilters);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando llega el último barrido y el usuario no ha tocado la ventana,
  // re-anclar el preset por defecto (last_month) a esa fecha.
  useEffect(() => {
    if (!lastBatchDate) return;
    if (state.window.origin !== "free") return;
    if (state.window.value.to === lastBatchDate) return; // ya anclado
    const next = reanchorWindow(state.window.value, lastBatchDate);
    setState((prev) =>
      setFilter(prev, "window", next, "free"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBatchDate]);

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

  const coherence = useMemo(
    () => runCoherence(state, companies),
    [state, companies],
  );

  const hasErrors = coherence.warnings.some((w) => w.level === "error");

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Informes RIX | RepIndex</title>
        <meta
          name="description"
          content="Genera informes RIX deterministas con 11 filtros bidireccionales. Datos garantizados, narrativa idéntica al Agente RIX."
        />
      </Helmet>
      <Header />
      <main className="container max-w-screen-2xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileBarChart2 className="h-6 w-6 text-primary" />
              Informes RIX
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Filtros bidireccionales · Datapack determinista · Narrativa V2
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setState(createInitialFilterState())}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Limpiar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          <aside className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto pr-1">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">
                Cargando catálogo de empresas…
              </div>
            ) : (
              <FilterPanel
                state={coherence.state}
                setState={setState}
                companies={companies}
                hiddenFilters={coherence.hiddenFilters}
                lastBatchDate={lastBatchDate ?? null}
              />
            )}
          </aside>

          <section className="flex flex-col gap-4">
            <LivePreview
              state={coherence.state}
              warnings={coherence.warnings}
              companies={companies}
            />

            <div className="flex items-center justify-end gap-2 sticky bottom-4">
              <Button
                size="lg"
                disabled={hasErrors}
                className="gap-2 shadow-lg"
                onClick={async () => {
                  if (!user?.id) {
                    toast({ title: "Sesión requerida", description: "Inicia sesión para guardar el informe.", variant: "destructive" });
                    return;
                  }
                  const question = compileFiltersToQuestion(
                    coherence.state,
                    companies,
                  );
                  // Each report gets its own chat session so we can switch
                  // between past reports in the viewer's memory.
                  const newSessionId = crypto.randomUUID();
                  const entry = await addReport(user.id, {
                    title: buildReportTitle(coherence.state, companies),
                    question,
                    sessionId: newSessionId,
                    filters: coherence.state,
                  });
                  if (!entry) {
                    toast({ title: "No se pudo guardar el informe", description: "Inténtalo de nuevo.", variant: "destructive" });
                    return;
                  }
                  navigate("/visor", {
                    state: {
                      autoSendQuestion: question,
                      reportId: entry.id,
                      sessionId: newSessionId,
                    },
                  });
                  // Reiniciar el panel para que la próxima visita a /informes
                  // arranque desde cero (sin Top N / orden residual).
                  setState(createInitialFilterState());
                }}
              >
                <Send className="h-4 w-4" />
                Generar informe
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}