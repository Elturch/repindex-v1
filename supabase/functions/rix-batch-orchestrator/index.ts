import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// SISTEMA ROBUSTO DE BARRIDO POR FASES
// - Persiste progreso en sweep_progress
// - Procesa por fases (5 empresas por fase)
// - Recuperable ante fallos
// - Invocaciones cortas (~3-5 min) que no exceden límites de timeout
// ============================================================================

// Issuer type is used implicitly via Supabase queries

interface SweepConfig {
  phases_per_run: number;      // Fases a procesar por invocación (default: 6)
  max_retries: number;         // Reintentos por empresa (default: 3)
  delay_between_phases_ms: number; // Delay entre fases (default: 5000)
}

interface SweepResult {
  sweepId: string;
  status: 'initialized' | 'in_progress' | 'completed' | 'partial_failure';
  phasesProcessed: number;
  phasesRemaining: number;
  companiesCompleted: number;
  companiesFailed: number;
  companiesPending: number;
  nextInvocationNeeded: boolean;
  errors: Array<{ ticker: string; error: string }>;
  durationMs: number;
}

const DEFAULT_CONFIG: SweepConfig = {
  phases_per_run: 6,           // 6 fases × 5 empresas = 30 empresas por invocación
  max_retries: 3,
  delay_between_phases_ms: 5000, // 5 segundos entre fases
};

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
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Inicio de la semana (domingo)
  weekStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('rix_runs_v2')
    .select('*', { count: 'exact', head: true })
    .eq('05_ticker', ticker)
    .gte('created_at', weekStart.toISOString());

  if (error) {
    console.error(`[orchestrator] Error checking data for ${ticker}:`, error);
    return false;
  }

  return (count || 0) >= 6; // Consideramos completo si tiene al menos 6 modelos
}

// Inicializa el barrido si no existe para esta semana
async function initializeSweepIfNeeded(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<{ isNew: boolean; totalCompanies: number }> {
  // Verificar si ya existe el barrido
  const { count: existingCount } = await supabase
    .from('sweep_progress')
    .select('*', { count: 'exact', head: true })
    .eq('sweep_id', sweepId);

  if (existingCount && existingCount > 0) {
    console.log(`[orchestrator] Sweep ${sweepId} already initialized with ${existingCount} records`);
    return { isNew: false, totalCompanies: existingCount };
  }

  // Obtener todas las empresas
  const { data: issuers, error: issuersError } = await supabase
    .from('repindex_root_issuers')
    .select('ticker, issuer_name, fase')
    .order('fase', { ascending: true, nullsLast: true });

  if (issuersError || !issuers) {
    throw new Error(`Failed to fetch issuers: ${issuersError?.message}`);
  }

  console.log(`[orchestrator] Initializing new sweep ${sweepId} with ${issuers.length} companies`);

  // Insertar registros para todas las empresas
  const progressRecords = issuers.map((issuer, index) => ({
    sweep_id: sweepId,
    fase: issuer.fase || Math.floor(index / 5) + 1, // Asignar fase si no tiene
    ticker: issuer.ticker,
    issuer_name: issuer.issuer_name,
    status: 'pending',
    models_completed: 0,
    retry_count: 0,
  }));

  // Insertar en lotes de 50 para evitar problemas
  const batchSize = 50;
  for (let i = 0; i < progressRecords.length; i += batchSize) {
    const batch = progressRecords.slice(i, i + batchSize);
    const { error: insertError } = await supabase
      .from('sweep_progress')
      .insert(batch);
    
    if (insertError) {
      console.error(`[orchestrator] Error inserting batch ${i / batchSize + 1}:`, insertError);
      // Continuar aunque falle un lote
    }
  }

  console.log(`[orchestrator] Sweep ${sweepId} initialized successfully`);
  return { isNew: true, totalCompanies: issuers.length };
}

// Obtiene las siguientes fases pendientes a procesar
async function getPendingPhases(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  maxPhases: number
): Promise<number[]> {
  // Obtener fases con empresas pendientes o fallidas (con reintentos disponibles)
  const { data, error } = await supabase
    .from('sweep_progress')
    .select('fase')
    .eq('sweep_id', sweepId)
    .in('status', ['pending', 'failed'])
    .order('fase', { ascending: true });

  if (error || !data) {
    console.error(`[orchestrator] Error fetching pending phases:`, error);
    return [];
  }

  // Agrupar y obtener fases únicas
  const uniquePhases = [...new Set(data.map(d => d.fase))];
  return uniquePhases.slice(0, maxPhases);
}

// Obtiene las empresas de una fase específica
async function getCompaniesForPhase(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  fase: number,
  maxRetries: number
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
    console.error(`[orchestrator] Error fetching companies for phase ${fase}:`, error);
    return [];
  }

  return data;
}

