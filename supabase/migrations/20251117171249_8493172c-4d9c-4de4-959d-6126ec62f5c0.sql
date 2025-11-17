-- Crear tabla ligera rix_trends para gráficos de evolución
CREATE TABLE IF NOT EXISTS rix_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  company_name text NOT NULL,
  model_name text NOT NULL,
  batch_week date NOT NULL,
  rix_score integer NOT NULL,
  stock_price numeric(10,2),
  is_traded boolean NOT NULL DEFAULT true,
  ibex_family_code text,
  sector_category text,
  created_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_ticker_model_week UNIQUE(ticker, model_name, batch_week)
);

-- Índices para optimizar queries
CREATE INDEX IF NOT EXISTS idx_rix_trends_batch ON rix_trends(batch_week DESC);
CREATE INDEX IF NOT EXISTS idx_rix_trends_model_batch ON rix_trends(model_name, batch_week DESC);
CREATE INDEX IF NOT EXISTS idx_rix_trends_filters ON rix_trends(ibex_family_code, sector_category, batch_week DESC);

-- Habilitar RLS
ALTER TABLE rix_trends ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (acceso público de lectura)
CREATE POLICY "Acceso público de lectura rix_trends"
  ON rix_trends FOR SELECT
  USING (true);

CREATE POLICY "Acceso público de inserción rix_trends"
  ON rix_trends FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Acceso público de actualización rix_trends"
  ON rix_trends FOR UPDATE
  USING (true);

CREATE POLICY "Acceso público de eliminación rix_trends"
  ON rix_trends FOR DELETE
  USING (true);

-- Poblar tabla con datos históricos
INSERT INTO rix_trends (
  ticker, company_name, model_name, batch_week, 
  rix_score, stock_price, is_traded, 
  ibex_family_code, sector_category
)
SELECT DISTINCT ON (rr."05_ticker", rr."02_model_name", rr.batch_execution_date)
  rr."05_ticker" as ticker,
  rr."03_target_name" as company_name,
  rr."02_model_name" as model_name,
  rr.batch_execution_date as batch_week,
  COALESCE(rr."51_rix_score_adjusted", rr."09_rix_score") as rix_score,
  CASE 
    WHEN rr."48_precio_accion" ~ '^[0-9]+\.?[0-9]*$' 
    THEN rr."48_precio_accion"::numeric 
    ELSE NULL 
  END as stock_price,
  COALESCE(ri.cotiza_en_bolsa, false) as is_traded,
  ri.ibex_family_code,
  ri.sector_category
FROM rix_runs rr
LEFT JOIN repindex_root_issuers ri ON ri.ticker = rr."05_ticker"
WHERE rr."32_rmm_score" != 0
  AND rr."05_ticker" IS NOT NULL
  AND rr."02_model_name" IS NOT NULL
ORDER BY rr."05_ticker", rr."02_model_name", rr.batch_execution_date, rr.created_at DESC
ON CONFLICT (ticker, model_name, batch_week) DO NOTHING;

-- Función trigger para sincronización automática
CREATE OR REPLACE FUNCTION sync_rix_trends()
RETURNS TRIGGER AS $$
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
      CASE 
        WHEN NEW."48_precio_accion" ~ '^[0-9]+\.?[0-9]*$' 
        THEN NEW."48_precio_accion"::numeric 
        ELSE NULL 
      END,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Crear trigger
DROP TRIGGER IF EXISTS trg_sync_rix_trends ON rix_runs;
CREATE TRIGGER trg_sync_rix_trends
AFTER INSERT ON rix_runs
FOR EACH ROW
EXECUTE FUNCTION sync_rix_trends();