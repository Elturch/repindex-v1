import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_COUNT = 160; // Conservative fallback for static/SEO content

export function useIssuerCount() {
  return useQuery({
    queryKey: ['issuer-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('repindex_root_issuers')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count || DEFAULT_COUNT;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

// For static content, use a rounded number that won't need frequent updates
export const ISSUER_COUNT_STATIC = "160+";

// Helper to format count for display
export function formatIssuerCount(count: number): string {
  return `${count}+`;
}
