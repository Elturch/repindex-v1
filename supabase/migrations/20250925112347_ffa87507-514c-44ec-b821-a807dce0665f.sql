-- Add fase column to repindex_root_issuers
ALTER TABLE public.repindex_root_issuers 
ADD COLUMN fase integer;

-- Update fase values based on IBEX family priority and sector diversification
WITH ordered_companies AS (
  SELECT 
    issuer_id,
    ticker,
    ibex_family_code,
    sector_category,
    -- Define priority order for IBEX families
    CASE 
      WHEN ibex_family_code = 'IBEX-35' THEN 1
      WHEN ibex_family_code = 'IBEX-MC' THEN 2
      WHEN ibex_family_code = 'IBEX-SC' THEN 3
      WHEN ibex_family_code = 'BME-GROWTH' THEN 4
      WHEN ibex_family_code = 'MC-OTHER' THEN 5
      ELSE 6
    END as family_priority,
    -- Create row numbers within each family, diversifying by sector
    ROW_NUMBER() OVER (
      PARTITION BY ibex_family_code 
      ORDER BY sector_category, ticker
    ) as row_within_family
  FROM public.repindex_root_issuers
),
phase_assignment AS (
  SELECT 
    issuer_id,
    ticker,
    ibex_family_code,
    sector_category,
    family_priority,
    row_within_family,
    -- Calculate phase based on family priority and position within family
    CASE 
      WHEN family_priority = 1 THEN -- IBEX-35: Phases 1-7
        CEIL(row_within_family / 5.0)
      WHEN family_priority = 2 THEN -- IBEX-MC: Phases 8-11
        7 + CEIL(row_within_family / 5.0)
      WHEN family_priority = 3 THEN -- IBEX-SC: Phases 12-17
        11 + CEIL(row_within_family / 5.0)
      WHEN family_priority = 4 THEN -- BME-GROWTH: Phases 18-21
        17 + CEIL(row_within_family / 5.0)
      WHEN family_priority = 5 THEN -- MC-OTHER: Phases 22-27
        21 + CEIL(row_within_family / 5.0)
      ELSE -- Other families: Start from phase 28
        27 + CEIL(row_within_family / 5.0)
    END as calculated_fase
  FROM ordered_companies
)
UPDATE public.repindex_root_issuers 
SET fase = phase_assignment.calculated_fase
FROM phase_assignment
WHERE repindex_root_issuers.issuer_id = phase_assignment.issuer_id;

-- Add index on fase column for better query performance
CREATE INDEX idx_repindex_root_issuers_fase ON public.repindex_root_issuers(fase);

-- Add index on combined fase and ibex_family_code for efficient filtering
CREATE INDEX idx_repindex_root_issuers_fase_family ON public.repindex_root_issuers(fase, ibex_family_code);