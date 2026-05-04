-- ============================================================
-- Quality Audit system for Agente RIX V2
-- ============================================================

CREATE TABLE public.audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  total_queries int NOT NULL DEFAULT 0,
  completed_queries int NOT NULL DEFAULT 0,
  failed_queries int NOT NULL DEFAULT 0,
  notes text,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.audit_runs(id) ON DELETE CASCADE,
  query_id text NOT NULL,
  family text NOT NULL,
  question text NOT NULL,
  output text,
  datapack jsonb,
  metadata jsonb,
  latency_ms int,
  auto_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_results_run_id ON public.audit_results(run_id);
CREATE INDEX idx_audit_results_family ON public.audit_results(family);

CREATE TABLE public.audit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.audit_results(id) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN (
    'grounding','temporal','anti_mediana','competidores','estructura','sanitizacion','fiabilidad'
  )),
  score int NOT NULL CHECK (score BETWEEN 0 AND 2),
  note text,
  scored_by uuid,
  scored_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_id, dimension)
);

CREATE INDEX idx_audit_scores_result_id ON public.audit_scores(result_id);

ALTER TABLE public.audit_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_scores  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit_runs"
  ON public.audit_runs FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage audit_results"
  ON public.audit_results FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage audit_scores"
  ON public.audit_scores FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));