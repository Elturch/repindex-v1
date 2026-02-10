
-- Paso 1: Corregir composición IBEX-35

-- Degradar CIE y MEL a IBEX Medium Cap
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-MC', ibex_family_category = 'IBEX Medium Cap'
WHERE ticker IN ('CIE', 'MEL');

-- Promover Solaria a IBEX-35
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-35', ibex_family_category = 'IBEX 35'
WHERE ticker = 'SLR';

-- Actualizar rix_trends también
UPDATE rix_trends SET ibex_family_code = 'IBEX-MC' WHERE ticker IN ('CIE', 'MEL');
UPDATE rix_trends SET ibex_family_code = 'IBEX-35' WHERE ticker IN ('SLR', 'SOLR');
