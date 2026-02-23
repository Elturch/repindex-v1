import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 5000

async function rpc(supabase: ReturnType<typeof createClient>, sql: string) {
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql })
  if (error) throw new Error(JSON.stringify(error))
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data) ? data : []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const url = new URL(req.url)
  const phase = url.searchParams.get('phase') || 'prepare'
  const startTime = Date.now()

  try {
    const rangeData = await rpc(supabase, `SELECT MIN(id) as min_id, MAX(id) as max_id FROM documents`)
    const minId = rangeData[0].min_id
    const maxId = rangeData[0].max_id
    console.log(`[cleanup] ID range: ${minId} - ${maxId}, phase: ${phase}`)

    if (phase === 'prepare') {
      // Create a persistent table with keeper IDs, then delete phase can use it
      // Drop if exists from a previous run
      await rpc(supabase, `DROP TABLE IF EXISTS _cleanup_keepers`)
      await rpc(supabase, `CREATE TABLE _cleanup_keepers (keep_id BIGINT PRIMARY KEY)`)

      const keepers = new Map<string, number>()
      let batchStart = minId
      let batches = 0

      while (batchStart <= maxId) {
        const batchEnd = batchStart + BATCH_SIZE - 1
        const data = await rpc(supabase, `SELECT metadata->>'rix_run_id' as rid, MAX(id) as max_id
          FROM documents
          WHERE id BETWEEN ${batchStart} AND ${batchEnd}
            AND metadata->>'rix_run_id' IS NOT NULL
            AND (metadata->>'source_table' IS NULL OR metadata->>'source_table' = 'rix_runs')
          GROUP BY metadata->>'rix_run_id'`)

        for (const row of data) {
          const existing = keepers.get(row.rid)
          if (!existing || row.max_id > existing) {
            keepers.set(row.rid, row.max_id)
          }
        }

        batches++
        if (batches % 50 === 0) {
          console.log(`[cleanup] Prepare: batch ${batches}, keepers: ${keepers.size}`)
        }
        batchStart = batchEnd + 1
      }

      // Insert keeper IDs into persistent table in chunks
      const keeperIds = Array.from(keepers.values())
      for (let i = 0; i < keeperIds.length; i += 500) {
        const chunk = keeperIds.slice(i, i + 500)
        const values = chunk.map(id => `(${id})`).join(',')
        await rpc(supabase, `INSERT INTO _cleanup_keepers (keep_id) VALUES ${values} ON CONFLICT DO NOTHING`)
      }

      console.log(`[cleanup] Prepare complete: ${keepers.size} keepers saved to _cleanup_keepers`)

      return new Response(JSON.stringify({
        phase: 'prepare',
        unique_rix_run_ids: keepers.size,
        keepers_saved: keeperIds.length,
        batches,
        duration_ms: Date.now() - startTime,
        next_step: 'Call with ?phase=delete&from=' + minId
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (phase === 'delete') {
      const fromId = Number(url.searchParams.get('from') || minId)
      const maxDeleteBatches = Number(url.searchParams.get('limit') || 50)

      // Verify keepers table exists
      const check = await rpc(supabase, `SELECT COUNT(*) as cnt FROM _cleanup_keepers`)
      console.log(`[cleanup] Keepers in table: ${check[0].cnt}`)

      let totalDeleted = 0
      let batchStart = fromId
      let batches = 0
      let lastId = fromId

      while (batchStart <= maxId && batches < maxDeleteBatches) {
        const batchEnd = batchStart + BATCH_SIZE - 1

        // Delete documents in this range that are rix_run candidates but NOT in keepers
        const result = await rpc(supabase, `WITH deleted AS (
          DELETE FROM documents
          WHERE id BETWEEN ${batchStart} AND ${batchEnd}
            AND metadata->>'rix_run_id' IS NOT NULL
            AND (metadata->>'source_table' IS NULL OR metadata->>'source_table' = 'rix_runs')
            AND id NOT IN (SELECT keep_id FROM _cleanup_keepers)
          RETURNING id
        ) SELECT COUNT(*) as cnt FROM deleted`)

        const deletedCount = Number(result[0]?.cnt || 0)
        totalDeleted += deletedCount

        batches++
        lastId = batchEnd
        if (batches % 10 === 0) {
          console.log(`[cleanup] Delete: batch ${batches}, deleted so far: ${totalDeleted}, up to ID ${batchEnd}`)
        }
        batchStart = batchEnd + 1
      }

      const done = lastId >= maxId

      if (done) {
        // Cleanup the helper table
        await rpc(supabase, `DROP TABLE IF EXISTS _cleanup_keepers`)
        console.log(`[cleanup] Done! Total deleted: ${totalDeleted}`)
      }

      return new Response(JSON.stringify({
        phase: 'delete',
        total_deleted: totalDeleted,
        from_id: fromId,
        last_processed_id: lastId,
        max_id: maxId,
        done,
        batches,
        duration_ms: Date.now() - startTime,
        next_step: done
          ? 'Cleanup complete! Now create index and trigger newsroom.'
          : `Call with ?phase=delete&from=${lastId + 1}`
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Use ?phase=prepare or ?phase=delete&from=N' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('[cleanup] Error:', message)
    return new Response(JSON.stringify({ error: message, duration_ms: Date.now() - startTime }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
