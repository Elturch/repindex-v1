-- Corrección composición oficial IBEX-35 (fuente: Comité Asesor IBEX / BME)
-- Quitar emisores que no pertenecen al IBEX-35
UPDATE public.repindex_root_issuers
SET ibex_family_code = NULL
WHERE ticker IN ('ABE.MC','GCO.MC','PUIG');

-- Reincluir emisores oficiales del IBEX-35 que estaban mal etiquetados
UPDATE public.repindex_root_issuers
SET ibex_family_code = 'IBEX-35'
WHERE ticker IN ('FDR','GRF','MEL');