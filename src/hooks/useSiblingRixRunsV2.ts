import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SiblingRixRunV2 {
  id: string;
  model_name: string;
  rix_score: number | null;
  target_name: string | null;
  ticker: string | null;
  // Include all the metrics for radar chart comparison
  nvm_score: number | null;
  drm_score: number | null;
  sim_score: number | null;
  rmm_score: number | null;
  cem_score: number | null;
  gam_score: number | null;
  dcm_score: number | null;
  cxm_score: number | null;
}

export function useSiblingRixRunsV2(
  ticker?: string | null,
  periodFrom?: string | null,
  periodTo?: string | null,
  _currentModelName?: string | null
) {
  return useQuery({
    queryKey: ["sibling-rix-runs-v2", ticker, periodFrom, periodTo],
    queryFn: async (): Promise<SiblingRixRunV2[]> => {
      if (!ticker || !periodFrom || !periodTo) {
        return [];
      }

      // Use the correct column names with numeric prefixes
      const { data, error } = await supabase
        .from("rix_runs_v2")
        .select(`
          id,
          "02_model_name",
          "09_rix_score",
          "51_rix_score_adjusted",
          "03_target_name",
          "05_ticker",
          "23_nvm_score",
          "26_drm_score",
          "29_sim_score",
          "32_rmm_score",
          "35_cem_score",
          "38_gam_score",
          "41_dcm_score",
          "44_cxm_score"
        `)
        .eq("05_ticker", ticker)
        .eq("06_period_from", periodFrom)
        .eq("07_period_to", periodTo)
        .order("09_rix_score", { ascending: false, nullsFirst: false });

      if (error) {
        console.error("Error fetching sibling rix runs v2:", error);
        return [];
      }

      return (data || []).map((run) => ({
        id: run.id,
        model_name: run["02_model_name"] || "Unknown",
        rix_score: run["51_rix_score_adjusted"] ?? run["09_rix_score"],
        target_name: run["03_target_name"],
        ticker: run["05_ticker"],
        nvm_score: run["23_nvm_score"],
        drm_score: run["26_drm_score"],
        sim_score: run["29_sim_score"],
        rmm_score: run["32_rmm_score"],
        cem_score: run["35_cem_score"],
        gam_score: run["38_gam_score"],
        dcm_score: run["41_dcm_score"],
        cxm_score: run["44_cxm_score"],
      }));
    },
    enabled: !!ticker && !!periodFrom && !!periodTo,
    staleTime: 5 * 60 * 1000,
  });
}
