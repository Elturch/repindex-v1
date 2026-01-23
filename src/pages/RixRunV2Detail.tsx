import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { 
  ArrowLeft, 
  Beaker, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ChevronDown,
  ChevronUp,
  Timer,
  Flag,
  CheckCircle,
  TrendingUp,
  DollarSign,
  BookOpen,
  Brain,
  Layers
} from "lucide-react";
import { useRixRunV2 } from "@/hooks/useRixRunsV2";
import { useMarketAveragesV2 } from "@/hooks/useMarketAveragesV2";
import { useSiblingRixRunsV2 } from "@/hooks/useSiblingRixRunsV2";
import { cn } from "@/lib/utils";
import AIResponseDialog from "@/components/ui/ai-response-dialog";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";
import { RadarChartComparison } from "@/components/ui/radar-chart";
import { GlossaryDialog } from "@/components/ui/glossary-dialog";
import { useState, useMemo } from "react";

// Model icons map
const MODEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "ChatGPT": ChatGPTIcon,
  "Gemini": GeminiIcon,
  "Perplexity": PerplexityIcon,
  "DeepSeek": DeepseekIcon,
  "Deepseek": DeepseekIcon,
  "Claude": () => <Brain className="h-4 w-4" />,
  "Grok": GrokIcon,
  "Qwen": QwenIcon,
};

// Get icon for a model
const getModelIcon = (modelName: string): React.ComponentType<{ className?: string }> => {
  for (const [key, Icon] of Object.entries(MODEL_ICONS)) {
    if (modelName.toLowerCase().includes(key.toLowerCase())) {
      return Icon;
    }
  }
  return () => <Brain className="h-4 w-4" />;
};

