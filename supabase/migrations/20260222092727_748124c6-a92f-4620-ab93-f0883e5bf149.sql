-- Reset 49 ghost companies from auto-complete bug in W09
UPDATE sweep_progress 
SET status = 'pending', 
    models_completed = 0, 
    completed_at = NULL,
    error_message = 'Reset: ghost company from auto-complete bug'
WHERE sweep_id = '2026-W09' 
AND ticker IN ('CABK','SAB','MAP','SAN','ACS','FER','ANA','UNI','ANE.MC','ELE','ENG','SCYR','MRL','REP','NTGY','IBE','SLR','RED','ACX','MTS','ITX','AENA','IAG','FDR','COL','PUIG','GRF','LOG','ROVI','IDR','AMS','CLNX','TEF','CAF','HOME','LRE','ENO','LDA','MEL','EDR','TRE','ENC','TUB','CIE','ALM','VID','VIS','A3M','DOM')
AND status = 'completed'
AND (SELECT count(*) FROM rix_runs_v2 r WHERE r."05_ticker" = sweep_progress.ticker AND r.batch_execution_date::date = '2026-02-22') = 0;