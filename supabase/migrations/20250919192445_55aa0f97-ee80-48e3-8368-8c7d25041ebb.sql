-- Add explicacion column to pari_runs table
ALTER TABLE public.pari_runs 
ADD COLUMN explicacion text[];

-- Add comment to document the new column
COMMENT ON COLUMN public.pari_runs.explicacion IS 'Array de explicaciones/comentarios para el PARI run';