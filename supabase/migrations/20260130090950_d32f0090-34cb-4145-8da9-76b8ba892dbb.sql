-- =============================================================================
-- FIX: GRAPH EXPANSION FUNCTIONS - Corrected recursive CTE
-- =============================================================================

-- Drop existing functions first
DROP FUNCTION IF EXISTS expand_entity_graph(TEXT, INT);
DROP FUNCTION IF EXISTS expand_entity_graph_with_scores(TEXT, INT, INT);
DROP FUNCTION IF EXISTS get_sector_graph(TEXT, BOOLEAN);

-- =============================================================================
-- FUNCTION: expand_entity_graph (FIXED)
-- Uses non-recursive approach with iterative depth expansion
-- =============================================================================
CREATE OR REPLACE FUNCTION expand_entity_graph(
  p_ticker TEXT,
  p_depth INT DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Use a simpler approach: gather all relationships in one pass
  WITH 
  -- Get the seed entity
  seed AS (
    SELECT 
      ticker,
      issuer_name,
      sector_category,
      subsector,
      ibex_family_code,
      verified_competitors
    FROM repindex_root_issuers
    WHERE ticker = p_ticker
  ),
  -- Get verified competitors (depth 1)
  competitors AS (
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      r.ibex_family_code,
      1 AS depth,
      'COMPITE_CON'::TEXT AS relation_type,
      0.9::NUMERIC AS relation_strength
    FROM seed s
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.verified_competitors, '[]'::jsonb)) AS comp_ticker
    JOIN repindex_root_issuers r ON r.ticker = comp_ticker
  ),
  -- Get same subsector peers (depth 1)
  subsector_peers AS (
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      r.ibex_family_code,
      1 AS depth,
      'MISMO_SUBSECTOR'::TEXT AS relation_type,
      0.7::NUMERIC AS relation_strength
    FROM seed s
    JOIN repindex_root_issuers r ON r.subsector = s.subsector 
      AND r.subsector IS NOT NULL
      AND r.ticker != s.ticker
      AND r.ticker NOT IN (SELECT ticker FROM competitors)
  ),
  -- Get same sector peers (depth 1)
  sector_peers AS (
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      r.ibex_family_code,
      1 AS depth,
      'MISMO_SECTOR'::TEXT AS relation_type,
      0.5::NUMERIC AS relation_strength
    FROM seed s
    JOIN repindex_root_issuers r ON r.sector_category = s.sector_category 
      AND r.sector_category IS NOT NULL
      AND r.ticker != s.ticker
      AND (r.subsector IS NULL OR r.subsector != s.subsector)
      AND r.ticker NOT IN (SELECT ticker FROM competitors)
      AND r.ticker NOT IN (SELECT ticker FROM subsector_peers)
  ),
  -- Combine all entities
  all_entities AS (
    -- Origin
    SELECT 
      ticker,
      issuer_name,
      sector_category,
      subsector,
      ibex_family_code,
      0 AS depth,
      'ORIGIN'::TEXT AS relation_type,
      1.0::NUMERIC AS relation_strength
    FROM seed
    
    UNION ALL
    
    SELECT * FROM competitors
    
    UNION ALL
    
    SELECT * FROM subsector_peers
    
    UNION ALL
    
    SELECT * FROM sector_peers
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ticker', ticker,
        'name', issuer_name,
        'sector', sector_category,
        'subsector', subsector,
        'ibex_family', ibex_family_code,
        'depth', depth,
        'relation', relation_type,
        'strength', relation_strength
      ) ORDER BY depth, relation_strength DESC, ticker
    ),
    '[]'::jsonb
  ) INTO result
  FROM all_entities
  WHERE depth <= p_depth;
  
  RETURN result;
END;
$$;

