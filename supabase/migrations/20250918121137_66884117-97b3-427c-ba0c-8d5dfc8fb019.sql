-- Add prueba column to repindex_root_issuers table
ALTER TABLE public.repindex_root_issuers 
ADD COLUMN prueba TEXT DEFAULT 'no' CHECK (prueba IN ('sí', 'no'));

-- Update energy companies within Repsol's scope to 'sí'
UPDATE public.repindex_root_issuers 
SET prueba = 'sí' 
WHERE ticker IN (
    'REP',     -- Repsol
    'ENG',     -- Enagás
    'ELE',     -- Endesa
    'IBE',     -- Iberdrola
    'NTGY',    -- Naturgy
    'RED',     -- Redeia
    'SLR'      -- Solaria
);