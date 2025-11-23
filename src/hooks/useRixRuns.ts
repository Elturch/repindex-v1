import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';

export interface RixRun {
  id: string;
  created_at: string;
  updated_at: string;
  "01_run_id": string;
  "02_model_name"?: string;
  "03_target_name"?: string;
  "04_target_type"?: string;
  "05_ticker"?: string;
  "06_period_from"?: string;
  "07_period_to"?: string;
  "08_tz"?: string;
  "09_rix_score"?: number;
  "10_resumen"?: string;
  "11_puntos_clave"?: any;
  "12_palabras"?: number;
  "13_num_fechas"?: number;
  "14_num_citas"?: number;
  "15_temporal_alignment"?: number;
  "16_citation_density"?: number;
  "17_flags"?: any;
  "18_subscores"?: any;
  "19_weights"?: any;
  "20_res_gpt_bruto"?: string;
  "21_res_perplex_bruto"?: string;
  "22_explicacion"?: string;
  "23_nvm_score"?: number;
  "24_nvm_peso"?: number;
  "25_nvm_categoria"?: string;
  "26_drm_score"?: number;
  "27_drm_peso"?: number;
  "28_drm_categoria"?: string;
  "29_sim_score"?: number;
  "30_sim_peso"?: number;
  "31_sim_categoria"?: string;
  "32_rmm_score"?: number;
  "33_rmm_peso"?: number;
  "34_rmm_categoria"?: string;
  "35_cem_score"?: number;
  "36_cem_peso"?: number;
  "37_cem_categoria"?: string;
  "38_gam_score"?: number;
  "39_gam_peso"?: number;
  "40_gam_categoria"?: string;
  "41_dcm_score"?: number;
  "42_dcm_peso"?: number;
  "43_dcm_categoria"?: string;
  "44_cxm_score"?: number;
  "45_cxm_peso"?: number;
  "46_cxm_categoria"?: string;
  "47_fase"?: string;
  "51_rix_score_adjusted"?: number;
  "52_cxm_excluded"?: boolean;
  batch_execution_date?: string;
  // Computed validation flags
  isDataInvalid?: boolean;
  dataInvalidReason?: string;
  displayRixScore?: number; // Computed: adjusted score if CXM excluded, otherwise original
  batchNumber?: number; // Sequential batch number
  batchLabel?: string; // Formatted label like "Consulta #1: 12/10 - 19/10"
  trend?: 'up' | 'down' | 'stable'; // Computed: comparison with previous batch
  previousRixScore?: number; // RIX score from previous batch for trend calculation
  metricTrends?: {
    nvm?: 'up' | 'down' | 'stable';
    drm?: 'up' | 'down' | 'stable';
    sim?: 'up' | 'down' | 'stable';
    rmm?: 'up' | 'down' | 'stable';
    cem?: 'up' | 'down' | 'stable';
    gam?: 'up' | 'down' | 'stable';
    dcm?: 'up' | 'down' | 'stable';
    cxm?: 'up' | 'down' | 'stable';
  };
  repindex_root_issuers?: {
    ticker?: string;
    ibex_family_code?: string;
    sector_category?: string;
  } | null;
}

// Helper function to fetch all records with pagination
async function fetchAllRixRuns(weeksToLoad?: number) {
  const pageSize = 1000;
  let allData: any[] = [];
  let page = 0;
  let hasMore = true;

  // Calculate date limit if weeksToLoad is specified
  let limitDate: Date | null = null;
  if (weeksToLoad !== undefined) {
    limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - (weeksToLoad * 7));
  }

  while (hasMore) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    
    let query = supabase
      .from("rix_runs")
      .select("*")
      .order("batch_execution_date", { ascending: false })
      .order("09_rix_score", { ascending: false });
    
    // Apply date filter if limit is set
    if (limitDate) {
      query = query.gte("batch_execution_date", limitDate.toISOString());
    }
    
    const { data, error } = await query.range(start, end);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`📦 Loaded ${allData.length} total rix_runs records across ${page} pages ${weeksToLoad ? `(last ${weeksToLoad} weeks)` : '(all history)'}`);
  return allData;
}

