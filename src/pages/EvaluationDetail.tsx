import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AIFilter } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCardFiltered } from "@/components/ui/metric-card-filtered";
import { StatsPanel } from "@/components/ui/stats-panel";
import { WinnerBadge } from "@/components/ui/winner-badge";
import { useEvaluation } from "@/hooks/useEvaluations";
import { 
  useEvaluationMetrics, 
  useExecutiveNotes, 
  useTacticalRecommendations, 
  useTopDrivers,
  useCounters 
} from "@/hooks/useEvaluationDetails";
import { ArrowLeft, Calendar, Building2, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function EvaluationDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [aiFilter, setAIFilter] = useState<AIFilter>("all");
  
  useEffect(() => {
    const filterParam = searchParams.get("filter") as AIFilter;
    if (filterParam && ["all", "chatgpt", "perplexity"].includes(filterParam)) {
      setAIFilter(filterParam);
    }
  }, [searchParams]);
  
  const { data: evaluation, isLoading: evaluationLoading } = useEvaluation(id!);
  const { data: metrics, isLoading: metricsLoading } = useEvaluationMetrics(id!);
  const { data: executiveNotes, isLoading: notesLoading } = useExecutiveNotes(id!);
  const { data: recommendations, isLoading: recommendationsLoading } = useTacticalRecommendations(id!);
  const { data: topDrivers, isLoading: driversLoading } = useTopDrivers(id!);
  const { data: counters, isLoading: countersLoading } = useCounters(id!);

  const isLoading = evaluationLoading || metricsLoading || notesLoading || recommendationsLoading || driversLoading || countersLoading;

  if (isLoading) {
    return (
      <Layout onAIFilterChange={setAIFilter} aiFilter={aiFilter}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Cargando evaluación...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!evaluation) {
    return (
      <Layout onAIFilterChange={setAIFilter} aiFilter={aiFilter}>
        <div className="text-center py-8">
          <p className="text-destructive">Evaluación no encontrada</p>
          <Button asChild className="mt-4">
            <Link to="/">Volver al Dashboard</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const formatDateRange = (from?: string, to?: string) => {
    if (!from || !to) return "—";
    try {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      return `${format(fromDate, "dd 'de' MMMM yyyy", { locale: es })} - ${format(toDate, "dd 'de' MMMM yyyy", { locale: es })}`;
    } catch {
      return "—";
    }
  };

  const counter = counters?.[0]; // Assuming one counter per evaluation

  return (
    <Layout onAIFilterChange={setAIFilter} aiFilter={aiFilter}>
      <div className="space-y-6">
        {/* Breadcrumb and Header */}
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="flex items-center">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Link>
          </Button>
          <span>/</span>
          <span>{evaluation.target_name}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center space-x-3">
              <Building2 className="h-8 w-8" />
              <span>{evaluation.target_name}</span>
              {evaluation.ticker && (
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {evaluation.ticker}
                </Badge>
              )}
            </h1>
            <div className="flex items-center space-x-4 mt-2 text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDateRange(evaluation.period_from, evaluation.period_to)}</span>
              </div>
              {evaluation.tz && (
                <Badge variant="secondary">{evaluation.tz}</Badge>
              )}
            </div>
          </div>

          <div className="text-right">
            {aiFilter === "all" && (
              <WinnerBadge 
                winner={evaluation.composite_winner as "ChatGPT" | "Perplexity" | "Tie" | null}
                className="text-lg px-4 py-2"
              />
            )}
            {aiFilter === "all" && evaluation.composite_delta_pct && (
              <div className="mt-2">
                <Badge variant={evaluation.composite_delta_pct > 0 ? "default" : "secondary"} className="text-sm">
                  Diferencia: {evaluation.composite_delta_pct > 0 ? "+" : ""}{evaluation.composite_delta_pct.toFixed(1)}%
                </Badge>
              </div>
            )}
            {aiFilter !== "all" && (
              <div className="text-center">
                <div className={`text-2xl font-bold ${aiFilter === "chatgpt" ? "text-chatgpt" : "text-perplexity"}`}>
                  {aiFilter === "chatgpt" ? evaluation.composite_chatgpt : evaluation.composite_perplexity}
                </div>
                <p className="text-sm text-muted-foreground capitalize">
                  Puntuación {aiFilter}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Metrics Grid */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Puntuaciones Principales</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics && metrics.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {metrics.map((metric) => (
                      <MetricCardFiltered
                        key={metric.id}
                        label={metric.label}
                        scoreChatGPT={metric.score_chatgpt}
                        scorePerplexity={metric.score_perplexity}
                        deltaPercent={metric.score_delta_pct}
                        deltaAbs={metric.score_delta_abs}
                        aiFilter={aiFilter}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay métricas disponibles
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Stats and Info */}
          <div className="space-y-4">
            <StatsPanel
              palabras={counter?.palabras}
              numFechas={counter?.num_fechas}
              numCitas={counter?.num_citas}
              temporalAlignment={counter?.temporal_alignment}
              citationDensity={counter?.citation_density}
              flags={counter?.flags}
            />

            {/* Period Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Información del Período</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Desde</span>
                  <span className="font-medium">
                    {evaluation.period_from ? format(new Date(evaluation.period_from), "dd/MM/yyyy", { locale: es }) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Hasta</span>
                  <span className="font-medium">
                    {evaluation.period_to ? format(new Date(evaluation.period_to), "dd/MM/yyyy", { locale: es }) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Zona horaria</span>
                  <Badge variant="outline">{evaluation.tz || "UTC"}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Tipo</span>
                  <Badge variant="secondary">{evaluation.target_type || "—"}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom Section - Executive Summary and Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Executive Notes */}
          {executiveNotes && executiveNotes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Resumen Ejecutivo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {executiveNotes.map((note, index) => (
                    <div key={note.id} className="flex space-x-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-relaxed">{note.note}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tactical Recommendations */}
          {recommendations && recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recomendaciones Tácticas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recommendations.map((rec, index) => (
                    <div key={rec.id} className="flex space-x-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-accent text-accent-foreground rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-relaxed">{rec.recommendation}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Top Drivers */}
        {topDrivers && topDrivers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Principales Diferencias (Top Drivers)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {topDrivers.map((driver) => (
                  <div key={driver.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-sm">{driver.label}</h4>
                      <Badge variant="outline" className="text-xs">
                        {driver.metric}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground capitalize">
                        {driver.direction}
                      </span>
                      <span className="font-bold text-sm">
                        {driver.delta_contrib_abs.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Similarity Note */}
        {evaluation.similarity_note && (
          <Card>
            <CardHeader>
              <CardTitle>Nota de Similitud</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {evaluation.similarity_note}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}