-- Añadir columna precio de acción interanual a pari_runs
ALTER TABLE public.pari_runs 
ADD COLUMN "50_precio_accion_interanual" text DEFAULT NULL;

-- Actualizar comentario de la columna
COMMENT ON COLUMN public.pari_runs."50_precio_accion_interanual" IS 'Precio de la acción interanual - comparación con hace 12 meses (puede contener precios, porcentajes, o NC para no cotizadas)';

-- Verificar la nueva columna
SELECT 'Columna precio_accion_interanual añadida correctamente' as resultado;