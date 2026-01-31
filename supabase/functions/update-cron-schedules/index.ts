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

    // Mapping: jobid 10-43 correspond to phases 01-34
    // New schedule: start at 00:00 UTC (01:00 CET), 5 min intervals
    const updates: { jobid: number; phase: number; schedule: string }[] = []
    
    for (let phase = 1; phase <= 34; phase++) {
      const jobid = phase + 9  // jobid 10 = phase 1, jobid 43 = phase 34
      const totalMinutes = (phase - 1) * 5  // 0, 5, 10, 15...
      const hour = Math.floor(totalMinutes / 60)
      const minute = totalMinutes % 60
      
      updates.push({
        jobid,
        phase,
        schedule: `${minute} ${hour} * * 0`  // Every Sunday at the specified time
      })
    }

    console.log(`[update-cron-schedules] Updating ${updates.length} cron jobs using cron.alter_job()...`)

    const results: { jobid: number; phase: number; schedule: string; success: boolean; error?: string }[] = []
    
    for (const update of updates) {
      // Use cron.alter_job() native function instead of UPDATE
      const sql = `SELECT cron.alter_job(${update.jobid}, schedule => '${update.schedule}')`
      
      const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql })
      
      results.push({
        jobid: update.jobid,
        phase: update.phase,
        schedule: update.schedule,
        success: !error,
        error: error?.message
      })
      
      if (error) {
        console.error(`[update-cron-schedules] Failed to update jobid ${update.jobid} (phase ${update.phase}):`, error.message)
      } else {
        console.log(`[update-cron-schedules] Updated jobid ${update.jobid} (phase ${update.phase}) to ${update.schedule}`)
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
