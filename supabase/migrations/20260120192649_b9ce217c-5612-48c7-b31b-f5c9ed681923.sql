-- Create news_articles table for individual SEO-optimized articles
CREATE TABLE public.news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID REFERENCES public.weekly_news(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  headline TEXT NOT NULL,
  meta_description TEXT,
  lead TEXT NOT NULL,
  body TEXT NOT NULL,
  data_highlight TEXT,
  keywords TEXT[],
  companies TEXT[],
  chart_data JSONB,
  category TEXT,
  is_main_story BOOLEAN DEFAULT false,
  reading_time_minutes INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft',
  view_count INTEGER DEFAULT 0,
  canonical_url TEXT,
  og_image_url TEXT
);

-- Create indices for performance
CREATE INDEX idx_news_articles_slug ON public.news_articles(slug);
CREATE INDEX idx_news_articles_published ON public.news_articles(published_at DESC) WHERE status = 'published';
CREATE INDEX idx_news_articles_category ON public.news_articles(category);
CREATE INDEX idx_news_articles_week ON public.news_articles(week_id);

-- Enable RLS
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

-- Public read access for published articles
CREATE POLICY "Public can read published articles" 
ON public.news_articles 
FOR SELECT 
USING (status = 'published');

-- Service role can manage all articles
CREATE POLICY "Service role can manage articles" 
ON public.news_articles 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create function to increment view count
CREATE OR REPLACE FUNCTION public.increment_article_views(article_slug TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE news_articles 
  SET view_count = view_count + 1 
  WHERE slug = article_slug;
END;
$$;