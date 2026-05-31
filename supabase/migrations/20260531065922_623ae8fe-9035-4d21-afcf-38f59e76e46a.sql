-- Obsoletar triggers repair_analysis con batch_size:1 para que el watchdog
-- los regenere con batch_size:4 (fix throughput barrido 2026-05-31).
UPDATE public.cron_triggers
SET status = 'completed',
    processed_at = NOW(),
    result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('obsoleted_by', 'batch_size_4_upgrade')
WHERE action = 'repair_analysis'
  AND status IN ('pending', 'processing')
  AND (params->>'batch_size')::int < 4;