import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RixRunV2 {
  id: string;
  run_id: string;
  model_name: string | null;
  target_name: string | null;
  target_type: string | null;
  ticker: string | null;
  period_from: string | null;
  period_to: string | null;
  rix_score: number | null;
  rix_score_adjusted: number | null;
  resumen: string | null;
  puntos_clave: string[] | null;
  
  // Subscores
  nvm_score: number | null;
  nvm_peso: number | null;
  nvm_categoria: string | null;
  drm_score: number | null;
  drm_peso: number | null;
  drm_categoria: string | null;
  sim_score: number | null;
  sim_peso: number | null;
  sim_categoria: string | null;
  rmm_score: number | null;
  rmm_peso: number | null;
  rmm_categoria: string | null;
  cem_score: number | null;
  cem_peso: number | null;
  cem_categoria: string | null;
  gam_score: number | null;
  gam_peso: number | null;
  gam_categoria: string | null;
  dcm_score: number | null;
  dcm_peso: number | null;
  dcm_categoria: string | null;
  cxm_score: number | null;
  cxm_peso: number | null;
  cxm_categoria: string | null;
  cxm_excluded: boolean | null;
  
  // Raw responses
  res_gpt_bruto: string | null;
  res_perplex_bruto: string | null;
  res_gemini_bruto: string | null;
  res_deepseek_bruto: string | null;
  respuesta_bruto_claude: string | null;
  respuesta_bruto_grok: string | null;
  respuesta_bruto_qwen: string | null;
  
  // Explanations
  explicacion: string | null;
  explicaciones_detalladas: string[] | null;
  
  // Metadata
  flags: string[] | null;
  palabras: number | null;
  num_fechas: number | null;
  num_citas: number | null;
  temporal_alignment: number | null;
  citation_density: number | null;
  source_pipeline: string;
  execution_time_ms: number | null;
  model_errors: Record<string, string> | null;
  search_completed_at: string | null;
  analysis_completed_at: string | null;
  batch_execution_date: string;
  created_at: string;
  updated_at: string;
  
  // Price data
  precio_accion: number | null;
  precio_minimo_52_semanas: number | null;
  reputacion_vs_precio: string | null;
  
  // Joined issuer data
  repindex_root_issuers?: {
    ticker: string;
    issuer_name: string;
    sector_category: string | null;
    ibex_family_code: string | null;
    cotiza_en_bolsa?: boolean;
  } | null;
  
  // Computed fields
  displayRixScore?: number | null;
  isDataInvalid?: boolean;
  batchNumber?: number;
  batchLabel?: string;
}

interface UseRixRunsV2Options {
  sourcePipeline?: 'make_original' | 'lovable_v2' | 'all';
  ticker?: string;
  modelFilter?: string;
  companyFilter?: string;
  sectorFilter?: string;
  ibexFamilyFilter?: string;
  limit?: number;
}

