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