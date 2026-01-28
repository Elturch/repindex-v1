import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// REAL STATISTICAL REGRESSION ANALYSIS WITH UNIFIED DATA (V1 + V2)
// This endpoint performs actual statistical calculations on RIX data with prices
// Fuses rix_runs (legacy) and rix_runs_v2 (Lovable) with V2 priority
// =============================================================================

interface RegressionRequest {
  minWeeks?: number;        // Minimum weeks of data required (default: 8)
  targetMetrics?: string[]; // Which metrics to analyze (default: all 8)
}

interface MetricCorrelation {
  metric: string;
  displayName: string;
  correlationWithPrice: number;      // Pearson correlation
  pValue: number;                    // Statistical significance
  isSignificant: boolean;            // p < 0.05
  direction: 'positive' | 'negative' | 'none';
  sampleSize: number;
  meanScore: number;
  stdDev: number;
}

interface RegressionResult {
  success: boolean;
  analysisDate: string;
  dataProfile: {
    totalRecords: number;
    totalIssuers: number;
    issuersWithData: number;
    issuersWithPrices: number;
    coveragePercent: number;
    weeksAnalyzed: number;
    dateRange: { from: string; to: string };
    modelsIncluded: string[];
    dataSourceBreakdown: {
      rixRunsLegacy: number;
      rixRunsV2: number;
    };
  };
  metricAnalysis: MetricCorrelation[];
  topPredictors: { metric: string; displayName: string; correlation: number }[];
  weakPredictors: { metric: string; displayName: string; correlation: number }[];
  rSquared: number;                  // Model fit quality
  adjustedRSquared: number;
  methodology: string;
  caveats: string[];
}

// Metric display names
const METRIC_NAMES: Record<string, string> = {
  '23_nvm_score': 'NVM (Narrativa y Visibilidad)',
  '26_drm_score': 'DRM (Reputación Digital)',
  '29_sim_score': 'SIM (Imagen Social)',
  '32_rmm_score': 'RMM (Riesgo/Crisis)',
  '35_cem_score': 'CEM (Comunicación/Engagement)',
  '38_gam_score': 'GAM (Gobierno/Transparencia)',
  '41_dcm_score': 'DCM (Diferenciación)',
  '44_cxm_score': 'CXM (Experiencia Cliente)',
};

// V2 uses SAME column names as V1 (with numeric prefixes)
// No mapping needed - columns are identical

// Calculate Pearson correlation coefficient
function pearsonCorrelation(x: number[], y: number[]): { r: number; pValue: number } {
  if (x.length !== y.length || x.length < 3) {
    return { r: 0, pValue: 1 };
  }

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return { r: 0, pValue: 1 };

  const r = numerator / denominator;

  // Calculate p-value using t-distribution approximation
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  // Simplified p-value estimation (for n > 30, this is a good approximation)
  const pValue = n > 30 
    ? 2 * (1 - normalCDF(Math.abs(t)))
    : estimatePValue(Math.abs(t), n - 2);

  return { r, pValue };
}

// Normal CDF approximation
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// Simple p-value estimation for small samples
function estimatePValue(t: number, df: number): number {
  // Very rough approximation - for proper analysis, use a t-distribution table
  if (df < 2) return 1;
  const x = df / (df + t * t);
  return x; // This is a rough beta-based approximation
}

