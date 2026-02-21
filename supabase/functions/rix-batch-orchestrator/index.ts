import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// SISTEMA ULTRA-ROBUSTO DE BARRIDO POR FASES
// - 1 fase = 1 invocación independiente (5 empresas)
// - 34 CRONs escalonados cada 5 min = ~3 horas para todo el barrido
// - Cada fase corre de forma aislada, sin dependencias
// - Recuperable ante fallos, persistencia en sweep_progress
// ============================================================================

interface SweepResult {
  sweepId: string;
  fase: number;
  status: 'completed' | 'partial_failure' | 'no_work';
  companiesProcessed: number;
  companiesCompleted: number;
  companiesFailed: number;
  errors: Array<{ ticker: string; error: string }>;
  durationMs: number;
}

// Reintentos muy altos para asegurar que el barrido no “se rinda” antes de completar.
// IMPORTANTE: para evitar bloqueo por una empresa problemática, la selección prioriza
// pending y ordena failed por retry_count asc.
const MAX_RETRIES = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Genera el ID del barrido para la semana actual: "2026-W04"
function getCurrentSweepId(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

// ============================================================================
// CRITICAL FIX: Obtiene el sweepId ACTIVO basado en SWEEP_PROGRESS (estado operativo)
// NO desde rix_runs_v2.06_period_from (que es rolling y puede crear desalineaciones).
// El sweep activo es aquel con registros pending/processing/failed en sweep_progress.
// ============================================================================
async function getActiveSweepId(
  supabase: ReturnType<typeof createClient>,
  forceSweeepId?: string
): Promise<string> {
  // 0. Si viene un sweep_id forzado en el request, usarlo directamente
  if (forceSweeepId) {
    console.log(`[getActiveSweepId] Using forced sweep_id from request: ${forceSweeepId}`);
    return forceSweeepId;
  }

  // 1. Buscar sweep con trabajo pendiente en sweep_progress
  //    El formato YYYY-WNN permite orden lexicográfico correcto (descendente = más reciente)
  const { data: activeSweep, error } = await supabase
    .from('sweep_progress')
    .select('sweep_id')
    .in('status', ['pending', 'processing', 'failed'])
    .order('sweep_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[getActiveSweepId] Error querying sweep_progress:', error);
    return getCurrentSweepId();
  }

  if (activeSweep?.sweep_id) {
    console.log(`[getActiveSweepId] Found active sweep from sweep_progress: ${activeSweep.sweep_id}`);
    return activeSweep.sweep_id;
  }

  // 2. No hay trabajo pendiente, usar calendario como fallback
  const calendarSweep = getCurrentSweepId();
  console.log(`[getActiveSweepId] No pending work in sweep_progress, fallback to calendar: ${calendarSweep}`);
  return calendarSweep;
}

// Verifica si una empresa ya tiene datos para el período de análisis actual
async function hasCompanyDataThisWeek(
  supabase: ReturnType<typeof createClient>,
  ticker: string
): Promise<boolean> {
  // Calculate the current analysis period (Monday to Sunday of PREVIOUS week)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  // Period is always the PREVIOUS week
  const periodFrom = new Date(now);
  periodFrom.setDate(now.getDate() + mondayOffset - 7); // Monday of previous week
  const periodTo = new Date(periodFrom);
  periodTo.setDate(periodFrom.getDate() + 6); // Sunday of previous week

  const periodFromStr = periodFrom.toISOString().split('T')[0];
  const periodToStr = periodTo.toISOString().split('T')[0];

  // Check if there's AT LEAST 1 record for this period (not 6, to catch early)
  const { count, error } = await supabase
    .from('rix_runs_v2')
    .select('*', { count: 'exact', head: true })
    .eq('05_ticker', ticker)
    .eq('06_period_from', periodFromStr)
    .eq('07_period_to', periodToStr);

  if (error) {
    console.error(`[phase] Error checking data for ${ticker}:`, error);
    return false;
  }

  // If we have at least 1 record, the company is already being processed or done
  const hasData = (count || 0) >= 1;
  if (hasData) {
    console.log(`[phase] ${ticker} already has ${count} records for period ${periodFromStr} to ${periodToStr}`);
  }
  return hasData;
}

