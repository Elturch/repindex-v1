-- FASE 1: Crear función inteligente de normalización v2
CREATE OR REPLACE FUNCTION normalize_stock_price_v2(
  price_text text,
  ticker text DEFAULT NULL,
  batch_date timestamp with time zone DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  price_value numeric;
  normalized_price numeric;
  previous_price numeric;
  valid_range_min numeric := 0.01;
  valid_range_max numeric := 1000;
BEGIN
  -- Validación inicial
  IF price_text IS NULL OR price_text !~ '^[0-9]+\.?[0-9]*$' THEN
    RETURN NULL;
  END IF;
  
  price_value := price_text::numeric;
  
  -- Si ya está en rango válido, retornar
  IF price_value >= valid_range_min AND price_value <= valid_range_max THEN
    RETURN price_value;
  END IF;
  
  -- Intentar normalización por rangos
  IF price_value >= 1000000 THEN
    normalized_price := price_value / 1000000.0;
  ELSIF price_value >= 100000 THEN
    -- Probar ambas divisiones y elegir la que esté en rango válido
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
  
  -- Validación contra precio anterior (si disponible)
  IF ticker IS NOT NULL AND batch_date IS NOT NULL THEN
    SELECT stock_price INTO previous_price
    FROM rix_trends
    WHERE rix_trends.ticker = normalize_stock_price_v2.ticker
      AND batch_week < normalize_stock_price_v2.batch_date
      AND stock_price IS NOT NULL
      AND stock_price BETWEEN valid_range_min AND valid_range_max
    ORDER BY batch_week DESC
    LIMIT 1;
    
    -- Si el precio normalizado difiere >10x del anterior, ajustar
    IF previous_price IS NOT NULL THEN
      IF normalized_price > previous_price * 10 THEN
        normalized_price := normalized_price / 10.0;
      ELSIF normalized_price < previous_price * 0.1 THEN
        normalized_price := normalized_price * 10.0;
      END IF;
    END IF;
  END IF;
  
  RETURN normalized_price;
END;
$$;

-- FASE 2: Actualizar trigger para usar nueva función
CREATE OR REPLACE FUNCTION public.sync_rix_trends()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW."32_rmm_score" != 0 AND NEW."05_ticker" IS NOT NULL AND NEW."02_model_name" IS NOT NULL THEN
    INSERT INTO rix_trends (
      ticker, company_name, model_name, batch_week,
      rix_score, stock_price, is_traded,
      ibex_family_code, sector_category
    )
    SELECT 
      NEW."05_ticker",
      NEW."03_target_name",
      NEW."02_model_name",
      NEW.batch_execution_date,
      COALESCE(NEW."51_rix_score_adjusted", NEW."09_rix_score"),
      normalize_stock_price_v2(
        NEW."48_precio_accion",
        NEW."05_ticker",
        NEW.batch_execution_date
      ),
      COALESCE(ri.cotiza_en_bolsa, false),
      ri.ibex_family_code,
      ri.sector_category
    FROM repindex_root_issuers ri
    WHERE ri.ticker = NEW."05_ticker"
    ON CONFLICT (ticker, model_name, batch_week)
    DO UPDATE SET
      rix_score = EXCLUDED.rix_score,
      stock_price = EXCLUDED.stock_price,
      company_name = EXCLUDED.company_name,
      is_traded = EXCLUDED.is_traded,
      ibex_family_code = EXCLUDED.ibex_family_code,
      sector_category = EXCLUDED.sector_category;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- FASE 3: Corrección masiva de datos existentes
CREATE TEMP TABLE price_corrections AS
WITH ranked_prices AS (
  SELECT 
    id,
    ticker,
    company_name,
    model_name,
    batch_week,
    stock_price as old_price,
    LAG(stock_price) OVER (
      PARTITION BY ticker, model_name 
      ORDER BY batch_week
    ) as prev_price,
    LEAD(stock_price) OVER (
      PARTITION BY ticker, model_name 
      ORDER BY batch_week
    ) as next_price
  FROM rix_trends
  WHERE is_traded = true AND stock_price IS NOT NULL
)
SELECT 
  id,
  ticker,
  company_name,
  model_name,
  batch_week,
  old_price,
  CASE
    -- Precio sospechosamente bajo comparado con vecinos
    WHEN old_price < 10 
         AND (prev_price > old_price * 50 OR next_price > old_price * 50)
         AND old_price * 100 BETWEEN 0.01 AND 1000
    THEN old_price * 100
    
    -- Precio sospechosamente alto
    WHEN old_price > 500
    THEN old_price / 100
    
    ELSE old_price
  END as new_price,
  CASE
    WHEN old_price < 10 AND (prev_price > old_price * 50 OR next_price > old_price * 50)
    THEN 'Multiplicar x100 (outlier bajo)'
    WHEN old_price > 500
    THEN 'Dividir ÷100 (outlier alto)'
    ELSE 'Sin cambios'
  END as reason
FROM ranked_prices;

-- Aplicar correcciones automáticas
UPDATE rix_trends rt
SET stock_price = pc.new_price
FROM price_corrections pc
WHERE rt.id = pc.id
  AND pc.reason != 'Sin cambios';

-- FASE 4: Correcciones específicas manuales
-- Acciona semana 16 nov (Deepseek)
UPDATE rix_trends
SET stock_price = 183.00
WHERE ticker = 'ANA'
  AND model_name = 'Deepseek'
  AND batch_week = '2025-11-16'
  AND stock_price = 1.83;

-- Airbus semana 9 nov (ChatGPT, Gemini, Perplexity)
UPDATE rix_trends
SET stock_price = 212.10
WHERE ticker = 'AIR'
  AND model_name IN ('ChatGPT', 'Google Gemini', 'Perplexity')
  AND batch_week = '2025-11-09'
  AND stock_price = 2.12;

-- Airbus semana 26 oct
UPDATE rix_trends
SET stock_price = CASE
  WHEN stock_price = 2.00 THEN 200.40
  WHEN stock_price = 2.07 THEN 207.20
  ELSE stock_price
END
WHERE ticker = 'AIR'
  AND batch_week = '2025-10-26'
  AND stock_price < 3;

-- Airbus semana 19 oct
UPDATE rix_trends
SET stock_price = 202.10
WHERE ticker = 'AIR'
  AND model_name = 'Deepseek'
  AND batch_week = '2025-10-19'
  AND stock_price = 2.02;