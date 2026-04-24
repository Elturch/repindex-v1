import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE = 1000
const TIME_LIMIT = 50000 // 50s safe margin

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const startTime = Date.now()
  const url = new URL(req.url)
  const target = url.searchParams.get('target') || 'news'

  try {
    if (target === 'news') {
      return await cleanupNews(supabase, startTime)
    } else {
      return await cleanupRix(supabase, startTime)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('[cleanup] Error:', message)
    return new Response(JSON.stringify({ error: message, duration_ms: Date.now() - startTime }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function cleanupRix(supabase: ReturnType<typeof createClient>, startTime: number) {
  console.log('[cleanup-rix] Scanning...')
  const keepers = new Map<string, number>()
  let offset = 0, scanned = 0

  while (Date.now() - startTime < TIME_LIMIT) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, metadata->>rix_run_id')
      .not('metadata->>rix_run_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const row of data as any[]) {
      const rid = row.rix_run_id
      if (!rid) continue
      const existing = keepers.get(rid)
      if (!existing || row.id > existing) keepers.set(rid, row.id)
    }
    scanned += data.length
    if (data.length < PAGE) break
    offset += PAGE
  }

  const keeperIdSet = new Set(keepers.values())
  let totalDeleted = 0
  offset = 0

  while (Date.now() - startTime < TIME_LIMIT) {
    const { data } = await supabase
      .from('documents')
      .select('id, metadata->>rix_run_id')
      .not('metadata->>rix_run_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (!data || data.length === 0) break
    const idsToDelete = (data as any[]).filter(r => !keeperIdSet.has(r.id)).map(r => r.id)
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const chunk = idsToDelete.slice(i, i + 100)
      await supabase.from('documents').delete().in('id', chunk)
      totalDeleted += chunk.length
    }
    if (idsToDelete.length === 0) offset += PAGE
    if (data.length < PAGE && idsToDelete.length === 0) break
  }

  return json({ target: 'rix', scanned, unique: keepers.size, deleted: totalDeleted, duration_ms: Date.now() - startTime })
}

async function cleanupNews(supabase: ReturnType<typeof createClient>, startTime: number) {
  // Phase 1: Full scan to build keepers map
  console.log('[cleanup-news] Phase 1: Scanning all news docs...')
  const keepers = new Map<string, number>()
  let offset = 0, scanned = 0

  while (Date.now() - startTime < TIME_LIMIT) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, metadata->>article_url')
      .contains('metadata', { type: 'corporate_news' })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    
    if (error) {
      console.error('[cleanup-news] scan error:', error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data as any[]) {
      const aurl = row.article_url
      if (!aurl) continue
      const existing = keepers.get(aurl)
      if (!existing || row.id > existing) keepers.set(aurl, row.id)
    }
    scanned += data.length
    if (scanned % 10000 === 0) console.log(`[cleanup-news] Scanned ${scanned}, unique: ${keepers.size}`)
    if (data.length < PAGE) break
    offset += PAGE
  }

  const scanComplete = offset === 0 || scanned % PAGE !== 0 || (Date.now() - startTime < TIME_LIMIT)
  console.log(`[cleanup-news] Phase 1 done: ${scanned} scanned, ${keepers.size} unique, scanComplete: ${scanComplete}`)

  if (!scanComplete) {
    return json({ target: 'news', phase: 'scan_incomplete', scanned, unique: keepers.size, 
      message: 'Scan incomplete due to time limit. Re-run to continue.', duration_ms: Date.now() - startTime })
  }

  // Phase 2: Delete duplicates
  const keeperIdSet = new Set(keepers.values())
  const expectedDuplicates = scanned - keepers.size
  console.log(`[cleanup-news] Phase 2: Deleting ~${expectedDuplicates} duplicates...`)
  
  let totalDeleted = 0
  offset = 0

  while (Date.now() - startTime < TIME_LIMIT) {
    const { data, error } = await supabase
      .from('documents')
      .select('id')
      .contains('metadata', { type: 'corporate_news' })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    
    if (error) {
      console.error('[cleanup-news] delete-scan error:', error.message)
      break
    }
    if (!data || data.length === 0) break

    const idsToDelete = data.filter(r => !keeperIdSet.has(r.id)).map(r => r.id)
    
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const chunk = idsToDelete.slice(i, i + 100)
      const { error: delErr } = await supabase.from('documents').delete().in('id', chunk)
      if (delErr) console.error('[cleanup-news] delete error:', delErr.message)
      else totalDeleted += chunk.length
    }

    if (totalDeleted % 5000 < PAGE) console.log(`[cleanup-news] Deleted ${totalDeleted}`)
    if (idsToDelete.length === 0) offset += PAGE
    if (data.length < PAGE && idsToDelete.length === 0) break
  }

  const done = totalDeleted >= expectedDuplicates || (Date.now() - startTime < TIME_LIMIT && totalDeleted > 0)
  console.log(`[cleanup-news] Done: deleted ${totalDeleted}/${expectedDuplicates}`)

  return json({ target: 'news', scanned, unique: keepers.size, deleted: totalDeleted, 
    expected_duplicates: expectedDuplicates, done, duration_ms: Date.now() - startTime })
}

function json(data: any) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
