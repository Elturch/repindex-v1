-- 1. Purge live repair_analysis triggers
UPDATE public.cron_triggers
SET status = 'failed',
    processed_at = now(),
    result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('purged_at', now(), 'reason', 'per-record-rollout')
WHERE action = 'repair_analysis'
  AND status IN ('pending', 'processing');

-- 2. Release stale analysis_lock entries (>3 min)
WITH stale AS (
  SELECT r.id,
         (SELECT jsonb_agg(f) FROM jsonb_array_elements(r."17_flags") f
           WHERE NOT (jsonb_typeof(f) = 'object' AND f ? 'analysis_lock')
         ) AS cleaned
  FROM public.rix_runs_v2 r
  WHERE r.analysis_completed_at IS NULL
    AND r."09_rix_score" IS NULL
    AND jsonb_typeof(r."17_flags") = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(r."17_flags") f
      WHERE jsonb_typeof(f) = 'object'
        AND f ? 'analysis_lock'
        AND (f->>'analysis_lock')::timestamptz < now() - interval '3 minutes'
    )
)
UPDATE public.rix_runs_v2 r
SET "17_flags" = COALESCE(stale.cleaned, '[]'::jsonb)
FROM stale
WHERE r.id = stale.id;

-- 3. Atomic per-record claim function
CREATE OR REPLACE FUNCTION public.claim_next_rix_analysis_record(
  p_worker_id text,
  p_lock_ttl_seconds int DEFAULT 180
)
RETURNS TABLE (
  id uuid,
  ticker text,
  model_name text,
  period_from date,
  period_to date,
  batch_execution_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_active_period date;
  v_now timestamptz := now();
  v_lock_iso text := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_stale_cutoff timestamptz := v_now - make_interval(secs => p_lock_ttl_seconds);
BEGIN
  SELECT MAX("06_period_from") INTO v_active_period
  FROM public.rix_runs_v2
  WHERE analysis_completed_at IS NULL
    AND "09_rix_score" IS NULL
    AND search_completed_at IS NOT NULL;

  IF v_active_period IS NULL THEN
    RETURN;
  END IF;

  WITH candidate AS (
    SELECT r.id
    FROM public.rix_runs_v2 r
    WHERE r."06_period_from" = v_active_period
      AND r.analysis_completed_at IS NULL
      AND r."09_rix_score" IS NULL
      AND r.search_completed_at IS NOT NULL
      AND (
        r."17_flags" IS NULL
        OR jsonb_typeof(r."17_flags") <> 'array'
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(r."17_flags") f
          WHERE jsonb_typeof(f) = 'object'
            AND f ? 'analysis_lock'
            AND (f->>'analysis_lock')::timestamptz > v_stale_cutoff
        )
      )
      AND (
        (r."02_model_name" = 'ChatGPT'        AND COALESCE(length(r."20_res_gpt_bruto"),0) > 0)
        OR (r."02_model_name" = 'Perplexity'  AND COALESCE(length(r."21_res_perplex_bruto"),0) > 0)
        OR (r."02_model_name" IN ('Gemini','Google Gemini') AND COALESCE(length(r."22_res_gemini_bruto"),0) > 0)
        OR (r."02_model_name" = 'Deepseek'    AND COALESCE(length(r."23_res_deepseek_bruto"),0) > 0)
        OR (r."02_model_name" = 'Grok'        AND COALESCE(length(r.respuesta_bruto_grok),0) > 0)
        OR (r."02_model_name" = 'Qwen'        AND COALESCE(length(r.respuesta_bruto_qwen),0) > 0)
      )
    ORDER BY r.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.rix_runs_v2 r
  SET "17_flags" = COALESCE(
        (SELECT jsonb_agg(f) FROM jsonb_array_elements(COALESCE(r."17_flags",'[]'::jsonb)) f
          WHERE NOT (jsonb_typeof(f) = 'object' AND f ? 'analysis_lock')),
        '[]'::jsonb
      ) || jsonb_build_array(jsonb_build_object(
        'analysis_lock', v_lock_iso,
        'worker', p_worker_id
      ))
  FROM candidate
  WHERE r.id = candidate.id
  RETURNING r.id INTO v_id;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, r."05_ticker", r."02_model_name", r."06_period_from", r."07_period_to", r.batch_execution_date
  FROM public.rix_runs_v2 r
  WHERE r.id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_rix_analysis_record(text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.count_fresh_rix_analysis_locks(
  p_ttl_seconds int DEFAULT 180
)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::int
  FROM public.rix_runs_v2 r
  WHERE r.analysis_completed_at IS NULL
    AND r."09_rix_score" IS NULL
    AND jsonb_typeof(r."17_flags") = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(r."17_flags") f
      WHERE jsonb_typeof(f) = 'object'
        AND f ? 'analysis_lock'
        AND (f->>'analysis_lock')::timestamptz > now() - make_interval(secs => p_ttl_seconds)
    );
$$;

GRANT EXECUTE ON FUNCTION public.count_fresh_rix_analysis_locks(int) TO service_role;