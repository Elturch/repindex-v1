import type { SupabaseClient } from "@supabase/supabase-js";
import { SKILLS_REGISTRY } from "./rixSkills";
import { skillInterpretQuery, type InterpretedQuery } from "./skills/skillInterpretQuery";
import type { SkillResult } from "./skills/shared";

// ── Unified DataPack ────────────────────────────────────────────────
export interface UnifiedDataPack {
  intent: InterpretedQuery["intent"];
  confidence: number;
  entities: string[];
  filters: Record<string, string>;
  skill_results: Record<string, SkillResult>;
  layer_used: 1 | 2 | 3;
  execution_log: string[];
  total_ms: number;
}

export interface OrchestratorInput {
  question: string;
  ticker?: string;
  target_name?: string;
  context?: {
    previous_company?: string;
    previous_ticker?: string;
  };
}

// ── Main orchestrator ───────────────────────────────────────────────
export async function orchestrateSkills(
  input: OrchestratorInput,
  supabase: SupabaseClient
): Promise<UnifiedDataPack> {
  const start = Date.now();
  const log: string[] = [];

  // Step 1: Interpret the query
  log.push("→ Running skillInterpretQuery");
  const interpretation = skillInterpretQuery({
    question: input.question,
    context: input.context,
  });

  if (!interpretation.success || !interpretation.data) {
    log.push("✗ Interpretation failed, falling back to Layer 3");
    return buildFallbackPack(input, supabase, log, start);
  }

  const { intent, entities, filters, recommended_skills, confidence } = interpretation.data;
  log.push(`✓ Intent: ${intent} (confidence: ${confidence}), skills: [${recommended_skills.join(", ")}]`);

  // ── LAYER 1: Execute recommended skills ─────────────────────────
  if (recommended_skills.length > 0) {
    log.push("→ Layer 1: Executing recommended skills in parallel");

    const skillParams = buildSkillParams(input, filters);
    const results = await executeSkillsInParallel(recommended_skills, skillParams, supabase, log);

    const hasData = Object.values(results).some((r) => r.success && r.data);

    if (hasData) {
      log.push(`✓ Layer 1 complete: ${Object.keys(results).length} skills executed`);
      return {
        intent,
        confidence,
        entities,
        filters,
        skill_results: results,
        layer_used: 1,
        execution_log: log,
        total_ms: Date.now() - start,
      };
    }

    log.push("✗ Layer 1 returned no usable data");
  }

  // ── LAYER 2: F2 SQL Expert (stub for Phase 2) ────────────────────
  log.push("→ Layer 2: F2 SQL Expert (not wired yet — Phase 2)");
  // In Phase 2, this will call generateAndExecuteSQLQueries from chat-intelligence

  // ── LAYER 3: Graceful fallback ───────────────────────────────────
  log.push("→ Layer 3: Graceful fallback");
  return buildFallbackPack(input, supabase, log, start);
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildSkillParams(
  input: OrchestratorInput,
  filters: Record<string, string>
): Record<string, unknown> {
  return {
    ticker: input.ticker || input.context?.previous_ticker,
    target_name: input.target_name || input.context?.previous_company,
    question: input.question,
    ...filters,
  };
}

async function executeSkillsInParallel(
  skillIds: string[],
  params: Record<string, unknown>,
  supabase: SupabaseClient,
  log: string[]
): Promise<Record<string, SkillResult>> {
  const promises = skillIds.map(async (id) => {
    const skill = SKILLS_REGISTRY.get(id);
    if (!skill) {
      log.push(`  ✗ Skill "${id}" not found in registry`);
      return [id, { success: false, error: `Skill ${id} not found` }] as const;
    }
    if (skill.status === "disabled") {
      log.push(`  ⊘ Skill "${id}" is disabled`);
      return [id, { success: false, error: `Skill ${id} is disabled` }] as const;
    }

    try {
      log.push(`  → Executing ${id}`);
      const result = await skill.execute(params, supabase);
      log.push(`  ${result.success ? "✓" : "✗"} ${id}: ${result.success ? "OK" : result.error}`);
      return [id, result] as const;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log.push(`  ✗ ${id} threw: ${msg}`);
      return [id, { success: false, error: msg }] as const;
    }
  });

  const settled = await Promise.allSettled(promises);
  const results: Record<string, SkillResult> = {};

  for (const s of settled) {
    if (s.status === "fulfilled") {
      const [id, result] = s.value;
      results[id] = result;
    }
  }

  return results;
}

async function buildFallbackPack(
  input: OrchestratorInput,
  supabase: SupabaseClient,
  log: string[],
  start: number
): Promise<UnifiedDataPack> {
  const results: Record<string, SkillResult> = {};

  // Try to at least get company detail
  const ticker = input.ticker || input.context?.previous_ticker;
  const name = input.target_name || input.context?.previous_company;

  if (ticker || name) {
    const detailSkill = SKILLS_REGISTRY.get("skillGetCompanyDetail");
    if (detailSkill) {
      try {
        const result = await detailSkill.execute({ ticker, issuer_name: name }, supabase);
        results.skillGetCompanyDetail = result;
        log.push(`  ${result.success ? "✓" : "✗"} Fallback company detail: ${result.success ? "OK" : result.error}`);
      } catch {
        log.push("  ✗ Fallback company detail threw");
      }
    }
  }

  log.push("✓ Layer 3 fallback complete");

  return {
    intent: "general_question",
    confidence: 0.2,
    entities: [],
    filters: {},
    skill_results: results,
    layer_used: 3,
    execution_log: log,
    total_ms: Date.now() - start,
  };
}
