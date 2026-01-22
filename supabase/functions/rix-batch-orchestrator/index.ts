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

// Verifica si una empresa ya tiene datos de esta semana en rix_runs_v2
async function hasCompanyDataThisWeek(
  supabase: ReturnType<typeof createClient>,
  ticker: string
): Promise<boolean> {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('rix_runs_v2')
    .select('*', { count: 'exact', head: true })
    .eq('05_ticker', ticker)
    .gte('created_at', weekStart.toISOString());

  if (error) {
    console.error(`[phase] Error checking data for ${ticker}:`, error);
    return false;
  }

  return (count || 0) >= 6;
}

// Inicializa el barrido COMPLETO si no existe para esta semana
async function initializeSweepIfNeeded(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<{ isNew: boolean; totalCompanies: number }> {
  const { count: existingCount } = await supabase
    .from('sweep_progress')
    .select('*', { count: 'exact', head: true })
    .eq('sweep_id', sweepId);

  if (existingCount && existingCount > 0) {
    console.log(`[init] Sweep ${sweepId} already initialized with ${existingCount} records`);
    return { isNew: false, totalCompanies: existingCount };
  }

  const { data: issuers, error: issuersError } = await supabase
    .from('repindex_root_issuers')
    .select('ticker, issuer_name, fase')
    .order('fase', { ascending: true, nullsLast: true });

  if (issuersError || !issuers) {
    throw new Error(`Failed to fetch issuers: ${issuersError?.message}`);
  }

  console.log(`[init] Initializing new sweep ${sweepId} with ${issuers.length} companies`);

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
  for (let i = 0; i < progressRecords.length; i += batchSize) {
    const batch = progressRecords.slice(i, i + batchSize);
    const { error: insertError } = await supabase
      .from('sweep_progress')
      .insert(batch);
    
    if (insertError) {
      console.error(`[init] Error inserting batch ${i / batchSize + 1}:`, insertError);
    }
  }

  console.log(`[init] Sweep ${sweepId} initialized successfully`);
  return { isNew: true, totalCompanies: issuers.length };
}

// Obtiene las empresas pendientes de UNA fase específica
async function getCompaniesForPhase(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  fase: number,
  maxRetries: number = 3
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
  // Marcar como 'processing'
  await supabase
    .from('sweep_progress')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', progressId);

  try {
    // Verificar si ya tiene datos de esta semana
    const hasData = await hasCompanyDataThisWeek(supabase, ticker);
    if (hasData) {
      console.log(`[phase] ${ticker} already has data this week, marking as completed`);
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

    return { success: false, error: errorMsg };
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
// NUEVO: Resetea empresas atascadas en "processing" por más de X minutos
// ============================================================================
async function resetStuckProcessingCompanies(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  timeoutMinutes: number = 30
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
      fase?: number;           // Nueva: fase específica a procesar
      test_mode?: boolean;
      reset_failed?: boolean;
      get_status?: boolean;
      init_only?: boolean;     // Nueva: solo inicializar, no procesar
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
    } = requestBody;

    const sweepId = getCurrentSweepId();
    console.log(`[orchestrator] Invoked - trigger: ${trigger}, fase: ${fase || 'auto'}, sweepId: ${sweepId}`);

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

    // ========== NUEVO: Auto-reset de empresas atascadas ==========
    // Siempre revisar si hay empresas colgadas antes de procesar
    const stuckReset = await resetStuckProcessingCompanies(supabase, sweepId, 30);
    if (stuckReset.count > 0) {
      console.log(`[orchestrator] Auto-reset ${stuckReset.count} stuck companies: ${stuckReset.tickers.join(', ')}`);
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
