UPDATE cron_triggers 
SET status='failed', processed_at=now(),
    result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('purge_reason', 'manual-purge-definitive')
WHERE action='repair_analysis' AND status IN ('pending','processing');

WITH stale AS (
  SELECT 
    r.id,
    COALESCE(
      (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(r."17_flags") elem
        WHERE NOT (elem ? 'analysis_lock')
      ),
      '[]'::jsonb
    ) AS cleaned_flags
  FROM rix_runs_v2 r
  WHERE r."06_period_from" = '2026-05-24'
    AND r.analysis_completed_at IS NULL
    AND jsonb_typeof(r."17_flags") = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(r."17_flags") f
      WHERE f ? 'analysis_lock'
        AND (f->>'analysis_lock')::timestamptz < now() - interval '3 minutes'
    )
)
UPDATE rix_runs_v2 r
SET "17_flags" = s.cleaned_flags
FROM stale s
WHERE r.id = s.id;