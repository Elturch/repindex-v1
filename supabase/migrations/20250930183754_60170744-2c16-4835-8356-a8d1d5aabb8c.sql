-- Create table for AI consolidation reports
CREATE TABLE public.ai_consolidation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  week_start date NOT NULL,
  week_end date NOT NULL,
  ticker text,
  company_name text NOT NULL,
  
  -- Analysis results
  main_coincidences jsonb NOT NULL DEFAULT '[]'::jsonb,
  common_media_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  divergences jsonb NOT NULL DEFAULT '[]'::jsonb,
  consensus_score integer CHECK (consensus_score >= 0 AND consensus_score <= 100),
  
  -- Detailed analysis
  full_analysis text,
  media_ranking jsonb NOT NULL DEFAULT '[]'::jsonb,
  temporal_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Metadata
  models_analyzed text[] NOT NULL DEFAULT ARRAY[]::text[],
  total_sources_found integer DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.ai_consolidation_reports ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Acceso público de lectura consolidation"
ON public.ai_consolidation_reports
FOR SELECT
TO public
USING (true);

-- Public insert access
CREATE POLICY "Acceso público de inserción consolidation"
ON public.ai_consolidation_reports
FOR INSERT
TO public
WITH CHECK (true);

-- Public update access
CREATE POLICY "Acceso público de actualización consolidation"
ON public.ai_consolidation_reports
FOR UPDATE
TO public
USING (true);

-- Public delete access
CREATE POLICY "Acceso público de eliminación consolidation"
ON public.ai_consolidation_reports
FOR DELETE
TO public
USING (true);

-- Create index for faster queries
CREATE INDEX idx_consolidation_week ON public.ai_consolidation_reports(week_start, week_end);
CREATE INDEX idx_consolidation_company ON public.ai_consolidation_reports(company_name);
CREATE INDEX idx_consolidation_ticker ON public.ai_consolidation_reports(ticker);