// FASE 1 — DEPRECATED. Use `useUnifiedMarketAverages` (V2-only).
import { useQuery } from "@tanstack/react-query";

export interface MarketAverages {
  [key: string]: { [model: string]: number };
}

export function useMarketAverages(_periodFrom?: string, _periodTo?: string) {
  return useQuery<MarketAverages>({
    queryKey: ["market-averages-DEPRECATED-noop"],
    queryFn: async () => {
      console.warn("[useMarketAverages] DEPRECATED: rix_runs legacy retired. Use useUnifiedMarketAverages.");
      return {};
    },
    staleTime: Infinity,
  });
}
