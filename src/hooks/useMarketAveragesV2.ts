import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MarketAveragesV2 {
  [key: string]: {
    [model: string]: number;
  };
}

export function useMarketAveragesV2(periodFrom?: string, periodTo?: string) {
  return useQuery({
    queryKey: ["market-averages-v2", periodFrom, periodTo],
    queryFn: async () => {
      if (!periodFrom || !periodTo) {
        return {};
      }

      const { data, error } = await supabase
        .from("rix_runs_v2")
        .select(`
          02_model_name,
          rix_score,
          nvm_score,
          drm_score,
          sim_score,
          rmm_score,
          cem_score,
          gam_score,
          dcm_score,
          cxm_score
        `)
        .gte("period_from", periodFrom)
        .lte("period_to", periodTo)
        .not("analysis_completed_at", "is", null);

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

      const averages: MarketAveragesV2 = {};
      const kpiFields = [
        { key: "rix", field: "rix_score" },
        { key: "nvm", field: "nvm_score" },
        { key: "drm", field: "drm_score" },
        { key: "sim", field: "sim_score" },
        { key: "rmm", field: "rmm_score" },
        { key: "cem", field: "cem_score" },
        { key: "gam", field: "gam_score" },
        { key: "dcm", field: "dcm_score" },
        { key: "cxm", field: "cxm_score" },
      ];

      kpiFields.forEach(({ key, field }) => {
        averages[key] = {};
        
        Object.keys(modelGroups).forEach((model) => {
          const validScores = modelGroups[model]
            .map((run) => run[field as keyof typeof run])
            .filter((score): score is number => score !== null && score !== undefined && !isNaN(Number(score)));
          
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
