export const METRIC_NAMES = ['RIX','CEM','RMM','SIM','DRM','NVM','GAM','DCM','CXM'] as const;
export type MetricName = typeof METRIC_NAMES[number];

export const MODEL_NAMES = ['ChatGPT','Perplexity','Gemini','DeepSeek','Grok','Qwen'] as const;
export type ModelName = typeof MODEL_NAMES[number];

export const INTENTS = ['company_analysis','sector_ranking','comparison','model_divergence','period_evolution','general_question','out_of_scope'] as const;
export type Intent = typeof INTENTS[number];

export const MODES = ['period','snapshot'] as const;
export type Mode = typeof MODES[number];

export interface ResolvedEntity {
  ticker: string;
  company_name: string;
  sector_category: string | null;
  source: 'exact' | 'fuzzy' | 'semantic_bridge' | 'inherited';
}

export interface ResolvedTemporal {
  from: string;
  to: string;
  requested_label: string;
  snapshots_expected: number;
  snapshots_available: number;
  coverage_ratio: number;
  is_partial: boolean;
  /** Original requested window (Q1 = 2026-01-01 → 2026-03-31). Used by skills
   *  for SQL bounds when they want to query the FULL window regardless of
   *  how much real data exists. Falls back to from/to if not present. */
  requested_from?: string;
  requested_to?: string;
  /** PHASE 4 — Audit trail for the "esta semana" / "this week" resolver.
   *  - "current_week_complete": ≥1 snapshot found inside the current ISO week.
   *  - "current_week_partial": current week has snapshots but fewer than expected models.
   *  - "fallback_last_complete_week": current week is empty (e.g. Saturday pre-Sunday sweep);
   *    window resolved to the last week with snapshots.
   *  Absent for any other temporal intent. */
  window_reason?: "current_week_complete" | "current_week_partial" | "fallback_last_complete_week";
}

export interface PreviousContext {
  ticker: string;
  company_name: string;
  sector_category: string | null;
  models?: ModelName[];
  temporal_from?: string;
  temporal_to?: string;
}

export interface ParsedQuery {
  intent: Intent;
  entities: ResolvedEntity[];
  temporal: ResolvedTemporal;
  models: ModelName[];
  mode: Mode;
  raw_question: string;
  /**
   * FASE C — canonical pregunta to use everywhere downstream
   * (parsers, skills, regex, "top N" detection, ibex hint, etc.).
   * Equals `originalQuestion ?? normalizedQuestion`, never the
   * normalised query (which strips temporal markers like "primer
   * trimestre"). Mirrors `raw_question` for back-compat but is
   * named explicitly so future code never picks the wrong one.
   */
  effective_question: string;
  /** Display-only / logging. The output of normalize-query (if any). */
  normalized_question: string;
  is_followup: boolean;
  inherited_context?: PreviousContext;
  /**
   * Optional explicit ticker scope. When set, sector_ranking / comparison
   * skills MUST filter `WHERE ticker IN (...)` and ignore sector_category.
   * Populated by the orchestrator when a sub-segment match is detected
   * (e.g. "grupos hospitalarios" → ['HMH','QS','HOS','HLA','VIA','VIT']).
   */
  scope_tickers?: string[];
}

export interface MetricAggregation {
  metric: MetricName;
  mean: number;
  median: number;
  min: number;
  max: number;
  first_week: number;
  last_week: number;
  delta_period: number;
  trend: 'alcista' | 'bajista' | 'estable';
  volatility: number;
  weeks_count: number;
}

export interface DataPack {
  entity: ResolvedEntity;
  temporal: ResolvedTemporal;
  mode: Mode;
  models_used: ModelName[];
  models_coverage: { requested: ModelName[]; with_data: ModelName[]; missing: ModelName[] };
  metrics: MetricAggregation[];
  raw_rows: any[];
  pre_rendered_tables: string[];
  period_summary?: { rix_mean: number; rix_trend: string; strongest: MetricName; weakest: MetricName; most_volatile: MetricName };
  consensus?: { ranking_position: number; total_companies: number; divergence: number };
  /**
   * P0-1 — Optional structured cited-sources report attached by skills that
   * compute it (companyAnalysis, sectorRanking). Consumed by index.ts to
   * emit the `verifiedSources` field in the SSE `done` metadata so the
   * frontend bibliography renderer (PDF/HTML export) has structured data.
   * Typed as `unknown` here to avoid pulling the datapack module into the
   * shared types file; the consumer casts to CitedSourcesReport.
   */
  cited_sources_report?: unknown;
}

export interface SkillInput {
  parsed: ParsedQuery;
  supabase: any;
  logPrefix: string;
  /**
   * Optional streaming callback. When provided, the skill MUST emit the LLM
   * answer through this callback as it generates (token-by-token). The skill
   * still returns the full text in datapack.pre_rendered_tables[0] so the
   * orchestrator/test layer can use the non-streaming view.
   */
  onChunk?: (delta: string) => void;
}

export interface ReportMetadata {
  models_used: string;
  period_from: string;
  period_to: string;
  observations_count: number;
  divergence_level: string;
  divergence_points: number;
  unique_companies: number;
  unique_weeks: number;
}

export interface SkillOutput {
  datapack: DataPack;
  prompt_modules: string[];
  metadata: ReportMetadata;
}

export interface Skill {
  name: string;
  intents: Intent[];
  execute(input: SkillInput): Promise<SkillOutput>;
}

export interface OrchestratorResponse {
  type: 'guard_rejection' | 'llm_synthesis';
  content: string;
  datapack?: DataPack;
  metadata?: ReportMetadata;
  intent?: Intent;
  entities?: ResolvedEntity[];
  period_from?: string;
  period_to?: string;
  models_used?: ModelName[];
  data_count?: number;
  methodology?: Record<string, unknown>;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  report_context?: PreviousContext;
}