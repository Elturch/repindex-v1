-- Add fase column to pari_runs table
ALTER TABLE public.pari_runs ADD COLUMN "47_fase" text;

-- Create foreign key relationship between pari_runs and repindex_root_issuers
-- This will allow the LEFT JOIN to work properly
ALTER TABLE public.pari_runs 
ADD CONSTRAINT fk_pari_runs_ticker 
FOREIGN KEY ("05_ticker") 
REFERENCES public.repindex_root_issuers(ticker);