import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 6 modelos que monitoreamos
const ALL_MODELS = ['ChatGPT', 'Deepseek', 'Gemini', 'Grok', 'Perplexity', 'Qwen']

// Columnas de respuesta bruta por modelo
const MODEL_RAW_COLUMNS: Record<string, string> = {
  'ChatGPT': '20_res_gpt_bruto',
  'Deepseek': '23_res_deepseek_bruto',
  'Gemini': '22_res_gemini_bruto',
  'Grok': 'respuesta_bruto_grok',
  'Perplexity': '21_res_perplex_bruto',
  'Qwen': 'respuesta_bruto_qwen',
}

// Clasificar tipo de error basado en mensaje
function classifyErrorType(message: string | null): string {
  if (!message) return 'no_response'
  const lower = message.toLowerCase()
  
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key')) {
    return 'auth'
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return 'rate_limit'
  }
  if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('deadline')) {
    return 'timeout'
  }
  if (lower.includes('422') || lower.includes('400') || lower.includes('invalid')) {
    return 'payload_error'
  }
  if (lower.includes('connection') || lower.includes('network') || lower.includes('fetch')) {
    return 'connection'
  }
  return 'no_response'
}

interface AnalyzeResult {
  sweepId: string
  weekStart: string
  totalCompanies: number
  completeCompanies: number  // 6/6 modelos
  partialCompanies: number   // 1-5 modelos
  failedCompanies: number    // 0 modelos
  byModel: Record<string, { ok: number; missing: number; rate: number }>
  insertedReports: number
}

interface RepairResult {
  processed: number
  repaired: number
  failedRepairs: number
  skipped: number
  details: { ticker: string; model: string; success: boolean; error?: string }[]
}

interface ReportResult {
  latestSweep: string | null
  weekStart: string | null
  totalReports: number
  byStatus: { missing: number; repaired: number; failed_repair: number }
  byModel: Record<string, { missing: number; repaired: number; failed: number }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const body = await req.json().catch(() => ({}))
    const action = body.action || 'analyze'
    const sweepId = body.sweep_id // Opcional: forzar un sweep específico
    const maxRepairs = body.max_repairs || 10 // Límite de reparaciones por invocación

    console.log(`[rix-quality-watchdog] Action: ${action}, sweepId: ${sweepId || 'latest'}`)

