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

// ── Sector keyword → repindex_root_issuers.sector_category map ─────
// Used as a fallback when the user asks a sector-wide ranking/comparison
// without naming explicit companies (e.g. "principales grupos hospitalarios
// en España"). Keys are lowercase regex fragments, values are the EXACT
// sector_category strings stored in the DB.
const SECTOR_KEYWORD_MAP: Array<{ re: RegExp; sector: string }> = [
  { re: /\b(hospital(?:es|ario|arios)?|sanitari[oa]s?|salud|cl[ií]nicas?|farma|farmac[eé]utic[oa]s?)\b/i, sector: "Salud y Farmacéutico" },
  { re: /\b(banc[oa]s?|banca|servicios?\s+financier[oa]s?|financier[oa]s?)\b/i, sector: "Banca y Servicios Financieros" },
  { re: /\b(seguros?|asegurador[oa]s?)\b/i, sector: "Seguros" },
  { re: /\b(telecos?|telecomunicaciones?|tecnolog[ií]a|tech)\b/i, sector: "Telecomunicaciones y Tecnología" },
  { re: /\b(petr[oó]le[oa]|petrolera|gas|energ[ií]a)\b/i, sector: "Petróleo y Energía" },
  { re: /\b(el[eé]ctric[oa]s?|utilities?)\b/i, sector: "Energía y Gas" },
  { re: /\b(construc(?:cion|toras?|ci[oó]n)|infraestructur[oa]s?)\b/i, sector: "Construcción e Infraestructuras" },
  { re: /\b(materias\s+primas|siderurgia|sider[uú]rgic[oa]s?|acero)\b/i, sector: "Materias Primas y Siderurgia" },
  { re: /\b(hotel(?:es|er[oa]s?)?|tur[ií]stic[oa]s?|turismo)\b/i, sector: "Hoteles y Turismo" },
  { re: /\b(alimentaci[oó]n|alimentari[oa]s?|supermercados?|distribuci[oó]n\s+aliment)\b/i, sector: "Alimentación" },
  { re: /\b(consultor[ií]a|auditor[ií]a|auditoras?)\b/i, sector: "Consultoría y Auditoría" },
  { re: /\b(distribuci[oó]n|retail|comercio\s+minorista)\b/i, sector: "Distribución" },
  { re: /\b(log[ií]stica|transport(?:e|istas?)|paqueter[ií]a)\b/i, sector: "Logística" },
  { re: /\b(industria(?:l(?:es)?)?|manufactur[oa]s?|qu[ií]mic[oa]s?|petroqu[ií]mica)\b/i, sector: "Industria" },
  { re: /\b(automoci[oó]n|automotriz|autom[oó]vil(?:es)?)\b/i, sector: "Automoción" },
  { re: /\b(restauraci[oó]n|restaurantes?)\b/i, sector: "Restauración" },
  { re: /\b(inmobiliari[oa]s?|socimi)\b/i, sector: "Inmobiliaria" },
];

function detectSectorCategory(question: string): string | null {
  for (const { re, sector } of SECTOR_KEYWORD_MAP) {
    if (re.test(question)) return sector;
  }
  return null;
}

// Hardcoded sub-segments inside a sector_category. When the query is more
// specific than the broad sector (e.g. "grupos hospitalarios" inside
// "Salud y Farmacéutico"), restrict resolution to a curated ticker list.
// Brand names like Quirónsalud, Vithas or Sanitas don't contain "hospital"
// in their name, so an ILIKE filter would miss them — explicit tickers
// are the only reliable strategy.
const SECTOR_SUBSEGMENT: Record<string, { keywords: RegExp; tickers: string[] }> = {
  grupos_hospitalarios: {
    keywords: /\b(hospital(?:es|ario|arios)?|grupo(?:s)?\s*hospitalarios?|cl[ií]nica(?:s)?\s*privadas?)\b/i,
    tickers: ["QS", "HOS", "HMH", "HLA", "VIT", "RS", "VIA", "SANITAS"],
  },
  farmaceuticas: {
    keywords: /\b(farmac[eé]utica?s?|laboratorios?|farma|biotech|biotec(?:nolog[ií]a)?)\b/i,
    tickers: ["GRF", "ROVI", "PHM", "FAE", "ORY", "RJF"],
  },
  oftalmologia: {
    keywords: /\b(oftalmolog[ií]a|oftalmol[oó]gic[oa]s?|baviera|visi[oó]n|ocular)\b/i,
    tickers: ["CBAV"],
  },
  telemedicina: {
    keywords: /\b(telemedicina|salud\s*digital|atrys)\b/i,
    tickers: ["ATR"],
  },
};

