import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';

export interface TrendDataPoint {
  batchDate: string; // "2025-10-19"
  batchLabel: string; // "Semana del 19 Oct 2025"
  averageRix: number; // Media del mercado
  numCompanies: number; // Número de empresas
  companyRix?: number; // RIX de empresa específica (si ticker provided)
}

interface TrendDataParams {
  ticker?: string; // Si se pasa, incluye datos de una empresa
  ibexFamily?: string; // "IBEX-35", etc.
  sector?: string; // "Bancos", etc.
  numWeeks?: number; // Default: 4
  modelFilter?: string; // Default: "ChatGPT"
}

export function useTrendData({
  ticker,
  ibexFamily,
  sector,
  numWeeks = 4,
  modelFilter = "ChatGPT"
}: TrendDataParams) {
  return useQuery({
    queryKey: ["trend-data", ticker, ibexFamily, sector, numWeeks, modelFilter],
    queryFn: async () => {
      // Get all rix_runs with joins to repindex for filtering (most recent first)
      let query = supabase
        .from("rix_runs")
        .select(`
          "05_ticker",
          "09_rix_score",
          "32_rmm_score",
          batch_execution_date,
          repindex_root_issuers!inner (
            ticker,
            ibex_family_code,
            sector_category
          )
        `)
        .eq("02_model_name", modelFilter)
        .order("batch_execution_date", { ascending: false });

      // Apply filters
      if (ibexFamily && ibexFamily !== "all") {
        query = query.eq("repindex_root_issuers.ibex_family_code", ibexFamily);
      }

      if (sector && sector !== "all") {
        query = query.eq("repindex_root_issuers.sector_category", sector);
      }

      const { data: allRuns, error } = await query;

      if (error) {
        throw error;
      }

      if (!allRuns || allRuns.length === 0) {
        return {
          marketTrend: [],
          companyTrend: [],
          error: "No hay datos disponibles para los filtros seleccionados"
        };
      }

      // Group by batch_execution_date (already normalized to Sunday in DB)
      // First, keep only the most recent record for each ticker/batch combination
      const batchRecordsMap = new Map<string, typeof allRuns[0]>();
      
      allRuns.forEach(run => {
        // Skip invalid data (RMM=0)
        if (run["32_rmm_score"] === 0) return;
        
        const batchDate = new Date(run.batch_execution_date);
        const batchKey = format(batchDate, 'yyyy-MM-dd');
        const mapKey = `${run["05_ticker"]}_${batchKey}`;
        
        // Keep the most recent record for each ticker/batch (by batch_execution_date)
        const existing = batchRecordsMap.get(mapKey);
        if (!existing || new Date(run.batch_execution_date) > new Date(existing.batch_execution_date)) {
          batchRecordsMap.set(mapKey, run);
        }
      });
      
      // Now group the deduplicated records by batch
      const batchGroups = new Map<string, { scores: number[], companyScore?: number }>();
      
      batchRecordsMap.forEach(run => {
        const batchDate = new Date(run.batch_execution_date);
        const batchKey = format(batchDate, 'yyyy-MM-dd');
        
        if (!batchGroups.has(batchKey)) {
          batchGroups.set(batchKey, { scores: [] });
        }
        
        const group = batchGroups.get(batchKey)!;
        
        // Add to market average
        if (run["09_rix_score"] !== null && run["09_rix_score"] !== undefined) {
          group.scores.push(run["09_rix_score"]);
        }
        
        // Track specific company if ticker provided
        if (ticker && run["05_ticker"] === ticker && run["09_rix_score"] !== null) {
          group.companyScore = run["09_rix_score"];
        }
      });

      // Convert to TrendDataPoint array
      const marketTrend: TrendDataPoint[] = [];
      const companyTrend: TrendDataPoint[] = [];

      Array.from(batchGroups.entries())
        .sort((a, b) => a[0].localeCompare(b[0])) // Sort chronologically
        .slice(-numWeeks) // Limit to last N weeks
        .forEach(([batchKey, group]) => {
          const averageRix = group.scores.length > 0
            ? Math.round(group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length)
            : 0;

          const [year, month, day] = batchKey.split('-').map(Number);
          const batchDate = new Date(Date.UTC(year, month - 1, day));
          const batchLabel = `Semana del ${format(batchDate, 'd MMM yyyy')}`;

          marketTrend.push({
            batchDate: batchKey,
            batchLabel,
            averageRix,
            numCompanies: group.scores.length
          });

          // Add company data if available
          if (ticker && group.companyScore !== undefined) {
            companyTrend.push({
              batchDate: batchKey,
              batchLabel,
              averageRix,
              numCompanies: group.scores.length,
              companyRix: group.companyScore
            });
          }
        });

      return {
        marketTrend,
        companyTrend: ticker ? companyTrend : undefined,
        error: null
      };
    },
    enabled: true,
  });
}
