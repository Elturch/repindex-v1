-- Fill missing websites for active issuers (to avoid 'skipped' in corporate scraping)
UPDATE repindex_root_issuers
SET website = CASE ticker
  WHEN 'CAF' THEN 'https://www.cafmobility.com'
  WHEN 'ENC' THEN 'https://ence.es'
  WHEN 'GAM' THEN 'https://gamrentals.com'
  WHEN 'GSJ' THEN 'https://www.grupo-sanjose.com'
  WHEN 'IAG' THEN 'https://www.iairgroup.com'
  WHEN 'COL' THEN 'https://www.inmocolonial.com'
  WHEN 'INSUR' THEN 'https://grupoinsur.com'
  WHEN 'ROVI' THEN 'https://www.rovi.es'
  WHEN 'LLYC' THEN 'https://llyc.global'
  WHEN 'NEA' THEN 'https://www.nicolascorrea.com'
  WHEN 'PRS' THEN 'https://www.prisa.com'
  WHEN 'ROBOT' THEN 'https://robotcorporativo.com'
  WHEN 'HOS' THEN 'https://hospiten.com'
  WHEN 'EME-PRIV' THEN 'https://eme-es.com'
  WHEN 'EY-PRIV' THEN 'https://www.ey.com/es_es'
  WHEN 'MASOR-PRIV' THEN 'https://masorange.es'
  WHEN 'META-PRIV' THEN 'https://about.meta.com'
  WHEN 'PWC-PRIV' THEN 'https://www.pwc.es'
  ELSE website
END
WHERE status = 'active'
  AND (website IS NULL OR length(trim(website)) = 0)
  AND ticker IN (
    'CAF','ENC','GAM','GSJ','IAG','COL','INSUR','ROVI','LLYC','NEA','PRS','ROBOT',
    'HOS','EME-PRIV','EY-PRIV','MASOR-PRIV','META-PRIV','PWC-PRIV'
  );

-- Move previously skipped companies to pending if they now have website (current sweep)
UPDATE corporate_scrape_progress csp
SET website = ri.website,
    status = 'pending',
    error_message = NULL,
    updated_at = now()
FROM repindex_root_issuers ri
WHERE csp.sweep_id = 'corp-2026-01'
  AND csp.status = 'skipped'
  AND csp.ticker = ri.ticker
  AND ri.status = 'active'
  AND ri.website IS NOT NULL
  AND length(trim(ri.website)) > 0;