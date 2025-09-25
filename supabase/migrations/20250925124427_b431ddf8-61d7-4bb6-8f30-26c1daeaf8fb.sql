-- Fix ticker placeholders in pari_runs table

-- Update Banco Sabadell records
UPDATE pari_runs 
SET "05_ticker" = 'SAB' 
WHERE "03_target_name" = 'Banco Sabadell' AND "05_ticker" = '{TICKER}';

-- Update Mapfre records  
UPDATE pari_runs 
SET "05_ticker" = 'MAP' 
WHERE "03_target_name" = 'Mapfre' AND "05_ticker" = '{TICKER}';