import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PariRun {
  id: string;
  created_at: string;
  updated_at: string;
  "01_run_id": string;
  "02_model_name"?: string;
  "03_target_name": string;
  "04_target_type"?: string;
  "05_ticker"?: string;
  "06_period_from"?: string;
  "07_period_to"?: string;
  "08_tz"?: string;
  "09_pari_score"?: number;
  "10_resumen"?: string;
  "11_puntos_clave"?: any;
  "12_palabras"?: number;
  "13_num_fechas"?: number;
  "14_num_citas"?: number;
  "15_temporal_alignment"?: number;
  "16_citation_density"?: number;
  "17_flags"?: any;
  "18_subscores"?: any;
  "19_weights"?: any;
  "20_res_gpt_bruto"?: string;
  "21_res_perplex_bruto"?: string;
  "22_explicacion"?: string[];
  "23_lns_score"?: number;
  "24_lns_peso"?: number;
  "25_lns_categoria"?: string;
  "26_es_score"?: number;
  "27_es_peso"?: number;
  "28_es_categoria"?: string;
  "29_sam_score"?: number;
  "30_sam_peso"?: number;
  "31_sam_categoria"?: string;
  "32_rm_score"?: number;
  "33_rm_peso"?: number;
  "34_rm_categoria"?: string;
  "35_clr_score"?: number;
  "36_clr_peso"?: number;
  "37_clr_categoria"?: string;
  "38_gip_score"?: number;
  "39_gip_peso"?: number;
  "40_gip_categoria"?: string;
  "41_kgi_score"?: number;
  "42_kgi_peso"?: number;
  "43_kgi_categoria"?: string;
  "44_mpi_score"?: number;
  "45_mpi_peso"?: number;
  "46_mpi_categoria"?: string;
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
        .order("09_pari_score", { ascending: false });

      if (searchQuery) {
        query = query.ilike("03_target_name", `%${searchQuery}%`);
      }

      if (modelFilter && modelFilter !== "all") {
        query = query.eq("02_model_name", modelFilter);
      }

      if (companyFilter && companyFilter !== "all") {
        query = query.eq("03_target_name", companyFilter);
      }

      if (weekFilter && weekFilter !== "all") {
        // Filter by week range (assuming weekFilter is in format "YYYY-MM-DD")
        const weekStart = new Date(weekFilter);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6); // Add 6 days for a week
        
        query = query.gte("06_period_from", weekStart.toISOString().split('T')[0])
                    .lte("07_period_to", weekEnd.toISOString().split('T')[0]);
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