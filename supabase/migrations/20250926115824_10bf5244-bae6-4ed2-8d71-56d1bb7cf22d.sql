-- Añadir columna reputación vs precio de la acción a pari_runs
ALTER TABLE public.pari_runs 
ADD COLUMN "49_reputacion_vs_precio" text DEFAULT NULL;

-- Actualizar comentario de la columna
COMMENT ON COLUMN public.pari_runs."49_reputacion_vs_precio" IS 'Relación entre reputación y precio de la acción (ej: Sobrevalorada, Infravalorada, Equilibrada, NC)';

-- Verificar la nueva columna
SELECT 'Columna reputacion_vs_precio añadida correctamente' as resultado;