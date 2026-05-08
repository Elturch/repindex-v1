
CREATE TABLE IF NOT EXISTS public.weekly_theme_tags (
  ticker text NOT NULL,
  week_start date NOT NULL,
  theme text NOT NULL CHECK (theme IN (
    'neutral','positiva',
    'crisis_regulatoria','crisis_financiera','crisis_reputacional',
    'hito_corporativo','resultado_financiero'
  )),
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  model_used text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  source_count integer NOT NULL DEFAULT 0,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_theme_tags_week ON public.weekly_theme_tags (week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_theme_tags_theme ON public.weekly_theme_tags (theme);

ALTER TABLE public.weekly_theme_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_theme_tags public read"
  ON public.weekly_theme_tags FOR SELECT
  USING (true);

CREATE TRIGGER update_weekly_theme_tags_updated_at
  BEFORE UPDATE ON public.weekly_theme_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