export function useRixRuns(
  searchQuery?: string, 
  modelFilter?: string, 
  companyFilter?: string,
  sectorFilter?: string,
  ibexFamilyFilter?: string,
  weeksToLoad: number = 6 // Cargar últimas 6 semanas para asegurar comparación estable
) {
  return useQuery({
    queryKey: ["rix-runs", searchQuery, modelFilter, companyFilter, sectorFilter, ibexFamilyFilter, weeksToLoad],
    queryFn: async () => {
      // Fetch rix_runs data with optional week limit for performance
      // Fetch records with optional week limit (pagination handled inside)
      const rixData = await fetchAllRixRuns(weeksToLoad);

      if (!rixData) {
        throw new Error("No data returned from fetchAllRixRuns");
      }

      // Get repindex data to join with rix_runs
      const { data: repindexData, error: repindexError } = await supabase
        .from("repindex_root_issuers")
        .select("ticker, ibex_family_code, sector_category");

      if (repindexError) {
        console.error("Error fetching repindex data:", repindexError);
        // Continue without repindex data if error
      }

      // Create a map for quick lookup
      const repindexMap = new Map();
      if (repindexData) {
        repindexData.forEach(item => {
          repindexMap.set(item.ticker, {
            ticker: item.ticker,
            ibex_family_code: item.ibex_family_code,
            sector_category: item.sector_category
          });
        });
      }

      // Group runs by batch_execution_date and assign batch numbers
      // Group runs by batch_execution_date (already normalized to Sunday in DB)
      const batchMap = new Map<string, { number: number; executionDate: Date }>();
      const executionDates = new Set<string>();
      
      rixData?.forEach(run => {
        if (run.batch_execution_date) {
          const batchDate = new Date(run.batch_execution_date);
          const executionKey = format(batchDate, 'yyyy-MM-dd');
          executionDates.add(executionKey);
        }
      });
      
      // Sort execution dates chronologically (ascending - oldest first) and assign batch numbers
      // This way the most recent batch gets the highest number
      let batchCounter = 1;
      const sortedDateKeys = Array.from(executionDates).sort((a, b) => a.localeCompare(b)); // Sort ascending (oldest first)
      
      sortedDateKeys.forEach(dateKey => {
        const [year, month, day] = dateKey.split('-').map(Number);
        const executionDate = new Date(Date.UTC(year, month - 1, day));
        
        batchMap.set(dateKey, {
          number: batchCounter++,
          executionDate
        });
      });
      
      // Debug logging
      console.log('🔍 Batch Map Created:', {
        totalBatches: batchMap.size,
        batches: Array.from(batchMap.entries()).map(([key, val]) => ({
          date: key,
          batchNumber: val.number,
          recordCount: rixData?.filter(r => {
            if (!r.batch_execution_date) return false;
            const batchDate = new Date(r.batch_execution_date);
            return format(batchDate, 'yyyy-MM-dd') === key;
          }).length
        }))
      });

      // Sort batches chronologically for trend calculation
      const sortedBatches = Array.from(batchMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0])); // Sort chronologically (oldest first)

      // Precompute, for every batch, the most recent record per ticker+model
      // This lets us find the latest AVAILABLE previous batch, even if a given
      // company/model is missing in the immediately preceding week.
      const batchTickerModelMaps = new Map<string, Map<string, typeof rixData[0]>>();

      sortedBatches.forEach(([batchKey]) => {
        const previousBatchData = rixData?.filter(r => {
          if (!r.batch_execution_date) return false;
          const batchDate = new Date(r.batch_execution_date);
          return format(batchDate, 'yyyy-MM-dd') === batchKey;
        }) || [];

        const prevBatchMap = new Map<string, typeof rixData[0]>();
        previousBatchData.forEach(run => {
          if (!run["05_ticker"] || !run["02_model_name"]) return;
          const key = `${run["05_ticker"]}_${run["02_model_name"]}`;
          const existing = prevBatchMap.get(key);
          if (!existing || new Date(run.created_at) > new Date(existing.created_at)) {
            prevBatchMap.set(key, run);
          }
        });

        batchTickerModelMaps.set(batchKey, prevBatchMap);
      });

      // Build a map of deduplicated records (most recent for each ticker/model/batch combination)
      const batchRecordsMap = new Map<string, typeof rixData[0]>();
      
      rixData?.forEach(run => {
        if (!run["05_ticker"] || !run["02_model_name"] || !run.batch_execution_date) return;
        
        const batchDate = new Date(run.batch_execution_date);
        const executionKey = format(batchDate, 'yyyy-MM-dd');
        const mapKey = `${run["05_ticker"]}_${run["02_model_name"]}_${executionKey}`;
        
        // Keep the record with the most recent created_at timestamp
        const existing = batchRecordsMap.get(mapKey);
        if (!existing || new Date(run.created_at) > new Date(existing.created_at)) {
          batchRecordsMap.set(mapKey, run);
        }
      });

      // CRITICAL: Process only the deduplicated records (from batchRecordsMap)
      // This ensures every record has proper trend calculation
      const joinedData = Array.from(batchRecordsMap.values()).map(rixRun => {
        const isRmmZero = rixRun["32_rmm_score"] === 0;
        const cxmExcluded = rixRun["52_cxm_excluded"] === true;
        const adjustedScore = rixRun["51_rix_score_adjusted"];
        
        // Use adjusted score if CXM was excluded, otherwise use original
        const displayRixScore = cxmExcluded && adjustedScore !== null && adjustedScore !== undefined
          ? adjustedScore
          : rixRun["09_rix_score"];
        
        // Calculate batch information from batch_execution_date (already normalized to Sunday in DB)
        let executionKey: string | undefined;
        let batchNum: number | undefined;
        let batchLabel: string | undefined;
        
        if (rixRun.batch_execution_date) {
          const batchDate = new Date(rixRun.batch_execution_date);
          executionKey = format(batchDate, 'yyyy-MM-dd');
          const batch = batchMap.get(executionKey);
          batchNum = batch?.number;
          batchLabel = batch
            ? `Semana del ${format(batch.executionDate, 'd MMM yyyy')}`
            : undefined;
        }
        
        // Calculate trend for RIX score by comparing with the most recent
        // AVAILABLE previous batch that has data for this ticker+model
        let trend: 'up' | 'down' | 'stable' | undefined;
        let previousRixScore: number | undefined;
        let previousRunForTrends: typeof rixData[0] | undefined;
        
        if (rixRun["05_ticker"] && rixRun["02_model_name"] && executionKey && rixRun["09_rix_score"] !== null && rixRun["09_rix_score"] !== undefined) {
          const currentBatchIndex = sortedBatches.findIndex(([key]) => key === executionKey);
          const tickerModelKey = `${rixRun["05_ticker"]}_${rixRun["02_model_name"]}`;
          
          if (currentBatchIndex > 0) {
            // Walk backwards through batches until we find the nearest previous
            // batch that actually has a record for this ticker+model.
            for (let i = currentBatchIndex - 1; i >= 0; i--) {
              const previousBatchKey = sortedBatches[i][0];
              const prevBatchMap = batchTickerModelMaps.get(previousBatchKey);
              const prevRun = prevBatchMap?.get(tickerModelKey);
              
              if (prevRun) {
                previousRunForTrends = prevRun;
                previousRixScore = prevRun["09_rix_score"];
                break;
              }
            }
            
            // Compare with current score using the last available previous run
            if (previousRixScore !== undefined) {
              const delta = rixRun["09_rix_score"] - previousRixScore;
              if (delta > 0) {
                trend = 'up';
              } else if (delta < 0) {
                trend = 'down';
              } else {
                trend = 'stable';
              }
            }
          }
        }
        
        // Calculate trends for all 8 metrics using the same previous run
        let metricTrends: RixRun['metricTrends'] = {};
        
        if (rixRun["05_ticker"] && rixRun["02_model_name"] && executionKey) {
          const currentBatchIndex = sortedBatches.findIndex(([key]) => key === executionKey);
          const tickerModelKey = `${rixRun["05_ticker"]}_${rixRun["02_model_name"]}`;
          
          if (currentBatchIndex > 0) {
            // If we didn't already resolve the previous run above, look it up now
            if (!previousRunForTrends) {
              for (let i = currentBatchIndex - 1; i >= 0; i--) {
                const previousBatchKey = sortedBatches[i][0];
                const prevBatchMap = batchTickerModelMaps.get(previousBatchKey);
                const prevRun = prevBatchMap?.get(tickerModelKey);
                if (prevRun) {
                  previousRunForTrends = prevRun;
                  break;
                }
              }
            }
            
            const prevRun = previousRunForTrends;
            
            if (prevRun) {
              const metricsToCompare = [
                { key: 'nvm', current: rixRun["23_nvm_score"], previous: prevRun["23_nvm_score"] },
                { key: 'drm', current: rixRun["26_drm_score"], previous: prevRun["26_drm_score"] },
                { key: 'sim', current: rixRun["29_sim_score"], previous: prevRun["29_sim_score"] },
                { key: 'rmm', current: rixRun["32_rmm_score"], previous: prevRun["32_rmm_score"] },
                { key: 'cem', current: rixRun["35_cem_score"], previous: prevRun["35_cem_score"] },
                { key: 'gam', current: rixRun["38_gam_score"], previous: prevRun["38_gam_score"] },
                { key: 'dcm', current: rixRun["41_dcm_score"], previous: prevRun["41_dcm_score"] },
                { key: 'cxm', current: rixRun["44_cxm_score"], previous: prevRun["44_cxm_score"] },
              ];
              
              metricsToCompare.forEach(({ key, current, previous }) => {
                if (current !== null && current !== undefined && 
                    previous !== null && previous !== undefined) {
                  const delta = current - previous;
                  if (delta > 0) {
                    metricTrends[key] = 'up';
                  } else if (delta < 0) {
                    metricTrends[key] = 'down';
                  } else {
                    metricTrends[key] = 'stable';
                  }
                }
              });
            }
          }
        }
        
        return {
          ...rixRun,
          repindex_root_issuers: rixRun["05_ticker"] ? 
            repindexMap.get(rixRun["05_ticker"]) || null : 
            null,
          isDataInvalid: isRmmZero,
          dataInvalidReason: isRmmZero ? "Sin información reciente disponible (RMM=0)" : undefined,
          displayRixScore,
          batchNumber: batchNum,
          batchLabel,
          trend,
          previousRixScore,
          metricTrends
        };
      });

      // Final summary with trend statistics
      const recordsWithTrend = joinedData.filter(r => r.trend !== undefined).length;
      const recordsWithoutTrend = joinedData.length - recordsWithTrend;
      
      console.log('📈 FINAL Trend Summary:', {
        batchesFound: batchMap.size,
        sortedBatchKeys: sortedBatches.map(([key]) => key),
        totalProcessed: joinedData.length,
        withTrend: recordsWithTrend,
        withoutTrend: recordsWithoutTrend,
        percentageWithTrend: ((recordsWithTrend / joinedData.length) * 100).toFixed(1) + '%',
        samplesWithTrend: joinedData.filter(r => r.trend).slice(0, 3).map(r => ({
          ticker: r["05_ticker"],
          model: r["02_model_name"],
          trend: r.trend,
          score: r["09_rix_score"]
        })),
        samplesWithoutTrend: joinedData.filter(r => !r.trend).slice(0, 5).map(r => ({
          ticker: r["05_ticker"],
          company: r["03_target_name"],
          model: r["02_model_name"],
          batch: r.batchLabel,
          batchDate: r.batch_execution_date
        })),
        // Check specific companies mentioned by user
        specificCompanies: ['Metrovacesa', 'Arteche', 'Renta 4 Banco', 'Netex Learning'].map(name => {
          const records = joinedData.filter(r => r["03_target_name"] === name);
          return {
            name,
            recordCount: records.length,
            withTrend: records.filter(r => r.trend).length,
            withoutTrend: records.filter(r => !r.trend).length,
            samples: records.slice(0, 2).map(r => ({
              model: r["02_model_name"],
              hasTrend: !!r.trend,
              trend: r.trend
            }))
          };
        })
      });
      
      // Apply ALL filters AFTER trend calculation
      let filteredData = joinedData;
      
      if (searchQuery) {
        filteredData = filteredData?.filter(rixRun =>
          rixRun["03_target_name"]?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      
      if (modelFilter && modelFilter !== "all") {
        filteredData = filteredData?.filter(rixRun => 
          rixRun["02_model_name"] === modelFilter
        );
      }
      
      if (companyFilter && companyFilter !== "all") {
        filteredData = filteredData?.filter(rixRun => 
          rixRun["03_target_name"] === companyFilter
        );
      }
      
      if (sectorFilter && sectorFilter !== "all") {
        filteredData = filteredData?.filter(rixRun => 
          rixRun.repindex_root_issuers?.sector_category === sectorFilter
        );
      }

      if (ibexFamilyFilter && ibexFamilyFilter !== "all") {
        filteredData = filteredData?.filter(rixRun => 
          rixRun.repindex_root_issuers?.ibex_family_code === ibexFamilyFilter
        );
      }

      return filteredData as RixRun[];
    },
    enabled: true,
    staleTime: 10 * 60 * 1000, // 10 minutes - caché agresivo para últimas 2 semanas
    gcTime: 30 * 60 * 1000, // 30 minutes - mantener en memoria
    refetchOnWindowFocus: false, // No recargar al cambiar de pestaña
  });
}

