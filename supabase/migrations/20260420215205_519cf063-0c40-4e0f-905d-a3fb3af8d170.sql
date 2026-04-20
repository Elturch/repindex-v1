-- Identifico y reemplazo policies INSERT con OR (user_id IS NULL)
-- role_enrichment_analytics
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='role_enrichment_analytics' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.role_enrichment_analytics', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users insert their analytics"
  ON public.role_enrichment_analytics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- user_activity_logs
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_activity_logs' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_activity_logs', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users insert their activity logs"
  ON public.user_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);