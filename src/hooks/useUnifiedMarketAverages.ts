import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UnifiedMarketAverages {
  [key: string]: {
    [model: string]: number;
  };
}

export function useUnifiedMarketAverages(periodFrom?: string, periodTo?: string) {
  return useQuery({
    queryKey: ["unified-market-averages", periodFrom, periodTo],
    queryFn: async () => {
      if (!periodFrom || !periodTo) {
        return {};
      }

      // Fetch from both tables in parallel
      const [makeResult, v2Result] = await Promise.all([
        supabase
          .from("rix_runs")
          .select(`
            "02_model_name",
            "09_rix_score",
            "23_nvm_score",
            "26_drm_score",
            "29_sim_score",
            "32_rmm_score",
            "35_cem_score",
            "38_gam_score",
            "41_dcm_score",
            "44_cxm_score"
          `)
          .gte("06_period_from", periodFrom)
          .lte("07_period_to", periodTo),
        supabase
          .from("rix_runs_v2")
          .select(`
            "02_model_name",
            "09_rix_score",
            "23_nvm_score",
            "26_drm_score",
            "29_sim_score",
            "32_rmm_score",
            "35_cem_score",
            "38_gam_score",
            "41_dcm_score",
            "44_cxm_score"
          `)
          .gte("06_period_from", periodFrom)
          .lte("07_period_to", periodTo)
          .not("analysis_completed_at", "is", null)
      ]);

      if (makeResult.error) throw makeResult.error;
      if (v2Result.error) throw v2Result.error;

      // Combine data from both sources
      const allData = [...(makeResult.data || []), ...(v2Result.data || [])];

      // Group by model and calculate averages
      const modelGroups: { [model: string]: any[] } = {};
      
      allData.forEach((run) => {
        const model = run["02_model_name"] || "unknown";
        if (!modelGroups[model]) {
          modelGroups[model] = [];
        }
        modelGroups[model].push(run);
      });

      const averages: UnifiedMarketAverages = {};
      const kpiFields = [
        { key: "rix", field: "09_rix_score" },
        { key: "nvm", field: "23_nvm_score" },
        { key: "drm", field: "26_drm_score" },
        { key: "sim", field: "29_sim_score" },
        { key: "rmm", field: "32_rmm_score" },
        { key: "cem", field: "35_cem_score" },
        { key: "gam", field: "38_gam_score" },
        { key: "dcm", field: "41_dcm_score" },
        { key: "cxm", field: "44_cxm_score" },
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
