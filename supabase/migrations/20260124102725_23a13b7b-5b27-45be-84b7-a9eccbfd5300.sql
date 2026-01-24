-- Eliminar los 6 registros duplicados de Endesa (segunda ejecución de las 19:59)
DELETE FROM rix_runs_v2
WHERE "05_ticker" = 'ELE'
  AND "06_period_from" = '2026-01-16'
  AND "07_period_to" = '2026-01-23'
  AND created_at >= '2026-01-23T19:59:00+00:00';

-- Crear índice único para prevenir futuros duplicados
CREATE UNIQUE INDEX IF NOT EXISTS idx_rix_runs_v2_unique_model_period 
ON rix_runs_v2 ("05_ticker", "02_model_name", "06_period_from", "07_period_to");