import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, BarChart3, CheckCircle2, XCircle, Clock, Zap, Search, BarChart2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useRixRunsV2, RixRunV2 } from "@/hooks/useRixRunsV2";
import { useCompanies } from "@/hooks/useCompanies";

// Model icons - only search-capable models
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { GrokIcon } from "@/components/ui/grok-icon";

// Search models - only these have real internet access
interface SearchModelInfo {
  name: string;
  displayName: string;
  icon: React.ReactNode;
  color: string;
  responseKey: keyof RixRunV2;
}

const SEARCH_MODELS: SearchModelInfo[] = [
  { name: 'perplexity-sonar-pro', displayName: 'Perplexity Sonar Pro', icon: <PerplexityIcon size={20} />, color: 'bg-cyan-500', responseKey: 'res_perplex_bruto' },
  { name: 'grok-3', displayName: 'Grok 3', icon: <GrokIcon size={20} />, color: 'bg-gray-800', responseKey: 'respuesta_bruto_grok' },
  { name: 'deepseek-chat', displayName: 'DeepSeek', icon: <DeepseekIcon size={20} />, color: 'bg-indigo-500', responseKey: 'res_deepseek_bruto' },
];

const SUBSCORE_LABELS: Record<string, { label: string; sigla: string }> = {
  nvm: { label: 'Calidad de la narrativa', sigla: 'NVM' },
  drm: { label: 'Fortaleza de evidencia', sigla: 'DRM' },
  sim: { label: 'Mezcla de autoridad', sigla: 'SIM' },
  rmm: { label: 'Actualidad y empuje', sigla: 'RMM' },
  cem: { label: 'Controversia (reverso)', sigla: 'CEM' },
  gam: { label: 'Independencia de gobierno', sigla: 'GAM' },
  dcm: { label: 'Integridad del grafo', sigla: 'DCM' },
  cxm: { label: 'Impacto de mercado', sigla: 'CXM' },
};

