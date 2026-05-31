UPDATE cron_triggers
SET status='failed',
    processed_at=now(),
    result=jsonb_build_object('reason','manual-purge-fire-and-forget-fix')
WHERE action='repair_analysis'
  AND status IN ('pending','processing');

UPDATE rix_runs_v2
SET "17_flags" = COALESCE(
  (SELECT jsonb_agg(f) FROM jsonb_array_elements("17_flags") f
   WHERE NOT (f ? 'analysis_lock')),
  '[]'::jsonb
)
WHERE "06_period_from"::date = '2026-05-24'
  AND analysis_completed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE("17_flags",'[]'::jsonb)) f
    WHERE f ? 'analysis_lock'
      AND (f->>'analysis_lock')::timestamptz < now() - interval '3 minutes'
  );