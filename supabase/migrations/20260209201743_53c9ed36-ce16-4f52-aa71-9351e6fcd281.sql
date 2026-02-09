
-- Create rix_composite_scores table for RIXc Lite
CREATE TABLE public.rix_composite_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  company_name text NOT NULL,
  week_start date NOT NULL,
  rixc_score numeric NOT NULL,
  sigma_intermodelo numeric NOT NULL,
  ic_score numeric NOT NULL,
  consensus_level text NOT NULL,
  models_count integer NOT NULL,
  individual_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticker, week_start)
);

-- Enable RLS
ALTER TABLE public.rix_composite_scores ENABLE ROW LEVEL SECURITY;

-- Public read (admin preview)
CREATE POLICY "RIXc scores are publicly readable"
ON public.rix_composite_scores
FOR SELECT
USING (true);

-- Service role write
CREATE POLICY "Service role can manage rixc scores"
ON public.rix_composite_scores
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Index for efficient queries
CREATE INDEX idx_rixc_scores_week_ticker ON public.rix_composite_scores (week_start DESC, ticker);
