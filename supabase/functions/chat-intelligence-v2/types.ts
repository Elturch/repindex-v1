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
}

export interface PreviousContext {
  ticker: string;
  company_name: string;
  sector_category: string | null;
  models: ModelName[];
  temporal_from: string;
  temporal_to: string;
}

export interface ParsedQuery {
  intent: Intent;
  entities: ResolvedEntity[];
  temporal: ResolvedTemporal;
  models: ModelName[];
  mode: Mode;
  raw_question: string;
  is_followup: boolean;
  inherited_context?: PreviousContext;
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
}

export interface SkillInput {
  parsed: ParsedQuery;
  supabase: any;
  logPrefix: string;
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
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  report_context?: PreviousContext;
}