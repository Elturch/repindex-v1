UPDATE rix_semantic_groups 
SET issuer_ids = ARRAY['QS','HMH','HLA','HOS','VIT','VIA','RS'],
    exclusions = ARRAY['GRF','PHM','ROVI','FAE','ALM','ORY','RJF','SANITAS']
WHERE canonical_key = 'grupos_hospitalarios';