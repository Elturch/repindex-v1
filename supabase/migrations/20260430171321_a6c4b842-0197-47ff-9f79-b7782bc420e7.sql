UPDATE public.repindex_root_issuers
SET sector_category = 'Defensa e Ingeniería'
WHERE ticker = 'EME-PRIV'
  AND issuer_name ILIKE '%Escribano%';