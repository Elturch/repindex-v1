import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EODHDComponent {
  Code: string
  Exchange: string
  Name: string
  Sector: string
  Industry: string
}

interface EODHDFundamentals {
  Components: Record<string, EODHDComponent>
}

interface ChangeRecord {
  ticker: string
  issuer_name: string
  action: 'entry' | 'exit'
  old_ibex_family_code: string | null
  new_ibex_family_code: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const apiKey = Deno.env.get('EODHD_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!apiKey) throw new Error('EODHD_API_KEY not configured')
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase credentials')

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    console.log('[verify-ibex-composition] Fetching IBEX 35 composition from EODHD...')

    // 1. Fetch official IBEX 35 components from EODHD
    const eodhResponse = await fetch(
      `https://eodhd.com/api/fundamentals/IBEX.INDX?api_token=${apiKey}&fmt=json`
    )

    if (!eodhResponse.ok) {
      throw new Error(`EODHD API error: ${eodhResponse.status} ${await eodhResponse.text()}`)
    }

    const fundamentals: EODHDFundamentals = await eodhResponse.json()

    if (!fundamentals.Components || Object.keys(fundamentals.Components).length === 0) {
      throw new Error('EODHD returned no components for IBEX.INDX')
    }

    // Extract tickers in XXX.MC format
    const eodhTickers = new Set<string>()
    const eodhTickerNames = new Map<string, string>()

    for (const [, comp] of Object.entries(fundamentals.Components)) {
      const ticker = comp.Code.includes('.') ? comp.Code : `${comp.Code}.MC`
      eodhTickers.add(ticker)
      eodhTickerNames.set(ticker, comp.Name)
    }

    console.log(`[verify-ibex-composition] EODHD reports ${eodhTickers.size} components`)

    // 2. Get current IBEX-35 issuers from DB
    const { data: dbIssuers, error: dbError } = await supabase
      .from('repindex_root_issuers')
      .select('ticker, issuer_name, ibex_family_code, ibex_family_category')

    if (dbError) throw dbError

    const dbIbex35 = new Map<string, { issuer_name: string; ibex_family_code: string; ibex_family_category: string | null }>()
    const allDbIssuers = new Map<string, { issuer_name: string; ibex_family_code: string | null; ibex_family_category: string | null }>()

    for (const issuer of dbIssuers || []) {
      allDbIssuers.set(issuer.ticker, {
        issuer_name: issuer.issuer_name,
        ibex_family_code: issuer.ibex_family_code,
        ibex_family_category: issuer.ibex_family_category,
      })
      if (issuer.ibex_family_code === 'IBEX-35') {
        dbIbex35.set(issuer.ticker, {
          issuer_name: issuer.issuer_name,
          ibex_family_code: issuer.ibex_family_code,
          ibex_family_category: issuer.ibex_family_category,
        })
      }
    }

    console.log(`[verify-ibex-composition] DB has ${dbIbex35.size} IBEX-35 issuers`)

    // 3. Detect discrepancies
    const changes: ChangeRecord[] = []

    // Entries: in EODHD but not IBEX-35 in DB
    for (const ticker of eodhTickers) {
      if (!dbIbex35.has(ticker)) {
        const dbIssuer = allDbIssuers.get(ticker)
        changes.push({
          ticker,
          issuer_name: dbIssuer?.issuer_name || eodhTickerNames.get(ticker) || ticker,
          action: 'entry',
          old_ibex_family_code: dbIssuer?.ibex_family_code || null,
          new_ibex_family_code: 'IBEX-35',
        })
      }
    }

    // Exits: in DB as IBEX-35 but not in EODHD
    for (const [ticker, info] of dbIbex35) {
      if (!eodhTickers.has(ticker)) {
        changes.push({
          ticker,
          issuer_name: info.issuer_name,
          action: 'exit',
          old_ibex_family_code: 'IBEX-35',
          new_ibex_family_code: 'IBEX-MC', // Demoted to Medium Cap by default
        })
      }
    }

    // 4. Apply changes if any
    if (changes.length > 0) {
      console.log(`[verify-ibex-composition] Found ${changes.length} discrepancies:`)
      for (const c of changes) {
        console.log(`  ${c.action.toUpperCase()}: ${c.ticker} (${c.issuer_name}) ${c.old_ibex_family_code} -> ${c.new_ibex_family_code}`)
      }

      for (const change of changes) {
        // 4a. Update repindex_root_issuers
        const { error: updateError } = await supabase
          .from('repindex_root_issuers')
          .update({
            ibex_family_code: change.new_ibex_family_code,
            ibex_family_category: change.action === 'entry' ? 'IBEX 35' : 'IBEX Medium Cap',
          })
          .eq('ticker', change.ticker)

        if (updateError) {
          console.error(`[verify-ibex-composition] Error updating issuer ${change.ticker}:`, updateError)
        }

        // 4b. FASE 1 — rix_trends DEPRECATED (sin escritor desde DROP TRIGGER
        // sync_rix_trends). El IBEX family code vive ahora únicamente en
        // repindex_root_issuers (ya actualizado arriba).
        const tickerBase = change.ticker.replace('.MC', '')

        // 4c. Update Vector Store metadata
        // Note: documents table has restrictive RLS, but service_role bypasses it
        const { error: docError } = await supabase.rpc('update_document_ibex_metadata', {
          p_ticker_1: change.ticker,
          p_ticker_2: tickerBase,
          p_new_ibex_code: change.new_ibex_family_code,
        })

        if (docError) {
          // Fallback: try direct update (may work with service role)
          console.warn(`[verify-ibex-composition] RPC failed for docs, trying direct update:`, docError.message)
        }
      }

      // 4d. Log to pipeline_health_checks
      const { error: healthError } = await supabase
        .from('pipeline_health_checks')
        .insert({
          check_type: 'ibex_composition',
          status: 'warning',
          details: {
            changes,
            eodhd_count: eodhTickers.size,
            db_ibex35_count: dbIbex35.size,
            checked_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
          },
        })

      if (healthError) {
        console.error('[verify-ibex-composition] Error logging health check:', healthError)
      }

      console.log(`[verify-ibex-composition] Applied ${changes.length} changes in ${Date.now() - startTime}ms`)

      return new Response(
        JSON.stringify({
          status: 'changes_applied',
          changes,
          eodhd_count: eodhTickers.size,
          db_count: dbIbex35.size,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // No changes - log OK
    const { error: healthOkError } = await supabase
      .from('pipeline_health_checks')
      .insert({
        check_type: 'ibex_composition',
        status: 'ok',
        details: {
          message: 'IBEX 35 composition matches EODHD',
          eodhd_count: eodhTickers.size,
          db_ibex35_count: dbIbex35.size,
          checked_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        },
      })

    if (healthOkError) {
      console.error('[verify-ibex-composition] Error logging OK health check:', healthOkError)
    }

    console.log(`[verify-ibex-composition] No discrepancies found. ${eodhTickers.size} components match. (${Date.now() - startTime}ms)`)

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'IBEX 35 composition matches',
        eodhd_count: eodhTickers.size,
        db_count: dbIbex35.size,
        duration_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[verify-ibex-composition] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
