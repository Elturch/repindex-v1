-- Fix existing {TICKER} placeholders with correct ticker mappings
UPDATE pari_runs SET "05_ticker" = CASE 
  WHEN "03_target_name" = 'Acciona' THEN 'ANA'
  WHEN "03_target_name" = 'ACS' THEN 'ACS'
  WHEN "03_target_name" = 'Banco Santander' THEN 'SAN'
  WHEN "03_target_name" = 'Bankinter' THEN 'BKT'
  WHEN "03_target_name" = 'BBVA' THEN 'BBVA'
  WHEN "03_target_name" = 'Ferrovial' THEN 'FER'
  WHEN "03_target_name" = 'Banco Sabadell' THEN 'SAB'
  WHEN "03_target_name" = 'CaixaBank' THEN 'CABK'
  WHEN "03_target_name" = 'Mapfre' THEN 'MAP'
  WHEN "03_target_name" = 'Unicaja Banco' THEN 'UNI'
END 
WHERE "05_ticker" = '{TICKER}' OR "05_ticker" IS NULL;

-- Add validation to prevent future {TICKER} insertions
CREATE OR REPLACE FUNCTION prevent_ticker_placeholders()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."05_ticker" = '{TICKER}' OR NEW."05_ticker" = '' THEN
    RAISE EXCEPTION 'Invalid ticker placeholder detected. Company: %, Ticker: %', NEW."03_target_name", NEW."05_ticker";
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate tickers on insert and update
DROP TRIGGER IF EXISTS validate_ticker_trigger ON pari_runs;
CREATE TRIGGER validate_ticker_trigger
  BEFORE INSERT OR UPDATE ON pari_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ticker_placeholders();