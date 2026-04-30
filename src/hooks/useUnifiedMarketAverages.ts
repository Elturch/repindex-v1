import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// FASE 1 — V2-only. Legacy `rix_runs` retirada.
export interface UnifiedMarketAverages {
  [key: string]: { [model: string]: number };
}

export function useUnifiedMarketAverages(periodFrom?: string, periodTo?: string) {
  return useQuery({
    queryKey: ["unified-market-averages-v2only", periodFrom, periodTo],
    queryFn: async () => {
      if (!periodFrom || !periodTo) return {};

      const { data, error } = await supabase
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
        .not("analysis_completed_at", "is", null);

      if (error) throw error;

      const allData = data || [];
      const modelGroups: { [model: string]: any[] } = {};
      allData.forEach((run: any) => {
        const model = run["02_model_name"] || "unknown";
        (modelGroups[model] = modelGroups[model] || []).push(run);
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
          const valid = modelGroups[model]
            .map((run) => run[field])
            .filter((s): s is number => s !== null && s !== undefined && !isNaN(Number(s)));
          averages[key][model] = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
        });
      });

      return averages;
    },
    enabled: !!periodFrom && !!periodTo,
  });
}
