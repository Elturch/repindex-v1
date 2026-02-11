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
      api_cost_config: {
        Row: {
          id: string
          input_cost_per_million: number
          model: string
          output_cost_per_million: number
          provider: string
          updated_at: string
        }
        Insert: {
          id?: string
          input_cost_per_million: number
          model: string
          output_cost_per_million: number
          provider: string
          updated_at?: string
        }
        Update: {
          id?: string
          input_cost_per_million?: number
          model?: string
          output_cost_per_million?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          action_type: string
          batch_id: string | null
          created_at: string
          edge_function: string
          estimated_cost_usd: number
          id: string
          input_tokens: number
          metadata: Json | null
          model: string
          output_tokens: number
          pipeline_stage: string | null
          provider: string
          session_id: string | null
          ticker: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          batch_id?: string | null
          created_at?: string
          edge_function: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model: string
          output_tokens?: number
          pipeline_stage?: string | null
          provider: string
          session_id?: string | null
          ticker?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          batch_id?: string | null
          created_at?: string
          edge_function?: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model?: string
          output_tokens?: number
          pipeline_stage?: string | null
          provider?: string
          session_id?: string | null
          ticker?: string | null
          user_id?: string | null
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
          conversation_id: string | null
          created_at: string | null
          depth_level: string | null
          documents_found: number | null
          drumroll_question: Json | null
          id: string
          question_category: string | null
          refined_question: string | null
          refinement_confidence: number | null
          role: string
          session_id: string
          structured_data_found: number | null
          suggested_questions: Json | null
          user_id: string | null
          week: string | null
        }
        Insert: {
          analysis_type?: string | null
          company?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string | null
          depth_level?: string | null
          documents_found?: number | null
          drumroll_question?: Json | null
          id?: string
          question_category?: string | null
          refined_question?: string | null
          refinement_confidence?: number | null
          role: string
          session_id: string
          structured_data_found?: number | null
          suggested_questions?: Json | null
          user_id?: string | null
          week?: string | null
        }
        Update: {
          analysis_type?: string | null
          company?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          depth_level?: string | null
          documents_found?: number | null
          drumroll_question?: Json | null
          id?: string
          question_category?: string | null
          refined_question?: string | null
          refinement_confidence?: number | null
          role?: string
          session_id?: string
          structured_data_found?: number | null
          suggested_questions?: Json | null
          user_id?: string | null
          week?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_intelligence_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "user_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_response_feedback: {
        Row: {
          created_at: string
          feedback_comment: string | null
          id: string
          included_in_vector_store: boolean | null
          message_content: string
          message_index: number
          metadata: Json | null
          rating: string
          session_id: string
          user_id: string | null
          user_question: string | null
          vector_store_included_at: string | null
        }
        Insert: {
          created_at?: string
          feedback_comment?: string | null
          id?: string
          included_in_vector_store?: boolean | null
          message_content: string
          message_index: number
          metadata?: Json | null
          rating: string
          session_id: string
          user_id?: string | null
          user_question?: string | null
          vector_store_included_at?: string | null
        }
        Update: {
          created_at?: string
          feedback_comment?: string | null
          id?: string
          included_in_vector_store?: boolean | null
          message_content?: string
          message_index?: number
          metadata?: Json | null
          rating?: string
          session_id?: string
          user_id?: string | null
          user_question?: string | null
          vector_store_included_at?: string | null
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
      client_companies: {
        Row: {
          billing_address: string | null
          billing_city: string | null
          billing_country: string | null
          billing_metadata: Json | null
          billing_name: string | null
          billing_postal_code: string | null
          company_name: string
          contact_email: string | null
          contact_phone: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          monthly_fee: number | null
          notes: string | null
          plan_type: string | null
          tax_id: string | null
          ticker: string | null
          updated_at: string | null
        }
        Insert: {
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_metadata?: Json | null
          billing_name?: string | null
          billing_postal_code?: string | null
          company_name: string
          contact_email?: string | null
          contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          monthly_fee?: number | null
          notes?: string | null
          plan_type?: string | null
          tax_id?: string | null
          ticker?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_metadata?: Json | null
          billing_name?: string | null
          billing_postal_code?: string | null
          company_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          monthly_fee?: number | null
          notes?: string | null
          plan_type?: string | null
          tax_id?: string | null
          ticker?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      competitor_relationships: {
        Row: {
          competitor_ticker: string
          confidence_score: number | null
          created_at: string | null
          id: string
          notes: string | null
          relationship_type: string | null
          source_ticker: string
          updated_at: string | null
          validated_by: string | null
        }
        Insert: {
          competitor_ticker: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          relationship_type?: string | null
          source_ticker: string
          updated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          competitor_ticker?: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          relationship_type?: string | null
          source_ticker?: string
          updated_at?: string | null
          validated_by?: string | null
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
      corporate_news: {
        Row: {
          article_url: string
          author: string | null
          body_excerpt: string | null
          category: string | null
          created_at: string
          headline: string
          id: string
          lead_paragraph: string | null
          published_date: string | null
          raw_markdown: string | null
          snapshot_date: string
          source_type: string | null
          ticker: string
        }
        Insert: {
          article_url: string
          author?: string | null
          body_excerpt?: string | null
          category?: string | null
          created_at?: string
          headline: string
          id?: string
          lead_paragraph?: string | null
          published_date?: string | null
          raw_markdown?: string | null
          snapshot_date?: string
          source_type?: string | null
          ticker: string
        }
        Update: {
          article_url?: string
          author?: string | null
          body_excerpt?: string | null
          category?: string | null
          created_at?: string
          headline?: string
          id?: string
          lead_paragraph?: string | null
          published_date?: string | null
          raw_markdown?: string | null
          snapshot_date?: string
          source_type?: string | null
          ticker?: string
        }
        Relationships: []
      }
      corporate_scrape_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          issuer_name: string | null
          latest_news_date: string | null
          news_found_count: number | null
          result_type: string | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          sweep_id: string
          ticker: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          issuer_name?: string | null
          latest_news_date?: string | null
          news_found_count?: number | null
          result_type?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          sweep_id: string
          ticker: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          issuer_name?: string | null
          latest_news_date?: string | null
          news_found_count?: number | null
          result_type?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          sweep_id?: string
          ticker?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      corporate_snapshots: {
        Row: {
          blog_url: string | null
          ceo_name: string | null
          chairman_name: string | null
          company_description: string | null
          created_at: string | null
          employees_approx: number | null
          error_message: string | null
          extraction_confidence: Json | null
          fiscal_year: string | null
          founded_year: number | null
          headquarters_city: string | null
          headquarters_country: string | null
          id: string
          investor_relations_url: string | null
          last_reported_revenue: string | null
          mission_statement: string | null
          news_articles_count: number | null
          other_executives: Json | null
          pages_scraped: number | null
          president_name: string | null
          press_room_url: string | null
          raw_markdown: string | null
          scrape_status: string | null
          snapshot_date: string
          snapshot_date_only: string
          source_urls: string[] | null
          ticker: string
          vision_statement: string | null
        }
        Insert: {
          blog_url?: string | null
          ceo_name?: string | null
          chairman_name?: string | null
          company_description?: string | null
          created_at?: string | null
          employees_approx?: number | null
          error_message?: string | null
          extraction_confidence?: Json | null
          fiscal_year?: string | null
          founded_year?: number | null
          headquarters_city?: string | null
          headquarters_country?: string | null
          id?: string
          investor_relations_url?: string | null
          last_reported_revenue?: string | null
          mission_statement?: string | null
          news_articles_count?: number | null
          other_executives?: Json | null
          pages_scraped?: number | null
          president_name?: string | null
          press_room_url?: string | null
          raw_markdown?: string | null
          scrape_status?: string | null
          snapshot_date?: string
          snapshot_date_only?: string
          source_urls?: string[] | null
          ticker: string
          vision_statement?: string | null
        }
        Update: {
          blog_url?: string | null
          ceo_name?: string | null
          chairman_name?: string | null
          company_description?: string | null
          created_at?: string | null
          employees_approx?: number | null
          error_message?: string | null
          extraction_confidence?: Json | null
          fiscal_year?: string | null
          founded_year?: number | null
          headquarters_city?: string | null
          headquarters_country?: string | null
          id?: string
          investor_relations_url?: string | null
          last_reported_revenue?: string | null
          mission_statement?: string | null
          news_articles_count?: number | null
          other_executives?: Json | null
          pages_scraped?: number | null
          president_name?: string | null
          press_room_url?: string | null
          raw_markdown?: string | null
          scrape_status?: string | null
          snapshot_date?: string
          snapshot_date_only?: string
          source_urls?: string[] | null
          ticker?: string
          vision_statement?: string | null
        }
        Relationships: []
      }
      cron_triggers: {
        Row: {
          action: string
          created_at: string | null
          id: string
          params: Json | null
          processed_at: string | null
          result: Json | null
          status: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          params?: Json | null
          processed_at?: string | null
          result?: Json | null
          status?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          params?: Json | null
          processed_at?: string | null
          result?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      data_quality_reports: {
        Row: {
          created_at: string | null
          error_type: string | null
          id: string
          model_name: string
          original_error: string | null
          repair_attempts: number | null
          repaired_at: string | null
          status: string
          sweep_id: string
          ticker: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          error_type?: string | null
          id?: string
          model_name: string
          original_error?: string | null
          repair_attempts?: number | null
          repaired_at?: string | null
          status?: string
          sweep_id: string
          ticker: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          error_type?: string | null
          id?: string
          model_name?: string
          original_error?: string | null
          repair_attempts?: number | null
          repaired_at?: string | null
          status?: string
          sweep_id?: string
          ticker?: string
          week_start?: string
        }
        Relationships: []
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
      interested_leads: {
        Row: {
          admin_notes: string | null
          consent_date: string
          contact_consent: boolean
          contacted_at: string | null
          converted_at: string | null
          created_at: string
          email: string
          id: string
          ip_address: string | null
          qualification_score: number | null
          qualification_status: string | null
          source: string
          status: string
          user_agent: string | null
        }
        Insert: {
          admin_notes?: string | null
          consent_date?: string
          contact_consent?: boolean
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          qualification_score?: number | null
          qualification_status?: string | null
          source?: string
          status?: string
          user_agent?: string | null
        }
        Update: {
          admin_notes?: string | null
          consent_date?: string
          contact_consent?: boolean
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          qualification_score?: number | null
          qualification_status?: string | null
          source?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          company_id: string
          created_at: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          line_items: Json | null
          notes: string | null
          paid_at: string | null
          pdf_url: string | null
          status: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          line_items?: Json | null
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          status?: string | null
          subtotal: number
          tax_amount: number
          tax_rate?: number | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          line_items?: Json | null
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification_responses: {
        Row: {
          additional_notes: string | null
          companies_interested: string[] | null
          contactability_score: number | null
          created_at: string | null
          email_domain: string | null
          form_sent_at: string | null
          id: string
          is_corporate_email: boolean | null
          lead_id: string
          role_type: string | null
          sectors_interested: string[] | null
          submitted_at: string | null
          token: string
          token_expires_at: string
        }
        Insert: {
          additional_notes?: string | null
          companies_interested?: string[] | null
          contactability_score?: number | null
          created_at?: string | null
          email_domain?: string | null
          form_sent_at?: string | null
          id?: string
          is_corporate_email?: boolean | null
          lead_id: string
          role_type?: string | null
          sectors_interested?: string[] | null
          submitted_at?: string | null
          token: string
          token_expires_at: string
        }
        Update: {
          additional_notes?: string | null
          companies_interested?: string[] | null
          contactability_score?: number | null
          created_at?: string | null
          email_domain?: string | null
          form_sent_at?: string | null
          id?: string
          is_corporate_email?: boolean | null
          lead_id?: string
          role_type?: string | null
          sectors_interested?: string[] | null
          submitted_at?: string | null
          token?: string
          token_expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_qualification_responses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "interested_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          content_template: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          name: string
          notification_type: string
          priority: string | null
          start_date: string | null
          target_personas: string[] | null
          title_template: string
          total_clicked: number | null
          total_read: number | null
          total_sent: number | null
          updated_at: string
        }
        Insert: {
          content_template: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notification_type: string
          priority?: string | null
          start_date?: string | null
          target_personas?: string[] | null
          title_template: string
          total_clicked?: number | null
          total_read?: number | null
          total_sent?: number | null
          updated_at?: string
        }
        Update: {
          content_template?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notification_type?: string
          priority?: string | null
          start_date?: string | null
          target_personas?: string[] | null
          title_template?: string
          total_clicked?: number | null
          total_read?: number | null
          total_sent?: number | null
          updated_at?: string
        }
        Relationships: []
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
      news_articles: {
        Row: {
          body: string
          canonical_url: string | null
          category: string | null
          chart_data: Json | null
          companies: string[] | null
          created_at: string
          data_highlight: string | null
          headline: string
          id: string
          is_main_story: boolean | null
          keywords: string[] | null
          lead: string
          meta_description: string | null
          og_image_url: string | null
          published_at: string | null
          reading_time_minutes: number | null
          slug: string
          status: string | null
          view_count: number | null
          week_id: string | null
        }
        Insert: {
          body: string
          canonical_url?: string | null
          category?: string | null
          chart_data?: Json | null
          companies?: string[] | null
          created_at?: string
          data_highlight?: string | null
          headline: string
          id?: string
          is_main_story?: boolean | null
          keywords?: string[] | null
          lead: string
          meta_description?: string | null
          og_image_url?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          slug: string
          status?: string | null
          view_count?: number | null
          week_id?: string | null
        }
        Update: {
          body?: string
          canonical_url?: string | null
          category?: string | null
          chart_data?: Json | null
          companies?: string[] | null
          created_at?: string
          data_highlight?: string | null
          headline?: string
          id?: string
          is_main_story?: boolean | null
          keywords?: string[] | null
          lead?: string
          meta_description?: string | null
          og_image_url?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          slug?: string
          status?: string | null
          view_count?: number | null
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weekly_news"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_analytics: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          notification_id: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          notification_id?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          notification_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_analytics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_analytics_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "user_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_health_checks: {
        Row: {
          check_type: string
          checked_at: string | null
          details: Json | null
          id: string
          resolved_at: string | null
          status: string
          sweep_id: string | null
        }
        Insert: {
          check_type: string
          checked_at?: string | null
          details?: Json | null
          id?: string
          resolved_at?: string | null
          status: string
          sweep_id?: string | null
        }
        Update: {
          check_type?: string
          checked_at?: string | null
          details?: Json | null
          id?: string
          resolved_at?: string | null
          status?: string
          sweep_id?: string | null
        }
        Relationships: []
      }
      pipeline_logs: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          metadata: Json | null
          model_name: string | null
          stage: string
          status: string
          sweep_id: string | null
          ticker: string | null
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          model_name?: string | null
          stage: string
          status: string
          sweep_id?: string | null
          ticker?: string | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          model_name?: string | null
          stage?: string
          status?: string
          sweep_id?: string | null
          ticker?: string | null
        }
        Relationships: []
      }
      profile_analysis_batches: {
        Row: {
          ai_provider: string | null
          analysis_duration_ms: number | null
          analyzed_at: string
          id: string
          notes: string | null
          total_personas_generated: number | null
          total_users_analyzed: number | null
        }
        Insert: {
          ai_provider?: string | null
          analysis_duration_ms?: number | null
          analyzed_at?: string
          id?: string
          notes?: string | null
          total_personas_generated?: number | null
          total_users_analyzed?: number | null
        }
        Update: {
          ai_provider?: string | null
          analysis_duration_ms?: number | null
          analyzed_at?: string
          id?: string
          notes?: string | null
          total_personas_generated?: number | null
          total_users_analyzed?: number | null
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
          subsector: string | null
          ticker: string
          verified_competitors: Json | null
          website: string | null
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
          subsector?: string | null
          ticker: string
          verified_competitors?: Json | null
          website?: string | null
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
          subsector?: string | null
          ticker?: string
          verified_competitors?: Json | null
          website?: string | null
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
      rix_runs_v2: {
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
          analysis_completed_at: string | null
          batch_execution_date: string
          created_at: string
          execution_time_ms: number | null
          id: string
          model_errors: Json | null
          respuesta_bruto_claude: string | null
          respuesta_bruto_grok: string | null
          respuesta_bruto_qwen: string | null
          search_completed_at: string | null
          source_pipeline: string
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
          analysis_completed_at?: string | null
          batch_execution_date?: string
          created_at?: string
          execution_time_ms?: number | null
          id?: string
          model_errors?: Json | null
          respuesta_bruto_claude?: string | null
          respuesta_bruto_grok?: string | null
          respuesta_bruto_qwen?: string | null
          search_completed_at?: string | null
          source_pipeline?: string
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
          analysis_completed_at?: string | null
          batch_execution_date?: string
          created_at?: string
          execution_time_ms?: number | null
          id?: string
          model_errors?: Json | null
          respuesta_bruto_claude?: string | null
          respuesta_bruto_grok?: string | null
          respuesta_bruto_qwen?: string | null
          search_completed_at?: string | null
          source_pipeline?: string
          updated_at?: string
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
      role_enrichment_analytics: {
        Row: {
          created_at: string
          enrichment_timestamp: string
          id: string
          original_question: string
          response_time_ms: number | null
          role_id: string
          role_name: string
          session_id: string
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          enrichment_timestamp?: string
          id?: string
          original_question: string
          response_time_ms?: number | null
          role_id: string
          role_name: string
          session_id: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          enrichment_timestamp?: string
          id?: string
          original_question?: string
          response_time_ms?: number | null
          role_id?: string
          role_name?: string
          session_id?: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      sales_conversations: {
        Row: {
          admin_user_id: string
          company_name: string
          created_at: string | null
          custom_context: string | null
          id: string
          is_archived: boolean | null
          is_starred: boolean | null
          message_ratings: Json
          messages: Json
          metadata: Json | null
          rix_questions: string[] | null
          target_profile: string
          ticker: string | null
          updated_at: string | null
        }
        Insert: {
          admin_user_id: string
          company_name: string
          created_at?: string | null
          custom_context?: string | null
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          message_ratings?: Json
          messages?: Json
          metadata?: Json | null
          rix_questions?: string[] | null
          target_profile?: string
          ticker?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_user_id?: string
          company_name?: string
          created_at?: string | null
          custom_context?: string | null
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          message_ratings?: Json
          messages?: Json
          metadata?: Json | null
          rix_questions?: string[] | null
          target_profile?: string
          ticker?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sales_pptx_exports: {
        Row: {
          admin_user_id: string
          company_name: string
          conversation_id: string | null
          created_at: string | null
          file_name: string
          high_rated_content: string[] | null
          id: string
          slide_designs: Json
          slides_count: number
          target_profile: string
        }
        Insert: {
          admin_user_id: string
          company_name: string
          conversation_id?: string | null
          created_at?: string | null
          file_name: string
          high_rated_content?: string[] | null
          id?: string
          slide_designs?: Json
          slides_count?: number
          target_profile: string
        }
        Update: {
          admin_user_id?: string
          company_name?: string
          conversation_id?: string | null
          created_at?: string | null
          file_name?: string
          high_rated_content?: string[] | null
          id?: string
          slide_designs?: Json
          slides_count?: number
          target_profile?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_pptx_exports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sales_conversations"
            referencedColumns: ["id"]
          },
        ]
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
      sweep_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          fase: number
          id: string
          issuer_name: string | null
          models_completed: number | null
          retry_count: number | null
          started_at: string | null
          status: string
          sweep_id: string
          ticker: string
          updated_at: string | null
          worker_id: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          fase: number
          id?: string
          issuer_name?: string | null
          models_completed?: number | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          sweep_id: string
          ticker: string
          updated_at?: string | null
          worker_id?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          fase?: number
          id?: string
          issuer_name?: string | null
          models_completed?: number | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          sweep_id?: string
          ticker?: string
          updated_at?: string | null
          worker_id?: number | null
        }
        Relationships: []
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
      user_activity_logs: {
        Row: {
          browser: string | null
          created_at: string | null
          device_type: string | null
          event_data: Json | null
          event_type: string
          id: string
          page_path: string | null
          page_title: string | null
          referrer: string | null
          screen_width: number | null
          session_id: string
          session_start_at: string | null
          time_on_page_seconds: number | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          device_type?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          screen_width?: number | null
          session_id: string
          session_start_at?: string | null
          time_on_page_seconds?: number | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          device_type?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          screen_width?: number | null
          session_id?: string
          session_start_at?: string | null
          time_on_page_seconds?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_snapshots: {
        Row: {
          activity_days: number | null
          analysis_batch_id: string
          created_at: string
          favorite_roles: string[] | null
          first_activity: string | null
          id: string
          last_activity: string | null
          mentioned_companies: string[] | null
          persona_id: string | null
          question_patterns: string[] | null
          total_conversations: number | null
          total_documents: number | null
          total_enrichments: number | null
          total_messages: number | null
          user_email: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          activity_days?: number | null
          analysis_batch_id: string
          created_at?: string
          favorite_roles?: string[] | null
          first_activity?: string | null
          id?: string
          last_activity?: string | null
          mentioned_companies?: string[] | null
          persona_id?: string | null
          question_patterns?: string[] | null
          total_conversations?: number | null
          total_documents?: number | null
          total_enrichments?: number | null
          total_messages?: number | null
          user_email: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          activity_days?: number | null
          analysis_batch_id?: string
          created_at?: string
          favorite_roles?: string[] | null
          first_activity?: string | null
          id?: string
          last_activity?: string | null
          mentioned_companies?: string[] | null
          persona_id?: string | null
          question_patterns?: string[] | null
          total_conversations?: number | null
          total_documents?: number | null
          total_enrichments?: number | null
          total_messages?: number | null
          user_email?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_snapshots_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "user_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_conversations: {
        Row: {
          created_at: string | null
          id: string
          is_archived: boolean | null
          is_starred: boolean | null
          last_message_at: string | null
          messages_count: number | null
          session_depth_level: string | null
          session_id: string
          session_role_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          last_message_at?: string | null
          messages_count?: number | null
          session_depth_level?: string | null
          session_id: string
          session_role_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          last_message_at?: string | null
          messages_count?: number | null
          session_depth_level?: string | null
          session_id?: string
          session_role_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_documents: {
        Row: {
          company_name: string | null
          content_html: string | null
          content_markdown: string | null
          conversation_id: string | null
          created_at: string | null
          document_type: string
          id: string
          is_archived: boolean | null
          is_starred: boolean | null
          metadata: Json | null
          pdf_url: string | null
          ticker: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          content_html?: string | null
          content_markdown?: string | null
          conversation_id?: string | null
          created_at?: string | null
          document_type: string
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          metadata?: Json | null
          pdf_url?: string | null
          ticker?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          content_html?: string | null
          content_markdown?: string | null
          conversation_id?: string | null
          created_at?: string | null
          document_type?: string
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          metadata?: Json | null
          pdf_url?: string | null
          ticker?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "user_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_engagement_scores: {
        Row: {
          calculated_at: string | null
          created_at: string | null
          current_persona_id: string | null
          depth_score: number | null
          engagement_score: number | null
          frequency_score: number | null
          id: string
          ignored_count_30d: number | null
          last_notification_at: string | null
          last_notification_type: string | null
          lifecycle_stage: string | null
          notifications_sent_24h: number | null
          notifications_sent_30d: number | null
          notifications_sent_7d: number | null
          persona_confidence: number | null
          preferred_days: string[] | null
          preferred_hour: number | null
          recency_score: number | null
          recent_notification_types: string[] | null
          response_score: number | null
          user_id: string
          weight_company_alert: number | null
          weight_data_refresh: number | null
          weight_engagement: number | null
          weight_feature_discovery: number | null
          weight_inactivity: number | null
          weight_newsroom: number | null
          weight_persona_tip: number | null
        }
        Insert: {
          calculated_at?: string | null
          created_at?: string | null
          current_persona_id?: string | null
          depth_score?: number | null
          engagement_score?: number | null
          frequency_score?: number | null
          id?: string
          ignored_count_30d?: number | null
          last_notification_at?: string | null
          last_notification_type?: string | null
          lifecycle_stage?: string | null
          notifications_sent_24h?: number | null
          notifications_sent_30d?: number | null
          notifications_sent_7d?: number | null
          persona_confidence?: number | null
          preferred_days?: string[] | null
          preferred_hour?: number | null
          recency_score?: number | null
          recent_notification_types?: string[] | null
          response_score?: number | null
          user_id: string
          weight_company_alert?: number | null
          weight_data_refresh?: number | null
          weight_engagement?: number | null
          weight_feature_discovery?: number | null
          weight_inactivity?: number | null
          weight_newsroom?: number | null
          weight_persona_tip?: number | null
        }
        Update: {
          calculated_at?: string | null
          created_at?: string | null
          current_persona_id?: string | null
          depth_score?: number | null
          engagement_score?: number | null
          frequency_score?: number | null
          id?: string
          ignored_count_30d?: number | null
          last_notification_at?: string | null
          last_notification_type?: string | null
          lifecycle_stage?: string | null
          notifications_sent_24h?: number | null
          notifications_sent_30d?: number | null
          notifications_sent_7d?: number | null
          persona_confidence?: number | null
          preferred_days?: string[] | null
          preferred_hour?: number | null
          recency_score?: number | null
          recent_notification_types?: string[] | null
          response_score?: number | null
          user_id?: string
          weight_company_alert?: number | null
          weight_data_refresh?: number | null
          weight_engagement?: number | null
          weight_feature_discovery?: number | null
          weight_inactivity?: number | null
          weight_newsroom?: number | null
          weight_persona_tip?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_engagement_scores_current_persona_id_fkey"
            columns: ["current_persona_id"]
            isOneToOne: false
            referencedRelation: "user_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_engagement_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          created_at: string
          email_frequency: string | null
          enable_company_alerts: boolean | null
          enable_data_refresh_alerts: boolean | null
          enable_email_notifications: boolean | null
          enable_inactivity_reminders: boolean | null
          enable_newsroom_alerts: boolean | null
          enable_persona_tips: boolean | null
          enable_surveys: boolean | null
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_frequency?: string | null
          enable_company_alerts?: boolean | null
          enable_data_refresh_alerts?: boolean | null
          enable_email_notifications?: boolean | null
          enable_inactivity_reminders?: boolean | null
          enable_newsroom_alerts?: boolean | null
          enable_persona_tips?: boolean | null
          enable_surveys?: boolean | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_frequency?: string | null
          enable_company_alerts?: boolean | null
          enable_data_refresh_alerts?: boolean | null
          enable_email_notifications?: boolean | null
          enable_inactivity_reminders?: boolean | null
          enable_newsroom_alerts?: boolean | null
          enable_persona_tips?: boolean | null
          enable_surveys?: boolean | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string
          created_by: string | null
          dismissed_at: string | null
          expires_at: string | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          metadata: Json | null
          notification_type: string
          persona_id: string | null
          priority: string | null
          read_at: string | null
          scheduled_for: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          metadata?: Json | null
          notification_type: string
          persona_id?: string | null
          priority?: string | null
          read_at?: string | null
          scheduled_for?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          metadata?: Json | null
          notification_type?: string
          persona_id?: string | null
          priority?: string | null
          read_at?: string | null
          scheduled_for?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      user_personas: {
        Row: {
          analysis_batch_id: string
          avg_conversations: number | null
          avg_documents: number | null
          avg_enrichments: number | null
          avg_session_frequency: number | null
          characteristics: string[]
          created_at: string
          description: string
          emoji: string
          id: string
          name: string
          user_count: number | null
        }
        Insert: {
          analysis_batch_id: string
          avg_conversations?: number | null
          avg_documents?: number | null
          avg_enrichments?: number | null
          avg_session_frequency?: number | null
          characteristics?: string[]
          created_at?: string
          description: string
          emoji?: string
          id?: string
          name: string
          user_count?: number | null
        }
        Update: {
          analysis_batch_id?: string
          avg_conversations?: number | null
          avg_documents?: number | null
          avg_enrichments?: number | null
          avg_session_frequency?: number | null
          characteristics?: string[]
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          name?: string
          user_count?: number | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          is_individual: boolean | null
          last_login: string | null
          login_count: number | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          is_individual?: boolean | null
          last_login?: string | null
          login_count?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          is_individual?: boolean | null
          last_login?: string | null
          login_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_preferences: {
        Row: {
          auto_enrich: boolean | null
          created_at: string
          default_role_id: string | null
          favorite_roles: string[] | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_enrich?: boolean | null
          created_at?: string
          default_role_id?: string | null
          favorite_roles?: string[] | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_enrich?: boolean | null
          created_at?: string
          default_role_id?: string | null
          favorite_roles?: string[] | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_news: {
        Row: {
          brief_news: Json | null
          data_quality_report: Json | null
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
          brief_news?: Json | null
          data_quality_report?: Json | null
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
          brief_news?: Json | null
          data_quality_report?: Json | null
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
      v_persona_evolution: {
        Row: {
          analyzed_at: string | null
          batch_id: string | null
          count_change: number | null
          emoji: string | null
          persona_name: string | null
          previous_count: number | null
          user_count: number | null
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
      claim_next_sweep_company: {
        Args: { p_sweep_id: string; p_worker_id: number }
        Returns: {
          id: string
          issuer_name: string
          ticker: string
        }[]
      }
      execute_sql: { Args: { sql_query: string }; Returns: Json }
      expand_entity_graph: {
        Args: { p_depth?: number; p_ticker: string }
        Returns: Json
      }
      expand_entity_graph_with_scores: {
        Args: { p_depth?: number; p_ticker: string; p_weeks?: number }
        Returns: Json
      }
      get_sector_graph: {
        Args: { p_include_scores?: boolean; p_sector: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_article_views: {
        Args: { article_slug: string }
        Returns: undefined
      }
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
      reset_daily_fatigue_counters: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
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
    Enums: {
      app_role: ["admin", "manager", "user"],
    },
  },
} as const