// Procesa una empresa individual
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
      console.log(`[orchestrator] ${ticker} already has data this week, marking as completed`);
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
    console.log(`[orchestrator] Processing ${ticker} (${issuerName})`);
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

    // Actualizar progreso
    await supabase
      .from('sweep_progress')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString(),
        models_completed: modelsCompleted
      })
      .eq('id', progressId);

    console.log(`[orchestrator] ${ticker} completed with ${modelsCompleted} models`);
    return { success: true, modelsCompleted };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[orchestrator] Error processing ${ticker}: ${errorMsg}`);

    // Incrementar retry_count y marcar como failed
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

// Ejecuta el barrido por fases
async function runPhasedSweep(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  config: SweepConfig
): Promise<SweepResult> {
  const startTime = Date.now();
  const sweepId = getCurrentSweepId();
  const errors: Array<{ ticker: string; error: string }> = [];

  console.log(`[orchestrator] Starting phased sweep for ${sweepId}`);

  // 1. Inicializar o recuperar estado
  await initializeSweepIfNeeded(supabase, sweepId);

  // 2. Obtener fases pendientes
  const pendingPhases = await getPendingPhases(supabase, sweepId, config.phases_per_run);

  if (pendingPhases.length === 0) {
    console.log(`[orchestrator] No pending phases for ${sweepId}`);
    
    // Obtener estadísticas finales
    const { data: stats } = await supabase
      .from('sweep_progress')
      .select('status')
      .eq('sweep_id', sweepId);

    const completed = stats?.filter(s => s.status === 'completed').length || 0;
    const failed = stats?.filter(s => s.status === 'failed').length || 0;
    const pending = stats?.filter(s => s.status === 'pending').length || 0;

    return {
      sweepId,
      status: failed > 0 ? 'partial_failure' : 'completed',
      phasesProcessed: 0,
      phasesRemaining: 0,
      companiesCompleted: completed,
      companiesFailed: failed,
      companiesPending: pending,
      nextInvocationNeeded: false,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  }

  console.log(`[orchestrator] Processing ${pendingPhases.length} phases: ${pendingPhases.join(', ')}`);

  let phasesProcessed = 0;

  // 3. Procesar cada fase
  for (const fase of pendingPhases) {
    const companies = await getCompaniesForPhase(supabase, sweepId, fase, config.max_retries);
    
    if (companies.length === 0) {
      console.log(`[orchestrator] Phase ${fase} has no pending companies`);
      phasesProcessed++;
      continue;
    }

    console.log(`[orchestrator] Phase ${fase}: ${companies.length} companies`);

    // Procesar empresas de la fase en paralelo
    const results = await Promise.allSettled(
      companies.map(company => 
        processCompany(
          supabase,
          company.id,
          company.ticker,
          company.issuer_name || company.ticker,
          supabaseUrl,
          serviceKey
        )
      )
    );

    // Contabilizar resultados y registrar errores
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value.success) {
        const errorMsg = result.status === 'fulfilled' 
          ? result.value.error 
          : result.reason?.message || 'Unknown error';
        errors.push({ ticker: companies[index].ticker, error: errorMsg || 'Unknown' });
      }
    });

    phasesProcessed++;

    // Delay entre fases
    if (fase !== pendingPhases[pendingPhases.length - 1]) {
      console.log(`[orchestrator] Waiting ${config.delay_between_phases_ms}ms before next phase...`);
      await sleep(config.delay_between_phases_ms);
    }
  }

  // 4. Verificar si quedan más fases
  const remainingPhases = await getPendingPhases(supabase, sweepId, 999);
  
  // Obtener estadísticas actualizadas
  const { data: stats } = await supabase
    .from('sweep_progress')
    .select('status')
    .eq('sweep_id', sweepId);

  const totalCompleted = stats?.filter(s => s.status === 'completed').length || 0;
  const totalFailed = stats?.filter(s => s.status === 'failed').length || 0;
  const totalPending = stats?.filter(s => s.status === 'pending').length || 0;

  const result: SweepResult = {
    sweepId,
    status: remainingPhases.length > 0 ? 'in_progress' : 
            (totalFailed > 0 ? 'partial_failure' : 'completed'),
    phasesProcessed,
    phasesRemaining: remainingPhases.length,
    companiesCompleted: totalCompleted,
    companiesFailed: totalFailed,
    companiesPending: totalPending,
    nextInvocationNeeded: remainingPhases.length > 0,
    errors,
    durationMs: Date.now() - startTime,
  };

  console.log(`[orchestrator] Phased sweep complete:`, result);
  return result;
}

// Resetea las empresas fallidas para reintentar
async function resetFailedCompanies(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('sweep_progress')
    .update({ status: 'pending', error_message: null })
    .eq('sweep_id', sweepId)
    .eq('status', 'failed')
    .select('id');

  if (error) {
    console.error(`[orchestrator] Error resetting failed companies:`, error);
    return 0;
  }

  return data?.length || 0;
}

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

    // Parse request body
    let requestBody: { 
      trigger?: string; 
      phases_per_run?: number;
      test_mode?: boolean;
      reset_failed?: boolean;
      get_status?: boolean;
    } = {};
    
    try {
      requestBody = await req.json();
    } catch {
      // Empty body is fine
    }

    const { 
      trigger = 'manual', 
      phases_per_run = DEFAULT_CONFIG.phases_per_run,
      test_mode = false,
      reset_failed = false,
      get_status = false,
    } = requestBody;

    const sweepId = getCurrentSweepId();
    console.log(`[orchestrator] Invoked - trigger: ${trigger}, sweepId: ${sweepId}`);

    // Modo: Obtener estado actual
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

    // Modo: Resetear empresas fallidas
    if (reset_failed) {
      const resetCount = await resetFailedCompanies(supabase, sweepId);
      return new Response(
        JSON.stringify({
          success: true,
          sweepId,
          message: `Reset ${resetCount} failed companies to pending`,
          resetCount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Modo: Test
    if (test_mode) {
      const { count } = await supabase
        .from('repindex_root_issuers')
        .select('*', { count: 'exact', head: true });

      const totalPhases = Math.ceil((count || 0) / 5);
      const invocationsNeeded = Math.ceil(totalPhases / phases_per_run);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Test mode - no processing',
          sweepId,
          totalCompanies: count,
          totalPhases,
          phasesPerRun: phases_per_run,
          invocationsNeeded,
          estimatedMinutesPerRun: 3,
          estimatedTotalMinutes: invocationsNeeded * 3,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Modo: Ejecutar barrido por fases
    const config: SweepConfig = {
      ...DEFAULT_CONFIG,
      phases_per_run,
    };

    const result = await runPhasedSweep(supabase, supabaseUrl, supabaseServiceKey, config);

    return new Response(
      JSON.stringify({
        success: true,
        trigger,
        ...result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[orchestrator] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
