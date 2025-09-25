import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { usePariRun } from "@/hooks/usePariRuns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/ui/metric-card";
import { StatsPanel } from "@/components/ui/stats-panel";
import { AIResponseDialog } from "@/components/ui/ai-response-dialog";
import { AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";

export function PariRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pariRun, isLoading, error } = usePariRun(id!);

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

  if (error || !pariRun) {
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
    { key: 'pari', label: 'Índice PARI', fullName: 'Public Attention Reputational Index', score: pariRun["09_pari_score"], peso: 100, categoria: pariRun["09_pari_score"] >= 70 ? 'Bueno' : pariRun["09_pari_score"] >= 40 ? 'Mejorable' : 'Insuficiente' },
    { key: 'lns', label: 'Calidad de la Narrativa', fullName: 'LLM Narrative Score', score: pariRun["23_lns_score"], peso: pariRun["24_lns_peso"], categoria: pariRun["25_lns_categoria"] },
    { key: 'es', label: 'Fortaleza de Evidencia', fullName: 'Evidence Strength', score: pariRun["26_es_score"], peso: pariRun["27_es_peso"], categoria: pariRun["28_es_categoria"] },
    { key: 'sam', label: 'Autoridad de Fuentes', fullName: 'Source Authority Mix', score: pariRun["29_sam_score"], peso: pariRun["30_sam_peso"], categoria: pariRun["31_sam_categoria"] },
    { key: 'rm', label: 'Actualidad y Empuje', fullName: 'Recency & Momentum', score: pariRun["32_rm_score"], peso: pariRun["33_rm_peso"], categoria: pariRun["34_rm_categoria"] },
    { key: 'clr', label: 'Controversia y Riesgo Legal', fullName: 'Controversy & Legal Risk', score: pariRun["35_clr_score"], peso: pariRun["36_clr_peso"], categoria: pariRun["37_clr_categoria"] },
    { key: 'gip', label: 'Independencia de Gobierno', fullName: 'Governance Independence Perception', score: pariRun["38_gip_score"], peso: pariRun["39_gip_peso"], categoria: pariRun["40_gip_categoria"] },
    { key: 'kgi', label: 'Integridad del Grafo', fullName: 'Knowledge Graph Integrity', score: pariRun["41_kgi_score"], peso: pariRun["42_kgi_peso"], categoria: pariRun["43_kgi_categoria"] },
    { key: 'mpi', label: 'Impacto de Mercado', fullName: 'Market/Performance Impact', score: pariRun["44_mpi_score"], peso: pariRun["45_mpi_peso"], categoria: pariRun["46_mpi_categoria"] },
  ];

  // Extract flags from JSONB
  const flags = Array.isArray(pariRun["17_flags"]) ? pariRun["17_flags"] : [];

  // Parse puntos_clave if it's an array
  const puntosClave = Array.isArray(pariRun["11_puntos_clave"]) ? pariRun["11_puntos_clave"] : [];

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

  return (
    <Layout title="Repindex.ai">
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
            {pariRun["02_model_name"] || "N/A"}
          </Badge>
        </div>

        {/* Company Info - Compact */}
        <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
          <div>
            <h1 className="text-2xl font-bold">
              {pariRun["03_target_name"]}
              {(pariRun.repindex_root_issuers?.ticker || pariRun["05_ticker"]) && (
                <span className="text-lg text-muted-foreground ml-2">
                  ({pariRun.repindex_root_issuers?.ticker || pariRun["05_ticker"]})
                </span>
              )}
            </h1>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {formatDateRange(pariRun["06_period_from"], pariRun["07_period_to"])}
              </p>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>IBEX Family: {pariRun.repindex_root_issuers?.ibex_family_code || "N/A"}</span>
                <span>Sector: {pariRun.repindex_root_issuers?.sector_category || "N/A"}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-primary">
              {pariRun["09_pari_score"] || 0}
            </div>
            <div className="text-sm text-muted-foreground">PARI Score</div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Left Column - Metrics */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Metrics Table - Compact */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Métricas Detalladas</CardTitle>
              </CardHeader>
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

                        return (
                          <tr key={metric.key} className={`border-b hover:bg-muted/50 ${bgClass}`}>
                            <td className="p-3">
                              <div>
                                <div className="font-medium">{metric.label}</div>
                                <div className="text-xs text-muted-foreground">{metric.fullName}</div>
                              </div>
                            </td>
                            <td className={`p-3 text-center font-bold ${colorClass}`}>
                              {metric.score || 0}
                            </td>
                            <td className="p-3 text-center text-muted-foreground">
                              {metric.peso}%
                            </td>
                            <td className="p-3 text-center">
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${colorClass} border-current`}
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
            </Card>

            {/* Summary and Key Points - Compact */}
            {pariRun["10_resumen"] && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Resumen Ejecutivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{pariRun["10_resumen"]}</p>
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
                <AIResponseDialog 
                  modelName={pariRun["02_model_name"]}
                  chatgptResponse={pariRun["20_res_gpt_bruto"]}
                  perplexityResponse={pariRun["21_res_perplex_bruto"]}
                  createdAt={pariRun.created_at}
                  periodFrom={pariRun["06_period_from"]}
                  periodTo={pariRun["07_period_to"]}
                />
                
                {pariRun["22_explicacion"] && (
                  <AIResponseDialog 
                    explanationResponse={pariRun["22_explicacion"]}
                    createdAt={pariRun.created_at}
                    periodFrom={pariRun["06_period_from"]}
                    periodTo={pariRun["07_period_to"]}
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
                    <div className="font-semibold">{pariRun["12_palabras"] || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Fechas</div>
                    <div className="font-semibold">{pariRun["13_num_fechas"] || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Citas</div>
                    <div className="font-semibold">{pariRun["14_num_citas"] || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Alineación</div>
                    <div className="font-semibold">{((pariRun["15_temporal_alignment"] || 0) * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm">Densidad de Citas</div>
                  <div className="font-semibold">{((pariRun["16_citation_density"] || 0) * 100).toFixed(2)}%</div>
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