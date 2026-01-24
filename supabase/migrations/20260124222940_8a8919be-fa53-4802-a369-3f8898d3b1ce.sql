-- Corrección de datos de Iberdrola: Ignacio Galán es Presidente Ejecutivo, no CEO
UPDATE corporate_snapshots 
SET 
  president_name = ceo_name,
  ceo_name = NULL
WHERE ticker = 'IBE' 
  AND ceo_name = 'Ignacio Galán'
  AND president_name IS NULL;