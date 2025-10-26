-- Agregar columna batch_execution_date
ALTER TABLE rix_runs 
ADD COLUMN batch_execution_date timestamp with time zone;

-- Poblar datos históricos (todo antes del 25 de octubre 22:00 UTC)
-- Estos van a "Consulta #1: 19/10/2025"
UPDATE rix_runs
SET batch_execution_date = '2025-10-19 00:00:00+00'
WHERE created_at < '2025-10-25 22:00:00+00';

-- Poblar datos del batch actual (25-26 octubre)
-- Estos van a "Consulta #2: 26/10/2025" 
UPDATE rix_runs
SET batch_execution_date = '2025-10-26 00:00:00+00'
WHERE created_at >= '2025-10-25 22:00:00+00';

-- Hacer la columna NOT NULL después de poblar
ALTER TABLE rix_runs 
ALTER COLUMN batch_execution_date SET NOT NULL;

-- Establecer valor por defecto para nuevos registros
ALTER TABLE rix_runs 
ALTER COLUMN batch_execution_date SET DEFAULT now();

-- Crear índice para mejorar performance en queries agrupadas
CREATE INDEX idx_rix_runs_batch_execution_date 
ON rix_runs(batch_execution_date);