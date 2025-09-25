-- Add new column to store detailed explanations from each metric
ALTER TABLE public.pari_runs 
ADD COLUMN "23_explicaciones_detalladas" jsonb;