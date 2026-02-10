
-- Step 1: Delete duplicate ANE records (orphan ticker, canonical is ANE.MC)
DELETE FROM rix_runs_v2 WHERE "05_ticker" = 'ANE' AND "06_period_from" = '2026-02-01';

-- Step 2: Delete orphan tickers that don't match canonical tickers in master table
DELETE FROM rix_runs_v2 WHERE "05_ticker" IN ('APPS', 'CAT', 'CEP.MC') AND "06_period_from" = '2026-02-01';
