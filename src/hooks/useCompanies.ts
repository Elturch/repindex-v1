import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Company {
  issuer_id: string;
  issuer_name: string;
  ticker: string;
  status?: string;
  sector_category?: string;
}

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repindex_root_issuers")
        .select("issuer_id, issuer_name, ticker, status, sector_category")
        .order("issuer_name");

      if (error) {
        throw error;
      }

      return data as Company[];
    },
    enabled: true,
  });
}