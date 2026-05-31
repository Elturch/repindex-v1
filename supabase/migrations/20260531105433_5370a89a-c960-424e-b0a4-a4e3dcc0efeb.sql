
-- Purga cola repair_analysis activa (parte A desbloqueo W23)
UPDATE cron_triggers
SET status='failed',
    processed_at=now(),
    result = COALESCE(result,'{}'::jsonb) || jsonb_build_object('error','manual_purge_w23','purged_at', now()::text)
WHERE action='repair_analysis' AND status IN ('pending','processing');

-- Sembrar 5 triggers nuevos para arrancar concurrencia
INSERT INTO cron_triggers (action, status, params, created_at)
SELECT 'repair_analysis', 'pending',
       jsonb_build_object('batch_size', 1, 'sweep_id', '2026-W23', 'seed', g),
       now()
FROM generate_series(1,5) g;
