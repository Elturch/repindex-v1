-- ============================================================
-- Tabla: chat_logs (observabilidad por consulta)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text,
  question text NOT NULL,
  response_type text NOT NULL CHECK (response_type IN ('guard_rejection', 'report', 'error')),
  guard_type text CHECK (guard_type IN ('input', 'scope', 'temporal', 'predictive', 'rate_warning', NULL)),
  guard_reason text,
  duration_ms integer,
  models_used text[],
  intent text,
  ticker text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON public.chat_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id_created ON public.chat_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_response_type ON public.chat_logs(response_type, created_at DESC);

ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all chat_logs"
  ON public.chat_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can insert their own chat_logs"
  ON public.chat_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Service role bypass (edge functions con service key)
CREATE POLICY "Service role can insert chat_logs"
  ON public.chat_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================
-- Tabla: chat_guard_alerts (alertas de guards >50% en 1h)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_guard_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  total_queries integer NOT NULL,
  guard_queries integer NOT NULL,
  guard_ratio numeric NOT NULL,
  dominant_guard_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_guard_alerts_created_at ON public.chat_guard_alerts(created_at DESC);

ALTER TABLE public.chat_guard_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read guard alerts"
  ON public.chat_guard_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert guard alerts"
  ON public.chat_guard_alerts FOR INSERT
  TO service_role
  WITH CHECK (true);