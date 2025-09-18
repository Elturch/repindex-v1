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
      pari_runs: {
        Row: {
          citation_density: number | null
          clr_categoria: string | null
          clr_peso: number | null
          clr_score: number | null
          created_at: string
          es_categoria: string | null
          es_peso: number | null
          es_score: number | null
          flags: Json | null
          gip_categoria: string | null
          gip_peso: number | null
          gip_score: number | null
          id: string
          kgi_categoria: string | null
          kgi_peso: number | null
          kgi_score: number | null
          lns_categoria: string | null
          lns_peso: number | null
          lns_score: number | null
          model_name: string | null
          mpi_categoria: string | null
          mpi_peso: number | null
          mpi_score: number | null
          num_citas: number | null
          num_fechas: number | null
          palabras: number | null
          pari_score: number | null
          period_from: string | null
          period_to: string | null
          puntos_clave: Json | null
          resumen: string | null
          rm_categoria: string | null
          rm_peso: number | null
          rm_score: number | null
          run_id: string
          sam_categoria: string | null
          sam_peso: number | null
          sam_score: number | null
          target_name: string
          target_type: string | null
          temporal_alignment: number | null
          ticker: string | null
          tz: string | null
          updated_at: string
        }
        Insert: {
          citation_density?: number | null
          clr_categoria?: string | null
          clr_peso?: number | null
          clr_score?: number | null
          created_at?: string
          es_categoria?: string | null
          es_peso?: number | null
          es_score?: number | null
          flags?: Json | null
          gip_categoria?: string | null
          gip_peso?: number | null
          gip_score?: number | null
          id?: string
          kgi_categoria?: string | null
          kgi_peso?: number | null
          kgi_score?: number | null
          lns_categoria?: string | null
          lns_peso?: number | null
          lns_score?: number | null
          model_name?: string | null
          mpi_categoria?: string | null
          mpi_peso?: number | null
          mpi_score?: number | null
          num_citas?: number | null
          num_fechas?: number | null
          palabras?: number | null
          pari_score?: number | null
          period_from?: string | null
          period_to?: string | null
          puntos_clave?: Json | null
          resumen?: string | null
          rm_categoria?: string | null
          rm_peso?: number | null
          rm_score?: number | null
          run_id: string
          sam_categoria?: string | null
          sam_peso?: number | null
          sam_score?: number | null
          target_name: string
          target_type?: string | null
          temporal_alignment?: number | null
          ticker?: string | null
          tz?: string | null
          updated_at?: string
        }
        Update: {
          citation_density?: number | null
          clr_categoria?: string | null
          clr_peso?: number | null
          clr_score?: number | null
          created_at?: string
          es_categoria?: string | null
          es_peso?: number | null
          es_score?: number | null
          flags?: Json | null
          gip_categoria?: string | null
          gip_peso?: number | null
          gip_score?: number | null
          id?: string
          kgi_categoria?: string | null
          kgi_peso?: number | null
          kgi_score?: number | null
          lns_categoria?: string | null
          lns_peso?: number | null
          lns_score?: number | null
          model_name?: string | null
          mpi_categoria?: string | null
          mpi_peso?: number | null
          mpi_score?: number | null
          num_citas?: number | null
          num_fechas?: number | null
          palabras?: number | null
          pari_score?: number | null
          period_from?: string | null
          period_to?: string | null
          puntos_clave?: Json | null
          resumen?: string | null
          rm_categoria?: string | null
          rm_peso?: number | null
          rm_score?: number | null
          run_id?: string
          sam_categoria?: string | null
          sam_peso?: number | null
          sam_score?: number | null
          target_name?: string
          target_type?: string | null
          temporal_alignment?: number | null
          ticker?: string | null
          tz?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      repindex_root_issuers: {
        Row: {
          created_at: string | null
          exclude_terms: Json
          geography: string[]
          ibex_status: string
          include_terms: Json
          issuer_id: string
          issuer_name: string
          languages: string[]
          notes: string | null
          sample_query: string
          ticker: string
        }
        Insert: {
          created_at?: string | null
          exclude_terms?: Json
          geography?: string[]
          ibex_status: string
          include_terms: Json
          issuer_id: string
          issuer_name: string
          languages?: string[]
          notes?: string | null
          sample_query: string
          ticker: string
        }
        Update: {
          created_at?: string | null
          exclude_terms?: Json
          geography?: string[]
          ibex_status?: string
          include_terms?: Json
          issuer_id?: string
          issuer_name?: string
          languages?: string[]
          notes?: string | null
          sample_query?: string
          ticker?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
