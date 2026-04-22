// Agente Rix v2 — orchestrator (dispatch + prompt composition, max 300 LOC)
// See specs/architecture.md and specs/constraints.md.
// Parsers are real (Phase 2). Skills are still stubs (Phase 3).
import type {
  ConversationMessage,
  DataPack,
  Intent,
  OrchestratorResponse,
  ParsedQuery,
  PreviousContext,
  ReportMetadata,
  ResolvedEntity,
  ResolvedTemporal,
  Skill,
  SkillOutput,
} from "./types.ts";
import { classifyIntent } from "./parsers/intentClassifier.ts";
import { resolveEntity, resolveMultipleEntities } from "./parsers/entityResolver.ts";
import { parseTemporal, inferMode } from "./parsers/temporalParser.ts";
import { parseModels, allModels } from "./parsers/modelParser.ts";
import { checkInput } from "./guards/inputGuard.ts";
import { checkScope } from "./guards/scopeGuard.ts";
import { checkTemporal } from "./guards/temporalGuard.ts";
import { companyAnalysisSkill } from "./skills/companyAnalysis.ts";
import { sectorRankingSkill } from "./skills/sectorRanking.ts";
import { comparisonSkill } from "./skills/comparison.ts";
import { modelDivergenceSkill } from "./skills/modelDivergence.ts";
import { periodEvolutionSkill } from "./skills/periodEvolution.ts";

console.log("[RIX-V2][orch] module loaded | companyAnalysisSkill=", companyAnalysisSkill?.name);

function extractPreviousContext(history: ConversationMessage[]): PreviousContext | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role === "assistant" && m.report_context) return m.report_context;
  }
  return undefined;
}

// ── Fallback: infer previous entity from assistant text when report_context
// is missing. Looks for the canonical "**EMPRESA (TICKER)**" header that all
// v2 skills emit, or a bare 3-6 letter uppercase ticker on a line by itself.
function inferEntityFromAssistantText(history: ConversationMessage[]):
  { ticker: string; company_name: string } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role !== "assistant" || !m.content) continue;
    const txt = String(m.content);
    // Pattern 1: "**Análisis de Iberdrola (IBE)**" / "Iberdrola (IBE)"
    const m1 = txt.match(/([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\.\- ]{2,40})\s*\(([A-Z][A-Z0-9\.]{1,9})\)/);
    if (m1) return { company_name: m1[1].trim(), ticker: m1[2].toUpperCase() };
  }
  return null;
}

// Guards moved to ./guards/* (real implementations).

// ---------- Skill registry (stubs, real skills land in skills/ next phase) ----------
function buildMockDatapack(parsed: ParsedQuery): DataPack {
  const entity: ResolvedEntity =
    parsed.entities[0] ??
    {
      ticker: "N/A",
      company_name: "N/A",
      sector_category: null,
      source: "exact",
    };
  return {
    entity,
    temporal: parsed.temporal,
    mode: parsed.mode,
    models_used: parsed.models,
    models_coverage: { requested: parsed.models, with_data: parsed.models, missing: [] },
    metrics: [],
    raw_rows: [],
    pre_rendered_tables: [],
  };
}

function buildMockMetadata(parsed: ParsedQuery): ReportMetadata {
  return {
    models_used: parsed.models.join(","),
    period_from: parsed.temporal.from,
    period_to: parsed.temporal.to,
    observations_count: 0,
    divergence_level: "n/a",
    divergence_points: 0,
    unique_companies: parsed.entities.length,
    unique_weeks: parsed.temporal.snapshots_available,
  };
}

const stubSkill = (name: string, intents: Intent[]): Skill => ({
  name,
  intents,
  async execute({ parsed }) {
    const out: SkillOutput = {
      datapack: buildMockDatapack(parsed),
      prompt_modules: ["base", "antiHallucination", parsed.mode === "period" ? "periodMode" : "snapshotMode"],
      metadata: buildMockMetadata(parsed),
    };
    return out;
  },
});

const SKILL_REGISTRY: Skill[] = [
  companyAnalysisSkill,
  sectorRankingSkill,
  comparisonSkill,
  modelDivergenceSkill,
  periodEvolutionSkill,
  stubSkill("generalQuestion", ["general_question"]),
];

function selectSkill(intent: Intent): Skill | null {
  return SKILL_REGISTRY.find((s) => s.intents.includes(intent)) ?? null;
}

