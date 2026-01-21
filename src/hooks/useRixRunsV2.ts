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
  
  // Metadata
  flags: string[] | null;
  palabras: number | null;
  num_fechas: number | null;
  num_citas: number | null;
  source_pipeline: string;
  execution_time_ms: number | null;
  model_errors: Record<string, string> | null;
  search_completed_at: string | null;
  analysis_completed_at: string | null;
  batch_execution_date: string;
  created_at: string;
  updated_at: string;
}

interface UseRixRunsV2Options {
  sourcePipeline?: 'make_original' | 'lovable_v2' | 'all';
  ticker?: string;
  limit?: number;
}

export function useRixRunsV2(options: UseRixRunsV2Options = {}) {
  const { sourcePipeline = 'all', ticker, limit = 100 } = options;

  return useQuery({
    queryKey: ['rix-runs-v2', sourcePipeline, ticker, limit],
    queryFn: async (): Promise<RixRunV2[]> => {
      let query = supabase
        .from('rix_runs_v2')
        .select('*')
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

      // Map database column names to interface
      return (data || []).map((row: any) => ({
        id: row.id,
        run_id: row['01_run_id'],
        model_name: row['02_model_name'],
        target_name: row['03_target_name'],
        target_type: row['04_target_type'],
        ticker: row['05_ticker'],
        period_from: row['06_period_from'],
        period_to: row['07_period_to'],
        rix_score: row['09_rix_score'],
        rix_score_adjusted: row['51_rix_score_adjusted'],
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
        cxm_excluded: row['52_cxm_excluded'],
        res_gpt_bruto: row['20_res_gpt_bruto'],
        res_perplex_bruto: row['21_res_perplex_bruto'],
        res_gemini_bruto: row['22_res_gemini_bruto'],
        res_deepseek_bruto: row['23_res_deepseek_bruto'],
        respuesta_bruto_claude: row.respuesta_bruto_claude,
        respuesta_bruto_grok: row.respuesta_bruto_grok,
        respuesta_bruto_qwen: row.respuesta_bruto_qwen,
        flags: (row['17_flags'] as string[] | null),
        palabras: row['12_palabras'],
        num_fechas: row['13_num_fechas'],
        num_citas: row['14_num_citas'],
        source_pipeline: row.source_pipeline,
        execution_time_ms: row.execution_time_ms,
        model_errors: (row.model_errors as Record<string, string> | null),
        search_completed_at: row.search_completed_at,
        analysis_completed_at: row.analysis_completed_at,
        batch_execution_date: row.batch_execution_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
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

      // Map database column names to interface
      return {
        id: data.id,
        run_id: data['01_run_id'],
        model_name: data['02_model_name'],
        target_name: data['03_target_name'],
        target_type: data['04_target_type'],
        ticker: data['05_ticker'],
        period_from: data['06_period_from'],
        period_to: data['07_period_to'],
        rix_score: data['09_rix_score'],
        rix_score_adjusted: data['51_rix_score_adjusted'],
        resumen: data['10_resumen'],
        puntos_clave: (data['11_puntos_clave'] as string[] | null),
        nvm_score: data['23_nvm_score'],
        nvm_peso: data['24_nvm_peso'],
        nvm_categoria: data['25_nvm_categoria'],
        drm_score: data['26_drm_score'],
        drm_peso: data['27_drm_peso'],
        drm_categoria: data['28_drm_categoria'],
        sim_score: data['29_sim_score'],
        sim_peso: data['30_sim_peso'],
        sim_categoria: data['31_sim_categoria'],
        rmm_score: data['32_rmm_score'],
        rmm_peso: data['33_rmm_peso'],
        rmm_categoria: data['34_rmm_categoria'],
        cem_score: data['35_cem_score'],
        cem_peso: data['36_cem_peso'],
        cem_categoria: data['37_cem_categoria'],
        gam_score: data['38_gam_score'],
        gam_peso: data['39_gam_peso'],
        gam_categoria: data['40_gam_categoria'],
        dcm_score: data['41_dcm_score'],
        dcm_peso: data['42_dcm_peso'],
        dcm_categoria: data['43_dcm_categoria'],
        cxm_score: data['44_cxm_score'],
        cxm_peso: data['45_cxm_peso'],
        cxm_categoria: data['46_cxm_categoria'],
        cxm_excluded: data['52_cxm_excluded'],
        res_gpt_bruto: data['20_res_gpt_bruto'],
        res_perplex_bruto: data['21_res_perplex_bruto'],
        res_gemini_bruto: data['22_res_gemini_bruto'],
        res_deepseek_bruto: data['23_res_deepseek_bruto'],
        respuesta_bruto_claude: data.respuesta_bruto_claude,
        respuesta_bruto_grok: data.respuesta_bruto_grok,
        respuesta_bruto_qwen: data.respuesta_bruto_qwen,
        flags: (data['17_flags'] as string[] | null),
        palabras: data['12_palabras'],
        num_fechas: data['13_num_fechas'],
        num_citas: data['14_num_citas'],
        source_pipeline: data.source_pipeline,
        execution_time_ms: data.execution_time_ms,
        model_errors: (data.model_errors as Record<string, string> | null),
        search_completed_at: data.search_completed_at,
        analysis_completed_at: data.analysis_completed_at,
        batch_execution_date: data.batch_execution_date,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    },
    enabled: !!id,
  });
}
