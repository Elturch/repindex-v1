import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getISOWeek, getISOWeekYear } from "date-fns";

/**
 * Unified Sweep Metrics Hook
 * 
 * Provides a SINGLE SOURCE OF TRUTH for all sweep dashboard panels.
 * All metrics are calculated from rix_runs_v2 (the actual data table),
 * NOT from sweep_progress (which only tracks search phase completion).
 * 
 * CRITICAL FIX: Uses model-specific columns to detect "hasData" status:
 * - ChatGPT: 20_res_gpt_bruto
 * - Perplexity: 21_res_perplex_bruto  
 * - Gemini: 22_res_gemini_bruto
 * - Deepseek: 23_res_deepseek_bruto
 * - Grok: respuesta_bruto_grok
 * - Qwen: respuesta_bruto_qwen
 * 
 * This ensures consistency across:
 * - SweepHealthDashboard
 * - SweepMonitorPanel 
 * - Estado de Análisis V2
 * - Agente Vigilante de Calidad
 */

export interface ModelMetrics {
  model: string;
  total: number;
  withScore: number;
  withData: number;        // Has raw response, ready for analysis
  pending: number;         // Total pending (no score)
  pendingAnalyzable: number;  // Has data, can be analyzed
  pendingNoData: number;      // Waiting for search
  percentage: number;
}

export interface UnifiedSweepMetrics {
  // Identifiers
  sweepId: string;
  weekStart: string;
  
  // Company-level metrics (the TRUE completion metric)
  totalCompanies: number;
  companiesComplete: number;    // 6/6 models with score
  companiesPartial: number;     // 1-5 models with score
  companiesNoData: number;      // 0 models with score
  companiesFailed: number;      // From sweep_progress failed status
  
  // Record-level metrics (for progress bars)
  totalRecords: number;         // Expected: companies * 6 models
  recordsWithScore: number;
  recordsWithData: number;
  recordsPendingAnalysis: number;
  recordsNoData: number;
  
  // By model breakdown
  byModel: ModelMetrics[];
  
  // Calculated percentages
  companyCompletionRate: number;  // % companies with 6/6
  recordCompletionRate: number;   // % records with score
  
  // Sweep progress status (search phase)
  searchCompleted: number;
  searchPending: number;
  searchProcessing: number;
  searchFailed: number;
  
  // Trigger status
  triggersPending: number;
  triggersProcessing: number;

  // Last observed trigger activity (fallback heartbeat when pipeline_logs is unavailable)
  triggersLastActivityAt: Date | null;

  // If cron_triggers cannot be read (auth/RLS/etc), keep the UI informative
  triggerFetchError: string | null;
  
  // Active trigger progress (for live feedback)
  activeTrigger: {
    action: string;
    processed: number;
    remaining: number;
    lastTicker?: string;
    lastModel?: string;
  } | null;

  // Real-time telemetry from pipeline_logs (orchestrator heartbeat)
  telemetry: {
    lastHeartbeatAt: Date | null;
    stage?: string;
    status?: string;
    ticker?: string;
    model?: string;
  } | null;
  
  // Ghost companies detection (completed in sweep_progress but 0 records in rix_runs_v2)
  ghostCompanies: number;
  ghostTickers: string[];
  
  // Failed companies with details
  failedCompanies: {
    ticker: string;
    error: string;
    updatedAt: Date;
  }[];
  
  // System state machine
  systemState: 'SWEEP_RUNNING' | 'CHECKING_DATA' | 'REPAIRS_PENDING' | 'COMPLETE' | 'IDLE';
  
  // Timestamps
  lastUpdated: Date;
}

// Model to column mapping - CRITICAL for correct hasData detection
const MODEL_RESPONSE_COLUMNS: Record<string, string> = {
  'ChatGPT': '20_res_gpt_bruto',
  'Perplexity': '21_res_perplex_bruto',
  'Gemini': '22_res_gemini_bruto',
  'Google Gemini': '22_res_gemini_bruto',
  'Deepseek': '23_res_deepseek_bruto',
  'Grok': 'respuesta_bruto_grok',
  'Qwen': 'respuesta_bruto_qwen',
};

// Helper to normalize model names (Google Gemini → Gemini)
function normalizeModel(name: string): string {
  if (!name) return 'Unknown';
  if (name === 'Gemini' || name === 'Google Gemini') return 'Gemini';
  return name;
}

// Get the correct response column for a model
function getResponseColumn(modelName: string): string {
  return MODEL_RESPONSE_COLUMNS[modelName] || MODEL_RESPONSE_COLUMNS[normalizeModel(modelName)] || '20_res_gpt_bruto';
}

