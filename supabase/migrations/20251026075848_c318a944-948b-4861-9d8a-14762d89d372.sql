-- Reasignar registros con period_to del 25-26 octubre al batch correcto
UPDATE rix_runs
SET batch_execution_date = '2025-10-26 00:00:00+00'
WHERE "07_period_to" IN ('2025-10-25', '2025-10-26')
  AND batch_execution_date = '2025-10-19 00:00:00+00';