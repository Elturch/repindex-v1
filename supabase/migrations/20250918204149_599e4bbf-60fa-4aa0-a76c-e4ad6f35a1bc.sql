-- Add two new columns to pari_runs table for storing raw results
ALTER TABLE public.pari_runs 
ADD COLUMN "res-gpt-bruto" TEXT,
ADD COLUMN "res-perplex-bruto" TEXT;