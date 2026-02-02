import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * STRICT origin allowlist:
 * - localhost / 127.0.0.1 (local development)
 * - *.lovableproject.com (Lovable project hosting)
 * - lovable.dev (Lovable dev tools)
 * - lovable.app ONLY if subdomain contains 'preview' (NOT production domains like repindex-v1.lovable.app)
 */
function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || ''
  const referer = req.headers.get('referer') || ''
  const source = origin || referer

  if (!source) {
    console.log('[admin-cron-triggers] No origin/referer header found, denying')
    return false
  }

  console.log('[admin-cron-triggers] Checking origin:', source)

  // Always allow localhost
  if (source.includes('localhost') || source.includes('127.0.0.1')) {
    return true
  }

  // Allow lovableproject.com (development project hosting)
  if (source.includes('lovableproject.com')) {
    return true
  }

  // Allow lovable.dev (development tools)
  if (source.includes('lovable.dev')) {
    return true
  }

  // Allow lovable.app ONLY if it contains 'preview' in the subdomain
  // This blocks production domains like repindex-v1.lovable.app
  if (source.includes('lovable.app')) {
    if (source.includes('preview')) {
      return true
    }
    console.log('[admin-cron-triggers] lovable.app domain without "preview" - denying:', source)
    return false
  }

  console.log('[admin-cron-triggers] Origin not in allowlist:', source)
  return false
}

type AllowedAction = 'repair_analysis' | 'auto_populate_vectors' | 'vector_store_continue' | 'get_latest'

const ALLOWED_ACTIONS: AllowedAction[] = ['repair_analysis', 'auto_populate_vectors', 'vector_store_continue', 'get_latest']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (!isAllowedOrigin(req)) {
      return new Response(JSON.stringify({ error: 'Forbidden: Preview only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const body = await req.json().catch(() => ({}))
    const action = body?.action as AllowedAction | undefined
    const params = (body?.params ?? {}) as Record<string, unknown>

    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // ============ ACTION: get_latest ============
    // Returns the most recent trigger for a given action type
    if (action === 'get_latest') {
      const filterAction = (params.filter_action as string) || 'repair_analysis'
      
      const { data, error } = await supabaseAdmin
        .from('cron_triggers')
        .select('id, created_at, status, action, processed_at, result')
        .eq('action', filterAction)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error

      return new Response(JSON.stringify({ trigger: data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ============ ACTION: repair_analysis ============
    // Creates a new trigger for the orchestrator to process
    const { data, error } = await supabaseAdmin
      .from('cron_triggers')
      .insert({
        action,
        params,
        status: 'pending',
      })
      .select('id, created_at, status, action')
      .single()

    if (error) throw error

    return new Response(JSON.stringify({ trigger: data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[admin-cron-triggers] Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
