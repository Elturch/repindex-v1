-- =============================================================================
-- GRAPH EXPANSION FUNCTIONS FOR HYBRID VECTOR + GRAPH RAG
-- =============================================================================
-- These functions simulate graph traversals using existing relational tables
-- Enables the Agente Rix to "see" entity relationships explicitly

-- =============================================================================
-- FUNCTION: expand_entity_graph
-- Purpose: Recursive graph traversal from a seed entity (company)
-- Returns: JSONB array of connected entities with relationship types
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
  WITH RECURSIVE entity_graph AS (
    -- SEED: Initial entity (depth 0)
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      r.ibex_family_code,
      r.verified_competitors,
      0 AS depth,
      ARRAY[r.ticker] AS path,
      'ORIGIN'::TEXT AS relation_type,
      1.0::NUMERIC AS relation_strength
    FROM repindex_root_issuers r
    WHERE r.ticker = p_ticker
    
    UNION ALL
    
    -- EXPANSION TIER 1: Verified competitors (from JSONB array)
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      r.ibex_family_code,
      r.verified_competitors,
      eg.depth + 1,
      eg.path || r.ticker,
      'COMPITE_CON'::TEXT,
      0.9::NUMERIC -- High confidence for verified competitors
    FROM entity_graph eg
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(
        COALESCE(
          (SELECT ri.verified_competitors FROM repindex_root_issuers ri WHERE ri.ticker = eg.ticker),
          '[]'::jsonb
        )
      ) AS competitor_ticker
    ) comp
    JOIN repindex_root_issuers r ON r.ticker = comp.competitor_ticker
    WHERE eg.depth < p_depth
      AND eg.relation_type = 'ORIGIN' -- Only expand from origin for verified competitors
      AND NOT r.ticker = ANY(eg.path) -- Prevent cycles
      
    UNION ALL
    
    -- EXPANSION TIER 2: Same SUBSECTOR (semantic peers)
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      r.ibex_family_code,
      r.verified_competitors,
      eg.depth + 1,
      eg.path || r.ticker,
      'MISMO_SUBSECTOR'::TEXT,
      0.7::NUMERIC -- Medium-high confidence for same subsector
    FROM entity_graph eg
    JOIN repindex_root_issuers r ON r.subsector = eg.subsector 
      AND r.subsector IS NOT NULL
      AND r.ticker != eg.ticker
    WHERE eg.depth < p_depth
      AND eg.relation_type = 'ORIGIN' -- Only expand from origin
      AND NOT r.ticker = ANY(eg.path) -- Prevent cycles
      
    UNION ALL
    
    -- EXPANSION TIER 3: Same SECTOR (broader category)
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      r.ibex_family_code,
      r.verified_competitors,
      eg.depth + 1,
      eg.path || r.ticker,
      'MISMO_SECTOR'::TEXT,
      0.5::NUMERIC -- Medium confidence for same sector
    FROM entity_graph eg
    JOIN repindex_root_issuers r ON r.sector_category = eg.sector_category 
      AND r.sector_category IS NOT NULL
      AND r.ticker != eg.ticker
      AND (r.subsector IS NULL OR r.subsector != eg.subsector) -- Exclude subsector matches (already captured)
    WHERE eg.depth < p_depth
      AND eg.relation_type = 'ORIGIN' -- Only expand from origin
      AND NOT r.ticker = ANY(eg.path) -- Prevent cycles
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
        'strength', relation_strength,
        'path', path
      ) ORDER BY depth, relation_strength DESC, ticker
    ),
    '[]'::jsonb
  ) INTO result
  FROM entity_graph
  WHERE depth <= p_depth;
  
  RETURN result;
END;
$$;

-- =============================================================================
-- FUNCTION: expand_entity_graph_with_scores
-- Purpose: Graph expansion enriched with latest RIX scores and trends
-- Returns: JSONB with entity graph + performance data
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
  
  -- 3. Get latest RIX scores for all entities (from both rix_runs tables)
  WITH latest_scores AS (
    -- Get scores from unified sources
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
        AND ("09_rix_score" IS NOT NULL OR analysis_completed_at IS NOT NULL)
    ) combined
    ORDER BY ticker, model_name, batch_execution_date DESC
  ),
  -- Aggregate scores by ticker (across all models)
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
  SELECT jsonb_build_object(
    'scores',
    COALESCE(
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
    )
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
    'entity_scores', scores_data->'scores',
    'metadata', jsonb_build_object(
      'generated_at', NOW(),
      'depth', p_depth,
      'weeks_requested', p_weeks,
      'total_entities', jsonb_array_length(graph_entities),
      'entities_with_scores', (
        SELECT COUNT(DISTINCT key) 
        FROM jsonb_each(scores_data->'scores')
      )
    )
  );
  
  RETURN result;
END;
$$;

-- =============================================================================
-- FUNCTION: get_sector_graph
-- Purpose: Get full graph of a sector for sector-wide analysis
-- Returns: JSONB with all companies in a sector and their relationships
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
  -- Get all tickers in the sector
  SELECT ARRAY(
    SELECT ticker
    FROM repindex_root_issuers
    WHERE sector_category = p_sector
  ) INTO sector_tickers;
  
  -- Build sector graph
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
    SELECT 
      s1.ticker AS source,
      s2.ticker AS target,
      CASE 
        WHEN s2.ticker = ANY(
          SELECT jsonb_array_elements_text(COALESCE(s1.verified_competitors, '[]'::jsonb))
        ) THEN 'COMPITE_CON'
        WHEN s1.subsector = s2.subsector AND s1.subsector IS NOT NULL THEN 'MISMO_SUBSECTOR'
        ELSE 'MISMO_SECTOR'
      END AS relation_type,
      CASE 
        WHEN s2.ticker = ANY(
          SELECT jsonb_array_elements_text(COALESCE(s1.verified_competitors, '[]'::jsonb))
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
      WHERE relation_type = 'COMPITE_CON' OR (relation_type = 'MISMO_SUBSECTOR')
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION expand_entity_graph(TEXT, INT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION expand_entity_graph_with_scores(TEXT, INT, INT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_sector_graph(TEXT, BOOLEAN) TO authenticated, anon, service_role;

-- Add comments for documentation
COMMENT ON FUNCTION expand_entity_graph IS 'Recursive graph traversal from a seed company. Returns connected entities via COMPITE_CON, MISMO_SUBSECTOR, MISMO_SECTOR relationships.';
COMMENT ON FUNCTION expand_entity_graph_with_scores IS 'Graph expansion enriched with latest RIX scores from all 6 AI models. Primary function for RAG context building.';
COMMENT ON FUNCTION get_sector_graph IS 'Full sector graph for sector-wide analysis. Shows all companies and their inter-relationships.';