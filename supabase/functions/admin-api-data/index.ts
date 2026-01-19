import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Check if request comes from Preview/development environment
function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || ''
  const referer = req.headers.get('referer') || ''
  
  const allowedPatterns = [
    'localhost',
    'preview',
    'lovable.dev',
    '127.0.0.1'
  ]
  
  const source = origin || referer
  return allowedPatterns.some(pattern => source.toLowerCase().includes(pattern))
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Security check: only allow Preview/development origins
    if (!isAllowedOrigin(req)) {
      console.log('Blocked request from non-preview origin:', req.headers.get('origin'))
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin API only available in Preview' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client with service role (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const url = new URL(req.url)
    const path = url.pathname.replace('/admin-api-data', '')
    
    // Route handling
    if (req.method === 'GET' && path === '/usage-logs') {
      const period = url.searchParams.get('period') || '7d'
      
      let dateFilter = new Date()
      switch (period) {
        case '24h':
          dateFilter.setHours(dateFilter.getHours() - 24)
          break
        case '7d':
          dateFilter.setDate(dateFilter.getDate() - 7)
          break
        case '30d':
          dateFilter.setDate(dateFilter.getDate() - 30)
          break
        case '90d':
          dateFilter.setDate(dateFilter.getDate() - 90)
          break
      }

      const { data, error } = await supabaseAdmin
        .from('api_usage_logs')
        .select('*')
        .gte('created_at', dateFilter.toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method === 'GET' && path === '/cost-config') {
      const { data, error } = await supabaseAdmin
        .from('api_cost_config')
        .select('*')
        .order('provider', { ascending: true })

      if (error) throw error
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method === 'PUT' && path === '/cost-config') {
      const body = await req.json()
      const { id, input_cost_per_million, output_cost_per_million } = body

      const { error } = await supabaseAdmin
        .from('api_cost_config')
        .update({
          input_cost_per_million,
          output_cost_per_million,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) throw error
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Admin API error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
