-- ============================================================================
-- TABLAS DE MONITOREO Y SALUD DEL PIPELINE RIX V2
-- Fase 2 del Plan de Mejora: Sistema de Alertas Proactivas
-- ============================================================================

-- Tabla para registrar checks de salud del pipeline
CREATE TABLE public.pipeline_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type text NOT NULL,           -- 'sweep_progress', 'analysis_completion', 'model_errors', 'zombie_reset'
  sweep_id text,                       -- ID del barrido semanal (e.g., '2026-W04')
  status text NOT NULL,                -- 'healthy', 'warning', 'critical'
  details jsonb DEFAULT '{}',          -- Detalles del check (conteos, modelos afectados, etc.)
  resolved_at timestamptz,             -- Cuándo se resolvió (null si activo)
  checked_at timestamptz DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX idx_pipeline_health_checks_sweep ON public.pipeline_health_checks(sweep_id);
CREATE INDEX idx_pipeline_health_checks_status ON public.pipeline_health_checks(status) WHERE resolved_at IS NULL;
CREATE INDEX idx_pipeline_health_checks_type ON public.pipeline_health_checks(check_type);
CREATE INDEX idx_pipeline_health_checks_active ON public.pipeline_health_checks(checked_at DESC) WHERE resolved_at IS NULL;

-- Tabla para logs centralizados del pipeline
CREATE TABLE public.pipeline_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id text,                       -- ID del barrido semanal
  ticker text,                         -- Empresa procesada
  model_name text,                     -- Modelo IA usado
  stage text NOT NULL,                 -- 'search', 'analyze', 'vectorize', 'orchestrator', 'health_check'
  status text NOT NULL,                -- 'started', 'completed', 'failed', 'skipped'
  duration_ms integer,                 -- Duración en milisegundos
  error_message text,                  -- Mensaje de error si falló
  metadata jsonb DEFAULT '{}',         -- Datos adicionales (tokens, retry_count, etc.)
  created_at timestamptz DEFAULT now()
);

-- Índices para consultas de logs
CREATE INDEX idx_pipeline_logs_sweep ON public.pipeline_logs(sweep_id);
CREATE INDEX idx_pipeline_logs_ticker ON public.pipeline_logs(ticker);
CREATE INDEX idx_pipeline_logs_model ON public.pipeline_logs(model_name);
CREATE INDEX idx_pipeline_logs_stage ON public.pipeline_logs(stage);
CREATE INDEX idx_pipeline_logs_status ON public.pipeline_logs(status);
CREATE INDEX idx_pipeline_logs_created ON public.pipeline_logs(created_at DESC);
CREATE INDEX idx_pipeline_logs_errors ON public.pipeline_logs(created_at DESC) WHERE status = 'failed';

-- RLS: Solo lectura pública, escritura via service role
ALTER TABLE public.pipeline_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para pipeline_health_checks
CREATE POLICY "Pipeline health checks are readable by authenticated users" 
  ON public.pipeline_health_checks 
  FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage health checks" 
  ON public.pipeline_health_checks 
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas para pipeline_logs
CREATE POLICY "Pipeline logs are readable by authenticated users" 
  ON public.pipeline_logs 
  FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage pipeline logs" 
  ON public.pipeline_logs 
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comentarios para documentación
COMMENT ON TABLE public.pipeline_health_checks IS 'Almacena checks de salud del pipeline RIX V2 para alertas proactivas';
COMMENT ON TABLE public.pipeline_logs IS 'Logs centralizados de todas las etapas del pipeline RIX V2';

COMMENT ON COLUMN public.pipeline_health_checks.check_type IS 'Tipo: sweep_progress, analysis_completion, model_errors, zombie_reset';
COMMENT ON COLUMN public.pipeline_health_checks.status IS 'Estado: healthy, warning, critical';
COMMENT ON COLUMN public.pipeline_health_checks.resolved_at IS 'NULL si el problema sigue activo';

COMMENT ON COLUMN public.pipeline_logs.stage IS 'Etapa: search, analyze, vectorize, orchestrator, health_check';
COMMENT ON COLUMN public.pipeline_logs.status IS 'Estado: started, completed, failed, skipped';