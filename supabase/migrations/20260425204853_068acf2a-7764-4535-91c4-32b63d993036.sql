-- GAP 4 micro-fix: eliminar alias 'media' suelto del grupo medios_comunicacion
-- para evitar colisión con queries tipo "media RIX del IBEX-35" que son
-- estadísticas, no medios de comunicación. Mantiene los 8 aliases restantes.
UPDATE public.rix_semantic_groups
SET aliases = array_remove(aliases, 'media')
WHERE canonical_key = 'medios_comunicacion'
  AND 'media' = ANY(aliases);