import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// FASE 1 — V2-only. Legacy `rix_runs` retirada.
interface UnifiedSiblingRun {
  id: string;
  model_name: string;
  rix_score: number;
  target_name: string;
  ticker: string;
  source_pipeline: 'lovable_v2';
}

export function useUnifiedSiblingRuns(
  ticker?: string | null,
  periodFrom?: string | null,
  periodTo?: string | null,
  currentModelName?: string | null
) {
  return useQuery({
    queryKey: ["unified-sibling-rix-runs-v2only", ticker, periodFrom, periodTo, currentModelName],
    queryFn: async (): Promise<UnifiedSiblingRun[]> => {
      if (!ticker || !periodFrom || !periodTo || !currentModelName) return [];

      const { data, error } = await supabase
        .from("rix_runs_v2")
        .select(`id, "02_model_name", "09_rix_score", "03_target_name", "05_ticker"`)
        .eq("05_ticker", ticker)
        .eq("06_period_from", periodFrom)
        .eq("07_period_to", periodTo)
        .neq("02_model_name", currentModelName)
        .or('analysis_completed_at.not.is.null,09_rix_score.not.is.null')
        .order("09_rix_score", { ascending: false });

      if (error) {
        console.error("Error fetching sibling rix runs from v2:", error);
        return [];
      }

      const v2Siblings: UnifiedSiblingRun[] = (data || []).map((run: any) => ({
        id: run.id,
        model_name: run["02_model_name"] || "Unknown",
        rix_score: run["09_rix_score"] || 0,
        target_name: run["03_target_name"] || "",
        ticker: run["05_ticker"] || "",
        source_pipeline: 'lovable_v2' as const,
      }));

      // Deduplicate by model_name
      const seen = new Set<string>();
      const out: UnifiedSiblingRun[] = [];
      for (const s of v2Siblings) {
        if (!seen.has(s.model_name)) {
          seen.add(s.model_name);
          out.push(s);
        }
      }
      return out.sort((a, b) => b.rix_score - a.rix_score);
    },
    enabled: !!ticker && !!periodFrom && !!periodTo && !!currentModelName,
    staleTime: 5 * 60 * 1000,
  });
}
