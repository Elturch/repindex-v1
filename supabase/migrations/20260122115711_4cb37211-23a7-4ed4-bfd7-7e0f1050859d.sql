-- Fase 3: Limpiar duplicados en rix_runs_v2
-- Mantener solo el registro más reciente por cada combinación ticker+modelo

DELETE FROM rix_runs_v2
WHERE id NOT IN (
  SELECT DISTINCT ON ("05_ticker", "02_model_name") id
  FROM rix_runs_v2
  ORDER BY "05_ticker", "02_model_name", created_at DESC
);