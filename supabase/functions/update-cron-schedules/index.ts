import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })

    // Generate all 34 phase updates
    // New schedule: start at 00:00 UTC (01:00 CET), 5 min intervals
    const updates: { jobname: string; schedule: string }[] = []
    
    for (let phase = 1; phase <= 34; phase++) {
      const totalMinutes = (phase - 1) * 5  // 0, 5, 10, 15...
      const hour = Math.floor(totalMinutes / 60)
      const minute = totalMinutes % 60
      
      const phaseStr = phase.toString().padStart(2, '0')
      updates.push({
        jobname: `rix-sweep-phase-${phaseStr}`,
        schedule: `${minute} ${hour} * * 0`  // Every Sunday at the specified time
      })
    }

    console.log(`[update-cron-schedules] Updating ${updates.length} cron jobs...`)

    const results: { jobname: string; schedule: string; success: boolean; error?: string }[] = []
    
    for (const update of updates) {
      // Use the execute_sql SECURITY DEFINER function
      const sql = `UPDATE cron.job SET schedule = '${update.schedule}' WHERE jobname = '${update.jobname}'`
      
      const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql })
      
      results.push({
        jobname: update.jobname,
        schedule: update.schedule,
        success: !error,
        error: error?.message
      })
      
      if (error) {
        console.error(`[update-cron-schedules] Failed to update ${update.jobname}:`, error.message)
      } else {
        console.log(`[update-cron-schedules] Updated ${update.jobname} to ${update.schedule}`)
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({
        success: failCount === 0,
        message: `Updated ${successCount}/${updates.length} cron jobs`,
        successCount,
        failCount,
        results
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[update-cron-schedules] Error:', message)
    
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
