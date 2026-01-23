-- Insertar las empresas faltantes de fases 31-35 que no están en sweep_progress
INSERT INTO sweep_progress (sweep_id, fase, ticker, issuer_name, status, models_completed, retry_count)
SELECT 
  '2026-W04' as sweep_id,
  fase,
  ticker,
  issuer_name,
  'pending' as status,
  0 as models_completed,
  0 as retry_count
FROM repindex_root_issuers
WHERE status = 'active'
  AND ticker NOT IN (
    SELECT DISTINCT ticker 
    FROM sweep_progress 
    WHERE sweep_id = '2026-W04'
  );