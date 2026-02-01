import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

// Determine if a record has data based on its MODEL-SPECIFIC column
function recordHasData(record: Record<string, unknown>): boolean {
  const modelName = record['02_model_name'] as string;
  const responseColumn = getResponseColumn(modelName);
  const raw = record[responseColumn];
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'string' && raw.trim().length === 0) return false;
  return true;
}

export function useUnifiedSweepMetrics(forcedSweepId?: string) {
  
  return useQuery({
    queryKey: ["unified-sweep-metrics", forcedSweepId],
    queryFn: async (): Promise<UnifiedSweepMetrics> => {
      // CRITICAL FIX: Get actual week start from the most recent data in rix_runs_v2
      // instead of calculating from sweepId (which can be off due to ISO week edge cases)
      const { data: latestPeriod } = await supabase
        .from('rix_runs_v2')
        .select('06_period_from')
        .order('06_period_from', { ascending: false })
        .limit(1);
      
      // Use the actual date from DB, fallback to calculated if no data
      const weekStart = latestPeriod?.[0]?.['06_period_from'] || getWeekStartFromSweepId(getCurrentSweepId());
      
      // IMPORTANT: sweep_progress uses a sweepId derived from *current date* (see orchestrator).
      // Using weekStart-derived week numbers caused mismatches like W05 vs W06.
      const sweepId = forcedSweepId || getCurrentSweepId();
      
      console.log(`[useUnifiedSweepMetrics] Using weekStart: ${weekStart}, sweepId: ${sweepId}`);
      
      
      // Parallel queries for maximum efficiency
      const [
        rixRunsResult,
        sweepProgressResult,
        pendingTriggersResult,
        failedCompaniesResult,
      ] = await Promise.all([
        // Get all records for this week from rix_runs_v2 - include ALL response columns
        supabase
          .from('rix_runs_v2')
          .select('05_ticker, 02_model_name, 09_rix_score, 20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, respuesta_bruto_grok, respuesta_bruto_qwen')
          .eq('06_period_from', weekStart),
        
        // Get sweep_progress status counts (include ticker for ghost detection)
        supabase
          .from('sweep_progress')
          .select('status, ticker')
          .eq('sweep_id', sweepId),
          
        // Get pending triggers count
        supabase
          .from('cron_triggers')
          .select('action, status')
          .in('status', ['pending', 'processing'])
          .in('action', ['repair_search', 'repair_analysis', 'auto_sanitize', 'full_sweep']),
          
        // Get failed companies with details
        supabase
          .from('sweep_progress')
          .select('ticker, error_message, updated_at')
          .eq('sweep_id', sweepId)
          .eq('status', 'failed'),
      ]);
      
      if (rixRunsResult.error) throw rixRunsResult.error;
      
      const records = rixRunsResult.data || [];
      const progressRecords = sweepProgressResult.data || [];
      const pendingTriggers = pendingTriggersResult.data || [];
      const failedCompaniesData = failedCompaniesResult.data || [];
      
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
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    staleTime: 5000,
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
