import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SubsectorCategory {
  subsector: string;
  sector_category: string | null;
}

/**
 * Lista distinct de `subsector` desde `repindex_root_issuers`.
 * Usada por el Dashboard para alinear la granularidad de filtros con la
 * que usa el agente RIX en `sectorRanking.ts` (subsector y grupos semánticos).
 */
export function useSubsectorCategories(sectorFilter?: string) {
  return useQuery({
    queryKey: ["subsector-categories", sectorFilter || "all"],
    queryFn: async () => {
      let query = supabase
        .from("repindex_root_issuers")
        .select("subsector, sector_category")
        .not("subsector", "is", null)
        .order("subsector");

      if (sectorFilter && sectorFilter !== "all") {
        query = query.eq("sector_category", sectorFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const seen = new Set<string>();
      const out: SubsectorCategory[] = [];
      for (const row of data || []) {
        const key = (row.subsector || "").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ subsector: key, sector_category: row.sector_category });
      }
      return out;
    },
    staleTime: 30 * 60 * 1000,
  });
}