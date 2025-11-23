import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';

export interface TrendDataPoint {
  batchDate: string; // "2025-10-19"
  batchLabel: string; // "Semana del 19 Oct 2025"
  market: number; // Media del mercado RIX
  numCompanies: number; // Número de empresas
  [key: string]: string | number; // Dynamic company data: ticker_rix, ticker_price, ticker_name, ticker_isTraded
}

interface TrendDataParams {
  tickers?: string[]; // Array de tickers a incluir
  ibexFamily?: string; // "IBEX-35", etc.
  sector?: string; // "Bancos", etc.
  numWeeks?: number; // Default: 6
  modelFilter?: string; // Default: "ChatGPT"
}

export function useTrendDataLight({
  tickers = [],
  ibexFamily,
  sector,
  numWeeks = 6,
  modelFilter = "ChatGPT"
}: TrendDataParams) {
  return useQuery({
    queryKey: ["trend-data-light", tickers, ibexFamily, sector, numWeeks, modelFilter],
    queryFn: async () => {
      // Calculate date limit
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - (numWeeks * 7));

      // Query the lightweight rix_trends table
      let query = supabase
        .from("rix_trends")
        .select("*")
        .eq("model_name", modelFilter)
        .gte("batch_week", limitDate.toISOString())
        .order("batch_week", { ascending: false });

      // Apply filters
      if (ibexFamily && ibexFamily !== "all") {
        query = query.eq("ibex_family_code", ibexFamily);
      }
      if (sector && sector !== "all") {
        query = query.eq("sector_category", sector);
      }

      const { data: trendData, error } = await query;

      if (error) {
        throw error;
      }

      if (!trendData || trendData.length === 0) {
        return [];
      }

      // Group by batch_week
      const batchGroups = new Map<string, {
        scores: number[];
        companies: Map<string, { rix: number; price: number | null; name: string; isTraded: boolean }>;
      }>();

      trendData.forEach(record => {
        const batchKey = format(new Date(record.batch_week), 'yyyy-MM-dd');
        
        if (!batchGroups.has(batchKey)) {
          batchGroups.set(batchKey, { scores: [], companies: new Map() });
        }
        
        const group = batchGroups.get(batchKey)!;
        
        // Add to market average
        group.scores.push(record.rix_score);
        
        // Track specific companies if in tickers list
        if (tickers.includes(record.ticker)) {
          group.companies.set(record.ticker, {
            rix: record.rix_score,
            price: record.stock_price,
            name: record.company_name,
            isTraded: record.is_traded
          });
        }
      });

      // Convert to chart data format
      const chartData: TrendDataPoint[] = Array.from(batchGroups.entries())
        .sort((a, b) => a[0].localeCompare(b[0])) // Sort by date ascending
        .map(([batchKey, group]) => {
          const batchDate = new Date(batchKey);
          const dataPoint: TrendDataPoint = {
            batchDate: batchKey,
            batchLabel: format(batchDate, 'dd MMM'),
            market: Math.round(group.scores.reduce((sum, s) => sum + s, 0) / group.scores.length),
            numCompanies: group.scores.length
          };

          // Add company-specific data
          group.companies.forEach((companyData, ticker) => {
            dataPoint[ticker] = companyData.rix;
            dataPoint[`${ticker}_price`] = companyData.price || 0;
            dataPoint[`${ticker}_name`] = companyData.name;
            dataPoint[`${ticker}_isTraded`] = companyData.isTraded ? 1 : 0;
          });

          return dataPoint;
        });

      return chartData;
    },
    enabled: true,
    staleTime: 10 * 60 * 1000, // 10 minutes - caché agresivo
    gcTime: 30 * 60 * 1000, // 30 minutes - mantener en memoria
    refetchOnWindowFocus: false,
  });
}
