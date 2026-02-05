import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
    
    // Helper function to fetch ALL usage logs with pagination (bypasses 1000 row limit)
    async function fetchAllUsageLogs(
      supabaseAdmin: any, 
      start: Date, 
      end?: Date,
      selectColumns = '*'
    ): Promise<any[]> {
      const pageSize = 1000
      let allData: any[] = []
      let page = 0
      let hasMore = true

      while (hasMore) {
        let query = supabaseAdmin
          .from('api_usage_logs')
          .select(selectColumns)
          .gte('created_at', start.toISOString())
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)
        
        if (end) {
          query = query.lte('created_at', end.toISOString())
        }
        
        const { data, error } = await query
        
        if (error) throw error
        
        if (data && data.length > 0) {
          allData = [...allData, ...data]
          hasMore = data.length === pageSize
          page++
        } else {
          hasMore = false
        }
      }
      
      console.log(`[admin-api-data] Fetched ${allData.length} total rows across ${page} pages`)
      return allData
    }
    
    // Calculate date filter based on period (Spain CET timezone for month filters)
    const getDateFilter = (period: string): { start: Date; end?: Date } => {
      // Handle specific month periods like 'jan-2026' with Spain timezone (CET = UTC+1)
      if (period.match(/^[a-z]{3}-\d{4}$/)) {
        const [monthStr, yearStr] = period.split('-')
        const monthMap: Record<string, number> = {
          'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
          'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
        }
        const month = monthMap[monthStr]
        const year = parseInt(yearStr)
        
        // Spain CET = UTC+1 (winter) / CEST = UTC+2 (summer)
        // January is winter, so CET (UTC+1)
        // Start: 00:00:00 CET on 1st = 23:00:00 UTC on previous day
        // End: 23:59:59 CET on last day = 22:59:59 UTC on last day
        const cetOffset = 1 // hours (CET in winter)
        
        // First day of month at 00:00 CET
        const startUTC = new Date(Date.UTC(year, month, 1, 0 - cetOffset, 0, 0, 0))
        // Last day of month at 23:59:59 CET
        const lastDay = new Date(year, month + 1, 0).getDate()
        const endUTC = new Date(Date.UTC(year, month, lastDay, 23 - cetOffset, 59, 59, 999))
        
        console.log(`[admin-api-data] Month filter ${period}: ${startUTC.toISOString()} to ${endUTC.toISOString()}`)
        return { start: startUTC, end: endUTC }
      }
      
      // Handle relative periods (use current time)
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
        case 'all':
          dateFilter.setFullYear(2024, 0, 1) // All historical data
          break
        default:
          dateFilter.setDate(dateFilter.getDate() - 30)
      }
      return { start: dateFilter }
    }

    // Route: GET /usage-logs (with full pagination to bypass 1000 row limit)
    if (req.method === 'GET' && path === '/usage-logs') {
      const period = url.searchParams.get('period') || '7d'
      const { start, end } = getDateFilter(period)

      const data = await fetchAllUsageLogs(supabaseAdmin, start, end)
      
      console.log(`[admin-api-data] /usage-logs period=${period} returned ${data.length} rows (paginated)`)
      
      return new Response(
        JSON.stringify({ data, totalCount: data.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Route: GET /user-stats - User cost analysis (with full pagination)
    if (req.method === 'GET' && path === '/user-stats') {
      const period = url.searchParams.get('period') || '7d'
      const { start, end } = getDateFilter(period)

      // Get ALL usage logs with pagination
      const usageLogs = await fetchAllUsageLogs(
        supabaseAdmin, 
        start, 
        end,
        'user_id, session_id, estimated_cost_usd, input_tokens, output_tokens, action_type, created_at'
      )

      // Get user profiles for mapping
      const userIds = [...new Set(usageLogs.filter(l => l.user_id).map(l => l.user_id))]
      
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

    // Route: GET /action-metrics - Detailed action type metrics (with full pagination)
    if (req.method === 'GET' && path === '/action-metrics') {
      const period = url.searchParams.get('period') || '7d'
      const { start, end } = getDateFilter(period)

      // Get ALL usage logs with pagination
      const usageLogs = await fetchAllUsageLogs(
        supabaseAdmin,
        start,
        end,
        'action_type, estimated_cost_usd, input_tokens, output_tokens, created_at'
      )

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
      const { start, end } = getDateFilter(period)

      // Get config data
      const { data: configData, error: configError } = await supabaseAdmin
        .from('api_cost_config')
        .select('*')
        .order('provider', { ascending: true })

      if (configError) throw configError

      // Get ALL token usage per model from usage logs (with pagination)
      const usageLogs = await fetchAllUsageLogs(
        supabaseAdmin,
        start,
        end,
        'provider, model, input_tokens, output_tokens, estimated_cost_usd'
      )

      // Aggregate tokens by provider/model combination
      const tokensByModel = new Map<string, {
        provider: string
        model: string
        input_tokens: number
        output_tokens: number
        calls: number
        total_cost: number
      }>()
      
      usageLogs?.forEach(log => {
        const key = `${log.provider}|${log.model}`
        const existing = tokensByModel.get(key) || { 
          provider: log.provider,
          model: log.model,
          input_tokens: 0, 
          output_tokens: 0, 
          calls: 0,
          total_cost: 0
        }
        existing.input_tokens += log.input_tokens || 0
        existing.output_tokens += log.output_tokens || 0
        existing.calls++
        existing.total_cost += Number(log.estimated_cost_usd || 0)
        tokensByModel.set(key, existing)
      })

      // Convert to array and sort by total tokens
      const modelUsage = Array.from(tokensByModel.values())
        .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens))

      // Enrich config with token usage for matching models
      const enrichedConfig = (configData || []).map(config => {
        const key = `${config.provider}|${config.model}`
        const usage = tokensByModel.get(key) || { input_tokens: 0, output_tokens: 0, calls: 0, total_cost: 0 }
        return {
          ...config,
          total_input_tokens: usage.input_tokens,
          total_output_tokens: usage.output_tokens,
          total_calls: usage.calls,
        }
      })
      
      return new Response(
        JSON.stringify({ 
          data: enrichedConfig,
          model_usage: modelUsage
        }),
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

    // Route: GET /depth-analytics - Agente Rix usage by depth level
    if (req.method === 'GET' && path === '/depth-analytics') {
      const period = url.searchParams.get('period') || '30d'
      const { start, end } = getDateFilter(period)

      // Get ALL chat-intelligence logs with pagination
      const usageLogs = await fetchAllUsageLogs(
        supabaseAdmin,
        start,
        end,
        'user_id, session_id, estimated_cost_usd, input_tokens, output_tokens, action_type, metadata, created_at'
      )

      // Filter to only chat-intelligence related actions
      const chatLogs = usageLogs.filter(log => 
        ['chat', 'enrich', 'bulletin'].includes(log.action_type)
      )

      // Get user profiles for mapping
      const userIds = [...new Set(chatLogs.filter(l => l.user_id).map(l => l.user_id))]
      let userProfiles: Record<string, { email: string; full_name: string | null }> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email, full_name')
          .in('id', userIds)
        if (profiles) {
          profiles.forEach(p => {
            userProfiles[p.id] = { email: p.email, full_name: p.full_name }
          })
        }
      }

      // Aggregate by depth_level
      const depthStats: Record<string, { 
        calls: number; 
        cost: number; 
        input_tokens: number; 
        output_tokens: number;
        users: Set<string>;
      }> = {
        quick: { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0, users: new Set() },
        complete: { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0, users: new Set() },
        exhaustive: { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0, users: new Set() },
        enrich: { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0, users: new Set() },
        bulletin: { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0, users: new Set() },
        unknown: { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0, users: new Set() },
      }

      // User-level aggregation
      const userDepthMap = new Map<string, {
        user_id: string | null;
        email: string;
        full_name: string | null;
        quick: { calls: number; cost: number };
        complete: { calls: number; cost: number };
        exhaustive: { calls: number; cost: number };
        enrich: { calls: number; cost: number };
        bulletin: { calls: number; cost: number };
        total_cost: number;
        total_calls: number;
      }>()

      chatLogs.forEach(log => {
        // Extract depth_level from metadata (with fallback inference)
        let depthLevel = log.metadata?.depth_level || 'unknown'
        
        // Fallback: Infer from tokens if no depth_level in metadata
        // Thresholds adjusted based on real-world usage patterns (Jan 2026)
        if (depthLevel === 'unknown' && log.action_type === 'chat') {
          const totalTokens = (log.input_tokens || 0) + (log.output_tokens || 0)
          if (totalTokens > 55000) depthLevel = 'exhaustive'
          else if (totalTokens > 30000) depthLevel = 'complete'
          else depthLevel = 'quick'
        }
        
        // Override for specific action types
        if (log.action_type === 'enrich') depthLevel = 'enrich'
        if (log.action_type === 'bulletin') depthLevel = 'bulletin'
        
        // Aggregate by depth
        if (!depthStats[depthLevel]) {
          depthStats[depthLevel] = { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0, users: new Set() }
        }
        depthStats[depthLevel].calls++
        depthStats[depthLevel].cost += Number(log.estimated_cost_usd || 0)
        depthStats[depthLevel].input_tokens += log.input_tokens || 0
        depthStats[depthLevel].output_tokens += log.output_tokens || 0
        if (log.user_id) depthStats[depthLevel].users.add(log.user_id)

        // Aggregate by user
        const userKey = log.user_id || `session:${log.session_id}`
        if (!userDepthMap.has(userKey)) {
          const profile = log.user_id ? userProfiles[log.user_id] : null
          userDepthMap.set(userKey, {
            user_id: log.user_id,
            email: profile?.email || (log.user_id ? 'Usuario no encontrado' : 'Anónimo'),
            full_name: profile?.full_name || null,
            quick: { calls: 0, cost: 0 },
            complete: { calls: 0, cost: 0 },
            exhaustive: { calls: 0, cost: 0 },
            enrich: { calls: 0, cost: 0 },
            bulletin: { calls: 0, cost: 0 },
            total_cost: 0,
            total_calls: 0,
          })
        }
        
        const userEntry = userDepthMap.get(userKey)!
        const cost = Number(log.estimated_cost_usd || 0)
        userEntry.total_cost += cost
        userEntry.total_calls++
        
        if (depthLevel === 'quick') {
          userEntry.quick.calls++
          userEntry.quick.cost += cost
        } else if (depthLevel === 'complete') {
          userEntry.complete.calls++
          userEntry.complete.cost += cost
        } else if (depthLevel === 'exhaustive') {
          userEntry.exhaustive.calls++
          userEntry.exhaustive.cost += cost
        } else if (depthLevel === 'enrich') {
          userEntry.enrich.calls++
          userEntry.enrich.cost += cost
        } else if (depthLevel === 'bulletin') {
          userEntry.bulletin.calls++
          userEntry.bulletin.cost += cost
        }
      })

      // Calculate user patterns
      const getUserPattern = (u: typeof userDepthMap extends Map<any, infer V> ? V : never): string => {
        const total = u.quick.calls + u.complete.calls + u.exhaustive.calls
        if (total === 0) return '📄 Solo Boletines'
        const exhaustiveRatio = u.exhaustive.calls / total
        const quickRatio = u.quick.calls / total
        const completeRatio = u.complete.calls / total
        
        if (exhaustiveRatio > 0.6) return '🔥 Heavy User'
        if (quickRatio > 0.6) return '🚀 Eficiente'
        if (completeRatio > 0.5) return '📊 Analítico'
        return '🎯 Balanceado'
      }

      // Convert to arrays
      const byDepth = Object.entries(depthStats).map(([level, stats]) => ({
        depth_level: level,
        calls: stats.calls,
        cost: stats.cost,
        input_tokens: stats.input_tokens,
        output_tokens: stats.output_tokens,
        unique_users: stats.users.size,
        avg_cost_per_call: stats.calls > 0 ? stats.cost / stats.calls : 0,
      })).filter(d => d.calls > 0)

      const byUser = Array.from(userDepthMap.values())
        .filter(u => u.user_id) // Only authenticated users
        .map(u => ({
          ...u,
          pattern: getUserPattern(u),
        }))
        .sort((a, b) => b.total_cost - a.total_cost)
        .slice(0, 50) // Top 50 users

      // Summary
      const summary = {
        total_chat_calls: chatLogs.length,
        total_cost: chatLogs.reduce((sum, l) => sum + Number(l.estimated_cost_usd || 0), 0),
        authenticated_users: userIds.length,
        by_depth_summary: byDepth.reduce((acc, d) => {
          acc[d.depth_level] = { calls: d.calls, cost: d.cost }
          return acc
        }, {} as Record<string, { calls: number; cost: number }>),
      }

      return new Response(
        JSON.stringify({ data: { by_depth: byDepth, by_user: byUser, summary } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ==================== ACTION ROUTES (invoke) ====================
    // Allows calling admin-api-data via `supabase.functions.invoke('admin-api-data', { body: { action, data } })`
    // Path will be '' when invoked.
    if (req.method === 'POST' && (path === '' || path === '/')) {
      const body = await req.json().catch(() => ({}))
      const action = body?.action
      const data = body?.data ?? {}

      // ---- Interested leads ----
      if (action === 'list_interested_leads') {
        const { data: leads, error } = await supabaseAdmin
          .from('interested_leads')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error

        return new Response(
          JSON.stringify({ leads: leads || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (action === 'update_interested_lead') {
        const id = data?.id
        const updates = data?.updates

        if (!id || typeof id !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Missing id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        if (!updates || typeof updates !== 'object') {
          return new Response(
            JSON.stringify({ error: 'Missing updates' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data: lead, error } = await supabaseAdmin
          .from('interested_leads')
          .update(updates)
          .eq('id', id)
          .select('*')
          .single()

        if (error) throw error

        return new Response(
          JSON.stringify({ lead }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (action === 'delete_interested_lead') {
        const id = data?.id
        if (!id || typeof id !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Missing id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { error } = await supabaseAdmin
          .from('interested_leads')
          .delete()
          .eq('id', id)

        if (error) throw error

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
