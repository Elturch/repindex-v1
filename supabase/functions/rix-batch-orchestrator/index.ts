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
    // Llamar a rix-search-v2
    console.log(`[phase] Processing ${ticker} (${issuerName})`);
    const response = await fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ ticker, issuer_name: issuerName }),
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
      reset_stuck?: boolean;      // NUEVO: reset inmediato de zombis
      reset_stuck_timeout?: number; // NUEVO: timeout personalizable
      mode?: string;  // 'resume' para watchdog
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
    } = requestBody;

    const sweepId = getCurrentSweepId();
    console.log(`[orchestrator] Invoked - trigger: ${trigger}, fase: ${fase || 'auto'}, sweepId: ${sweepId}, mode: ${mode || 'default'}`);

    // ========== MODO WATCHDOG ULTRA-OPTIMIZADO: Procesa en lotes de 10 ==========
    // Rendimiento: 40 empresas/hora vs 20 anterior (optimización del 25/01/2026)
    // CAMBIO: Aumentado de 5 a 10 empresas por invocación para acelerar barrido
    if (trigger === 'watchdog') {
      const BATCH_SIZE = 10;  // AUMENTADO: Procesar 10 empresas por invocación
      const DELAY_BETWEEN_COMPANIES_MS = 2000;  // REDUCIDO: 2 segundos entre empresas
      
      // 1. Verificar si hay un sweep activo para esta semana
      const { count: sweepCount } = await supabase
        .from('sweep_progress')
        .select('*', { count: 'exact', head: true })
        .eq('sweep_id', sweepId);

      // Si no hay sweep, no hacer nada (se iniciará el domingo)
      if (!sweepCount || sweepCount === 0) {
        console.log(`[watchdog] No sweep found for ${sweepId}. Skipping.`);
        return new Response(
          JSON.stringify({
            success: true,
            trigger: 'watchdog',
            sweepId,
            action: 'skip',
            reason: 'No sweep initialized for this week',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. Contar empresas por estado
      const { data: statusCounts } = await supabase
        .from('sweep_progress')
        .select('status')
        .eq('sweep_id', sweepId);

      const pending = statusCounts?.filter(s => s.status === 'pending').length || 0;
      const processing = statusCounts?.filter(s => s.status === 'processing').length || 0;
      const completed = statusCounts?.filter(s => s.status === 'completed').length || 0;
      const failed = statusCounts?.filter(s => s.status === 'failed').length || 0;
      const total = statusCounts?.length || 0;

      console.log(`[watchdog] Sweep ${sweepId}: pending=${pending}, processing=${processing}, completed=${completed}, failed=${failed}`);

      // 3. Si no hay empresas pendientes ni en procesamiento, el sweep está completo
      if (pending === 0 && processing === 0 && failed === 0) {
        console.log(`[watchdog] Sweep ${sweepId} is complete (${completed}/${total}). Nothing to resume.`);
        return new Response(
          JSON.stringify({
            success: true,
            trigger: 'watchdog',
            sweepId,
            action: 'complete',
            reason: 'Sweep already completed',
            stats: { pending, processing, completed, failed, total },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. Limpiar zombis (empresas en processing >5 minutos)
      const stuckReset = await resetStuckProcessingCompanies(supabase, sweepId, 5);
      if (stuckReset.count > 0) {
        console.log(`[watchdog] Auto-reset ${stuckReset.count} zombie companies: ${stuckReset.tickers.join(', ')}`);
      }

      // 5. NUEVO: Procesar LOTE de hasta 5 empresas (mucho más eficiente)
      console.log(`[watchdog] Resuming sweep ${sweepId} - processing up to ${BATCH_SIZE} companies...`);
      
      const batchResults = [];
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < BATCH_SIZE; i++) {
        const result = await runSingleCompany(supabase, supabaseUrl, supabaseServiceKey);
        batchResults.push(result);
        
        if (result.success) successCount++;
        else failCount++;
        
        // Si no hay más empresas pendientes, salir del loop
        if (!result.next_pending) {
          console.log(`[watchdog] No more pending companies after ${i + 1} processed`);
          break;
        }
        
        // Delay entre empresas (excepto la última)
        if (i < BATCH_SIZE - 1 && result.next_pending) {
          console.log(`[watchdog] Waiting ${DELAY_BETWEEN_COMPANIES_MS}ms before next company...`);
          await sleep(DELAY_BETWEEN_COMPANIES_MS);
        }
      }

      const lastResult = batchResults[batchResults.length - 1];

      return new Response(
        JSON.stringify({
          success: true,
          trigger: 'watchdog',
          sweepId,
          action: 'resume_batch',
          batchSize: batchResults.length,
          batchSuccess: successCount,
          batchFailed: failCount,
          tickers: batchResults.filter(r => r.ticker).map(r => r.ticker),
          remaining: lastResult?.remaining || 0,
          zombiesReset: stuckReset.count > 0 ? stuckReset : undefined,
          stats: { 
            pendingBefore: pending + stuckReset.count, 
            processing, 
            completed, 
            failed 
          },
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

    // ========== Modo: Test ==========
    if (test_mode) {
      await initializeSweepIfNeeded(supabase, sweepId);
      const nextPhase = await getNextPendingPhase(supabase, sweepId);
      
      return new Response(
        JSON.stringify({
          success: true,
          sweepId,
          testMode: true,
          message: 'Orchestrator ready for phased execution',
          nextPendingPhase: nextPhase,
          timestamp: new Date().toISOString(),
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
