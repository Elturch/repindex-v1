import { useState, useEffect } from "react";
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

// Model icons - all 6 search-capable models
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";

// 7 Search models with real internet access
interface SearchModelInfo {
  name: string;
  displayName: string;
  icon: React.ReactNode;
  color: string;
  responseKey: keyof RixRunV2;
}

const SEARCH_MODELS: SearchModelInfo[] = [
  { name: 'perplexity-sonar-pro', displayName: 'Perplexity', icon: <PerplexityIcon size={20} />, color: 'bg-cyan-500', responseKey: 'res_perplex_bruto' },
  { name: 'grok-3', displayName: 'Grok', icon: <GrokIcon size={20} />, color: 'bg-gray-800', responseKey: 'respuesta_bruto_grok' },
  { name: 'deepseek-chat', displayName: 'Deepseek', icon: <DeepseekIcon size={20} />, color: 'bg-indigo-500', responseKey: 'res_deepseek_bruto' },
  { name: 'gpt-4.1-mini', displayName: 'ChatGPT', icon: <ChatGPTIcon size={20} />, color: 'bg-green-600', responseKey: 'res_gpt_bruto' },
  { name: 'gemini-2.0-flash', displayName: 'Google Gemini', icon: <GeminiIcon size={20} />, color: 'bg-blue-500', responseKey: 'res_gemini_bruto' },
  { name: 'qwen-max', displayName: 'Qwen', icon: <QwenIcon size={20} />, color: 'bg-purple-500', responseKey: 'respuesta_bruto_qwen' },
];

