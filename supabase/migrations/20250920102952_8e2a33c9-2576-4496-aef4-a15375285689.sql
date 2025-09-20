-- Remove any triggers that might be causing issues with repindex_root_issuers
DROP TRIGGER IF EXISTS update_repindex_root_issuers_updated_at ON public.repindex_root_issuers;

-- Simple update to mark IBEX 35 companies and publicly traded companies
UPDATE public.repindex_root_issuers 
SET prueba = 'sí' 
WHERE ibex_family_code = 'IBEX-35'
   OR ticker IN (
     'SAN', 'BBVA', 'IBE', 'TEF', 'REP', 'CABK', 'MAP', 'ELE', 'NTGY',
     'ANA', 'FER', 'AENA', 'ACS', 'ITX', 'CLNX', 'GRF', 'AMS',
     'RED', 'ANE', 'BKT', 'SAB', 'UNI', 'IAG', 'COL', 'MRL', 'GEST',
     'CIE', 'SCYR', 'TRE', 'ACX', 'MTS', 'VDR', 'VIS', 'ROVI', 'FAE',
     'PHA', 'ALM', 'PSG', 'CASH', 'MEL', 'CAT', 'LDA', 'APPS', 'EBR',
     'A3M', 'VOC', 'PRISA', 'DOM', 'OHLA', 'ENO', 'ENG', 'ENC', 'ECR',
     'EIDF', 'SLR', 'SLT', 'GRE', 'ADX', 'HLZ', 'ART2', 'TUB', 'TRR',
     'CAF', 'TLG', 'GAM', 'URB', 'LAR', 'CAST', 'ARM', 'LOG', 'RJF',
     'RT4', 'RTC', 'ALTR', 'LLYC', 'AIRON', 'ALT', 'AMP', 'ART', 'ATR',
     'AZK', 'BKY', 'BIL', 'CBAV', 'CLE', 'CEVA'
   );