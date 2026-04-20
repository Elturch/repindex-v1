CREATE OR REPLACE FUNCTION public.fuzzy_match_issuers(brand_in text, floor_in real DEFAULT 0.15, limit_in int DEFAULT 3)
RETURNS TABLE(issuer_name text, ticker text, sim real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT r.issuer_name, r.ticker, extensions.similarity(r.issuer_name, brand_in)::real AS sim
  FROM public.repindex_root_issuers r
  WHERE extensions.similarity(r.issuer_name, brand_in) >= floor_in
  ORDER BY sim DESC, r.issuer_name ASC
  LIMIT GREATEST(1, LEAST(limit_in, 10));
$$;
GRANT EXECUTE ON FUNCTION public.fuzzy_match_issuers(text, real, int) TO anon, authenticated, service_role;