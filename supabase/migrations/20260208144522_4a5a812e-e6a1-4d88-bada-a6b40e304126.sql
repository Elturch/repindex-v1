-- ============================================================================
-- Migración: CEPSA → MOEVE (Rebrand corporativo)
-- Fecha: 2026-02-08
-- ============================================================================

-- 1. Actualizar repindex_root_issuers
UPDATE repindex_root_issuers
SET 
  issuer_id = 'moeve',
  issuer_name = 'Moeve',
  ticker = 'MOE.MC',
  include_terms = '["Moeve", "Moeve Global", "ex-Cepsa"]'::jsonb,
  exclude_terms = '[]'::jsonb,
  sample_query = 'Moeve energía movilidad sostenible transición',
  notes = COALESCE(notes, '') || E'\n[2026-02-08] Rebrand: Cepsa → Moeve. Nueva identidad reflejando transición energética.',
  website = 'https://www.moeveglobal.com/es/'
WHERE issuer_id = 'CEPSA-PRIV' OR ticker = 'CEPSA-PRIV';

-- 2. Actualizar verified_competitors de Repsol (CEPSA-PRIV → MOE.MC)
UPDATE repindex_root_issuers
SET verified_competitors = '["MOE.MC", "NTGY"]'::jsonb
WHERE ticker = 'REP';

-- 3. Actualizar corporate_scrape_progress
UPDATE corporate_scrape_progress
SET ticker = 'MOE.MC'
WHERE ticker = 'CEPSA-PRIV';

-- 4. Actualizar corporate_snapshots
UPDATE corporate_snapshots
SET ticker = 'MOE.MC'
WHERE ticker = 'CEPSA-PRIV';

-- 5. Actualizar rix_runs históricos para consistencia en dashboard (ticker)
UPDATE rix_runs
SET "05_ticker" = 'MOE.MC'
WHERE "05_ticker" = 'CEPSA-PRIV';

UPDATE rix_runs_v2
SET "05_ticker" = 'MOE.MC'
WHERE "05_ticker" = 'CEPSA-PRIV';