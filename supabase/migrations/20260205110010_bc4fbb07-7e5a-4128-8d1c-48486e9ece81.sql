-- Add UNIQUE constraint on email for upsert to work correctly
ALTER TABLE public.interested_leads 
ADD CONSTRAINT interested_leads_email_unique UNIQUE (email);