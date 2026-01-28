-- Create data_quality_reports table for the Quality Watchdog
CREATE TABLE public.data_quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  ticker TEXT NOT NULL,
  model_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing', -- missing, repaired, failed_repair
  error_type TEXT, -- no_response, timeout, rate_limit, payload_error, api_key, connection
  original_error TEXT,
  repair_attempts INTEGER DEFAULT 0,
  repaired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(sweep_id, ticker, model_name)
);

-- Enable RLS
ALTER TABLE public.data_quality_reports ENABLE ROW LEVEL SECURITY;

-- Indexes for efficient queries
CREATE INDEX idx_dqr_sweep ON public.data_quality_reports(sweep_id);
CREATE INDEX idx_dqr_status ON public.data_quality_reports(status);
CREATE INDEX idx_dqr_week ON public.data_quality_reports(week_start);
CREATE INDEX idx_dqr_model ON public.data_quality_reports(model_name);

-- RLS Policies: Publicly readable (for admin panel), service role can manage
CREATE POLICY "Data quality reports are publicly readable" 
ON public.data_quality_reports 
FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage data quality reports" 
ON public.data_quality_reports 
FOR ALL 
USING (true)
WITH CHECK (true);