export default function DashboardSieteIAs() {
  const { toast } = useToast();
  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastSearchResult, setLastSearchResult] = useState<any>(null);
  const [lastAnalysisResult, setLastAnalysisResult] = useState<any>(null);

  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: v2Runs, isLoading: runsLoading, refetch: refetchRuns } = useRixRunsV2({ 
    sourcePipeline: 'lovable_v2',
    limit: 50 
  });
  const { data: makeRuns } = useRixRunsV2({ 
    sourcePipeline: 'make_original',
    ticker: selectedTicker || undefined,
    limit: 10 
  });

  const selectedCompany = companies?.find(c => c.ticker === selectedTicker);

  const handleSearch = async () => {
    if (!selectedTicker || !selectedCompany) {
      toast({ title: "Selecciona una empresa", variant: "destructive" });
      return;
    }

    setIsSearching(true);
    setLastSearchResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('rix-search-v2', {
        body: {
          ticker: selectedTicker,
          issuer_name: selectedCompany.issuer_name,
        },
      });

      if (error) throw error;

      setLastSearchResult(data);
      toast({ 
        title: "Búsqueda completada",
        description: `${data.models_succeeded}/3 modelos con Internet respondieron correctamente`,
      });
      
      refetchRuns();
    } catch (error: any) {
      console.error('Search error:', error);
      toast({ 
        title: "Error en búsqueda",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAnalyze = async (recordId: string) => {
    setIsAnalyzing(true);
    setLastAnalysisResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('rix-analyze-v2', {
        body: { record_id: recordId },
      });

      if (error) throw error;

      setLastAnalysisResult(data);
      toast({ 
        title: "Análisis completado",
        description: `RIX Score: ${data.rix_score}`,
      });
      
      refetchRuns();
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({ 
        title: "Error en análisis",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderSearchModelResponses = (run: RixRunV2) => (
    <Accordion type="multiple" className="w-full">
      {SEARCH_MODELS.map((model) => {
        const response = run[model.responseKey] as string | null;
        const hasResponse = !!response && response.length > 0;
        const errors = run.model_errors as Record<string, string> | null;
        const error = errors?.[model.name];
        
        return (
          <AccordionItem key={model.name} value={model.name}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                {model.icon}
                <span className="font-medium">{model.displayName}</span>
                <Badge variant="outline" className="ml-1 text-xs">
                  Internet ✓
                </Badge>
                {hasResponse ? (
                  <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {response.length} chars
                  </Badge>
                ) : error ? (
                  <Badge variant="outline" className="ml-2 bg-red-50 text-red-700 border-red-200">
                    <XCircle className="w-3 h-3 mr-1" />
                    Error
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 bg-gray-50 text-gray-500">
                    Sin respuesta
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {hasResponse ? (
                <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg max-h-96 overflow-auto">
                  {response}
                </pre>
              ) : error ? (
                <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">
                  <strong>Error:</strong> {error}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground p-4">No hay respuesta disponible</p>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );

  const renderSubscores = (run: RixRunV2) => {
    const subscores = [
      { key: 'nvm', score: run.nvm_score, categoria: run.nvm_categoria },
      { key: 'drm', score: run.drm_score, categoria: run.drm_categoria },
      { key: 'sim', score: run.sim_score, categoria: run.sim_categoria },
      { key: 'rmm', score: run.rmm_score, categoria: run.rmm_categoria },
      { key: 'cem', score: run.cem_score, categoria: run.cem_categoria },
      { key: 'gam', score: run.gam_score, categoria: run.gam_categoria },
      { key: 'dcm', score: run.dcm_score, categoria: run.dcm_categoria },
      { key: 'cxm', score: run.cxm_excluded ? null : run.cxm_score, categoria: run.cxm_categoria },
    ];

    const getCategoryColor = (categoria: string | null) => {
      if (!categoria) return 'bg-gray-100 text-gray-600';
      if (categoria === 'Bueno') return 'bg-green-100 text-green-700';
      if (categoria === 'Mejorable') return 'bg-yellow-100 text-yellow-700';
      if (categoria === 'Insuficiente') return 'bg-red-100 text-red-700';
      return 'bg-gray-100 text-gray-600';
    };

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {subscores.map(({ key, score, categoria }) => (
          <Card key={key} className="p-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide">
              <span className="font-bold">{SUBSCORE_LABELS[key].sigla}</span>
              <span>-</span>
              <span className="truncate">{SUBSCORE_LABELS[key].label}</span>
            </div>
            <div className="text-2xl font-bold mt-1">
              {score !== null ? score : 'N/A'}
            </div>
            {categoria && (
              <Badge variant="secondary" className={`mt-1 text-xs ${getCategoryColor(categoria)}`}>
                {categoria.replace(/_/g, ' ')}
              </Badge>
            )}
          </Card>
        ))}
      </div>
    );
  };

  const renderComparison = () => {
    if (!makeRuns?.length || !v2Runs?.length) return null;

    const latestV2 = v2Runs.find(r => r.ticker === selectedTicker);
    const latestMake = makeRuns[0];

    if (!latestV2 || !latestMake) return null;

    const delta = (latestV2.rix_score || 0) - (latestMake.rix_score || 0);
    const deltaClass = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-600';

    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Comparación Make vs Lovable V2
          </CardTitle>
          <CardDescription>
            Arquitectura de 2 fases: Búsqueda (3 modelos con Internet) → Análisis (GPT-4o)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-center">Make (Original)</TableHead>
                <TableHead className="text-center">Lovable V2</TableHead>
                <TableHead className="text-center">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/50">
                <TableCell className="font-bold">RIX Score Total</TableCell>
                <TableCell className="text-center font-bold">{latestMake.rix_score ?? '-'}</TableCell>
                <TableCell className="text-center font-bold">{latestV2.rix_score ?? '-'}</TableCell>
                <TableCell className={`text-center font-bold ${deltaClass}`}>
                  {delta > 0 ? '+' : ''}{delta}
                </TableCell>
              </TableRow>
              {Object.keys(SUBSCORE_LABELS).map(key => {
                const makeScore = latestMake[`${key}_score` as keyof RixRunV2] as number | null;
                const v2Score = latestV2[`${key}_score` as keyof RixRunV2] as number | null;
                const scoreDelta = (v2Score || 0) - (makeScore || 0);
                const scoreDeltaClass = scoreDelta > 0 ? 'text-green-600' : scoreDelta < 0 ? 'text-red-600' : 'text-gray-600';
                
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <span className="font-semibold">{SUBSCORE_LABELS[key].sigla}</span>
                      <span className="text-muted-foreground ml-1">({SUBSCORE_LABELS[key].label})</span>
                    </TableCell>
                    <TableCell className="text-center">{makeScore ?? '-'}</TableCell>
                    <TableCell className="text-center">{v2Score ?? '-'}</TableCell>
                    <TableCell className={`text-center ${scoreDeltaClass}`}>
                      {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout title="Dashboard RIX V2">
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard RIX V2</h1>
            <p className="text-muted-foreground">
              Pipeline de 2 fases: Búsqueda (Perplexity, Grok, DeepSeek) → Análisis (GPT-4o con ORG_RIXSchema_V2)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1">
              <Search className="w-3 h-3 mr-1" />
              3 modelos de búsqueda
            </Badge>
            <Badge variant="outline" className="px-3 py-1">
              <BarChart2 className="w-3 h-3 mr-1" />
              GPT-4o análisis
            </Badge>
          </div>
        </div>

        {/* Execution Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Panel de Ejecución
            </CardTitle>
            <CardDescription>
              <strong>Fase 1:</strong> Búsqueda con 3 modelos que tienen acceso a Internet (Perplexity Sonar Pro, Grok 3, DeepSeek).
              <br />
              <strong>Fase 2:</strong> Análisis con GPT-4o usando tool calling para generar el JSON del ORG_RIXSchema_V2.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <Select value={selectedTicker} onValueChange={setSelectedTicker}>
                <SelectTrigger className="w-full md:w-80">
                  <SelectValue placeholder="Seleccionar empresa..." />
                </SelectTrigger>
                <SelectContent>
                  {companiesLoading ? (
                    <SelectItem value="loading" disabled>Cargando...</SelectItem>
                  ) : (
                    companies?.map((company) => (
                      <SelectItem key={company.ticker} value={company.ticker}>
                        {company.issuer_name} ({company.ticker})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Button 
                onClick={handleSearch} 
                disabled={!selectedTicker || isSearching}
                className="gap-2"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando con 3 IAs...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Fase 1: Búsqueda
                  </>
                )}
              </Button>
            </div>

            {/* Last Search Result */}
            {lastSearchResult && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Resultado Fase 1: Búsqueda
                    </h4>
                    <Badge variant="outline">
                      <Clock className="w-3 h-3 mr-1" />
                      {lastSearchResult.total_time_ms}ms
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {lastSearchResult.models_succeeded}
                      </div>
                      <div className="text-xs text-muted-foreground">Éxitos</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {lastSearchResult.models_failed}
                      </div>
                      <div className="text-xs text-muted-foreground">Errores</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {lastSearchResult.models_called}
                      </div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                    <div>
                      <Button 
                        size="sm" 
                        onClick={() => handleAnalyze(lastSearchResult.id)}
                        disabled={isAnalyzing}
                        className="w-full gap-1"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <BarChart2 className="h-4 w-4" />
                            Fase 2: Análisis
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Model Results Summary */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(lastSearchResult.model_results || {}).map(([model, result]: [string, any]) => (
                      <Badge 
                        key={model} 
                        variant={result.success ? "default" : "destructive"}
                        className="gap-1"
                      >
                        {result.success ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {model}
                        {result.success && (
                          <span className="text-xs opacity-70">
                            ({result.response_length} chars)
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Last Analysis Result */}
            {lastAnalysisResult && (
              <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
                      <BarChart2 className="h-4 w-4" />
                      Resultado Fase 2: Análisis ORG_RIXSchema_V2
                    </h4>
                    <Badge className="bg-green-600">
                      RIX: {lastAnalysisResult.rix_score}
                    </Badge>
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                    {lastAnalysisResult.cxm_excluded && <p>• CXM excluido (no cotiza)</p>}
                    <p>• Tiempo de análisis: {lastAnalysisResult.analysis_time_ms}ms</p>
                    {lastAnalysisResult.flags?.length > 0 && (
                      <p>• Flags: {lastAnalysisResult.flags.join(', ')}</p>
                    )}
                  </div>
                  {lastAnalysisResult.counters && (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="text-center bg-white/50 rounded p-2">
                        <div className="font-bold">{lastAnalysisResult.counters.num_citas}</div>
                        <div className="text-xs text-muted-foreground">Citas</div>
                      </div>
                      <div className="text-center bg-white/50 rounded p-2">
                        <div className="font-bold">{lastAnalysisResult.counters.num_fechas}</div>
                        <div className="text-xs text-muted-foreground">Fechas</div>
                      </div>
                      <div className="text-center bg-white/50 rounded p-2">
                        <div className="font-bold">{Math.round((lastAnalysisResult.counters.temporal_alignment || 0) * 100)}%</div>
                        <div className="text-xs text-muted-foreground">Alineación</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Tabs for different views */}
        <Tabs defaultValue="results" className="space-y-4">
          <TabsList>
            <TabsTrigger value="results">Resultados V2</TabsTrigger>
            <TabsTrigger value="comparison">Comparación</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="space-y-4">
            {runsLoading ? (
              <Card className="p-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Cargando resultados...</p>
              </Card>
            ) : v2Runs?.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  No hay resultados V2 todavía. Ejecuta una búsqueda para comenzar.
                </p>
              </Card>
            ) : (
              v2Runs?.filter(run => !selectedTicker || run.ticker === selectedTicker).slice(0, 5).map((run) => (
                <Card key={run.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {run.target_name}
                          <Badge variant="outline">{run.ticker}</Badge>
                        </CardTitle>
                        <CardDescription>
                          {new Date(run.created_at).toLocaleString('es-ES')}
                          {run.execution_time_ms && ` • ${run.execution_time_ms}ms`}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        {run.rix_score !== null ? (
                          <div className="text-3xl font-bold">
                            {run.rix_score}
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            onClick={() => handleAnalyze(run.id)}
                            disabled={isAnalyzing}
                            className="gap-1"
                          >
                            {isAnalyzing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <BarChart2 className="h-4 w-4" />
                                Analizar
                              </>
                            )}
                          </Button>
                        )}
                        {run.rix_score !== null && (
                          <div className="text-xs text-muted-foreground">RIX Score</div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Summary */}
                    {run.resumen && (
                      <div>
                        <h4 className="font-semibold mb-2">Resumen Ejecutivo</h4>
                        <p className="text-sm text-muted-foreground">{run.resumen}</p>
                      </div>
                    )}

                    {/* Subscores */}
                    {run.rix_score !== null && (
                      <div>
                        <h4 className="font-semibold mb-3">Subscores ORG_RIXSchema_V2</h4>
                        {renderSubscores(run)}
                      </div>
                    )}

                    {/* Flags */}
                    {run.flags && run.flags.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Flags de Calidad</h4>
                        <div className="flex flex-wrap gap-2">
                          {run.flags.map((flag, i) => (
                            <Badge key={i} variant="secondary">
                              {flag.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Model Responses */}
                    <div>
                      <h4 className="font-semibold mb-3">Fase 1: Respuestas de Búsqueda (3 modelos con Internet)</h4>
                      {renderSearchModelResponses(run)}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="comparison">
            {selectedTicker ? (
              renderComparison()
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  Selecciona una empresa para ver la comparación Make vs V2
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Historial de Ejecuciones V2</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead className="text-center">RIX</TableHead>
                      <TableHead className="text-center">Tiempo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {v2Runs?.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-medium">{run.target_name}</TableCell>
                        <TableCell>{run.ticker}</TableCell>
                        <TableCell className="text-center font-bold">
                          {run.rix_score || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {run.execution_time_ms ? `${run.execution_time_ms}ms` : '-'}
                        </TableCell>
                        <TableCell>
                          {new Date(run.created_at).toLocaleDateString('es-ES')}
                        </TableCell>
                        <TableCell>
                          {run.analysis_completed_at ? (
                            <Badge variant="default" className="bg-green-600">
                              Completado
                            </Badge>
                          ) : run.search_completed_at ? (
                            <Badge variant="secondary">
                              Pendiente análisis
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              En progreso
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
