-- Sincronizar empresas activas faltantes al sweep actual 2026-W05
INSERT INTO sweep_progress (sweep_id, fase, ticker, issuer_name, status, models_completed, retry_count)
SELECT 
  '2026-W05' as sweep_id,
  COALESCE(fase, 35) as fase,
  ticker,
  issuer_name,
  'pending' as status,
  0 as models_completed,
  0 as retry_count
FROM repindex_root_issuers
WHERE status = 'active' 
AND ticker NOT IN (
  SELECT ticker FROM sweep_progress WHERE sweep_id = '2026-W05'
)
ON CONFLICT DO NOTHING;

-- Resetear empresas fallidas para reintentar
UPDATE sweep_progress 
SET status = 'pending', retry_count = 0, error_message = NULL, started_at = NULL
WHERE sweep_id = '2026-W05' AND status = 'failed';