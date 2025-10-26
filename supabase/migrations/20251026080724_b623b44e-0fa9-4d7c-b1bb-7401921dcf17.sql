-- Fase 1: Auditoría y Limpieza de Duplicados en Batch 1

-- 1. Crear tabla de auditoría para registrar los duplicados eliminados
CREATE TABLE IF NOT EXISTS rix_runs_duplicates_audit (
  id uuid NOT NULL,
  target_name text,
  ticker text,
  model_name text,
  batch_execution_date timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  rix_score integer,
  row_number integer,
  deleted_at timestamp with time zone DEFAULT now(),
  reason text DEFAULT 'Duplicate entry - kept most recent'
);

-- 2. Insertar en la tabla de auditoría todos los duplicados que vamos a eliminar
-- (todos excepto el más reciente por cada combinación de empresa+modelo+batch)
INSERT INTO rix_runs_duplicates_audit (
  id,
  target_name,
  ticker,
  model_name,
  batch_execution_date,
  created_at,
  updated_at,
  rix_score,
  row_number
)
SELECT 
  r.id,
  r."03_target_name",
  r."05_ticker",
  r."02_model_name",
  r.batch_execution_date,
  r.created_at,
  r.updated_at,
  COALESCE(r."51_rix_score_adjusted", r."09_rix_score"),
  ROW_NUMBER() OVER (
    PARTITION BY r."03_target_name", r."02_model_name", r.batch_execution_date 
    ORDER BY r.created_at DESC
  ) as row_num
FROM rix_runs r
WHERE r.batch_execution_date = '2025-10-19 00:00:00+00'
  AND EXISTS (
    -- Solo incluir empresas que tienen duplicados
    SELECT 1
    FROM rix_runs r2
    WHERE r2."03_target_name" = r."03_target_name"
      AND r2."02_model_name" = r."02_model_name"
      AND r2.batch_execution_date = r.batch_execution_date
      AND r2.id != r.id
  );

-- 3. Eliminar los duplicados (mantener solo el más reciente)
-- Usamos una CTE para identificar qué registros mantener
WITH records_to_keep AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "03_target_name", "02_model_name", batch_execution_date 
      ORDER BY created_at DESC
    ) as row_num
  FROM rix_runs
  WHERE batch_execution_date = '2025-10-19 00:00:00+00'
)
DELETE FROM rix_runs
WHERE id IN (
  SELECT id 
  FROM records_to_keep 
  WHERE row_num > 1
);

-- 4. Crear índices para mejorar performance de consultas de auditoría
CREATE INDEX IF NOT EXISTS idx_rix_runs_duplicates_audit_target 
  ON rix_runs_duplicates_audit(target_name);
CREATE INDEX IF NOT EXISTS idx_rix_runs_duplicates_audit_model 
  ON rix_runs_duplicates_audit(model_name);
CREATE INDEX IF NOT EXISTS idx_rix_runs_duplicates_audit_batch 
  ON rix_runs_duplicates_audit(batch_execution_date);

-- 5. Habilitar RLS en la tabla de auditoría
ALTER TABLE rix_runs_duplicates_audit ENABLE ROW LEVEL SECURITY;

-- 6. Crear política de lectura pública para auditoría
CREATE POLICY "Acceso público de lectura duplicates_audit"
  ON rix_runs_duplicates_audit
  FOR SELECT
  USING (true);

-- 7. Restringir escritura en la tabla de auditoría (solo via migrations)
CREATE POLICY "Escritura restringida duplicates_audit"
  ON rix_runs_duplicates_audit
  FOR ALL
  USING (false)
  WITH CHECK (false);