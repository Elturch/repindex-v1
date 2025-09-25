-- Fix remaining records with empty tickers
UPDATE pari_runs 
SET "05_ticker" = CASE 
  WHEN "03_target_name" = 'Banco Santander' THEN 'SAN'
  WHEN "03_target_name" = 'Ferrovial' THEN 'FER' 
  WHEN "03_target_name" = 'Unicaja Banco' THEN 'UNI'
  ELSE "05_ticker"
END 
WHERE "05_ticker" = '' OR "05_ticker" IS NULL;

-- Add a check constraint to prevent future empty tickers (in addition to the trigger)
ALTER TABLE pari_runs 
ADD CONSTRAINT check_valid_ticker 
CHECK ("05_ticker" IS NOT NULL AND "05_ticker" != '' AND "05_ticker" != '{TICKER}');