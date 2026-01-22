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
    'lovableproject.com',
    '127.0.0.1'
  ]
  
  const source = origin || referer
  console.log('Checking origin:', source)
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
    
    // Calculate date filter based on period
    const getDateFilter = (period: string): Date => {
      const dateFilter = new Date()
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
        default:
          dateFilter.setDate(dateFilter.getDate() - 30)
      }
      return dateFilter
    }

    // Route: GET /usage-logs
    if (req.method === 'GET' && path === '/usage-logs') {
      const period = url.searchParams.get('period') || '7d'
      const dateFilter = getDateFilter(period)

      const { data, error } = await supabaseAdmin
        .from('api_usage_logs')
        .select('*')
        .gte('created_at', dateFilter.toISOString())
        .order('created_at', { ascending: false })
        .limit(10000)

      if (error) throw error
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Route: GET /user-stats - User cost analysis
    if (req.method === 'GET' && path === '/user-stats') {
      const period = url.searchParams.get('period') || '7d'
      const dateFilter = getDateFilter(period)

      // Get usage logs with user info
      const { data: usageLogs, error: logsError } = await supabaseAdmin
        .from('api_usage_logs')
        .select('user_id, session_id, estimated_cost_usd, input_tokens, output_tokens, action_type, created_at')
        .gte('created_at', dateFilter.toISOString())
        .limit(10000)

      if (logsError) throw logsError

      // Get user profiles for mapping
      const userIds = [...new Set((usageLogs || []).filter(l => l.user_id).map(l => l.user_id))]
      
      let userProfiles: Record<string, { email: string; full_name: string | null }> = {}
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email, full_name')
          .in('id', userIds)

        if (!profilesError && profiles) {
          profiles.forEach(p => {
            userProfiles[p.id] = { email: p.email, full_name: p.full_name }
          })
        }
      }

      // Aggregate by user
      const userMap = new Map<string, {
        user_id: string | null
        email: string
        full_name: string | null
        total_cost: number
        total_calls: number
        total_input_tokens: number
        total_output_tokens: number
        actions: Record<string, number>
        first_call: string
        last_call: string
      }>()

      usageLogs?.forEach(log => {
        const key = log.user_id || `session:${log.session_id}`
        const isAnonymous = !log.user_id
        
        if (!userMap.has(key)) {
          const profile = log.user_id ? userProfiles[log.user_id] : null
          userMap.set(key, {
            user_id: log.user_id,
            email: profile?.email || (isAnonymous ? 'Infraestructura' : 'Usuario no encontrado'),
            full_name: profile?.full_name || null,
            total_cost: 0,
            total_calls: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            actions: {},
            first_call: log.created_at,
            last_call: log.created_at,
          })
        }

        const entry = userMap.get(key)!
        entry.total_cost += Number(log.estimated_cost_usd || 0)
        entry.total_calls++
        entry.total_input_tokens += log.input_tokens || 0
        entry.total_output_tokens += log.output_tokens || 0
        entry.actions[log.action_type] = (entry.actions[log.action_type] || 0) + 1
        
        if (log.created_at < entry.first_call) entry.first_call = log.created_at
        if (log.created_at > entry.last_call) entry.last_call = log.created_at
      })

      // Convert to array and sort by cost
      const userStats = Array.from(userMap.values())
        .map(u => ({
          ...u,
          avg_cost_per_call: u.total_calls > 0 ? u.total_cost / u.total_calls : 0,
        }))
        .sort((a, b) => b.total_cost - a.total_cost)

      // Calculate summary
      const totalUsers = userStats.filter(u => u.user_id).length
      const anonymousSessions = userStats.filter(u => !u.user_id).length
      const totalCost = userStats.reduce((sum, u) => sum + u.total_cost, 0)
      const avgCostPerUser = totalUsers > 0 ? totalCost / totalUsers : 0
      const topUser = userStats[0] || null

      return new Response(
        JSON.stringify({
          data: {
            users: userStats.slice(0, 50), // Top 50 users
            summary: {
              total_authenticated_users: totalUsers,
              anonymous_sessions: anonymousSessions,
              total_cost: totalCost,
              avg_cost_per_user: avgCostPerUser,
              top_user: topUser ? { email: topUser.email, cost: topUser.total_cost } : null,
            }
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Route: GET /action-metrics - Detailed action type metrics
    if (req.method === 'GET' && path === '/action-metrics') {
      const period = url.searchParams.get('period') || '7d'
      const dateFilter = getDateFilter(period)

      const { data: usageLogs, error: logsError } = await supabaseAdmin
        .from('api_usage_logs')
        .select('action_type, estimated_cost_usd, input_tokens, output_tokens, created_at')
        .gte('created_at', dateFilter.toISOString())
        .limit(10000)

      if (logsError) throw logsError

      // Aggregate by action type
      const actionMap = new Map<string, {
        action_type: string
        total_calls: number
        total_cost: number
        total_input_tokens: number
        total_output_tokens: number
        costs: number[] // For percentile calculations
      }>()

      usageLogs?.forEach(log => {
        if (!actionMap.has(log.action_type)) {
          actionMap.set(log.action_type, {
            action_type: log.action_type,
            total_calls: 0,
            total_cost: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            costs: [],
          })
        }

        const entry = actionMap.get(log.action_type)!
        const cost = Number(log.estimated_cost_usd || 0)
        entry.total_calls++
        entry.total_cost += cost
        entry.total_input_tokens += log.input_tokens || 0
        entry.total_output_tokens += log.output_tokens || 0
        entry.costs.push(cost)
      })

      // Calculate metrics
      const actionMetrics = Array.from(actionMap.values()).map(a => {
        const sortedCosts = a.costs.sort((x, y) => x - y)
        const p50Index = Math.floor(sortedCosts.length * 0.5)
        const p95Index = Math.floor(sortedCosts.length * 0.95)
        
        return {
          action_type: a.action_type,
          total_calls: a.total_calls,
          total_cost: a.total_cost,
          avg_cost: a.total_calls > 0 ? a.total_cost / a.total_calls : 0,
          median_cost: sortedCosts[p50Index] || 0,
          p95_cost: sortedCosts[p95Index] || 0,
          avg_input_tokens: a.total_calls > 0 ? a.total_input_tokens / a.total_calls : 0,
          avg_output_tokens: a.total_calls > 0 ? a.total_output_tokens / a.total_calls : 0,
          total_input_tokens: a.total_input_tokens,
          total_output_tokens: a.total_output_tokens,
        }
      }).sort((a, b) => b.total_cost - a.total_cost)

      // Calculate peak usage (hourly)
      const hourlyUsage = new Map<string, { cost: number; calls: number; tokens: number }>()
      usageLogs?.forEach(log => {
        const hourKey = log.created_at.substring(0, 13) // YYYY-MM-DDTHH
        if (!hourlyUsage.has(hourKey)) {
          hourlyUsage.set(hourKey, { cost: 0, calls: 0, tokens: 0 })
        }
        const entry = hourlyUsage.get(hourKey)!
        entry.cost += Number(log.estimated_cost_usd || 0)
        entry.calls++
        entry.tokens += (log.input_tokens || 0) + (log.output_tokens || 0)
      })

      const peakHour = Array.from(hourlyUsage.entries())
        .sort((a, b) => b[1].cost - a[1].cost)[0]

      return new Response(
        JSON.stringify({
          data: {
            actions: actionMetrics,
            peak_usage: peakHour ? {
              hour: peakHour[0],
              cost: peakHour[1].cost,
              calls: peakHour[1].calls,
              tokens: peakHour[1].tokens,
            } : null,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Route: GET /cost-config
    if (req.method === 'GET' && path === '/cost-config') {
      const period = url.searchParams.get('period') || '30d'
      const dateFilter = getDateFilter(period)

      // Get config data
      const { data: configData, error: configError } = await supabaseAdmin
        .from('api_cost_config')
        .select('*')
        .order('provider', { ascending: true })

      if (configError) throw configError

      // Get token usage per model
      const { data: usageLogs, error: usageError } = await supabaseAdmin
        .from('api_usage_logs')
        .select('provider, model, input_tokens, output_tokens')
        .gte('created_at', dateFilter.toISOString())
        .limit(50000)

      if (usageError) throw usageError

      // Aggregate tokens by model
      const tokensByModel = new Map<string, { input_tokens: number; output_tokens: number; calls: number }>()
      usageLogs?.forEach(log => {
        const key = `${log.provider}|${log.model}`
        const existing = tokensByModel.get(key) || { input_tokens: 0, output_tokens: 0, calls: 0 }
        existing.input_tokens += log.input_tokens || 0
        existing.output_tokens += log.output_tokens || 0
        existing.calls++
        tokensByModel.set(key, existing)
      })

      // Enrich config with token usage
      const enrichedConfig = (configData || []).map(config => {
        const key = `${config.provider}|${config.model}`
        const usage = tokensByModel.get(key) || { input_tokens: 0, output_tokens: 0, calls: 0 }
        return {
          ...config,
          total_input_tokens: usage.input_tokens,
          total_output_tokens: usage.output_tokens,
          total_calls: usage.calls,
        }
      })
      
      return new Response(
        JSON.stringify({ data: enrichedConfig }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Route: PUT /cost-config
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

    // Route: GET /supabase-metrics - Supabase usage metrics
    if (req.method === 'GET' && path === '/supabase-metrics') {
      const { data, error } = await supabaseAdmin
        .from('supabase_usage_metrics')
        .select('*')
        .order('period_end', { ascending: false })
        .limit(12) // Last 12 entries

      if (error) {
        // Table might not exist yet
        console.log('supabase_usage_metrics table not found or error:', error.message)
        return new Response(
          JSON.stringify({ data: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Route: POST /supabase-metrics - Add Supabase usage metrics
    if (req.method === 'POST' && path === '/supabase-metrics') {
      const body = await req.json()
      
      const { error } = await supabaseAdmin
        .from('supabase_usage_metrics')
        .insert(body)

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