// ---------- Prompt composition (modules resolved in prompts/ next phase) ----------
const PROMPT_MODULE_STUBS: Record<string, string> = {
  base: "Eres el Agente Rix v2. Responde en espanol, tono profesional y didactico.",
  antiHallucination:
    "PROHIBIDO inventar datos, fechas o metricas. Si el datapack no contiene un valor, dilo explicitamente.",
  periodMode:
    "El modo es period: usa MEDIA del periodo, tendencia inicio->fin, min/max. NUNCA digas 'esta semana'.",
  snapshotMode:
    "El modo es snapshot: muestra el valor puntual y el delta vs la semana previa.",
  coverageRules:
    "Si la cobertura es parcial (coverage_ratio < 1), advierte al usuario en el primer parrafo.",
};

function composePrompt(modules: string[]): string {
  return modules
    .map((m) => PROMPT_MODULE_STUBS[m])
    .filter(Boolean)
    .join("\n\n");
}

// ---------- LLM synthesis (stub: returns a deterministic placeholder) ----------
async function synthesize(systemPrompt: string, datapack: DataPack, question: string): Promise<string> {
  // Real call to OpenAI o3/4.1 lands in next phase.
  console.log("[RIX-V2] synth stub | prompt_chars=", systemPrompt.length, "| entity=", datapack.entity.ticker);
  return [
    `**Agente Rix v2 (skeleton)**`,
    ``,
    `Pregunta: ${question}`,
    `Entidad: ${datapack.entity.company_name} (${datapack.entity.ticker})`,
    `Periodo: ${datapack.temporal.from} -> ${datapack.temporal.to} (${datapack.mode})`,
    `Modelos: ${datapack.models_used.join(", ")}`,
    ``,
    `_Respuesta sintetica pendiente de implementacion en proxima fase._`,
  ].join("\n");
}

