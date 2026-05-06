import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Devuelve la fecha del último barrido canónico (último domingo con datos
 * en rix_runs_v2). Se usa para anclar los presets temporales (7d/30d/90d/YTD)
 * a datos reales en lugar de a la fecha de hoy.
 */
export function useLatestBatchDate() {
  return useQuery({
    queryKey: ["latest-batch-date"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rix_runs_v2")
        .select("batch_execution_date")
        .order("batch_execution_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const raw = (data as any)?.batch_execution_date as string | null;
      if (!raw) return null;
      // Quedarse con YYYY-MM-DD
      return raw.slice(0, 10);
    },
    staleTime: 5 * 60 * 1000,
  });
}
