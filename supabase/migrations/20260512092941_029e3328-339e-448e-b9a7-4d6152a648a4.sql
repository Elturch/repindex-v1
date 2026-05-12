
CREATE TABLE public.stress_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  spec_version text NOT NULL DEFAULT 'v1',
  family text NOT NULL DEFAULT 'all',
  total_cases int NOT NULL DEFAULT 0,
  passed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  errored int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  triggered_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stress_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.stress_runs(id) ON DELETE CASCADE,
  case_id text NOT NULL,
  family text NOT NULL,
  query text NOT NULL,
  model_filter text,
  weeks int,
  scope text,
  expected_skill text,
  actual_skill text,
  latency_ms int,
  status text NOT NULL DEFAULT 'pending',
  asserts_passed jsonb DEFAULT '[]'::jsonb,
  asserts_failed jsonb DEFAULT '[]'::jsonb,
  response_markdown text,
  response_meta jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stress_results_run ON public.stress_results(run_id);
CREATE INDEX idx_stress_results_status ON public.stress_results(status);
CREATE INDEX idx_stress_runs_started ON public.stress_runs(started_at DESC);

ALTER TABLE public.stress_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stress_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read stress_runs" ON public.stress_runs
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "admins insert stress_runs" ON public.stress_runs
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admins update stress_runs" ON public.stress_runs
  FOR UPDATE USING (public.is_admin(auth.uid()));

CREATE POLICY "admins read stress_results" ON public.stress_results
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "admins insert stress_results" ON public.stress_results
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admins update stress_results" ON public.stress_results
  FOR UPDATE USING (public.is_admin(auth.uid()));
