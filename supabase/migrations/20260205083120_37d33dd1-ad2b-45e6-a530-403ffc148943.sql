-- Tabla para capturar leads interesados con consentimiento GDPR
CREATE TABLE public.interested_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  contact_consent boolean NOT NULL DEFAULT false,
  consent_date timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  source text NOT NULL DEFAULT 'login_attempt',
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  contacted_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interested_leads_email_key UNIQUE (email)
);

-- RLS
ALTER TABLE public.interested_leads ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (from login page - unauthenticated)
CREATE POLICY "Public can insert leads" ON public.interested_leads
  FOR INSERT WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can view leads" ON public.interested_leads
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update
CREATE POLICY "Admins can update leads" ON public.interested_leads
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete
CREATE POLICY "Admins can delete leads" ON public.interested_leads
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes for quick lookups
CREATE INDEX idx_interested_leads_email ON public.interested_leads(email);
CREATE INDEX idx_interested_leads_status ON public.interested_leads(status);
CREATE INDEX idx_interested_leads_consent ON public.interested_leads(contact_consent);