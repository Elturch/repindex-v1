-- Añadir columna para noticias breves
ALTER TABLE public.weekly_news 
ADD COLUMN IF NOT EXISTS brief_news jsonb DEFAULT '[]'::jsonb;