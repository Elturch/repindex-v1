import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RankingRow {
  rank: number;
  tk: string;
  name: string;
  cotiza: boolean | null;
  subsector: string | null;
  rixc: number;
  rixc_prev: number | null;
  delta: number | null;
  rix_min: number;
  rix_max: number;
  num_citas: number | null;
  nvm: number | null;
  drm: number | null;
  sim: number | null;
  rmm: number | null;
  cem: number | null;
  gam: number | null;
  dcm: number | null;
  cxm: number | null;
}

export interface RankingSectorAvg {
  rixc: number;
  nvm: number;
  drm: number;
  sim: number;
  rmm: number;
  cem: number;
  gam: number;
  dcm: number;
  cxm: number;
}

export interface RankingPeriodRow {
  tk: string;
  first: number;
  last: number;
  delta: number;
  avg: number;
  volatility: number;
  min: number;
  max: number;
  weeks: number;
}

export interface RankingSectorSeriesPoint {
  wk: string;
  avg: number;
}

export interface RankingEntitySeries {
  tk: string;
  series: Array<{ wk: string; rixc: number }>;
}

export interface RankingDatapack {
  scope: {
    sector: string | null;
    subsector: string | null;
    universe: string[] | null;
    tickers: string[] | null;
    n_entities: number;
  };
  window: { from: string; to: string; weeks: number };
  models_used: string[];
  latest_week: string;
  prev_week: string | null;
  order_by: string;
  ranking: RankingRow[];
  sector_avg: RankingSectorAvg;
  distribution: { fuerte: number; solido: number; atencion: number; critico: number };
  period: RankingPeriodRow[];
  sector_series: RankingSectorSeriesPoint[];
  entity_series: RankingEntitySeries[];
}

export interface RankingDatapackParams {
  sector?: string | null;
  subsector?: string | null;
  universe?: string[] | null;
  tickers?: string[] | null;
  from?: string | null;
  to?: string | null;
  models?: string[] | null;
  orderBy?: string | null;
}

function normalizeArray(arr?: string[] | null): string[] | null {
  if (!arr || arr.length === 0) return null;
  return [...arr].map((s) => s.trim()).filter(Boolean).sort();
}

export function useRankingDatapack(params: RankingDatapackParams) {
  const sector = params.sector?.trim() || null;
  const subsector = params.subsector?.trim() || null;
  const universe = normalizeArray(params.universe);
  const tickers = normalizeArray(params.tickers);
  const from = params.from || null;
  const to = params.to || null;
  const models = normalizeArray(params.models);
  const orderBy = (params.orderBy || "rixc").toLowerCase();

  const hasScope =
    !!sector || !!subsector || (universe && universe.length > 0) || (tickers && tickers.length > 0);

  return useQuery<RankingDatapack>({
    queryKey: [
      "rix_ranking_datapack",
      { sector, subsector, universe, tickers, from, to, models, orderBy },
    ],
    enabled: hasScope,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("rix_ranking_datapack", {
        p_sector: sector,
        p_subsector: subsector,
        p_universe: universe,
        p_tickers: tickers,
        p_from: from,
        p_to: to,
        p_models: models,
        p_order_by: orderBy,
      });
      if (error) throw error;
      return data as RankingDatapack;
    },
  });
}