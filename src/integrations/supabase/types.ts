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
          CLR: number
          ES: number
          evaluation_id: string
          GIP: number
          KGI: number
          LNS: number
          MPI: number
          RM: number
          SAM: number
          total: number
        }
        Insert: {
          CLR: number
          ES: number
          evaluation_id: string
          GIP: number
          KGI: number
          LNS: number
          MPI: number
          RM: number
          SAM: number
          total: number
        }
        Update: {
          CLR?: number
          ES?: number
          evaluation_id?: string
          GIP?: number
          KGI?: number
          LNS?: number
          MPI?: number
          RM?: number
          SAM?: number
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
      pari_runs: {
        Row: {
          "01_run_id": string
          "02_model_name": string | null
          "03_target_name": string
          "04_target_type": string | null
          "05_ticker": string | null
          "06_period_from": string | null
          "07_period_to": string | null
          "08_tz": string | null
          "09_pari_score": number | null
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
          "22_explicacion": string[] | null
          "23_lns_score": number | null
          "24_lns_peso": number | null
          "25_lns_categoria": string | null
          "26_es_score": number | null
          "27_es_peso": number | null
          "28_es_categoria": string | null
          "29_sam_score": number | null
          "30_sam_peso": number | null
          "31_sam_categoria": string | null
          "32_rm_score": number | null
          "33_rm_peso": number | null
          "34_rm_categoria": string | null
          "35_clr_score": number | null
          "36_clr_peso": number | null
          "37_clr_categoria": string | null
          "38_gip_score": number | null
          "39_gip_peso": number | null
          "40_gip_categoria": string | null
          "41_kgi_score": number | null
          "42_kgi_peso": number | null
          "43_kgi_categoria": string | null
          "44_mpi_score": number | null
          "45_mpi_peso": number | null
          "46_mpi_categoria": string | null
          "47_fase": string | null
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          "01_run_id"?: string
          "02_model_name"?: string | null
          "03_target_name": string
          "04_target_type"?: string | null
          "05_ticker"?: string | null
          "06_period_from"?: string | null
          "07_period_to"?: string | null
          "08_tz"?: string | null
          "09_pari_score"?: number | null
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
          "22_explicacion"?: string[] | null
          "23_lns_score"?: number | null
          "24_lns_peso"?: number | null
          "25_lns_categoria"?: string | null
          "26_es_score"?: number | null
          "27_es_peso"?: number | null
          "28_es_categoria"?: string | null
          "29_sam_score"?: number | null
          "30_sam_peso"?: number | null
          "31_sam_categoria"?: string | null
          "32_rm_score"?: number | null
          "33_rm_peso"?: number | null
          "34_rm_categoria"?: string | null
          "35_clr_score"?: number | null
          "36_clr_peso"?: number | null
          "37_clr_categoria"?: string | null
          "38_gip_score"?: number | null
          "39_gip_peso"?: number | null
          "40_gip_categoria"?: string | null
          "41_kgi_score"?: number | null
          "42_kgi_peso"?: number | null
          "43_kgi_categoria"?: string | null
          "44_mpi_score"?: number | null
          "45_mpi_peso"?: number | null
          "46_mpi_categoria"?: string | null
          "47_fase"?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          "01_run_id"?: string
          "02_model_name"?: string | null
          "03_target_name"?: string
          "04_target_type"?: string | null
          "05_ticker"?: string | null
          "06_period_from"?: string | null
          "07_period_to"?: string | null
          "08_tz"?: string | null
          "09_pari_score"?: number | null
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
          "22_explicacion"?: string[] | null
          "23_lns_score"?: number | null
          "24_lns_peso"?: number | null
          "25_lns_categoria"?: string | null
          "26_es_score"?: number | null
          "27_es_peso"?: number | null
          "28_es_categoria"?: string | null
          "29_sam_score"?: number | null
          "30_sam_peso"?: number | null
          "31_sam_categoria"?: string | null
          "32_rm_score"?: number | null
          "33_rm_peso"?: number | null
          "34_rm_categoria"?: string | null
          "35_clr_score"?: number | null
          "36_clr_peso"?: number | null
          "37_clr_categoria"?: string | null
          "38_gip_score"?: number | null
          "39_gip_peso"?: number | null
          "40_gip_categoria"?: string | null
          "41_kgi_score"?: number | null
          "42_kgi_peso"?: number | null
          "43_kgi_categoria"?: string | null
          "44_mpi_score"?: number | null
          "45_mpi_peso"?: number | null
          "46_mpi_categoria"?: string | null
          "47_fase"?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
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
          counter: number
          created_at: string | null
          exclude_terms: Json
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
          counter?: number
          created_at?: string | null
          exclude_terms?: Json
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
          counter?: number
          created_at?: string | null
          exclude_terms?: Json
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
      [_ in never]: never
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
