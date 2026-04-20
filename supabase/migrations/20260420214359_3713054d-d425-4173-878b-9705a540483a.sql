-- E2: monitor_reputacional_events
ALTER TABLE public.monitor_reputacional_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only access"
  ON public.monitor_reputacional_events FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);
CREATE POLICY "Admins can view monitor events"
  ON public.monitor_reputacional_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- E1: lead_qualification_responses
DROP POLICY IF EXISTS "Service role can manage qualification responses" ON public.lead_qualification_responses;
CREATE POLICY "Service role and admins manage qualification responses"
  ON public.lead_qualification_responses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- E3: cron_triggers
DROP POLICY IF EXISTS "Authenticated users can insert triggers" ON public.cron_triggers;
DROP POLICY IF EXISTS "Authenticated users can read triggers" ON public.cron_triggers;
DROP POLICY IF EXISTS "Authenticated users can view triggers" ON public.cron_triggers;
CREATE POLICY "Admins can view cron triggers"
  ON public.cron_triggers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- E4 ampliado
DROP POLICY IF EXISTS "Acceso público de actualización consolidation" ON public.ai_consolidation_reports;
DROP POLICY IF EXISTS "Acceso público de eliminación consolidation" ON public.ai_consolidation_reports;
DROP POLICY IF EXISTS "Acceso público de inserción consolidation" ON public.ai_consolidation_reports;

DROP POLICY IF EXISTS "Acceso público de actualización" ON public.by_metric;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.by_metric;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.by_metric;

DROP POLICY IF EXISTS "Acceso público de actualización" ON public.contadores;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.contadores;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.contadores;

DROP POLICY IF EXISTS "Acceso público de actualización" ON public.evaluation;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.evaluation;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.evaluation;

DROP POLICY IF EXISTS "Acceso público de actualización" ON public.executive_notes;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.executive_notes;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.executive_notes;

DROP POLICY IF EXISTS "Acceso público de actualización" ON public.meta_weight_scheme;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.meta_weight_scheme;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.meta_weight_scheme;

DROP POLICY IF EXISTS "Acceso público de actualización" ON public.recommendations_tactical;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.recommendations_tactical;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.recommendations_tactical;

-- chat_history / chat_vector_memory
DROP POLICY IF EXISTS "Service role can manage chat_history" ON public.chat_history;
CREATE POLICY "Service role and admins manage chat_history"
  ON public.chat_history FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Service role can manage chat_vector_memory" ON public.chat_vector_memory;
CREATE POLICY "Service role and admins manage chat_vector_memory"
  ON public.chat_vector_memory FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- corporate_scrape_progress
DROP POLICY IF EXISTS "Service role can modify scrape progress" ON public.corporate_scrape_progress;
CREATE POLICY "Service role and admins modify scrape progress"
  ON public.corporate_scrape_progress FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- data_quality_reports
DROP POLICY IF EXISTS "Service role can manage data quality reports" ON public.data_quality_reports;
CREATE POLICY "Service role and admins manage data quality reports"
  ON public.data_quality_reports FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- E6: SECURITY DEFINER view → INVOKER
ALTER VIEW public.v_persona_evolution SET (security_invoker = true);

-- W3: function search_path
ALTER FUNCTION public.execute_sql(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.claim_next_sweep_company(text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.buscar_contexto_similar(vector, text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.match_documents(vector, integer, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_stock_price(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_stock_price_v2(text, text, timestamp with time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_sweep_progress_updated_at() SET search_path = public, pg_temp;