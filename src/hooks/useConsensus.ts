import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConsensusLevel = "unanime" | "fuerte" | "debil" | "disperso" | string;

export interface ConsensusCore {
  theme: string;
  coverage: number;
  models: string[];
}

export interface ConsensusSharedEvent {
  label: string;
  models: string[];
  theme?: string | null;
  protagonists?: string[] | null;
}

export interface ConsensusBlindSpot {
  label: string;
  model: string;
  theme?: string | null;
  protagonists?: string[] | null;
  corroboration?: "corroborado" | "no_verificado" | string | null;
}

export interface ConsensusData {
  consenso: number;
  level: ConsensusLevel;
  distinct_themes: number;
  dispersion: number;
  models_count: number;
  core: ConsensusCore[];
  shared_events: ConsensusSharedEvent[];
  blind_spots: ConsensusBlindSpot[];
}

export function useConsensus(ticker: string | null | undefined) {
  return useQuery<ConsensusData | null>({
    queryKey: ["rix-consensus", ticker],
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rix_consensus_get", {
        p_ticker: ticker as string,
      });
      if (error) throw error;
      if (!data) return null;
      return data as unknown as ConsensusData;
    },
  });
}

export interface ConsensusSeriesPoint {
  week: string;
  consenso: number;
  level: ConsensusLevel;
}

export function useConsensusSeries(ticker: string | null | undefined) {
  return useQuery<ConsensusSeriesPoint[]>({
    queryKey: ["rix-consensus-series", ticker],
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rix_consensus_series", {
        p_ticker: ticker as string,
      });
      if (error) throw error;
      if (!Array.isArray(data)) return [];
      return data as unknown as ConsensusSeriesPoint[];
    },
  });
}

export interface ConsensusBatchEntry {
  consenso: number;
  level: ConsensusLevel;
}

export function useConsensusBatch(tickers: string[] | null | undefined) {
  const key = (tickers ?? []).slice().sort().join(",");
  return useQuery<Record<string, ConsensusBatchEntry>>({
    queryKey: ["rix-consensus-batch", key],
    enabled: !!tickers && tickers.length > 0,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rix_consensus_batch", {
        p_tickers: tickers as string[],
      });
      if (error) throw error;
      if (!data || typeof data !== "object") return {};
      return data as unknown as Record<string, ConsensusBatchEntry>;
    },
  });
}