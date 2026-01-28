import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || ''
  const referer = req.headers.get('referer') || ''

  const allowedPatterns = [
    'localhost',
    '127.0.0.1',
    'preview',
    'lovable.dev',
    'lovable.app',
    'lovableproject.com',
  ]

  const source = origin || referer
  console.log('[admin-cron-triggers] Checking origin:', source)
  return allowedPatterns.some((pattern) => source.toLowerCase().includes(pattern))
}

type AllowedAction = 'repair_analysis'

const ALLOWED_ACTIONS: AllowedAction[] = ['repair_analysis']

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
