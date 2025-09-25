-- Fix existing records with problematic ticker "{TICKER}"
-- Update them by re-applying the company name to ticker mapping

DO $$
DECLARE
    rec RECORD;
    mapped_ticker TEXT;
BEGIN
    -- First, let's see what we're dealing with
    RAISE NOTICE 'Records with problematic ticker: %', (SELECT COUNT(*) FROM pari_runs WHERE "05_ticker" = '{TICKER}');
    
    -- Update records by applying proper ticker mapping based on company name
    FOR rec IN 
        SELECT id, "03_target_name" 
        FROM pari_runs 
        WHERE "05_ticker" = '{TICKER}'
    LOOP
        -- Apply the same mapping logic as in the edge function
        mapped_ticker := CASE 
            WHEN LOWER(rec."03_target_name") LIKE '%bankinter%' THEN 'BKT'
            WHEN LOWER(rec."03_target_name") LIKE '%caixabank%' THEN 'CABK'
            WHEN LOWER(rec."03_target_name") LIKE '%bbva%' THEN 'BBVA'
            WHEN LOWER(rec."03_target_name") LIKE '%santander%' THEN 'SAN'
            WHEN LOWER(rec."03_target_name") LIKE '%sabadell%' THEN 'SAB'
            WHEN LOWER(rec."03_target_name") LIKE '%unicaja%' THEN 'UNI'
            WHEN LOWER(rec."03_target_name") LIKE '%iberdrola%' THEN 'IBE'
            WHEN LOWER(rec."03_target_name") LIKE '%endesa%' THEN 'ELE'
            WHEN LOWER(rec."03_target_name") LIKE '%repsol%' THEN 'REP'
            WHEN LOWER(rec."03_target_name") LIKE '%telefonica%' OR LOWER(rec."03_target_name") LIKE '%telefónica%' THEN 'TEF'
            WHEN LOWER(rec."03_target_name") LIKE '%inditex%' THEN 'ITX'
            WHEN LOWER(rec."03_target_name") LIKE '%amadeus%' THEN 'AMS'
            WHEN LOWER(rec."03_target_name") LIKE '%aena%' THEN 'AENA'
            WHEN LOWER(rec."03_target_name") LIKE '%ferrovial%' THEN 'FER'
            WHEN LOWER(rec."03_target_name") LIKE '%acs%' THEN 'ACS'
            WHEN LOWER(rec."03_target_name") LIKE '%acciona%' THEN 'ANA'
            ELSE NULL
        END;
        
        IF mapped_ticker IS NOT NULL THEN
            UPDATE pari_runs 
            SET "05_ticker" = mapped_ticker 
            WHERE id = rec.id;
            
            RAISE NOTICE 'Updated record % - Company: "%" -> Ticker: "%"', rec.id, rec."03_target_name", mapped_ticker;
        ELSE
            RAISE NOTICE 'No mapping found for company: "%"', rec."03_target_name";
        END IF;
    END LOOP;
    
    -- Final count
    RAISE NOTICE 'Records still with problematic ticker after update: %', (SELECT COUNT(*) FROM pari_runs WHERE "05_ticker" = '{TICKER}');
END $$;