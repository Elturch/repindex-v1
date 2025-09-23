-- Change 22_explicacion column from ARRAY to TEXT
ALTER TABLE public.pari_runs 
ALTER COLUMN "22_explicacion" TYPE TEXT;