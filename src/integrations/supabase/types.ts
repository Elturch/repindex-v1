export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_consolidation_reports: {
        Row: {
          common_media_sources: Json
          company_name: string
          consensus_score: number | null
          created_at: string
          divergences: Json
          full_analysis: string | null
          id: string
          main_coincidences: Json
          media_ranking: Json
          models_analyzed: string[]
          temporal_patterns: Json
          ticker: string | null
          total_sources_found: number | null
          week_end: string
          week_start: string
        }
        Insert: {
          common_media_sources?: Json
          company_name: string
          consensus_score?: number | null
          created_at?: string
          divergences?: Json
          full_analysis?: string | null
          id?: string
          main_coincidences?: Json
          media_ranking?: Json
          models_analyzed?: string[]
          temporal_patterns?: Json
          ticker?: string | null
          total_sources_found?: number | null
          week_end: string
          week_start: string
        }
        Update: {
          common_media_sources?: Json
          company_name?: string
          consensus_score?: number | null
          created_at?: string
          divergences?: Json
          full_analysis?: string | null
          id?: string
          main_coincidences?: Json
          media_ranking?: Json
          models_analyzed?: string[]
          temporal_patterns?: Json
          ticker?: string | null
          total_sources_found?: number | null
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      by_metric: {
        Row: {
          contrib_points_chatgpt: number
          contrib_points_delta: number
          contrib_points_perplexity: number
          contrib_share_chatgpt: number
          contrib_share_perplexity: number
          evaluation_id: string
          id: number
          label: string
          metric: string
          score_chatgpt: number
          score_delta_abs: number
          score_delta_pct: number
          score_perplexity: number
          weight: number
        }
        Insert: {
          contrib_points_chatgpt: number
          contrib_points_delta: number
          contrib_points_perplexity: number
          contrib_share_chatgpt: number
          contrib_share_perplexity: number
          evaluation_id: string
          id?: number
          label: string
          metric: string
          score_chatgpt: number
          score_delta_abs: number
          score_delta_pct: number
          score_perplexity: number
          weight: number
        }
        Update: {
          contrib_points_chatgpt?: number
          contrib_points_delta?: number
          contrib_points_perplexity?: number
          contrib_share_chatgpt?: number
          contrib_share_perplexity?: number
          evaluation_id?: string
          id?: number
          label?: string
          metric?: string
          score_chatgpt?: number
          score_delta_abs?: number
          score_delta_pct?: number
          score_perplexity?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "by_metric_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "by_metric_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "v_evaluation_composite"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_history: {
        Row: {
          answer: string | null
          created_at: string | null
          id: string
          question: string
          result: Json | null
          session_id: string
          sql_query: string | null
        }
        Insert: {
          answer?: string | null
          created_at?: string | null
          id?: string
          question: string
          result?: Json | null
          session_id: string
          sql_query?: string | null
        }
        Update: {
          answer?: string | null
          created_at?: string | null
          id?: string
          question?: string
          result?: Json | null
          session_id?: string
          sql_query?: string | null
        }
        Relationships: []
      }
      chat_intelligence_sessions: {
        Row: {
          analysis_type: string | null
          company: string | null
          content: string
          created_at: string | null
          documents_found: number | null
          id: string
          role: string
          session_id: string
          structured_data_found: number | null
          suggested_questions: Json | null
          week: string | null
        }
        Insert: {
          analysis_type?: string | null
          company?: string | null
          content: string
          created_at?: string | null
          documents_found?: number | null
          id?: string
          role: string
          session_id: string
          structured_data_found?: number | null
          suggested_questions?: Json | null
          week?: string | null
        }
        Update: {
          analysis_type?: string | null
          company?: string | null
          content?: string
          created_at?: string | null
          documents_found?: number | null
          id?: string
          role?: string
          session_id?: string
          structured_data_found?: number | null
          suggested_questions?: Json | null
          week?: string | null
        }
        Relationships: []
      }
      chat_vector_memory: {
        Row: {
          created_at: string | null
          embedding: string | null
          id: string
          mensaje_usuario: string
          metadata: Json | null
          respuesta_bot: string | null
          session_id: string
          sql_generado: string | null
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          mensaje_usuario: string
          metadata?: Json | null
          respuesta_bot?: string | null
          session_id: string
          sql_generado?: string | null
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          mensaje_usuario?: string
          metadata?: Json | null
          respuesta_bot?: string | null
          session_id?: string
          sql_generado?: string | null
        }
        Relationships: []
      }
      contadores: {
        Row: {
          citation_density: number
          evaluation_id: string
          flags: string[]
          id: number
          model_key: string
          num_citas: number
          num_fechas: number
          palabras: number
          temporal_alignment: number
        }
        Insert: {
          citation_density: number
          evaluation_id: string
          flags?: string[]
          id?: number
          model_key: string
          num_citas: number
          num_fechas: number
          palabras: number
          temporal_alignment: number
        }
        Update: {
          citation_density?: number
          evaluation_id?: string
          flags?: string[]
          id?: number
          model_key?: string
          num_citas?: number
          num_fechas?: number
          palabras?: number
          temporal_alignment?: number
        }
        Relationships: [
          {
            foreignKeyName: "contadores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contadores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "v_evaluation_composite"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string | null
          embedding: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      evaluation: {
        Row: {
          composite_chatgpt: number | null
          composite_cosine_weighted: string | null
          composite_delta_abs: number | null
          composite_delta_pct: number | null
          composite_perplexity: number | null
          composite_winner: string | null
          created_at: string
          ejemplo_simulado: boolean
          id: string
          metrics_won_chatgpt: number | null
          metrics_won_perplexity: number | null
          metrics_won_ties: number | null
          period_from: string | null
          period_to: string | null
          raw: Json | null
          similarity_note: string | null
          target_name: string
          target_type: string
          ticker: string | null
          tz: string | null
        }
        Insert: {
          composite_chatgpt?: number | null
          composite_cosine_weighted?: string | null
          composite_delta_abs?: number | null
          composite_delta_pct?: number | null
          composite_perplexity?: number | null
          composite_winner?: string | null
          created_at?: string
          ejemplo_simulado: boolean
          id?: string
          metrics_won_chatgpt?: number | null
          metrics_won_perplexity?: number | null
          metrics_won_ties?: number | null
          period_from?: string | null
          period_to?: string | null
          raw?: Json | null
          similarity_note?: string | null
          target_name: string
          target_type: string
          ticker?: string | null
          tz?: string | null
        }
        Update: {
          composite_chatgpt?: number | null
          composite_cosine_weighted?: string | null
          composite_delta_abs?: number | null
          composite_delta_pct?: number | null
          composite_perplexity?: number | null
          composite_winner?: string | null
          created_at?: string
          ejemplo_simulado?: boolean
          id?: string
          metrics_won_chatgpt?: number | null
          metrics_won_perplexity?: number | null
          metrics_won_ties?: number | null
          period_from?: string | null
          period_to?: string | null
          raw?: Json | null
          similarity_note?: string | null
          target_name?: string
          target_type?: string
          ticker?: string | null
          tz?: string | null
        }
        Relationships: []
      }
      executive_notes: {
        Row: {
          evaluation_id: string
          id: number
          note: string
          position: number
        }
        Insert: {
          evaluation_id: string
          id?: number
          note: string
          position: number
        }
        Update: {
          evaluation_id?: string
          id?: number
          note?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "executive_notes_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executive_notes_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "v_evaluation_composite"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_weight_scheme: {
        Row: {
          CEM: number
          CXM: number
          DCM: number
          DRM: number
          evaluation_id: string
          GAM: number
          NVM: number
          RMM: number
          SIM: number
          total: number
        }
        Insert: {
          CEM: number
          CXM: number
          DCM: number
          DRM: number
          evaluation_id: string
          GAM: number
          NVM: number
          RMM: number
          SIM: number
          total: number
        }
        Update: {
          CEM?: number
          CXM?: number
          DCM?: number
          DRM?: number
          evaluation_id?: string
          GAM?: number
          NVM?: number
          RMM?: number
          SIM?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_weight_scheme_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_weight_scheme_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "v_evaluation_composite"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations_tactical: {
        Row: {
          evaluation_id: string
          id: number
          position: number
          recommendation: string
        }
        Insert: {
          evaluation_id: string
          id?: number
          position: number
          recommendation: string
        }
        Update: {
          evaluation_id?: string
          id?: number
          position?: number
          recommendation?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_tactical_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_tactical_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "v_evaluation_composite"
            referencedColumns: ["id"]
          },
        ]
      }
      repindex_root_issuers: {
        Row: {
          cotiza_en_bolsa: boolean
          counter: number
          created_at: string | null
          exclude_terms: Json
          fase: number | null
          geography: string[]
          ibex_family_category: string | null
          ibex_family_code: string | null
          ibex_status: string
          include_terms: Json
          issuer_id: string
          issuer_name: string
          languages: string[]
          notes: string | null
          prueba: string | null
          sample_query: string
          sector_category: string | null
          source_hint: string | null
          source_segment_detail: string | null
          status: string | null
          ticker: string
        }
        Insert: {
          cotiza_en_bolsa?: boolean
          counter?: number
          created_at?: string | null
          exclude_terms?: Json
          fase?: number | null
          geography?: string[]
          ibex_family_category?: string | null
          ibex_family_code?: string | null
          ibex_status: string
          include_terms: Json
          issuer_id: string
          issuer_name: string
          languages?: string[]
          notes?: string | null
          prueba?: string | null
          sample_query: string
          sector_category?: string | null
          source_hint?: string | null
          source_segment_detail?: string | null
          status?: string | null
          ticker: string
        }
        Update: {
          cotiza_en_bolsa?: boolean
          counter?: number
          created_at?: string | null
          exclude_terms?: Json
          fase?: number | null
          geography?: string[]
          ibex_family_category?: string | null
          ibex_family_code?: string | null
          ibex_status?: string
          include_terms?: Json
          issuer_id?: string
          issuer_name?: string
          languages?: string[]
          notes?: string | null
          prueba?: string | null
          sample_query?: string
          sector_category?: string | null
          source_hint?: string | null
          source_segment_detail?: string | null
          status?: string | null
          ticker?: string
        }
        Relationships: []
      }
      rix_runs: {
        Row: {
          "01_run_id": string
          "02_model_name": string | null
          "03_target_name": string | null
          "04_target_type": string | null
          "05_ticker": string | null
          "06_period_from": string | null
          "07_period_to": string | null
          "08_tz": string | null
          "09_rix_score": number | null
          "10_resumen": string | null
          "11_puntos_clave": Json | null
          "12_palabras": number | null
          "13_num_fechas": number | null
          "14_num_citas": number | null
          "15_temporal_alignment": number | null
          "16_citation_density": number | null
          "17_flags": Json | null
          "18_subscores": Json | null
          "19_weights": Json | null
          "20_res_gpt_bruto": string | null
          "21_res_perplex_bruto": string | null
          "22_explicacion": string | null
          "22_res_gemini_bruto": string | null
          "23_nvm_score": number | null
          "23_res_deepseek_bruto": string | null
          "24_nvm_peso": number | null
          "25_explicaciones_detalladas": Json | null
          "25_nvm_categoria": string | null
          "26_drm_score": number | null
          "27_drm_peso": number | null
          "28_drm_categoria": string | null
          "29_sim_score": number | null
          "30_sim_peso": number | null
          "31_sim_categoria": string | null
          "32_rmm_score": number | null
          "33_rmm_peso": number | null
          "34_rmm_categoria": string | null
          "35_cem_score": number | null
          "36_cem_peso": number | null
          "37_cem_categoria": string | null
          "38_gam_score": number | null
          "39_gam_peso": number | null
          "40_gam_categoria": string | null
          "41_dcm_score": number | null
          "42_dcm_peso": number | null
          "43_dcm_categoria": string | null
          "44_cxm_score": number | null
          "45_cxm_peso": number | null
          "46_cxm_categoria": string | null
          "47_fase": string | null
          "48_precio_accion": string | null
          "49_reputacion_vs_precio": string | null
          "50_precio_accion_interanual": string | null
          "51_rix_score_adjusted": number | null
          "52_cxm_excluded": boolean | null
          "59_precio_minimo_52_semanas": string | null
          batch_execution_date: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          "01_run_id"?: string
          "02_model_name"?: string | null
          "03_target_name"?: string | null
          "04_target_type"?: string | null
          "05_ticker"?: string | null
          "06_period_from"?: string | null
          "07_period_to"?: string | null
          "08_tz"?: string | null
          "09_rix_score"?: number | null
          "10_resumen"?: string | null
          "11_puntos_clave"?: Json | null
          "12_palabras"?: number | null
          "13_num_fechas"?: number | null
          "14_num_citas"?: number | null
          "15_temporal_alignment"?: number | null
          "16_citation_density"?: number | null
          "17_flags"?: Json | null
          "18_subscores"?: Json | null
          "19_weights"?: Json | null
          "20_res_gpt_bruto"?: string | null
          "21_res_perplex_bruto"?: string | null
          "22_explicacion"?: string | null
          "22_res_gemini_bruto"?: string | null
          "23_nvm_score"?: number | null
          "23_res_deepseek_bruto"?: string | null
          "24_nvm_peso"?: number | null
          "25_explicaciones_detalladas"?: Json | null
          "25_nvm_categoria"?: string | null
          "26_drm_score"?: number | null
          "27_drm_peso"?: number | null
          "28_drm_categoria"?: string | null
          "29_sim_score"?: number | null
          "30_sim_peso"?: number | null
          "31_sim_categoria"?: string | null
          "32_rmm_score"?: number | null
          "33_rmm_peso"?: number | null
          "34_rmm_categoria"?: string | null
          "35_cem_score"?: number | null
          "36_cem_peso"?: number | null
          "37_cem_categoria"?: string | null
          "38_gam_score"?: number | null
          "39_gam_peso"?: number | null
          "40_gam_categoria"?: string | null
          "41_dcm_score"?: number | null
          "42_dcm_peso"?: number | null
          "43_dcm_categoria"?: string | null
          "44_cxm_score"?: number | null
          "45_cxm_peso"?: number | null
          "46_cxm_categoria"?: string | null
          "47_fase"?: string | null
          "48_precio_accion"?: string | null
          "49_reputacion_vs_precio"?: string | null
          "50_precio_accion_interanual"?: string | null
          "51_rix_score_adjusted"?: number | null
          "52_cxm_excluded"?: boolean | null
          "59_precio_minimo_52_semanas"?: string | null
          batch_execution_date?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          "01_run_id"?: string
          "02_model_name"?: string | null
          "03_target_name"?: string | null
          "04_target_type"?: string | null
          "05_ticker"?: string | null
          "06_period_from"?: string | null
          "07_period_to"?: string | null
          "08_tz"?: string | null
          "09_rix_score"?: number | null
          "10_resumen"?: string | null
          "11_puntos_clave"?: Json | null
          "12_palabras"?: number | null
          "13_num_fechas"?: number | null
          "14_num_citas"?: number | null
          "15_temporal_alignment"?: number | null
          "16_citation_density"?: number | null
          "17_flags"?: Json | null
          "18_subscores"?: Json | null
          "19_weights"?: Json | null
          "20_res_gpt_bruto"?: string | null
          "21_res_perplex_bruto"?: string | null
          "22_explicacion"?: string | null
          "22_res_gemini_bruto"?: string | null
          "23_nvm_score"?: number | null
          "23_res_deepseek_bruto"?: string | null
          "24_nvm_peso"?: number | null
          "25_explicaciones_detalladas"?: Json | null
          "25_nvm_categoria"?: string | null
          "26_drm_score"?: number | null
          "27_drm_peso"?: number | null
          "28_drm_categoria"?: string | null
          "29_sim_score"?: number | null
          "30_sim_peso"?: number | null
          "31_sim_categoria"?: string | null
          "32_rmm_score"?: number | null
          "33_rmm_peso"?: number | null
          "34_rmm_categoria"?: string | null
          "35_cem_score"?: number | null
          "36_cem_peso"?: number | null
          "37_cem_categoria"?: string | null
          "38_gam_score"?: number | null
          "39_gam_peso"?: number | null
          "40_gam_categoria"?: string | null
          "41_dcm_score"?: number | null
          "42_dcm_peso"?: number | null
          "43_dcm_categoria"?: string | null
          "44_cxm_score"?: number | null
          "45_cxm_peso"?: number | null
          "46_cxm_categoria"?: string | null
          "47_fase"?: string | null
          "48_precio_accion"?: string | null
          "49_reputacion_vs_precio"?: string | null
          "50_precio_accion_interanual"?: string | null
          "51_rix_score_adjusted"?: number | null
          "52_cxm_excluded"?: boolean | null
          "59_precio_minimo_52_semanas"?: string | null
          batch_execution_date?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rix_runs_ampliada: {
        Row: {
          "01_run_id": string
          "02_model_name": string | null
          "03_target_name": string | null
          "04_target_type": string | null
          "05_ticker": string | null
          "06_period_from": string | null
          "07_period_to": string | null
          "08_tz": string | null
          "09_rix_score": number | null
          "10_resumen": string | null
          "11_puntos_clave": Json | null
          "12_palabras": number | null
          "13_num_fechas": number | null
          "14_num_citas": number | null
          "15_temporal_alignment": number | null
          "16_citation_density": number | null
          "17_flags": Json | null
          "18_subscores": Json | null
          "19_weights": Json | null
          "20_res_gpt_bruto": string | null
          "21_res_perplex_bruto": string | null
          "22_explicacion": string | null
          "22_res_gemini_bruto": string | null
          "23_nvm_score": number | null
          "23_res_deepseek_bruto": string | null
          "24_nvm_peso": number | null
          "25_explicaciones_detalladas": Json | null
          "25_nvm_categoria": string | null
          "26_drm_score": number | null
          "27_drm_peso": number | null
          "28_drm_categoria": string | null
          "29_sim_score": number | null
          "30_sim_peso": number | null
          "31_sim_categoria": string | null
          "32_rmm_score": number | null
          "33_rmm_peso": number | null
          "34_rmm_categoria": string | null
          "35_cem_score": number | null
          "36_cem_peso": number | null
          "37_cem_categoria": string | null
          "38_gam_score": number | null
          "39_gam_peso": number | null
          "40_gam_categoria": string | null
          "41_dcm_score": number | null
          "42_dcm_peso": number | null
          "43_dcm_categoria": string | null
          "44_cxm_score": number | null
          "45_cxm_peso": number | null
          "46_cxm_categoria": string | null
          "47_fase": string | null
          "48_precio_accion": string | null
          "49_reputacion_vs_precio": string | null
          "50_precio_accion_interanual": string | null
          "51_rix_score_adjusted": number | null
          "52_cxm_excluded": boolean | null
          "59_precio_minimo_52_semanas": string | null
          batch_execution_date: string
          created_at: string
          id: string
          respuesta_bruto_claude: string | null
          respuesta_bruto_grok: string | null
          respuesta_bruto_qwen: string | null
          updated_at: string
        }
        Insert: {
          "01_run_id"?: string
          "02_model_name"?: string | null
          "03_target_name"?: string | null
          "04_target_type"?: string | null
          "05_ticker"?: string | null
          "06_period_from"?: string | null
          "07_period_to"?: string | null
          "08_tz"?: string | null
          "09_rix_score"?: number | null
          "10_resumen"?: string | null
          "11_puntos_clave"?: Json | null
          "12_palabras"?: number | null
          "13_num_fechas"?: number | null
          "14_num_citas"?: number | null
          "15_temporal_alignment"?: number | null
          "16_citation_density"?: number | null
          "17_flags"?: Json | null
          "18_subscores"?: Json | null
          "19_weights"?: Json | null
          "20_res_gpt_bruto"?: string | null
          "21_res_perplex_bruto"?: string | null
          "22_explicacion"?: string | null
          "22_res_gemini_bruto"?: string | null
          "23_nvm_score"?: number | null
          "23_res_deepseek_bruto"?: string | null
          "24_nvm_peso"?: number | null
          "25_explicaciones_detalladas"?: Json | null
          "25_nvm_categoria"?: string | null
          "26_drm_score"?: number | null
          "27_drm_peso"?: number | null
          "28_drm_categoria"?: string | null
          "29_sim_score"?: number | null
          "30_sim_peso"?: number | null
          "31_sim_categoria"?: string | null
          "32_rmm_score"?: number | null
          "33_rmm_peso"?: number | null
          "34_rmm_categoria"?: string | null
          "35_cem_score"?: number | null
          "36_cem_peso"?: number | null
          "37_cem_categoria"?: string | null
          "38_gam_score"?: number | null
          "39_gam_peso"?: number | null
          "40_gam_categoria"?: string | null
          "41_dcm_score"?: number | null
          "42_dcm_peso"?: number | null
          "43_dcm_categoria"?: string | null
          "44_cxm_score"?: number | null
          "45_cxm_peso"?: number | null
          "46_cxm_categoria"?: string | null
          "47_fase"?: string | null
          "48_precio_accion"?: string | null
          "49_reputacion_vs_precio"?: string | null
          "50_precio_accion_interanual"?: string | null
          "51_rix_score_adjusted"?: number | null
          "52_cxm_excluded"?: boolean | null
          "59_precio_minimo_52_semanas"?: string | null
          batch_execution_date?: string
          created_at?: string
          id?: string
          respuesta_bruto_claude?: string | null
          respuesta_bruto_grok?: string | null
          respuesta_bruto_qwen?: string | null
          updated_at?: string
        }
        Update: {
          "01_run_id"?: string
          "02_model_name"?: string | null
          "03_target_name"?: string | null
          "04_target_type"?: string | null
          "05_ticker"?: string | null
          "06_period_from"?: string | null
          "07_period_to"?: string | null
          "08_tz"?: string | null
          "09_rix_score"?: number | null
          "10_resumen"?: string | null
          "11_puntos_clave"?: Json | null
          "12_palabras"?: number | null
          "13_num_fechas"?: number | null
          "14_num_citas"?: number | null
          "15_temporal_alignment"?: number | null
          "16_citation_density"?: number | null
          "17_flags"?: Json | null
          "18_subscores"?: Json | null
          "19_weights"?: Json | null
          "20_res_gpt_bruto"?: string | null
          "21_res_perplex_bruto"?: string | null
          "22_explicacion"?: string | null
          "22_res_gemini_bruto"?: string | null
          "23_nvm_score"?: number | null
          "23_res_deepseek_bruto"?: string | null
          "24_nvm_peso"?: number | null
          "25_explicaciones_detalladas"?: Json | null
          "25_nvm_categoria"?: string | null
          "26_drm_score"?: number | null
          "27_drm_peso"?: number | null
          "28_drm_categoria"?: string | null
          "29_sim_score"?: number | null
          "30_sim_peso"?: number | null
          "31_sim_categoria"?: string | null
          "32_rmm_score"?: number | null
          "33_rmm_peso"?: number | null
          "34_rmm_categoria"?: string | null
          "35_cem_score"?: number | null
          "36_cem_peso"?: number | null
          "37_cem_categoria"?: string | null
          "38_gam_score"?: number | null
          "39_gam_peso"?: number | null
          "40_gam_categoria"?: string | null
          "41_dcm_score"?: number | null
          "42_dcm_peso"?: number | null
          "43_dcm_categoria"?: string | null
          "44_cxm_score"?: number | null
          "45_cxm_peso"?: number | null
          "46_cxm_categoria"?: string | null
          "47_fase"?: string | null
          "48_precio_accion"?: string | null
          "49_reputacion_vs_precio"?: string | null
          "50_precio_accion_interanual"?: string | null
          "51_rix_score_adjusted"?: number | null
          "52_cxm_excluded"?: boolean | null
          "59_precio_minimo_52_semanas"?: string | null
          batch_execution_date?: string
          created_at?: string
          id?: string
          respuesta_bruto_claude?: string | null
          respuesta_bruto_grok?: string | null
          respuesta_bruto_qwen?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rix_runs_duplicates_audit: {
        Row: {
          batch_execution_date: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          model_name: string | null
          reason: string | null
          rix_score: number | null
          row_number: number | null
          target_name: string | null
          ticker: string | null
          updated_at: string | null
        }
        Insert: {
          batch_execution_date?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id: string
          model_name?: string | null
          reason?: string | null
          rix_score?: number | null
          row_number?: number | null
          target_name?: string | null
          ticker?: string | null
          updated_at?: string | null
        }
        Update: {
          batch_execution_date?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          model_name?: string | null
          reason?: string | null
          rix_score?: number | null
          row_number?: number | null
          target_name?: string | null
          ticker?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rix_trends: {
        Row: {
          batch_week: string
          company_name: string
          created_at: string | null
          ibex_family_code: string | null
          id: string
          is_traded: boolean
          model_name: string
          rix_score: number
          sector_category: string | null
          stock_price: number | null
          ticker: string
        }
        Insert: {
          batch_week: string
          company_name: string
          created_at?: string | null
          ibex_family_code?: string | null
          id?: string
          is_traded?: boolean
          model_name: string
          rix_score: number
          sector_category?: string | null
          stock_price?: number | null
          ticker: string
        }
        Update: {
          batch_week?: string
          company_name?: string
          created_at?: string | null
          ibex_family_code?: string | null
          id?: string
          is_traded?: boolean
          model_name?: string
          rix_score?: number
          sector_category?: string | null
          stock_price?: number | null
          ticker?: string
        }
        Relationships: []
      }
      source_models: {
        Row: {
          evaluation_id: string
          id: number
          model_key: string
          model_name: string
          run_key: string
        }
        Insert: {
          evaluation_id: string
          id?: number
          model_key: string
          model_name: string
          run_key: string
        }
        Update: {
          evaluation_id?: string
          id?: number
          model_key?: string
          model_name?: string
          run_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_models_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_models_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "v_evaluation_composite"
            referencedColumns: ["id"]
          },
        ]
      }
      top_drivers: {
        Row: {
          delta_contrib_abs: number
          direction: string
          evaluation_id: string
          id: number
          label: string
          metric: string
        }
        Insert: {
          delta_contrib_abs: number
          direction: string
          evaluation_id: string
          id?: number
          label: string
          metric: string
        }
        Update: {
          delta_contrib_abs?: number
          direction?: string
          evaluation_id?: string
          id?: number
          label?: string
          metric?: string
        }
        Relationships: [
          {
            foreignKeyName: "top_drivers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "top_drivers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "v_evaluation_composite"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_status_audit: {
        Row: {
          audited_at: string | null
          audited_by: string | null
          id: number
          issuer_id: string
          issuer_name: string
          new_status: boolean | null
          previous_status: boolean | null
          reason: string | null
          source: string | null
          ticker: string
        }
        Insert: {
          audited_at?: string | null
          audited_by?: string | null
          id?: number
          issuer_id: string
          issuer_name: string
          new_status?: boolean | null
          previous_status?: boolean | null
          reason?: string | null
          source?: string | null
          ticker: string
        }
        Update: {
          audited_at?: string | null
          audited_by?: string | null
          id?: number
          issuer_id?: string
          issuer_name?: string
          new_status?: boolean | null
          previous_status?: boolean | null
          reason?: string | null
          source?: string | null
          ticker?: string
        }
        Relationships: []
      }
      weekly_news: {
        Row: {
          generated_at: string | null
          id: string
          keywords: string[] | null
          main_headline: string
          main_story: Json
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          raw_data: Json | null
          status: string | null
          stories: Json
          week_end: string
          week_label: string
          week_start: string
        }
        Insert: {
          generated_at?: string | null
          id?: string
          keywords?: string[] | null
          main_headline: string
          main_story: Json
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          raw_data?: Json | null
          status?: string | null
          stories?: Json
          week_end: string
          week_label: string
          week_start: string
        }
        Update: {
          generated_at?: string | null
          id?: string
          keywords?: string[] | null
          main_headline?: string
          main_story?: Json
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          raw_data?: Json | null
          status?: string | null
          stories?: Json
          week_end?: string
          week_label?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_evaluation_composite: {
        Row: {
          composite_chatgpt: number | null
          composite_cosine_weighted: string | null
          composite_delta_abs: number | null
          composite_delta_pct: number | null
          composite_perplexity: number | null
          composite_winner: string | null
          created_at: string | null
          id: string | null
          metrics_won_chatgpt: number | null
          metrics_won_perplexity: number | null
          metrics_won_ties: number | null
          period_from: string | null
          period_to: string | null
          similarity_note: string | null
          target_name: string | null
          target_type: string | null
          ticker: string | null
          tz: string | null
        }
        Insert: {
          composite_chatgpt?: number | null
          composite_cosine_weighted?: string | null
          composite_delta_abs?: number | null
          composite_delta_pct?: number | null
          composite_perplexity?: number | null
          composite_winner?: string | null
          created_at?: string | null
          id?: string | null
          metrics_won_chatgpt?: number | null
          metrics_won_perplexity?: number | null
          metrics_won_ties?: number | null
          period_from?: string | null
          period_to?: string | null
          similarity_note?: string | null
          target_name?: string | null
          target_type?: string | null
          ticker?: string | null
          tz?: string | null
        }
        Update: {
          composite_chatgpt?: number | null
          composite_cosine_weighted?: string | null
          composite_delta_abs?: number | null
          composite_delta_pct?: number | null
          composite_perplexity?: number | null
          composite_winner?: string | null
          created_at?: string | null
          id?: string | null
          metrics_won_chatgpt?: number | null
          metrics_won_perplexity?: number | null
          metrics_won_ties?: number | null
          period_from?: string | null
          period_to?: string | null
          similarity_note?: string | null
          target_name?: string | null
          target_type?: string | null
          ticker?: string | null
          tz?: string | null
        }
        Relationships: []
      }
      v_weight_scheme_unpivot: {
        Row: {
          evaluation_id: string | null
          metric: string | null
          weight: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      buscar_contexto_similar: {
        Args: {
          limit_results?: number
          query_embedding: string
          session_filter?: string
        }
        Returns: {
          id: string
          mensaje_usuario: string
          respuesta_bot: string
          session_id: string
          similarity: number
          sql_generado: string
        }[]
      }
      execute_sql: { Args: { sql_query: string }; Returns: Json }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      normalize_stock_price: { Args: { price_text: string }; Returns: number }
      normalize_stock_price_v2: {
        Args: { batch_date?: string; price_text: string; ticker?: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
