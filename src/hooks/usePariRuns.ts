import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PariRun {
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
  "09_pari_score"?: number;
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
  "23_lns_score"?: number;
  "24_lns_peso"?: number;
  "25_lns_categoria"?: string;
  "26_es_score"?: number;
  "27_es_peso"?: number;
  "28_es_categoria"?: string;
  "29_sam_score"?: number;
  "30_sam_peso"?: number;
  "31_sam_categoria"?: string;
  "32_rm_score"?: number;
  "33_rm_peso"?: number;
  "34_rm_categoria"?: string;
  "35_clr_score"?: number;
  "36_clr_peso"?: number;
  "37_clr_categoria"?: string;
  "38_gip_score"?: number;
  "39_gip_peso"?: number;
  "40_gip_categoria"?: string;
  "41_kgi_score"?: number;
  "42_kgi_peso"?: number;
  "43_kgi_categoria"?: string;
  "44_mpi_score"?: number;
  "45_mpi_peso"?: number;
  "46_mpi_categoria"?: string;
  "47_fase"?: string;
  "51_pari_score_adjusted"?: number;
  "52_mpi_excluded"?: boolean;
  // Computed validation flags
  isDataInvalid?: boolean;
  dataInvalidReason?: string;
  displayPariScore?: number; // Computed: adjusted score if MPI excluded, otherwise original
  repindex_root_issuers?: {
    ticker?: string;
    ibex_family_code?: string;
    sector_category?: string;
  } | null;
}

export function usePariRuns(
  searchQuery?: string, 
  modelFilter?: string, 
  companyFilter?: string,
  weekFilter?: string,
  sectorFilter?: string,
  ibexFamilyFilter?: string
) {
  return useQuery({
    queryKey: ["pari-runs", searchQuery, modelFilter, companyFilter, weekFilter, sectorFilter, ibexFamilyFilter],
    queryFn: async () => {
      // First get pari_runs data
      let pariQuery = supabase
        .from("pari_runs")
        .select("*")
        .order("09_pari_score", { ascending: false })
        .order("created_at", { ascending: false });

      if (searchQuery) {
        pariQuery = pariQuery.ilike("03_target_name", `%${searchQuery}%`);
      }

      if (modelFilter && modelFilter !== "all") {
        pariQuery = pariQuery.eq("02_model_name", modelFilter);
      }

      if (companyFilter && companyFilter !== "all") {
        pariQuery = pariQuery.eq("03_target_name", companyFilter);
      }

      if (weekFilter && weekFilter !== "all") {
        // Filter by week range (assuming weekFilter is in format "YYYY-MM-DD")
        const weekStart = new Date(weekFilter);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6); // Add 6 days for a week
        
        pariQuery = pariQuery.gte("06_period_from", weekStart.toISOString().split('T')[0])
                            .lte("07_period_to", weekEnd.toISOString().split('T')[0]);
      }

      const { data: pariData, error: pariError } = await pariQuery;

      if (pariError) {
        throw pariError;
      }

      // Get repindex data to join with pari_runs
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

      // Join the data and add validation flags
      const joinedData = pariData?.map(pariRun => {
        const isRmZero = pariRun["32_rm_score"] === 0;
        const mpiExcluded = pariRun["52_mpi_excluded"] === true;
        const adjustedScore = pariRun["51_pari_score_adjusted"];
        
        // Use adjusted score if MPI was excluded, otherwise use original
        const displayPariScore = mpiExcluded && adjustedScore !== null && adjustedScore !== undefined
          ? adjustedScore
          : pariRun["09_pari_score"];
        
        return {
          ...pariRun,
          repindex_root_issuers: pariRun["05_ticker"] ? 
            repindexMap.get(pariRun["05_ticker"]) || null : 
            null,
          isDataInvalid: isRmZero,
          dataInvalidReason: isRmZero ? "Sin información reciente disponible (RM=0)" : undefined,
          displayPariScore
        };
      });

      // Apply sector filter after joining the data
      let filteredData = joinedData;
      if (sectorFilter && sectorFilter !== "all") {
        filteredData = joinedData?.filter(pariRun => 
          pariRun.repindex_root_issuers?.sector_category === sectorFilter
        );
      }

      // Apply ibex family filter
      if (ibexFamilyFilter && ibexFamilyFilter !== "all") {
        filteredData = filteredData?.filter(pariRun => 
          pariRun.repindex_root_issuers?.ibex_family_code === ibexFamilyFilter
        );
      }

      return filteredData as PariRun[];
    },
    enabled: true,
  });
}

export function usePariRun(id: string) {
  return useQuery({
    queryKey: ["pari-run", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pari_runs")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("PARI run not found");
      }

      // Get repindex data to join with pari_run and add validation flags
      const isRmZero = data["32_rm_score"] === 0;
      const mpiExcluded = data["52_mpi_excluded"] === true;
      const adjustedScore = data["51_pari_score_adjusted"];
      
      // Use adjusted score if MPI was excluded, otherwise use original
      const displayPariScore = mpiExcluded && adjustedScore !== null && adjustedScore !== undefined
        ? adjustedScore
        : data["09_pari_score"];
      
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
            isDataInvalid: isRmZero,
            dataInvalidReason: isRmZero ? "Sin información reciente disponible (RM=0)" : undefined,
            displayPariScore
          } as PariRun;
        }
      }

      return { 
        ...data, 
        repindex_root_issuers: null,
        isDataInvalid: isRmZero,
        dataInvalidReason: isRmZero ? "Sin información reciente disponible (RM=0)" : undefined,
        displayPariScore
      } as PariRun;
    },
    enabled: !!id,
  });
}