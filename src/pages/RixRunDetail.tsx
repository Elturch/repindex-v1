import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useUnifiedRixRun } from "@/hooks/useUnifiedRixRuns";
import { useUnifiedMarketAverages } from "@/hooks/useUnifiedMarketAverages";
import { useUnifiedSiblingRuns } from "@/hooks/useUnifiedSiblingRuns";
import { useChatContext } from "@/contexts/ChatContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/ui/metric-card";
import { StatsPanel } from "@/components/ui/stats-panel";
import { RadarChartComparison } from "@/components/ui/radar-chart";
import { SiblingAICards } from "@/components/SiblingAICards";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import AIResponseDialog from "@/components/ui/ai-response-dialog";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";
import { WeeklyReadingError } from "@/components/ui/weekly-reading-error";
import { AlertCircle, CheckCircle, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

export function RixRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: rixRun, isLoading, error } = useUnifiedRixRun(id);
  const [isMetricsCollapsed, setIsMetricsCollapsed] = useState(true);
  
  // Fetch market averages for the same period
  const { data: marketAverages } = useUnifiedMarketAverages(
    rixRun?.period_from, 
    rixRun?.period_to
  );
  
  // Fetch sibling AI evaluations (other models for same company/week)
  const { data: siblingRuns, isLoading: siblingsLoading } = useUnifiedSiblingRuns(
    rixRun?.ticker,
    rixRun?.period_from,
    rixRun?.period_to,
    rixRun?.model_name
  );
  
  const { setPageContext } = useChatContext();

  // Update chat context with company details
  useEffect(() => {
    if (rixRun) {
      setPageContext({
        name: `Detalle: ${rixRun.target_name}`,
        path: `/rix-run/${id}`,
        dynamicData: {
          companyName: rixRun.target_name,
          ticker: rixRun.ticker,
          modelName: rixRun.model_name,
          rixScore: rixRun.displayRixScore ?? rixRun.rix_score,
          sector: rixRun.repindex_root_issuers?.sector_category,
          ibexFamily: rixRun.repindex_root_issuers?.ibex_family_code,
        }
      });
    }
  }, [rixRun, id, setPageContext]);

  const formatDateRange = (from?: string | null, to?: string | null) => {
    if (!from && !to) return "N/A";
    if (!to) return from ? new Date(from).toLocaleDateString() : "N/A";
    if (!from) return to ? new Date(to).toLocaleDateString() : "N/A";
    
    const fromDate = new Date(from).toLocaleDateString();
    const toDate = new Date(to).toLocaleDateString();
    return `${fromDate} - ${toDate}`;
  };

  if (isLoading) {
    return (
      <Layout title="RepIndex - Detalle">
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

  if (error || !rixRun) {
    return (
      <Layout title="RepIndex - Detalle">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Error loading company details</span>
          </div>
        </div>
      </Layout>
    );
  }

  const metrics = [
    { key: 'rix', label: 'Índice RIX', fullName: 'Reputation Index', score: rixRun.displayRixScore ?? rixRun.rix_score, peso: 100, categoria: (rixRun.displayRixScore ?? rixRun.rix_score ?? 0) >= 70 ? 'Bueno' : (rixRun.displayRixScore ?? rixRun.rix_score ?? 0) >= 40 ? 'Mejorable' : 'Insuficiente' },
    { key: 'nvm', label: 'Calidad de la Narrativa', fullName: 'Narrative Value Metric', score: rixRun.nvm_score, peso: rixRun.nvm_peso, categoria: rixRun.nvm_categoria },
    { key: 'drm', label: 'Fortaleza de Evidencia', fullName: 'Data Reliability Metric', score: rixRun.drm_score, peso: rixRun.drm_peso, categoria: rixRun.drm_categoria },
    { key: 'sim', label: 'Autoridad de Fuentes', fullName: 'Source Integrity Metric', score: rixRun.sim_score, peso: rixRun.sim_peso, categoria: rixRun.sim_categoria },
    { key: 'rmm', label: 'Actualidad y Empuje', fullName: 'Reputational Momentum Metric', score: rixRun.rmm_score, peso: rixRun.rmm_peso, categoria: rixRun.rmm_categoria },
    { key: 'cem', label: 'Controversia y Riesgo', fullName: 'Controversy Exposure Metric', score: rixRun.cem_score, peso: rixRun.cem_peso, categoria: rixRun.cem_categoria },
    { key: 'gam', label: 'Independencia de Gobierno', fullName: 'Governance Autonomy Metric', score: rixRun.gam_score, peso: rixRun.gam_peso, categoria: rixRun.gam_categoria },
    { key: 'dcm', label: 'Integridad del Grafo', fullName: 'Data Consistency Metric', score: rixRun.dcm_score, peso: rixRun.dcm_peso, categoria: rixRun.dcm_categoria },
    { key: 'cxm', label: 'Ejecución Corporativa', fullName: 'Corporate Execution Metric', score: rixRun.cxm_score, peso: rixRun.cxm_peso, categoria: rixRun.cxm_categoria },
  ];

  // Parse flags
  const flags = rixRun.flags || [];

  // Parse puntos_clave
  const puntosClave = rixRun.puntos_clave || [];

  // Function to normalize flag names
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

  // Check for duplicate content
  const isDuplicateContent = (...contents: (string | undefined | null)[]): boolean => {
    const validContents = contents.filter(Boolean).map(c => c!.trim().toLowerCase());
    if (validContents.length < 2) return false;
    
    for (let i = 0; i < validContents.length; i++) {
      for (let j = i + 1; j < validContents.length; j++) {
        const content1 = validContents[i];
        const content2 = validContents[j];
        
        if (content1 === content2) return true;
        
        const shorter = content1.length < content2.length ? content1 : content2;
        const longer = content1.length >= content2.length ? content1 : content2;
        
        if (shorter.length > 50 && longer.includes(shorter.substring(0, Math.min(100, shorter.length)))) {
          return true;
        }
      }
    }
    
    return false;
  };

  // Get all AI responses - now with 6 models
  const getAIResponses = () => {
    const responses = [];
    
    if (rixRun.res_gpt_bruto) {
      responses.push({
        model: "ChatGPT",
        content: rixRun.res_gpt_bruto,
        icon: ChatGPTIcon
      });
    }
    
    if (rixRun.res_gemini_bruto) {
      responses.push({
        model: "Google Gemini",
        content: rixRun.res_gemini_bruto,
        icon: GeminiIcon
      });
    }
    
    if (rixRun.res_perplex_bruto) {
      responses.push({
        model: "Perplexity",
        content: rixRun.res_perplex_bruto,
        icon: PerplexityIcon
      });
    }
    
    if (rixRun.res_deepseek_bruto) {
      responses.push({
        model: "Deepseek",
        content: rixRun.res_deepseek_bruto,
        icon: DeepseekIcon
      });
    }
    
    if (rixRun.respuesta_bruto_grok) {
      responses.push({
        model: "Grok",
        content: rixRun.respuesta_bruto_grok,
        icon: GrokIcon
      });
    }
    
    if (rixRun.respuesta_bruto_qwen) {
      responses.push({
        model: "Qwen",
        content: rixRun.respuesta_bruto_qwen,
        icon: QwenIcon
      });
    }
    
    return responses;
  };

  return (
    <Layout title="RepIndex.ai">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <Badge variant="secondary" className="text-sm">
            {rixRun.model_name || "N/A"}
          </Badge>
        </div>

        {/* Company Info */}
        <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
          <div>
            <h1 className="text-2xl font-bold">
              {rixRun.target_name}
              {(rixRun.repindex_root_issuers?.ticker || rixRun.ticker) && (
                <span className="text-lg text-muted-foreground ml-2">
                  ({rixRun.repindex_root_issuers?.ticker || rixRun.ticker})
                </span>
              )}
            </h1>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {formatDateRange(rixRun.period_from, rixRun.period_to)}
              </p>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>IBEX Family: {rixRun.repindex_root_issuers?.ibex_family_code || "N/A"}</span>
                <span>Sector: {rixRun.repindex_root_issuers?.sector_category || "N/A"}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            {rixRun.isDataInvalid ? (
              <WeeklyReadingError 
                reason="RMM = 0"
                variant="inline"
                className="flex-col items-end"
              />
            ) : (
              <div className="flex flex-col items-end">
                <div className="text-4xl font-bold text-primary">
                  {rixRun.displayRixScore ?? rixRun.rix_score ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">RIX Score</div>
                {rixRun.cxm_excluded && (
                  <div className="text-xs text-muted-foreground italic mt-1">
                    (CXM no aplicable)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Data Status Information */}
        {rixRun.isDataInvalid && (
          <WeeklyReadingError
            reason={rixRun.dataInvalidReason}
            companyName={rixRun.target_name || undefined}
            variant="card"
          />
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Left Column - Radar Chart + Metrics */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Radar Chart */}
            {rixRun && marketAverages && (
              <RadarChartComparison
                companyData={{
                  rix: rixRun.displayRixScore ?? rixRun.rix_score ?? 0,
                  nvm: rixRun.nvm_score || 0,
                  drm: rixRun.drm_score || 0,
                  sim: rixRun.sim_score || 0,
                  rmm: rixRun.rmm_score || 0,
                  cem: rixRun.cem_score || 0,
                  gam: rixRun.gam_score || 0,
                  dcm: rixRun.dcm_score || 0,
                  cxm: rixRun.cxm_score || 0,
                }}
                marketAverages={marketAverages}
                companyName={rixRun.target_name || "Empresa"}
                modelName={rixRun.model_name || ""}
              />
            )}
            
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
                            let colorClass = "";
                            let bgClass = "";
                            if (metric.categoria === "Bueno") {
                              colorClass = "text-good";
                              bgClass = "bg-good/10";
                            } else if (metric.categoria === "Mejorable") {
                              colorClass = "text-needs-improvement";
                              bgClass = "bg-needs-improvement/10";
                            } else if (metric.categoria === "Insuficiente") {
                              colorClass = "text-insufficient";
                              bgClass = "bg-insufficient/10";
                            }

                            const isDataInvalid = rixRun.isDataInvalid;
                            const rowOpacity = isDataInvalid ? 'opacity-50' : '';
                            const adjustedColorClass = isDataInvalid ? 'text-muted-foreground' : colorClass;
                            const adjustedBgClass = isDataInvalid ? 'bg-muted/10' : bgClass;

                            return (
                              <tr key={metric.key} className={`border-b hover:bg-muted/50 ${adjustedBgClass} ${rowOpacity}`}>
                                <td className="p-3">
                                  <div>
                                    <div className="font-medium">{metric.label}</div>
                                    <div className="text-xs text-muted-foreground">{metric.fullName}</div>
                                  </div>
                                </td>
                                <td className={`p-3 text-center font-bold ${adjustedColorClass}`}>
                                  {metric.score || 0}
                                </td>
                                <td className="p-3 text-center text-muted-foreground">
                                  {metric.peso}%
                                </td>
                                <td className="p-3 text-center">
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${isDataInvalid ? 'text-muted-foreground border-muted' : `${colorClass} border-current`}`}
                                  >
                                    {metric.categoria}
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
            {rixRun.resumen && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Resumen Ejecutivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{rixRun.resumen}</p>
                </CardContent>
              </Card>
            )}

            {puntosClave.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Puntos Clave
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {puntosClave.map((punto, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">{punto}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* AI Responses Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Análisis IA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const responses = getAIResponses();
                  const currentModel = rixRun.model_name;
                  
                  return responses.map((response, index) => {
                    const isDuplicate = responses
                      .slice(0, index)
                      .some(prevResp => isDuplicateContent(prevResp.content, response.content));
                    
                    if (isDuplicate) return null;
                    
                    const isPrimary = response.model === currentModel;
                    const title = isPrimary 
                      ? `Así contestó ${response.model}`
                      : `Respuesta ${response.model} (comparación)`;
                    
                    return (
                      <AIResponseDialog
                        key={response.model}
                        title={title}
                        content={response.content}
                        icon={response.icon}
                        createdAt={rixRun.created_at}
                        periodFrom={rixRun.period_from || undefined}
                        periodTo={rixRun.period_to || undefined}
                      />
                    );
                  });
                })()}
                
                {/* Methodological explanation */}
                {rixRun.explicacion && !isDuplicateContent(
                  rixRun.explicacion, 
                  rixRun.res_gpt_bruto, 
                  rixRun.res_gemini_bruto,
                  rixRun.res_perplex_bruto,
                  rixRun.res_deepseek_bruto
                ) && (
                  <AIResponseDialog
                    title="Ver Explicación Metodológica"
                    content={rixRun.explicacion}
                    createdAt={rixRun.created_at}
                    periodFrom={rixRun.period_from || undefined}
                    periodTo={rixRun.period_to || undefined}
                  />
                )}

                {/* Detailed explanations */}
                {rixRun.explicaciones_detalladas && 
                 Array.isArray(rixRun.explicaciones_detalladas) && 
                 rixRun.explicaciones_detalladas.length > 0 &&
                 !isDuplicateContent(
                   rixRun.explicaciones_detalladas.join('\n'), 
                   rixRun.explicacion, 
                   rixRun.res_gpt_bruto, 
                   rixRun.res_gemini_bruto,
                   rixRun.res_perplex_bruto,
                   rixRun.res_deepseek_bruto
                 ) && (
                  <AIResponseDialog
                    title="Ver Análisis Detallado por Métrica"
                    content={rixRun.explicaciones_detalladas.join('\n\n')}
                    createdAt={rixRun.created_at}
                    periodFrom={rixRun.period_from || undefined}
                    periodTo={rixRun.period_to || undefined}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Sibling AIs, Stats and Flags */}
          <div className="space-y-4">
            
            {/* Sibling AI Evaluations */}
            <div className="hidden lg:block">
              <SiblingAICards
                siblings={siblingRuns || []}
                companyName={rixRun.target_name || "Empresa"}
                isLoading={siblingsLoading}
              />
            </div>
            
            {/* Statistics Panel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Estadísticas de Análisis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Palabras</div>
                    <div className="font-semibold">{rixRun.palabras || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Fechas</div>
                    <div className="font-semibold">{rixRun.num_fechas || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Citas</div>
                    <div className="font-semibold">{rixRun.num_citas || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Alineación</div>
                    <div className="font-semibold">{((rixRun.temporal_alignment || 0) * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm">Densidad de Citas</div>
                  <div className="font-semibold">{((rixRun.citation_density || 0) * 100).toFixed(2)}%</div>
                </div>
              </CardContent>
            </Card>

            {/* Quality Flags */}
            {flags.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Flags de Calidad</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {flags.map((flag, index) => (
                      <Badge key={index} variant="outline" className="text-xs mr-2 mb-2">
                        {normalizeFlag(flag)}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </div>
    </Layout>
  );
}