// Helper to get icon for a model name
const getModelIcon = (modelName: string) => {
  const model = SEARCH_MODELS.find(m => m.displayName === modelName);
  return model?.icon || null;
};

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
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; successes: number; failures: number }>({ current: 0, total: 0, successes: 0, failures: 0 });
  const [lastSearchResult, setLastSearchResult] = useState<any>(null);
  const [lastAnalysisResults, setLastAnalysisResults] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

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

  // Fetch pending records count on mount
  const fetchPendingCount = async () => {
    const { count } = await supabase
      .from('rix_runs_v2')
      .select('*', { count: 'exact', head: true })
      .not('search_completed_at', 'is', null)
      .is('analysis_completed_at', null);
    setPendingCount(count || 0);
  };

  // Batch analyze all pending records with throttling
  const handleMassAnalyze = async () => {
    setIsBatchAnalyzing(true);
    setAnalysisProgress({ current: 0, total: 0, successes: 0, failures: 0 });

    try {
      // Fetch all pending record IDs
      const { data: pendingRecords, error } = await supabase
        .from('rix_runs_v2')
        .select('id, "03_target_name", "02_model_name"')
        .not('search_completed_at', 'is', null)
        .is('analysis_completed_at', null)
        .order('batch_execution_date', { ascending: false });

      if (error) throw error;
      if (!pendingRecords?.length) {
        toast({ title: "No hay registros pendientes", description: "Todos los registros ya están analizados." });
        setIsBatchAnalyzing(false);
        return;
      }

      const total = pendingRecords.length;
      setAnalysisProgress({ current: 0, total, successes: 0, failures: 0 });

      let successes = 0;
      let failures = 0;
      const BATCH_SIZE = 5; // Process 5 at a time
      const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = pendingRecords.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const results = await Promise.allSettled(
          batch.map(record => 
            supabase.functions.invoke('rix-analyze-v2', {
              body: { record_id: record.id },
            })
          )
        );

        // Count successes and failures
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled' && !result.value.error) {
            successes++;
            console.log(`[Batch] Analyzed ${batch[idx]["03_target_name"]} - ${batch[idx]["02_model_name"]}: RIX=${result.value.data?.rix_score || 'N/A'}`);
          } else {
            failures++;
            console.error(`[Batch] Failed ${batch[idx]["03_target_name"]} - ${batch[idx]["02_model_name"]}:`, 
              result.status === 'rejected' ? result.reason : result.value.error);
          }
        });

        setAnalysisProgress({ current: Math.min(i + BATCH_SIZE, total), total, successes, failures });

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < total) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      toast({ 
        title: "Análisis masivo completado",
        description: `${successes} exitosos, ${failures} fallidos de ${total} registros`,
      });
      
      refetchRuns();
      fetchPendingCount();
    } catch (error: any) {
      console.error('Mass analysis error:', error);
      toast({ 
        title: "Error en análisis masivo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsBatchAnalyzing(false);
    }
  };

  // Fetch pending count on mount
  useEffect(() => {
    fetchPendingCount();
  }, []);

  const selectedCompany = companies?.find(c => c.ticker === selectedTicker);

  const handleSearch = async () => {
    if (!selectedTicker || !selectedCompany) {
      toast({ title: "Selecciona una empresa", variant: "destructive" });
      return;
    }

    setIsSearching(true);
    setLastSearchResult(null);
    setLastAnalysisResults([]);

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
        description: `${data.models_succeeded}/${data.models_called} modelos respondieron. ${data.records_created} rows creadas.`,
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

  // Analyze a single record
  const handleAnalyze = async (recordId: string) => {
    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke('rix-analyze-v2', {
        body: { record_id: recordId },
      });

      if (error) throw error;

      toast({ 
        title: "Análisis completado",
        description: `${data.model_name}: RIX Score ${data.rix_score}`,
      });
      
      refetchRuns();
      return data;
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({ 
        title: "Error en análisis",
        description: error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Batch analyze all records from Phase 1
  const handleBatchAnalyze = async () => {
    if (!lastSearchResult?.record_ids?.length) {
      toast({ title: "No hay registros para analizar", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: lastSearchResult.record_ids.length, successes: 0, failures: 0 });
    const results: any[] = [];

    try {
      for (let i = 0; i < lastSearchResult.record_ids.length; i++) {
        const recordId = lastSearchResult.record_ids[i];
        setAnalysisProgress(prev => ({ ...prev, current: i + 1 }));
        
        const { data, error } = await supabase.functions.invoke('rix-analyze-v2', {
          body: { record_id: recordId },
        });

        if (error) {
          console.error(`Analysis error for ${recordId}:`, error);
          results.push({ recordId, success: false, error: error.message });
          setAnalysisProgress(prev => ({ ...prev, failures: prev.failures + 1 }));
        } else {
          results.push({ recordId, success: true, ...data });
          setAnalysisProgress(prev => ({ ...prev, successes: prev.successes + 1 }));
        }
      }

      setLastAnalysisResults(results);
      const successCount = results.filter(r => r.success).length;
      
      toast({ 
        title: "Análisis batch completado",
        description: `${successCount}/${results.length} modelos analizados correctamente`,
      });
      
      refetchRuns();
    } catch (error: any) {
      console.error('Batch analysis error:', error);
      toast({ 
        title: "Error en análisis batch",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress({ current: 0, total: 0, successes: 0, failures: 0 });
    }
  };

  const renderSearchModelResponses = (run: RixRunV2) => {
    // In new architecture, each run has only ONE response column populated
    const modelName = run.model_name;
    const model = SEARCH_MODELS.find(m => m.displayName === modelName);
    
    if (!model) {
      // Fallback for old consolidated runs - show all columns
      return (
        <Accordion type="multiple" className="w-full">
          {SEARCH_MODELS.map((m) => {
            const response = run[m.responseKey] as string | null;
            const hasResponse = !!response && response.length > 0;
            
            return (
              <AccordionItem key={m.name} value={m.name}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    {m.icon}
                    <span className="font-medium">{m.displayName}</span>
                    {hasResponse ? (
                      <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {response.length} chars
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
                  ) : (
                    <p className="text-sm text-muted-foreground p-4">No hay respuesta disponible</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      );
    }

    // New architecture: single model per row
    const response = run[model.responseKey] as string | null;
    const hasResponse = !!response && response.length > 0;
    
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          {model.icon}
          <span className="font-medium">{model.displayName}</span>
          <Badge variant="outline" className="ml-1 text-xs">Internet ✓</Badge>
          {hasResponse ? (
            <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {response.length} chars
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto bg-gray-50 text-gray-500">
              Sin respuesta
            </Badge>
          )}
        </div>
        {hasResponse && (
          <pre className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg max-h-64 overflow-auto">
            {response}
          </pre>
        )}
      </div>
    );
  };

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

    // Get V2 runs for selected ticker
    const v2RunsForTicker = v2Runs.filter(r => r.ticker === selectedTicker);
    const latestMake = makeRuns[0];

    if (!v2RunsForTicker.length || !latestMake) return null;

    // Calculate average RIX score across all 7 models for V2
    const v2Scores = v2RunsForTicker
      .filter(r => r.rix_score !== null)
      .map(r => r.rix_score!);
    const avgV2Score = v2Scores.length > 0 
      ? Math.round(v2Scores.reduce((a, b) => a + b, 0) / v2Scores.length)
      : null;

    const delta = avgV2Score !== null ? avgV2Score - (latestMake.rix_score || 0) : 0;
    const deltaClass = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-600';

    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Comparación Make vs Lovable V2 (7 modelos)
          </CardTitle>
          <CardDescription>
            Arquitectura 1 row = 1 modelo. V2 muestra promedio de {v2Scores.length} modelos analizados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-center">RIX Score</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/50">
                <TableCell className="font-bold">Make (Original)</TableCell>
                <TableCell className="text-center font-bold">{latestMake.rix_score ?? '-'}</TableCell>
                <TableCell>
                  <Badge variant="outline">{latestMake.model_name}</Badge>
                </TableCell>
              </TableRow>
              {v2RunsForTicker.map(run => (
                <TableRow key={run.id}>
                  <TableCell className="flex items-center gap-2">
                    {getModelIcon(run.model_name || '')}
                    <span>{run.model_name}</span>
                  </TableCell>
                  <TableCell className="text-center font-bold">{run.rix_score ?? '-'}</TableCell>
                  <TableCell>
                    {run.analysis_completed_at ? (
                      <Badge variant="default" className="bg-green-600">Analizado</Badge>
                    ) : (
                      <Badge variant="secondary">Pendiente</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {avgV2Score !== null && (
                <TableRow className="bg-blue-50 dark:bg-blue-950/20">
                  <TableCell className="font-bold">Promedio V2</TableCell>
                  <TableCell className="text-center font-bold text-blue-600">{avgV2Score}</TableCell>
                  <TableCell>
                    <span className={`font-medium ${deltaClass}`}>
                      {delta > 0 ? '+' : ''}{delta} vs Make
                    </span>
                  </TableCell>
                </TableRow>
              )}
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
            <h1 className="text-3xl font-bold">Dashboard RIX V2 - 7 IAs</h1>
            <p className="text-muted-foreground">
              Arquitectura 1 row = 1 modelo. Fase 1: Búsqueda → 7 rows. Fase 2: Análisis individual por modelo.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="px-3 py-1">
              <Search className="w-3 h-3 mr-1" />
              7 modelos de búsqueda
            </Badge>
            <Badge variant="outline" className="px-3 py-1">
              <BarChart2 className="w-3 h-3 mr-1" />
              1 row por modelo
            </Badge>
          </div>
        </div>

        {/* Model Icons Grid */}
        <Card className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center justify-center gap-4">
              {SEARCH_MODELS.map((model) => (
                <div key={model.name} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-700 rounded-lg shadow-sm">
                  {model.icon}
                  <span className="text-sm font-medium">{model.displayName}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Execution Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Panel de Ejecución
            </CardTitle>
            <CardDescription>
              <strong>Fase 1:</strong> Búsqueda con 7 modelos → crea 7 rows independientes.
              <br />
              <strong>Fase 2:</strong> Análisis individual de cada row con GPT-4o.
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
                    Buscando con 7 IAs...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Fase 1: Búsqueda (7 rows)
                  </>
                )}
              </Button>

              {/* Mass Analyze Pending Records Button */}
              <Button 
                onClick={handleMassAnalyze} 
                disabled={isBatchAnalyzing || pendingCount === 0}
                variant="secondary"
                className="gap-2"
              >
                {isBatchAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analizando {analysisProgress.current}/{analysisProgress.total}
                    <span className="text-xs ml-1">
                      (✓{analysisProgress.successes} ✗{analysisProgress.failures})
                    </span>
                  </>
                ) : (
                  <>
                    <BarChart2 className="h-4 w-4" />
                    Analizar Pendientes ({pendingCount})
                  </>
                )}
              </Button>
            </div>

            {/* Progress bar for mass analysis */}
            {isBatchAnalyzing && analysisProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progreso análisis masivo</span>
                  <span className="font-medium">
                    {analysisProgress.current} / {analysisProgress.total} 
                    ({Math.round((analysisProgress.current / analysisProgress.total) * 100)}%)
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                  />
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    ✓ {analysisProgress.successes} exitosos
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    ✗ {analysisProgress.failures} fallidos
                  </span>
                </div>
              </div>
            )}

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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
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
                      <div className="text-2xl font-bold text-blue-600">
                        {lastSearchResult.records_created}
                      </div>
                      <div className="text-xs text-muted-foreground">Rows creadas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {lastSearchResult.models_called}
                      </div>
                      <div className="text-xs text-muted-foreground">Total modelos</div>
                    </div>
                    <div>
                      <Button 
                        size="sm" 
                        onClick={handleBatchAnalyze}
                        disabled={isAnalyzing || !lastSearchResult.record_ids?.length}
                        className="w-full gap-1"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {analysisProgress.current}/{analysisProgress.total}
                          </>
                        ) : (
                          <>
                            <BarChart2 className="h-4 w-4" />
                            Fase 2: Analizar ({lastSearchResult.record_ids?.length || 0})
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Model Results Summary */}
                  <div className="flex flex-wrap gap-2">
                    {lastSearchResult.inserted_records?.map((record: any) => (
                      <Badge 
                        key={record.model_name} 
                        variant={record.success ? "default" : "destructive"}
                        className="gap-1"
                      >
                        {getModelIcon(record.model_name)}
                        {record.success ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {record.model_name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Batch Analysis Results */}
            {lastAnalysisResults.length > 0 && (
              <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
                      <BarChart2 className="h-4 w-4" />
                      Resultado Fase 2: Análisis de {lastAnalysisResults.length} modelos
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {lastAnalysisResults.map((result, i) => (
                      <div key={i} className="bg-white/50 rounded p-3 flex items-center gap-2">
                        {getModelIcon(result.model_name)}
                        <div>
                          <div className="font-bold text-lg">{result.rix_score || '-'}</div>
                          <div className="text-xs text-muted-foreground">{result.model_name}</div>
                        </div>
                        {result.success ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 ml-auto" />
                        )}
                      </div>
                    ))}
                  </div>
                  {lastAnalysisResults.filter(r => r.success).length > 0 && (
                    <div className="mt-3 text-center">
                      <span className="text-sm text-muted-foreground">Promedio: </span>
                      <span className="font-bold text-lg">
                        {Math.round(
                          lastAnalysisResults
                            .filter(r => r.success && r.rix_score)
                            .reduce((a, b) => a + b.rix_score, 0) / 
                          lastAnalysisResults.filter(r => r.success && r.rix_score).length
                        )}
                      </span>
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
              v2Runs?.filter(run => !selectedTicker || run.ticker === selectedTicker).slice(0, 14).map((run) => (
                <Card key={run.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getModelIcon(run.model_name || '')}
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {run.target_name}
                            <Badge variant="outline">{run.ticker}</Badge>
                            <Badge variant="secondary">{run.model_name}</Badge>
                          </CardTitle>
                          <CardDescription>
                            {new Date(run.created_at).toLocaleString('es-ES')}
                            {run.execution_time_ms && ` • ${run.execution_time_ms}ms`}
                          </CardDescription>
                        </div>
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

                    {/* Model Response */}
                    <div>
                      <h4 className="font-semibold mb-3">Respuesta de Búsqueda</h4>
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
                <CardTitle>Historial de Ejecuciones V2 (1 row = 1 modelo)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Modelo</TableHead>
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
                        <TableCell className="flex items-center gap-2">
                          {getModelIcon(run.model_name || '')}
                          <span className="font-medium">{run.model_name}</span>
                        </TableCell>
                        <TableCell>{run.target_name}</TableCell>
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
