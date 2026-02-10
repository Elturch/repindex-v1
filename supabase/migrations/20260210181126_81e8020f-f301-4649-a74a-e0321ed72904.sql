
-- Step 1: Degrade GCO.MC and SLR from IBEX-35 to IBEX-MC in master table
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-MC', ibex_family_category = 'IBEX Medium Cap'
WHERE ticker IN ('GCO.MC', 'SLR');

-- Step 2: Promote ANE.MC, CIE, MEL to IBEX-35 in master table
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-35', ibex_family_category = 'IBEX 35'
WHERE ticker IN ('ANE.MC', 'CIE', 'MEL');

-- Step 3: Degrade GCO.MC and SLR in historical trends
UPDATE rix_trends 
SET ibex_family_code = 'IBEX-MC'
WHERE ticker IN ('GCO.MC', 'SLR') AND ibex_family_code = 'IBEX-35';

-- Step 4: Promote ANE, ANE.MC, CIE, MEL in historical trends
UPDATE rix_trends 
SET ibex_family_code = 'IBEX-35'
WHERE ticker IN ('ANE', 'ANE.MC', 'CIE', 'MEL') AND ibex_family_code = 'IBEX-MC';
