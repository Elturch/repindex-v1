-- =====================================================================
-- FASE 1 — Migración: rix_runs y rix_trends quedan DEPRECATED.
-- Única fuente de verdad: rix_runs_v2 (6 IAs).
-- =====================================================================

-- 1) Drop trigger sync_rix_trends y su función. rix_trends queda sin escritor.
DROP TRIGGER IF EXISTS sync_rix_trends_trigger ON public.rix_runs_v2;
DROP TRIGGER IF EXISTS sync_rix_trends_trigger_v1 ON public.rix_runs;
DROP TRIGGER IF EXISTS trg_sync_rix_trends ON public.rix_runs_v2;
DROP TRIGGER IF EXISTS trg_sync_rix_trends_v1 ON public.rix_runs;
DROP FUNCTION IF EXISTS public.sync_rix_trends() CASCADE;

-- 2) Marcar rix_runs y rix_trends como DEPRECATED a nivel SQL.
COMMENT ON TABLE public.rix_runs IS
  'DEPRECATED 2026-04 — Pipeline legacy Make.com (4 IAs). Congelada 2026-01-25. '
  'No usar. Fuente única: public.rix_runs_v2 (6 IAs). Mantener como backup; '
  'no añadir nuevos lectores ni escritores.';

COMMENT ON TABLE public.rix_trends IS
  'DEPRECATED 2026-04 — Tabla de tendencias semanales que se alimentaba vía '
  'trigger sync_rix_trends (ya eliminado). Sin escritor. No usar. '
  'Las superficies actuales leen rix_runs_v2 directamente o vía rixV2TrendShim.';

-- 3) expand_entity_graph_with_scores: elimina la lectura de rix_runs (legacy).
--    Reescribimos para leer únicamente rix_runs_v2.
CREATE OR REPLACE FUNCTION public.expand_entity_graph_with_scores(
  p_ticker text,
  p_depth integer DEFAULT 2,
  p_weeks integer DEFAULT 4
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  -- 3. Get latest RIX scores for all entities (V2 only)
  WITH latest_scores AS (
    SELECT DISTINCT ON (ticker, model_name)
      ticker,
      model_name,
      rix_score,
      rix_score_adjusted,
      period_from,
      period_to,
      nvm_score, drm_score, sim_score, rmm_score,
      cem_score, gam_score, dcm_score, cxm_score,
      batch_execution_date
    FROM (
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
            'nvm', nvm_score, 'drm', drm_score, 'sim', sim_score, 'rmm', rmm_score,
            'cem', cem_score, 'gam', gam_score, 'dcm', dcm_score, 'cxm', cxm_score
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
      'entities_with_scores', (SELECT COUNT(*) FROM jsonb_each(scores_data)),
      'source', 'rix_runs_v2_only'
    )
  );

  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.expand_entity_graph_with_scores(text, integer, integer) IS
  'FASE 1 (2026-04): Reescrita para leer únicamente rix_runs_v2. rix_runs legacy eliminada.';

-- 4) normalize_stock_price_v2 lee rix_trends para validación histórica.
--    Como rix_trends queda sin escritor, deprecamos la rama de validación
--    histórica (mantenemos la heurística de rangos, que es lo único que
--    sigue funcionando sin contexto).
CREATE OR REPLACE FUNCTION public.normalize_stock_price_v2(
  price_text text,
  ticker text DEFAULT NULL,
  batch_date timestamp with time zone DEFAULT NULL
)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  price_value numeric;
  normalized_price numeric;
  valid_range_min numeric := 0.01;
  valid_range_max numeric := 1000;
BEGIN
  IF price_text IS NULL OR price_text !~ '^[0-9]+\.?[0-9]*$' THEN
    RETURN NULL;
  END IF;

  price_value := price_text::numeric;

  IF price_value >= valid_range_min AND price_value <= valid_range_max THEN
    RETURN price_value;
  END IF;

  IF price_value >= 1000000 THEN
    normalized_price := price_value / 1000000.0;
  ELSIF price_value >= 100000 THEN
    IF (price_value / 100000.0) BETWEEN valid_range_min AND valid_range_max THEN
      normalized_price := price_value / 100000.0;
    ELSIF (price_value / 1000.0) BETWEEN valid_range_min AND valid_range_max THEN
      normalized_price := price_value / 1000.0;
    ELSE
      normalized_price := price_value / 100000.0;
    END IF;
  ELSIF price_value >= 10000 THEN
    normalized_price := price_value / 1000.0;
  ELSIF price_value >= 1000 THEN
    normalized_price := price_value / 100.0;
  ELSE
    normalized_price := price_value;
  END IF;

  -- FASE 1: Validación contra precio histórico DESACTIVADA porque rix_trends
  -- está deprecada. Si en el futuro se quiere recalibrar, reescribir contra
  -- rix_runs_v2."48_precio_accion" agrupado por ticker+batch_execution_date.

  RETURN normalized_price;
END;
$function$;

COMMENT ON FUNCTION public.normalize_stock_price_v2(text, text, timestamp with time zone) IS
  'FASE 1 (2026-04): Validación histórica contra rix_trends desactivada (tabla deprecada). '
  'Sólo aplica heurística de rangos. Para recalibrar, reescribir contra rix_runs_v2.48_precio_accion.';
