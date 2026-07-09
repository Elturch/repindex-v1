import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ComparisonEntity {
  ticker: string;
  name: string;
}

export interface ComparisonSnapshotRow {
  tk: string;
  name: string;
  rixc: number;
  rixc_prev: number | null;
  rixc_first: number | null;
  rixc_last: number | null;
  rix_min: number;
  rix_max: number;
  nvm: number | null;
  drm: number | null;
  sim: number | null;
  rmm: number | null;
  cem: number | null;
  gam: number | null;
  dcm: number | null;
  cxm: number | null;
  num_citas: number | null;
}

export interface ComparisonPerModelRow {
  tk: string;
  model: string;
  rix: number;
}

export interface ComparisonEvolutionRow {
  tk: string;
  week: string;
  rixc: number;
}

export interface ComparisonCitationItem {
  url: string;
  domain: string;
  models_count: number;
  models: string[];
}

export interface ComparisonCitations {
  tk: string;
  total_sources: number;
  items: ComparisonCitationItem[];
}

export interface ComparisonDatapack {
  latest_week: string;
  prev_week: string;
  mode: "snapshot" | "period";
  period_from: string;
  period_to: string;
  weeks_count: number;
  entities: ComparisonEntity[];
  snapshot: ComparisonSnapshotRow[];
  permodel: ComparisonPerModelRow[];
  evolution: ComparisonEvolutionRow[];
  citations: ComparisonCitations[];
}

export function useComparisonDatapack(
  tickers: string[],
  from?: string | null,
  to?: string | null,
) {
  const normalized = [...(tickers ?? [])].filter(Boolean).map((t) => t.trim()).sort();
  const fromKey = from ?? null;
  const toKey = to ?? null;
  return useQuery<ComparisonDatapack>({
    queryKey: ["rix_comparison_datapack", normalized, fromKey, toKey],
    enabled: normalized.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("rix_comparison_datapack", {
        p_tickers: normalized,
        p_from: fromKey,
        p_to: toKey,
      });
      if (error) throw error;
      return data as ComparisonDatapack;
    },
  });
}