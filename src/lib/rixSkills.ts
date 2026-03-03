import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillResult } from "./skills/shared";

// ── Skill interface ─────────────────────────────────────────────────
export interface RixSkill {
  id: string;
  name: string;
  description: string;
  layer: "data" | "logic" | "presentation";
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  status: "active" | "beta" | "disabled";
  execute: (params: Record<string, unknown>, supabase: SupabaseClient) => Promise<SkillResult>;
}

// ── Import all skills ───────────────────────────────────────────────
import { skillGetCompanyScores } from "./skills/skillGetCompanyScores";
import { skillGetCompanyRanking } from "./skills/skillGetCompanyRanking";
import { skillGetCompanyEvolution } from "./skills/skillGetCompanyEvolution";
import { skillGetCompanyDetail } from "./skills/skillGetCompanyDetail";
import { skillGetSectorComparison } from "./skills/skillGetSectorComparison";
import { skillGetDivergenceAnalysis } from "./skills/skillGetDivergenceAnalysis";
import { skillGetRawTexts } from "./skills/skillGetRawTexts";
import { skillInterpretQuery } from "./skills/skillInterpretQuery";

// ── Registry ────────────────────────────────────────────────────────
export const SKILLS_REGISTRY = new Map<string, RixSkill>([
  [
    "skillGetCompanyScores",
    {
      id: "skillGetCompanyScores",
      name: "Company Scores",
      description: "Gets per-model RIX scores and subscores for a company on the latest valid Sunday snapshot",
      layer: "data",
      inputSchema: { ticker: "string?", target_name: "string?", batch_date: "string?" },
      outputSchema: { company: "string", ticker: "string", batch_date: "string", scores: "ModelScore[]" },
      status: "active",
      execute: (params, supabase) => skillGetCompanyScores(params as never, supabase),
    },
  ],
  [
    "skillGetCompanyRanking",
    {
      id: "skillGetCompanyRanking",
      name: "Company Ranking",
      description: "Ranks companies by median RIX score, filterable by sector or IBEX family",
      layer: "data",
      inputSchema: { sector_category: "string?", ibex_family_code: "string?", top_n: "number?", batch_date: "string?" },
      outputSchema: { batch_date: "string", filter: "string", ranking: "RankedCompany[]" },
      status: "active",
      execute: (params, supabase) => skillGetCompanyRanking(params as never, supabase),
    },
  ],
  [
    "skillGetCompanyEvolution",
    {
      id: "skillGetCompanyEvolution",
      name: "Company Evolution",
      description: "Gets temporal RIX score evolution from rix_trends, paginated to overcome PostgREST limits",
      layer: "data",
      inputSchema: { ticker: "string", weeks_back: "number?" },
      outputSchema: { ticker: "string", company_name: "string", evolution: "EvolutionPoint[]" },
      status: "active",
      execute: (params, supabase) => skillGetCompanyEvolution(params as never, supabase),
    },
  ],
  [
    "skillGetCompanyDetail",
    {
      id: "skillGetCompanyDetail",
      name: "Company Detail",
      description: "Gets master data from repindex_root_issuers + latest corporate snapshot",
      layer: "data",
      inputSchema: { ticker: "string?", issuer_name: "string?" },
      outputSchema: { issuer_name: "string", ticker: "string", sector_category: "string", corporate: "object?" },
      status: "active",
      execute: (params, supabase) => skillGetCompanyDetail(params as never, supabase),
    },
  ],
  [
    "skillGetSectorComparison",
    {
      id: "skillGetSectorComparison",
      name: "Sector Comparison",
      description: "Compares all companies within a sector by median RIX score",
      layer: "data",
      inputSchema: { sector_category: "string", batch_date: "string?" },
      outputSchema: { sector: "string", batch_date: "string", companies: "SectorCompany[]" },
      status: "active",
      execute: (params, supabase) => skillGetSectorComparison(params as never, supabase),
    },
  ],
  [
    "skillGetDivergenceAnalysis",
    {
      id: "skillGetDivergenceAnalysis",
      name: "Divergence Analysis",
      description: "Analyzes inter-model score divergence per metric for a company",
      layer: "data",
      inputSchema: { ticker: "string", batch_date: "string?" },
      outputSchema: { ticker: "string", divergences: "MetricDivergence[]", overall_consensus: "string" },
      status: "active",
      execute: (params, supabase) => skillGetDivergenceAnalysis(params as never, supabase),
    },
  ],
  [
    "skillGetRawTexts",
    {
      id: "skillGetRawTexts",
      name: "Raw Texts",
      description: "Gets raw AI-generated summaries and key points per model for a company",
      layer: "data",
      inputSchema: { ticker: "string", batch_date: "string?" },
      outputSchema: { ticker: "string", texts: "ModelText[]" },
      status: "active",
      execute: (params, supabase) => skillGetRawTexts(params as never, supabase),
    },
  ],
  [
    "skillInterpretQuery",
    {
      id: "skillInterpretQuery",
      name: "Interpret Query",
      description: "Classifies user intent via regex patterns and maps to recommended data skills",
      layer: "logic",
      inputSchema: { question: "string", context: "object?" },
      outputSchema: { intent: "QueryIntent", entities: "string[]", recommended_skills: "string[]" },
      status: "active",
      execute: (params) => Promise.resolve(skillInterpretQuery(params as never)),
    },
  ],
]);

// ── Helpers ──────────────────────────────────────────────────────────
export function getSkillsByLayer(layer: RixSkill["layer"]): RixSkill[] {
  return Array.from(SKILLS_REGISTRY.values()).filter((s) => s.layer === layer);
}

export function getActiveSkills(): RixSkill[] {
  return Array.from(SKILLS_REGISTRY.values()).filter((s) => s.status === "active");
}
