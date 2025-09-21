-- Rename columns in pari_runs table to include correlative numbers for easier Make mapping
-- Keep system fields (id, created_at, updated_at) unchanged

ALTER TABLE public.pari_runs 
  RENAME COLUMN run_id TO "01_run_id";

ALTER TABLE public.pari_runs 
  RENAME COLUMN model_name TO "02_model_name";

ALTER TABLE public.pari_runs 
  RENAME COLUMN target_name TO "03_target_name";

ALTER TABLE public.pari_runs 
  RENAME COLUMN target_type TO "04_target_type";

ALTER TABLE public.pari_runs 
  RENAME COLUMN ticker TO "05_ticker";

ALTER TABLE public.pari_runs 
  RENAME COLUMN period_from TO "06_period_from";

ALTER TABLE public.pari_runs 
  RENAME COLUMN period_to TO "07_period_to";

ALTER TABLE public.pari_runs 
  RENAME COLUMN tz TO "08_tz";

ALTER TABLE public.pari_runs 
  RENAME COLUMN pari_score TO "09_pari_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN resumen TO "10_resumen";

ALTER TABLE public.pari_runs 
  RENAME COLUMN puntos_clave TO "11_puntos_clave";

ALTER TABLE public.pari_runs 
  RENAME COLUMN palabras TO "12_palabras";

ALTER TABLE public.pari_runs 
  RENAME COLUMN num_fechas TO "13_num_fechas";

ALTER TABLE public.pari_runs 
  RENAME COLUMN num_citas TO "14_num_citas";

ALTER TABLE public.pari_runs 
  RENAME COLUMN temporal_alignment TO "15_temporal_alignment";

ALTER TABLE public.pari_runs 
  RENAME COLUMN citation_density TO "16_citation_density";

ALTER TABLE public.pari_runs 
  RENAME COLUMN flags TO "17_flags";

ALTER TABLE public.pari_runs 
  RENAME COLUMN subscores TO "18_subscores";

ALTER TABLE public.pari_runs 
  RENAME COLUMN weights TO "19_weights";

ALTER TABLE public.pari_runs 
  RENAME COLUMN "res-gpt-bruto" TO "20_res_gpt_bruto";

ALTER TABLE public.pari_runs 
  RENAME COLUMN "res-perplex-bruto" TO "21_res_perplex_bruto";

ALTER TABLE public.pari_runs 
  RENAME COLUMN explicacion TO "22_explicacion";

ALTER TABLE public.pari_runs 
  RENAME COLUMN lns_score TO "23_lns_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN lns_peso TO "24_lns_peso";

ALTER TABLE public.pari_runs 
  RENAME COLUMN lns_categoria TO "25_lns_categoria";

ALTER TABLE public.pari_runs 
  RENAME COLUMN es_score TO "26_es_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN es_peso TO "27_es_peso";

ALTER TABLE public.pari_runs 
  RENAME COLUMN es_categoria TO "28_es_categoria";

ALTER TABLE public.pari_runs 
  RENAME COLUMN sam_score TO "29_sam_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN sam_peso TO "30_sam_peso";

ALTER TABLE public.pari_runs 
  RENAME COLUMN sam_categoria TO "31_sam_categoria";

ALTER TABLE public.pari_runs 
  RENAME COLUMN rm_score TO "32_rm_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN rm_peso TO "33_rm_peso";

ALTER TABLE public.pari_runs 
  RENAME COLUMN rm_categoria TO "34_rm_categoria";

ALTER TABLE public.pari_runs 
  RENAME COLUMN clr_score TO "35_clr_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN clr_peso TO "36_clr_peso";

ALTER TABLE public.pari_runs 
  RENAME COLUMN clr_categoria TO "37_clr_categoria";

ALTER TABLE public.pari_runs 
  RENAME COLUMN gip_score TO "38_gip_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN gip_peso TO "39_gip_peso";

ALTER TABLE public.pari_runs 
  RENAME COLUMN gip_categoria TO "40_gip_categoria";

ALTER TABLE public.pari_runs 
  RENAME COLUMN kgi_score TO "41_kgi_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN kgi_peso TO "42_kgi_peso";

ALTER TABLE public.pari_runs 
  RENAME COLUMN kgi_categoria TO "43_kgi_categoria";

ALTER TABLE public.pari_runs 
  RENAME COLUMN mpi_score TO "44_mpi_score";

ALTER TABLE public.pari_runs 
  RENAME COLUMN mpi_peso TO "45_mpi_peso";

ALTER TABLE public.pari_runs 
  RENAME COLUMN mpi_categoria TO "46_mpi_categoria";