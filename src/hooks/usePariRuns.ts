import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PariRun {
  id: string;
  created_at: string;
  target_name: string;
  target_type?: string;
  ticker?: string;
  period_from?: string;
  period_to?: string;
  tz?: string;
  pari_score?: number;
  model_name?: string;
  lns_score?: number;
  lns_peso?: number;
  lns_categoria?: string;
  es_score?: number;
  es_peso?: number;
  es_categoria?: string;
  sam_score?: number;
  sam_peso?: number;
  sam_categoria?: string;
  rm_score?: number;
  rm_peso?: number;
  rm_categoria?: string;
  clr_score?: number;
  clr_peso?: number;
  clr_categoria?: string;
  gip_score?: number;
  gip_peso?: number;
  gip_categoria?: string;
  kgi_score?: number;
  kgi_peso?: number;
  kgi_categoria?: string;
  mpi_score?: number;
  mpi_peso?: number;
  mpi_categoria?: string;
  resumen?: string;
  puntos_clave?: any;
  palabras?: number;
  num_fechas?: number;
  num_citas?: number;
  temporal_alignment?: number;
  citation_density?: number;
  flags?: any;
  "res-gpt-bruto"?: string;
  "res-perplex-bruto"?: string;
}

export function usePariRuns(
  searchQuery?: string, 
  modelFilter?: string, 
  companyFilter?: string,
  weekFilter?: string
) {
  return useQuery({
    queryKey: ["pari-runs", searchQuery, modelFilter, companyFilter, weekFilter],
    queryFn: async () => {
      let query = supabase
        .from("pari_runs")
        .select("*")
        .order("pari_score", { ascending: false });

      if (searchQuery) {
        query = query.ilike("target_name", `%${searchQuery}%`);
      }

      if (modelFilter && modelFilter !== "all") {
        query = query.eq("model_name", modelFilter);
      }

      if (companyFilter && companyFilter !== "all") {
        query = query.eq("target_name", companyFilter);
      }

      if (weekFilter && weekFilter !== "all") {
        // Filter by week range (assuming weekFilter is in format "YYYY-MM-DD")
        const weekStart = new Date(weekFilter);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6); // Add 6 days for a week
        
        query = query.gte("period_from", weekStart.toISOString().split('T')[0])
                    .lte("period_to", weekEnd.toISOString().split('T')[0]);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data as PariRun[];
    },
    enabled: true,
  });
}

export function usePariRun(id: string) {
  return useQuery({
    queryKey: ["pari-run", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pari_runs")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        throw error;
      }

      return data as PariRun;
    },
    enabled: !!id,
  });
}