function detectSubsegmentTickers(question: string): string[] | null {
  for (const key of Object.keys(SECTOR_SUBSEGMENT)) {
    const seg = SECTOR_SUBSEGMENT[key];
    if (seg.keywords.test(question)) {
      console.log(`[RIX-V2][orch] sectorAutoResolve | subsegment matched="${key}" | tickers=${seg.tickers.join(",")}`);
      return seg.tickers;
    }
  }
  return null;
}

async function autoResolveEntitiesBySector(
  question: string,
  supabase: any,
  limit = 5,
): Promise<ResolvedEntity[]> {
  const sector = detectSectorCategory(question);
  if (!sector) return [];
  try {
    // (a) Hardcoded sub-segment: explicit ticker list for queries that are
    //     more specific than the broad sector (e.g. "grupos hospitalarios").
    const subTickers = detectSubsegmentTickers(question);
    if (subTickers && subTickers.length > 0) {
      const { data: subRows, error: subErr } = await supabase
        .from("repindex_root_issuers")
        .select("issuer_name, ticker, sector_category")
        .in("ticker", subTickers);
      if (!subErr && Array.isArray(subRows) && subRows.length >= 1) {
        // Preserve curated order from the subsegment list, then cap to `limit`.
        const byTicker = new Map<string, any>(
          subRows.map((r: any) => [String(r.ticker).toUpperCase(), r]),
        );
        const ordered: ResolvedEntity[] = subTickers
          .map((t) => byTicker.get(t.toUpperCase()))
          .filter((r: any) => r?.ticker && r?.issuer_name)
          .slice(0, limit)
          .map((r: any) => ({
            ticker: String(r.ticker).toUpperCase(),
            company_name: r.issuer_name,
            sector_category: r.sector_category ?? sector,
            source: "semantic_bridge" as ResolvedEntity["source"],
          }));
        if (ordered.length >= 1) {
          console.log(`[RIX-V2][orch] sectorAutoResolve | sector="${sector}" | subsegment applied | resolved=${ordered.length} | tickers=${ordered.map((e) => e.ticker).join(",")}`);
          return ordered;
        }
      }
      console.log(`[RIX-V2][orch] sectorAutoResolve | subsegment hit but DB returned 0 rows, falling back to full sector`);
    }

    // (b) Fallback: full sector with hard cap.
    const { data, error } = await supabase
      .from("repindex_root_issuers")
      .select("issuer_name, ticker, sector_category")
      .eq("sector_category", sector)
      .limit(limit);
    if (error || !Array.isArray(data) || data.length === 0) {
      console.log(`[RIX-V2][orch] sectorAutoResolve | sector="${sector}" | rows=0 | err=${error?.message ?? "none"}`);
      return [];
    }
    const out: ResolvedEntity[] = data
      .filter((r: any) => r?.ticker && r?.issuer_name)
      .map((r: any) => ({
        ticker: String(r.ticker).toUpperCase(),
        company_name: r.issuer_name,
        sector_category: r.sector_category ?? sector,
        source: "semantic_bridge" as ResolvedEntity["source"],
      }));
    console.log(`[RIX-V2][orch] sectorAutoResolve | sector="${sector}" | resolved=${out.length} | tickers=${out.map((e) => e.ticker).join(",")}`);
    return out;
  } catch (e) {
    console.error(`[RIX-V2][orch] sectorAutoResolve error:`, e);
    return [];
  }
}

function extractPreviousContext(history: ConversationMessage[]): PreviousContext | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role === "assistant" && m.report_context) return m.report_context;
  }
  return undefined;
}

