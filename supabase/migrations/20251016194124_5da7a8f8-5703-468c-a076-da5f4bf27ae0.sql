-- =================================================================
-- MIGRACIÓN PARI → RIX
-- Fecha: 2025-10-16
-- CRÍTICO: Ejecutar TODO en una sola transacción
-- =================================================================

-- ============== PASO 1: RENOMBRAR TABLA PRINCIPAL ==============
ALTER TABLE public.pari_runs RENAME TO rix_runs;

-- ============== PASO 2: RENOMBRAR COLUMNAS EN rix_runs ==============

-- RIX Score (antes PARI)
ALTER TABLE public.rix_runs RENAME COLUMN "09_pari_score" TO "09_rix_score";
ALTER TABLE public.rix_runs RENAME COLUMN "51_pari_score_adjusted" TO "51_rix_score_adjusted";
ALTER TABLE public.rix_runs RENAME COLUMN "52_mpi_excluded" TO "52_cxm_excluded";

-- NVM (antes LNS)
ALTER TABLE public.rix_runs RENAME COLUMN "23_lns_score" TO "23_nvm_score";
ALTER TABLE public.rix_runs RENAME COLUMN "24_lns_peso" TO "24_nvm_peso";
ALTER TABLE public.rix_runs RENAME COLUMN "25_lns_categoria" TO "25_nvm_categoria";

-- DRM (antes ES)
ALTER TABLE public.rix_runs RENAME COLUMN "26_es_score" TO "26_drm_score";
ALTER TABLE public.rix_runs RENAME COLUMN "27_es_peso" TO "27_drm_peso";
ALTER TABLE public.rix_runs RENAME COLUMN "28_es_categoria" TO "28_drm_categoria";

-- SIM (antes SAM)
ALTER TABLE public.rix_runs RENAME COLUMN "29_sam_score" TO "29_sim_score";
ALTER TABLE public.rix_runs RENAME COLUMN "30_sam_peso" TO "30_sim_peso";
ALTER TABLE public.rix_runs RENAME COLUMN "31_sam_categoria" TO "31_sim_categoria";

-- RMM (antes RM)
ALTER TABLE public.rix_runs RENAME COLUMN "32_rm_score" TO "32_rmm_score";
ALTER TABLE public.rix_runs RENAME COLUMN "33_rm_peso" TO "33_rmm_peso";
ALTER TABLE public.rix_runs RENAME COLUMN "34_rm_categoria" TO "34_rmm_categoria";

-- CEM (antes CLR)
ALTER TABLE public.rix_runs RENAME COLUMN "35_clr_score" TO "35_cem_score";
ALTER TABLE public.rix_runs RENAME COLUMN "36_clr_peso" TO "36_cem_peso";
ALTER TABLE public.rix_runs RENAME COLUMN "37_clr_categoria" TO "37_cem_categoria";

-- GAM (antes GIP)
ALTER TABLE public.rix_runs RENAME COLUMN "38_gip_score" TO "38_gam_score";
ALTER TABLE public.rix_runs RENAME COLUMN "39_gip_peso" TO "39_gam_peso";
ALTER TABLE public.rix_runs RENAME COLUMN "40_gip_categoria" TO "40_gam_categoria";

-- DCM (antes KGI)
ALTER TABLE public.rix_runs RENAME COLUMN "41_kgi_score" TO "41_dcm_score";
ALTER TABLE public.rix_runs RENAME COLUMN "42_kgi_peso" TO "42_dcm_peso";
ALTER TABLE public.rix_runs RENAME COLUMN "43_kgi_categoria" TO "43_dcm_categoria";

-- CXM (antes MPI)
ALTER TABLE public.rix_runs RENAME COLUMN "44_mpi_score" TO "44_cxm_score";
ALTER TABLE public.rix_runs RENAME COLUMN "45_mpi_peso" TO "45_cxm_peso";
ALTER TABLE public.rix_runs RENAME COLUMN "46_mpi_categoria" TO "46_cxm_categoria";

-- ============== PASO 3: RENOMBRAR COLUMNAS EN meta_weight_scheme ==============

ALTER TABLE public.meta_weight_scheme RENAME COLUMN "LNS" TO "NVM";
ALTER TABLE public.meta_weight_scheme RENAME COLUMN "ES" TO "DRM";
ALTER TABLE public.meta_weight_scheme RENAME COLUMN "SAM" TO "SIM";
ALTER TABLE public.meta_weight_scheme RENAME COLUMN "RM" TO "RMM";
ALTER TABLE public.meta_weight_scheme RENAME COLUMN "CLR" TO "CEM";
ALTER TABLE public.meta_weight_scheme RENAME COLUMN "GIP" TO "GAM";
ALTER TABLE public.meta_weight_scheme RENAME COLUMN "KGI" TO "DCM";
ALTER TABLE public.meta_weight_scheme RENAME COLUMN "MPI" TO "CXM";

-- ============== PASO 4: RENOMBRAR ÍNDICES ==============

ALTER INDEX IF EXISTS idx_pari_runs_run_id RENAME TO idx_rix_runs_run_id;
ALTER INDEX IF EXISTS idx_pari_runs_target_name RENAME TO idx_rix_runs_target_name;
ALTER INDEX IF EXISTS idx_pari_runs_period RENAME TO idx_rix_runs_period;
ALTER INDEX IF EXISTS idx_pari_runs_created_at RENAME TO idx_rix_runs_created_at;
ALTER INDEX IF EXISTS idx_pari_runs_target_period RENAME TO idx_rix_runs_target_period;

-- ============== PASO 5: ACTUALIZAR TRIGGER ==============

DROP TRIGGER IF EXISTS update_pari_runs_updated_at ON public.rix_runs;

CREATE TRIGGER update_rix_runs_updated_at
  BEFORE UPDATE ON public.rix_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============== PASO 6: RECREAR POLÍTICAS RLS ==============

DROP POLICY IF EXISTS "Acceso público de lectura" ON public.rix_runs;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.rix_runs;
DROP POLICY IF EXISTS "Acceso público de actualización" ON public.rix_runs;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.rix_runs;

CREATE POLICY "Acceso público de lectura" 
  ON public.rix_runs FOR SELECT 
  USING (true);

CREATE POLICY "Acceso público de inserción" 
  ON public.rix_runs FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Acceso público de actualización" 
  ON public.rix_runs FOR UPDATE 
  USING (true);

CREATE POLICY "Acceso público de eliminación" 
  ON public.rix_runs FOR DELETE 
  USING (true);

-- ============== PASO 7: ACTUALIZAR FUNCIÓN DE VALIDACIÓN ==============

CREATE OR REPLACE FUNCTION public.f_meta_weight_scheme_check_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (new."NVM" + new."DRM" + new."SIM" + new."RMM" + new."CEM" + new."GAM" + new."DCM" + new."CXM") <> new.total THEN
    RAISE EXCEPTION 'La suma de pesos (NVM+DRM+SIM+RMM+CEM+GAM+DCM+CXM) % no coincide con total %', 
      (new."NVM" + new."DRM" + new."SIM" + new."RMM" + new."CEM" + new."GAM" + new."DCM" + new."CXM"), new.total;
  END IF;
  RETURN new;
END;
$function$;