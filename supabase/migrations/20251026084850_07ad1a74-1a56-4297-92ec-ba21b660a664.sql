-- Normalizar batch_execution_date del Batch 2 (26 de octubre 2025)
-- Convertir todos los timestamps a medianoche (00:00:00+00)

UPDATE rix_runs
SET batch_execution_date = DATE_TRUNC('day', batch_execution_date)
WHERE batch_execution_date::date = '2025-10-26'
  AND batch_execution_date != '2025-10-26 00:00:00+00';