export function useRixRun(id: string) {
  return useQuery({
    queryKey: ["rix-run", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rix_runs")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("RIX run not found");
      }

      // Get repindex data to join with rix_run and add validation flags
      const isRmmZero = data["32_rmm_score"] === 0;
      const cxmExcluded = data["52_cxm_excluded"] === true;
      const adjustedScore = data["51_rix_score_adjusted"];
      
      // Use adjusted score if CXM was excluded, otherwise use original
      const displayRixScore = cxmExcluded && adjustedScore !== null && adjustedScore !== undefined
        ? adjustedScore
        : data["09_rix_score"];
      
      // Calculate batch information from batch_execution_date
      let batchNumber: number | undefined;
      let batchLabel: string | undefined;
      
      if (data.batch_execution_date) {
        const batchDate = new Date(data.batch_execution_date);
        const executionKey = format(batchDate, 'yyyy-MM-dd');
        
        // Get all unique batch_execution_dates to calculate batch number
        const { data: allRuns } = await supabase
          .from("rix_runs")
          .select("batch_execution_date")
          .order('batch_execution_date', { ascending: false }); // Newest first
        
        const executionDates = new Set<string>();
        allRuns?.forEach(run => {
          if (run.batch_execution_date) {
            const runBatchDate = new Date(run.batch_execution_date);
            const runKey = format(runBatchDate, 'yyyy-MM-dd');
            executionDates.add(runKey);
          }
        });
        
        const sortedDates = Array.from(executionDates).sort((a, b) => b.localeCompare(a)); // Descending
        batchNumber = sortedDates.indexOf(executionKey) + 1;
        
        const [year, month, day] = executionKey.split('-').map(Number);
        const executionDate = new Date(Date.UTC(year, month - 1, day));
        batchLabel = `Semana del ${format(executionDate, 'd MMM yyyy')}`;
      }
      
      if (data["05_ticker"]) {
        const { data: repindexData, error: repindexError } = await supabase
          .from("repindex_root_issuers")
          .select("ticker, ibex_family_code, sector_category")
          .eq("ticker", data["05_ticker"])
          .maybeSingle();

        if (!repindexError && repindexData) {
          return {
            ...data,
            repindex_root_issuers: {
              ticker: repindexData.ticker,
              ibex_family_code: repindexData.ibex_family_code,
              sector_category: repindexData.sector_category
            },
            isDataInvalid: isRmmZero,
            dataInvalidReason: isRmmZero ? "Sin información reciente disponible (RMM=0)" : undefined,
            displayRixScore,
            batchNumber,
            batchLabel
          } as RixRun;
        }
      }

      return { 
        ...data, 
        repindex_root_issuers: null,
        isDataInvalid: isRmmZero,
        dataInvalidReason: isRmmZero ? "Sin información reciente disponible (RMM=0)" : undefined,
        displayRixScore,
        batchNumber,
        batchLabel
      } as RixRun;
    },
    enabled: !!id,
  });
}
