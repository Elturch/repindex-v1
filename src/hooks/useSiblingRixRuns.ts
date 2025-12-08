import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SiblingRixRun {
  id: string;
  model_name: string;
  rix_score: number;
  target_name: string;
  ticker: string;
}

export function useSiblingRixRuns(
  ticker?: string | null,
  periodFrom?: string | null,
  periodTo?: string | null,
  currentModelName?: string | null
) {
  return useQuery({
    queryKey: ["sibling-rix-runs", ticker, periodFrom, periodTo, currentModelName],
    queryFn: async (): Promise<SiblingRixRun[]> => {
      if (!ticker || !periodFrom || !periodTo || !currentModelName) {
        return [];
      }

      const { data, error } = await supabase
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
        .order("09_rix_score", { ascending: false });

      if (error) {
        console.error("Error fetching sibling rix runs:", error);
        return [];
      }

      return (data || []).map((run) => ({
        id: run.id,
        model_name: run["02_model_name"] || "Unknown",
        rix_score: run["09_rix_score"] || 0,
        target_name: run["03_target_name"] || "",
        ticker: run["05_ticker"] || "",
      }));
    },
    enabled: !!ticker && !!periodFrom && !!periodTo && !!currentModelName,
    staleTime: 5 * 60 * 1000,
  });
}