function mapRowToRixRunV2(row: any): RixRunV2 {
  const rixScore = row['09_rix_score'];
  const rixScoreAdjusted = row['51_rix_score_adjusted'];
  const cxmExcluded = row['52_cxm_excluded'];
  const rmmScore = row['32_rmm_score'];
  
  // Data is invalid if RMM is 0 or null (same logic as original)
  const isDataInvalid = rmmScore === 0 || rmmScore === null;
  
  // Use adjusted score if CXM is excluded, otherwise use base score
  const displayRixScore = cxmExcluded ? rixScoreAdjusted : rixScore;
  
  // Calculate batch number from batch_execution_date
  const batchDate = row.batch_execution_date ? new Date(row.batch_execution_date) : null;
  let batchNumber: number | undefined;
  let batchLabel: string | undefined;
  
  if (batchDate) {
    // Week number calculation (ISO week)
    const startOfYear = new Date(batchDate.getFullYear(), 0, 1);
    const days = Math.floor((batchDate.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    batchNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    batchLabel = `Semana ${batchNumber} (${batchDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })})`;
  }

  return {
    id: row.id,
    run_id: row['01_run_id'],
    model_name: row['02_model_name'],
    target_name: row['03_target_name'],
    target_type: row['04_target_type'],
    ticker: row['05_ticker'],
    period_from: row['06_period_from'],
    period_to: row['07_period_to'],
    rix_score: rixScore,
    rix_score_adjusted: rixScoreAdjusted,
    resumen: row['10_resumen'],
    puntos_clave: (row['11_puntos_clave'] as string[] | null),
    nvm_score: row['23_nvm_score'],
    nvm_peso: row['24_nvm_peso'],
    nvm_categoria: row['25_nvm_categoria'],
    drm_score: row['26_drm_score'],
    drm_peso: row['27_drm_peso'],
    drm_categoria: row['28_drm_categoria'],
    sim_score: row['29_sim_score'],
    sim_peso: row['30_sim_peso'],
    sim_categoria: row['31_sim_categoria'],
    rmm_score: row['32_rmm_score'],
    rmm_peso: row['33_rmm_peso'],
    rmm_categoria: row['34_rmm_categoria'],
    cem_score: row['35_cem_score'],
    cem_peso: row['36_cem_peso'],
    cem_categoria: row['37_cem_categoria'],
    gam_score: row['38_gam_score'],
    gam_peso: row['39_gam_peso'],
    gam_categoria: row['40_gam_categoria'],
    dcm_score: row['41_dcm_score'],
    dcm_peso: row['42_dcm_peso'],
    dcm_categoria: row['43_dcm_categoria'],
    cxm_score: row['44_cxm_score'],
    cxm_peso: row['45_cxm_peso'],
    cxm_categoria: row['46_cxm_categoria'],
    cxm_excluded: cxmExcluded,
    res_gpt_bruto: row['20_res_gpt_bruto'],
    res_perplex_bruto: row['21_res_perplex_bruto'],
    res_gemini_bruto: row['22_res_gemini_bruto'],
    res_deepseek_bruto: row['23_res_deepseek_bruto'],
    respuesta_bruto_claude: row.respuesta_bruto_claude,
    respuesta_bruto_grok: row.respuesta_bruto_grok,
    respuesta_bruto_qwen: row.respuesta_bruto_qwen,
    explicacion: row['22_explicacion'],
    explicaciones_detalladas: (row['25_explicaciones_detalladas'] as string[] | null),
    flags: (row['17_flags'] as string[] | null),
    palabras: row['12_palabras'],
    num_fechas: row['13_num_fechas'],
    num_citas: row['14_num_citas'],
    temporal_alignment: row['15_temporal_alignment'],
    citation_density: row['16_citation_density'],
    source_pipeline: row.source_pipeline,
    execution_time_ms: row.execution_time_ms,
    model_errors: (row.model_errors as Record<string, string> | null),
    search_completed_at: row.search_completed_at,
    analysis_completed_at: row.analysis_completed_at,
    batch_execution_date: row.batch_execution_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    precio_accion: row['48_precio_accion'],
    precio_minimo_52_semanas: row['59_precio_minimo_52_semanas'],
    reputacion_vs_precio: row['49_reputacion_vs_precio'],
    repindex_root_issuers: row.repindex_root_issuers,
    displayRixScore,
    isDataInvalid,
    batchNumber,
    batchLabel,
  };
}

export function useRixRunsV2(options: UseRixRunsV2Options = {}) {
  const { 
    sourcePipeline = 'all', 
    ticker, 
    modelFilter = 'all',
    companyFilter = 'all',
    sectorFilter = 'all',
    ibexFamilyFilter = 'all',
    limit = 500 
  } = options;

  return useQuery({
    queryKey: ['rix-runs-v2', sourcePipeline, ticker, modelFilter, companyFilter, sectorFilter, ibexFamilyFilter, limit],
    queryFn: async (): Promise<RixRunV2[]> => {
      // Fetch rix_runs_v2
      let query = supabase
        .from('rix_runs_v2')
        .select('*')
        .order('batch_execution_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (sourcePipeline !== 'all') {
        query = query.eq('source_pipeline', sourcePipeline);
      }

      if (ticker) {
        query = query.eq('05_ticker', ticker);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching rix_runs_v2:', error);
        throw error;
      }

      // Fetch issuers separately for manual join
      const { data: issuers } = await supabase
        .from('repindex_root_issuers')
        .select('ticker, issuer_name, sector_category, ibex_family_code, cotiza_en_bolsa');
      
      // Create a map for quick lookup
      const issuerMap = new Map(
        (issuers || []).map(i => [i.ticker, i])
      );

      // Map and filter data with manual issuer join
      let runs = (data || []).map(row => {
        const issuer = issuerMap.get(row['05_ticker']);
        return mapRowToRixRunV2({ ...row, repindex_root_issuers: issuer || null });
      });
      
      // Apply model filter
      if (modelFilter !== 'all') {
        runs = runs.filter(run => {
          const modelName = run.model_name?.toLowerCase() || '';
          const filterLower = modelFilter.toLowerCase();
          return modelName.includes(filterLower);
        });
      }
      
      // Apply company filter
      if (companyFilter !== 'all') {
        runs = runs.filter(run => run.target_name === companyFilter);
      }
      
      // Apply sector filter
      if (sectorFilter !== 'all') {
        runs = runs.filter(run => run.repindex_root_issuers?.sector_category === sectorFilter);
      }
      
      // Apply ibex family filter
      if (ibexFamilyFilter !== 'all') {
        if (ibexFamilyFilter === 'no_cotizadas') {
          runs = runs.filter(run => !run.repindex_root_issuers?.ibex_family_code);
        } else {
          runs = runs.filter(run => run.repindex_root_issuers?.ibex_family_code === ibexFamilyFilter);
        }
      }

      return runs;
    },
  });
}

export function useRixRunV2(id: string | undefined) {
  return useQuery({
    queryKey: ['rix-run-v2', id],
    queryFn: async (): Promise<RixRunV2 | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('rix_runs_v2')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching rix_run_v2:', error);
        throw error;
      }

      if (!data) return null;

      // Fetch issuer data separately
      let issuer = null;
      if (data['05_ticker']) {
        const { data: issuerData } = await supabase
          .from('repindex_root_issuers')
          .select('ticker, issuer_name, sector_category, ibex_family_code, cotiza_en_bolsa')
          .eq('ticker', data['05_ticker'])
          .single();
        issuer = issuerData;
      }

      return mapRowToRixRunV2({ ...data, repindex_root_issuers: issuer });
    },
    enabled: !!id,
  });
}
