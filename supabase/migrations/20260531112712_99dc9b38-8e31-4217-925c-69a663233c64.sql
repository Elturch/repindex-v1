INSERT INTO cron_triggers (action, params, status)
SELECT 'repair_analysis',
       jsonb_build_object('sweep_id','2026-W23','batch_size',1,'seed','fire-and-forget'),
       'pending'
FROM generate_series(1,5);