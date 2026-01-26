import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UnifiedSiblingRun {
  id: string;
  model_name: string;
  rix_score: number;
  target_name: string;
  ticker: string;
  source_pipeline: 'make_original' | 'lovable_v2';
}

export function useUnifiedSiblingRuns(
  ticker?: string | null,
  periodFrom?: string | null,
  periodTo?: string | null,
  currentModelName?: string | null
) {
  return useQuery({
    queryKey: ["unified-sibling-rix-runs", ticker, periodFrom, periodTo, currentModelName],
    queryFn: async (): Promise<UnifiedSiblingRun[]> => {
      if (!ticker || !periodFrom || !periodTo || !currentModelName) {
        return [];
      }

      // Fetch from both tables in parallel
      const [makeResult, v2Result] = await Promise.all([
        supabase
          .from("rix_runs")
          .select(`
            id,
            "02_model_name",
            "09_rix_score",
            "03_target_name",
            "05_ticker"
          `)
          .eq("05_ticker", ticker)
          .eq("06_period_from", periodFrom)
          .eq("07_period_to", periodTo)
          .neq("02_model_name", currentModelName)
          .order("09_rix_score", { ascending: false }),
        supabase
          .from("rix_runs_v2")
          .select(`
            id,
            "02_model_name",
            "09_rix_score",
            "03_target_name",
            "05_ticker"
          `)
          .eq("05_ticker", ticker)
          .eq("06_period_from", periodFrom)
          .eq("07_period_to", periodTo)
          .neq("02_model_name", currentModelName)
          .not("analysis_completed_at", "is", null)
          .order("09_rix_score", { ascending: false })
      ]);

      if (makeResult.error) {
        console.error("Error fetching sibling rix runs from make:", makeResult.error);
      }
      if (v2Result.error) {
        console.error("Error fetching sibling rix runs from v2:", v2Result.error);
      }

      // Normalize and combine
      const makeSiblings: UnifiedSiblingRun[] = (makeResult.data || []).map((run) => ({
        id: run.id,
        model_name: run["02_model_name"] || "Unknown",
        rix_score: run["09_rix_score"] || 0,
        target_name: run["03_target_name"] || "",
        ticker: run["05_ticker"] || "",
        source_pipeline: 'make_original' as const,
      }));

      const v2Siblings: UnifiedSiblingRun[] = (v2Result.data || []).map((run) => ({
        id: run.id,
        model_name: run["02_model_name"] || "Unknown",
        rix_score: run["09_rix_score"] || 0,
        target_name: run["03_target_name"] || "",
        ticker: run["05_ticker"] || "",
        source_pipeline: 'lovable_v2' as const,
      }));

      // Combine and deduplicate by model (prefer V2 data if both exist)
      const allSiblings = [...v2Siblings, ...makeSiblings];
      const seenModels = new Set<string>();
      const deduplicated: UnifiedSiblingRun[] = [];

      allSiblings.forEach(sibling => {
        if (!seenModels.has(sibling.model_name)) {
          seenModels.add(sibling.model_name);
          deduplicated.push(sibling);
        }
      });

      // Sort by RIX score descending
      return deduplicated.sort((a, b) => b.rix_score - a.rix_score);
    },
    enabled: !!ticker && !!periodFrom && !!periodTo && !!currentModelName,
    staleTime: 5 * 60 * 1000,
  });
}
