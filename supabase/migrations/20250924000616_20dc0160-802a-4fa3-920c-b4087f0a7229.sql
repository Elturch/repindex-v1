-- Fix incorrect ticker values in pari_runs table
-- Update BBVA records
UPDATE pari_runs 
SET "05_ticker" = 'BBVA'
WHERE "03_target_name" = 'BBVA' AND "05_ticker" = '{TICKER}';

-- Update Banco Santander records  
UPDATE pari_runs
SET "05_ticker" = 'SAN'
WHERE "03_target_name" = 'Banco Santander' AND "05_ticker" = '{TICKER}';

-- Update any other records that might have placeholder tickers
-- Based on matching with repindex_root_issuers
UPDATE pari_runs 
SET "05_ticker" = r.ticker
FROM repindex_root_issuers r
WHERE pari_runs."03_target_name" = r.issuer_name 
  AND pari_runs."05_ticker" = '{TICKER}';

-- Also handle case where target_name might need normalization
UPDATE pari_runs
SET "05_ticker" = 'SAN'
WHERE ("03_target_name" ILIKE '%santander%' OR "03_target_name" ILIKE '%banco santander%')
  AND "05_ticker" = '{TICKER}';

UPDATE pari_runs
SET "05_ticker" = 'BBVA' 
WHERE "03_target_name" ILIKE '%bbva%'
  AND "05_ticker" = '{TICKER}';