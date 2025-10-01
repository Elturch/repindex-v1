import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IbexFamilyCategory {
  ibex_family_code: string;
}

export function useIbexFamilyCategories() {
  return useQuery({
    queryKey: ["ibex-family-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repindex_root_issuers")
        .select("ibex_family_code")
        .not("ibex_family_code", "is", null)
        .order("ibex_family_code");

      if (error) {
        throw error;
      }

      // Get unique ibex family codes
      const uniqueCategories = Array.from(
        new Set(data.map(item => item.ibex_family_code))
      ).map(code => ({ ibex_family_code: code }));

      return uniqueCategories as IbexFamilyCategory[];
    },
    enabled: true,
  });
}
