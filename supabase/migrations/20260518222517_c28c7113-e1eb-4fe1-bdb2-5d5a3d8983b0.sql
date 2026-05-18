UPDATE public.repindex_root_issuers
SET ibex_family_code = 'IBEX-35'
WHERE ticker = 'PUIG';

UPDATE public.repindex_root_issuers
SET ibex_family_code = NULL
WHERE ticker = 'MEL';