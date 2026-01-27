-- Populate rix_trends from v2 runs (Grok/Qwen included) and keep it in sync going forward

-- 1) Add trigger on rix_runs_v2 to sync into rix_trends (mirrors existing v1 trigger)
DROP TRIGGER IF EXISTS trg_sync_rix_trends_v2 ON public.rix_runs_v2;
CREATE TRIGGER trg_sync_rix_trends_v2
AFTER INSERT OR UPDATE ON public.rix_runs_v2
FOR EACH ROW
EXECUTE FUNCTION public.sync_rix_trends();

-- 2) Backfill existing rix_runs_v2 rows into rix_trends (so Grok/Qwen appear immediately)
INSERT INTO public.rix_trends (
  ticker,
  company_name,
  model_name,
  batch_week,
  rix_score,
  stock_price,
  is_traded,
  ibex_family_code,
  sector_category
)
SELECT
  rr."05_ticker"                          AS ticker,
  rr."03_target_name"                     AS company_name,
  rr."02_model_name"                      AS model_name,
  rr.batch_execution_date::date            AS batch_week,
  COALESCE(rr."51_rix_score_adjusted", rr."09_rix_score") AS rix_score,
  normalize_stock_price_v2(
    rr."48_precio_accion",
    rr."05_ticker",
    rr.batch_execution_date
  )                                        AS stock_price,
  COALESCE(ri.cotiza_en_bolsa, false)      AS is_traded,
  ri.ibex_family_code,
  ri.sector_category
FROM public.rix_runs_v2 rr
JOIN public.repindex_root_issuers ri
  ON ri.ticker = rr."05_ticker"
WHERE rr."32_rmm_score" != 0
  AND rr."05_ticker" IS NOT NULL
  AND rr."02_model_name" IS NOT NULL
ON CONFLICT (ticker, model_name, batch_week)
DO UPDATE SET
  rix_score = EXCLUDED.rix_score,
  stock_price = EXCLUDED.stock_price,
  company_name = EXCLUDED.company_name,
  is_traded = EXCLUDED.is_traded,
  ibex_family_code = EXCLUDED.ibex_family_code,
  sector_category = EXCLUDED.sector_category;