export default function RixRunV2Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: run, isLoading, error } = useRixRunV2(id);
  const { data: marketAverages } = useMarketAveragesV2(run?.period_from, run?.period_to);
  const [isMetricsCollapsed, setIsMetricsCollapsed] = useState(true);
  
  // Fetch all sibling runs for the same company/period
  const { data: siblingRuns } = useSiblingRixRunsV2(
    run?.ticker,
    run?.period_from,
    run?.period_to,
    run?.model_name
  );

  if (isLoading) {
    return (
      <Layout title="RepIndex V2 - Detalle">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !run) {
    return (
      <Layout title="RepIndex V2 - Detalle">
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>{error ? `Error: ${error.message}` : "Registro no encontrado"}</span>
            </div>
            <Button variant="outline" onClick={() => navigate("/dashboard-v2")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al Dashboard V2
            </Button>
          </div>
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

  const formatDateRange = (from?: string | null, to?: string | null) => {
    if (!from && !to) return "N/A";
    if (!to) return from ? new Date(from).toLocaleDateString() : "N/A";
    if (!from) return to ? new Date(to).toLocaleDateString() : "N/A";
    
    const fromDate = new Date(from).toLocaleDateString();
    const toDate = new Date(to).toLocaleDateString();
    return `${fromDate} - ${toDate}`;
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 70) return "text-good";
    if (score >= 40) return "text-needs-improvement";
    return "text-insufficient";
  };

  const getCategoryColor = (categoria?: string | null) => {
    switch (categoria?.toLowerCase()) {
      case "bueno":
        return { text: "text-good", bg: "bg-good/10", border: "border-good" };
      case "mejorable":
        return { text: "text-needs-improvement", bg: "bg-needs-improvement/10", border: "border-needs-improvement" };
      case "insuficiente":
        return { text: "text-insufficient", bg: "bg-insufficient/10", border: "border-insufficient" };
      default:
        return { text: "text-muted-foreground", bg: "bg-muted/10", border: "border-muted" };
    }
  };

  // Metrics configuration - descriptive names followed by acronyms for clarity
  const metrics = [
    { key: 'rix', label: 'Índice de Reputación (RIX)', fullName: 'Reputation Index', score: run.displayRixScore ?? run.rix_score, peso: 100, categoria: (run.displayRixScore ?? run.rix_score) ? ((run.displayRixScore ?? run.rix_score)! >= 70 ? 'Bueno' : (run.displayRixScore ?? run.rix_score)! >= 40 ? 'Mejorable' : 'Insuficiente') : null },
    { key: 'nvm', label: 'Calidad de la Narrativa (NVM)', fullName: 'Narrative Value Metric', score: run.nvm_score, peso: run.nvm_peso, categoria: run.nvm_categoria },
    { key: 'drm', label: 'Fortaleza de Evidencia (DRM)', fullName: 'Data Reliability Metric', score: run.drm_score, peso: run.drm_peso, categoria: run.drm_categoria },
    { key: 'sim', label: 'Autoridad de Fuentes (SIM)', fullName: 'Source Integrity Metric', score: run.sim_score, peso: run.sim_peso, categoria: run.sim_categoria },
    { key: 'rmm', label: 'Actualidad y Empuje (RMM)', fullName: 'Reputational Momentum Metric', score: run.rmm_score, peso: run.rmm_peso, categoria: run.rmm_categoria },
    { key: 'cem', label: 'Controversia y Riesgo (CEM)', fullName: 'Controversy Exposure Metric', score: run.cem_score, peso: run.cem_peso, categoria: run.cem_categoria },
    { key: 'gam', label: 'Independencia de Gobierno (GAM)', fullName: 'Governance Autonomy Metric', score: run.gam_score, peso: run.gam_peso, categoria: run.gam_categoria },
    { key: 'dcm', label: 'Integridad del Grafo (DCM)', fullName: 'Data Consistency Metric', score: run.dcm_score, peso: run.dcm_peso, categoria: run.dcm_categoria },
    { key: 'cxm', label: 'Ejecución Corporativa (CXM)', fullName: 'Corporate Execution Metric', score: run.cxm_score, peso: run.cxm_peso, categoria: run.cxm_categoria, excluded: run.cxm_excluded },
  ];

  // AI Responses configuration - 7 models
  const getAIResponses = () => {
    const responses: { model: string; content: string | null; icon: React.ComponentType<{ className?: string }> }[] = [
      { model: "Perplexity", content: run.res_perplex_bruto, icon: PerplexityIcon },
      { model: "Grok", content: run.respuesta_bruto_grok, icon: GrokIcon },
      { model: "Deepseek", content: run.res_deepseek_bruto, icon: DeepseekIcon },
      { model: "ChatGPT", content: run.res_gpt_bruto, icon: ChatGPTIcon },
      { model: "Gemini", content: run.res_gemini_bruto, icon: GeminiIcon },
      { model: "Qwen", content: run.respuesta_bruto_qwen, icon: QwenIcon },
    ];
    return responses.filter(r => r.content);
  };

  const aiResponses = getAIResponses();

  // Safe array parser helper
  const ensureStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter(v => typeof v === 'string');
    if (typeof value === 'string') return [value];
    return [];
  };

  // Parse puntos_clave
  const parsePuntosClave = () => ensureStringArray(run.puntos_clave);

  // Parse flags
  const parseFlags = () => ensureStringArray(run.flags);

  // Parse explicaciones_detalladas
  const parseExplicacionesDetalladas = () => ensureStringArray(run.explicaciones_detalladas);

  // Parse explicacion (can be array)
  const parseExplicacion = () => ensureStringArray(run.explicacion);

  // Prepare data for radar chart - always use current run data
  const radarData = {
    rix: run.displayRixScore ?? run.rix_score ?? 0,
    nvm: run.nvm_score || 0,
    drm: run.drm_score || 0,
    sim: run.sim_score || 0,
    rmm: run.rmm_score || 0,
    cem: run.cem_score || 0,
    gam: run.gam_score || 0,
    dcm: run.dcm_score || 0,
    cxm: run.cxm_score || 0,
  };

  const normalizeFlag = (flag: string) => {
    const flagMap: { [key: string]: string } = {
      "datos_antiguos": "Datos Antiguos",
      "dudas_no_aclaradas": "Dudas No Aclaradas", 
      "cutoff_disclaimer": "Limitación de Fecha de Corte",
      "low_quality_sources": "Fuentes de Baja Calidad",
      "incomplete_data": "Datos Incompletos",
      "temporal_mismatch": "Desajuste Temporal",
      "insufficient_evidence": "Evidencia Insuficiente",
      "conflicting_sources": "Fuentes Conflictivas",
      "language_barriers": "Barreras de Idioma",
      "regional_bias": "Sesgo Regional"
    };
    
    return flagMap[flag] || flag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const isListed = run.repindex_root_issuers?.cotiza_en_bolsa || run.precio_accion;

  // Prepare sibling options for the selector (including current run)
  const modelOptions = useMemo(() => {
    const options: { id: string; model_name: string; rix_score: number | null }[] = [];
    
    // Add current run first
    options.push({
      id: run.id,
      model_name: run.model_name || "Unknown",
      rix_score: run.displayRixScore ?? run.rix_score,
    });
    
    // Add siblings (excluding current)
    if (siblingRuns) {
      siblingRuns.forEach(sibling => {
        if (sibling.id !== run.id) {
          options.push({
            id: sibling.id,
            model_name: sibling.model_name,
            rix_score: sibling.rix_score,
          });
        }
      });
    }
    
    return options;
  }, [run, siblingRuns]);

  return (
    <Layout title="RepIndex V2 - Detalle">
      <div className="space-y-4">
        {/* Header - Compact */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/dashboard-v2")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <div className="flex items-center gap-2">
            <GlossaryDialog />
            <Badge variant="secondary" className="text-sm">
              {run.model_name || "N/A"}
            </Badge>
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
              <Beaker className="h-3 w-3 mr-1" />
              V2
            </Badge>
            <Badge variant={run.source_pipeline === "lovable_v2" ? "default" : "secondary"}>
              {run.source_pipeline}
            </Badge>
          </div>
        </div>

        {/* Company Info - Compact */}
        <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
          <div>
            <h1 className="text-2xl font-bold">
              {run.target_name}
              {run.ticker && (
                <span className="text-lg text-muted-foreground ml-2">
                  ({run.ticker})
                </span>
              )}
            </h1>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {formatDateRange(run.period_from, run.period_to)}
              </p>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>IBEX Family: {run.repindex_root_issuers?.ibex_family_code || "N/A"}</span>
                <span>Sector: {run.repindex_root_issuers?.sector_category || "N/A"}</span>
                {isListed && <Badge variant="outline" className="text-xs">Cotizada</Badge>}
              </div>
            </div>
          </div>
          <div className="text-right">
            {run.isDataInvalid ? (
              <div className="flex flex-col items-end">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <span className="text-sm text-destructive font-medium">Datos inválidos</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-end">
                  <div className={cn("text-4xl font-bold", getScoreColor(run.displayRixScore ?? run.rix_score))}>
                    {run.displayRixScore ?? run.rix_score ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">RIX Score</div>
                  {run.cxm_excluded && (
                    <div className="text-xs text-muted-foreground italic mt-1">
                      (CXM no aplicable)
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pipeline Metadata Card - V2 Specific */}
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
                      <CheckCircle2 className="h-3 w-3 text-good" />
                      {formatDate(run.search_completed_at)}
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3 text-needs-improvement" />
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
                      <CheckCircle2 className="h-3 w-3 text-good" />
                      {formatDate(run.analysis_completed_at)}
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3 text-needs-improvement" />
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Left Column - Radar Chart + Metrics + Content */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Model Selector Card - Navigate to see full analysis */}
            {modelOptions.length > 1 && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Comparar Modelos de IA ({modelOptions.length} disponibles)
                  </CardTitle>
                  <CardDescription>
                    Selecciona un modelo para ver su análisis completo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {modelOptions.map((option) => {
                      const Icon = getModelIcon(option.model_name);
                      const isSelected = option.id === id;
                      const scoreColor = getScoreColor(option.rix_score);
                      
                      return (
                        <Button
                          key={option.id}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            if (option.id !== id) {
                              navigate(`/rix-run-v2/${option.id}`, { replace: true });
                            }
                          }}
                          className={cn(
                            "flex items-center gap-2 transition-all",
                            isSelected && "ring-2 ring-primary ring-offset-2"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{option.model_name}</span>
                          <Badge 
                            variant="secondary" 
                            className={cn("ml-1 text-xs", isSelected ? "bg-background/20" : scoreColor)}
                          >
                            {option.rix_score ?? "—"}
                          </Badge>
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Radar Chart */}
            <RadarChartComparison
              companyData={radarData}
              marketAverages={marketAverages || {}}
              companyName={run.target_name || "Empresa"}
              modelName={run.model_name || ""}
            />
            
            {/* Collapsible Metrics Table */}
            <Collapsible open={!isMetricsCollapsed} onOpenChange={(open) => setIsMetricsCollapsed(!open)}>
              <Card>
                <CardHeader className="pb-3">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                      <CardTitle className="text-lg">Métricas Detalladas</CardTitle>
                      {isMetricsCollapsed ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronUp className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-medium">Métrica</th>
                            <th className="text-center p-3 font-medium w-20">Score</th>
                            <th className="text-center p-3 font-medium w-20">Peso</th>
                            <th className="text-center p-3 font-medium w-24">Categoría</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.map((metric) => {
                            const colors = getCategoryColor(metric.categoria);
                            const isExcluded = metric.key === 'cxm' && run.cxm_excluded;

                            return (
                              <tr key={metric.key} className={cn("border-b hover:bg-muted/50", colors.bg, isExcluded && "opacity-50")}>
                                <td className="p-3">
                                  <div>
                                    <div className="font-medium flex items-center gap-2">
                                      {metric.label}
                                      {isExcluded && <Badge variant="outline" className="text-xs">Excluido</Badge>}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{metric.fullName}</div>
                                  </div>
                                </td>
                                <td className={cn("p-3 text-center font-bold", colors.text)}>
                                  {metric.score ?? 0}
                                </td>
                                <td className="p-3 text-center text-muted-foreground">
                                  {metric.peso}%
                                </td>
                                <td className="p-3 text-center">
                                  <Badge 
                                    variant="outline" 
                                    className={cn("text-xs", colors.text, colors.border)}
                                  >
                                    {metric.categoria || "—"}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Summary and Key Points */}
            {run.resumen && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Resumen Ejecutivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[300px]">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{run.resumen}</p>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Key Points */}
            {parsePuntosClave().length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Puntos Clave
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {parsePuntosClave().map((punto, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">{punto}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Momentum Analysis - Only for listed companies */}
            {isListed && run.reputacion_vs_precio && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Análisis Reputación vs Precio
                  </CardTitle>
                  <CardDescription className="flex items-center gap-4">
                    {run.precio_accion && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Precio actual: {Number(run.precio_accion).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                      </span>
                    )}
                    {run.precio_minimo_52_semanas && (
                      <span className="text-muted-foreground">
                        Mín. 52 sem: {Number(run.precio_minimo_52_semanas).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[400px]">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans bg-transparent p-0 m-0">
                        {run.reputacion_vs_precio}
                      </pre>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - AI Responses & Stats */}
          <div className="space-y-4">
            
            {/* AI Responses - 7 Models */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Así contestó la IA ({aiResponses.length}/7)</CardTitle>
                <CardDescription>Respuestas brutas de los 7 modelos de IA</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {aiResponses.length > 0 ? (
                    aiResponses.map((response) => (
                      <AIResponseDialog
                        key={response.model}
                        title={`Respuesta ${response.model}`}
                        content={response.content || ""}
                        icon={response.icon}
                        periodFrom={run.period_from || undefined}
                        periodTo={run.period_to || undefined}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No hay respuestas de IA disponibles
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Methodological Explanation */}
            {parseExplicacion().length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Explicación Metodológica
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AIResponseDialog
                    title="Ver Explicación Completa"
                    content={parseExplicacion().join('\n\n')}
                    periodFrom={run.period_from || undefined}
                    periodTo={run.period_to || undefined}
                  />
                </CardContent>
              </Card>
            )}

            {/* Detailed Explanations by Metric */}
            {parseExplicacionesDetalladas().length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Análisis Detallado por Métrica</CardTitle>
                </CardHeader>
                <CardContent>
                  <AIResponseDialog
                    title="Ver Análisis Detallado"
                    content={parseExplicacionesDetalladas().join('\n\n')}
                    periodFrom={run.period_from || undefined}
                    periodTo={run.period_to || undefined}
                  />
                </CardContent>
              </Card>
            )}

            {/* Statistics Panel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Estadísticas de Análisis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Palabras</div>
                    <div className="font-semibold">{run.palabras || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Fechas</div>
                    <div className="font-semibold">{run.num_fechas || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Citas</div>
                    <div className="font-semibold">{run.num_citas || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Alineación</div>
                    <div className="font-semibold">{((run.temporal_alignment || 0) * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm">Densidad de Citas</div>
                  <div className="font-semibold">{((run.citation_density || 0) * 100).toFixed(2)}%</div>
                </div>
              </CardContent>
            </Card>

            {/* Quality Flags */}
            {parseFlags().length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    Flags de Calidad
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {parseFlags().map((flag, index) => (
                      <Badge key={index} variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        {normalizeFlag(flag)}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
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
                <div className="truncate">{run.id}</div>
              </div>
              <div>
                <div className="font-medium">Run ID</div>
                <div className="truncate">{run.run_id}</div>
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
