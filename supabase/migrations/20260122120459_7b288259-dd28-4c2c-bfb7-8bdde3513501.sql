-- Sistema de Barrido por Fases: Tabla de Progreso
-- Permite persistir el estado de cada empresa en cada barrido semanal

CREATE TABLE IF NOT EXISTS sweep_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sweep_id text NOT NULL,                    -- Identificador del barrido (ej: "2026-W04")
  fase integer NOT NULL,                     -- Fase de la empresa (1-34)
  ticker text NOT NULL,                      -- Ticker de la empresa
  issuer_name text,                          -- Nombre de la empresa (para referencia)
  status text NOT NULL DEFAULT 'pending',    -- 'pending', 'processing', 'completed', 'failed'
  models_completed integer DEFAULT 0,        -- Modelos completados (0-7)
  started_at timestamptz,                    -- Cuando empezó el procesamiento
  completed_at timestamptz,                  -- Cuando terminó
  error_message text,                        -- Mensaje de error si falló
  retry_count integer DEFAULT 0,             -- Número de reintentos
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(sweep_id, ticker)
);

-- Índices para consultas eficientes
CREATE INDEX idx_sweep_progress_status ON sweep_progress(sweep_id, status);
CREATE INDEX idx_sweep_progress_fase ON sweep_progress(sweep_id, fase);
CREATE INDEX idx_sweep_progress_pending ON sweep_progress(sweep_id, status) WHERE status = 'pending';

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_sweep_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sweep_progress_updated_at
  BEFORE UPDATE ON sweep_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_sweep_progress_updated_at();

-- RLS Policies
ALTER TABLE sweep_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública sweep_progress" 
  ON sweep_progress FOR SELECT 
  USING (true);

CREATE POLICY "Inserción pública sweep_progress" 
  ON sweep_progress FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Actualización pública sweep_progress" 
  ON sweep_progress FOR UPDATE 
  USING (true);

CREATE POLICY "Eliminación pública sweep_progress" 
  ON sweep_progress FOR DELETE 
  USING (true);

-- Comentarios para documentación
COMMENT ON TABLE sweep_progress IS 'Tabla de seguimiento de progreso del barrido semanal RIX V2';
COMMENT ON COLUMN sweep_progress.sweep_id IS 'Identificador único del barrido, formato: YYYY-Www';
COMMENT ON COLUMN sweep_progress.fase IS 'Fase de la empresa según repindex_root_issuers.fase (1-34)';
COMMENT ON COLUMN sweep_progress.status IS 'Estado: pending, processing, completed, failed';