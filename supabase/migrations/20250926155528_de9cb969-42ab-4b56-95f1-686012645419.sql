-- Renombrar columna de precio acción interanual a precio mínimo 52 semanas
ALTER TABLE public.pari_runs 
RENAME COLUMN "50_precio_accion_interanual" TO "59_precio_minimo_52_semanas";

-- Actualizar comentario de la columna
COMMENT ON COLUMN public.pari_runs."59_precio_minimo_52_semanas" IS 'Precio mínimo de la acción en las últimas 52 semanas (puede contener precios, porcentajes, o NC para no cotizadas)';

-- Verificar el cambio
SELECT 'Columna renombrada a precio_minimo_52_semanas correctamente' as resultado;