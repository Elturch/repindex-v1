ALTER TABLE public.consensus_health_studies
  ADD COLUMN IF NOT EXISTS metrics_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS categorical_agreement jsonb;