CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
-- expose similarity() to the public search_path so PostgREST resolves it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'similarity'
  ) THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION public.similarity(text, text) RETURNS real LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$ SELECT extensions.similarity($1, $2) $f$';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS repindex_root_issuers_name_trgm_idx
  ON public.repindex_root_issuers USING gin (issuer_name extensions.gin_trgm_ops);