    // ============ ACTION: ANALYZE ============
    if (action === 'analyze') {
      const result = await analyzeQuality(supabase, sweepId)
      return new Response(JSON.stringify({ success: true, action: 'analyze', ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ============ ACTION: REPAIR ============
    if (action === 'repair') {
      const result = await repairMissingModels(supabase, supabaseUrl, serviceRoleKey, sweepId, maxRepairs)
      return new Response(JSON.stringify({ success: true, action: 'repair', ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ============ ACTION: REPORT ============
    if (action === 'report') {
      const result = await getQualityReport(supabase, sweepId)
      return new Response(JSON.stringify({ success: true, action: 'report', ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use: analyze, repair, or report' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[rix-quality-watchdog] Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ============ ANALYZE QUALITY ============
async function analyzeQuality(supabase: any, forcedSweepId?: string): Promise<AnalyzeResult> {
  console.log('[analyze] Starting quality analysis...')

  // 1. Determinar el sweep más reciente
  const { data: latestRun, error: latestError } = await supabase
    .from('rix_runs_v2')
    .select('batch_execution_date, "06_period_from"')
    .order('batch_execution_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) throw new Error(`Error fetching latest run: ${latestError.message}`)
  if (!latestRun) {
    return {
      sweepId: 'none',
      weekStart: 'none',
      totalCompanies: 0,
      completeCompanies: 0,
      partialCompanies: 0,
      failedCompanies: 0,
      byModel: {},
      insertedReports: 0,
    }
  }

  const sweepId = forcedSweepId || latestRun.batch_execution_date
  const weekStart = latestRun['06_period_from']
  console.log(`[analyze] Analyzing sweep: ${sweepId}, week: ${weekStart}`)

  // 2. Obtener todos los registros de la semana
  const { data: weekRecords, error: recordsError } = await supabase
    .from('rix_runs_v2')
    .select(`
      id,
      "02_model_name",
      "03_target_name",
      "05_ticker",
      "09_rix_score",
      "20_res_gpt_bruto",
      "21_res_perplex_bruto",
      "22_res_gemini_bruto",
      "23_res_deepseek_bruto",
      respuesta_bruto_grok,
      respuesta_bruto_qwen,
      model_errors
    `)
    .eq('batch_execution_date', sweepId)

  if (recordsError) throw new Error(`Error fetching records: ${recordsError.message}`)
  if (!weekRecords || weekRecords.length === 0) {
    return {
      sweepId,
      weekStart,
      totalCompanies: 0,
      completeCompanies: 0,
      partialCompanies: 0,
      failedCompanies: 0,
      byModel: {},
      insertedReports: 0,
    }
  }

  console.log(`[analyze] Found ${weekRecords.length} records`)

  // 3. Agrupar por ticker y modelo
  const tickerModels = new Map<string, Map<string, { hasRaw: boolean; hasScore: boolean; error?: string }>>()

  weekRecords.forEach((record: any) => {
    const ticker = record['05_ticker']
    const modelName = record['02_model_name']
    if (!ticker || !modelName) return

    if (!tickerModels.has(ticker)) {
      tickerModels.set(ticker, new Map())
    }

    const modelMap = tickerModels.get(ticker)!
    const rawColumn = MODEL_RAW_COLUMNS[modelName]
    const hasRaw = rawColumn ? !!record[rawColumn] : false
    const hasScore = record['09_rix_score'] !== null

    // Extraer error si existe
    let errorMsg: string | undefined
    if (record.model_errors && typeof record.model_errors === 'object') {
      const errors = Object.values(record.model_errors).filter(v => typeof v === 'string')
      if (errors.length > 0) errorMsg = errors[0] as string
    }

    modelMap.set(modelName, { hasRaw, hasScore, error: errorMsg })
  })

  // 4. Calcular métricas
  const byModel: Record<string, { ok: number; missing: number; rate: number }> = {}
  ALL_MODELS.forEach(model => {
    byModel[model] = { ok: 0, missing: 0, rate: 0 }
  })

  let completeCompanies = 0
  let partialCompanies = 0
  let failedCompanies = 0
  const reportsToInsert: any[] = []

  tickerModels.forEach((modelMap, ticker) => {
    let modelsOk = 0
    
    ALL_MODELS.forEach(model => {
      const data = modelMap.get(model)
      if (data?.hasRaw || data?.hasScore) {
        modelsOk++
        byModel[model].ok++
      } else {
        byModel[model].missing++
        // Registrar en data_quality_reports
        reportsToInsert.push({
          sweep_id: sweepId,
          week_start: weekStart,
          ticker,
          model_name: model,
          status: 'missing',
          error_type: classifyErrorType(data?.error || null),
          original_error: data?.error || null,
          repair_attempts: 0,
        })
      }
    })

    if (modelsOk === 6) {
      completeCompanies++
    } else if (modelsOk > 0) {
      partialCompanies++
    } else {
      failedCompanies++
    }
  })

  // Calcular tasas
  const totalCompanies = tickerModels.size
  ALL_MODELS.forEach(model => {
    const stats = byModel[model]
    stats.rate = totalCompanies > 0 ? Math.round((stats.ok / totalCompanies) * 100) : 0
  })

  // 5. Insertar reportes de calidad (upsert para evitar duplicados)
  let insertedReports = 0
  if (reportsToInsert.length > 0) {
    console.log(`[analyze] Inserting ${reportsToInsert.length} quality reports...`)
    
    const { error: insertError } = await supabase
      .from('data_quality_reports')
      .upsert(reportsToInsert, { 
        onConflict: 'sweep_id,ticker,model_name',
        ignoreDuplicates: false 
      })

    if (insertError) {
      console.error('[analyze] Error inserting reports:', insertError.message)
    } else {
      insertedReports = reportsToInsert.length
    }
  }

  console.log(`[analyze] Complete: ${completeCompanies}, Partial: ${partialCompanies}, Failed: ${failedCompanies}`)

  return {
    sweepId,
    weekStart,
    totalCompanies,
    completeCompanies,
    partialCompanies,
    failedCompanies,
    byModel,
    insertedReports,
  }
}

// ============ REPAIR MISSING MODELS ============
async function repairMissingModels(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  forcedSweepId?: string,
  maxRepairs = 10
): Promise<RepairResult> {
  console.log(`[repair] Starting repair process, max=${maxRepairs}...`)

  // 1. Obtener reportes pendientes de reparación
  let query = supabase
    .from('data_quality_reports')
    .select('id, sweep_id, week_start, ticker, model_name, repair_attempts, error_type')
    .eq('status', 'missing')
    .lt('repair_attempts', 3) // Max 3 intentos
    .order('repair_attempts', { ascending: true }) // Priorizar los que menos intentos tienen
    .limit(maxRepairs)

  if (forcedSweepId) {
    query = query.eq('sweep_id', forcedSweepId)
  }

  const { data: pendingReports, error: fetchError } = await query

  if (fetchError) throw new Error(`Error fetching pending repairs: ${fetchError.message}`)
  if (!pendingReports || pendingReports.length === 0) {
    console.log('[repair] No pending repairs found')
    return { processed: 0, repaired: 0, failedRepairs: 0, skipped: 0, details: [] }
  }

  console.log(`[repair] Found ${pendingReports.length} pending repairs`)

  // 2. Agrupar por ticker para optimizar
  const tickerGroups = new Map<string, typeof pendingReports>()
  pendingReports.forEach((report: any) => {
    const existing = tickerGroups.get(report.ticker) || []
    existing.push(report)
    tickerGroups.set(report.ticker, existing)
  })

  const details: RepairResult['details'] = []
  let repaired = 0
  let failedRepairs = 0
  let skipped = 0

  // 3. Procesar cada ticker
  for (const [ticker, reports] of tickerGroups) {
    // Obtener info del issuer
    const { data: issuerData } = await supabase
      .from('repindex_root_issuers')
      .select('issuer_name')
      .eq('ticker', ticker)
      .maybeSingle()

    if (!issuerData) {
      console.log(`[repair] Ticker ${ticker} not found in issuers, skipping`)
      skipped += reports.length
      continue
    }

    const issuerName = issuerData.issuer_name

    // Procesar cada modelo faltante para este ticker
    for (const report of reports) {
      try {
        console.log(`[repair] Repairing ${ticker} - ${report.model_name}...`)

        // Incrementar contador de intentos
        await supabase
          .from('data_quality_reports')
          .update({ repair_attempts: report.repair_attempts + 1 })
          .eq('id', report.id)

        // Llamar a rix-search-v2 con single_model
        const searchResponse = await fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticker,
            issuer_name: issuerName,
            single_model: report.model_name,
            repair_mode: true,
          }),
        })

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text()
          throw new Error(`Search failed: ${searchResponse.status} - ${errorText}`)
        }

        const searchResult = await searchResponse.json()

        // Verificar si la reparación fue exitosa
        const modelResult = searchResult.model_results?.[report.model_name.toLowerCase()]
        const success = modelResult?.success || searchResult.success

        if (success) {
          // Marcar como reparado
          await supabase
            .from('data_quality_reports')
            .update({ 
              status: 'repaired',
              repaired_at: new Date().toISOString(),
            })
            .eq('id', report.id)

          repaired++
          details.push({ ticker, model: report.model_name, success: true })
          console.log(`[repair] ✓ Repaired ${ticker} - ${report.model_name}`)
        } else {
          const errorMsg = modelResult?.error || 'Unknown error'
          
          // Si ya alcanzó 3 intentos, marcar como failed_repair
          if (report.repair_attempts + 1 >= 3) {
            await supabase
              .from('data_quality_reports')
              .update({ 
                status: 'failed_repair',
                original_error: errorMsg,
              })
              .eq('id', report.id)
          }

          failedRepairs++
          details.push({ ticker, model: report.model_name, success: false, error: errorMsg })
          console.log(`[repair] ✗ Failed ${ticker} - ${report.model_name}: ${errorMsg}`)
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        failedRepairs++
        details.push({ ticker, model: report.model_name, success: false, error: errorMsg })
        console.error(`[repair] Exception for ${ticker} - ${report.model_name}:`, errorMsg)
      }
    }
  }

  console.log(`[repair] Complete: repaired=${repaired}, failed=${failedRepairs}, skipped=${skipped}`)

  return {
    processed: pendingReports.length,
    repaired,
    failedRepairs,
    skipped,
    details,
  }
}

// ============ GET QUALITY REPORT ============
async function getQualityReport(supabase: any, forcedSweepId?: string): Promise<ReportResult> {
  // Obtener el sweep más reciente si no se especifica
  let sweepId = forcedSweepId
  if (!sweepId) {
    const { data: latestReport } = await supabase
      .from('data_quality_reports')
      .select('sweep_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    sweepId = latestReport?.sweep_id
  }

  if (!sweepId) {
    return {
      latestSweep: null,
      weekStart: null,
      totalReports: 0,
      byStatus: { missing: 0, repaired: 0, failed_repair: 0 },
      byModel: {},
    }
  }

  // Obtener todos los reportes del sweep
  const { data: reports, error } = await supabase
    .from('data_quality_reports')
    .select('*')
    .eq('sweep_id', sweepId)

  if (error) throw new Error(`Error fetching reports: ${error.message}`)

  const byStatus = { missing: 0, repaired: 0, failed_repair: 0 }
  const byModel: Record<string, { missing: number; repaired: number; failed: number }> = {}

  ALL_MODELS.forEach(model => {
    byModel[model] = { missing: 0, repaired: 0, failed: 0 }
  })

  reports?.forEach((report: any) => {
    // Por status
    if (report.status === 'missing') byStatus.missing++
    else if (report.status === 'repaired') byStatus.repaired++
    else if (report.status === 'failed_repair') byStatus.failed_repair++

    // Por modelo
    const modelStats = byModel[report.model_name]
    if (modelStats) {
      if (report.status === 'missing') modelStats.missing++
      else if (report.status === 'repaired') modelStats.repaired++
      else if (report.status === 'failed_repair') modelStats.failed++
    }
  })

  return {
    latestSweep: sweepId,
    weekStart: reports?.[0]?.week_start || null,
    totalReports: reports?.length || 0,
    byStatus,
    byModel,
  }
}
