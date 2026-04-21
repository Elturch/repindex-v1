-- Phase 1.13 — Security hardening
-- E-A: Remove unrestricted INSERT on interested_leads (legitimate writes go via service_role in save-interested-lead)
DROP POLICY IF EXISTS "Public can insert leads" ON public.interested_leads;

-- E-B prerequisites: admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  edge_function text NOT NULL,
  action text NOT NULL,
  resource text,
  payload jsonb,
  ip_address text,
  user_agent text,
  status_code int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_user_idx ON public.admin_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read; writes happen via service_role (bypasses RLS); no public policies for INSERT/UPDATE/DELETE
CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));