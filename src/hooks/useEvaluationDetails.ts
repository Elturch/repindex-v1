import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MetricDetail {
  id: number;
  evaluation_id: string;
  label: string;
  metric: string;
  score_chatgpt: number;
  score_perplexity: number;
  score_delta_abs: number;
  score_delta_pct: number;
  weight: number;
  contrib_points_chatgpt: number;
  contrib_points_perplexity: number;
  contrib_points_delta: number;
  contrib_share_chatgpt: number;
  contrib_share_perplexity: number;
}

export interface ExecutiveNote {
  id: number;
  evaluation_id: string;
  note: string;
  position: number;
}

export interface TacticalRecommendation {
  id: number;
  evaluation_id: string;
  recommendation: string;
  position: number;
}

export interface TopDriver {
  id: number;
  evaluation_id: string;
  label: string;
  metric: string;
  direction: string;
  delta_contrib_abs: number;
}

export interface Counter {
  id: number;
  evaluation_id: string;
  model_key: string;
  palabras: number;
  num_fechas: number;
  num_citas: number;
  temporal_alignment: number;
  citation_density: number;
  flags: string[];
}

export function useEvaluationMetrics(evaluationId: string) {
  return useQuery({
    queryKey: ["evaluation-metrics", evaluationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("by_metric")
        .select("*")
        .eq("evaluation_id", evaluationId)
        .order("metric");

      if (error) {
        throw error;
      }

      return data as MetricDetail[];
    },
    enabled: !!evaluationId,
  });
}

export function useExecutiveNotes(evaluationId: string) {
  return useQuery({
    queryKey: ["executive-notes", evaluationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("executive_notes")
        .select("*")
        .eq("evaluation_id", evaluationId)
        .order("position");

      if (error) {
        throw error;
      }

      return data as ExecutiveNote[];
    },
    enabled: !!evaluationId,
  });
}

export function useTacticalRecommendations(evaluationId: string) {
  return useQuery({
    queryKey: ["tactical-recommendations", evaluationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommendations_tactical")
        .select("*")
        .eq("evaluation_id", evaluationId)
        .order("position");

      if (error) {
        throw error;
      }

      return data as TacticalRecommendation[];
    },
    enabled: !!evaluationId,
  });
}

export function useTopDrivers(evaluationId: string) {
  return useQuery({
    queryKey: ["top-drivers", evaluationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("top_drivers")
        .select("*")
        .eq("evaluation_id", evaluationId)
        .order("delta_contrib_abs", { ascending: false });

      if (error) {
        throw error;
      }

      return data as TopDriver[];
    },
    enabled: !!evaluationId,
  });
}

export function useCounters(evaluationId: string) {
  return useQuery({
    queryKey: ["counters", evaluationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contadores")
        .select("*")
        .eq("evaluation_id", evaluationId);

      if (error) {
        throw error;
      }

      return data as Counter[];
    },
    enabled: !!evaluationId,
  });
}