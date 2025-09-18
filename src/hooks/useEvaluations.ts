import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Evaluation {
  id: string;
  created_at: string;
  target_name: string;
  target_type: string;
  ticker?: string;
  period_from?: string;
  period_to?: string;
  tz?: string;
  composite_chatgpt?: number;
  composite_perplexity?: number;
  composite_delta_abs?: number;
  composite_delta_pct?: number;
  composite_winner?: string;
  metrics_won_chatgpt?: number;
  metrics_won_perplexity?: number;
  metrics_won_ties?: number;
  similarity_note?: string;
}

export function useEvaluations(searchQuery?: string) {
  return useQuery({
    queryKey: ["evaluations", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("evaluation")
        .select("*")
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.ilike("target_name", `%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data as Evaluation[];
    },
    enabled: true,
  });
}

export function useEvaluation(id: string) {
  return useQuery({
    queryKey: ["evaluation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        throw error;
      }

      return data as Evaluation;
    },
    enabled: !!id,
  });
}