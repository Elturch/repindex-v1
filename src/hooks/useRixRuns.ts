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
  // Computed validation flags
  isDataInvalid?: boolean;
  dataInvalidReason?: string;
  displayRixScore?: number; // Computed: adjusted score if CXM excluded, otherwise original
  batchNumber?: number; // Sequential batch number
  batchLabel?: string; // Formatted label like "Consulta #1: 12/10 - 19/10"
  repindex_root_issuers?: {
    ticker?: string;
    ibex_family_code?: string;
    sector_category?: string;
  } | null;
}

export function useRixRuns(
  searchQuery?: string, 
  modelFilter?: string, 
  companyFilter?: string,
  sectorFilter?: string,
  ibexFamilyFilter?: string
) {
  return useQuery({
    queryKey: ["rix-runs", searchQuery, modelFilter, companyFilter, sectorFilter, ibexFamilyFilter],
    queryFn: async () => {
      // First get rix_runs data
      let rixQuery = supabase
        .from("rix_runs")
        .select("*")
        .order("09_rix_score", { ascending: false })
        .order("created_at", { ascending: false });

      if (searchQuery) {
        rixQuery = rixQuery.ilike("03_target_name", `%${searchQuery}%`);
      }

      if (modelFilter && modelFilter !== "all") {
        rixQuery = rixQuery.eq("02_model_name", modelFilter);
      }

      if (companyFilter && companyFilter !== "all") {
        rixQuery = rixQuery.eq("03_target_name", companyFilter);
      }

      const { data: rixData, error: rixError } = await rixQuery;

      if (rixError) {
        throw rixError;
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
      const batchMap = new Map<string, { number: number; executionDate: Date }>();
      const executionDates = new Set<string>();
      
      rixData?.forEach(run => {
        if (run.batch_execution_date) {
          const batchDate = new Date(run.batch_execution_date);
          const executionKey = format(batchDate, 'yyyy-MM-dd');
          executionDates.add(executionKey);
        }
      });
      
      // Sort execution dates chronologically (descending - newest first) and assign batch numbers
      let batchCounter = 1;
      Array.from(executionDates)
        .sort((a, b) => b.localeCompare(a)) // Sort descending
        .forEach(dateKey => {
          const [year, month, day] = dateKey.split('-').map(Number);
          const executionDate = new Date(Date.UTC(year, month - 1, day));
          
          batchMap.set(dateKey, {
            number: batchCounter++,
            executionDate
          });
        });

      // Join the data and add validation flags + batch info
      const joinedData = rixData?.map(rixRun => {
        const isRmmZero = rixRun["32_rmm_score"] === 0;
        const cxmExcluded = rixRun["52_cxm_excluded"] === true;
        const adjustedScore = rixRun["51_rix_score_adjusted"];
        
        // Use adjusted score if CXM was excluded, otherwise use original
        const displayRixScore = cxmExcluded && adjustedScore !== null && adjustedScore !== undefined
          ? adjustedScore
          : rixRun["09_rix_score"];
        
        // Calculate batch information from batch_execution_date
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
        
        return {
          ...rixRun,
          repindex_root_issuers: rixRun["05_ticker"] ? 
            repindexMap.get(rixRun["05_ticker"]) || null : 
            null,
          isDataInvalid: isRmmZero,
          dataInvalidReason: isRmmZero ? "Sin información reciente disponible (RMM=0)" : undefined,
          displayRixScore,
          batchNumber: batchNum,
          batchLabel
        };
      });

      // Apply sector filter after joining the data
      let filteredData = joinedData;
      if (sectorFilter && sectorFilter !== "all") {
        filteredData = joinedData?.filter(rixRun => 
          rixRun.repindex_root_issuers?.sector_category === sectorFilter
        );
      }

      // Apply ibex family filter
      if (ibexFamilyFilter && ibexFamilyFilter !== "all") {
        filteredData = filteredData?.filter(rixRun => 
          rixRun.repindex_root_issuers?.ibex_family_code === ibexFamilyFilter
        );
      }

      return filteredData as RixRun[];
    },
    enabled: true,
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
