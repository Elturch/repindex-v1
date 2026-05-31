
DROP FUNCTION IF EXISTS public.claim_next_sweep_queue_item(text, text, int);

CREATE OR REPLACE FUNCTION public.claim_next_sweep_queue_item(
  p_sweep_id text,
  p_worker_id text,
  p_lock_ttl_seconds int DEFAULT 300
)
RETURNS TABLE(id uuid, ticker text, issuer_name text, model_name text, attempts int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_now timestamptz := now();
BEGIN
  WITH candidate AS (
    SELECT q.id
    FROM public.sweep_queue q
    WHERE q.sweep_id = p_sweep_id
      AND (
        q.status = 'pending'
        OR (q.status = 'processing' AND q.lock_expires_at < v_now)
      )
      AND q.attempts < 3
    ORDER BY q.attempts ASC, q.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sweep_queue q
  SET status = 'processing',
      attempts = q.attempts + 1,
      locked_at = v_now,
      lock_expires_at = v_now + make_interval(secs => p_lock_ttl_seconds),
      worker_id = p_worker_id,
      updated_at = v_now
  FROM candidate
  WHERE q.id = candidate.id
  RETURNING q.id INTO v_id;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id, q.ticker, q.issuer_name, q.model_name, q.attempts
  FROM public.sweep_queue q
  WHERE q.id = v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_next_sweep_queue_item(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_sweep_queue_item(text, text, int) TO service_role;
