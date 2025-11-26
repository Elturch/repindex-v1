-- Eliminar todas las restricciones de rix_runs_ampliada para permitir inserciones de prueba sin validaciones

-- Eliminar constraint check_valid_ticker
ALTER TABLE rix_runs_ampliada DROP CONSTRAINT IF EXISTS check_valid_ticker;

-- Eliminar trigger prevent_ticker_placeholders si existe
DROP TRIGGER IF EXISTS prevent_ticker_placeholders ON rix_runs_ampliada;

-- Eliminar constraint de normalización de batch_date si existe
DROP TRIGGER IF EXISTS normalize_batch_date_trigger ON rix_runs_ampliada;

-- Eliminar trigger de actualización de updated_at si existe
DROP TRIGGER IF EXISTS update_rix_runs_ampliada_updated_at ON rix_runs_ampliada;

-- Eliminar cualquier otro constraint CHECK que pueda existir
DO $$ 
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'rix_runs_ampliada'::regclass 
        AND contype = 'c'
    LOOP
        EXECUTE format('ALTER TABLE rix_runs_ampliada DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;
END $$;