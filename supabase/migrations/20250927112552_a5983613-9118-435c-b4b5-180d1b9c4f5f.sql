-- Add missing column for precio accion interanual
ALTER TABLE public.pari_runs 
ADD COLUMN "50_precio_accion_interanual" text DEFAULT 'NC';