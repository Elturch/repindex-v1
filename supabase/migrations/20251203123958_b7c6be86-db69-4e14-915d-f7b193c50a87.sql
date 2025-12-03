-- Tabla para almacenar noticias semanales pre-generadas
CREATE TABLE public.weekly_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  week_end date NOT NULL,
  week_label text NOT NULL,
  
  -- Contenido estructurado para SEO
  main_headline text NOT NULL,
  main_story jsonb NOT NULL,
  stories jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Datos crudos para referencia
  raw_data jsonb,
  
  -- Metadata SEO
  meta_title text,
  meta_description text,
  keywords text[],
  
  -- Timestamps
  generated_at timestamptz DEFAULT now(),
  published_at timestamptz,
  
  -- Estado
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived'))
);

-- Índice para búsqueda rápida por fecha
CREATE INDEX idx_weekly_news_week ON weekly_news(week_start DESC);
CREATE INDEX idx_weekly_news_status ON weekly_news(status);

-- RLS policies
ALTER TABLE weekly_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso público de lectura weekly_news"
ON weekly_news FOR SELECT USING (true);

CREATE POLICY "Inserción restringida weekly_news"
ON weekly_news FOR INSERT WITH CHECK (true);

CREATE POLICY "Actualización restringida weekly_news"
ON weekly_news FOR UPDATE USING (true);

-- Habilitar extensiones necesarias para CRON
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;