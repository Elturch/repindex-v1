-- Fase 1: Crear función de normalización de precios de acciones
CREATE OR REPLACE FUNCTION normalize_stock_price(price_text text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  price_value numeric;
BEGIN
  -- Si es null o vacío, retornar null
  IF price_text IS NULL OR price_text !~ '^[0-9]+\.?[0-9]*$' THEN
    RETURN NULL;
  END IF;
  
  -- Convertir a numeric
  price_value := price_text::numeric;
  
  -- Normalizar según rangos detectados
  IF price_value >= 100000 THEN
    -- Rango muy alto: dividir por 100,000
    RETURN price_value / 100000.0;
  ELSIF price_value >= 10000 THEN
    -- Rango alto: dividir por 1,000
    RETURN price_value / 1000.0;
  ELSIF price_value >= 1000 THEN
    -- Rango medio: dividir por 100
    RETURN price_value / 100.0;
  ELSE
    -- Rango correcto: retornar tal cual
    RETURN price_value;
  END IF;
END;
$$;

-- Fase 2: Actualizar el trigger sync_rix_trends para usar normalización automática
CREATE OR REPLACE FUNCTION public.sync_rix_trends()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Solo procesar si los datos son válidos
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
      normalize_stock_price(NEW."48_precio_accion"),
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

-- Fase 3: Corregir todos los datos existentes en rix_trends
UPDATE rix_trends
SET stock_price = CASE
  WHEN stock_price >= 100000 THEN stock_price / 100000.0
  WHEN stock_price >= 10000 THEN stock_price / 1000.0
  WHEN stock_price >= 1000 THEN stock_price / 100.0
  ELSE stock_price
END
WHERE stock_price > 1000 
  AND is_traded = true;