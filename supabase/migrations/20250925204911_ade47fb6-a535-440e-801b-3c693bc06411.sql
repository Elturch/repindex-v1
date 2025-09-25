-- Fix search path security issue for the ticker validation function
CREATE OR REPLACE FUNCTION prevent_ticker_placeholders()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."05_ticker" = '{TICKER}' OR NEW."05_ticker" = '' THEN
    RAISE EXCEPTION 'Invalid ticker placeholder detected. Company: %, Ticker: %', NEW."03_target_name", NEW."05_ticker";
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;