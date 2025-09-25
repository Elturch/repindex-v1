import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SectorCategory {
  sector_category: string;
}

export function useSectorCategories() {
  return useQuery({
    queryKey: ["sector-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repindex_root_issuers")
        .select("sector_category")
        .not("sector_category", "is", null)
        .order("sector_category");

      if (error) {
        throw error;
      }

      // Get unique sector categories
      const uniqueCategories = Array.from(
        new Set(data.map(item => item.sector_category))
      ).map(category => ({ sector_category: category }));

      return uniqueCategories as SectorCategory[];
    },
    enabled: true,
  });
}