-- Añadir columna precio de la acción a pari_runs
ALTER TABLE public.pari_runs 
ADD COLUMN "48_precio_accion" text DEFAULT 'NC';

-- Actualizar comentario de la columna
COMMENT ON COLUMN public.pari_runs."48_precio_accion" IS 'Precio de la acción. NC = No cotiza (para empresas privadas)';

-- Verificar la nueva columna
SELECT 'Columna precio_accion añadida correctamente' as resultado;