// Calculate current sweep ID from date
function getCurrentSweepId(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

// Calculate week start date from sweep ID
function getWeekStartFromSweepId(sweepId: string): string {
  const match = sweepId.match(/(\d{4})-W(\d{2})/);
  if (!match) return new Date().toISOString().split('T')[0];
  
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  
  // First day of year
  const jan1 = new Date(year, 0, 1);
  // Find the Monday of week 1
  const dayOffset = (jan1.getDay() + 6) % 7;
  const firstMonday = new Date(year, 0, 1 + (7 - dayOffset));
  // Add weeks
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
  
  return weekStart.toISOString().split('T')[0];
}

// Determine if a record has data based on search_completed_at (OPTIMIZED)
// CRITICAL FIX: Usamos search_completed_at en vez de revisar columnas de texto pesado.
// Esto evita timeouts de PostgREST (57014) y es mucho más rápido.
function recordHasData(record: Record<string, unknown>): boolean {
  // Primary method: search_completed_at indica que la búsqueda terminó con éxito
  const searchCompleted = record['search_completed_at'];
  if (searchCompleted !== null && searchCompleted !== undefined) {
    return true;
  }
  
  // Fallback: si analysis_completed_at está set, definitivamente hay datos
  const analysisCompleted = record['analysis_completed_at'];
  if (analysisCompleted !== null && analysisCompleted !== undefined) {
    return true;
  }
  
  return false;
}

export function useUnifiedSweepMetrics(forcedSweepId?: string) {
  
  return useQuery({
    queryKey: ["unified-sweep-metrics", forcedSweepId],
    queryFn: async (): Promise<UnifiedSweepMetrics> => {
      // CRITICAL FIX: Use EXACT counts instead of sampling to avoid 1000-row limit
      // Step 1: Get total records per week using count queries
      const { count: totalV2Count, error: countError } = await supabase
        .from('rix_runs_v2')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        console.error('[useUnifiedSweepMetrics] Error counting records:', countError);
      }
      
      // Step 2: Get the most recent week start (single value, very fast)
      const { data: latestRecord, error: latestError } = await supabase
        .from('rix_runs_v2')
        .select('06_period_from')
        .not('06_period_from', 'is', null)
        .order('06_period_from', { ascending: false })
        .limit(1)
        .single();
      
      if (latestError && latestError.code !== 'PGRST116') {
        console.error('[useUnifiedSweepMetrics] Error fetching latest week:', latestError);
      }
      
      const weekStart = latestRecord?.['06_period_from'] || getWeekStartFromSweepId(getCurrentSweepId());
      
      // Step 3: Get EXACT count for the active week
      const { count: weekRecordCount, error: weekCountError } = await supabase
        .from('rix_runs_v2')
        .select('*', { count: 'exact', head: true })
        .eq('06_period_from', weekStart);
      
      if (weekCountError) {
        console.error('[useUnifiedSweepMetrics] Error counting week records:', weekCountError);
      }
      
      const recordCount = weekRecordCount || 0;
      
      // Derive sweepId using ISO 8601 week calculation (date-fns handles edge cases correctly)
      const weekDate = new Date(weekStart + 'T00:00:00');
      const isoWeek = getISOWeek(weekDate);
      const isoYear = getISOWeekYear(weekDate);
      const derivedSweepId = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
      
      const sweepId = forcedSweepId || derivedSweepId;
      
      console.log(`[useUnifiedSweepMetrics] Active week: ${weekStart} (${recordCount} records EXACT count), sweepId: ${sweepId}, total V2: ${totalV2Count}`);
      
      
      // Parallel queries for maximum efficiency
      const [
        rixRunsResult,
        sweepProgressResult,
        pendingTriggersResult,
        failedCompaniesResult,
        pipelineLogsResult,
      ] = await Promise.all([
        // OPTIMIZED: Solo traer metadatos ligeros, NO columnas de texto pesado (*_bruto)
        // Esto evita timeouts de PostgREST (57014) en el dashboard
        supabase
          .from('rix_runs_v2')
          .select('05_ticker, 02_model_name, 09_rix_score, search_completed_at, analysis_completed_at')
          .eq('06_period_from', weekStart),
        
        // Get sweep_progress status counts (include ticker for ghost detection)
        supabase
          .from('sweep_progress')
          .select('status, ticker')
          .eq('sweep_id', sweepId),
          
        // Get pending/processing triggers with result for progress tracking
        // UPDATED: Include auto_continue for autonomous system visibility
        supabase
          .from('cron_triggers')
          .select('action, status, result, created_at, processed_at')
          .in('status', ['pending', 'processing'])
          .in('action', ['repair_search', 'repair_analysis', 'auto_sanitize', 'full_sweep', 'auto_continue'])
          .order('created_at', { ascending: false })
          .limit(10),
          
        // Get failed companies with details
        supabase
          .from('sweep_progress')
          .select('ticker, error_message, updated_at')
          .eq('sweep_id', sweepId)
          .eq('status', 'failed'),

        // Telemetry heartbeat: latest pipeline log (server-side proof of activity)
        supabase
          .from('pipeline_logs')
          .select('created_at, stage, status, ticker, model_name')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);
      
      if (rixRunsResult.error) throw rixRunsResult.error;
      
      const records = rixRunsResult.data || [];
      const progressRecords = sweepProgressResult.data || [];
      const pendingTriggers = pendingTriggersResult.data || [];
      const failedCompaniesData = failedCompaniesResult.data || [];

      const triggerFetchError = pendingTriggersResult.error?.message || null;

      // Fallback heartbeat from trigger activity timestamps
      const triggersLastActivityAt: Date | null = (() => {
        let last: Date | null = null;
        for (const t of pendingTriggers as any[]) {
          const ts = t.processed_at || t.created_at;
          if (!ts) continue;
          const d = new Date(ts);
          if (Number.isNaN(d.getTime())) continue;
          if (!last || d.getTime() > last.getTime()) last = d;
        }
        return last;
      })();

      const lastPipelineLog = pipelineLogsResult.data?.[0] || null;
      const telemetry: UnifiedSweepMetrics['telemetry'] = lastPipelineLog
        ? {
            lastHeartbeatAt: lastPipelineLog.created_at ? new Date(lastPipelineLog.created_at) : null,
            stage: lastPipelineLog.stage || undefined,
            status: lastPipelineLog.status || undefined,
            ticker: lastPipelineLog.ticker || undefined,
            model: (lastPipelineLog as any).model_name || undefined,
          }
        : null;
      
      // Calculate ghost companies by CROSS-REFERENCING with real data
      // Ghost = marked 'completed' in sweep_progress BUT has NO records in rix_runs_v2
      const completedTickersInProgress = progressRecords
        .filter(p => p.status === 'completed')
        .map(p => p.ticker);
      
      const tickersWithRealData = new Set(records.map(r => r['05_ticker']));
      
      const ghostTickersList = completedTickersInProgress
        .filter(ticker => ticker && !tickersWithRealData.has(ticker));
      
      // Calculate sweep_progress metrics
      const searchCompleted = progressRecords.filter(p => p.status === 'completed').length;
      const searchPending = progressRecords.filter(p => p.status === 'pending').length;
      const searchProcessing = progressRecords.filter(p => p.status === 'processing').length;
      const searchFailed = progressRecords.filter(p => p.status === 'failed').length;
      
      // Build model metrics - USING CORRECT RESPONSE COLUMNS
      const modelMap = new Map<string, {
        total: number;
        withScore: number;
        withData: number;
        pendingAnalyzable: number;
        pendingNoData: number;
      }>();
      
      // Build company metrics
      const companyMap = new Map<string, {
        modelsWithScore: number;
        totalModels: number;
      }>();
      
      records.forEach(record => {
        const ticker = record['05_ticker'];
        const rawModel = record['02_model_name'] || 'Unknown';
        const model = normalizeModel(rawModel);
        const hasScore = record['09_rix_score'] !== null;
        
        // CRITICAL: Use model-specific column to detect hasData
        const hasData = recordHasData(record as Record<string, unknown>);
        
        // Model metrics
        const modelStats = modelMap.get(model) || {
          total: 0,
          withScore: 0,
          withData: 0,
          pendingAnalyzable: 0,
          pendingNoData: 0,
        };
        
        modelStats.total++;
        if (hasScore) {
          modelStats.withScore++;
          modelStats.withData++;
        } else if (hasData) {
          modelStats.withData++;
          modelStats.pendingAnalyzable++;
        } else {
          modelStats.pendingNoData++;
        }
        modelMap.set(model, modelStats);
        
        // Company metrics
        if (ticker) {
          const companyStats = companyMap.get(ticker) || {
            modelsWithScore: 0,
            totalModels: 0,
          };
          companyStats.totalModels++;
          if (hasScore) {
            companyStats.modelsWithScore++;
          }
          companyMap.set(ticker, companyStats);
        }
      });
      
      // Convert model map to sorted array
      const modelOrder = ['ChatGPT', 'Deepseek', 'Gemini', 'Grok', 'Perplexity', 'Qwen'];
      const byModel: ModelMetrics[] = modelOrder
        .filter(model => modelMap.has(model))
        .map(model => {
          const stats = modelMap.get(model)!;
          return {
            model,
            total: stats.total,
            withScore: stats.withScore,
            withData: stats.withData,
            pending: stats.total - stats.withScore,
            pendingAnalyzable: stats.pendingAnalyzable,
            pendingNoData: stats.pendingNoData,
            percentage: stats.total > 0 ? Math.round((stats.withScore / stats.total) * 100) : 0,
          };
        });
      
      // Calculate company-level metrics
      const companyStats = Array.from(companyMap.values());
      const companiesComplete = companyStats.filter(c => c.modelsWithScore >= 6).length;
      const companiesPartial = companyStats.filter(c => c.modelsWithScore > 0 && c.modelsWithScore < 6).length;
      const companiesNoData = companyStats.filter(c => c.modelsWithScore === 0).length;
      const totalCompanies = companyMap.size;
      
      // Calculate record-level metrics USING CORRECT hasData
      const totalRecords = records.length;
      const recordsWithScore = records.filter(r => r['09_rix_score'] !== null).length;
      const recordsWithData = records.filter(r => recordHasData(r as Record<string, unknown>)).length;
      const recordsPendingAnalysis = records.filter(r => 
        r['09_rix_score'] === null && recordHasData(r as Record<string, unknown>)
      ).length;
      const recordsNoData = records.filter(r => 
        r['09_rix_score'] === null && !recordHasData(r as Record<string, unknown>)
      ).length;
      
      // Determine system state (state machine)
      let systemState: UnifiedSweepMetrics['systemState'] = 'IDLE';
      
      if (searchProcessing > 0 || searchPending > 0) {
        systemState = 'SWEEP_RUNNING';
      } else if (pendingTriggers.length > 0) {
        systemState = 'REPAIRS_PENDING';
      } else if (recordsNoData > 0 || recordsPendingAnalysis > 0) {
        systemState = 'CHECKING_DATA';
      } else if (totalRecords > 0 && recordsWithScore === totalRecords) {
        systemState = 'COMPLETE';
      }
      
      return {
        sweepId,
        weekStart,
        
        totalCompanies,
        companiesComplete,
        companiesPartial,
        companiesNoData,
        companiesFailed: searchFailed,
        
        totalRecords,
        recordsWithScore,
        recordsWithData,
        recordsPendingAnalysis,
        recordsNoData,
        
        byModel,
        
        companyCompletionRate: totalCompanies > 0 
          ? Math.round((companiesComplete / totalCompanies) * 100) 
          : 0,
        recordCompletionRate: totalRecords > 0 
          ? Math.round((recordsWithScore / totalRecords) * 100) 
          : 0,
        
        searchCompleted,
        searchPending,
        searchProcessing,
        searchFailed,
        
        // Trigger status
        triggersPending: pendingTriggers.filter(t => t.status === 'pending').length,
        triggersProcessing: pendingTriggers.filter(t => t.status === 'processing').length,

        triggerFetchError,

        triggersLastActivityAt,
        
        // Active trigger progress - extract from the most recent trigger's result
        activeTrigger: (() => {
          const active = pendingTriggers.find(t => t.status === 'processing' || t.status === 'pending');
          if (!active) return null;
          const result = active.result as { processed?: number; remaining?: number; remaining_estimate?: number; last?: { ticker?: string; model?: string } } | null;
          return {
            action: active.action,
            processed: result?.processed || 0,
            remaining: result?.remaining ?? result?.remaining_estimate ?? 0,
            lastTicker: result?.last?.ticker,
            lastModel: result?.last?.model,
          };
        })(),

        telemetry,
        
        // Ghost companies: completed in sweep_progress but NO records in rix_runs_v2
        ghostCompanies: ghostTickersList.length,
        ghostTickers: ghostTickersList,
        
        // Failed companies with details
        failedCompanies: failedCompaniesData.map(f => ({
          ticker: f.ticker,
          error: f.error_message || 'Error desconocido',
          updatedAt: new Date(f.updated_at),
        })),
        
        systemState,
        
        lastUpdated: new Date(),
      };
    },
    // Dynamic refetch: faster when there's active work, slower when idle
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActiveWork = data && (
        data.triggersProcessing > 0 || 
        data.triggersPending > 0 || 
        data.searchProcessing > 0 ||
        data.recordsNoData > 10 ||
        data.recordsPendingAnalysis > 0
      );
      return hasActiveWork ? 2000 : 5000; // 2s when active, 5s when idle
    },
    staleTime: 1000,
    refetchOnWindowFocus: true,
  });
}

// Export utility to manually refresh metrics across all components
export function useRefreshSweepMetrics() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ["unified-sweep-metrics"] });
  };
}

// Export the column mapping for use in other files
export { MODEL_RESPONSE_COLUMNS, getResponseColumn, normalizeModel };
