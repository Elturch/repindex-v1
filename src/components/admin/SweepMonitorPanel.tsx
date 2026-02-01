import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Loader2,
  BarChart3,
  Building2,
  Zap,
  RotateCcw,
  Layers,
  Square,
  Activity,
  Skull,
  Timer,
  FlaskConical,
  Wrench,
  Key,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Shield,
  Search
} from 'lucide-react';
import { SweepHealthDashboard } from './SweepHealthDashboard';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useUnifiedSweepMetrics, useRefreshSweepMetrics } from '@/hooks/useUnifiedSweepMetrics';

// ============ TIPOS PARA ESTADO DE ANÁLISIS V2 ============
interface AnalysisModelStatus {
  model: string;
  total: number;
  withScore: number;
  pending: number;
  pendingAnalyzable: number;  // NEW: have raw data, can be analyzed
  pendingNoData: number;      // NEW: no raw data yet
  percentage: number;
}

interface AnalysisStatus {
  totalRecords: number;
  withScore: number;
  pendingAnalysis: number;
  pendingAnalyzable: number;   // NEW: have raw data, can be analyzed
  pendingNoData: number;       // NEW: no raw data yet
  percentage: number;
  byModel: AnalysisModelStatus[];
  sweepWeek: string;
  // Nuevas métricas por empresa (corrige el cálculo de "Completados")
  uniqueCompaniesWithScore: number;   // Empresas con al menos 1 score
  uniqueCompaniesComplete: number;    // Empresas con 6/6 modelos
  totalUniqueCompanies: number;       // Total empresas únicas en la semana
}

// ============ TIPO PARA ESTADO DEL TRIGGER DE REPARACIÓN ============
interface RepairTrigger {
  id: string;
  status: string;
  action: string;
  created_at: string;
  processed_at: string | null;
  result: { processed?: number; success?: boolean; error?: string } | null;
}

interface SweepStatus {
  sweepId: string;
  initialized: boolean;
  totalCompanies: number;
  byStatus: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  byPhase: Record<number, number>;
  progress: number;
}

interface PhaseDetail {
  fase: number;
  total: number;
  completed: number;
  failed: number;
  pending: number;
}

interface CascadeState {
  isRunning: boolean;
  currentTicker: string | null;
  processedCount: number;
  remaining: number;
  startTime: number | null;
}

interface RecentActivity {
  ticker: string;
  issuer_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}

// ============ TIPOS PARA ERRORES DE API ============
interface APIErrorRecord {
  id: string;
  ticker: string;
  issuer_name: string;
  model_name: string;
  error_source: string;
  error_message: string;
  error_type: 'auth' | 'rate_limit' | 'timeout' | 'payload' | 'connection' | 'unknown';
  created_at: string;
}

interface APIErrorSummary {
  model: string;
  total_errors: number;
  total_records: number;
  error_rate: number;
  primary_error_type: string;
  last_error_at: string;
}

// ============ TIPOS PARA CALIDAD DE DATOS ============
interface QualityReport {
  latestSweep: string | null;
  weekStart: string | null;
  totalReports: number;
  byStatus: { missing: number; repaired: number; failed_repair: number };
  byModel: Record<string, { missing: number; repaired: number; failed: number }>;
}

// ============ CLASIFICADOR DE ERRORES ============
function classifyError(message: string): APIErrorRecord['error_type'] {
  if (!message) return 'unknown';
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('401') || lowerMsg.includes('unauthorized') || lowerMsg.includes('api key') || lowerMsg.includes('authentication')) {
    return 'auth';
  }
  if (lowerMsg.includes('429') || lowerMsg.includes('rate limit') || lowerMsg.includes('quota') || lowerMsg.includes('too many requests')) {
    return 'rate_limit';
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('aborted') || lowerMsg.includes('deadline')) {
    return 'timeout';
  }
  if (lowerMsg.includes('422') || lowerMsg.includes('400') || lowerMsg.includes('deserialize') || lowerMsg.includes('json') || lowerMsg.includes('parameters') || lowerMsg.includes('invalid')) {
    return 'payload';
  }
  if (lowerMsg.includes('connection') || lowerMsg.includes('network') || lowerMsg.includes('fetch') || lowerMsg.includes('econnrefused') || lowerMsg.includes('reading a body')) {
    return 'connection';
  }
  return 'unknown';
}

// ============ ICONOS DE TIPO DE ERROR ============
function getErrorTypeIcon(type: APIErrorRecord['error_type']) {
  switch (type) {
    case 'auth':
      return <><Key className="h-3 w-3 inline mr-1" /> Auth</>;
    case 'rate_limit':
      return <><Timer className="h-3 w-3 inline mr-1" /> Rate Limit</>;
    case 'timeout':
      return <><Clock className="h-3 w-3 inline mr-1" /> Timeout</>;
    case 'payload':
      return <><AlertCircle className="h-3 w-3 inline mr-1" /> Payload</>;
    case 'connection':
      return <><Zap className="h-3 w-3 inline mr-1" /> Conexión</>;
    default:
      return <><HelpCircle className="h-3 w-3 inline mr-1" /> Desconocido</>;
  }
}

function getErrorTypeBadgeVariant(type: APIErrorRecord['error_type']): 'destructive' | 'secondary' | 'outline' {
  switch (type) {
    case 'auth':
    case 'payload':
      return 'destructive';
    case 'rate_limit':
    case 'timeout':
      return 'secondary';
    default:
      return 'outline';
  }
}


const CASCADE_STORAGE_KEY = 'repindex_rix_v2_cascade_state';

