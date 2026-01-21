-- Create rix_runs_v2 table as a copy of rix_runs_ampliada structure
CREATE TABLE public.rix_runs_v2 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "01_run_id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "02_model_name" text,
  "03_target_name" text,
  "04_target_type" text,
  "05_ticker" text,
  "06_period_from" date,
  "07_period_to" date,
  "08_tz" text DEFAULT 'UTC'::text,
  "09_rix_score" integer,
  "10_resumen" text,
  "11_puntos_clave" jsonb,
  "12_palabras" integer,
  "13_num_fechas" integer,
  "14_num_citas" integer,
  "15_temporal_alignment" numeric,
  "16_citation_density" numeric,
  "17_flags" jsonb,
  "18_subscores" jsonb,
  "19_weights" jsonb,
  "20_res_gpt_bruto" text,
  "21_res_perplex_bruto" text,
  "22_res_gemini_bruto" text,
  "22_explicacion" text,
  "23_res_deepseek_bruto" text,
  "23_nvm_score" integer,
  "24_nvm_peso" integer,
  "25_nvm_categoria" text,
  "25_explicaciones_detalladas" jsonb,
  "26_drm_score" integer,
  "27_drm_peso" integer,
  "28_drm_categoria" text,
  "29_sim_score" integer,
  "30_sim_peso" integer,
  "31_sim_categoria" text,
  "32_rmm_score" integer,
  "33_rmm_peso" integer,
  "34_rmm_categoria" text,
  "35_cem_score" integer,
  "36_cem_peso" integer,
  "37_cem_categoria" text,
  "38_gam_score" integer,
  "39_gam_peso" integer,
  "40_gam_categoria" text,
  "41_dcm_score" integer,
  "42_dcm_peso" integer,
  "43_dcm_categoria" text,
  "44_cxm_score" integer,
  "45_cxm_peso" integer,
  "46_cxm_categoria" text,
  "47_fase" text,
  "48_precio_accion" text DEFAULT 'NC'::text,
  "49_reputacion_vs_precio" text,
  "50_precio_accion_interanual" text DEFAULT 'NC'::text,
  "51_rix_score_adjusted" integer,
  "52_cxm_excluded" boolean DEFAULT false,
  "59_precio_minimo_52_semanas" text,
  respuesta_bruto_claude text,
  respuesta_bruto_grok text,
  respuesta_bruto_qwen text,
  batch_execution_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  -- V2 specific fields
  source_pipeline text NOT NULL DEFAULT 'lovable_v2',
  execution_time_ms integer,
  model_errors jsonb DEFAULT '{}'::jsonb,
  search_completed_at timestamp with time zone,
  analysis_completed_at timestamp with time zone
);

-- Create index for common queries
CREATE INDEX idx_rix_runs_v2_ticker ON public.rix_runs_v2("05_ticker");
CREATE INDEX idx_rix_runs_v2_batch ON public.rix_runs_v2(batch_execution_date);
CREATE INDEX idx_rix_runs_v2_pipeline ON public.rix_runs_v2(source_pipeline);
CREATE INDEX idx_rix_runs_v2_model ON public.rix_runs_v2("02_model_name");

-- Enable RLS
ALTER TABLE public.rix_runs_v2 ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (admin/dev only environment)
CREATE POLICY "Lectura pública rix_runs_v2" 
  ON public.rix_runs_v2 
  FOR SELECT 
  USING (true);

CREATE POLICY "Inserción pública rix_runs_v2" 
  ON public.rix_runs_v2 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Actualización pública rix_runs_v2" 
  ON public.rix_runs_v2 
  FOR UPDATE 
  USING (true);

CREATE POLICY "Eliminación pública rix_runs_v2" 
  ON public.rix_runs_v2 
  FOR DELETE 
  USING (true);

-- Seed with last 3 batches from production rix_runs for comparison
INSERT INTO public.rix_runs_v2 (
  id, "01_run_id", "02_model_name", "03_target_name", "04_target_type", "05_ticker",
  "06_period_from", "07_period_to", "08_tz", "09_rix_score", "10_resumen",
  "11_puntos_clave", "12_palabras", "13_num_fechas", "14_num_citas",
  "15_temporal_alignment", "16_citation_density", "17_flags", "18_subscores", "19_weights",
  "20_res_gpt_bruto", "21_res_perplex_bruto", "22_res_gemini_bruto", "22_explicacion",
  "23_res_deepseek_bruto", "23_nvm_score", "24_nvm_peso", "25_nvm_categoria",
  "25_explicaciones_detalladas", "26_drm_score", "27_drm_peso", "28_drm_categoria",
  "29_sim_score", "30_sim_peso", "31_sim_categoria", "32_rmm_score", "33_rmm_peso",
  "34_rmm_categoria", "35_cem_score", "36_cem_peso", "37_cem_categoria",
  "38_gam_score", "39_gam_peso", "40_gam_categoria", "41_dcm_score", "42_dcm_peso",
  "43_dcm_categoria", "44_cxm_score", "45_cxm_peso", "46_cxm_categoria",
  "47_fase", "48_precio_accion", "49_reputacion_vs_precio", "50_precio_accion_interanual",
  "51_rix_score_adjusted", "52_cxm_excluded", "59_precio_minimo_52_semanas",
  batch_execution_date, created_at, updated_at, source_pipeline
)
SELECT 
  gen_random_uuid(), "01_run_id", "02_model_name", "03_target_name", "04_target_type", "05_ticker",
  "06_period_from", "07_period_to", "08_tz", "09_rix_score", "10_resumen",
  "11_puntos_clave", "12_palabras", "13_num_fechas", "14_num_citas",
  "15_temporal_alignment", "16_citation_density", "17_flags", "18_subscores", "19_weights",
  "20_res_gpt_bruto", "21_res_perplex_bruto", "22_res_gemini_bruto", "22_explicacion",
  "23_res_deepseek_bruto", "23_nvm_score", "24_nvm_peso", "25_nvm_categoria",
  "25_explicaciones_detalladas", "26_drm_score", "27_drm_peso", "28_drm_categoria",
  "29_sim_score", "30_sim_peso", "31_sim_categoria", "32_rmm_score", "33_rmm_peso",
  "34_rmm_categoria", "35_cem_score", "36_cem_peso", "37_cem_categoria",
  "38_gam_score", "39_gam_peso", "40_gam_categoria", "41_dcm_score", "42_dcm_peso",
  "43_dcm_categoria", "44_cxm_score", "45_cxm_peso", "46_cxm_categoria",
  "47_fase", "48_precio_accion", "49_reputacion_vs_precio", "50_precio_accion_interanual",
  "51_rix_score_adjusted", "52_cxm_excluded", "59_precio_minimo_52_semanas",
  batch_execution_date, created_at, updated_at, 'make_original'
FROM public.rix_runs
WHERE batch_execution_date >= (CURRENT_DATE - INTERVAL '21 days');