
-- Normalizar todas las fechas batch_execution_date al domingo de su semana
-- Lógica: 
-- - Si es domingo (DOW=0): mantener
-- - Si es lunes-sábado (DOW=1-6): retroceder al domingo anterior

UPDATE rix_runs
SET batch_execution_date = (
  batch_execution_date::date - 
  INTERVAL '1 day' * EXTRACT(DOW FROM batch_execution_date)
)::timestamp with time zone
WHERE EXTRACT(DOW FROM batch_execution_date) != 0;

-- Crear un trigger para normalizar automáticamente las fechas futuras
CREATE OR REPLACE FUNCTION normalize_batch_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Normalizar al domingo de la semana (DOW=0)
  NEW.batch_execution_date := (
    NEW.batch_execution_date::date - 
    INTERVAL '1 day' * EXTRACT(DOW FROM NEW.batch_execution_date)
  )::timestamp with time zone;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_batch_date_trigger
BEFORE INSERT OR UPDATE ON rix_runs
FOR EACH ROW
EXECUTE FUNCTION normalize_batch_date();
