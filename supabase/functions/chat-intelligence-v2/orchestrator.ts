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
import { resolveEntity } from "./parsers/entityResolver.ts";
import { parseTemporal, inferMode } from "./parsers/temporalParser.ts";
import { parseModels, allModels } from "./parsers/modelParser.ts";
import { checkInput } from "./guards/inputGuard.ts";
import { checkScope } from "./guards/scopeGuard.ts";
import { checkTemporal } from "./guards/temporalGuard.ts";
import { companyAnalysisSkill } from "./skills/companyAnalysis.ts";

function extractPreviousContext(history: ConversationMessage[]): PreviousContext | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role === "assistant" && m.report_context) return m.report_context;
  }
  return undefined;
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
  stubSkill("sectorRanking", ["sector_ranking"]),
  stubSkill("comparison", ["comparison"]),
  stubSkill("modelDivergence", ["model_divergence"]),
  stubSkill("periodEvolution", ["period_evolution"]),
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
): Promise<OrchestratorResponse> {
  const logPrefix = "[RIX-V2][orch]";
  console.log(`${logPrefix} processing | q="${question.slice(0, 80)}" | history=${history?.length ?? 0}`);

  // 1. Parsers (real)
  const intent = classifyIntent(question);
  const entity = await resolveEntity(question, supabase);
  const entities: ResolvedEntity[] = entity ? [entity] : [];
  const temporal: ResolvedTemporal = await parseTemporal(question, supabase, entity?.ticker ?? null);
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

  // 3. Context inheritance
  if (parsed.is_followup && parsed.entities.length === 0) {
    const prev = extractPreviousContext(history);
    if (prev) {
      parsed.inherited_context = prev;
      parsed.entities = [
        { ticker: prev.ticker, company_name: prev.company_name, sector_category: prev.sector_category, source: "inherited" },
      ];
      console.log(`${logPrefix} inherited entity ${prev.ticker} (${prev.company_name})`);
      // Promote intent if it was a generic fallback.
      if (parsed.intent === "general_question") parsed.intent = "company_analysis";
    }
  }

  // 4-5. Guards
  const guardChain: Array<[string, () => { pass: boolean; reply?: string; warnings?: string[] }]> = [
    ["inputGuard", () => checkInput(question)],
    ["scopeGuard", () => checkScope(parsed.entities[0] ?? null, question)],
    ["temporalGuard", () => checkTemporal(parsed.temporal, question)],
  ];
  const collectedWarnings: string[] = [];
  for (const [name, run] of guardChain) {
    const res = run();
    if (!res.pass) {
      console.log(`${logPrefix} rejected by ${name}`);
      return { type: "guard_rejection", content: res.reply ?? "Consulta no admitida." };
    }
    if (res.warnings && res.warnings.length > 0) {
      collectedWarnings.push(...res.warnings);
      console.log(`${logPrefix} ${name} warnings: ${res.warnings.length}`);
    }
  }

  // 6-8. Skill dispatch
  const skill = selectSkill(parsed.intent);
  if (!skill) {
    return { type: "guard_rejection", content: `No hay skill registrada para intent=${parsed.intent}` };
  }
  const skillOut = await skill.execute({ parsed, supabase, logPrefix });
  if (collectedWarnings.length > 0) {
    skillOut.prompt_modules = Array.from(new Set([...skillOut.prompt_modules, "coverageRules"]));
    (skillOut as any).warnings = collectedWarnings;
  }

  // 9. Prompt composition
  const systemPrompt = composePrompt(skillOut.prompt_modules);

  // 10. Content: real skills (e.g. companyAnalysis) deposit the LLM answer
  //     as the FIRST pre-rendered table. Stub skills fall back to a deterministic
  //     placeholder so the response still streams something readable.
  const skillContent = skillOut.datapack.pre_rendered_tables[0];
  const content = (skillContent && skill.name !== "generalQuestion" && skill.name.startsWith("company") )
    ? skillContent
    : await synthesize(systemPrompt, skillOut.datapack, question);

  // 11. Response
  return {
    type: "llm_synthesis",
    content,
    datapack: skillOut.datapack,
    metadata: skillOut.metadata,
  };
}