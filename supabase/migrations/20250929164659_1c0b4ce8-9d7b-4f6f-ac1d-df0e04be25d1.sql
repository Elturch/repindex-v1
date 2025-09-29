-- Add new AI response columns to pari_runs table
ALTER TABLE public.pari_runs 
ADD COLUMN "22_res_gemini_bruto" text,
ADD COLUMN "23_res_deepseek_bruto" text;

-- Update the comment to reflect the new columns
COMMENT ON COLUMN public.pari_runs."22_res_gemini_bruto" IS 'Raw response from Gemini model';
COMMENT ON COLUMN public.pari_runs."23_res_deepseek_bruto" IS 'Raw response from DeepSeek model';

-- Adjust existing column numbers if needed (explicaciones_detalladas moves from 23 to 25)
ALTER TABLE public.pari_runs 
RENAME COLUMN "23_explicaciones_detalladas" TO "25_explicaciones_detalladas";