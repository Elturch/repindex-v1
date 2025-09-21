-- Añadir valor por defecto al campo 01_run_id para que se genere automáticamente
ALTER TABLE public.pari_runs 
ALTER COLUMN "01_run_id" SET DEFAULT gen_random_uuid()::text;

-- Comentario: Esto permitirá que el campo 01_run_id se genere automáticamente cuando no se proporcione un valor