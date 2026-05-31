import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Watchdog ligero: corre cada ~2 min, libera locks expirados y crea un trigger
// de drenado de la cola sólo si los gates de carga lo permiten.
const GATE_MAX_PROCESSING = 3;   // si hay >=3 triggers processing, no crear nuevos
const GATE_MAX_PENDING = 6;      // si hay >=6 triggers pending, no crear nuevos

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Liberar locks expirados (>5min) en sweep_queue.
    const { data: releasedCount, error: releaseErr } = await supabase.rpc('release_expired_sweep_locks');
    if (releaseErr) console.warn('[rix-sweep-watchdog] release_expired_sweep_locks error:', releaseErr);
    else if ((releasedCount ?? 0) > 0) console.log(`[rix-sweep-watchdog] released ${releasedCount} expired locks`);

    // 2. Comprobar gates en cron_triggers.
    const { count: processingCount } = await supabase
      .from('cron_triggers')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'repair_analysis')
      .eq('status', 'processing');

    const { count: pendingCount } = await supabase
      .from('cron_triggers')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'repair_analysis')
      .eq('status', 'pending');

    if ((processingCount ?? 0) >= GATE_MAX_PROCESSING) {
      const msg = `gate=processing (${processingCount}>=${GATE_MAX_PROCESSING}) — skip create`;
      console.log(`[rix-sweep-watchdog] ${msg}`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: msg, released: releasedCount ?? 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if ((pendingCount ?? 0) >= GATE_MAX_PENDING) {
      const msg = `gate=pending (${pendingCount}>=${GATE_MAX_PENDING}) — skip create`;
      console.log(`[rix-sweep-watchdog] ${msg}`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: msg, released: releasedCount ?? 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Comprobar que hay trabajo en sweep_queue. Si no hay, no crear trigger.
    const { count: pendingWork } = await supabase
      .from('sweep_queue')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending']);

    if ((pendingWork ?? 0) === 0) {
      console.log('[rix-sweep-watchdog] no pending work in sweep_queue — idle');
      // Si quedan items en processing los gestionará el TTL; si todo está done,
      // limpiamos el flag global para liberar al front del modo "barrido".
      const { count: processingLeft } = await supabase
        .from('sweep_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'processing');
      if ((processingLeft ?? 0) === 0) {
        try {
          await supabase.rpc('set_sweep_status', { p_in_progress: false, p_sweep_id: null, p_total: 0 });
        } catch (e) { console.warn('[rix-sweep-watchdog] clear flag failed:', e); }
      }
      return new Response(JSON.stringify({ success: true, idle: true, released: releasedCount ?? 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3.b Observabilidad: medir throughput de los últimos 20 min y emitir alerta si <5 tickers/h.
    try {
      const { data: thr } = await supabase.rpc('sweep_queue_throughput', { p_minutes: 20 });
      const row = Array.isArray(thr) ? thr[0] : thr;
      const rate = Number(row?.tickers_per_hour ?? 0);
      if (rate > 0 && rate < 5) {
        await supabase.from('pipeline_alerts').insert({
          kind: 'sweep_low_throughput',
          severity: 'warning',
          message: `Throughput bajo: ${rate.toFixed(1)} tickers/h (umbral=5) últimos 20 min`,
          context: row ?? {},
        });
      }
    } catch (e) { console.warn('[rix-sweep-watchdog] throughput probe failed:', e); }

    // 4. Crear un trigger para drenar 6 items.
    const { data: trigger, error: trigErr } = await supabase
      .from('cron_triggers')
      .insert({ action: 'repair_analysis', params: { mode: 'sweep_queue_drain', batch: 6 }, status: 'pending' })
      .select('id, created_at')
      .single();
    if (trigErr) throw trigErr;

    console.log(`[rix-sweep-watchdog] created trigger ${trigger?.id} — pending_work=${pendingWork}`);
    return new Response(JSON.stringify({
      success: true,
      trigger_id: trigger?.id,
      pending_work: pendingWork,
      released: releasedCount ?? 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[rix-sweep-watchdog] error:', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});