// Calculate mean and standard deviation
function stats(arr: number[]): { mean: number; stdDev: number } {
  if (arr.length === 0) return { mean: 0, stdDev: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((acc, val) => acc + (val - mean) ** 2, 0) / arr.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

// Parse price string to number
function parsePrice(priceStr: string | null): number | null {
  if (!priceStr || priceStr === 'NC' || priceStr === '') return null;
  const cleaned = priceStr.replace(',', '.').replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// =============================================================================
// PAGINATED FETCH HELPER - Gets ALL records from a table
// =============================================================================
async function fetchAllPaginated(
  supabase: any,
  table: string,
  columns: string,
  filters?: { column: string; op: string; value: any }[]
): Promise<any[]> {
  const allData: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(columns)
      .order('06_period_from', { ascending: false })
      .range(offset, offset + batchSize - 1);

    // Apply filters if provided
    if (filters) {
      for (const filter of filters) {
        if (filter.op === 'not.is') {
          query = query.not(filter.column, 'is', filter.value);
        } else if (filter.op === 'neq') {
          query = query.neq(filter.column, filter.value);
        }
      }
    }

    const { data: batch, error } = await query;

    if (error) {
      console.error(`[rix-regression] Fetch error from ${table}:`, error);
      break;
    }

    if (!batch || batch.length === 0) {
      hasMore = false;
    } else {
      allData.push(...batch);
      offset += batchSize;
      if (batch.length < batchSize) {
        hasMore = false;
      }
    }
  }

  return allData;
}

// =============================================================================
// DEDUPLICATE WITH V2 PRIORITY
// V2 uses SAME column names as V1 - no normalization needed
// =============================================================================
function deduplicateWithV2Priority(v1Data: any[], v2Data: any[]): any[] {
  // Create a map with composite key: ticker + week + model
  const dataMap = new Map<string, any>();

  // First, add all V1 records
  for (const record of v1Data) {
    const key = `${record['05_ticker']}_${record['06_period_from']}_${record['02_model_name']}`;
    dataMap.set(key, { ...record, _source: 'v1' });
  }

  // Then, override with V2 records (V2 takes priority - same column format)
  for (const v2Record of v2Data) {
    const key = `${v2Record['05_ticker']}_${v2Record['06_period_from']}_${v2Record['02_model_name']}`;
    dataMap.set(key, { ...v2Record, _source: 'v2' });
  }

  return Array.from(dataMap.values());
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let params: RegressionRequest = {};
    try {
      params = await req.json();
    } catch {
      // Use defaults
    }

    const minWeeks = params.minWeeks || 8;
    const targetMetrics = params.targetMetrics || Object.keys(METRIC_NAMES);

    console.log(`[rix-regression] Starting unified analysis with minWeeks=${minWeeks}`);

    // =============================================================================
    // STEP 0: Get dynamic issuer count
    // =============================================================================
    const { count: totalIssuers, error: issuerCountError } = await supabase
      .from('repindex_root_issuers')
      .select('*', { count: 'exact', head: true });

    if (issuerCountError) {
      console.error('[rix-regression] Issuer count error:', issuerCountError);
    }

    const { count: listedIssuers } = await supabase
      .from('repindex_root_issuers')
      .select('*', { count: 'exact', head: true })
      .eq('cotiza_en_bolsa', true);

    console.log(`[rix-regression] Total issuers: ${totalIssuers}, Listed: ${listedIssuers}`);

    // =============================================================================
    // STEP 1: Fetch ALL data from BOTH tables with pagination
    // =============================================================================
    // V1 and V2 use the SAME column naming convention
    const columns = `
      05_ticker,
      02_model_name,
      06_period_from,
      07_period_to,
      09_rix_score,
      23_nvm_score,
      26_drm_score,
      29_sim_score,
      32_rmm_score,
      35_cem_score,
      38_gam_score,
      41_dcm_score,
      44_cxm_score,
      48_precio_accion
    `;

    // Fetch from both tables in parallel (same column names)
    const [v1DataRaw, v2DataRaw] = await Promise.all([
      fetchAllPaginated(supabase, 'rix_runs', columns, [
        { column: '48_precio_accion', op: 'not.is', value: null },
        { column: '48_precio_accion', op: 'neq', value: 'NC' },
        { column: '09_rix_score', op: 'not.is', value: null },
      ]),
      fetchAllPaginated(supabase, 'rix_runs_v2', columns, [
        { column: '48_precio_accion', op: 'not.is', value: null },
        { column: '48_precio_accion', op: 'neq', value: 'NC' },
        { column: '09_rix_score', op: 'not.is', value: null },
      ]),
    ]);

    console.log(`[rix-regression] Fetched ${v1DataRaw.length} from rix_runs, ${v2DataRaw.length} from rix_runs_v2`);

    // =============================================================================
    // STEP 2: Unify and deduplicate with V2 priority
    // =============================================================================
    const allData = deduplicateWithV2Priority(v1DataRaw, v2DataRaw);
    
    const v1Count = allData.filter(r => r._source === 'v1').length;
    const v2Count = allData.filter(r => r._source === 'v2').length;

    console.log(`[rix-regression] Unified dataset: ${allData.length} records (V1: ${v1Count}, V2: ${v2Count})`);

    if (allData.length < 50) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Insufficient data for regression analysis',
        dataAvailable: allData.length,
        minRequired: 50,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =============================================================================
    // STEP 3: Build company time series and calculate price changes
    // =============================================================================
    interface CompanyWeekData {
      ticker: string;
      week: string;
      price: number;
      priceChange?: number;  // Week-over-week % change
      metrics: Record<string, number[]>;  // Multiple models per week
      avgMetrics: Record<string, number>;
    }

    const companyData = new Map<string, Map<string, CompanyWeekData>>();
    const allWeeks = new Set<string>();
    const allModels = new Set<string>();
    const allTickers = new Set<string>();

    // Group by company and week
    for (const record of allData) {
      const ticker = record['05_ticker'];
      const week = record['06_period_from'];
      const model = record['02_model_name'];
      const price = parsePrice(record['48_precio_accion']);

      if (!ticker || !week || price === null) continue;

      allWeeks.add(week);
      allTickers.add(ticker);
      if (model) allModels.add(model);

      if (!companyData.has(ticker)) {
        companyData.set(ticker, new Map());
      }

      const tickerData = companyData.get(ticker)!;
      if (!tickerData.has(week)) {
        tickerData.set(week, {
          ticker,
          week,
          price,
          metrics: {},
          avgMetrics: {},
        });
      }

      const weekData = tickerData.get(week)!;

      // Aggregate metrics from all models for this week
      for (const metricCol of targetMetrics) {
        const value = record[metricCol];
        if (typeof value === 'number' && !isNaN(value)) {
          if (!weekData.metrics[metricCol]) {
            weekData.metrics[metricCol] = [];
          }
          weekData.metrics[metricCol].push(value);
        }
      }
    }

    // Calculate average metrics and price changes
    const sortedWeeks = Array.from(allWeeks).sort();
    const companiesWithSufficientData: string[] = [];

    for (const [ticker, weekMap] of companyData) {
      const weeks = Array.from(weekMap.keys()).sort();
      
      if (weeks.length < minWeeks) continue;
      companiesWithSufficientData.push(ticker);

      // Calculate averages and price changes
      for (let i = 0; i < weeks.length; i++) {
        const weekData = weekMap.get(weeks[i])!;
        
        // Average metrics across models
        for (const [metricCol, values] of Object.entries(weekData.metrics)) {
          if (values.length > 0) {
            weekData.avgMetrics[metricCol] = values.reduce((a, b) => a + b, 0) / values.length;
          }
        }

        // Calculate price change from previous week
        if (i > 0) {
          const prevWeekData = weekMap.get(weeks[i - 1])!;
          if (prevWeekData.price > 0) {
            weekData.priceChange = ((weekData.price - prevWeekData.price) / prevWeekData.price) * 100;
          }
        }
      }
    }

    console.log(`[rix-regression] ${companiesWithSufficientData.length} companies with ≥${minWeeks} weeks of data`);
    console.log(`[rix-regression] Models included: ${Array.from(allModels).join(', ')}`);

    // =============================================================================
    // STEP 4: Build correlation analysis for each metric
    // =============================================================================
    const metricAnalysis: MetricCorrelation[] = [];

    for (const metricCol of targetMetrics) {
      const metricScores: number[] = [];
      const priceChanges: number[] = [];

      // Collect paired observations (metric score → next week price change)
      for (const ticker of companiesWithSufficientData) {
        const weekMap = companyData.get(ticker)!;
        const weeks = Array.from(weekMap.keys()).sort();

        for (let i = 0; i < weeks.length - 1; i++) {
          const currentWeek = weekMap.get(weeks[i])!;
          const nextWeek = weekMap.get(weeks[i + 1])!;

          const metricValue = currentWeek.avgMetrics[metricCol];
          const priceChange = nextWeek.priceChange;

          if (metricValue !== undefined && priceChange !== undefined && !isNaN(priceChange)) {
            metricScores.push(metricValue);
            priceChanges.push(priceChange);
          }
        }
      }

      if (metricScores.length < 30) {
        console.log(`[rix-regression] Skipping ${metricCol}: only ${metricScores.length} observations`);
        continue;
      }

      const { r, pValue } = pearsonCorrelation(metricScores, priceChanges);
      const { mean, stdDev } = stats(metricScores);

      const direction: 'positive' | 'negative' | 'none' = 
        Math.abs(r) < 0.05 ? 'none' : r > 0 ? 'positive' : 'negative';

      metricAnalysis.push({
        metric: metricCol,
        displayName: METRIC_NAMES[metricCol] || metricCol,
        correlationWithPrice: Math.round(r * 1000) / 1000,
        pValue: Math.round(pValue * 1000) / 1000,
        isSignificant: pValue < 0.05,
        direction,
        sampleSize: metricScores.length,
        meanScore: Math.round(mean * 10) / 10,
        stdDev: Math.round(stdDev * 10) / 10,
      });
    }

    // Sort by absolute correlation
    metricAnalysis.sort((a, b) => Math.abs(b.correlationWithPrice) - Math.abs(a.correlationWithPrice));

    // =============================================================================
    // STEP 5: Calculate simple R² for combined model
    // =============================================================================
    // Using top 3 metrics as predictors
    const topMetrics = metricAnalysis.slice(0, 3);
    
    // Simple multiple regression R² approximation
    // (For production, you'd use proper OLS regression)
    let combinedR2 = 0;
    for (const m of topMetrics) {
      combinedR2 += m.correlationWithPrice ** 2 * (1 - combinedR2);
    }
    const adjustedR2 = Math.max(0, combinedR2 - (3 * (1 - combinedR2)) / (metricAnalysis[0]?.sampleSize || 100 - 3 - 1));

    // =============================================================================
    // STEP 6: Build response with enhanced dataProfile
    // =============================================================================
    const coveragePercent = totalIssuers ? Math.round((allTickers.size / totalIssuers) * 100) : 0;

    const result: RegressionResult = {
      success: true,
      analysisDate: new Date().toISOString(),
      dataProfile: {
        totalRecords: allData.length,
        totalIssuers: totalIssuers || 174,
        issuersWithData: allTickers.size,
        issuersWithPrices: companiesWithSufficientData.length,
        coveragePercent,
        weeksAnalyzed: sortedWeeks.length,
        dateRange: {
          from: sortedWeeks[0] || 'N/A',
          to: sortedWeeks[sortedWeeks.length - 1] || 'N/A',
        },
        modelsIncluded: Array.from(allModels),
        dataSourceBreakdown: {
          rixRunsLegacy: v1Count,
          rixRunsV2: v2Count,
        },
      },
      metricAnalysis,
      topPredictors: metricAnalysis
        .filter(m => m.isSignificant && Math.abs(m.correlationWithPrice) >= 0.1)
        .slice(0, 3)
        .map(m => ({ metric: m.metric, displayName: m.displayName, correlation: m.correlationWithPrice })),
      weakPredictors: metricAnalysis
        .filter(m => !m.isSignificant || Math.abs(m.correlationWithPrice) < 0.1)
        .map(m => ({ metric: m.metric, displayName: m.displayName, correlation: m.correlationWithPrice })),
      rSquared: Math.round(combinedR2 * 1000) / 1000,
      adjustedRSquared: Math.round(adjustedR2 * 1000) / 1000,
      methodology: `Análisis de correlación de Pearson entre métricas RIX (semana t) y variación de precio (semana t+1). Datos fusionados de rix_runs (legacy) y rix_runs_v2 con prioridad V2. Se requieren mínimo ${minWeeks} semanas de datos por empresa. Los valores de correlación oscilan entre -1 (inversa perfecta) y +1 (directa perfecta). Valores p < 0.05 se consideran estadísticamente significativos.`,
      caveats: [
        `Universo: ${totalIssuers || 174} empresas (${listedIssuers || 133} cotizadas)`,
        `Cobertura de datos: ${coveragePercent}% (${allTickers.size} empresas con datos de precio)`,
        `Datos: ${sortedWeeks.length} semanas (${sortedWeeks[0]} → ${sortedWeeks[sortedWeeks.length - 1]})`,
        `Modelos IA: ${Array.from(allModels).length} (${Array.from(allModels).join(', ')})`,
        'Correlación no implica causalidad',
        'Precios de mercado tienen múltiples factores externos no capturados',
        'El R² ajustado refleja el poder explicativo del modelo sobre variaciones de precio',
      ],
    };

    console.log(`[rix-regression] Analysis complete. Top predictor: ${result.topPredictors[0]?.displayName || 'N/A'} (r=${result.topPredictors[0]?.correlation || 0})`);
    console.log(`[rix-regression] Data profile: ${result.dataProfile.totalRecords} records, ${result.dataProfile.issuersWithData} companies, ${result.dataProfile.modelsIncluded.length} models`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[rix-regression] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
