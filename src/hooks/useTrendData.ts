// FASE 1 — DEPRECATED. Use `useTrendDataLight` (V2-only).
import { useQuery } from "@tanstack/react-query";

export interface TrendDataPoint {
  batchDate: string;
  batchLabel: string;
  averageRix: number;
  numCompanies: number;
  companyRix?: number;
}

interface TrendDataParams {
  ticker?: string;
  ibexFamily?: string;
  sector?: string;
  numWeeks?: number;
  modelFilter?: string;
}

export function useTrendData(_p: TrendDataParams) {
  return useQuery({
    queryKey: ["trend-data-DEPRECATED-noop"],
    queryFn: async () => ({ marketTrend: [] as TrendDataPoint[], companyTrend: undefined as TrendDataPoint[] | undefined, error: null as string | null }),
    staleTime: Infinity,
  });
}
