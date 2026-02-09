
-- Corregir metadatos en documentos del Vector Store para Acciona Energía
UPDATE documents 
SET metadata = jsonb_set(metadata, '{ibex_family_code}', '"IBEX-35"')
WHERE metadata->>'ticker' IN ('ANE', 'ANE.MC')
  AND (metadata->>'ibex_family_code' IS NULL OR metadata->>'ibex_family_code' != 'IBEX-35');

-- Corregir metadatos en documentos del Vector Store para Catalana Occidente
UPDATE documents 
SET metadata = jsonb_set(metadata, '{ibex_family_code}', '"IBEX-MC"')
WHERE metadata->>'ticker' IN ('CAT', 'GCO.MC')
  AND (metadata->>'ibex_family_code' IS NULL OR metadata->>'ibex_family_code' != 'IBEX-MC');
