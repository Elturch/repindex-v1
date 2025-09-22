-- Make 03_target_name nullable to allow empty values from Make
ALTER TABLE public.pari_runs 
ALTER COLUMN "03_target_name" DROP NOT NULL;