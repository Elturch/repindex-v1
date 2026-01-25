-- Corregir el ticker duplicado de Sanitas (conflicto con Banco Santander)
UPDATE repindex_root_issuers 
SET ticker = 'SANITAS' 
WHERE issuer_id = 'sanitas';

-- Insertar Sanitas en el sweep actual si no existe
INSERT INTO sweep_progress (sweep_id, fase, ticker, issuer_name, status, models_completed, retry_count, created_at)
SELECT 
  '2026-W05',
  34,
  'SANITAS',
  'Sanitas S.A. de Seguros',
  'pending',
  0,
  0,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM sweep_progress 
  WHERE sweep_id = '2026-W05' AND issuer_name = 'Sanitas S.A. de Seguros'
);