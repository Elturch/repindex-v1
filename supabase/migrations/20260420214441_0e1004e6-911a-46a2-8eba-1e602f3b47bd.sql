-- rix_runs
DROP POLICY IF EXISTS "Acceso público de actualización" ON public.rix_runs;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.rix_runs;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.rix_runs;

-- rix_runs_v2
DROP POLICY IF EXISTS "Actualización pública rix_runs_v2" ON public.rix_runs_v2;
DROP POLICY IF EXISTS "Eliminación pública rix_runs_v2" ON public.rix_runs_v2;
DROP POLICY IF EXISTS "Inserción pública rix_runs_v2" ON public.rix_runs_v2;

-- rix_trends
DROP POLICY IF EXISTS "Acceso público de actualización rix_trends" ON public.rix_trends;
DROP POLICY IF EXISTS "Acceso público de eliminación rix_trends" ON public.rix_trends;
DROP POLICY IF EXISTS "Acceso público de inserción rix_trends" ON public.rix_trends;

-- repindex_root_issuers
DROP POLICY IF EXISTS "Acceso público de actualización" ON public.repindex_root_issuers;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.repindex_root_issuers;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.repindex_root_issuers;

-- news_articles ALL service_role (qual=true) → admin only via RLS
DROP POLICY IF EXISTS "Service role can manage articles" ON public.news_articles;
CREATE POLICY "Admins manage articles"
  ON public.news_articles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- pipeline_health_checks
DROP POLICY IF EXISTS "Service role can manage health checks" ON public.pipeline_health_checks;
CREATE POLICY "Admins manage health checks"
  ON public.pipeline_health_checks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- pipeline_logs
DROP POLICY IF EXISTS "Service role can manage pipeline logs" ON public.pipeline_logs;
CREATE POLICY "Admins manage pipeline logs"
  ON public.pipeline_logs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- platform_snapshots
DROP POLICY IF EXISTS "Service role can manage snapshots" ON public.platform_snapshots;
CREATE POLICY "Admins manage platform snapshots"
  ON public.platform_snapshots FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- corporate_snapshots: INSERT/UPDATE service_role con true → admin
DROP POLICY IF EXISTS "Service role can insert corporate snapshots" ON public.corporate_snapshots;
DROP POLICY IF EXISTS "Service role can update corporate snapshots" ON public.corporate_snapshots;
CREATE POLICY "Admins insert corporate snapshots"
  ON public.corporate_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update corporate snapshots"
  ON public.corporate_snapshots FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- notification_analytics: INSERT abierto → restringir a user_id propio
DROP POLICY IF EXISTS "System can insert analytics" ON public.notification_analytics;
CREATE POLICY "Users insert their own analytics"
  ON public.notification_analytics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);