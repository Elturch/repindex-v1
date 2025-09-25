import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MarketAverages {
  [key: string]: {
    [model: string]: number;
  };
}

export function useMarketAverages(periodFrom?: string, periodTo?: string) {
  return useQuery({
    queryKey: ["market-averages", periodFrom, periodTo],
    queryFn: async () => {
      if (!periodFrom || !periodTo) {
        return {};
      }

      const { data, error } = await supabase
        .from("pari_runs")
        .select(`
          02_model_name,
          09_pari_score,
          23_lns_score,
          26_es_score,
          29_sam_score,
          32_rm_score,
          35_clr_score,
          38_gip_score,
          41_kgi_score,
          44_mpi_score
        `)
        .gte("06_period_from", periodFrom)
        .lte("07_period_to", periodTo);

      if (error) {
        throw error;
      }

      // Group by model and calculate averages
      const modelGroups: { [model: string]: any[] } = {};
      
      data?.forEach((run) => {
        const model = run["02_model_name"] || "unknown";
        if (!modelGroups[model]) {
          modelGroups[model] = [];
        }
        modelGroups[model].push(run);
      });

      const averages: MarketAverages = {};
      const kpiFields = [
        { key: "pari", field: "09_pari_score" },
        { key: "lns", field: "23_lns_score" },
        { key: "es", field: "26_es_score" },
        { key: "sam", field: "29_sam_score" },
        { key: "rm", field: "32_rm_score" },
        { key: "clr", field: "35_clr_score" },
        { key: "gip", field: "38_gip_score" },
        { key: "kgi", field: "41_kgi_score" },
        { key: "mpi", field: "44_mpi_score" },
      ];

      kpiFields.forEach(({ key, field }) => {
        averages[key] = {};
        
        Object.keys(modelGroups).forEach((model) => {
          const validScores = modelGroups[model]
            .map((run) => run[field])
            .filter((score) => score !== null && score !== undefined && !isNaN(score));
          
          if (validScores.length > 0) {
            averages[key][model] = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
          } else {
            averages[key][model] = 0;
          }
        });
      });

      return averages;
    },
    enabled: !!periodFrom && !!periodTo,
  });
}