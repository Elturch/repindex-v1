-- Create cron_triggers table for server-side scheduled actions
CREATE TABLE IF NOT EXISTS public.cron_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  params jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  result jsonb
);

-- Index for efficient pending trigger lookup
CREATE INDEX idx_cron_triggers_pending ON cron_triggers(status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.cron_triggers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert triggers
CREATE POLICY "Authenticated users can insert triggers" 
ON public.cron_triggers 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to read their triggers
CREATE POLICY "Authenticated users can read triggers" 
ON public.cron_triggers 
FOR SELECT 
TO authenticated
USING (true);

-- Comment
COMMENT ON TABLE public.cron_triggers IS 'Server-side scheduled actions triggered by admin panel, processed by rix-batch-orchestrator';