// Inicializa el barrido COMPLETO si no existe para esta semana
// MEJORADO: También sincroniza empresas nuevas que no estén en el sweep actual
async function initializeSweepIfNeeded(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<{ isNew: boolean; totalCompanies: number; syncedMissing?: number }> {
  // Obtener TODOS los issuers ACTIVOS (importante: filtrar por status)
  const { data: issuers, error: issuersError } = await supabase
    .from('repindex_root_issuers')
    .select('ticker, issuer_name, fase')
    .eq('status', 'active')  // CRÍTICO: Solo empresas activas
    .order('fase', { ascending: true, nullsLast: true });

  if (issuersError || !issuers) {
    throw new Error(`Failed to fetch issuers: ${issuersError?.message}`);
  }

  // Verificar cuántos registros existen para este sweep
  const { data: existingRecords } = await supabase
    .from('sweep_progress')
    .select('ticker')
    .eq('sweep_id', sweepId);

  const existingTickers = new Set(existingRecords?.map(e => e.ticker) || []);
  const existingCount = existingTickers.size;

  // Si ya hay registros, verificar si faltan empresas (sync incremental)
  if (existingCount > 0) {
    const missingIssuers = issuers.filter(i => !existingTickers.has(i.ticker));
    
    if (missingIssuers.length > 0) {
      console.log(`[init] Sweep ${sweepId} exists with ${existingCount} records, but missing ${missingIssuers.length} companies. Syncing...`);
      
      const missingRecords = missingIssuers.map((issuer, index) => ({
        sweep_id: sweepId,
        fase: issuer.fase || 35,  // Fase alta para nuevas empresas
        ticker: issuer.ticker,
        issuer_name: issuer.issuer_name,
        status: 'pending',
        models_completed: 0,
        retry_count: 0,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('sweep_progress')
        .insert(missingRecords)
        .select('id');

      if (insertError) {
        console.error(`[init] Error syncing missing companies:`, insertError);
      } else {
        const syncedCount = inserted?.length || 0;
        console.log(`[init] Synced ${syncedCount} missing companies: ${missingIssuers.map(i => i.ticker).join(', ')}`);
        return { isNew: false, totalCompanies: existingCount + syncedCount, syncedMissing: syncedCount };
      }
    }

    console.log(`[init] Sweep ${sweepId} already initialized with ${existingCount}/${issuers.length} records`);
    return { isNew: false, totalCompanies: existingCount };
  }

  // Crear nuevo sweep desde cero
  console.log(`[init] Initializing new sweep ${sweepId} with ${issuers.length} active companies`);

  const progressRecords = issuers.map((issuer, index) => ({
    sweep_id: sweepId,
    fase: issuer.fase || Math.floor(index / 5) + 1,
    ticker: issuer.ticker,
    issuer_name: issuer.issuer_name,
    status: 'pending',
    models_completed: 0,
    retry_count: 0,
  }));

  const batchSize = 50;
  let totalInserted = 0;
  
  for (let i = 0; i < progressRecords.length; i += batchSize) {
    const batch = progressRecords.slice(i, i + batchSize);
    console.log(`[init] Inserting batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records (items ${i + 1} to ${i + batch.length})`);
    
    const { data, error: insertError } = await supabase
      .from('sweep_progress')
      .insert(batch)
      .select('id');
    
    if (insertError) {
      console.error(`[init] ERROR in batch ${Math.floor(i / batchSize) + 1}:`, insertError);
      throw new Error(`Batch insert failed at items ${i + 1}-${i + batch.length}: ${insertError.message}`);
    }
    
    const insertedCount = data?.length || 0;
    totalInserted += insertedCount;
    console.log(`[init] Batch ${Math.floor(i / batchSize) + 1} success: ${insertedCount} records inserted (total: ${totalInserted})`);
  }

  console.log(`[init] Sweep ${sweepId} initialized: ${totalInserted}/${issuers.length} companies inserted`);
  return { isNew: true, totalCompanies: totalInserted };
}

// Obtiene las empresas pendientes de UNA fase específica
async function getCompaniesForPhase(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  fase: number,
  maxRetries: number = MAX_RETRIES
): Promise<Array<{ id: string; ticker: string; issuer_name: string; retry_count: number }>> {
  const { data, error } = await supabase
    .from('sweep_progress')
    .select('id, ticker, issuer_name, retry_count')
    .eq('sweep_id', sweepId)
    .eq('fase', fase)
    .in('status', ['pending', 'failed'])
    .lt('retry_count', maxRetries)
    .order('ticker');

  if (error || !data) {
    console.error(`[phase] Error fetching companies for phase ${fase}:`, error);
    return [];
  }

  return data;
}

// Procesa una empresa individual (llamando a rix-search-v2)
async function processCompany(
  supabase: ReturnType<typeof createClient>,
  progressId: string,
  ticker: string,
  issuerName: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<{ success: boolean; error?: string; modelsCompleted?: number }> {
  const started = Date.now();
  
  // DOBLE VERIFICACIÓN: Verificar que no esté ya en processing (evita concurrencia)
  const { data: currentStatus } = await supabase
    .from('sweep_progress')
    .select('status')
    .eq('id', progressId)
    .single();

  if (currentStatus?.status === 'processing') {
    console.log(`[phase] ${ticker} is already being processed by another instance, skipping`);
    return { success: true, modelsCompleted: 0 };
  }

  // DOBLE VERIFICACIÓN: Verificar si ya tiene datos en rix_runs_v2
  const hasData = await hasCompanyDataThisWeek(supabase, ticker);
  if (hasData) {
    console.log(`[phase] ${ticker} already has data this week (pre-check), marking as completed`);
    await supabase
      .from('sweep_progress')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString(),
        models_completed: 6 
      })
      .eq('id', progressId);
    return { success: true, modelsCompleted: 6 };
  }
  
  // Marcar como 'processing'
  const { error: markProcessingError } = await supabase
    .from('sweep_progress')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', progressId);

  if (markProcessingError) {
    console.error(`[phase] Failed to mark ${ticker} as processing: ${markProcessingError.message}`);
  }

  try {
    // Llamar a rix-search-v2 - HOTFIX: pasar sweep_id para consistencia
    console.log(`[phase] Processing ${ticker} (${issuerName})`);
    const response = await fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ ticker, issuer_name: issuerName }),
      // NOTE: sweep_id no se pasa aquí porque runSinglePhase usa getCurrentSweepId()
      // El fix principal está en el modo fire-and-forget del watchdog
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const modelsCompleted = result.results?.length || 0;

    await supabase
      .from('sweep_progress')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString(),
        models_completed: modelsCompleted
      })
      .eq('id', progressId);

    console.log(`[phase] ${ticker} completed with ${modelsCompleted} models`);
    return { success: true, modelsCompleted };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[phase] Error processing ${ticker}: ${errorMsg}`);

    const { data: currentProgress } = await supabase
      .from('sweep_progress')
      .select('retry_count')
      .eq('id', progressId)
      .single();

    await supabase
      .from('sweep_progress')
      .update({ 
        status: 'failed', 
        error_message: errorMsg,
        retry_count: (currentProgress?.retry_count || 0) + 1
      })
      .eq('id', progressId);

    console.log(`[phase] ${ticker} marked failed (retry_count -> ${(currentProgress?.retry_count || 0) + 1}) after ${Date.now() - started}ms`);
    return { success: false, error: errorMsg };
  } finally {
    const took = Date.now() - started;
    console.log(`[phase] processCompany(${ticker}) finished in ${took}ms`);
  }
}

// ============================================================================
// NUEVA FUNCIÓN: Procesa UNA sola fase de forma independiente
// ============================================================================
async function runSinglePhase(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  fase: number
): Promise<SweepResult> {
  const startTime = Date.now();
  const sweepId = getCurrentSweepId();
  const errors: Array<{ ticker: string; error: string }> = [];

  console.log(`[phase ${fase}] Starting independent phase processing for ${sweepId}`);

  // 1. Asegurar que el sweep está inicializado
  await initializeSweepIfNeeded(supabase, sweepId);

  // 2. Obtener empresas pendientes de ESTA fase
  const companies = await getCompaniesForPhase(supabase, sweepId, fase);

  if (companies.length === 0) {
    console.log(`[phase ${fase}] No pending companies for this phase`);
    return {
      sweepId,
      fase,
      status: 'no_work',
      companiesProcessed: 0,
      companiesCompleted: 0,
      companiesFailed: 0,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  }

  console.log(`[phase ${fase}] Processing ${companies.length} companies: ${companies.map(c => c.ticker).join(', ')}`);

  let completed = 0;
  let failed = 0;

  // 3. Procesar empresas SECUENCIALMENTE con delay entre cada una
  // (para evitar saturar APIs y rate limits)
  for (const company of companies) {
    const result = await processCompany(
      supabase,
      company.id,
      company.ticker,
      company.issuer_name || company.ticker,
      supabaseUrl,
      serviceKey
    );

    if (result.success) {
      completed++;
    } else {
      failed++;
      errors.push({ ticker: company.ticker, error: result.error || 'Unknown error' });
    }

    // Delay de 10 segundos entre empresas para no saturar
    if (company !== companies[companies.length - 1]) {
      console.log(`[phase ${fase}] Waiting 10s before next company...`);
      await sleep(10000);
    }
  }

  const sweepResult: SweepResult = {
    sweepId,
    fase,
    status: failed > 0 ? 'partial_failure' : 'completed',
    companiesProcessed: companies.length,
    companiesCompleted: completed,
    companiesFailed: failed,
    errors,
    durationMs: Date.now() - startTime,
  };

  console.log(`[phase ${fase}] Completed:`, sweepResult);
  return sweepResult;
}

// ============================================================================
// NUEVA FUNCIÓN: Procesa UNA SOLA empresa (modo single_company)
// ============================================================================
async function runSingleCompany(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string
): Promise<{
  sweepId: string;
  processed: boolean;
  ticker: string | null;
  success: boolean;
  error?: string;
  next_pending: boolean;
  remaining: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const sweepId = getCurrentSweepId();

  console.log(`[single] Starting single company processing for ${sweepId}`);

  // 1. Asegurar que el sweep está inicializado
  await initializeSweepIfNeeded(supabase, sweepId);

  // 2. Obtener UNA empresa
  //    - Prioridad absoluta: pending
  //    - Luego failed (ordenadas por retry_count asc) para evitar bloquear el sweep
  let company:
    | { id: string; ticker: string; issuer_name: string | null; fase: number | null; retry_count: number | null }
    | null = null;

  const { data: pendingCompanies, error: pendingError } = await supabase
    .from('sweep_progress')
    .select('id, ticker, issuer_name, fase, retry_count')
    .eq('sweep_id', sweepId)
    .eq('status', 'pending')
    .order('fase', { ascending: true })
    .order('ticker', { ascending: true })
    .limit(1);

  if (pendingError) {
    console.error('[single] Error fetching pending companies:', pendingError);
  }

  if (pendingCompanies && pendingCompanies.length > 0) {
    company = pendingCompanies[0];
  } else {
    const { data: failedCompanies, error: failedError } = await supabase
      .from('sweep_progress')
      .select('id, ticker, issuer_name, fase, retry_count')
      .eq('sweep_id', sweepId)
      .eq('status', 'failed')
      .order('retry_count', { ascending: true })
      .order('fase', { ascending: true })
      .order('ticker', { ascending: true })
      .limit(1);

    if (failedError) {
      console.error('[single] Error fetching failed companies:', failedError);
    }

    if (failedCompanies && failedCompanies.length > 0) {
      company = failedCompanies[0];
    }
  }

  if (!company) {
    // Contar cuántas quedan pendientes
    const { count: remaining } = await supabase
      .from('sweep_progress')
      .select('*', { count: 'exact', head: true })
      .eq('sweep_id', sweepId)
      .in('status', ['pending', 'failed']);

    console.log(`[single] No pending companies found. Remaining: ${remaining || 0}`);
    return {
      sweepId,
      processed: false,
      ticker: null,
      success: true,
      next_pending: false,
      remaining: remaining || 0,
      durationMs: Date.now() - startTime,
    };
  }

  console.log(`[single] Processing ${company.ticker} (fase ${company.fase}) [status: ${pendingCompanies && pendingCompanies.length > 0 ? 'pending' : 'failed'}]`);

  // 3. Procesar la empresa
  const result = await processCompany(
    supabase,
    company.id,
    company.ticker,
    company.issuer_name || company.ticker,
    supabaseUrl,
    serviceKey
  );

  // 4. Contar cuántas quedan pendientes
  const { count: remainingCount } = await supabase
    .from('sweep_progress')
    .select('*', { count: 'exact', head: true })
    .eq('sweep_id', sweepId)
    .in('status', ['pending', 'failed']);

  const remaining = remainingCount || 0;
  console.log(`[single] ${company.ticker} ${result.success ? 'completed' : 'failed'}. Remaining: ${remaining}`);

  return {
    sweepId,
    processed: true,
    ticker: company.ticker,
    success: result.success,
    error: result.error,
    next_pending: remaining > 0,
    remaining,
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// Obtener la SIGUIENTE fase pendiente (para modo automático sin especificar fase)
// ============================================================================
async function getNextPendingPhase(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('sweep_progress')
    .select('fase')
    .eq('sweep_id', sweepId)
    .in('status', ['pending', 'failed'])
    .order('fase', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0].fase;
}

// Resetea las empresas fallidas para reintentar
async function resetFailedCompanies(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('sweep_progress')
    .update({ status: 'pending', error_message: null, retry_count: 0 })
    .eq('sweep_id', sweepId)
    .eq('status', 'failed')
    .select('id');

  if (error) {
    console.error(`[orchestrator] Error resetting failed companies:`, error);
    return 0;
  }

  return data?.length || 0;
}

// ============================================================================
// SISTEMA INFALIBLE: Resetea empresas atascadas en "processing"
// Timeout reducido a 5 minutos para recuperación rápida
// ============================================================================
async function resetStuckProcessingCompanies(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  timeoutMinutes: number = 5  // REDUCIDO de 30 a 5 minutos para recuperación rápida
): Promise<{ count: number; tickers: string[] }> {
  const timeoutThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  
  // Primero obtener las empresas atascadas
  const { data: stuckCompanies, error: selectError } = await supabase
    .from('sweep_progress')
    .select('id, ticker')
    .eq('sweep_id', sweepId)
    .eq('status', 'processing')
    .lt('started_at', timeoutThreshold);

  if (selectError || !stuckCompanies || stuckCompanies.length === 0) {
    return { count: 0, tickers: [] };
  }

  const stuckIds = stuckCompanies.map(c => c.id);
  const stuckTickers = stuckCompanies.map(c => c.ticker);

  console.log(`[orchestrator] Found ${stuckCompanies.length} stuck companies: ${stuckTickers.join(', ')}`);

  // Resetearlas a pending
  const { error: updateError } = await supabase
    .from('sweep_progress')
    .update({ 
      status: 'pending', 
      started_at: null,
      error_message: `Timeout reset - stuck in processing for ${timeoutMinutes}+ minutes`,
    })
    .in('id', stuckIds);

  if (updateError) {
    console.error(`[orchestrator] Error resetting stuck companies:`, updateError);
    return { count: 0, tickers: [] };
  }

  console.log(`[orchestrator] Successfully reset ${stuckTickers.length} stuck companies`);
  return { count: stuckTickers.length, tickers: stuckTickers };
}

// ============================================================================
// SISTEMA DE HEALTH CHECKS - Detecta problemas automáticamente
// ============================================================================
interface HealthCheckResult {
  type: string;
  status: 'healthy' | 'warning' | 'critical';
  details: Record<string, unknown>;
}

async function performHealthChecks(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<HealthCheckResult[]> {
  const checks: HealthCheckResult[] = [];
  const now = new Date().toISOString();
  
  try {
    // Check 1: Empresas atascadas en processing > 5 min
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: stuckCount } = await supabase
      .from('sweep_progress')
      .select('*', { count: 'exact', head: true })
      .eq('sweep_id', sweepId)
      .eq('status', 'processing')
      .lt('started_at', fiveMinAgo);

    if (stuckCount && stuckCount > 3) {
      checks.push({ type: 'sweep_stuck', status: 'warning', details: { stuck: stuckCount } });
    } else if (stuckCount && stuckCount > 10) {
      checks.push({ type: 'sweep_stuck', status: 'critical', details: { stuck: stuckCount } });
    }

    // Check 2: Errores por modelo (últimas 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: errorRecords } = await supabase
      .from('rix_runs_v2')
      .select('02_model_name, model_errors')
      .not('model_errors', 'is', null)
      .gte('created_at', oneDayAgo);

    if (errorRecords && errorRecords.length > 0) {
      const errorsByModel: Record<string, number> = {};
      errorRecords.forEach(r => {
        const errors = r.model_errors as Record<string, unknown> | null;
        if (errors && Object.keys(errors).length > 0) {
          const model = r['02_model_name'] || 'Unknown';
          errorsByModel[model] = (errorsByModel[model] || 0) + 1;
        }
      });

      Object.entries(errorsByModel).forEach(([model, count]) => {
        if (count >= 10) {
          checks.push({ 
            type: 'model_errors', 
            status: count >= 20 ? 'critical' : 'warning', 
            details: { model, error_count: count } 
          });
        }
      });
    }

    // Check 3: Análisis pendientes (registros con respuesta pero sin score)
    // CRITICAL FIX: Check using model-specific columns
    const MODEL_COLS_HEALTH: Record<string, string> = {
      'ChatGPT': '20_res_gpt_bruto',
      'Perplexity': '21_res_perplex_bruto',
      'Gemini': '22_res_gemini_bruto',
      'Google Gemini': '22_res_gemini_bruto',
      'Deepseek': '23_res_deepseek_bruto',
      'Grok': 'respuesta_bruto_grok',
      'Qwen': 'respuesta_bruto_qwen',
    };
    
    // Get all records without score
    const { data: noScoreRecords } = await supabase
      .from('rix_runs_v2')
      .select('02_model_name, 20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, respuesta_bruto_grok, respuesta_bruto_qwen')
      .is('09_rix_score', null);
    
    // Count those that have their model-specific data
    let pendingAnalysis = 0;
    for (const record of (noScoreRecords || [])) {
      const modelName = record['02_model_name'] || '';
      const responseColumn = MODEL_COLS_HEALTH[modelName];
      if (responseColumn && record[responseColumn as keyof typeof record] !== null) {
        pendingAnalysis++;
      }
    }

    if (pendingAnalysis > 30) {
      checks.push({ 
        type: 'analysis_backlog', 
        status: pendingAnalysis > 50 ? 'critical' : 'warning', 
        details: { pending: pendingAnalysis } 
      });
      
      // Auto-trigger repair si hay muchos pendientes
      if (pendingAnalysis > 20) {
        const { data: existingTrigger } = await supabase
          .from('cron_triggers')
          .select('id')
          .eq('action', 'repair_analysis')
          .eq('status', 'pending')
          .limit(1);

        if (!existingTrigger || existingTrigger.length === 0) {
          console.log(`[health_check] Auto-triggering analysis repair for ${pendingAnalysis} pending records (model-aware count)`);
          await supabase.from('cron_triggers').insert({
            action: 'repair_analysis',
            params: { batch_size: 5, auto_triggered: true }
          });
        }
      }
    }

    // Guardar checks en la tabla de health_checks
    for (const check of checks) {
      await supabase.from('pipeline_health_checks').insert({
        check_type: check.type,
        sweep_id: sweepId,
        status: check.status,
        details: check.details,
        checked_at: now
      });
    }

    console.log(`[health_check] Performed ${checks.length} health checks for ${sweepId}`);
  } catch (e) {
    console.error('[health_check] Error performing health checks:', e);
  }

  return checks;
}

// ============================================================================
// PROCESO DE CRON TRIGGERS (server-to-server, sin bloqueo de extensiones)
// ============================================================================
interface CronTrigger {
  id: string;
  action: string;
  params: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

async function processCronTriggers(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string
): Promise<Array<{ id: string; action: string; success: boolean; result?: unknown; error?: string }>> {
  const results: Array<{ id: string; action: string; success: boolean; result?: unknown; error?: string }> = [];

  // --------------------------------------------------------------------------
  // Zombie cleanup: si una ejecución se corta (timeout/shutdown) puede dejar
  // triggers en "processing" para siempre. Los reseteamos a "pending".
  // CRITICAL FIX: Uso correcto de PostgREST filter en lugar de .or() con interpolación
  // --------------------------------------------------------------------------
  try {
    const staleBefore = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    
    // PASO 1: Limpiar por created_at
    const { data: resetByCreated, error: err1 } = await supabase
      .from('cron_triggers')
      .update({ status: 'pending', processed_at: null })
      .eq('status', 'processing')
      .lt('created_at', staleBefore)
      .select('id, action');

    // PASO 2: Limpiar por processed_at 
    const { data: resetByProcessed, error: err2 } = await supabase
      .from('cron_triggers')
      .update({ status: 'pending', processed_at: null })
      .eq('status', 'processing')
      .lt('processed_at', staleBefore)
      .select('id, action');

    const resetRows = [
      ...(resetByCreated || []),
      ...(resetByProcessed || [])
    ].filter((r, i, a) => a.findIndex(x => x.id === r.id) === i); // Dedupe

    if (err1 || err2) {
      console.error('[cron_triggers] Zombie cleanup partial error:', { err1, err2 });
    }
    
    if (resetRows.length > 0) {
      console.warn(`[cron_triggers] Zombie cleanup: reset ${resetRows.length} triggers stuck in processing: ${resetRows.map(r => r.action).join(', ')}`);
    }

    // ADDITIONAL ZOMBIE CLEANUP: repair_search and repair_invalid_responses stuck >10 min
    // These actions can get stuck due to API timeouts; reset them to pending for retry
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    for (const zombieAction of ['repair_search', 'repair_invalid_responses', 'auto_populate_vectors', 'vector_store_continue', 'auto_generate_newsroom', 'auto_sanitize']) {
      const { data: zombieRows, error: zombieErr } = await supabase
        .from('cron_triggers')
        .update({ status: 'pending', processed_at: null })
        .eq('status', 'processing')
        .eq('action', zombieAction)
        .lt('created_at', tenMinAgo)
        .select('id');

      if (!zombieErr && zombieRows && zombieRows.length > 0) {
        console.warn(`[cron_triggers] Zombie cleanup: reset ${zombieRows.length} stuck ${zombieAction} triggers`);
      }
    }
  } catch (e) {
    console.error('[cron_triggers] Zombie cleanup exception:', e);
  }
  
  // Obtener triggers pendientes
  // CRITICAL FIX: evitar starvation (vector store re-queue infinito)
  // Trayendo un pequeño pool y priorizando en memoria.
  const { data: triggerPool, error } = await supabase
    .from('cron_triggers')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(15);

  if (error || !triggerPool || triggerPool.length === 0) {
    return results;
  }

  const PRIORITY: Record<string, number> = {
    // Highest priority: single company processing (ad-hoc additions)
    process_single_company: 5,

    // Analysis pipeline first
    repair_search: 10,
    repair_invalid_responses: 15,
    repair_analysis: 20,
    auto_sanitize: 30,

    // Vector store (background)
    vector_store_continue: 40,
    auto_populate_vectors: 50,

    // Newsroom generation (after vector store complete)
    auto_generate_newsroom: 55,

    // Corporate scraping (lower priority, runs after RIX sweep)
    corporate_scrape_continue: 60,
    corporate_scrape_retry: 61,

    // Self-chaining last (it calls the orchestrator again)
    auto_continue: 90,
  };

  const triggers = [...(triggerPool as CronTrigger[])].sort((a, b) => {
    const pa = PRIORITY[a.action] ?? 999;
    const pb = PRIORITY[b.action] ?? 999;
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }).slice(0, 5);

  console.log(`[cron_triggers] Found ${triggerPool.length} pending triggers; processing ${triggers.length} (prioritized)`);

  for (const trigger of triggers as CronTrigger[]) {
    // Marcar como processing
    await supabase
      .from('cron_triggers')
      .update({ status: 'processing' })
      .eq('id', trigger.id);

    try {
      if (trigger.action === 'repair_analysis') {
        console.log(`[cron_triggers] Processing repair_analysis trigger ${trigger.id}`);
        
        // Llamada server-to-server a rix-analyze-v2 (sin extensiones bloqueando)
        const response = await fetch(`${supabaseUrl}/functions/v1/rix-analyze-v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            action: 'reprocess_pending', 
            batch_size: (trigger.params as any)?.batch_size || 5 
          }),
          // Evita dejar el trigger en "processing" por timeout de la plataforma
          // (si el análisis GPT-5 se alarga demasiado).
          signal: AbortSignal.timeout(120_000),
        });

        const responseText = await response.text();
        let data: { remaining?: number; processed?: number; errors?: number; skipped?: number } = {};
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { remaining: 0 };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // CRITICAL FIX: AUTO-REQUEUE si quedan registros por procesar
        // Esto hace que repair_analysis se comporte igual que repair_search
        // ═══════════════════════════════════════════════════════════════════
        const remaining = data.remaining ?? 0;
        
        if (remaining > 0) {
          // Todavía quedan registros por analizar → volver a pending para el siguiente ciclo
          console.log(`[cron_triggers] repair_analysis: ${data.processed || 0} processed, ${remaining} remaining → re-queueing`);
          
          await supabase
            .from('cron_triggers')
            .update({ 
              status: 'pending',  // <-- CLAVE: vuelve a pending
              processed_at: null,
              result: {
                last_batch: {
                  processed: data.processed || 0,
                  errors: data.errors || 0,
                  skipped: data.skipped || 0,
                  timestamp: new Date().toISOString(),
                },
                remaining,
                remaining_estimate: remaining,
              }
            })
            .eq('id', trigger.id);
          
          results.push({ id: trigger.id, action: trigger.action, success: true, result: { ...data, requeued: true } });
        } else {
          // No quedan registros → marcar como completado
          console.log(`[cron_triggers] repair_analysis: all done! (${data.processed || 0} processed, 0 remaining)`);
          
          await supabase
            .from('cron_triggers')
            .update({ 
              status: 'completed',
              processed_at: new Date().toISOString(),
              result: data as Record<string, unknown>
            })
            .eq('id', trigger.id);

          results.push({ id: trigger.id, action: trigger.action, success: true, result: data });
        }
        
        console.log(`[cron_triggers] Trigger ${trigger.id} handled (remaining: ${remaining})`);

      } else if (trigger.action === 'auto_populate_vectors') {
        // ============================================================
        // AUTO-POPULATE VECTOR STORE (server-to-server)
        // Evita bloqueos por extensiones o timeouts del navegador.
        // ============================================================
        console.log(`[cron_triggers] Processing auto_populate_vectors trigger ${trigger.id}`);

        const triggerParams = trigger.params as {
          source_filter?: 'all' | 'rix_v1' | 'rix_v2' | 'news';
          include_raw?: boolean;
        } | null;

        const sourceFilter = triggerParams?.source_filter || 'all';
        const includeRawResponses = triggerParams?.include_raw ?? true;

        const response = await fetch(`${supabaseUrl}/functions/v1/populate-vector-store`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ includeRawResponses, sourceFilter }),
        });

        const responseText = await response.text();
        let data: any = {};
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        const remainingRix = Number(data?.remaining ?? 0);
        const remainingNews = Number(data?.remaining_news ?? 0);
        const remainingTotal = Math.max(0, remainingRix + remainingNews);

        if (remainingTotal > 0) {
          console.log(`[cron_triggers] auto_populate_vectors: remaining_total=${remainingTotal} → re-queueing`);
          await supabase
            .from('cron_triggers')
            .update({
              status: 'pending',
              processed_at: null,
              result: {
                ...data,
                remaining_total: remainingTotal,
                last_batch_at: new Date().toISOString(),
              },
            })
            .eq('id', trigger.id);

          results.push({ id: trigger.id, action: trigger.action, success: true, result: { ...data, requeued: true, remaining_total: remainingTotal } });
        } else {
          console.log('[cron_triggers] auto_populate_vectors: all done (0 remaining_total)');
          await supabase
            .from('cron_triggers')
            .update({
              status: 'completed',
              processed_at: new Date().toISOString(),
              result: { ...data, remaining_total: 0 },
            })
            .eq('id', trigger.id);

          results.push({ id: trigger.id, action: trigger.action, success: true, result: { ...data, remaining_total: 0 } });

          // ═══════════════════════════════════════════════════════════════════════
          // ENCADENAMIENTO AUTOMÁTICO: Disparar auto_generate_newsroom
          // Cuando el Vector Store está 100% indexado, generamos el Newsroom automáticamente.
          // ═══════════════════════════════════════════════════════════════════════
          const { data: existingNewsroomTrigger } = await supabase
            .from('cron_triggers')
            .select('id')
            .eq('action', 'auto_generate_newsroom')
            .in('status', ['pending', 'processing'])
            .limit(1)
            .maybeSingle();

          if (!existingNewsroomTrigger) {
            await supabase.from('cron_triggers').insert({
              action: 'auto_generate_newsroom',
              params: { 
                triggered_by: 'auto_populate_vectors_chain',
                auto_chain: true,
                source_filter: sourceFilter
              },
              status: 'pending',
            });
            console.log('[auto_populate_vectors] Vector Store complete! Inserted auto_generate_newsroom trigger for automatic newsroom generation.');
          } else {
            console.log(`[auto_populate_vectors] Vector Store complete but auto_generate_newsroom already pending (${existingNewsroomTrigger.id}), skipping insertion.`);
          }
        }

      } else if (trigger.action === 'vector_store_continue') {
        // ============================================================
        // VECTOR_STORE_CONTINUE: Auto-continuation for vector store indexing
        // Triggered by populate-vector-store when work remains.
        // Ensures indexing completes even when browser is closed.
        // ============================================================
        console.log(`[cron_triggers] Processing vector_store_continue trigger ${trigger.id}`);

        const triggerParams = trigger.params as {
          sourceFilter?: 'all' | 'rix_v1' | 'rix_v2' | 'news';
          includeRawResponses?: boolean;
          remaining?: number;
          batch_number?: number;
        } | null;

        const sourceFilter = triggerParams?.sourceFilter || 'all';
        const includeRawResponses = triggerParams?.includeRawResponses ?? true;
        const batchNumber = triggerParams?.batch_number || 0;

        console.log(`[vector_store_continue] Batch #${batchNumber}, filter: ${sourceFilter}, remaining: ${triggerParams?.remaining}`);

        const response = await fetch(`${supabaseUrl}/functions/v1/populate-vector-store`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            includeRawResponses, 
            sourceFilter,
            mode: 'continuation',
            batch_number: batchNumber
          }),
        });

        const responseText = await response.text();
        let data: any = {};
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        const remainingRix = Number(data?.remaining ?? 0);
        const remainingNews = Number(data?.remaining_news ?? 0);
        const remainingTotal = Math.max(0, remainingRix + remainingNews);

        // Mark this trigger as completed - the populate-vector-store function
        // will insert a new trigger if more work remains
        await supabase
          .from('cron_triggers')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: {
              ...data,
              batch_number: batchNumber,
              remaining_total: remainingTotal,
            },
          })
          .eq('id', trigger.id);

        results.push({ 
          id: trigger.id, 
          action: trigger.action, 
          success: true, 
          result: { ...data, batch_number: batchNumber, remaining_total: remainingTotal } 
        });

        console.log(`[vector_store_continue] Batch #${batchNumber} completed. Remaining: ${remainingTotal}. New trigger will be created by populate-vector-store if needed.`);

      } else if (trigger.action === 'auto_sanitize') {
        // ============================================================
        // AUTO-SANITIZE: Ejecuta sanitización cuando sweep está 100% completo
        // ============================================================
        console.log(`[cron_triggers] Processing auto_sanitize trigger ${trigger.id}`);
        
        const triggerParams = trigger.params as { sweep_id?: string; auto_repair?: boolean } | null;
        
        const response = await fetch(`${supabaseUrl}/functions/v1/rix-quality-watchdog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            action: 'sanitize',
            auto_repair: triggerParams?.auto_repair ?? true  // Auto-repair por defecto
          }),
        });

        const responseText = await response.text();
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        // Marcar como completado
        await supabase
          .from('cron_triggers')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: data as Record<string, unknown>
          })
          .eq('id', trigger.id);

        results.push({ id: trigger.id, action: trigger.action, success: true, result: data });
        console.log(`[cron_triggers] auto_sanitize trigger ${trigger.id} completed successfully`);

        // ═══════════════════════════════════════════════════════════════════════
        // ENCADENAMIENTO AUTOMÁTICO: Disparar auto_populate_vectors si el sweep está limpio
        // Esto actualiza el Vector Store inmediatamente tras completar el análisis,
        // sin esperar al CRON de las 23:00 UTC (que actúa como red de seguridad).
        // ═══════════════════════════════════════════════════════════════════════
        const sanitizeResult = data as { missing?: number; invalid?: number; repaired?: number } | null;
        const sweepIsClean = 
          (sanitizeResult?.missing ?? 0) === 0 && 
          (sanitizeResult?.invalid ?? 0) === 0;

        if (sweepIsClean) {
          // Verificar que no existe ya un trigger pendiente/processing para evitar duplicados
          const { data: existingVectorTrigger } = await supabase
            .from('cron_triggers')
            .select('id')
            .eq('action', 'auto_populate_vectors')
            .in('status', ['pending', 'processing'])
            .limit(1)
            .maybeSingle();

          if (!existingVectorTrigger) {
            await supabase.from('cron_triggers').insert({
              action: 'auto_populate_vectors',
              params: { 
                sweep_id: triggerParams?.sweep_id, 
                triggered_by: 'auto_sanitize_chain',
                auto_chain: true
              },
              status: 'pending',
            });
            console.log(`[auto_sanitize] Sweep clean (0 missing, 0 invalid)! Inserted auto_populate_vectors trigger for immediate Vector Store update.`);
          } else {
            console.log(`[auto_sanitize] Sweep clean but auto_populate_vectors already pending (${existingVectorTrigger.id}), skipping insertion.`);
          }
        } else {
          console.log(`[auto_sanitize] Sweep not fully clean (missing: ${sanitizeResult?.missing ?? '?'}, invalid: ${sanitizeResult?.invalid ?? '?'}), not chaining vector store update.`);
        }

      } else if (trigger.action === 'auto_generate_newsroom') {
        // ============================================================
        // AUTO_GENERATE_NEWSROOM: Genera el newsroom automáticamente
        // Se dispara después de que el Vector Store esté 100% indexado.
        // Usa Gemini 3 Pro para generar contenido periodístico premium.
        // ============================================================
        console.log(`[cron_triggers] Processing auto_generate_newsroom trigger ${trigger.id}`);
        
        const response = await fetch(`${supabaseUrl}/functions/v1/generate-news-story`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            trigger: 'cron',
            saveToDb: true 
          }),
        });

        const responseText = await response.text();
        let data: any = {};
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        await supabase
          .from('cron_triggers')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: data,
          })
          .eq('id', trigger.id);

        results.push({ 
          id: trigger.id, 
          action: trigger.action, 
          success: true, 
          result: data 
        });
        console.log('[auto_generate_newsroom] Newsroom generation completed successfully');

      } else if (trigger.action === 'process_single_company') {
        // ============================================================
        // PROCESS_SINGLE_COMPANY: Procesa una empresa individual ad-hoc
        // Usado para añadir nuevas empresas al barrido sin esperar al ciclo completo.
        // Máxima prioridad (5) para respuesta inmediata.
        // ============================================================
        const params = trigger.params as { ticker: string; issuer_name: string; sweep_id?: string } | null;
        
        if (!params?.ticker || !params?.issuer_name) {
          throw new Error('process_single_company requires ticker and issuer_name in params');
        }
        
        console.log(`[cron_triggers] Processing single company: ${params.ticker} (${params.issuer_name})`);
        
        // Llamar directamente a rix-search-v2 con el ticker
        const response = await fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            ticker: params.ticker, 
            issuer_name: params.issuer_name 
          }),
          signal: AbortSignal.timeout(180_000), // 3 min timeout para una empresa completa
        });

        const responseText = await response.text();
        let data: any = {};
        try { 
          data = JSON.parse(responseText); 
        } catch { 
          data = { raw: responseText }; 
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        // Actualizar sweep_progress si existe
        if (params.sweep_id) {
          await supabase
            .from('sweep_progress')
            .update({ 
              status: 'completed', 
              completed_at: new Date().toISOString(),
              models_completed: data.results?.length || 6
            })
            .eq('sweep_id', params.sweep_id)
            .eq('ticker', params.ticker);
        }

        await supabase
          .from('cron_triggers')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: data,
          })
          .eq('id', trigger.id);

        results.push({ id: trigger.id, action: trigger.action, success: true, result: data });
        console.log(`[process_single_company] ${params.ticker} processed successfully with ${data.results?.length || 0} models`);

      } else if (trigger.action === 'repair_search') {
        // ============================================================
        // REPAIR_SEARCH: Re-ejecuta búsqueda para registros sin datos
        // CRITICAL FIX: Usa columnas específicas por modelo
        // ============================================================
        console.log(`[cron_triggers] Processing repair_search trigger ${trigger.id}`);
        
        const triggerParams = trigger.params as { sweep_id?: string; batch_size?: number } | null;
        const batchSize = triggerParams?.batch_size || 20;

        // IMPORTANT: aunque batch_size sea alto, limitamos el trabajo por invocación
        // para evitar timeouts que dejan el trigger atascado en "processing".
        // UPDATED: Aumentado de 3 a 10 para mayor throughput
        const hardTimeBudgetMs = 150_000; // <180s de límite típico
        const startedAt = Date.now();
        const maxPerInvocation = Math.max(1, Math.min(batchSize, 10));
        
        // Find the most recent week with data (instead of calculating dates manually)
        const { data: latestWeek } = await supabase
          .from('rix_runs_v2')
          .select('06_period_from')
          .order('06_period_from', { ascending: false })
          .limit(1)
          .single();
        
        const periodFromStr = latestWeek?.['06_period_from'] || (() => {
          // Fallback: calculate manually if no data exists
          const now = new Date();
          const dayOfWeek = now.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const periodFrom = new Date(now);
          periodFrom.setDate(now.getDate() + mondayOffset);
          return periodFrom.toISOString().split('T')[0];
        })();
        
        console.log(`[cron_triggers] repair_search targeting week: ${periodFromStr}`);
        
        // Model to column mapping
        const MODEL_COLUMNS_REPAIR: Record<string, string> = {
          'ChatGPT': '20_res_gpt_bruto',
          'Perplexity': '21_res_perplex_bruto',
          'Gemini': '22_res_gemini_bruto',
          'Google Gemini': '22_res_gemini_bruto',
          'Deepseek': '23_res_deepseek_bruto',
          'Grok': 'respuesta_bruto_grok',
          'Qwen': 'respuesta_bruto_qwen',
        };
        
        // Get ALL records for this period
        const { data: allPeriodRecords } = await supabase
          .from('rix_runs_v2')
          .select('id, 05_ticker, 02_model_name, 20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, respuesta_bruto_grok, respuesta_bruto_qwen')
          .eq('06_period_from', periodFromStr);
        
        // Filter records where MODEL-SPECIFIC column is null
        const missingRecords: Array<{id: string, ticker: string, model: string}> = [];
        for (const record of (allPeriodRecords || [])) {
          const modelName = record['02_model_name'] || '';
          const responseColumn = MODEL_COLUMNS_REPAIR[modelName];
          const raw = responseColumn ? record[responseColumn as keyof typeof record] : null;
          const isMissing = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim().length === 0);
          if (responseColumn && isMissing) {
            missingRecords.push({
              id: record.id,
              ticker: record['05_ticker'] || '',
              model: modelName,
            });
          }
        }
        
        console.log(`[cron_triggers] Found ${missingRecords.length} records with missing data (model-aware)`);

        // Si no hay nada que reparar, completar el trigger y salir.
        if (missingRecords.length === 0) {
          await supabase
            .from('cron_triggers')
            .update({
              status: 'completed',
              processed_at: new Date().toISOString(),
              result: { processed: 0, remaining: 0, results: [] }
            })
            .eq('id', trigger.id);

          results.push({ id: trigger.id, action: trigger.action, success: true, result: { processed: 0, remaining: 0, results: [] } });
          console.log(`[cron_triggers] repair_search trigger ${trigger.id} completed: nothing to repair`);
          continue;
        }
        
        // Take batch and process
        const recordsToProcess = missingRecords.slice(0, maxPerInvocation);
        const repairResults: Array<{ ticker: string; model: string; success: boolean; error?: string }> = [];
        
        for (const record of recordsToProcess) {
          if (Date.now() - startedAt > hardTimeBudgetMs) {
            console.warn(`[cron_triggers] repair_search time budget reached; pausing after ${repairResults.length} records`);
            break;
          }
          try {
            // Re-execute search for this specific model
            const response = await fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ 
                ticker: record.ticker,
                single_model: record.model,
                repair_mode: true,
              }),
              // Evita quedarse colgado en un modelo/API y perder el trigger por timeout
              signal: AbortSignal.timeout(120_000),
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`HTTP ${response.status}: ${errText}`);
            }
            
            repairResults.push({ 
              ticker: record.ticker, 
              model: record.model, 
              success: response.ok 
            });

            // Persistencia incremental (por si hay timeout a mitad de lote)
            await supabase
              .from('cron_triggers')
              .update({
                result: {
                  processed: repairResults.length,
                  remaining_estimate: Math.max(0, missingRecords.length - repairResults.length),
                  last: { ticker: record.ticker, model: record.model },
                  last_batch: repairResults.slice(-5),
                }
              })
              .eq('id', trigger.id);
          } catch (e: unknown) {
            repairResults.push({ 
              ticker: record.ticker, 
              model: record.model, 
              success: false, 
              error: e instanceof Error ? e.message : String(e)
            });

            await supabase
              .from('cron_triggers')
              .update({
                result: {
                  processed: repairResults.length,
                  remaining_estimate: Math.max(0, missingRecords.length - repairResults.length),
                  last: { ticker: record.ticker, model: record.model },
                  last_error: e instanceof Error ? e.message : String(e),
                  last_batch: repairResults.slice(-5),
                }
              })
              .eq('id', trigger.id);
          }
        }

        const remainingAfter = Math.max(0, missingRecords.length - repairResults.length);

        // Si queda trabajo, re-encolar el MISMO trigger (status=pending) en vez de marcarlo completed.
        // Esto evita que el sistema "se pare" por triggers atascados en processing.
        const nextStatus = remainingAfter > 0 ? 'pending' : 'completed';

        await supabase
          .from('cron_triggers')
          .update({
            status: nextStatus,
            processed_at: remainingAfter > 0 ? null : new Date().toISOString(),
            result: {
              processed: repairResults.length,
              remaining: remainingAfter,
              max_per_invocation: maxPerInvocation,
              results: repairResults,
            }
          })
          .eq('id', trigger.id);

        results.push({
          id: trigger.id,
          action: trigger.action,
          success: true,
          result: { processed: repairResults.length, remaining: remainingAfter, results: repairResults },
        });

        console.log(
          `[cron_triggers] repair_search trigger ${trigger.id} ${nextStatus}: processed=${repairResults.length}, remaining=${remainingAfter}`
        );

      } else if (trigger.action === 'corporate_scrape_continue') {
        // ============================================================
        // CORPORATE_SCRAPE_CONTINUE: Procesa N empresas del barrido corporativo
        // Se encadena automáticamente para completar el scraping semanal
        // ============================================================
        console.log(`[cron_triggers] Processing corporate_scrape_continue trigger ${trigger.id}`);
        
        const triggerParams = trigger.params as { sweep_id?: string; pending?: number } | null;
        
        const response = await fetch(`${supabaseUrl}/functions/v1/corporate-scrape-orchestrator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            mode: 'continue_cascade',
            sweep_id: triggerParams?.sweep_id,
            batch_size: 5,  // Procesar 5 empresas por invocación
            trigger: 'cron_triggers'
          }),
          signal: AbortSignal.timeout(120_000),
        });

        const responseText = await response.text();
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        // El corporate-scrape-orchestrator ya inserta el siguiente trigger si es necesario
        await supabase
          .from('cron_triggers')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: data as Record<string, unknown>
          })
          .eq('id', trigger.id);

        results.push({ id: trigger.id, action: trigger.action, success: true, result: data });
        console.log(`[cron_triggers] corporate_scrape_continue completed`);

      } else if (trigger.action === 'corporate_scrape_retry') {
        // ============================================================
        // CORPORATE_SCRAPE_RETRY: Reintenta errores temporales del scraping
        // Resetea failed_retryable a pending e invoca el orquestador
        // ============================================================
        console.log(`[cron_triggers] Processing corporate_scrape_retry trigger ${trigger.id}`);
        
        const triggerParams = trigger.params as { sweep_id?: string; retryable_count?: number } | null;
        const sweepId = triggerParams?.sweep_id || (() => {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          return `corp-${year}-${month}`;
        })();
        
        const RETRYABLE_TYPES = ['error_timeout', 'error_rate_limit', 'error_website_down', 'error_parsing'];
        
        // Resetear errores reintentables a pending (incrementando retry_count via RPC no disponible, lo hacemos manualmente)
        const { data: failedRecords } = await supabase
          .from('corporate_scrape_progress')
          .select('id, retry_count')
          .eq('sweep_id', sweepId)
          .eq('status', 'failed')
          .in('result_type', RETRYABLE_TYPES)
          .lt('retry_count', 3);
        
        if (failedRecords && failedRecords.length > 0) {
          for (const record of failedRecords) {
            await supabase
              .from('corporate_scrape_progress')
              .update({ 
                status: 'pending', 
                retry_count: (record.retry_count || 0) + 1,
                error_message: null
              })
              .eq('id', record.id);
          }
          console.log(`[corporate_scrape_retry] Reset ${failedRecords.length} retryable errors to pending`);
        }

        // Procesar el batch
        const response = await fetch(`${supabaseUrl}/functions/v1/corporate-scrape-orchestrator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            mode: 'continue_cascade',
            sweep_id: sweepId,
            batch_size: 3,  // Batch más pequeño para reintentos
            trigger: 'retry'
          }),
          signal: AbortSignal.timeout(120_000),
        });

        const responseText = await response.text();
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { raw: responseText };
        }

        await supabase
          .from('cron_triggers')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: { reset_count: failedRecords?.length || 0, ...(data as Record<string, unknown>) }
          })
          .eq('id', trigger.id);

        results.push({ id: trigger.id, action: trigger.action, success: response.ok, result: data });
        console.log(`[cron_triggers] corporate_scrape_retry completed (reset ${failedRecords?.length || 0} records)`);

      } else if (trigger.action === 'auto_continue') {
        // ============================================================
        // AUTO_CONTINUE: Re-invoca al orquestador para mantener el sistema vivo
        // Este trigger se inserta automáticamente cuando hay trabajo pendiente
        // y garantiza que el sistema nunca se detenga aunque la función cierre.
        // ============================================================
        console.log(`[cron_triggers] Processing auto_continue trigger ${trigger.id}`);
        
        const triggerParams = trigger.params as { sweep_id?: string; phase?: string } | null;
        
        // Llamar al orquestador en modo auto_recovery para procesar trabajo pendiente
        const response = await fetch(`${supabaseUrl}/functions/v1/rix-batch-orchestrator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            trigger: 'auto_recovery',
            from_auto_continue: true,
            sweep_id: triggerParams?.sweep_id
          }),
        });

        const responseText = await response.text();
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { raw: responseText };
        }

        // Siempre marcar como completed (el orquestador insertará otro si es necesario)
        await supabase
          .from('cron_triggers')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: data as Record<string, unknown>
          })
          .eq('id', trigger.id);

        results.push({ id: trigger.id, action: trigger.action, success: response.ok, result: data });
        console.log(`[cron_triggers] auto_continue trigger ${trigger.id} completed (status: ${response.status})`);

      } else if (trigger.action === 'repair_invalid_responses') {
        // ============================================================
        // REPAIR_INVALID_RESPONSES: Repara respuestas inválidas (refusals)
        // Detectadas por auto_sanitize, llamamos al watchdog en modo repair.
        // ============================================================
        console.log(`[cron_triggers] Processing repair_invalid_responses trigger ${trigger.id}`);
        
        const triggerParams = trigger.params as { sweep_id?: string; max_repairs?: number } | null;
        
        const response = await fetch(`${supabaseUrl}/functions/v1/rix-quality-watchdog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            action: 'repair',
            max_repairs: triggerParams?.max_repairs || 10,
          }),
          signal: AbortSignal.timeout(150_000),
        });

        const responseText = await response.text();
        let data: any = {};
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        const repaired = data.repaired ?? 0;
        const pendingRepairs = data.pending ?? data.remaining ?? 0;

        if (pendingRepairs > 0) {
          // Still work remaining → re-queue for next cycle
          console.log(`[cron_triggers] repair_invalid_responses: ${repaired} repaired, ${pendingRepairs} remaining → re-queueing`);
          
          await supabase
            .from('cron_triggers')
            .update({ 
              status: 'pending',
              processed_at: null,
              result: {
                last_batch: { repaired, pending: pendingRepairs, timestamp: new Date().toISOString() },
              }
            })
            .eq('id', trigger.id);
          
          results.push({ id: trigger.id, action: trigger.action, success: true, result: { ...data, requeued: true } });
        } else {
          // All clean → mark completed, chain to vector store
          console.log(`[cron_triggers] repair_invalid_responses: all done (${repaired} repaired, 0 remaining)`);
          
          await supabase
            .from('cron_triggers')
            .update({ 
              status: 'completed',
              processed_at: new Date().toISOString(),
              result: data,
            })
            .eq('id', trigger.id);

          results.push({ id: trigger.id, action: trigger.action, success: true, result: data });

          // Chain: trigger auto_sanitize again to verify everything is clean
          // This will then chain to auto_populate_vectors if sweep is clean
          const { data: existingSanitize } = await supabase
            .from('cron_triggers')
            .select('id')
            .eq('action', 'auto_sanitize')
            .in('status', ['pending', 'processing'])
            .limit(1)
            .maybeSingle();

          if (!existingSanitize) {
            await supabase.from('cron_triggers').insert({
              action: 'auto_sanitize',
              params: { 
                triggered_by: 'repair_invalid_responses_chain',
                auto_chain: true,
                sweep_id: triggerParams?.sweep_id,
              },
              status: 'pending',
            });
            console.log('[repair_invalid_responses] All repairs done! Re-triggering auto_sanitize to verify cleanliness.');
          }
        }

      } else {
        // Acción desconocida
        await supabase
          .from('cron_triggers')
          .update({ 
            status: 'failed',
            processed_at: new Date().toISOString(),
            result: { error: `Unknown action: ${trigger.action}` }
          })
          .eq('id', trigger.id);
        
        results.push({ id: trigger.id, action: trigger.action, success: false, error: `Unknown action: ${trigger.action}` });
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`[cron_triggers] Error processing trigger ${trigger.id}:`, errorMsg);

      // CRITICAL FIX: si se aborta por timeout, re-encolar en vez de marcar failed
      // (evita bloqueos largos por "stuck_in_processing").
      const looksLikeTimeout =
        errorMsg.toLowerCase().includes('abort') ||
        errorMsg.toLowerCase().includes('timeout') ||
        errorMsg.toLowerCase().includes('timed out') ||
        errorMsg.toLowerCase().includes('deadline');

      if (trigger.action === 'repair_analysis' && looksLikeTimeout) {
        await supabase
          .from('cron_triggers')
          .update({
            status: 'pending',
            processed_at: null,
            result: {
              error: errorMsg,
              reset_reason: 'timeout_requeued',
              last_error_at: new Date().toISOString(),
            },
          })
          .eq('id', trigger.id);

        results.push({ id: trigger.id, action: trigger.action, success: true, result: { requeued: true, reason: 'timeout' } });
      } else {
        await supabase
          .from('cron_triggers')
          .update({ 
            status: 'failed',
            processed_at: new Date().toISOString(),
            result: { error: errorMsg }
          })
          .eq('id', trigger.id);

        results.push({ id: trigger.id, action: trigger.action, success: false, error: errorMsg });
      }
    }
  }

  return results;
}

// ============================================================================
// DENO SERVER
// ============================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

let requestBody: { 
      trigger?: string;
      fase?: number;
      test_mode?: boolean;
      reset_failed?: boolean;
      get_status?: boolean;
      init_only?: boolean;
      single_company?: boolean;
      reset_stuck?: boolean;
      reset_stuck_timeout?: number;
      mode?: string;
      process_triggers_only?: boolean;
      process_one?: boolean;
      workers?: number;
      max_per_worker?: number;
      relaunch_count?: number;
      sweep_id?: string; // HOTFIX: Allow explicit sweep_id from request
    } = {};
    
    try {
      requestBody = await req.json();
    } catch {
      // Empty body is fine
    }

const { 
      trigger = 'manual', 
      fase,
      test_mode = false,
      reset_failed = false,
      get_status = false,
      init_only = false,
      single_company = false,
      reset_stuck = false,
      reset_stuck_timeout = 0,
      mode,
      process_triggers_only = false,
      process_one = false,
      workers = 4,
      max_per_worker = 50,
      relaunch_count = 0,
      sweep_id: explicitSweepId,
    } = requestBody;

    // CRITICAL FIX: Determinar sweepId con nueva prioridad:
    // 1. sweep_id explícito en request (forzar sweep específico)
    // 2. sweep_progress con trabajo pendiente (realidad operativa)
    // 3. calendario (solo si no hay trabajo pendiente)
    const isWatchdogMode = trigger === 'watchdog' || trigger === 'auto_recovery';
    const sweepId = isWatchdogMode || explicitSweepId
      ? await getActiveSweepId(supabase, explicitSweepId)
      : getCurrentSweepId();
    console.log(`[orchestrator] Invoked - trigger: ${trigger}, fase: ${fase || 'auto'}, sweepId: ${sweepId}, mode: ${mode || 'default'}${explicitSweepId ? ' (FORCED)' : isWatchdogMode ? ' (from sweep_progress)' : ' (calendar)'}`);

    // ========== MODO CONCURRENT_STABLE: Procesa N empresas en paralelo ESPERANDO resultados ==========
    // NUEVO: Reemplaza parallel_batch - Este modo SÍ espera a que todas las empresas terminen
    // antes de responder, evitando zombies por abandono de procesamiento.
    if (mode === 'concurrent_stable' || mode === 'parallel_batch') {
      const CONCURRENT_COMPANIES = Math.min(workers, 4);  // Máximo 4 empresas en paralelo por seguridad
      
      console.log(`[concurrent_stable] Starting with ${CONCURRENT_COMPANIES} concurrent companies...`);
      
      // 1. Inicializar sweep si no existe
      await initializeSweepIfNeeded(supabase, sweepId);
      
      // 2. Limpiar zombies (>5 min stuck) antes de empezar
      const stuckReset = await resetStuckProcessingCompanies(supabase, sweepId, 5);
      if (stuckReset.count > 0) {
        console.log(`[concurrent_stable] Auto-reset ${stuckReset.count} zombies: ${stuckReset.tickers.join(', ')}`);
      }
      
      // 3. Claim N empresas de forma atómica (una por una para evitar race conditions)
      const claimedCompanies: Array<{id: string; ticker: string; issuer_name: string | null}> = [];
      
      for (let i = 0; i < CONCURRENT_COMPANIES; i++) {
        const { data: claimed, error: claimError } = await supabase.rpc('claim_next_sweep_company', {
          p_sweep_id: sweepId,
          p_worker_id: i
        });
        
        if (claimError) {
          console.error(`[concurrent_stable] Claim ${i} error:`, claimError);
          continue;
        }
        
        if (claimed && claimed.length > 0) {
          claimedCompanies.push(claimed[0]);
        }
      }
      
      // 4. Si no hay empresas, el barrido está completo
      if (claimedCompanies.length === 0) {
        // Contar estadísticas finales
        const { count: completedCount } = await supabase
          .from('sweep_progress')
          .select('*', { count: 'exact', head: true })
          .eq('sweep_id', sweepId)
          .eq('status', 'completed');
          
        const { count: totalCount } = await supabase
          .from('sweep_progress')
          .select('*', { count: 'exact', head: true })
          .eq('sweep_id', sweepId);
        
        console.log(`[concurrent_stable] No pending companies. Sweep complete: ${completedCount}/${totalCount}`);
        
        return new Response(JSON.stringify({
          success: true,
          mode: 'concurrent_stable',
          sweepId,
          message: 'No hay empresas pendientes - Barrido completado',
          completed: true,
          stats: { completed: completedCount, total: totalCount },
          zombiesReset: stuckReset.count,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      console.log(`[concurrent_stable] Processing ${claimedCompanies.length} companies in parallel: ${claimedCompanies.map(c => c.ticker).join(', ')}`);
      
      // 5. Procesar TODAS en paralelo y ESPERAR a que terminen (clave del fix)
      const startProcessing = Date.now();
      const results = await Promise.allSettled(
        claimedCompanies.map(company => 
          processCompany(
            supabase,
            company.id,
            company.ticker,
            company.issuer_name || company.ticker,
            supabaseUrl,
            supabaseServiceKey
          )
        )
      );
      const processingDuration = Date.now() - startProcessing;
      
      // 6. Contar resultados
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
      const failCount = claimedCompanies.length - successCount;
      const processedTickers = claimedCompanies.map(c => c.ticker);
      
      // 7. Contar cuántas quedan pendientes
      const { count: remainingCount } = await supabase
        .from('sweep_progress')
        .select('*', { count: 'exact', head: true })
        .eq('sweep_id', sweepId)
        .in('status', ['pending', 'failed']);
      
      console.log(`[concurrent_stable] Completed: ${successCount}/${claimedCompanies.length} in ${processingDuration}ms. Remaining: ${remainingCount}`);
      
      return new Response(JSON.stringify({
        success: true,
        mode: 'concurrent_stable',
        sweepId,
        processed: claimedCompanies.length,
        succeeded: successCount,
        failed: failCount,
        tickers: processedTickers,
        remaining: remainingCount || 0,
        durationMs: processingDuration,
        zombiesReset: stuckReset.count,
        message: `Procesadas ${successCount}/${claimedCompanies.length} empresas. Pendientes: ${remainingCount}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========== MODO process_one: Procesar exactamente 1 empresa ==========
    if (process_one) {
      const result = await runSingleCompany(supabase, supabaseUrl, supabaseServiceKey);
      return new Response(
        JSON.stringify({
          success: true,
          ...result,
          message: result.processed 
            ? `Procesando ${result.ticker}...` 
            : 'No hay empresas pendientes',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== MODO AUTO_RECOVERY: Fire-and-Forget sin esperar ==========
    // ARQUITECTURA: El watchdog NO espera a rix-search-v2 (evita timeouts)
    // rix-search-v2 marca la empresa como "completed" al finalizar
    // El CRON llama cada 5 min para disparar más empresas
    if (trigger === 'watchdog' || trigger === 'auto_recovery') {
      const MAX_CONCURRENT = 3;  // Máximo 3 empresas procesando simultáneamente
      const triggerMode = trigger === 'auto_recovery' ? 'auto_recovery' : 'watchdog';
      
      console.log(`[${triggerMode}] Starting fire-and-forget auto-recovery...`);
      
      // ═══════════════════════════════════════════════════════════════════
      // 0. CRITICAL FIX: Limpiar triggers stale en processing
      // - auto_continue: >60s → borrar (son desechables)
      // - repair_analysis/repair_search: >10min → resetear a pending (importante re-ejecutar)
      // ═══════════════════════════════════════════════════════════════════
      const staleCleanupThreshold = new Date(Date.now() - 60 * 1000).toISOString();
      const repairStaleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutos
      
      // Limpiar auto_continue stale (borrar)
      const { count: staleAutoContinue } = await supabase
        .from('cron_triggers')
        .delete()
        .eq('action', 'auto_continue')
        .eq('status', 'processing')
        .lt('created_at', staleCleanupThreshold)
        .select('*', { count: 'exact', head: true });
      
      // NUEVO: Resetear repair_analysis stuck (no borrar, resetear a pending)
      const { data: stuckRepairAnalysis } = await supabase
        .from('cron_triggers')
        .update({ status: 'pending', processed_at: null, result: { reset_reason: 'stuck_in_processing_10min' } })
        .eq('action', 'repair_analysis')
        .eq('status', 'processing')
        .lt('created_at', repairStaleThreshold)
        .select('id');
      
      // NUEVO: Resetear repair_search stuck 
      const { data: stuckRepairSearch } = await supabase
        .from('cron_triggers')
        .update({ status: 'pending', processed_at: null, result: { reset_reason: 'stuck_in_processing_10min' } })
        .eq('action', 'repair_search')
        .eq('status', 'processing')
        .lt('created_at', repairStaleThreshold)
        .select('id');
      
      const totalStaleCleanup = (staleAutoContinue || 0) + (stuckRepairAnalysis?.length || 0) + (stuckRepairSearch?.length || 0);
      if (totalStaleCleanup > 0) {
        console.log(`[${triggerMode}] Cleaned up stale triggers: ${staleAutoContinue || 0} auto_continue (deleted), ${stuckRepairAnalysis?.length || 0} repair_analysis (reset), ${stuckRepairSearch?.length || 0} repair_search (reset)`);
      }
      
      // 1. Verificar si hay un sweep activo para esta semana
      const { count: sweepCount } = await supabase
        .from('sweep_progress')
        .select('*', { count: 'exact', head: true })
        .eq('sweep_id', sweepId);

      // Si no hay sweep, no hacer nada (se iniciará el domingo)
      if (!sweepCount || sweepCount === 0) {
        console.log(`[${triggerMode}] No sweep found for ${sweepId}. Skipping.`);
        return new Response(
          JSON.stringify({
            success: true,
            trigger: triggerMode,
            sweepId,
            action: 'skip',
            reason: 'No sweep initialized for this week',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. SIEMPRE limpiar zombies primero (> 5 min stuck)
      const stuckReset = await resetStuckProcessingCompanies(supabase, sweepId, 5);
      if (stuckReset.count > 0) {
        console.log(`[${triggerMode}] Auto-reset ${stuckReset.count} zombie companies: ${stuckReset.tickers.join(', ')}`);
      }

      // ═══════════════════════════════════════════════════════════════════
      // 2.5 CRITICAL FIX: Auto-complete "pending" companies that already have data
      // This prevents infinite retry loops for duplicates
      // ═══════════════════════════════════════════════════════════════════
      const { data: pendingCompanies } = await supabase
        .from('sweep_progress')
        .select('ticker')
        .eq('sweep_id', sweepId)
        .eq('status', 'pending')
        .limit(50);

      if (pendingCompanies && pendingCompanies.length > 0) {
        // Use the most recent period_from with real data (single source of truth)
        const { data: latestWeek } = await supabase
          .from('rix_runs_v2')
          .select('06_period_from')
          .order('06_period_from', { ascending: false })
          .limit(1)
          .maybeSingle();

        const periodFromStr = latestWeek?.['06_period_from'] || (() => {
          // Fallback: calculate manually if no data exists
          const now = new Date();
          const dayOfWeek = now.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const periodFrom = new Date(now);
          periodFrom.setDate(now.getDate() + mondayOffset);
          return periodFrom.toISOString().split('T')[0];
        })();
        
        let autoCompletedCount = 0;
        
        for (const company of pendingCompanies) {
          // Check if this company already has ≥5 models for this period
          const { count } = await supabase
            .from('rix_runs_v2')
            .select('*', { count: 'exact', head: true })
            .eq('05_ticker', company.ticker)
            .eq('06_period_from', periodFromStr);
          
          if ((count || 0) >= 5) {
            // Auto-complete this duplicate
            await supabase
              .from('sweep_progress')
              .update({ 
                status: 'completed', 
                completed_at: new Date().toISOString(),
                models_completed: count
              })
              .eq('sweep_id', sweepId)
              .eq('ticker', company.ticker);
            
            console.log(`[${triggerMode}] Auto-completed duplicate: ${company.ticker} (${count} models already exist)`);
            autoCompletedCount++;
          }
        }
        
        if (autoCompletedCount > 0) {
          console.log(`[${triggerMode}] Auto-completed ${autoCompletedCount} duplicate companies in pre-cleanup`);
        }
      }

      // ============================================================
      // 2.7 RECONCILIACIÓN: Detectar empresas "completed" sin registros
      // Estas son empresas fantasma marcadas como completadas tras timeouts
      // pero que nunca tuvieron datos insertados en rix_runs_v2
      // ============================================================
      const { data: suspectCompanies } = await supabase
        .from('sweep_progress')
        .select('id, ticker, models_completed')
        .eq('sweep_id', sweepId)
        .eq('status', 'completed')
        .lt('models_completed', 6);  // Menos de 6 modelos

      if (suspectCompanies && suspectCompanies.length > 0) {
        console.log(`[${triggerMode}] Checking ${suspectCompanies.length} suspect companies with <6 models`);
        
        // Use the most recent period_from with real data
        const { data: latestWeek } = await supabase
          .from('rix_runs_v2')
          .select('06_period_from')
          .order('06_period_from', { ascending: false })
          .limit(1)
          .maybeSingle();

        const reconcilePeriodFromStr = latestWeek?.['06_period_from'] || (() => {
          const now = new Date();
          const dayOfWeek = now.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const periodFrom = new Date(now);
          periodFrom.setDate(now.getDate() + mondayOffset);
          return periodFrom.toISOString().split('T')[0];
        })();
        
        let resetCount = 0;
        let incompleteCount = 0;  // NEW: Track companies with 1-5 models
        const incompleteCompanies: Array<{ticker: string, actualModels: number}> = [];
        
        for (const company of suspectCompanies) {
          // Verificar cuántos registros realmente tiene
          const { count } = await supabase
            .from('rix_runs_v2')
            .select('*', { count: 'exact', head: true })
            .eq('05_ticker', company.ticker)
            .eq('06_period_from', reconcilePeriodFromStr);
          
          const actualModels = count || 0;
          
          // Si tiene 0 registros, resetear a pending (ghost company)
          if (actualModels === 0) {
            await supabase
              .from('sweep_progress')
              .update({ 
                status: 'pending', 
                error_message: `Reconciled: marked completed but had 0 records`,
                models_completed: 0
              })
              .eq('id', company.id);
            
            console.log(`[${triggerMode}] Reset ghost company: ${company.ticker} (was 'completed' with 0 records)`);
            resetCount++;
          } else if (actualModels < 6) {
            // NEW: Si tiene 1-5 modelos, marcar como incomplete para repair
            incompleteCount++;
            incompleteCompanies.push({ ticker: company.ticker, actualModels });
            
            // Actualizar models_completed con el valor real
            await supabase
              .from('sweep_progress')
              .update({ 
                models_completed: actualModels,
                error_message: `Incomplete: only ${actualModels}/6 models`
              })
              .eq('id', company.id);
          }
        }
        
        if (resetCount > 0) {
          console.log(`[${triggerMode}] Reconciled ${resetCount} ghost companies back to pending`);
        }
        
        // NEW: Si hay empresas incompletas, disparar repair_search inmediatamente
        if (incompleteCount > 0) {
          console.log(`[${triggerMode}] Found ${incompleteCount} incomplete companies (1-5 models). Triggering repair...`);
          console.log(`[${triggerMode}] Sample: ${incompleteCompanies.slice(0, 5).map(c => `${c.ticker}(${c.actualModels})`).join(', ')}`);
          
          // Verificar si ya hay un repair_search pendiente
          const { data: existingRepair } = await supabase
            .from('cron_triggers')
            .select('id, status')
            .eq('action', 'repair_search')
            .in('status', ['pending', 'processing'])
            .limit(1)
            .maybeSingle();
          
          if (!existingRepair) {
            const { error: insertError } = await supabase.from('cron_triggers').insert({
              action: 'repair_search',
              params: { 
                sweep_id: sweepId, 
                count: incompleteCount * 6, // Estimated missing records
                batch_size: 20,
                reason: 'incomplete_companies',
                sample: incompleteCompanies.slice(0, 10).map(c => `${c.ticker}(${c.actualModels}/6)`)
              },
              status: 'pending',
            });
            
            if (insertError) {
              console.error(`[${triggerMode}] Failed inserting repair_search for incomplete companies:`, insertError);
            } else {
              console.log(`[${triggerMode}] Inserted repair_search trigger for ${incompleteCount} incomplete companies`);
            }
          } else {
            console.log(`[${triggerMode}] repair_search already pending/processing (id: ${existingRepair.id})`);
          }
        }
      }

      // 3. Contar empresas por estado
      const { data: statusCounts } = await supabase
        .from('sweep_progress')
        .select('status')
        .eq('sweep_id', sweepId);

      const pending = statusCounts?.filter(s => s.status === 'pending').length || 0;
      const processing = statusCounts?.filter(s => s.status === 'processing').length || 0;
      const completed = statusCounts?.filter(s => s.status === 'completed').length || 0;
      const failed = statusCounts?.filter(s => s.status === 'failed').length || 0;
      const total = statusCounts?.length || 0;

      console.log(`[${triggerMode}] Sweep ${sweepId}: pending=${pending}, processing=${processing}, completed=${completed}, failed=${failed}`);

      // 4. Procesar cron_triggers pendientes
      // CRITICAL FIX: procesar en bucle con time budget para evitar depender del CRON cada 5 min.
      const cronLoopBudgetMs = 150_000; // <180s de timeout típico
      const cronLoopStart = Date.now();
      let cronBatches = 0;
      let cronTotalProcessed = 0;

      while (Date.now() - cronLoopStart < cronLoopBudgetMs) {
        const batch = await processCronTriggers(supabase, supabaseUrl, supabaseServiceKey);
        cronBatches++;
        cronTotalProcessed += batch.length;

        if (batch.length === 0) break;

        // Pequeña pausa para reducir contención
        await sleep(1500);
      }

      if (cronTotalProcessed > 0) {
        console.log(`[${triggerMode}] Cron trigger loop: processed=${cronTotalProcessed} in ${cronBatches} batches`);
      }

      // 5. Si no hay empresas pendientes ni en procesamiento, verificar encadenamiento
      // CAMBIO CRÍTICO: Ya no requiere failed === 0, los failed se manejan con repair_search
      if (pending === 0 && processing === 0) {
        console.log(`[${triggerMode}] Sweep ${sweepId} progress complete (${completed} completed, ${failed} failed)`);
        
        // ============================================================
        // AUTO-ENCADENAMIENTO DE PIPELINE: Verificar estado real de datos
        // CRITICAL FIX: Usa columnas específicas por modelo para detectar datos faltantes
        // ============================================================
        
        // Use the most recent period_from with real data (avoid week mismatch / mixing)
        const { data: latestWeek } = await supabase
          .from('rix_runs_v2')
          .select('06_period_from')
          .order('06_period_from', { ascending: false })
          .limit(1)
          .maybeSingle();

        const periodFromStr = latestWeek?.['06_period_from'] || (() => {
          const now = new Date();
          const dayOfWeek = now.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const periodFrom = new Date(now);
          periodFrom.setDate(now.getDate() + mondayOffset);
          return periodFrom.toISOString().split('T')[0];
        })();
        
        // Model to column mapping for correct data detection
        const MODEL_COLUMNS: Record<string, string> = {
          'ChatGPT': '20_res_gpt_bruto',
          'Perplexity': '21_res_perplex_bruto',
          'Gemini': '22_res_gemini_bruto',
          'Google Gemini': '22_res_gemini_bruto',
          'Deepseek': '23_res_deepseek_bruto',
          'Grok': 'respuesta_bruto_grok',
          'Qwen': 'respuesta_bruto_qwen',
        };
        
        // PASO 1: Get ALL records for this period with model-specific columns
        const { data: allRecords } = await supabase
          .from('rix_runs_v2')
          .select('id, 02_model_name, 09_rix_score, 20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, respuesta_bruto_grok, respuesta_bruto_qwen')
          .eq('06_period_from', periodFromStr);
        
        // Count records without data USING MODEL-SPECIFIC COLUMNS
        let missingDataCount = 0;
        let analyzableCount = 0;
        const recordsWithoutData: Array<{id: string, model: string}> = [];
        const recordsToAnalyze: Array<{id: string, model: string}> = [];
        
        for (const record of (allRecords || [])) {
          const modelName = record['02_model_name'] || '';
          const responseColumn = MODEL_COLUMNS[modelName] || '20_res_gpt_bruto';
          const raw = record[responseColumn as keyof typeof record];
          const hasData = raw !== null && raw !== undefined && (typeof raw !== 'string' || raw.trim().length > 0);
          const hasScore = record['09_rix_score'] !== null;
          
          if (!hasScore && !hasData) {
            missingDataCount++;
            recordsWithoutData.push({ id: record.id, model: modelName });
          } else if (!hasScore && hasData) {
            analyzableCount++;
            recordsToAnalyze.push({ id: record.id, model: modelName });
          }
        }
        
        console.log(`[${triggerMode}] Data check (model-aware): ${missingDataCount} sin datos, ${analyzableCount} analizables, ${failed} failed en sweep_progress`);
        
        // Disparar triggers EN PARALELO según lo que falte
        const triggersInserted: string[] = [];
        
          // TRIGGER 1: Hay registros sin datos → repair_search
        if (missingDataCount > 0 || failed > 0) {
          const { data: existingTrigger } = await supabase
            .from('cron_triggers')
            .select('id, status')
            .eq('action', 'repair_search')
            .in('status', ['pending', 'processing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (!existingTrigger) {
            const totalMissing = missingDataCount + (failed * 6);
            const { error: insertError } = await supabase.from('cron_triggers').insert({
              action: 'repair_search',
              params: { 
                sweep_id: sweepId, 
                count: totalMissing, 
                batch_size: 20,
                records_sample: recordsWithoutData.slice(0, 10).map(r => `${r.model}`)
              },
              status: 'pending',
            });
            if (insertError) {
              console.error(`[${triggerMode}] Failed inserting repair_search trigger:`, insertError);
            } else {
              triggersInserted.push('repair_search');
              console.log(`[${triggerMode}] Inserted repair_search trigger for ${totalMissing} records (${missingDataCount} missing + ${failed} failed)`);
            }
          } else {
            console.log(`[${triggerMode}] repair_search trigger already pending (id: ${existingTrigger.id})`);
          }
        }
        
          // TRIGGER 2: Hay registros analizables → repair_analysis (puede correr EN PARALELO)
        if (analyzableCount && analyzableCount > 0) {
          const { data: existingTrigger } = await supabase
            .from('cron_triggers')
            .select('id, status')
            .eq('action', 'repair_analysis')
            .in('status', ['pending', 'processing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (!existingTrigger) {
            const { error: insertError } = await supabase.from('cron_triggers').insert({
              action: 'repair_analysis',
              params: { sweep_id: sweepId, count: analyzableCount, batch_size: 5 },
              status: 'pending',
            });
            if (insertError) {
              console.error(`[${triggerMode}] Failed inserting repair_analysis trigger:`, insertError);
            } else {
              triggersInserted.push('repair_analysis');
              console.log(`[${triggerMode}] Inserted repair_analysis trigger for ${analyzableCount} analyzable records`);
            }
          } else {
            console.log(`[${triggerMode}] repair_analysis trigger already pending (id: ${existingTrigger.id})`);
          }
        }
        
        // TRIGGER 3: Solo sanitizar si NO hay trabajo pendiente
        if ((missingDataCount || 0) === 0 && (analyzableCount || 0) === 0 && failed === 0) {
          const { data: existingSanitize } = await supabase
            .from('cron_triggers')
            .select('id')
            .eq('action', 'auto_sanitize')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();
          
          if (!existingSanitize) {
            const { count: existingReports } = await supabase
              .from('data_quality_reports')
              .select('*', { count: 'exact', head: true })
              .eq('sweep_id', sweepId);
            
            if ((existingReports || 0) === 0) {
              await supabase.from('cron_triggers').insert({
                action: 'auto_sanitize',
                params: { sweep_id: sweepId, auto_repair: true },
                status: 'pending',
              });
              triggersInserted.push('auto_sanitize');
              console.log(`[${triggerMode}] Sweep complete! Inserted auto_sanitize trigger for ${sweepId}`);
            } else {
              console.log(`[${triggerMode}] Sweep ${sweepId} already has ${existingReports} quality reports, skipping auto_sanitize`);
            }
          } else {
            console.log(`[${triggerMode}] auto_sanitize trigger already exists (id: ${existingSanitize.id}), skipping`);
          }
        }
        
        console.log(`[${triggerMode}] Auto-chain triggers inserted: ${triggersInserted.join(', ') || 'none (all pending or no work needed)'}`);
        
        // ========== NUEVO: Procesar inmediatamente los triggers recién insertados ==========
        // Esto evita esperar 5 minutos para el próximo CRON
        if (triggersInserted.length > 0) {
          console.log(`[${triggerMode}] Executing immediate trigger processing for newly inserted triggers...`);
          try {
            const immediateBudgetMs = 60_000;
            const immediateStart = Date.now();
            let immediateProcessed = 0;

            while (Date.now() - immediateStart < immediateBudgetMs) {
              const immediateResults = await processCronTriggers(supabase, supabaseUrl, supabaseServiceKey);
              immediateProcessed += immediateResults.length;
              if (immediateResults.length === 0) break;
              await sleep(1000);
            }

            if (immediateProcessed > 0) {
              console.log(`[${triggerMode}] Immediate processing loop processed ${immediateProcessed} triggers`);
            } else {
              console.log(`[${triggerMode}] No triggers processed immediately (may be in progress already)`);
            }
          } catch (e) {
            console.error(`[${triggerMode}] Immediate processing error (CRON will retry):`, e);
            // No fallar la request - el CRON lo procesará después
          }
        }

        // ========== CRÍTICO: Self-chaining PERSISTENTE via DB (no waitUntil) ==========
        // En lugar de usar EdgeRuntime.waitUntil() que se pierde si la función cierra,
        // insertamos un trigger auto_continue en la tabla cron_triggers.
        // El CRON de 5 minutos siempre lo encontrará y procesará.
        const { count: remainingTriggers } = await supabase
          .from('cron_triggers')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'processing'])
          .neq('action', 'auto_continue');

        const hasPendingWork = (remainingTriggers || 0) > 0 || (missingDataCount || 0) > 0 || (analyzableCount || 0) > 0;
        let autoContinueInserted = false;
        
        if (hasPendingWork) {
          // CRITICAL FIX: Verificar tanto pending como processing para evitar race conditions
          const { count: existingAutoContinueCount } = await supabase
            .from('cron_triggers')
            .select('*', { count: 'exact', head: true })
            .eq('action', 'auto_continue')
            .in('status', ['pending', 'processing'])
            .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString()); // Últimos 60s

          if ((existingAutoContinueCount || 0) === 0) {
            const { error: insertError } = await supabase.from('cron_triggers').insert({
              action: 'auto_continue',
              params: { 
                sweep_id: sweepId, 
                phase: 'repair',
                remaining_triggers: remainingTriggers || 0,
                missing_data: missingDataCount || 0,
                analyzable: analyzableCount || 0
              },
              status: 'pending',
            });
            
            if (insertError) {
              console.error(`[${triggerMode}] Failed to insert auto_continue:`, insertError);
            } else {
              autoContinueInserted = true;
              console.log(`[${triggerMode}] Inserted auto_continue trigger for next CRON cycle`);
            }
          } else {
            console.log(`[${triggerMode}] auto_continue already exists (${existingAutoContinueCount} in last 60s)`);
          }
        }
        
        // Escribir heartbeat de telemetría
        try {
          await supabase.from('pipeline_logs').insert({
            sweep_id: sweepId,
            stage: 'orchestrator_heartbeat',
            status: 'completed',
            ticker: null,
            metadata: { 
              trigger: triggerMode,
              stats: { pending, processing, completed, failed, total },
              triggers_inserted: triggersInserted,
              remaining_triggers: remainingTriggers || 0,
              pending_work: hasPendingWork,
              auto_continue_inserted: autoContinueInserted
            }
          });
        } catch (logErr) {
          console.warn(`[${triggerMode}] Failed to write heartbeat:`, logErr);
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            trigger: triggerMode,
            sweepId,
            action: 'complete',
            reason: 'Sweep progress complete, checking data state',
            dataCheck: {
              missingData: missingDataCount || 0,
              analyzable: analyzableCount || 0,
              failedCompanies: failed,
            },
            autoChain: triggersInserted,
            stats: { pending, processing, completed, failed, total },
            triggersProcessed: cronTotalProcessed,
            zombiesReset: stuckReset.count,
            autoContinueInserted,
            triggersRemaining: remainingTriggers || 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 6. Si ya hay MAX_CONCURRENT procesando, no disparar más (throttle)
      // PERO si hay trabajo pendiente, programar auto-relaunch via DB trigger
      if (processing >= MAX_CONCURRENT) {
        console.log(`[${triggerMode}] Already ${processing} companies processing (max ${MAX_CONCURRENT}). Throttling.`);
        
        // AUTO-RELAUNCH VIA DB: insertar auto_continue si hay trabajo pendiente
        // CRITICAL FIX: Check both pending AND processing, with time window
        if (pending > 0) {
          const { count: existingCount } = await supabase
            .from('cron_triggers')
            .select('*', { count: 'exact', head: true })
            .eq('action', 'auto_continue')
            .in('status', ['pending', 'processing'])
            .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString());

          if ((existingCount || 0) === 0) {
            await supabase.from('cron_triggers').insert({
              action: 'auto_continue',
              params: { sweep_id: sweepId, phase: 'throttled', pending },
              status: 'pending',
            });
            console.log(`[${triggerMode}] Inserted auto_continue trigger (throttled, pending=${pending})`);
          }
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            trigger: triggerMode,
            sweepId,
            action: 'throttled',
            reason: `Already ${processing} companies processing (max ${MAX_CONCURRENT})`,
            stats: { pending, processing, completed, failed, total },
            triggersProcessed: cronTotalProcessed,
            zombiesReset: stuckReset.count,
            message: `Slots llenos (${processing}/${MAX_CONCURRENT}). Auto-continue encolado.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 7. Calcular cuántas empresas podemos disparar
      const slotsAvailable = MAX_CONCURRENT - processing;
      const toFire = Math.min(slotsAvailable, pending);

      if (toFire === 0) {
        console.log(`[${triggerMode}] No slots available or no pending companies`);
        
        return new Response(
          JSON.stringify({
            success: true,
            trigger: triggerMode,
            sweepId,
            action: 'no_work',
            reason: 'No pending companies or no slots available',
            stats: { pending, processing, completed, failed, total },
            triggersProcessed: cronTotalProcessed,
            zombiesReset: stuckReset.count,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 8. Obtener las empresas a disparar (prioridad: pending, luego failed por retry_count)
      const { data: companiesToFire, error: fetchError } = await supabase
        .from('sweep_progress')
        .select('id, ticker, issuer_name')
        .eq('sweep_id', sweepId)
        .eq('status', 'pending')
        .order('fase', { ascending: true })
        .order('ticker', { ascending: true })
        .limit(toFire);

      if (fetchError || !companiesToFire || companiesToFire.length === 0) {
        console.log(`[${triggerMode}] No companies to fire (may all be processing/completed)`);
        return new Response(
          JSON.stringify({
            success: true,
            trigger: triggerMode,
            sweepId,
            action: 'no_companies',
            reason: 'All pending companies are already processing or completed',
            stats: { pending, processing, completed, failed, total },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 9. Marcar como processing y disparar rix-search-v2 (fire-and-forget)
      // HOTFIX: Pasar sweep_id para que rix-search-v2 actualice el sweep correcto
      const firedCompanies: string[] = [];
      
      for (const company of companiesToFire) {
        // Marcar como processing ANTES de disparar
        await supabase
          .from('sweep_progress')
          .update({ status: 'processing', started_at: new Date().toISOString() })
          .eq('id', company.id);
        
        console.log(`[${triggerMode}] Firing rix-search-v2 for ${company.ticker} with sweep_id=${sweepId} (fire-and-forget)`);
        
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ 
              ticker: company.ticker, 
              issuer_name: company.issuer_name || company.ticker,
              sweep_id: sweepId, // CRITICAL: Pasar sweep_id para consistencia
            }),
          }).catch(e => console.error(`[${triggerMode}] Fire-and-forget failed for ${company.ticker}:`, e))
        );
        
        firedCompanies.push(company.ticker);
      }

      // 10. Insertar auto_continue para el siguiente ciclo si queda trabajo
      const { count: newPending } = await supabase
        .from('sweep_progress')
        .select('*', { count: 'exact', head: true })
        .eq('sweep_id', sweepId)
        .eq('status', 'pending');

      const slotsAfterFire = MAX_CONCURRENT - (processing + firedCompanies.length);
      
      if ((newPending || 0) > 0) {
        const { data: existingAutoContinue } = await supabase
          .from('cron_triggers')
          .select('id')
          .eq('action', 'auto_continue')
          .eq('status', 'pending')
          .limit(1)
          .maybeSingle();

        if (!existingAutoContinue) {
          await supabase.from('cron_triggers').insert({
            action: 'auto_continue',
            params: { sweep_id: sweepId, phase: 'firing', pending: newPending, fired: firedCompanies.length },
            status: 'pending',
          });
          console.log(`[${triggerMode}] Inserted auto_continue (fired ${firedCompanies.length}, pending=${newPending})`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          trigger: triggerMode,
          sweepId,
          action: 'fired',
          firedCount: firedCompanies.length,
          firedCompanies,
          stats: { 
            pending: (newPending || 0), 
            processing: processing + firedCompanies.length, 
            completed, 
            failed, 
            total 
          },
          triggersProcessed: triggersProcessed.length,
          zombiesReset: stuckReset.count,
          autoContinueScheduled: (newPending || 0) > 0,
          message: `Disparadas ${firedCompanies.length} empresas: ${firedCompanies.join(', ')}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== Modo: process_triggers_only ==========
    // Útil para ejecutar triggers manualmente desde el panel sin esperar al watchdog
    if (process_triggers_only) {
      console.log('[orchestrator] Mode: process_triggers_only');
      
      const triggersProcessed = await processCronTriggers(supabase, supabaseUrl, supabaseServiceKey);

      // Si aún quedan triggers, insertar auto_continue en DB para continuidad
      const { count: remainingTriggers } = await supabase
        .from('cron_triggers')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);

      if ((remainingTriggers || 0) > 0) {
        const { count: existingCount } = await supabase
          .from('cron_triggers')
          .select('*', { count: 'exact', head: true })
          .eq('action', 'auto_continue')
          .in('status', ['pending', 'processing'])
          .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString());

        if ((existingCount || 0) === 0) {
          await supabase.from('cron_triggers').insert({
            action: 'auto_continue',
            params: { sweep_id: sweepId, phase: 'process_triggers', remaining: remainingTriggers },
            status: 'pending',
          });
          console.log(`[process_triggers_only] Inserted auto_continue (remaining=${remainingTriggers})`);
        }
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'process_triggers_only',
          triggersProcessed: triggersProcessed.length,
          triggers: triggersProcessed,
          remainingTriggers: remainingTriggers || 0,
          message: triggersProcessed.length > 0 
            ? `Procesados ${triggersProcessed.length} triggers: ${triggersProcessed.map(t => t.action).join(', ')}`
            : 'No hay triggers pendientes',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== Modo: Obtener estado actual ==========
    if (get_status) {
      const { data: stats } = await supabase
        .from('sweep_progress')
        .select('status, fase')
        .eq('sweep_id', sweepId);

      if (!stats || stats.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            sweepId,
            initialized: false,
            message: 'Sweep not initialized for this week',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const byStatus = {
        pending: stats.filter(s => s.status === 'pending').length,
        processing: stats.filter(s => s.status === 'processing').length,
        completed: stats.filter(s => s.status === 'completed').length,
        failed: stats.filter(s => s.status === 'failed').length,
      };

      const byPhase = stats.reduce((acc, s) => {
        acc[s.fase] = (acc[s.fase] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      return new Response(
        JSON.stringify({
          success: true,
          sweepId,
          initialized: true,
          totalCompanies: stats.length,
          byStatus,
          byPhase,
          progress: Math.round((byStatus.completed / stats.length) * 100),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== Modo: Solo inicializar ==========
    if (init_only) {
      const result = await initializeSweepIfNeeded(supabase, sweepId);
      return new Response(
        JSON.stringify({
          success: true,
          sweepId,
          ...result,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== Modo: Resetear fallidos ==========
    if (reset_failed) {
      const resetCount = await resetFailedCompanies(supabase, sweepId);
      return new Response(
        JSON.stringify({
          success: true,
          sweepId,
          resetCount,
          message: `${resetCount} empresas reseteadas a estado 'pending'`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== NUEVO: Modo reset_stuck - Reset inmediato de zombis ==========
    if (reset_stuck) {
      const stuckResult = await resetStuckProcessingCompanies(supabase, sweepId, reset_stuck_timeout);
      return new Response(
        JSON.stringify({
          success: true,
          sweepId,
          resetCount: stuckResult.count,
          tickers: stuckResult.tickers,
          message: stuckResult.count > 0 
            ? `${stuckResult.count} empresas zombis reseteadas: ${stuckResult.tickers.join(', ')}`
            : 'No hay empresas atascadas',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== AUTO-RESET AGRESIVO: 5 minutos ==========
    // Siempre revisar si hay empresas colgadas antes de procesar
    // Timeout reducido a 5 min para sistema infalible
    const stuckReset = await resetStuckProcessingCompanies(supabase, sweepId, 5);
    if (stuckReset.count > 0) {
      console.log(`[orchestrator] Auto-reset ${stuckReset.count} stuck companies: ${stuckReset.tickers.join(', ')}`);
    }

    // ========== NUEVO: Modo single_company ==========
    // Procesa exactamente 1 empresa (evita timeouts)
    if (single_company) {
      const result = await runSingleCompany(supabase, supabaseUrl, supabaseServiceKey);
      return new Response(
        JSON.stringify({
          success: true,
          ...result,
          stuckReset: stuckReset.count > 0 ? stuckReset : undefined,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== Modo: Ejecutar fase específica o siguiente pendiente ==========
    let targetFase = fase;
    
    // Si no se especifica fase, obtener la siguiente pendiente
    if (!targetFase) {
      await initializeSweepIfNeeded(supabase, sweepId);
      targetFase = await getNextPendingPhase(supabase, sweepId);
      
      if (!targetFase) {
        return new Response(
          JSON.stringify({
            success: true,
            sweepId,
            message: 'No pending phases. Sweep complete!',
            completed: true,
            stuckReset: stuckReset.count > 0 ? stuckReset : undefined,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Ejecutar la fase
    const result = await runSinglePhase(supabase, supabaseUrl, supabaseServiceKey, targetFase);

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[orchestrator] Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});