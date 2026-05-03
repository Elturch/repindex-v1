import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 6 modelos que monitoreamos (display names esperados)
const ALL_MODELS = ['ChatGPT', 'Deepseek', 'Google Gemini', 'Grok', 'Perplexity', 'Qwen']

// Alias de nombres para normalizar 'Gemini' ↔ 'Google Gemini'
const MODEL_ALIASES: Record<string, string> = {
  'Gemini': 'Google Gemini',
  'Google Gemini': 'Google Gemini',
}

// Normaliza el nombre de modelo a un canonical name (aplica alias)
function normalizeModelName(name: string): string {
  if (!name) return 'Unknown'
  return MODEL_ALIASES[name] || name
}

// ============ DEDUPE HELPER ============
// Defensa en profundidad: garantiza que un mismo (sweep_id, ticker, model_name)
// no se intente upsertar dos veces en el mismo batch. La Capa 1 ya impide que
// se generen duplicados, pero este filtro nos protege de futuras regresiones
// y deja un log explícito si alguna vez vuelven a aparecer.
function dedupeReports(reports: any[]): { unique: any[]; deduped: number } {
  const seen = new Set<string>()
  const unique: any[] = []
  for (const r of reports) {
    const key = `${r.sweep_id}|${r.ticker}|${r.model_name}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }
  return { unique, deduped: reports.length - unique.length }
}

// Columnas de respuesta bruta por modelo (usando canonical names)
const MODEL_RAW_COLUMNS: Record<string, string> = {
  'ChatGPT': '20_res_gpt_bruto',
  'Deepseek': '23_res_deepseek_bruto',
  'Google Gemini': '22_res_gemini_bruto',
  'Grok': 'respuesta_bruto_grok',
  'Perplexity': '21_res_perplex_bruto',
  'Qwen': 'respuesta_bruto_qwen',
}

// ============ PATRONES DE RECHAZO BILINGÜE ============
const REJECTION_PATTERNS = [
  // === INGLÉS ===
  /I('m| am) sorry/i,
  /I must decline/i,
  /I cannot (provide|generate|create|assist)/i,
  /I can('t|not) (assist|generate|provide)/i,
  /I apologize/i,
  /decline (this|the) request/i,
  /violates my guidelines/i,
  /misleading (or |information)/i,
  /fabricat(ed|ing)|fictional report/i,
  /future (time )?period/i,
  /beyond my knowledge/i,
  /invented information/i,
  /no real (data|information)/i,
  /unable to (generate|provide|create)/i,
  /not (able|possible) to (generate|provide)/i,
  
  // === ESPAÑOL ===
  /Lo siento/i,
  /no puedo (generar|proporcionar|crear|asistir)/i,
  /debo declinar/i,
  /violar(ía|a) mis directrices/i,
  /información (ficticia|inventada|engañosa)/i,
  /informes? (ficticios?|especulativos?)/i,
  /eventos? futuros?/i,
  /no existe información/i,
  /proporcionar información precisa/i,
  /no es posible generar/i,
  /no me es posible/i,
  /datos? (inventados?|ficticios?)/i,
  /período futuro/i,
  /fecha futura/i,
]

// Marcadores de estructura esperados (bilingüe)
const STRUCTURE_MARKERS = [
  /## (Resumen|Summary)/i,
  /## (Ejecutivo|Executive)/i,
  /## (Hechos|Facts|Noticias|News)/i,
  /## (Contexto|Context)/i,
  /## (Análisis|Analysis)/i,
]

// ============ VALIDACIÓN DE RESPUESTA ============
interface ValidationResult {
  isValid: boolean
  errorType: 'rejection' | 'too_short' | 'no_structure' | null
  reason: string | null
  language?: 'es' | 'en' | 'unknown'
}

function validateResponse(response: string | null): ValidationResult {
  // Sin respuesta
  if (!response || response.trim().length === 0) {
    return { isValid: false, errorType: 'too_short', reason: 'Empty response' }
  }

  // Demasiado corta (< 500 chars = casi seguro inválida)
  if (response.length < 500) {
    return { 
      isValid: false, 
      errorType: 'too_short', 
      reason: `Only ${response.length} chars (min: 500)` 
    }
  }

  // Detectar idioma para info adicional
  const isSpanish = /[áéíóúñ¿¡]/i.test(response) || 
                    /\b(del|para|con|que|los|las|una|como|este|esta)\b/i.test(response)

  // Patrones de rechazo (bilingüe)
  for (const pattern of REJECTION_PATTERNS) {
    if (pattern.test(response)) {
      return { 
        isValid: false, 
        errorType: 'rejection', 
        reason: `Matched rejection pattern: ${pattern.toString().slice(0, 40)}...`,
        language: isSpanish ? 'es' : 'en'
      }
    }
  }

  // Respuestas sospechosamente cortas (500-2000 chars) sin estructura
  if (response.length < 2000) {
    const hasStructure = STRUCTURE_MARKERS.some(m => m.test(response))
    if (!hasStructure) {
      return { 
        isValid: false, 
        errorType: 'no_structure', 
        reason: 'Short response without expected report structure' 
      }
    }
  }

  return { isValid: true, errorType: null, reason: null }
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
  byStatus: { missing: number; repaired: number; failed_repair: number; invalid_response: number }
  byModel: Record<string, { missing: number; repaired: number; failed: number; invalid: number }>
}

interface SanitizeResult {
  sweepId: string
  scanned: number
  invalidFound: number
  byModel: Record<string, { valid: number; invalid: number; byErrorType: Record<string, number> }>
  registered: number
  details: { ticker: string; model: string; errorType: string; reason: string }[]
}

// ============ GET ACTIVE SWEEP ID FROM DATA ============
async function getActiveSweepId(supabase: any): Promise<string> {
  // Read the most recent 06_period_from from rix_runs_v2
  const { data, error } = await supabase
    .from('rix_runs_v2')
    .select('"06_period_from"')
    .not('"06_period_from"', 'is', null)
    .order('"06_period_from"', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data || !data['06_period_from']) {
    // Fallback to calendar-based calculation
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
    return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
  }

  // Parse the date and calculate ISO week
  const periodFrom = new Date(data['06_period_from'])
  const year = periodFrom.getFullYear()
  
  // Calculate ISO week number
  const startOfYear = new Date(year, 0, 1)
  const days = Math.floor((periodFrom.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
  
  console.log(`[getActiveSweepId] Derived from data: ${data['06_period_from']} → ${year}-W${String(weekNumber).padStart(2, '0')}`)
  
  return `${year}-W${String(weekNumber).padStart(2, '0')}`
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
    // Capa 3: gate doble. auto_repair sólo se activa si se pasa explícitamente
    // auto_repair=true Y force=true. El CRON queda neutralizado por defecto;
    // sólo invocaciones manuales explícitas pueden disparar la cadena de repair.
    const autoRepair = body.auto_repair === true && body.force === true

    console.log(`[rix-quality-watchdog] Action: ${action}, sweepId: ${sweepId || 'latest'}`)

    // ============ ACTION: ANALYZE ============
    if (action === 'analyze') {
      const result = await analyzeQuality(supabase, sweepId)
      return new Response(JSON.stringify({ success: true, action: 'analyze', ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ============ ACTION: SANITIZE ============
    if (action === 'sanitize') {
      const result = await sanitizeResponses(supabase, sweepId)
      
      // Si auto_repair está activo y hay inválidos, triggear reparación
      if (autoRepair && result.invalidFound > 0) {
        console.log(`[sanitize] Auto-repair gated; invalidFound=${result.invalidFound}, force=${body.force === true} → inserting repair_invalid_responses trigger`)
        // Insert trigger for server-side repair
        await supabase.from('cron_triggers').insert({
          action: 'repair_invalid_responses',
          params: { sweep_id: result.sweepId, max_repairs: maxRepairs },
          status: 'pending',
        })
      }
      
      return new Response(JSON.stringify({ success: true, action: 'sanitize', ...result }), {
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

    return new Response(JSON.stringify({ error: 'Invalid action. Use: analyze, sanitize, repair, or report' }), {
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

// ============ SANITIZE RESPONSES ============
async function sanitizeResponses(supabase: any, forcedSweepId?: string): Promise<SanitizeResult> {
  console.log('[sanitize] Starting response sanitization...')

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
      scanned: 0,
      invalidFound: 0,
      byModel: {},
      registered: 0,
      details: [],
    }
  }

  const sweepId = forcedSweepId || latestRun.batch_execution_date
  const weekStart = latestRun['06_period_from']
  console.log(`[sanitize] Analyzing sweep: ${sweepId}, week: ${weekStart}`)

  // 2. Obtener todos los registros de la semana con respuestas brutas
  const { data: records, error: recordsError } = await supabase
    .from('rix_runs_v2')
    .select(`
      id,
      "02_model_name",
      "05_ticker",
      "20_res_gpt_bruto",
      "21_res_perplex_bruto",
      "22_res_gemini_bruto",
      "23_res_deepseek_bruto",
      respuesta_bruto_grok,
      respuesta_bruto_qwen
    `)
    .eq('batch_execution_date', sweepId)
    .range(0, 9999) // Capa 1: evita el truncamiento default de 1.000 filas

  if (recordsError) throw new Error(`Error fetching records: ${recordsError.message}`)
  if (!records || records.length === 0) {
    return {
      sweepId,
      scanned: 0,
      invalidFound: 0,
      byModel: {},
      registered: 0,
      details: [],
    }
  }

  console.log(`[sanitize] Found ${records.length} records to scan`)

  // 3. Inicializar contadores por modelo
  const byModel: Record<string, { valid: number; invalid: number; byErrorType: Record<string, number> }> = {}
  ALL_MODELS.forEach(model => {
    byModel[model] = { valid: 0, invalid: 0, byErrorType: {} }
  })

  const reportsToInsert: any[] = []
  const details: SanitizeResult['details'] = []
  let scanned = 0

  // 4. Validar cada respuesta de cada modelo
  for (const record of records) {
    const ticker = record['05_ticker']
    if (!ticker) continue

    for (const [model, column] of Object.entries(MODEL_RAW_COLUMNS)) {
      const response = record[column]
      scanned++

      const validation = validateResponse(response)

      if (validation.isValid) {
        byModel[model].valid++
      } else {
        byModel[model].invalid++
        const errorType = validation.errorType || 'unknown'
        byModel[model].byErrorType[errorType] = (byModel[model].byErrorType[errorType] || 0) + 1

        details.push({
          ticker,
          model,
          errorType,
          reason: validation.reason || 'Unknown',
        })

        // Preparar reporte para insertar
        reportsToInsert.push({
          sweep_id: sweepId,
          week_start: weekStart,
          ticker,
          model_name: model,
          status: 'invalid_response',
          error_type: errorType,
          original_error: validation.reason,
          repair_attempts: 0,
        })
      }
    }
  }

  // 5. Insertar reportes de calidad (upsert para evitar duplicados)
  let registered = 0
  if (reportsToInsert.length > 0) {
    console.log(`[sanitize] Registering ${reportsToInsert.length} invalid responses...`)
    
    const { error: insertError } = await supabase
      .from('data_quality_reports')
      .upsert(reportsToInsert, { 
        onConflict: 'sweep_id,ticker,model_name',
        ignoreDuplicates: false 
      })

    if (insertError) {
      console.error('[sanitize] Error inserting reports:', insertError.message)
    } else {
      registered = reportsToInsert.length
    }
  }

  const invalidFound = details.length
  console.log(`[sanitize] Complete: scanned=${scanned}, invalidFound=${invalidFound}, registered=${registered}`)

  return {
    sweepId,
    scanned,
    invalidFound,
    byModel,
    registered,
    details,
  }
}

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
    const rawModelName = record['02_model_name']
    if (!ticker || !rawModelName) return

    // Normalizar nombre de modelo para que 'Gemini' y 'Google Gemini' se traten igual
    const modelName = normalizeModelName(rawModelName)

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

  // 1. Obtener reportes pendientes de reparación (missing O invalid_response)
  let query = supabase
    .from('data_quality_reports')
    .select('id, sweep_id, week_start, ticker, model_name, repair_attempts, error_type, status')
    .in('status', ['missing', 'invalid_response'])
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
        console.log(`[repair] Repairing ${ticker} - ${report.model_name} (status: ${report.status})...`)

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
  // Get active sweep ID from actual data, not calendar
  let sweepId = forcedSweepId
  if (!sweepId) {
    sweepId = await getActiveSweepId(supabase)
    console.log(`[report] Using active sweep ID from data: ${sweepId}`)
  }

  // Empty result if no reports exist for this sweep yet
  const emptyResult: ReportResult = {
    latestSweep: sweepId,
    weekStart: null,
    totalReports: 0,
    byStatus: { missing: 0, repaired: 0, failed_repair: 0, invalid_response: 0 },
    byModel: {},
  }

  // Obtener todos los reportes del sweep
  const { data: reports, error } = await supabase
    .from('data_quality_reports')
    .select('*')
    .eq('sweep_id', sweepId)

  if (error) throw new Error(`Error fetching reports: ${error.message}`)

  const byStatus = { missing: 0, repaired: 0, failed_repair: 0, invalid_response: 0 }
  const byModel: Record<string, { missing: number; repaired: number; failed: number; invalid: number }> = {}

  ALL_MODELS.forEach(model => {
    byModel[model] = { missing: 0, repaired: 0, failed: 0, invalid: 0 }
  })

  reports?.forEach((report: any) => {
    // Por status
    if (report.status === 'missing') byStatus.missing++
    else if (report.status === 'repaired') byStatus.repaired++
    else if (report.status === 'failed_repair') byStatus.failed_repair++
    else if (report.status === 'invalid_response') byStatus.invalid_response++

    // Por modelo (normalizar nombre para alias)
    const normalizedModel = normalizeModelName(report.model_name)
    const modelStats = byModel[normalizedModel]
    if (modelStats) {
      if (report.status === 'missing') modelStats.missing++
      else if (report.status === 'repaired') modelStats.repaired++
      else if (report.status === 'failed_repair') modelStats.failed++
      else if (report.status === 'invalid_response') modelStats.invalid++
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
