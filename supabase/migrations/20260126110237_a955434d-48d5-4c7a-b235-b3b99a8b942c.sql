-- Corrección manual de datos de liderazgo de Telefónica
-- Marc Murtra fue nombrado Presidente en 2025, Ángel Vilá es CEO

UPDATE corporate_snapshots 
SET 
  president_name = 'Marc Murtra',
  ceo_name = 'Ángel Vilá',
  chairman_name = NULL
WHERE ticker = 'TEF' 
  AND snapshot_date_only = (SELECT MAX(snapshot_date_only) FROM corporate_snapshots WHERE ticker = 'TEF');