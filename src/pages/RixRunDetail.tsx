import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useRixRun } from "@/hooks/useRixRuns";
import { useMarketAverages } from "@/hooks/useMarketAverages";
import { useChatContext } from "@/contexts/ChatContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/ui/metric-card";
import { StatsPanel } from "@/components/ui/stats-panel";
import { RadarChartComparison } from "@/components/ui/radar-chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import AIResponseDialog from "@/components/ui/ai-response-dialog";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { WeeklyReadingError } from "@/components/ui/weekly-reading-error";
import { AlertCircle, CheckCircle, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

export function RixRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: rixRun, isLoading, error } = useRixRun(id!);
  const [isMetricsCollapsed, setIsMetricsCollapsed] = useState(true);
  
  // Fetch market averages for the same period
  const { data: marketAverages } = useMarketAverages(
    rixRun?.["06_period_from"], 
    rixRun?.["07_period_to"]
  );
  const { setPageContext } = useChatContext();

  // Update chat context with company details
  useEffect(() => {
    if (rixRun) {
      setPageContext({
        name: `Detalle: ${rixRun["03_target_name"]}`,
        path: `/rix-run/${id}`,
        dynamicData: {
          companyName: rixRun["03_target_name"],
          ticker: rixRun["05_ticker"],
          modelName: rixRun["02_model_name"],
          rixScore: rixRun.displayRixScore ?? rixRun["09_rix_score"],
          sector: rixRun.repindex_root_issuers?.sector_category,
          ibexFamily: rixRun.repindex_root_issuers?.ibex_family_code,
        }
      });
    }
  }, [rixRun, id, setPageContext]);

  const formatDateRange = (from?: string, to?: string) => {
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
    { key: 'rix', label: 'Índice RIX', fullName: 'Reputation Index', score: rixRun.displayRixScore ?? rixRun["09_rix_score"], peso: 100, categoria: (rixRun.displayRixScore ?? rixRun["09_rix_score"]) >= 70 ? 'Bueno' : (rixRun.displayRixScore ?? rixRun["09_rix_score"]) >= 40 ? 'Mejorable' : 'Insuficiente' },
    { key: 'nvm', label: 'Calidad de la Narrativa', fullName: 'Narrative Value Metric', score: rixRun["23_nvm_score"], peso: rixRun["24_nvm_peso"], categoria: rixRun["25_nvm_categoria"] },
    { key: 'drm', label: 'Fortaleza de Evidencia', fullName: 'Data Reliability Metric', score: rixRun["26_drm_score"], peso: rixRun["27_drm_peso"], categoria: rixRun["28_drm_categoria"] },
    { key: 'sim', label: 'Autoridad de Fuentes', fullName: 'Source Integrity Metric', score: rixRun["29_sim_score"], peso: rixRun["30_sim_peso"], categoria: rixRun["31_sim_categoria"] },
    { key: 'rmm', label: 'Actualidad y Empuje', fullName: 'Reputational Momentum Metric', score: rixRun["32_rmm_score"], peso: rixRun["33_rmm_peso"], categoria: rixRun["34_rmm_categoria"] },
    { key: 'cem', label: 'Controversia y Riesgo', fullName: 'Controversy Exposure Metric', score: rixRun["35_cem_score"], peso: rixRun["36_cem_peso"], categoria: rixRun["37_cem_categoria"] },
    { key: 'gam', label: 'Independencia de Gobierno', fullName: 'Governance Autonomy Metric', score: rixRun["38_gam_score"], peso: rixRun["39_gam_peso"], categoria: rixRun["40_gam_categoria"] },
    { key: 'dcm', label: 'Integridad del Grafo', fullName: 'Data Consistency Metric', score: rixRun["41_dcm_score"], peso: rixRun["42_dcm_peso"], categoria: rixRun["43_dcm_categoria"] },
    { key: 'cxm', label: 'Ejecución Corporativa', fullName: 'Corporate Execution Metric', score: rixRun["44_cxm_score"], peso: rixRun["45_cxm_peso"], categoria: rixRun["46_cxm_categoria"] },
  ];

  // Extract flags from JSONB - handle both strings and arrays
  const parseFlags = (flagsData: any): string[] => {
    if (!flagsData) return [];
    if (Array.isArray(flagsData)) return flagsData;
    if (typeof flagsData === 'string') return [flagsData];
    return [];
  };
  const flags = parseFlags(rixRun["17_flags"]);

  // Parse puntos_clave - handle both strings and arrays
  const parsePuntosClave = (puntosData: any): string[] => {
    if (!puntosData) return [];
    if (Array.isArray(puntosData)) return puntosData;
    if (typeof puntosData === 'string') return [puntosData];
    return [];
  };
  const puntosClave = parsePuntosClave(rixRun["11_puntos_clave"]);

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

  // Function to check if content is duplicate (similar or identical)
  const isDuplicateContent = (...contents: (string | undefined | null)[]): boolean => {
    const validContents = contents.filter(Boolean).map(c => c!.trim().toLowerCase());
    if (validContents.length < 2) return false;
    
    // Check if any two contents are very similar (same content with minor differences)
    for (let i = 0; i < validContents.length; i++) {
      for (let j = i + 1; j < validContents.length; j++) {
        const content1 = validContents[i];
        const content2 = validContents[j];
        
        // Direct match
        if (content1 === content2) return true;
        
        // Similar content (one is contained in the other with high similarity)
        const shorter = content1.length < content2.length ? content1 : content2;
        const longer = content1.length >= content2.length ? content1 : content2;
        
        if (shorter.length > 50 && longer.includes(shorter.substring(0, Math.min(100, shorter.length)))) {
          return true;
        }
      }
    }
    
    return false;
  };

  // Get all AI responses in the specified order: ChatGPT, Google Gemini, Perplexity, Deepseek
  const getAIResponses = () => {
    const responses = [];
    
    if (rixRun["20_res_gpt_bruto"]) {
      responses.push({
        model: "ChatGPT",
        content: rixRun["20_res_gpt_bruto"],
        icon: ChatGPTIcon
      });
    }
    
    if (rixRun["22_res_gemini_bruto"]) {
      responses.push({
        model: "Google Gemini",
        content: rixRun["22_res_gemini_bruto"],
        icon: GeminiIcon
      });
    }
    
    if (rixRun["21_res_perplex_bruto"]) {
      responses.push({
        model: "Perplexity",
        content: rixRun["21_res_perplex_bruto"],
        icon: PerplexityIcon
      });
    }
    
    if (rixRun["23_res_deepseek_bruto"]) {
      responses.push({
        model: "Deepseek",
        content: rixRun["23_res_deepseek_bruto"],
        icon: DeepseekIcon
      });
    }
    
    return responses;
  };

  return (
    <Layout title="RepIndex.ai">
      <div className="space-y-4">
        {/* Header - Compact */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <Badge variant="secondary" className="text-sm">
            {rixRun["02_model_name"] || "N/A"}
          </Badge>
        </div>

        {/* Company Info - Compact */}
        <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
          <div>
            <h1 className="text-2xl font-bold">
              {rixRun["03_target_name"]}
              {(rixRun.repindex_root_issuers?.ticker || rixRun["05_ticker"]) && (
                <span className="text-lg text-muted-foreground ml-2">
                  ({rixRun.repindex_root_issuers?.ticker || rixRun["05_ticker"]})
                </span>
              )}
            </h1>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {formatDateRange(rixRun["06_period_from"], rixRun["07_period_to"])}
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
              <>
                <div className="flex flex-col items-end">
                  <div className="text-4xl font-bold text-primary">
                    {rixRun.displayRixScore ?? rixRun["09_rix_score"] ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">RIX Score</div>
                  {rixRun["52_cxm_excluded"] && (
                    <div className="text-xs text-muted-foreground italic mt-1">
                      (CXM no aplicable)
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Data Status Information */}
        {rixRun.isDataInvalid && (
          <WeeklyReadingError
            reason={rixRun.dataInvalidReason}
            companyName={rixRun["03_target_name"]}
            variant="card"
          />
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Left Column - Radar Chart + Metrics */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Radar Chart - Main Visual Element */}
            {rixRun && marketAverages && (
              <RadarChartComparison
                companyData={{
                  rix: rixRun.displayRixScore ?? rixRun["09_rix_score"] ?? 0,
                  nvm: rixRun["23_nvm_score"] || 0,
                  drm: rixRun["26_drm_score"] || 0,
                  sim: rixRun["29_sim_score"] || 0,
                  rmm: rixRun["32_rmm_score"] || 0,
                  cem: rixRun["35_cem_score"] || 0,
                  gam: rixRun["38_gam_score"] || 0,
                  dcm: rixRun["41_dcm_score"] || 0,
                  cxm: rixRun["44_cxm_score"] || 0,
                }}
                marketAverages={marketAverages}
                companyName={rixRun["03_target_name"] || "Empresa"}
                modelName={rixRun["02_model_name"] || ""}
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

            {/* Summary and Key Points - Compact */}
            {rixRun["10_resumen"] && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Resumen Ejecutivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{rixRun["10_resumen"]}</p>
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
                {/* Show AI responses dynamically based on what's available */}
                {(() => {
                  const responses = getAIResponses();
                  const currentModel = rixRun["02_model_name"];
                  
                  return responses.map((response, index) => {
                    // Check if this is a duplicate of a previous response
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
                        periodFrom={rixRun["06_period_from"]}
                        periodTo={rixRun["07_period_to"]}
                      />
                    );
                  });
                })()}
                
                {/* Methodological explanation - only show if different from model responses */}
                {rixRun["22_explicacion"] && !isDuplicateContent(
                  rixRun["22_explicacion"], 
                  rixRun["20_res_gpt_bruto"], 
                  rixRun["22_res_gemini_bruto"],
                  rixRun["21_res_perplex_bruto"],
                  rixRun["23_res_deepseek_bruto"]
                ) && (
                  <AIResponseDialog
                    title="Ver Explicación Metodológica"
                    content={rixRun["22_explicacion"]}
                    createdAt={rixRun.created_at}
                    periodFrom={rixRun["06_period_from"]}
                    periodTo={rixRun["07_period_to"]}
                  />
                )}

                {/* Detailed explanations - BUG FIX: Changed from 23_ to 25_ */}
                {rixRun["25_explicaciones_detalladas"] && 
                 Array.isArray(rixRun["25_explicaciones_detalladas"]) && 
                 rixRun["25_explicaciones_detalladas"].length > 0 &&
                 !isDuplicateContent(
                   rixRun["25_explicaciones_detalladas"].join('\n'), 
                   rixRun["22_explicacion"], 
                   rixRun["20_res_gpt_bruto"], 
                   rixRun["22_res_gemini_bruto"],
                   rixRun["21_res_perplex_bruto"],
                   rixRun["23_res_deepseek_bruto"]
                 ) && (
                  <AIResponseDialog
                    title="Ver Análisis Detallado por Métrica"
                    content={rixRun["25_explicaciones_detalladas"].join('\n\n')}
                    createdAt={rixRun.created_at}
                    periodFrom={rixRun["06_period_from"]}
                    periodTo={rixRun["07_period_to"]}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Stats and Flags */}
          <div className="space-y-4">
            
            {/* Statistics Panel - Compact */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Estadísticas de Análisis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Palabras</div>
                    <div className="font-semibold">{rixRun["12_palabras"] || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Fechas</div>
                    <div className="font-semibold">{rixRun["13_num_fechas"] || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Citas</div>
                    <div className="font-semibold">{rixRun["14_num_citas"] || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Alineación</div>
                    <div className="font-semibold">{((rixRun["15_temporal_alignment"] || 0) * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm">Densidad de Citas</div>
                  <div className="font-semibold">{((rixRun["16_citation_density"] || 0) * 100).toFixed(2)}%</div>
                </div>
              </CardContent>
            </Card>

            {/* Quality Flags - Compact */}
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