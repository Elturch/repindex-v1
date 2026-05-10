CREATE TABLE public.consensus_health_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  n_samples integer NOT NULL,
  n_tickers integer NOT NULL,
  n_weeks integer NOT NULL,
  state_distribution jsonb NOT NULL,
  range_by_polarity jsonb NOT NULL,
  spearman jsonb NOT NULL,
  mann_whitney jsonb NOT NULL,
  theme_tags_available boolean NOT NULL DEFAULT false,
  range_by_theme jsonb NULL,
  top_crisis_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  hypothesis_verdict text NOT NULL,
  notes text NULL
);

ALTER TABLE public.consensus_health_studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view consensus health studies"
ON public.consensus_health_studies
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_consensus_health_studies_created_at
  ON public.consensus_health_studies (created_at DESC);