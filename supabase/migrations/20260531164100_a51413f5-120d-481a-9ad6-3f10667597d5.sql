
-- ============================================================
-- Commit 3 + 4: app_config + pipeline_alerts
-- ============================================================

-- app_config: single-row key/value store for runtime flags
CREATE TABLE public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_config TO anon, authenticated;
GRANT ALL ON public.app_config TO service_role;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config readable by all"
  ON public.app_config FOR SELECT
  USING (true);

CREATE POLICY "app_config writable by service_role only"
  ON public.app_config FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Seed default sweep status
INSERT INTO public.app_config (key, value) VALUES
  ('sweep_status', jsonb_build_object(
    'in_progress', false,
    'started_at', null,
    'sweep_id', null,
    'total', 0,
    'done', 0
  ))
ON CONFLICT (key) DO NOTHING;

-- Helper to update sweep status atomically
CREATE OR REPLACE FUNCTION public.set_sweep_status(
  p_in_progress BOOLEAN,
  p_sweep_id TEXT DEFAULT NULL,
  p_total INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_config
  SET value = jsonb_build_object(
        'in_progress', p_in_progress,
        'started_at', CASE WHEN p_in_progress THEN COALESCE((value->>'started_at')::timestamptz, now()) ELSE NULL END,
        'sweep_id', p_sweep_id,
        'total', COALESCE(p_total, (value->>'total')::int, 0),
        'done', CASE WHEN p_in_progress THEN COALESCE((value->>'done')::int, 0) ELSE 0 END
      ),
      updated_at = now()
  WHERE key = 'sweep_status';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_sweep_status(BOOLEAN, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_sweep_status(BOOLEAN, TEXT, INTEGER) TO service_role;

-- ============================================================
-- pipeline_alerts: observability alerts emitted by watchdog
-- ============================================================
CREATE TABLE public.pipeline_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pipeline_alerts TO authenticated;
GRANT ALL ON public.pipeline_alerts TO service_role;

ALTER TABLE public.pipeline_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_alerts readable by authenticated"
  ON public.pipeline_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "pipeline_alerts writable by service_role only"
  ON public.pipeline_alerts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_pipeline_alerts_created ON public.pipeline_alerts (created_at DESC);
CREATE INDEX idx_pipeline_alerts_unresolved ON public.pipeline_alerts (created_at DESC) WHERE resolved_at IS NULL;

-- ============================================================
-- Throughput helper: tickers/hora last N minutes
-- ============================================================
CREATE OR REPLACE FUNCTION public.sweep_queue_throughput(p_minutes INTEGER DEFAULT 10)
RETURNS TABLE (
  tickers_per_hour NUMERIC,
  completed_window INTEGER,
  pending_total INTEGER,
  processing_total INTEGER,
  done_total INTEGER,
  skipped_total INTEGER,
  eta_minutes NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed INTEGER;
  v_rate NUMERIC;
  v_pending INTEGER;
  v_processing INTEGER;
  v_done INTEGER;
  v_skipped INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_completed
  FROM public.sweep_queue
  WHERE status = 'done'
    AND completed_at >= now() - (p_minutes || ' minutes')::interval;

  v_rate := CASE WHEN p_minutes > 0 THEN (v_completed::numeric * 60 / p_minutes) ELSE 0 END;

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'processing'),
    COUNT(*) FILTER (WHERE status = 'done'),
    COUNT(*) FILTER (WHERE status = 'skipped')
  INTO v_pending, v_processing, v_done, v_skipped
  FROM public.sweep_queue;

  RETURN QUERY SELECT
    v_rate,
    v_completed,
    v_pending,
    v_processing,
    v_done,
    v_skipped,
    CASE WHEN v_rate > 0 THEN (v_pending + v_processing)::numeric * 60 / v_rate ELSE NULL END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sweep_queue_throughput(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_queue_throughput(INTEGER) TO authenticated, service_role;
