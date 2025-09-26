-- Update companies that are confirmed to NOT be trading anymore

-- NH Hoteles / Minor Hotels Europe & Americas - confirmed excluded in 2025
UPDATE public.repindex_root_issuers 
SET cotiza_en_bolsa = false 
WHERE issuer_name ILIKE '%NH%' OR issuer_name ILIKE '%Minor%' OR ticker = 'MHS';

-- Based on research, most companies with valid IBEX family codes are still trading
-- Update all companies with valid IBEX classifications to TRUE (they are currently trading)
UPDATE public.repindex_root_issuers 
SET cotiza_en_bolsa = true
WHERE ibex_family_code IN ('IBEX-35', 'IBEX-MC', 'IBEX-SC', 'BME-GROWTH')
  AND cotiza_en_bolsa IS NULL;

-- Companies classified as MC-OTHER might need individual verification
-- For now, assume they are trading unless proven otherwise
UPDATE public.repindex_root_issuers 
SET cotiza_en_bolsa = true
WHERE ibex_family_code = 'MC-OTHER'
  AND cotiza_en_bolsa IS NULL;