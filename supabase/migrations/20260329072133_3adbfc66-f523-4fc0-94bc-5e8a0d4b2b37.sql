
CREATE TABLE public.rix_semantic_glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  term_en text,
  aliases text[] NOT NULL DEFAULT '{}',
  definition text NOT NULL,
  category text NOT NULL,
  repindex_relevance text,
  related_metrics text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_glossary_term ON public.rix_semantic_glossary USING btree (term);
CREATE INDEX idx_glossary_category ON public.rix_semantic_glossary USING btree (category);
CREATE INDEX idx_glossary_aliases ON public.rix_semantic_glossary USING gin (aliases);

ALTER TABLE public.rix_semantic_glossary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to glossary"
  ON public.rix_semantic_glossary
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Only admins can modify glossary"
  ON public.rix_semantic_glossary
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
