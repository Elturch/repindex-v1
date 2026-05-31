
-- Commit 1: sweep_queue + funciones SQL para robustez

CREATE TABLE IF NOT EXISTS public.sweep_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id text NOT NULL,
  ticker text NOT NULL,
  issuer_name text,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  worker_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT sweep_queue_status_check CHECK (status IN ('pending','processing','done','skipped')),
  CONSTRAINT sweep_queue_unique UNIQUE (sweep_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_sweep_queue_sweep_status ON public.sweep_queue(sweep_id, status);
CREATE INDEX IF NOT EXISTS idx_sweep_queue_lock_expires ON public.sweep_queue(lock_expires_at) WHERE status = 'processing';

GRANT ALL ON public.sweep_queue TO service_role;

ALTER TABLE public.sweep_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.sweep_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_read_sweep_queue" ON public.sweep_queue
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

GRANT SELECT ON public.sweep_queue TO authenticated;

-- Trigger updated_at
CREATE TRIGGER trg_sweep_queue_updated_at
  BEFORE UPDATE ON public.sweep_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FUNCTIONS ============

-- Reclama el siguiente ticker pendiente (o uno con lock expirado).
CREATE OR REPLACE FUNCTION public.claim_next_sweep_queue_item(
  p_sweep_id text,
  p_worker_id text,
  p_lock_ttl_seconds int DEFAULT 300
)
RETURNS TABLE(id uuid, ticker text, issuer_name text, attempts int)
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
  SELECT q.id, q.ticker, q.issuer_name, q.attempts
  FROM public.sweep_queue q
  WHERE q.id = v_id;
END;
$$;

-- Libera locks expirados (vuelven a pending si attempts < 3, si no skipped).
CREATE OR REPLACE FUNCTION public.release_expired_sweep_locks()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  WITH released AS (
    UPDATE public.sweep_queue
    SET status = CASE WHEN attempts >= 3 THEN 'skipped' ELSE 'pending' END,
        last_error = COALESCE(last_error, '') || ' [lock_expired]',
        locked_at = NULL,
        lock_expires_at = NULL,
        worker_id = NULL,
        updated_at = now()
    WHERE status = 'processing'
      AND lock_expires_at < now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM released;
  RETURN v_count;
END;
$$;

-- Marca ticker completado.
CREATE OR REPLACE FUNCTION public.complete_sweep_queue_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.sweep_queue
  SET status = 'done',
      completed_at = now(),
      locked_at = NULL,
      lock_expires_at = NULL,
      worker_id = NULL,
      updated_at = now()
  WHERE id = p_id;
END;
$$;

-- Marca fallo. Si attempts >= 3 -> skipped, si no -> pending para reintento.
CREATE OR REPLACE FUNCTION public.fail_sweep_queue_item(p_id uuid, p_error text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_attempts int;
BEGIN
  SELECT attempts INTO v_attempts FROM public.sweep_queue WHERE id = p_id;

  IF v_attempts IS NULL THEN
    RETURN NULL;
  END IF;

  v_status := CASE WHEN v_attempts >= 3 THEN 'skipped' ELSE 'pending' END;

  UPDATE public.sweep_queue
  SET status = v_status,
      last_error = left(COALESCE(p_error, 'unknown'), 1000),
      locked_at = NULL,
      lock_expires_at = NULL,
      worker_id = NULL,
      updated_at = now(),
      completed_at = CASE WHEN v_status = 'skipped' THEN now() ELSE NULL END
  WHERE id = p_id;

  RETURN v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_sweep_queue_item(text, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_sweep_locks() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_sweep_queue_item(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_sweep_queue_item(uuid, text) TO service_role;