-- =============================================================================
-- FUNCTION: expand_entity_graph_with_scores (FIXED)
-- =============================================================================
CREATE OR REPLACE FUNCTION expand_entity_graph_with_scores(
  p_ticker TEXT,
  p_depth INT DEFAULT 2,
  p_weeks INT DEFAULT 4
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result JSONB;
  graph_entities JSONB;
  entity_tickers TEXT[];
  scores_data JSONB;
BEGIN
  -- 1. Get the base graph
  graph_entities := expand_entity_graph(p_ticker, p_depth);
  
  -- 2. Extract all tickers from the graph
  SELECT ARRAY(
    SELECT DISTINCT e->>'ticker'
    FROM jsonb_array_elements(graph_entities) e
  ) INTO entity_tickers;
  
  -- 3. Get latest RIX scores for all entities
  WITH latest_scores AS (
    SELECT DISTINCT ON (ticker, model_name)
      ticker,
      model_name,
      rix_score,
      rix_score_adjusted,
      period_from,
      period_to,
      nvm_score,
      drm_score,
      sim_score,
      rmm_score,
      cem_score,
      gam_score,
      dcm_score,
      cxm_score,
      batch_execution_date
    FROM (
      -- From rix_runs (legacy)
      SELECT 
        "05_ticker" AS ticker,
        "02_model_name" AS model_name,
        "09_rix_score" AS rix_score,
        "51_rix_score_adjusted" AS rix_score_adjusted,
        "06_period_from" AS period_from,
        "07_period_to" AS period_to,
        "23_nvm_score" AS nvm_score,
        "26_drm_score" AS drm_score,
        "29_sim_score" AS sim_score,
        "32_rmm_score" AS rmm_score,
        "35_cem_score" AS cem_score,
        "38_gam_score" AS gam_score,
        "41_dcm_score" AS dcm_score,
        "44_cxm_score" AS cxm_score,
        batch_execution_date
      FROM rix_runs
      WHERE "05_ticker" = ANY(entity_tickers)
        AND "09_rix_score" IS NOT NULL
      
      UNION ALL
      
      -- From rix_runs_v2 (current)
      SELECT 
        "05_ticker" AS ticker,
        "02_model_name" AS model_name,
        "09_rix_score" AS rix_score,
        "51_rix_score_adjusted" AS rix_score_adjusted,
        "06_period_from" AS period_from,
        "07_period_to" AS period_to,
        "23_nvm_score" AS nvm_score,
        "26_drm_score" AS drm_score,
        "29_sim_score" AS sim_score,
        "32_rmm_score" AS rmm_score,
        "35_cem_score" AS cem_score,
        "38_gam_score" AS gam_score,
        "41_dcm_score" AS dcm_score,
        "44_cxm_score" AS cxm_score,
        batch_execution_date
      FROM rix_runs_v2
      WHERE "05_ticker" = ANY(entity_tickers)
        AND "09_rix_score" IS NOT NULL
    ) combined
    ORDER BY ticker, model_name, batch_execution_date DESC
  ),
  ticker_aggregates AS (
    SELECT 
      ticker,
      ROUND(AVG(rix_score), 1) AS avg_rix,
      MIN(rix_score) AS min_rix,
      MAX(rix_score) AS max_rix,
      COUNT(DISTINCT model_name) AS models_count,
      ARRAY_AGG(DISTINCT model_name) AS models,
      jsonb_agg(
        jsonb_build_object(
          'model', model_name,
          'rix', rix_score,
          'rix_adj', rix_score_adjusted,
          'period_from', period_from,
          'period_to', period_to,
          'metrics', jsonb_build_object(
            'nvm', nvm_score,
            'drm', drm_score,
            'sim', sim_score,
            'rmm', rmm_score,
            'cem', cem_score,
            'gam', gam_score,
            'dcm', dcm_score,
            'cxm', cxm_score
          )
        )
      ) AS model_scores
    FROM latest_scores
    GROUP BY ticker
  )
  SELECT COALESCE(
    jsonb_object_agg(
      ticker,
      jsonb_build_object(
        'avg_rix', avg_rix,
        'min_rix', min_rix,
        'max_rix', max_rix,
        'models_count', models_count,
        'models', models,
        'by_model', model_scores
      )
    ),
    '{}'::jsonb
  ) INTO scores_data
  FROM ticker_aggregates;
  
  -- 4. Combine graph with scores
  result := jsonb_build_object(
    'primary_entity', (
      SELECT jsonb_build_object(
        'ticker', p_ticker,
        'name', issuer_name,
        'sector', sector_category,
        'subsector', subsector,
        'ibex_family', ibex_family_code
      )
      FROM repindex_root_issuers
      WHERE ticker = p_ticker
    ),
    'graph', graph_entities,
    'entity_scores', scores_data,
    'metadata', jsonb_build_object(
      'generated_at', NOW(),
      'depth', p_depth,
      'weeks_requested', p_weeks,
      'total_entities', jsonb_array_length(graph_entities),
      'entities_with_scores', (SELECT COUNT(*) FROM jsonb_each(scores_data))
    )
  );
  
  RETURN result;
END;
$$;

-- =============================================================================
-- FUNCTION: get_sector_graph (FIXED)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_sector_graph(
  p_sector TEXT,
  p_include_scores BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result JSONB;
  sector_tickers TEXT[];
BEGIN
  SELECT ARRAY(
    SELECT ticker
    FROM repindex_root_issuers
    WHERE sector_category = p_sector
  ) INTO sector_tickers;
  
  WITH sector_companies AS (
    SELECT 
      ticker,
      issuer_name,
      sector_category,
      subsector,
      ibex_family_code,
      verified_competitors
    FROM repindex_root_issuers
    WHERE sector_category = p_sector
  ),
  relationships AS (
    SELECT DISTINCT ON (source, target)
      s1.ticker AS source,
      s2.ticker AS target,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s1.verified_competitors, '[]'::jsonb)) vc
          WHERE vc = s2.ticker
        ) THEN 'COMPITE_CON'
        WHEN s1.subsector = s2.subsector AND s1.subsector IS NOT NULL THEN 'MISMO_SUBSECTOR'
        ELSE 'MISMO_SECTOR'
      END AS relation_type,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s1.verified_competitors, '[]'::jsonb)) vc
          WHERE vc = s2.ticker
        ) THEN 0.9
        WHEN s1.subsector = s2.subsector AND s1.subsector IS NOT NULL THEN 0.7
        ELSE 0.5
      END AS strength
    FROM sector_companies s1
    CROSS JOIN sector_companies s2
    WHERE s1.ticker != s2.ticker
  )
  SELECT jsonb_build_object(
    'sector', p_sector,
    'companies', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'ticker', ticker,
          'name', issuer_name,
          'subsector', subsector,
          'ibex_family', ibex_family_code
        )
      )
      FROM sector_companies
    ),
    'relationships', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'source', source,
          'target', target,
          'type', relation_type,
          'strength', strength
        )
      )
      FROM relationships
      WHERE relation_type IN ('COMPITE_CON', 'MISMO_SUBSECTOR')
    ),
    'subsectors', (
      SELECT jsonb_agg(DISTINCT subsector)
      FROM sector_companies
      WHERE subsector IS NOT NULL
    ),
    'metadata', jsonb_build_object(
      'total_companies', array_length(sector_tickers, 1),
      'generated_at', NOW()
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION expand_entity_graph(TEXT, INT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION expand_entity_graph_with_scores(TEXT, INT, INT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_sector_graph(TEXT, BOOLEAN) TO authenticated, anon, service_role;