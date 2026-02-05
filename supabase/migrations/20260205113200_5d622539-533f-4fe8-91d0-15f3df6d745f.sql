-- Create lead_qualification_responses table
CREATE TABLE public.lead_qualification_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.interested_leads(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    companies_interested TEXT[] DEFAULT '{}',
    sectors_interested TEXT[] DEFAULT '{}',
    role_type TEXT,
    additional_notes TEXT,
    email_domain TEXT,
    is_corporate_email BOOLEAN DEFAULT false,
    contactability_score INTEGER DEFAULT 0,
    submitted_at TIMESTAMP WITH TIME ZONE,
    form_sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add new columns to interested_leads
ALTER TABLE public.interested_leads 
ADD COLUMN IF NOT EXISTS qualification_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS qualification_score INTEGER DEFAULT 0;

-- Enable RLS on lead_qualification_responses
ALTER TABLE public.lead_qualification_responses ENABLE ROW LEVEL SECURITY;

-- RLS policies for lead_qualification_responses
-- Only service_role can insert/update (via edge functions)
CREATE POLICY "Service role can manage qualification responses"
ON public.lead_qualification_responses
FOR ALL
USING (true)
WITH CHECK (true);

-- Admins can view qualification responses
CREATE POLICY "Admins can view qualification responses"
ON public.lead_qualification_responses
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create index for token lookups
CREATE INDEX idx_qualification_token ON public.lead_qualification_responses(token);
CREATE INDEX idx_qualification_lead_id ON public.lead_qualification_responses(lead_id);