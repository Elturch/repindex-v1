-- Fase 1 — Acotación quirúrgica de datos
-- 1) Vista canónica universo↔sector↔subsector↔ticker
CREATE OR REPLACE VIEW public.v_issuer_scope AS
SELECT
  ticker,
  issuer_name,
  COALESCE(ibex_family_code, 'UNKNOWN') AS universe,
  sector_category,
  subsector,
  ibex_family_code
FROM public.repindex_root_issuers
WHERE ticker IS NOT NULL AND ticker <> '' AND ticker <> '{TICKER}';

GRANT SELECT ON public.v_issuer_scope TO anon, authenticated, service_role;

-- 2) Auditoría por ejecución del agente
ALTER TABLE public.chat_logs
  ADD COLUMN IF NOT EXISTS scope_contract  jsonb,
  ADD COLUMN IF NOT EXISTS coverage_report jsonb,
  ADD COLUMN IF NOT EXISTS scope_audit     jsonb;

-- 3) Auditoría por celda de estrés
ALTER TABLE public.stress_results
  ADD COLUMN IF NOT EXISTS scope_contract    jsonb,
  ADD COLUMN IF NOT EXISTS coverage_report   jsonb,
  ADD COLUMN IF NOT EXISTS scope_audit       jsonb,
  ADD COLUMN IF NOT EXISTS scope_validation  jsonb;