// ---------- Public entry point ----------
export async function process(
  question: string,
  history: ConversationMessage[],
  supabase: any,
  onChunk?: (delta: string) => void,
): Promise<OrchestratorResponse> {
  const logPrefix = "[RIX-V2][orch]";
  console.log(`${logPrefix} processing | q="${question.slice(0, 80)}" | history=${history?.length ?? 0}`);

  // 1. Parsers (real)
  const intent = classifyIntent(question);
  // Entity resolution depends on intent:
  //  • sector_ranking  → no specific entity (skill aggregates everything).
  //  • comparison      → resolve multiple entities.
  //  • everything else → single entity.
  let entities: ResolvedEntity[] = [];
  if (intent === "sector_ranking") {
    // Skip: the skill builds its own scope from the question.
    entities = [];
  } else if (intent === "comparison") {
    entities = await resolveMultipleEntities(question, supabase);
    console.log(`${logPrefix} comparison | entities=${entities.length} | ${entities.map((e) => e.ticker).join(",")}`);
  } else {
    const single = await resolveEntity(question, supabase);
    if (single) entities = [single];
  }
  const primaryTicker = entities[0]?.ticker ?? null;
  const temporal: ResolvedTemporal = await parseTemporal(question, supabase, primaryTicker);
  const explicitModels = parseModels(question);
  const models = explicitModels.length > 0 ? explicitModels : allModels();
  const mode = inferMode(temporal);

  // 2. ParsedQuery
  const parsed: ParsedQuery = {
    intent,
    entities,
    temporal,
    models,
    mode,
    raw_question: question,
    is_followup: history.length > 0,
  };

  // 2b. Intent priority override: if a single concrete entity is resolved,
  //     `general_question` falls back to companyAnalysis when we have a clear
  //     entity; `period_evolution` and `model_divergence` now have their own
  //     real skills so they NO LONGER get promoted. Sector rankings and
  //     explicit comparisons (>= 2 entities) also keep their original intent.
  const PROMOTABLE_INTENTS: Intent[] = ["general_question"];
  if (
    entities.length === 1 &&
    PROMOTABLE_INTENTS.includes(parsed.intent) &&
    parsed.entities[0]?.ticker &&
    parsed.entities[0].ticker !== "N/A"
  ) {
    console.log(
      `${logPrefix} intent promoted ${parsed.intent} → company_analysis (entity=${parsed.entities[0].ticker})`,
    );
    parsed.intent = "company_analysis";
  }

  // 3. Context inheritance
  // Trigger when entityResolver failed AND we have any prior history
  // (regardless of intent). This covers follow-ups like "expandir el
  // informe" where v1's Phase 1.18 logic was missing in v2.
  if (parsed.entities.length === 0 && history && history.length > 0) {
    const prev = extractPreviousContext(history);
    if (prev) {
      parsed.inherited_context = prev;
      parsed.entities = [
        { ticker: prev.ticker, company_name: prev.company_name, sector_category: prev.sector_category, source: "inherited" },
      ];
      console.info(`[RIX-V2][orch] inherited entity from previous turn: ${prev.ticker} (${prev.company_name})`);
      // Promote intent if it was a generic fallback.
      if (parsed.intent === "general_question") parsed.intent = "company_analysis";
    } else {
      // Fallback: scan assistant text for "Name (TICKER)" pattern.
      const inferred = inferEntityFromAssistantText(history);
      if (inferred) {
        parsed.entities = [
          { ticker: inferred.ticker, company_name: inferred.company_name, sector_category: null, source: "inherited" },
        ];
        console.info(`[RIX-V2][orch] inherited entity from previous turn (text-inferred): ${inferred.ticker} (${inferred.company_name})`);
        if (parsed.intent === "general_question") parsed.intent = "company_analysis";
      }
    }
  }

  // 4-5. Guards
  // scopeGuard only makes sense when we actually expected to resolve a single
  // company. For sector_ranking we have no entity by design; for comparison
  // we accept N>=1 (the skill will reply gracefully if N<2).
  const guardChain: Array<[string, () => { pass: boolean; reply?: string; warnings?: string[] }]> = [
    ["inputGuard", () => checkInput(question)],
  ];
  if (parsed.intent !== "sector_ranking" && parsed.intent !== "comparison") {
    guardChain.push(["scopeGuard", () => checkScope(parsed.entities[0] ?? null, question)]);
  }
  guardChain.push(["temporalGuard", () => checkTemporal(parsed.temporal, question)]);
  const collectedWarnings: string[] = [];
  for (const [name, run] of guardChain) {
    const res = run();
    if (!res.pass) {
      console.log(`${logPrefix} rejected by ${name}`);
      const reply = res.reply ?? "Consulta no admitida.";
      try { onChunk?.(reply); } catch (_) { /* noop */ }
      return { type: "guard_rejection", content: reply };
    }
    if (res.warnings && res.warnings.length > 0) {
      collectedWarnings.push(...res.warnings);
      console.log(`${logPrefix} ${name} warnings: ${res.warnings.length}`);
    }
  }

  // 6-8. Skill dispatch
  const skill = selectSkill(parsed.intent);
  if (!skill) {
    const reply = `No hay skill registrada para intent=${parsed.intent}`;
    try { onChunk?.(reply); } catch (_) { /* noop */ }
    return { type: "guard_rejection", content: reply };
  }
  console.log(`${logPrefix} dispatching | intent=${parsed.intent} | skill=${skill.name}`);
  const skillOut = await skill.execute({ parsed, supabase, logPrefix, onChunk });
  if (collectedWarnings.length > 0) {
    skillOut.prompt_modules = Array.from(new Set([...skillOut.prompt_modules, "coverageRules"]));
    (skillOut as any).warnings = collectedWarnings;
  }
  // Always force coverageRules when temporal coverage is below threshold.
  // Skills that didn't include it will at least carry the prompt-module
  // marker so downstream metadata reflects the partial-coverage state.
  if (parsed.temporal.is_partial || (parsed.temporal.coverage_ratio ?? 1) < 0.9) {
    skillOut.prompt_modules = Array.from(new Set([...skillOut.prompt_modules, "coverageRules"]));
    console.info(
      `[RIX-V2][orch] coverage partial detected | ratio=${parsed.temporal.coverage_ratio} | available=${parsed.temporal.snapshots_available}/${parsed.temporal.snapshots_expected}`,
    );
  }

  // 9. Prompt composition
  const systemPrompt = composePrompt(skillOut.prompt_modules);

  // 10. Content: real skills deposit the LLM answer as the first pre-rendered
  //     "table" entry AND stream it via onChunk. Stub skills leave that array
  //     empty → fall back to the deterministic placeholder so the response
  //     still produces output (and we emit it as a single chunk).
  const REAL_SKILLS = new Set([
    "companyAnalysis",
    "sectorRanking",
    "comparison",
    "modelDivergence",
    "periodEvolution",
  ]);
  const skillContent = skillOut.datapack.pre_rendered_tables[0];
  let content: string;
  if (REAL_SKILLS.has(skill.name) && skillContent && skillContent.length > 0) {
    content = skillContent;
  } else {
    content = await synthesize(systemPrompt, skillOut.datapack, question);
    // Stub path didn't stream — emit once so the SSE pipe has something.
    try { onChunk?.(content); } catch (_) { /* noop */ }
  }

  // 11. Response
  return {
    type: "llm_synthesis",
    content,
    datapack: skillOut.datapack,
    metadata: skillOut.metadata,
  };
}