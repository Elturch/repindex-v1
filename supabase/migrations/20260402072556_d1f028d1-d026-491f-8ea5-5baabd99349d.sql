
CREATE TABLE public.rix_semantic_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  issuer_ids text[] NOT NULL DEFAULT '{}',
  exclusions text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rix_semantic_groups_canonical ON public.rix_semantic_groups (canonical_key);

ALTER TABLE public.rix_semantic_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for semantic groups"
  ON public.rix_semantic_groups FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can manage semantic groups"
  ON public.rix_semantic_groups FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
