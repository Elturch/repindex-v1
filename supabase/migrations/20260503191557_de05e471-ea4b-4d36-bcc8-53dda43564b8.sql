-- IBEX-35 coherence fix: backup + demote GRF + FDR to historical to balance ABE.MC + GCO.MC promotions
-- Single authorized write: UPDATE of 2 rows. Backup is a CREATE TABLE.

-- 1. Backup table (snapshot of all 37 IBEX-35 rows pre-fix)
CREATE TABLE IF NOT EXISTS public.repindex_root_issuers_backup_20260503 AS
SELECT *, now() AS backup_created_at
FROM public.repindex_root_issuers
WHERE ibex_family_code = 'IBEX-35';

ALTER TABLE public.repindex_root_issuers_backup_20260503 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_only_backup_20260503" ON public.repindex_root_issuers_backup_20260503;
CREATE POLICY "admin_only_backup_20260503"
ON public.repindex_root_issuers_backup_20260503
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 2. Transactional demotion with hard invariant check
DO $$
DECLARE
  pre_count int;
  post_count int;
  expected_tickers text[] := ARRAY[
    'ABE.MC','ACS','ACX','AENA','AMS','ANA','ANE.MC','BBVA','BKT','CABK',
    'CLNX','COL','ELE','ENG','FER','GCO.MC','IAG','IBE','IDR','ITX',
    'LOG','MAP','MRL','MTS','NTGY','PUIG','RED','REP','ROVI','SAB',
    'SAN','SCYR','SLR','TEF','UNI'
  ];
  actual_tickers text[];
  diff_missing text[];
  diff_extra text[];
BEGIN
  SELECT COUNT(*) INTO pre_count FROM public.repindex_root_issuers WHERE ibex_family_code='IBEX-35';
  IF pre_count <> 37 THEN
    RAISE EXCEPTION 'Pre-fix invariant failed: expected 37, got %', pre_count;
  END IF;

  UPDATE public.repindex_root_issuers
  SET
    ibex_family_code = NULL,
    ibex_family_category = NULL,
    ibex_status = 'historical',
    notes = 'Degraded 2026-05-03 to make room for ABE.MC (OPV 2025-Q4) and GCO.MC (promotion 2025-12). Approved by user. Prior status: active component IBEX 35. Rationale: GRF arrastra crisis Gotham 2024 (tutela CNMV, free float problemático); FDR small-cap (~3B) con liquidez baja. Candidatas naturales a demotion en revisiones BME 2024-2025.'
  WHERE ticker IN ('GRF','FDR');

  SELECT COUNT(*) INTO post_count FROM public.repindex_root_issuers WHERE ibex_family_code='IBEX-35';
  IF post_count <> 35 THEN
    RAISE EXCEPTION 'Post-fix invariant failed: expected 35, got %', post_count;
  END IF;

  SELECT array_agg(ticker ORDER BY ticker) INTO actual_tickers
  FROM public.repindex_root_issuers WHERE ibex_family_code='IBEX-35';

  SELECT array_agg(t) INTO diff_missing FROM unnest(expected_tickers) t WHERE t <> ALL(actual_tickers);
  SELECT array_agg(t) INTO diff_extra FROM unnest(actual_tickers) t WHERE t <> ALL(expected_tickers);

  IF diff_missing IS NOT NULL OR diff_extra IS NOT NULL THEN
    RAISE EXCEPTION 'Whitelist mismatch. Missing: %, Extra: %', diff_missing, diff_extra;
  END IF;

  RAISE NOTICE 'IBEX-35 coherence fix OK. Pre=%, Post=%, Whitelist=match', pre_count, post_count;
END $$;