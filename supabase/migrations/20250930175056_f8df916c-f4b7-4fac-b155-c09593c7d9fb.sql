-- Add columns to track MPI "no aplica" handling and adjusted PARI score
ALTER TABLE public.pari_runs 
ADD COLUMN IF NOT EXISTS "51_pari_score_adjusted" integer,
ADD COLUMN IF NOT EXISTS "52_mpi_excluded" boolean DEFAULT false;

-- Add comments to describe the new columns
COMMENT ON COLUMN public.pari_runs."51_pari_score_adjusted" IS 'Adjusted PARI score calculated without MPI when MPI = "no aplica"';
COMMENT ON COLUMN public.pari_runs."52_mpi_excluded" IS 'Flag indicating whether MPI was excluded from PARI calculation due to "no aplica" status';