// FASE A — Removed inferEntitySeedFromAssistantText (fragile regex over
// assistant text). Inheritance now flows exclusively from the structured
// `previousContext` payload (FE) or `extractPreviousContext` (history with
// embedded report_context). Hydration from `user_conversations.last_report_context`
// happens upstream in index.ts.

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
  previousContext?: any,
  isFollowup?: boolean,
  normalizedQuestion?: string,
): Promise<OrchestratorResponse> {
  const logPrefix = "[RIX-V2][orch]";
  // FASE C — `question` is ALWAYS effectiveQuestion (originalQuestion ?? normalizedQuestion).
  // index.ts guarantees this. Every parser/skill below uses `question` exclusively;
  // `normalizedQuestion` is forwarded only for display/logging.
  const effectiveQuestion = question;
  const displayQuestion = (normalizedQuestion && normalizedQuestion.trim().length > 0)
    ? normalizedQuestion
    : question;
  console.log(`${logPrefix} processing | effective="${effectiveQuestion.slice(0, 80)}" | normalized="${displayQuestion.slice(0, 80)}" | history=${history?.length ?? 0}`);

  // 1. Parsers (real)
  let intent = classifyIntent(question);
  let entity: ResolvedEntity | null = null;
  let entities: ResolvedEntity[] = [];
  let inheritedContext: PreviousContext | undefined;

  // ── FIX: ranking-style intents must NEVER inherit a single entity from
  // history. They are sector/index-wide queries by definition. Allowing
  // inheritance pollutes the report metadata (e.g. "top 5 IBEX" showing
  // ferrovial as the entity just because it was the previous turn).
  const NO_INHERIT_INTENTS: Intent[] = ["sector_ranking", "comparison", "model_divergence"];
  const skipInheritance = NO_INHERIT_INTENTS.includes(intent);
  if (skipInheritance) {
    console.log(`${logPrefix} intent=${intent} → skipping all entity inheritance from history`);
  }

  // PRIORITY: follow-up inherits entity from previous context
  if (!skipInheritance && (isFollowup || history.length > 0) && previousContext?.entity) {
    entity = await resolveEntity(previousContext.entity, supabase);
    if (entity && entity.ticker !== "N/A") {
      entities = [entity];
      inheritedContext = {
        ticker: entity.ticker,
        company_name: entity.company_name,
        sector_category: entity.sector_category ?? null,
      };
      console.log(`${logPrefix} FOLLOWUP: inherited entity from FE previousContext: ${entity.ticker}`);
    }
  }

  if (!skipInheritance && entities.length === 0 && history.length > 0) {
    const prev = extractPreviousContext(history);
    const lastUser = [...history].reverse().find((m) => m.role === "user" && !!m.content?.trim());
    // FASE A — only structured seeds (prev report_context + last user text).
    // The assistant-text regex fallback was removed; the previousContext
    // payload from FE / DB hydration covers that gap.
    const seeds = [
      prev?.company_name,
      prev?.ticker,
      lastUser?.content ? String(lastUser.content).slice(0, 160) : null,
    ].filter((seed): seed is string => !!seed && seed.trim().length > 0);

    for (const seed of seeds) {
      entity = await resolveEntity(seed, supabase);
      if (entity && entity.ticker !== "N/A") {
        entities = [entity];
        inheritedContext = {
          ticker: entity.ticker,
          company_name: entity.company_name,
          sector_category: entity.sector_category ?? null,
        };
        console.log(`${logPrefix} inherited entity: ${entity.company_name} from history`);
        if (intent === "general_question") intent = "company_analysis";
        break;
      }
    }
  }

  // Normal entity resolution for non-followup
  // ── FIX 1: when history exists and inheritance failed, only call
  // resolveEntity(question) if the question CLEARLY mentions a company
  // (capitalised token of length >= 4). Otherwise we risk false positives
  // such as "día" → DIA on follow-up phrases like "expande el informe
  // hasta el día de ayer".
  const FOLLOWUP_CUE_RE = /\b(expand[ae]|amplia|am[pl]liar|prof?undiza|detalla|continua|sigue|y\s+ahora|tambien|adem[aá]s|otra\s+(?:vez|cosa)|otro\s+(?:dato|punto)|hasta\s+(?:hoy|ayer|el\s+d[ií]a)|m[aá]s\s+(?:detalle|info))\b/i;
  const HAS_CAPITALISED_BRAND = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}\b/.test(question);
  if (
    entities.length === 0 &&
    history.length > 0 &&
    !HAS_CAPITALISED_BRAND &&
    FOLLOWUP_CUE_RE.test(question)
  ) {
    console.log(`${logPrefix} skipping resolveEntity(question) — looks like pure follow-up without brand mention`);
  } else if (entities.length === 0) {
    if (intent === "sector_ranking") {
      entities = await autoResolveEntitiesBySector(question, supabase, 5);
    } else if (intent === "comparison") {
      entities = await resolveMultipleEntities(question, supabase);
      console.log(`${logPrefix} comparison | entities=${entities.length} | ${entities.map((e) => e.ticker).join(",")}`);
      if (entities.length < 2) {
        const sectorEntities = await autoResolveEntitiesBySector(question, supabase, 5);
        if (sectorEntities.length >= 2) {
          entities = sectorEntities;
          console.log(`${logPrefix} comparison | sectorAutoResolve fallback applied | entities=${entities.length}`);
        }
      }
    } else {
      entity = await resolveEntity(question, supabase);
      entities = entity ? [entity] : [];
    }
  }
  const primaryTicker = entities[0]?.ticker ?? null;
  const temporal: ResolvedTemporal = await parseTemporal(question, supabase, primaryTicker);
  const explicitModels = parseModels(question);
  const models = explicitModels.length > 0 ? explicitModels : allModels();
  const mode = inferMode(temporal);
  console.log(
    `${logPrefix} parsed temporal | q="${question.slice(0, 120)}" | from=${temporal.from} | to=${temporal.to} | requested=${temporal.requested_label} | mode=${mode}`,
  );

  // 2. ParsedQuery
  const parsed: ParsedQuery = {
    intent,
    entities,
    temporal,
    models,
    mode,
    raw_question: effectiveQuestion,
    effective_question: effectiveQuestion,
    normalized_question: displayQuestion,
    is_followup: isFollowup === true || history.length > 0,
  };
  if (inheritedContext) parsed.inherited_context = inheritedContext;

  // 2b. Intent priority override: if a single concrete entity is resolved,
  //     `general_question` and `period_evolution` fall back to
  //     companyAnalysis (which now produces the full 8-section report with
  //     pre-rendered tables). Sector rankings, comparisons (>=2 entities)
  //     and model_divergence keep their dedicated skills.
  const PROMOTABLE_INTENTS: Intent[] = ["general_question", "period_evolution"];
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
  if (
    !NO_INHERIT_INTENTS.includes(parsed.intent) &&
    parsed.entities.length === 0 &&
    history &&
    history.length > 0
  ) {
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
      // FASE A — Fallback: only re-resolve from the LAST USER message text.
      // The assistant-text regex fallback was removed in favour of the
      // structured `previousContext` (hydrated upstream from
      // user_conversations.last_report_context when missing on FE).
      const lastUser = [...history].reverse().find((m) => m?.role === "user" && !!m?.content);
      const seeds = [
        lastUser?.content ? String(lastUser.content).slice(0, 160) : null,
      ].filter((seed): seed is string => !!seed && seed.trim().length > 0);

      for (const seed of seeds) {
        const entityMatch = await resolveEntity(seed, supabase);
        if (entityMatch && entityMatch.ticker !== "N/A") {
          parsed.entities = [{ ...entityMatch, source: "inherited" }];
          parsed.inherited_context = {
            ticker: entityMatch.ticker,
            company_name: entityMatch.company_name,
            sector_category: entityMatch.sector_category ?? null,
          };
          console.log(`${logPrefix} inherited entity: ${entityMatch.company_name} from history`);
          if (parsed.intent === "general_question") parsed.intent = "company_analysis";
          break;
        }
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
    intent: parsed.intent,
    entities: parsed.entities,
    // Prefer the skill's effective window (skills may override `from`/`to`
    // to reflect the REQUESTED window — e.g. sectorRanking uses Q1 full
    // range for SQL bounds even when reconcileWindow narrowed it).
    period_from: skillOut.datapack?.temporal?.from ?? parsed.temporal.from,
    period_to: skillOut.datapack?.temporal?.to ?? parsed.temporal.to,
    models_used: parsed.models,
    data_count: skillOut.metadata?.observations_count ?? skillOut.datapack?.raw_rows?.length ?? 0,
    methodology: {
      hasRixData: (skillOut.metadata?.observations_count ?? skillOut.datapack?.raw_rows?.length ?? 0) > 0,
      modelsUsed: parsed.models,
      periodFrom: skillOut.datapack?.temporal?.from ?? parsed.temporal.from,
      periodTo: skillOut.datapack?.temporal?.to ?? parsed.temporal.to,
      observationsCount: skillOut.metadata?.observations_count ?? skillOut.datapack?.raw_rows?.length ?? 0,
      // PROBLEMA 1 — ES→EN safety net at the orchestrator boundary. Skills
      // historically emitted Spanish ("alto"/"medio"/"bajo") which the FE
      // MethodologyFooter (low|medium|high|unknown) silently mapped to
      // "unknown" → "No calculable". Map here so every skill stays correct
      // even if it ships the legacy strings.
      divergenceLevel: mapDivergenceToEN(skillOut.metadata?.divergence_level),
      divergencePoints: skillOut.metadata?.divergence_points,
      uniqueCompanies: skillOut.metadata?.unique_companies,
      uniqueWeeks: skillOut.metadata?.unique_weeks,
    },
  };
}

/**
 * PROBLEMA 1 — Normalise the divergence level to the EN enum that the FE
 * MethodologyFooter consumes. Accepts both ES (alto/medio/bajo, alta/media/baja)
 * and EN (high/medium/low). Anything else collapses to "unknown" which renders
 * as "No calculable (muestra insuficiente)".
 */
function mapDivergenceToEN(level: string | null | undefined): "low" | "medium" | "high" | "unknown" {
  if (!level) return "unknown";
  const s = String(level).toLowerCase().trim();
  if (s === "low" || s === "bajo" || s === "baja") return "low";
  if (s === "medium" || s === "medio" || s === "media") return "medium";
  if (s === "high" || s === "alto" || s === "alta") return "high";
  return "unknown";
}