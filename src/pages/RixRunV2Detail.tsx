import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  ArrowLeft, 
  Beaker, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ChevronDown,
  Timer,
  FileText,
  Flag
} from "lucide-react";
import { useRixRunV2 } from "@/hooks/useRixRunsV2";
import { cn } from "@/lib/utils";
import AIResponseDialog from "@/components/ui/ai-response-dialog";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { ClaudeIcon } from "@/components/ui/claude-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";
import { RadarChartComparison } from "@/components/ui/radar-chart";
import { StatsPanel } from "@/components/ui/stats-panel";
import { useState } from "react";

export default function RixRunV2Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: run, isLoading, error } = useRixRunV2(id);
  const [metricsOpen, setMetricsOpen] = useState(true);

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-[400px]" />
            <Skeleton className="h-[400px]" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !run) {
    return (
      <Layout>
        <div className="container py-6">
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">
                {error ? `Error: ${error.message}` : "Registro no encontrado"}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => navigate("/dashboard-v2")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver al Dashboard V2
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("es-ES", { 
      day: "2-digit", 
      month: "short", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatDateShort = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 70) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getCategoryBadge = (category: string | null) => {
    if (!category) return null;
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      "Bueno": "default",
      "Mejorable": "secondary",
      "Insuficiente": "destructive",
    };
    return <Badge variant={variants[category] || "secondary"}>{category}</Badge>;
  };

  // Metrics configuration
  const metrics = [
    { key: "nvm", label: "Narrativa y Visibilidad Mediática", score: run.nvm_score, weight: run.nvm_peso, category: run.nvm_categoria },
    { key: "drm", label: "Diversidad y Reputación de Medios", score: run.drm_score, weight: run.drm_peso, category: run.drm_categoria },
    { key: "sim", label: "Sentimiento e Impacto del Mensaje", score: run.sim_score, weight: run.sim_peso, category: run.sim_categoria },
    { key: "rmm", label: "Relevancia y Mensajes del Mercado", score: run.rmm_score, weight: run.rmm_peso, category: run.rmm_categoria },
    { key: "cem", label: "Claridad y Efectividad del Mensaje", score: run.cem_score, weight: run.cem_peso, category: run.cem_categoria },
    { key: "gam", label: "Gobernanza y Alineación de Marca", score: run.gam_score, weight: run.gam_peso, category: run.gam_categoria },
    { key: "dcm", label: "Diferenciación y Comunicación de Mercado", score: run.dcm_score, weight: run.dcm_peso, category: run.dcm_categoria },
    { key: "cxm", label: "Experiencia del Cliente", score: run.cxm_score, weight: run.cxm_peso, category: run.cxm_categoria, excluded: run.cxm_excluded },
  ];

  // AI Responses configuration
  const getAIResponses = () => {
    const responses: { model: string; content: string | null; icon: React.ComponentType<{ className?: string }> }[] = [
      { model: "ChatGPT", content: run.res_gpt_bruto, icon: ChatGPTIcon },
      { model: "Gemini", content: run.res_gemini_bruto, icon: GeminiIcon },
      { model: "Perplexity", content: run.res_perplex_bruto, icon: PerplexityIcon },
      { model: "Deepseek", content: run.res_deepseek_bruto, icon: DeepseekIcon },
      { model: "Claude", content: run.respuesta_bruto_claude, icon: ClaudeIcon },
      { model: "Grok", content: run.respuesta_bruto_grok, icon: GrokIcon },
      { model: "Qwen", content: run.respuesta_bruto_qwen, icon: QwenIcon },
    ];
    return responses.filter(r => r.content);
  };

  const aiResponses = getAIResponses();

  // Parse puntos_clave
  const parsePuntosClave = () => {
    if (!run.puntos_clave) return [];
    if (Array.isArray(run.puntos_clave)) return run.puntos_clave;
    return [];
  };

  // Parse flags
  const parseFlags = () => {
    if (!run.flags) return [];
    if (Array.isArray(run.flags)) return run.flags;
    return [];
  };

  // Prepare data for radar chart
  const radarData = {
    rix: run.rix_score || 0,
    nvm: run.nvm_score || 0,
    drm: run.drm_score || 0,
    sim: run.sim_score || 0,
    rmm: run.rmm_score || 0,
    cem: run.cem_score || 0,
    gam: run.gam_score || 0,
    dcm: run.dcm_score || 0,
    cxm: run.cxm_score || 0,
  };

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard-v2")} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al Dashboard V2
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{run.target_name || "Sin nombre"}</h1>
              <Badge variant="outline">{run.ticker}</Badge>
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
                <Beaker className="h-3 w-3 mr-1" />
                V2
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {run.model_name} • {formatDateShort(run.period_from)} - {formatDateShort(run.period_to)}
            </p>
          </div>
          
          {/* RIX Score */}
          <Card className="min-w-[200px]">
            <CardContent className="pt-6 text-center">
              <div className={cn("text-5xl font-bold", getScoreColor(run.rix_score))}>
                {run.rix_score ?? "—"}
              </div>
              <div className="text-sm text-muted-foreground mt-1">RIX Score</div>
              {run.rix_score_adjusted && run.rix_score_adjusted !== run.rix_score && (
                <div className="text-xs text-muted-foreground mt-1">
                  Ajustado: {run.rix_score_adjusted}
                </div>
              )}
              {run.cxm_excluded && (
                <Badge variant="secondary" className="mt-2">CXM Excluido</Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Metadata Card */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Metadatos Pipeline V2
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Pipeline</div>
                <Badge variant={run.source_pipeline === "lovable_v2" ? "default" : "secondary"}>
                  {run.source_pipeline}
                </Badge>
              </div>
              <div>
                <div className="text-muted-foreground">Tiempo ejecución</div>
                <div className="font-medium">
                  {run.execution_time_ms ? `${(run.execution_time_ms / 1000).toFixed(1)}s` : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Búsqueda completada</div>
                <div className="font-medium flex items-center gap-1">
                  {run.search_completed_at ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      {formatDate(run.search_completed_at)}
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3 text-yellow-600" />
                      Pendiente
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Análisis completado</div>
                <div className="font-medium flex items-center gap-1">
                  {run.analysis_completed_at ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      {formatDate(run.analysis_completed_at)}
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3 text-yellow-600" />
                      Pendiente
                    </>
                  )}
                </div>
              </div>
            </div>
            {run.model_errors && Object.keys(run.model_errors).length > 0 && (
              <div className="mt-4 p-3 bg-destructive/10 rounded-lg">
                <div className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Errores de modelo
                </div>
                <pre className="text-xs mt-2 overflow-auto">
                  {JSON.stringify(run.model_errors, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Radar Chart */}
          <RadarChartComparison
            companyData={radarData}
            marketAverages={null}
            companyName={run.target_name || "Empresa"}
            modelName={run.model_name || ""}
          />

          {/* Executive Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Resumen Ejecutivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {run.resumen ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{run.resumen}</p>
                ) : (
                  <p className="text-muted-foreground italic">Sin resumen disponible</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Metrics */}
        <Collapsible open={metricsOpen} onOpenChange={setMetricsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle>Métricas Detalladas</CardTitle>
                  <ChevronDown className={cn("h-5 w-5 transition-transform", metricsOpen && "rotate-180")} />
                </div>
                <CardDescription>8 dimensiones del índice de reputación</CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Métrica</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead className="text-center">Peso</TableHead>
                      <TableHead className="text-center">Categoría</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.map((metric) => (
                      <TableRow key={metric.key} className={metric.excluded ? "opacity-50" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium uppercase text-xs text-muted-foreground">{metric.key}</span>
                            <span>{metric.label}</span>
                            {metric.excluded && <Badge variant="outline" className="text-xs">Excluido</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn("text-lg font-bold", getScoreColor(metric.score))}>
                            {metric.score ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {metric.weight ?? "—"}%
                        </TableCell>
                        <TableCell className="text-center">
                          {getCategoryBadge(metric.category)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Key Points */}
        {parsePuntosClave().length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Puntos Clave</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {parsePuntosClave().map((punto, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span className="text-sm">{punto}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* AI Responses */}
        {aiResponses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Análisis de 7 IAs</CardTitle>
              <CardDescription>
                {aiResponses.length} de 7 modelos con respuesta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {aiResponses.map((response) => (
                  <AIResponseDialog
                    key={response.model}
                    title={response.model}
                    content={response.content || ""}
                    icon={response.icon}
                    periodFrom={run.period_from || undefined}
                    periodTo={run.period_to || undefined}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats and Flags */}
        <div className="grid gap-6 lg:grid-cols-2">
          <StatsPanel
            palabras={run.palabras}
            numFechas={run.num_fechas}
            numCitas={run.num_citas}
            temporalAlignment={null}
            citationDensity={null}
            flags={parseFlags()}
          />
          
          {/* Quality Flags */}
          {parseFlags().length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-5 w-5" />
                  Flags de Calidad
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {parseFlags().map((flag, index) => (
                    <Badge key={index} variant="outline">
                      {flag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Debug Info */}
        <Card className="bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Debug Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-muted-foreground">
              <div>
                <div className="font-medium">ID</div>
                <div className="font-mono truncate">{run.id}</div>
              </div>
              <div>
                <div className="font-medium">Run ID</div>
                <div className="font-mono truncate">{run.run_id}</div>
              </div>
              <div>
                <div className="font-medium">Created</div>
                <div>{formatDate(run.created_at)}</div>
              </div>
              <div>
                <div className="font-medium">Updated</div>
                <div>{formatDate(run.updated_at)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
