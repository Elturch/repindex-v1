-- Tabla para noticias/blog corporativo
CREATE TABLE public.corporate_news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  article_url TEXT NOT NULL,
  headline TEXT NOT NULL,
  lead_paragraph TEXT, -- Entradilla
  body_excerpt TEXT, -- Primeros ~500 caracteres del cuerpo
  published_date DATE,
  author TEXT,
  category TEXT, -- Categoría o sección del blog
  source_type TEXT DEFAULT 'corporate_blog', -- 'corporate_blog', 'press_release', 'investor_news'
  raw_markdown TEXT, -- Contenido completo en markdown
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint para evitar duplicados
  CONSTRAINT unique_news_article UNIQUE (ticker, article_url)
);

-- Índices para búsquedas eficientes
CREATE INDEX idx_corporate_news_ticker ON public.corporate_news(ticker);
CREATE INDEX idx_corporate_news_date ON public.corporate_news(snapshot_date DESC);
CREATE INDEX idx_corporate_news_published ON public.corporate_news(published_date DESC);

-- Enable RLS
ALTER TABLE public.corporate_news ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública (datos no sensibles)
CREATE POLICY "Corporate news is viewable by everyone"
ON public.corporate_news FOR SELECT
USING (true);

-- Solo service role puede insertar/actualizar
CREATE POLICY "Service role can manage corporate news"
ON public.corporate_news FOR ALL
USING (auth.role() = 'service_role');

-- Añadir campos extra a corporate_snapshots para blog URLs
ALTER TABLE public.corporate_snapshots 
ADD COLUMN IF NOT EXISTS blog_url TEXT,
ADD COLUMN IF NOT EXISTS press_room_url TEXT,
ADD COLUMN IF NOT EXISTS investor_relations_url TEXT,
ADD COLUMN IF NOT EXISTS news_articles_count INTEGER DEFAULT 0;

-- Comentarios para documentación
COMMENT ON TABLE public.corporate_news IS 'Noticias y posts del blog corporativo de cada empresa, para indexar en Vector Store';
COMMENT ON COLUMN public.corporate_news.lead_paragraph IS 'Entradilla o primer párrafo de la noticia';
COMMENT ON COLUMN public.corporate_news.body_excerpt IS 'Extracto de ~500 caracteres del cuerpo del artículo';