function loadCascadeFromStorage(): Partial<CascadeState> | null {
  try {
    const raw = localStorage.getItem(CASCADE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CascadeState>;
    return parsed;
  } catch {
    return null;
  }
}

function saveCascadeToStorage(state: Partial<CascadeState>) {
  try {
    localStorage.setItem(CASCADE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function clearCascadeStorage() {
  try {
    localStorage.removeItem(CASCADE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// TOTAL_PHASES is now dynamic based on issuer count
const SUPABASE_URL = 'https://jzkjykmrwisijiqlwuua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU';

export function SweepMonitorPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SweepStatus | null>(null);
  const [phaseDetails, setPhaseDetails] = useState<PhaseDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resettingZombis, setResettingZombis] = useState(false);
  
  // ============ UNIFIED SWEEP METRICS (Source of Truth) ============
  const { data: unifiedMetrics, refetch: refetchUnifiedMetrics } = useUnifiedSweepMetrics();
  const refreshAllMetrics = useRefreshSweepMetrics();
  
  // Actividad reciente
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [processingCompanies, setProcessingCompanies] = useState<RecentActivity[]>([]);
  
  // ============ ESTADO DE ANÁLISIS V2 ============
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [repairingAnalysis, setRepairingAnalysis] = useState(false);
  
  // ============ ESTADO DEL TRIGGER DE REPARACIÓN ============
  const [repairTrigger, setRepairTrigger] = useState<RepairTrigger | null>(null);
  const [processingTrigger, setProcessingTrigger] = useState(false);
  const repairPollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // ============ ESTADO DE ERRORES DE API ============
  const [apiErrors, setApiErrors] = useState<APIErrorRecord[]>([]);
  const [errorSummary, setErrorSummary] = useState<APIErrorSummary[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  
  // ============ ESTADO DE CALIDAD DE DATOS ============
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [loadingQuality, setLoadingQuality] = useState(false);
  const [analyzingQuality, setAnalyzingQuality] = useState(false);
  const [repairingQuality, setRepairingQuality] = useState(false);
  
  // Estado para cascada 1-empresa-a-la-vez
  const [cascade, setCascade] = useState<CascadeState>({
    isRunning: false,
    currentTicker: null,
    processedCount: 0,
    remaining: 0,
    startTime: null,
  });
  const cascadeAbortRef = useRef(false);
  const cascadeRunIdRef = useRef(0);
  const resumeStateRef = useRef<Partial<CascadeState> | null>(null);

  // ============ FETCH ESTADO DE ANÁLISIS V2 ============
  const fetchAnalysisStatus = useCallback(async () => {
    setLoadingAnalysis(true);
    try {
      // Obtener la semana más reciente y contar por modelo
      // IMPORTANTE: Incluir 20_res_gpt_bruto para distinguir "analizables" vs "sin datos"
      const { data, error } = await supabase
        .from('rix_runs_v2')
        .select('02_model_name, 09_rix_score, 06_period_from, 20_res_gpt_bruto')
        .order('06_period_from', { ascending: false })
        .limit(2000); // Últimas ~2 semanas

      if (error) throw error;

      if (!data || data.length === 0) {
        setAnalysisStatus(null);
        return;
      }

      // Determinar la semana más reciente
      const latestWeek = data[0]['06_period_from'];
      const weekRecords = data.filter(r => r['06_period_from'] === latestWeek);

      // Agrupar por modelo con métricas adicionales
      // Normalizar alias: 'Gemini' y 'Google Gemini' se tratan como uno solo
      const normalizeModel = (name: string): string => {
        if (!name) return 'Unknown';
        if (name === 'Gemini' || name === 'Google Gemini') return 'Gemini';
        return name;
      };
      
      const modelMap = new Map<string, { 
        total: number; 
        withScore: number; 
        pendingAnalyzable: number; 
        pendingNoData: number; 
      }>();
      
      weekRecords.forEach(record => {
        const rawModel = record['02_model_name'] || 'Unknown';
        const model = normalizeModel(rawModel);
        const current = modelMap.get(model) || { total: 0, withScore: 0, pendingAnalyzable: 0, pendingNoData: 0 };
        current.total++;
        
        if (record['09_rix_score'] !== null) {
          current.withScore++;
        } else if (record['20_res_gpt_bruto'] !== null) {
          // Tiene respuesta pero no score → analizable
          current.pendingAnalyzable++;
        } else {
          // Sin respuesta ni score → no analizable aún
          current.pendingNoData++;
        }
        
        modelMap.set(model, current);
      });

      // Convertir a array ordenado (UI usa 'Gemini' pero internamente ambos alias están unificados)
      const byModel: AnalysisModelStatus[] = [];
      const modelOrder = ['ChatGPT', 'Deepseek', 'Gemini', 'Grok', 'Perplexity', 'Qwen'];
      
      modelOrder.forEach(modelName => {
        const stats = modelMap.get(modelName);
        if (stats) {
          byModel.push({
            model: modelName,
            total: stats.total,
            withScore: stats.withScore,
            pending: stats.total - stats.withScore,
            pendingAnalyzable: stats.pendingAnalyzable,
            pendingNoData: stats.pendingNoData,
            percentage: stats.total > 0 ? Math.round((stats.withScore / stats.total) * 100) : 0
          });
        }
      });

      // Añadir modelos no esperados
      modelMap.forEach((stats, model) => {
        if (!modelOrder.includes(model)) {
          byModel.push({
            model,
            total: stats.total,
            withScore: stats.withScore,
            pending: stats.total - stats.withScore,
            pendingAnalyzable: stats.pendingAnalyzable,
            pendingNoData: stats.pendingNoData,
            percentage: stats.total > 0 ? Math.round((stats.withScore / stats.total) * 100) : 0
          });
        }
      });

      // Totales por registro
      const totalRecords = weekRecords.length;
      const withScore = weekRecords.filter(r => r['09_rix_score'] !== null).length;
      const pendingAnalyzable = weekRecords.filter(r => r['09_rix_score'] === null && r['20_res_gpt_bruto'] !== null).length;
      const pendingNoData = weekRecords.filter(r => r['09_rix_score'] === null && r['20_res_gpt_bruto'] === null).length;

      // NUEVO: Cálculo por empresa (ticker) para métricas correctas de "Completados"
      // Necesitamos obtener también el ticker para agrupar
      const { data: weekRecordsWithTicker, error: tickerError } = await supabase
        .from('rix_runs_v2')
        .select('05_ticker, 09_rix_score')
        .eq('06_period_from', latestWeek);

      let uniqueCompaniesWithScore = 0;
      let uniqueCompaniesComplete = 0;
      let totalUniqueCompanies = 0;

      if (!tickerError && weekRecordsWithTicker) {
        // Agrupar por ticker
        const tickerMap = new Map<string, { modelsWithScore: number; totalModels: number }>();
        
        weekRecordsWithTicker.forEach(record => {
          const ticker = record['05_ticker'];
          if (!ticker) return;
          
          const current = tickerMap.get(ticker) || { modelsWithScore: 0, totalModels: 0 };
          current.totalModels++;
          if (record['09_rix_score'] !== null) {
            current.modelsWithScore++;
          }
          tickerMap.set(ticker, current);
        });

        // Calcular métricas por empresa
        totalUniqueCompanies = tickerMap.size;
        uniqueCompaniesWithScore = [...tickerMap.values()].filter(c => c.modelsWithScore > 0).length;
        uniqueCompaniesComplete = [...tickerMap.values()].filter(c => c.modelsWithScore === 6).length;
      }

      setAnalysisStatus({
        totalRecords,
        withScore,
        pendingAnalysis: totalRecords - withScore,
        pendingAnalyzable,
        pendingNoData,
        percentage: totalRecords > 0 ? Math.round((withScore / totalRecords) * 100) : 0,
        byModel,
        sweepWeek: latestWeek || 'N/A',
        uniqueCompaniesWithScore,
        uniqueCompaniesComplete,
        totalUniqueCompanies,
      });

    } catch (error) {
      console.error('Error fetching analysis status:', error);
    } finally {
      setLoadingAnalysis(false);
    }
  }, []);

  // ============ FETCH ÚLTIMO TRIGGER DE REPARACIÓN ============
  const fetchLatestRepairTrigger = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-cron-triggers', {
        body: { action: 'get_latest', params: { filter_action: 'repair_analysis' } },
      });

      if (error) throw error;
      
      if (data?.trigger) {
        setRepairTrigger(data.trigger as RepairTrigger);
      } else {
        setRepairTrigger(null);
      }
    } catch (error) {
      console.error('Error fetching latest repair trigger:', error);
    }
  }, []);

  // ============ FETCH ERRORES DE API ============
  const fetchAPIErrors = useCallback(async () => {
    setLoadingErrors(true);
    try {
      // Obtener registros con errores de las últimas semanas
      const { data, error } = await supabase
        .from('rix_runs_v2')
        .select('id, "02_model_name", "03_target_name", "05_ticker", model_errors, created_at')
        .not('model_errors', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Filtrar solo registros con errores reales (no objetos vacíos)
      const recordsWithErrors = data?.filter(record => {
        const errors = record.model_errors as Record<string, string> | null;
        return errors && Object.keys(errors).length > 0;
      }) || [];

      // Procesar y clasificar errores
      const processed: APIErrorRecord[] = recordsWithErrors.flatMap(record => {
        const errors = record.model_errors as Record<string, string>;
        return Object.entries(errors)
          .filter(([key, value]) => !key.endsWith('_timestamp') && typeof value === 'string')
          .map(([source, message]) => ({
            id: record.id,
            ticker: record['05_ticker'] || 'N/A',
            issuer_name: record['03_target_name'] || 'Desconocido',
            model_name: record['02_model_name'] || 'Unknown',
            error_source: source,
            error_message: message,
            error_type: classifyError(message),
            created_at: record.created_at,
          }));
      });

      setApiErrors(processed);
      
      // Calcular resumen por modelo
      const modelCounts = new Map<string, { errors: number; total: number; types: Map<string, number>; lastError: string }>();
      
      // Primero contar errores por modelo
      processed.forEach(err => {
        const current = modelCounts.get(err.model_name) || { 
          errors: 0, 
          total: 0, 
          types: new Map<string, number>(),
          lastError: err.created_at 
        };
        current.errors++;
        current.types.set(err.error_type, (current.types.get(err.error_type) || 0) + 1);
        if (new Date(err.created_at) > new Date(current.lastError)) {
          current.lastError = err.created_at;
        }
        modelCounts.set(err.model_name, current);
      });

      // Convertir a array de resumen
      const summary: APIErrorSummary[] = Array.from(modelCounts.entries()).map(([model, data]) => {
        // Encontrar el tipo de error más común
        let primaryType = 'unknown';
        let maxCount = 0;
        data.types.forEach((count, type) => {
          if (count > maxCount) {
            maxCount = count;
            primaryType = type;
          }
        });

        return {
          model,
          total_errors: data.errors,
          total_records: data.errors, // Simplificado
          error_rate: 0, // Se calcularía con total de registros
          primary_error_type: primaryType,
          last_error_at: data.lastError,
        };
      }).sort((a, b) => b.total_errors - a.total_errors);

      setErrorSummary(summary);

    } catch (error) {
      console.error('Error fetching API errors:', error);
    } finally {
      setLoadingErrors(false);
    }
  }, []);

  // ============ FETCH QUALITY REPORT ============
  const fetchQualityReport = useCallback(async () => {
    setLoadingQuality(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-quality-watchdog', {
        body: { action: 'report' },
      });

      if (error) throw error;
      
      if (data) {
        setQualityReport({
          latestSweep: data.latestSweep,
          weekStart: data.weekStart,
          totalReports: data.totalReports,
          byStatus: data.byStatus,
          byModel: data.byModel,
        });
      }
    } catch (error) {
      console.error('Error fetching quality report:', error);
    } finally {
      setLoadingQuality(false);
    }
  }, []);

  // ============ ANALYZE QUALITY ============
  const handleAnalyzeQuality = async () => {
    setAnalyzingQuality(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-quality-watchdog', {
        body: { action: 'analyze' },
      });

      if (error) throw error;

      toast({
        title: '🔍 Análisis completado',
        description: `${data.totalCompanies} empresas: ${data.completeCompanies} completas (6/6), ${data.partialCompanies} parciales, ${data.failedCompanies} fallidas. ${data.insertedReports} reportes creados.`,
      });

      // Refrescar el reporte
      await fetchQualityReport();

    } catch (error: any) {
      console.error('Error analyzing quality:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo analizar la calidad',
        variant: 'destructive',
      });
    } finally {
      setAnalyzingQuality(false);
    }
  };

  // ============ REPAIR QUALITY ============
  const handleRepairQuality = async () => {
    setRepairingQuality(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-quality-watchdog', {
        body: { action: 'repair', max_repairs: 5 },
      });

      if (error) throw error;

      toast({
        title: data.repaired > 0 ? '🔧 Reparación completada' : 'Sin cambios',
        description: `Procesados: ${data.processed}, Reparados: ${data.repaired}, Fallidos: ${data.failedRepairs}`,
      });

      // Refrescar el reporte
      await fetchQualityReport();

    } catch (error: any) {
      console.error('Error repairing quality:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo ejecutar la reparación',
        variant: 'destructive',
      });
    } finally {
      setRepairingQuality(false);
    }
  };

  // En lugar de llamar directamente a la Edge Function (bloqueada por extensiones),
  // insertamos un registro en cron_triggers que el orchestrator procesará server-to-server.
  const handleRepairAnalysis = async () => {
    setRepairingAnalysis(true);

    try {
      // Programar trigger via Edge Function (usa service role + allowlist de Preview)
      const { data, error } = await supabase.functions.invoke('admin-cron-triggers', {
        body: {
          action: 'repair_analysis',
          params: { batch_size: 3 },
        },
      });

      if (error) throw error;
      if (!data?.trigger?.id) {
        throw new Error('No se pudo crear el trigger (respuesta inválida)');
      }

      // Guardar el trigger recién creado y empezar polling
      setRepairTrigger(data.trigger as RepairTrigger);

      toast({
        title: '📅 Reparación programada',
        description: `Trigger ${data.trigger.id.substring(0, 8)}... creado. Pulsa "Procesar Ahora" o espera al cron automático.`,
      });

      // Empezar polling para actualizar estado del trigger
      startRepairPolling();

    } catch (error: any) {
      console.error('Error scheduling repair:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo programar la reparación',
        variant: 'destructive',
      });
    } finally {
      setRepairingAnalysis(false);
    }
  };

  // ============ PROCESAR TRIGGERS AHORA (sin esperar cron) ============
  const handleProcessTriggersNow = async () => {
    setProcessingTrigger(true);

    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { process_triggers_only: true },
      });

      if (error) throw error;

      toast({
        title: data.triggersProcessed > 0 ? '✅ Triggers procesados' : 'Sin triggers pendientes',
        description: data.message || `Procesados: ${data.triggersProcessed}`,
      });

      // Refrescar estado tras procesamiento
      await fetchLatestRepairTrigger();
      await fetchAnalysisStatus();

    } catch (error: any) {
      console.error('Error processing triggers:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo procesar',
        variant: 'destructive',
      });
    } finally {
      setProcessingTrigger(false);
    }
  };

  // ============ POLLING PARA ESTADO DEL TRIGGER ============
  const startRepairPolling = useCallback(() => {
    // Limpiar polling anterior
    if (repairPollingRef.current) {
      clearInterval(repairPollingRef.current);
    }

    let pollCount = 0;
    const maxPolls = 24; // 24 x 5s = 2 minutos máximo

    repairPollingRef.current = setInterval(async () => {
      pollCount++;
      
      await fetchLatestRepairTrigger();
      
      // Si el trigger ya no está pending/processing, parar polling
      const currentTrigger = repairTrigger;
      if (currentTrigger && (currentTrigger.status === 'completed' || currentTrigger.status === 'failed')) {
        if (repairPollingRef.current) {
          clearInterval(repairPollingRef.current);
          repairPollingRef.current = null;
        }
        // Refrescar análisis
        fetchAnalysisStatus();
        
        if (currentTrigger.status === 'completed') {
          toast({
            title: '✅ Reparación completada',
            description: 'El trigger de análisis se procesó exitosamente.',
          });
        }
      }
      
      // Parar si excedemos el límite
      if (pollCount >= maxPolls) {
        if (repairPollingRef.current) {
          clearInterval(repairPollingRef.current);
          repairPollingRef.current = null;
        }
      }
    }, 5000);
  }, [fetchLatestRepairTrigger, fetchAnalysisStatus, repairTrigger, toast]);

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => {
      if (repairPollingRef.current) {
        clearInterval(repairPollingRef.current);
      }
    };
  }, []);

  // Obtener actividad reciente (últimas 10 empresas procesadas + en proceso)
  const fetchRecentActivity = useCallback(async (sweepId: string) => {
    try {
      // Empresas en proceso
      const processingRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sweep_progress?sweep_id=eq.${sweepId}&status=eq.processing&select=ticker,issuer_name,status,started_at,completed_at&order=started_at.desc`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' } }
      );
      const processingData = await processingRes.json();
      setProcessingCompanies(Array.isArray(processingData) ? processingData : []);

      // Últimas 8 completadas
      const recentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sweep_progress?sweep_id=eq.${sweepId}&status=eq.completed&select=ticker,issuer_name,status,started_at,completed_at&order=completed_at.desc&limit=8`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' } }
      );
      const recentData = await recentRes.json();
      setRecentActivity(Array.isArray(recentData) ? recentData : []);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      // Obtener estado del orchestrator
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { get_status: true },
      });

      if (error) throw error;

      if (data.initialized) {
        setStatus(data);
        
        // Obtener detalles por fase
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/sweep_progress?sweep_id=eq.${data.sweepId}&select=fase,status`,
          { headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' } }
        );
        const progressData = await response.json() as Array<{ fase: number; status: string }>;

        if (progressData && Array.isArray(progressData)) {
          // Agrupar por fase
          const phaseMap = new Map<number, { total: number; completed: number; failed: number; pending: number }>();
          
          progressData.forEach((p: { fase: number; status: string }) => {
            const current = phaseMap.get(p.fase) || { total: 0, completed: 0, failed: 0, pending: 0 };
            current.total++;
            if (p.status === 'completed') current.completed++;
            else if (p.status === 'failed') current.failed++;
            else current.pending++;
            phaseMap.set(p.fase, current);
          });

          const details: PhaseDetail[] = [];
          phaseMap.forEach((value, fase) => {
            details.push({ fase, ...value });
          });
          details.sort((a, b) => a.fase - b.fase);
          setPhaseDetails(details);
        }

        // Obtener actividad reciente
        await fetchRecentActivity(data.sweepId);
      } else {
        setStatus({
          sweepId: data.sweepId,
          initialized: false,
          totalCompanies: 0,
          byStatus: { pending: 0, processing: 0, completed: 0, failed: 0 },
          byPhase: {},
          progress: 0,
        });
        setPhaseDetails([]);
        setRecentActivity([]);
        setProcessingCompanies([]);
      }
    } catch (error) {
      console.error('Error fetching sweep status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el estado del barrido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, fetchRecentActivity]);

  // Initial fetch only on mount
  useEffect(() => {
    fetchStatus();
    fetchAnalysisStatus();
    fetchAPIErrors();
    fetchLatestRepairTrigger();
    fetchQualityReport();
  }, []);

  // Auto-resume cascade if it was running (survive refresh/tab close)
  useEffect(() => {
    const stored = loadCascadeFromStorage();
    if (!stored?.isRunning) return;
    resumeStateRef.current = stored;

    // Kick off the loop after a short delay so status can load
    setTimeout(() => {
      handleLaunchCascade(true);
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Only poll during active cascade - NO AUTOMATIC POLLING otherwise
  useEffect(() => {
    if (!cascade.isRunning) return;
    
    const interval = setInterval(fetchStatus, 15000); // 15s during cascade
    return () => clearInterval(interval);
  }, [cascade.isRunning, fetchStatus]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatus();
    fetchAnalysisStatus();
    fetchAPIErrors();
    fetchLatestRepairTrigger();
    fetchQualityReport();
    // Also refresh unified metrics to keep all panels in sync
    refreshAllMetrics();
  };

  // Reset inmediato de empresas zombis
  const handleResetZombis = async () => {
    setResettingZombis(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { reset_stuck: true, reset_stuck_timeout: 0 },  // timeout 0 = reset inmediato
      });

      if (error) throw error;

      toast({
        title: data.resetCount > 0 ? '🔄 Zombis reseteados' : 'Sin zombis',
        description: data.message,
        variant: data.resetCount > 0 ? 'default' : 'default',
      });

      fetchStatus();
    } catch (error: any) {
      console.error('Error resetting stuck companies:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo resetear',
        variant: 'destructive',
      });
    } finally {
      setResettingZombis(false);
    }
  };

  // Lanza UNA fase específica
  const handleLaunchPhase = async (fase: number) => {
    setLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'manual', fase },
      });

      if (error) throw error;

      toast({
        title: `Fase ${fase} ${data.status === 'no_work' ? 'sin trabajo' : 'completada'}`,
        description: `Procesados: ${data.companiesProcessed || 0} | Completados: ${data.companiesCompleted || 0} | Fallidos: ${data.companiesFailed || 0}`,
      });

      setTimeout(fetchStatus, 2000);
    } catch (error: any) {
      console.error('Error launching phase:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo procesar la fase',
        variant: 'destructive',
      });
    } finally {
      setLaunching(false);
    }
  };

  // Procesar UNA empresa via single_company mode
  const processOneCompany = async (): Promise<{
    processed: boolean;
    ticker: string | null;
    success: boolean;
    next_pending: boolean;
    remaining: number;
    error?: string;
  }> => {
    const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { single_company: true },
    });
    
    if (error) throw error;
    return data;
  };

  // Lanza TODO el barrido empresa por empresa en cascada (evita timeouts)
  const handleLaunchCascade = async (isAutoResume: boolean = false) => {
    // Si ya está corriendo, pausar
    if (cascade.isRunning) {
      cascadeAbortRef.current = true;
      setCascade(prev => {
        const next = { ...prev, isRunning: false };
        saveCascadeToStorage(next);
        return next;
      });
      toast({
        title: 'Cascada pausada',
        description: `Procesadas ${cascade.processedCount} empresas. Quedan ${cascade.remaining}.`,
      });
      return;
    }

    const resume = isAutoResume ? resumeStateRef.current : null;
    // Consume resume state so a manual start doesn't accidentally reuse it
    resumeStateRef.current = null;

    const startTimeLocal = typeof resume?.startTime === 'number' ? resume.startTime : Date.now();

    // Iniciar cascada
    cascadeAbortRef.current = false;
    const runId = ++cascadeRunIdRef.current;

    const initialProcessed = typeof resume?.processedCount === 'number' ? resume.processedCount : 0;
    const initialRemaining = typeof resume?.remaining === 'number' ? resume.remaining : (status?.byStatus?.pending || 0);

    setCascade({
      isRunning: true,
      currentTicker: null,
      processedCount: initialProcessed,
      remaining: initialRemaining,
      startTime: startTimeLocal,
    });

    saveCascadeToStorage({
      isRunning: true,
      currentTicker: null,
      processedCount: initialProcessed,
      remaining: initialRemaining,
      startTime: startTimeLocal,
    });

    toast({
      title: isAutoResume ? 'Cascada reanudada' : 'Cascada iniciada',
      description: 'Procesando empresas una por una para evitar timeouts...',
    });

    let processed = initialProcessed;
    let remaining = initialRemaining;
    let consecutiveErrors = 0;
    let totalErrors = 0;

    try {
      // Bucle de cascada: procesar empresa por empresa
      while (remaining > 0 && !cascadeAbortRef.current) {
        // Stop if a new cascade run started (avoid parallel loops)
        if (cascadeRunIdRef.current !== runId) break;

        try {
          const result = await processOneCompany();
          
          if (!result.processed) {
            // No hay más empresas pendientes
            break;
          }

          processed++;
          remaining = result.remaining;
          consecutiveErrors = 0;

          setCascade(prev => ({
            ...prev,
            currentTicker: result.ticker,
            processedCount: processed,
            remaining: remaining,
          }));

          saveCascadeToStorage({
            isRunning: true,
            currentTicker: result.ticker,
            processedCount: processed,
            remaining,
            startTime: startTimeLocal,
          });

          // Actualizar status cada 5 empresas
          if (processed % 5 === 0) {
            fetchStatus();
          }

          // Pequeña pausa de 1s entre empresas para no saturar
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (err: any) {
          console.error('Error processing company:', err);
          consecutiveErrors++;
          totalErrors++;

          // Intentar resetear zombis en cada error (rápido y seguro)
          try {
            await supabase.functions.invoke('rix-batch-orchestrator', {
              body: { reset_stuck: true, reset_stuck_timeout: 0 },
            });
          } catch {
            // ignore
          }
          
          // NO pausar: backoff exponencial para que el barrido sea inagotable
          const base = 1500;
          const max = 60000;
          const backoff = Math.min(max, base * Math.pow(2, Math.min(consecutiveErrors, 6)));
          const jitter = Math.floor(Math.random() * 750);
          const waitMs = backoff + jitter;

          if (consecutiveErrors % 5 === 0) {
            toast({
              title: 'Reintentando automáticamente',
              description: `${consecutiveErrors} errores seguidos (total ${totalErrors}). Esperando ${Math.round(waitMs / 1000)}s...`,
              variant: 'destructive',
            });
          }

          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }

      // Finalizar cascada
      const wasAborted = cascadeAbortRef.current;
      setCascade(prev => ({ ...prev, isRunning: false, currentTicker: null }));
      saveCascadeToStorage({
        isRunning: false,
        currentTicker: null,
        processedCount: processed,
        remaining,
        startTime: startTimeLocal,
      });
      fetchStatus();

      if (!wasAborted && remaining === 0) {
        clearCascadeStorage();
        toast({
          title: '🎉 Barrido completado',
          description: `Se procesaron ${processed} empresas exitosamente.`,
        });
      } else if (wasAborted) {
        toast({
          title: 'Cascada pausada',
          description: `Procesadas ${processed} empresas. Quedan ${remaining}.`,
        });
      }

    } catch (error: any) {
      console.error('Error in cascade:', error);
      setCascade(prev => ({ ...prev, isRunning: false }));
      saveCascadeToStorage({
        isRunning: false,
        currentTicker: null,
        processedCount: processed,
        remaining,
        startTime: startTimeLocal,
      });
      toast({
        title: 'Error en cascada',
        description: error.message || 'Error inesperado',
        variant: 'destructive',
      });
    }
  };

  // Lanza la siguiente fase pendiente
  const handleLaunchNextPhase = async () => {
    setLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'manual' },
      });

      if (error) throw error;

      if (data.completed) {
        toast({
          title: 'Barrido completado',
          description: 'No hay más fases pendientes.',
        });
      } else {
        toast({
          title: `Fase ${data.fase} procesada`,
          description: `Completados: ${data.companiesCompleted || 0} | Fallidos: ${data.companiesFailed || 0}`,
        });
      }

      setTimeout(fetchStatus, 2000);
    } catch (error: any) {
      console.error('Error launching next phase:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo procesar la fase',
        variant: 'destructive',
      });
    } finally {
      setLaunching(false);
    }
  };

  const handleResetFailed = async () => {
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { reset_failed: true },
      });

      if (error) throw error;

      toast({
        title: 'Empresas reseteadas',
        description: `${data.resetCount} empresas fallidas marcadas como pendientes`,
      });

      fetchStatus();
    } catch (error: any) {
      console.error('Error resetting failed:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo resetear',
        variant: 'destructive',
      });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isProcessing = status?.byStatus?.processing && status.byStatus.processing > 0;
  const hasFailed = status?.byStatus?.failed && status.byStatus.failed > 0;

  return (
    <div className="space-y-4">
      {/* Health Dashboard - Always visible at top */}
      <SweepHealthDashboard />
      
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Monitor de Barrido V2 por Fases
              </CardTitle>
              <CardDescription>
                Barrido: {status?.sweepId || 'N/A'} | Sistema robusto con persistencia y recuperación
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
                Actualizar
              </Button>
              {hasFailed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFailed}
                  disabled={resetting}
                  className="text-needs-improvement"
                >
                  <RotateCcw className={cn("h-4 w-4 mr-2", resetting && "animate-spin")} />
                  Reintentar fallidos ({status?.byStatus.failed})
                </Button>
              )}
              <Button
                onClick={handleLaunchNextPhase}
                disabled={launching || cascade.isRunning}
                className="gap-2"
              >
                {launching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Siguiente Fase
              </Button>
              <Button
                onClick={() => handleLaunchCascade(false)}
                disabled={launching}
                variant={cascade.isRunning ? "destructive" : "default"}
                className="gap-2"
              >
                {cascade.isRunning ? (
                  <>
                    <Square className="h-4 w-4" />
                    Pausar ({cascade.processedCount} / {cascade.processedCount + cascade.remaining})
                  </>
                ) : (
                  <>
                    <Layers className="h-4 w-4" />
                    Lanzar Todo (1x1)
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Overall Progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progreso general</span>
              <div className="flex items-center gap-4">
                {isProcessing && (
                  <Badge variant="outline" className="bg-needs-improvement/10 text-needs-improvement border-needs-improvement/30">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {status?.byStatus?.processing} en proceso (auto-reset si atascadas)
                  </Badge>
                )}
                <span className="font-medium">{status?.progress || 0}%</span>
              </div>
            </div>
            <Progress value={status?.progress || 0} className="h-3" />
            
            {/* Stats row - CORREGIDO: "Completados" = búsqueda + análisis ambos OK */}
            {/* 
              - Total empresas: del sweep_progress
              - Completados: registros con 09_rix_score (análisis terminado) 
              - Procesando: sweep_progress.status = processing
              - Pendientes: búsqueda OK pero sin score (pendingAnalyzable) + sin datos (pendingNoData)
              - Fallidos: sweep_progress.status = failed
            */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-foreground">
                  {unifiedMetrics?.totalCompanies || status?.totalCompanies || 0}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Total empresas
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-good/10">
                {/* UNIFIED: Empresas con 6/6 modelos analizados */}
                <div className="text-2xl font-bold text-good">
                  {unifiedMetrics?.companiesComplete || analysisStatus?.uniqueCompaniesComplete || 0}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Completados (6/6)
                </div>
                <div className="text-[10px] text-muted-foreground/70">
                  de {unifiedMetrics?.totalCompanies || analysisStatus?.totalUniqueCompanies || 0} empresas
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <div className="text-2xl font-bold text-primary">
                  {unifiedMetrics?.searchProcessing || status?.byStatus?.processing || 0}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Loader2 className="h-3 w-3" />
                  Procesando
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-needs-improvement/10">
                {/* UNIFIED: Pendientes de análisis */}
                <div className="text-2xl font-bold text-needs-improvement">
                  {unifiedMetrics?.recordsPendingAnalysis || analysisStatus?.pendingAnalysis || 0}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pendientes análisis
                </div>
                {(unifiedMetrics?.recordsPendingAnalysis || 0) > 0 && (
                  <div className="text-[10px] text-muted-foreground/70">
                    (analizables)
                  </div>
                )}
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <div className="text-2xl font-bold text-destructive">
                  {unifiedMetrics?.searchFailed || status?.byStatus?.failed || 0}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Fallidos
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NUEVO: Panel de Actividad en Tiempo Real */}
      {status?.initialized && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary animate-pulse" />
                Actividad en Tiempo Real
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetZombis}
                  disabled={resettingZombis}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Skull className={cn("h-4 w-4 mr-2", resettingZombis && "animate-spin")} />
                  Resetear Zombis
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Empresas en proceso */}
            {processingCompanies.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">En proceso ahora:</div>
                <div className="space-y-1">
                  {processingCompanies.map((company) => {
                    const startedAt = company.started_at ? new Date(company.started_at) : null;
                    const elapsedMinutes = startedAt 
                      ? Math.floor((Date.now() - startedAt.getTime()) / 60000)
                      : 0;
                    const isZombie = elapsedMinutes >= 5;
                    
                    return (
                      <div 
                        key={company.ticker}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-lg",
                          isZombie ? "bg-destructive/10 border border-destructive/30" : "bg-primary/10"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="font-medium">{company.ticker}</span>
                          <span className="text-sm text-muted-foreground">{company.issuer_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Timer className="h-3 w-3" />
                          <span className={cn(
                            "text-sm font-mono",
                            isZombie ? "text-destructive font-bold" : "text-muted-foreground"
                          )}>
                            {elapsedMinutes} min
                          </span>
                          {isZombie && (
                            <Badge variant="destructive" className="text-xs">ZOMBI</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Últimas completadas */}
            {recentActivity.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Últimas procesadas:</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {recentActivity.slice(0, 8).map((company) => {
                    const completedAt = company.completed_at ? new Date(company.completed_at) : null;
                    const timeStr = completedAt 
                      ? completedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                      : '';
                    
                    return (
                      <div 
                        key={company.ticker}
                        className="flex items-center gap-2 p-2 rounded-lg bg-good/10 text-sm"
                      >
                        <CheckCircle2 className="h-3 w-3 text-good" />
                        <span className="font-medium">{company.ticker}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{timeStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sin actividad */}
            {processingCompanies.length === 0 && recentActivity.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin actividad reciente</p>
              </div>
            )}

            {/* Info de auto-reset */}
            <div className="pt-2 border-t text-xs text-muted-foreground flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                <span>Auto-reset: 5 min</span>
              </div>
              <div className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                <span>Auto-refresh: 10 seg</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-good" />
                <span>Sistema infalible activo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ NUEVO: PANEL DE ESTADO DE ANÁLISIS V2 ============ */}
      <Card className="border-primary/30 bg-gradient-to-br from-background to-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              Estado de Análisis V2
              {/* Use unified metrics for consistent sweep ID display */}
              <Badge variant="outline" className="ml-2 text-xs">
                Semana: {unifiedMetrics?.sweepId || analysisStatus?.sweepWeek || 'N/A'}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAnalysisStatus}
                disabled={loadingAnalysis}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", loadingAnalysis && "animate-spin")} />
                Actualizar
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleRepairAnalysis}
                disabled={repairingAnalysis || loadingAnalysis || (analysisStatus?.pendingAnalyzable === 0)}
                className="gap-2"
                title={analysisStatus?.pendingAnalyzable === 0 ? 'No hay registros analizables pendientes' : ''}
              >
                {repairingAnalysis ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4" />
                )}
                Programar Análisis ({analysisStatus?.pendingAnalyzable || 0})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleProcessTriggersNow}
                disabled={processingTrigger}
                className="gap-2"
              >
                {processingTrigger ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Procesar Ahora
              </Button>
            </div>
          </div>
          <CardDescription>
            Muestra el estado real de análisis (scores RIX generados) vs búsquedas completadas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Estado del trigger de reparación */}
          {repairTrigger && (
            <div className={cn(
              "p-3 rounded-lg border text-sm",
              repairTrigger.status === 'pending' && "bg-needs-improvement/10 border-needs-improvement/30",
              repairTrigger.status === 'processing' && "bg-primary/10 border-primary/30",
              repairTrigger.status === 'completed' && "bg-good/10 border-good/30",
              repairTrigger.status === 'failed' && "bg-destructive/10 border-destructive/30"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {repairTrigger.status === 'pending' && <Clock className="h-4 w-4 text-needs-improvement" />}
                  {repairTrigger.status === 'processing' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                  {repairTrigger.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-good" />}
                  {repairTrigger.status === 'failed' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  <span className="font-medium">Último trigger:</span>
                  <Badge variant={
                    repairTrigger.status === 'completed' ? 'default' :
                    repairTrigger.status === 'failed' ? 'destructive' :
                    repairTrigger.status === 'processing' ? 'secondary' : 'outline'
                  }>
                    {repairTrigger.status}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {repairTrigger.id.substring(0, 8)}...
                </span>
              </div>
              {repairTrigger.processed_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Procesado: {formatDistanceToNow(new Date(repairTrigger.processed_at), { addSuffix: true, locale: es })}
                </p>
              )}
              {repairTrigger.result?.error && (
                <p className="text-xs text-destructive mt-1">Error: {repairTrigger.result.error}</p>
              )}
            </div>
          )}

          {loadingAnalysis && !analysisStatus ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : analysisStatus ? (
            <>
              {/* Barra de progreso general */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Análisis completados</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">
                      {analysisStatus.withScore.toLocaleString()}/{analysisStatus.totalRecords.toLocaleString()}
                    </span>
                    <Badge 
                      variant={analysisStatus.percentage === 100 ? "default" : "secondary"}
                      className={cn(
                        analysisStatus.percentage === 100 && "bg-good text-white",
                        analysisStatus.percentage < 90 && "bg-needs-improvement text-white"
                      )}
                    >
                      {analysisStatus.percentage}%
                    </Badge>
                  </div>
                </div>
                <Progress 
                  value={analysisStatus.percentage} 
                  className={cn(
                    "h-3",
                    analysisStatus.percentage === 100 && "[&>div]:bg-good",
                    analysisStatus.percentage < 90 && "[&>div]:bg-needs-improvement"
                  )} 
                />
                
                {/* Métricas separadas: Analizables vs Sin datos */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className={cn(
                    "p-2 rounded-lg text-center",
                    analysisStatus.pendingAnalyzable > 0 ? "bg-primary/10" : "bg-muted/50"
                  )}>
                    <div className={cn(
                      "text-xl font-bold",
                      analysisStatus.pendingAnalyzable > 0 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {analysisStatus.pendingAnalyzable}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <Wrench className="h-3 w-3 inline mr-1" />
                      Analizables (tienen datos)
                    </div>
                  </div>
                  <div className={cn(
                    "p-2 rounded-lg text-center",
                    analysisStatus.pendingNoData > 0 ? "bg-needs-improvement/10" : "bg-muted/50"
                  )}>
                    <div className={cn(
                      "text-xl font-bold",
                      analysisStatus.pendingNoData > 0 ? "text-needs-improvement" : "text-muted-foreground"
                    )}>
                      {analysisStatus.pendingNoData}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Sin datos (esperando búsqueda)
                    </div>
                  </div>
                </div>
              </div>

              {/* Desglose por modelo */}
              <div className="space-y-3">
                <div className="text-sm font-medium text-muted-foreground">Por Modelo:</div>
                <div className="grid gap-2">
                  {analysisStatus.byModel.map((modelStatus) => {
                    const isComplete = modelStatus.pending === 0;
                    const isCritical = modelStatus.percentage < 70;
                    const isWarning = modelStatus.percentage < 90 && !isCritical;
                    
                    return (
                      <div 
                        key={modelStatus.model}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg",
                          isComplete && "bg-good/10",
                          isWarning && "bg-needs-improvement/10",
                          isCritical && "bg-destructive/10"
                        )}
                      >
                        <div className="w-24 font-medium text-sm">{modelStatus.model}</div>
                        <div className="flex-1">
                          <Progress 
                            value={modelStatus.percentage} 
                            className={cn(
                              "h-2",
                              isComplete && "[&>div]:bg-good",
                              isWarning && "[&>div]:bg-needs-improvement",
                              isCritical && "[&>div]:bg-destructive"
                            )} 
                          />
                        </div>
                        <div className="w-28 text-right text-sm font-mono">
                          <span className={cn(
                            isComplete && "text-good",
                            isWarning && "text-needs-improvement",
                            isCritical && "text-destructive"
                          )}>
                            {modelStatus.withScore}/{modelStatus.total}
                          </span>
                          <span className="text-muted-foreground ml-1">
                            ({modelStatus.percentage}%)
                          </span>
                        </div>
                        {modelStatus.pending > 0 && (
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-xs",
                              isCritical && "border-destructive text-destructive",
                              isWarning && "border-needs-improvement text-needs-improvement"
                            )}
                          >
                            {modelStatus.pending} pend.
                          </Badge>
                        )}
                        {isComplete && (
                          <CheckCircle2 className="h-4 w-4 text-good" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Info adicional */}
              <div className="pt-3 border-t text-xs text-muted-foreground flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <FlaskConical className="h-3 w-3" />
                  <span>Análisis: GPT-5</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>~60-90s por registro</span>
                </div>
                <div className="flex items-center gap-1">
                  <Wrench className="h-3 w-3" />
                  <span>Batch: 3 registros/invocación</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay datos de análisis disponibles</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ PANEL DE ERRORES DE API ============ */}
      <Card className="border-destructive/30 bg-gradient-to-br from-background to-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Errores de API - Modelos IA
              {errorSummary.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  {apiErrors.length} errores
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAPIErrors}
              disabled={loadingErrors}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loadingErrors && "animate-spin")} />
              Actualizar
            </Button>
          </div>
          <CardDescription>
            Errores de conexión a APIs de IA detectados en registros recientes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingErrors && apiErrors.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : apiErrors.length > 0 ? (
            <>
              {/* Resumen por modelo */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Resumen por Modelo:</div>
                <div className="grid gap-2">
                  {errorSummary.map((summary) => (
                    <div 
                      key={summary.model}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{summary.model}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={summary.total_errors > 5 ? 'destructive' : 'secondary'}>
                          {summary.total_errors} {summary.total_errors === 1 ? 'error' : 'errores'}
                        </Badge>
                        <Badge variant={getErrorTypeBadgeVariant(summary.primary_error_type as APIErrorRecord['error_type'])}>
                          {getErrorTypeIcon(summary.primary_error_type as APIErrorRecord['error_type'])}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabla de errores recientes */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Errores Recientes:</div>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-24">Modelo</TableHead>
                        <TableHead className="w-20">Ticker</TableHead>
                        <TableHead className="w-24">Tipo</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead className="w-16">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiErrors.slice(0, 10).map((error, idx) => (
                        <TableRow key={`${error.id}-${error.error_source}-${idx}`}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {error.model_name}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{error.ticker}</TableCell>
                          <TableCell>
                            <Badge variant={getErrorTypeBadgeVariant(error.error_type)} className="text-xs">
                              {getErrorTypeIcon(error.error_type)}
                            </Badge>
                          </TableCell>
                          <TableCell 
                            className="max-w-xs truncate text-xs text-muted-foreground" 
                            title={error.error_message}
                          >
                            {error.error_message.length > 80 
                              ? `${error.error_message.substring(0, 80)}...` 
                              : error.error_message}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(error.created_at), { 
                              addSuffix: true, 
                              locale: es 
                            })}
                          </TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-7 w-7 p-0"
                              onClick={() => window.open(`/rix/${error.id}`, '_blank')}
                              title="Ver registro"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {apiErrors.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Mostrando 10 de {apiErrors.length} errores
                  </p>
                )}
              </div>

              {/* Diagnóstico rápido */}
              {errorSummary.some(s => s.primary_error_type === 'payload') && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">Diagnóstico: Errores de Payload</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        Hay errores HTTP 422/400 que indican problemas con la estructura de las peticiones. 
                        Revisa el esquema de tools/parámetros enviados a las APIs.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50 text-good" />
              <p className="text-sm">Sin errores de API detectados</p>
              <p className="text-xs mt-1">Todas las conexiones a IAs funcionando correctamente</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ PANEL DE CALIDAD DE DATOS (AGENTE VIGILANTE) ============ */}
      <Card className="border-primary/40 bg-gradient-to-br from-background to-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Agente Vigilante de Calidad
              {qualityReport && qualityReport.totalReports > 0 && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {qualityReport.totalReports} problemas detectados
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchQualityReport}
                disabled={loadingQuality}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", loadingQuality && "animate-spin")} />
                Actualizar
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAnalyzeQuality}
                disabled={analyzingQuality}
                className="gap-2"
              >
                {analyzingQuality ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Analizar Calidad
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleRepairQuality}
                disabled={repairingQuality || !qualityReport || qualityReport.byStatus.missing === 0}
                className="gap-2"
              >
                {repairingQuality ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4" />
                )}
                Reparar Fallidos ({qualityReport?.byStatus.missing || 0})
              </Button>
            </div>
          </div>
          <CardDescription>
            Detecta y repara modelos que fallaron silenciosamente durante el barrido semanal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingQuality && !qualityReport ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : qualityReport && qualityReport.totalReports > 0 ? (
            <>
              {/* Resumen por estado */}
              <div className="grid grid-cols-3 gap-3">
                <div className={cn(
                  "p-3 rounded-lg text-center",
                  qualityReport.byStatus.missing > 0 ? "bg-needs-improvement/10" : "bg-muted/50"
                )}>
                  <div className={cn(
                    "text-2xl font-bold",
                    qualityReport.byStatus.missing > 0 ? "text-needs-improvement" : "text-muted-foreground"
                  )}>
                    {qualityReport.byStatus.missing}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Pendientes
                  </div>
                </div>
                <div className={cn(
                  "p-3 rounded-lg text-center",
                  qualityReport.byStatus.repaired > 0 ? "bg-good/10" : "bg-muted/50"
                )}>
                  <div className={cn(
                    "text-2xl font-bold",
                    qualityReport.byStatus.repaired > 0 ? "text-good" : "text-muted-foreground"
                  )}>
                    {qualityReport.byStatus.repaired}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 inline mr-1" />
                    Reparados
                  </div>
                </div>
                <div className={cn(
                  "p-3 rounded-lg text-center",
                  qualityReport.byStatus.failed_repair > 0 ? "bg-destructive/10" : "bg-muted/50"
                )}>
                  <div className={cn(
                    "text-2xl font-bold",
                    qualityReport.byStatus.failed_repair > 0 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {qualityReport.byStatus.failed_repair}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Irrecuperables
                  </div>
                </div>
              </div>

              {/* Desglose por modelo */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Por Modelo:</div>
                <div className="grid gap-2">
                  {Object.entries(qualityReport.byModel)
                    .filter(([_, stats]) => stats.missing > 0 || stats.repaired > 0 || stats.failed > 0)
                    .sort(([, a], [, b]) => (b.missing + b.failed) - (a.missing + a.failed))
                    .map(([model, stats]) => {
                      const total = stats.missing + stats.repaired + stats.failed;
                      const repairRate = total > 0 ? Math.round((stats.repaired / total) * 100) : 100;
                      
                      return (
                        <div 
                          key={model}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm w-24">{model}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {stats.missing > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {stats.missing} pend
                              </Badge>
                            )}
                            {stats.repaired > 0 && (
                              <Badge variant="default" className="text-xs bg-good">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {stats.repaired} rep
                              </Badge>
                            )}
                            {stats.failed > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {stats.failed} fail
                              </Badge>
                            )}
                            <span className={cn(
                              "text-xs font-medium ml-2",
                              repairRate === 100 && "text-good",
                              repairRate < 80 && "text-needs-improvement",
                              repairRate < 50 && "text-destructive"
                            )}>
                              {repairRate}% OK
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Info del sweep */}
              <div className="pt-3 border-t text-xs text-muted-foreground flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  <span>Sweep: {qualityReport.latestSweep?.split('T')[0] || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Semana: {qualityReport.weekStart || 'N/A'}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-50 text-good" />
              <p className="text-sm">Sin problemas de calidad detectados</p>
              <p className="text-xs mt-1">Ejecuta "Analizar Calidad" para verificar el barrido actual</p>
            </div>
          )}
        </CardContent>
      </Card>

      {status?.initialized && phaseDetails.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Progreso por Fase ({phaseDetails.length} fases activas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-17 gap-2">
            {phaseDetails.map((phase) => {
                const hasErrors = phase.failed > 0;
                const isComplete = phase.completed === phase.total && phase.total > 0;
                const isPending = phase.pending > 0;

                return (
                  <div
                    key={phase.fase}
                    className={cn(
                      "relative p-2 rounded-lg text-center text-xs transition-all",
                      isComplete && "bg-good/20 text-good",
                      hasErrors && !isComplete && "bg-destructive/20 text-destructive",
                      isPending && !hasErrors && !isComplete && "bg-muted text-muted-foreground",
                      !isPending && !hasErrors && !isComplete && "bg-primary/20 text-primary"
                    )}
                    title={`Fase ${phase.fase}: ${phase.completed}/${phase.total} completados${hasErrors ? `, ${phase.failed} fallidos` : ''}`}
                  >
                    <div className="font-semibold">{phase.fase}</div>
                    <div className="text-[10px] opacity-80">
                      {phase.completed}/{phase.total}
                    </div>
                    {hasErrors && (
                      <div className="absolute -top-1 -right-1">
                        <span className="flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[8px] text-white">
                          {phase.failed}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-good/20" />
                <span>Completo</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-primary/20" />
                <span>En progreso</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-muted" />
                <span>Pendiente</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-destructive/20" />
                <span>Con errores</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleLaunchPhase(1)}
              disabled={launching}
            >
              <Play className="h-4 w-4 mr-2" />
              Fase 1 (prueba)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLaunchNextPhase}
              disabled={launching}
            >
              <Play className="h-4 w-4 mr-2" />
              Siguiente fase pendiente
            </Button>
            <Button
              variant={cascade.isRunning ? "destructive" : "outline"}
              size="sm"
              onClick={() => handleLaunchCascade(false)}
              disabled={launching}
            >
              {cascade.isRunning ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Pausar cascada
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4 mr-2" />
                  Barrido completo (1x1)
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/dashboard-v2', '_blank')}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Ver Dashboard V2
            </Button>
          </div>
          
          {!status?.initialized && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              <p>
                <strong>Nota:</strong> El barrido para esta semana ({status?.sweepId}) aún no ha sido inicializado.
                Haz clic en "Iniciar Barrido" para comenzar a procesar las fases de empresas.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
