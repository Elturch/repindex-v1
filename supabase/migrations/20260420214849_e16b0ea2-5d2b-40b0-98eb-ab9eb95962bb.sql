-- role_enrichment_analytics: drop public read, keep admin read + insert
DROP POLICY IF EXISTS "Public read for analytics" ON public.role_enrichment_analytics;

-- user_role_preferences: drop public read, keep own-row read
DROP POLICY IF EXISTS "Public read for role preferences" ON public.user_role_preferences;

-- user_activity_logs: drop the anonymous SELECT policy, keep INSERT for tracking
DROP POLICY IF EXISTS "Allow reading anonymous activity logs" ON public.user_activity_logs;

-- client_companies: add admin write policies
CREATE POLICY "Admins manage client companies"
  ON public.client_companies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));