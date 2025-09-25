-- Update existing {TICKER} placeholders in pari_runs with correct tickers
UPDATE pari_runs 
SET "05_ticker" = CASE 
  WHEN "03_target_name" ILIKE '%Banco Santander%' OR "03_target_name" ILIKE '%Santander%' THEN 'SAN'
  WHEN "03_target_name" ILIKE '%BBVA%' THEN 'BBVA'
  WHEN "03_target_name" ILIKE '%CaixaBank%' OR "03_target_name" ILIKE '%Caixa Bank%' THEN 'CABK'
  WHEN "03_target_name" ILIKE '%Iberdrola%' THEN 'IBE'
  WHEN "03_target_name" ILIKE '%Telefónica%' OR "03_target_name" ILIKE '%Telefonica%' THEN 'TEF'
  WHEN "03_target_name" ILIKE '%Inditex%' THEN 'ITX'
  WHEN "03_target_name" ILIKE '%Repsol%' THEN 'REP'
  WHEN "03_target_name" ILIKE '%Endesa%' THEN 'ELE'
  WHEN "03_target_name" ILIKE '%ACS%' THEN 'ACS'
  WHEN "03_target_name" ILIKE '%Ferrovial%' THEN 'FER'
  WHEN "03_target_name" ILIKE '%Grifols%' THEN 'GRF'
  WHEN "03_target_name" ILIKE '%IAG%' OR "03_target_name" ILIKE '%International Airlines Group%' THEN 'IAG'
  WHEN "03_target_name" ILIKE '%Amadeus%' THEN 'AMS'
  WHEN "03_target_name" ILIKE '%Red Eléctrica%' OR "03_target_name" ILIKE '%Red Electrica%' THEN 'REE'
  WHEN "03_target_name" ILIKE '%Aena%' THEN 'AENA'
  WHEN "03_target_name" ILIKE '%Mapfre%' THEN 'MAP'
  WHEN "03_target_name" ILIKE '%Acciona%' THEN 'ANA'
  WHEN "03_target_name" ILIKE '%ArcelorMittal%' THEN 'MTS'
  WHEN "03_target_name" ILIKE '%Banco Sabadell%' OR "03_target_name" ILIKE '%Sabadell%' THEN 'SAB'
  WHEN "03_target_name" ILIKE '%Bankinter%' THEN 'BKT'
  ELSE "05_ticker"
END
WHERE "05_ticker" = '{TICKER}' OR "05_ticker" LIKE '%.MC';