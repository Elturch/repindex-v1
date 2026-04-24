REVOKE ALL ON public.rix_runs_v2_cited_urls FROM PUBLIC;
REVOKE ALL ON public.rix_runs_v2_cited_urls FROM anon;
REVOKE ALL ON public.rix_runs_v2_cited_urls FROM authenticated;
GRANT  SELECT ON public.rix_runs_v2_cited_urls TO service_role;