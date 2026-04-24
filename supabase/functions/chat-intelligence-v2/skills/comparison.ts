// Agente Rix v2 — skill comparison (max 300 LOC)
// Maneja el intent "comparison": compara 2+ empresas lado a lado por las
// 8 métricas canónicas, en el período resuelto. Streaming del LLM.
import type {
  DataPack,
  ModelName,
  ReportMetadata,
  Skill,
  SkillInput,
  SkillOutput,
} from "../types.ts";
import { buildBasePrompt } from "../prompts/base.ts";
import { buildAntiHallucinationRules } from "../prompts/antiHallucination.ts";
import { buildPeriodRules } from "../prompts/periodMode.ts";
import { buildSnapshotRules } from "../prompts/snapshotMode.ts";
import { buildComparisonRules } from "../prompts/comparisonMode.ts";
import { streamOpenAIResponse } from "../shared/streamOpenAI.ts";
import { isLazyBrutoEnabled } from "../shared/featureFlags.ts";
import { hydrateBrutoColumns } from "../datapack/builder.ts";

function buildCoverageBanner(t: { from: string; to: string; coverage_ratio: number; is_partial: boolean; snapshots_available: number; snapshots_expected: number }): string {
  if (!t.is_partial && t.coverage_ratio >= 0.9) return "";
  const pct = Math.round((t.coverage_ratio ?? 0) * 100);
  return `IMPORTANTE — COBERTURA PARCIAL (PRIORIDAD MÁXIMA):
• El período solicitado solo dispone de datos desde ${t.from} hasta ${t.to} (${t.snapshots_available}/${t.snapshots_expected} snapshots, ~${pct}%).
• ABRE el informe declarando esta cobertura parcial en el primer párrafo.
• PROHIBIDO extrapolar a semanas no cubiertas.`;
}

const SELECT =
  "05_ticker, 03_target_name, 02_model_name, 09_rix_score, batch_execution_date, " +
  "23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, 35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score, " +
  // Raw response columns for cited-sources extraction (URL bibliography).
  "20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, " +
  "respuesta_bruto_claude, respuesta_bruto_grok, respuesta_bruto_qwen";

// T2 — LIGHT projection (no *_bruto). When CHAT_V2_LAZY_BRUTO=true the
// fetchEntity call uses LIGHT_SELECT and Fase B hydration loads the bruto
// columns on demand (needsCitedSources=true for comparison).
const LIGHT_SELECT =
  "id, 05_ticker, 03_target_name, 02_model_name, 09_rix_score, batch_execution_date, " +
  "23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, 35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score";

const METRIC_COLS: Array<[string, string]> = [
  ["RIX", "09_rix_score"],
  ["NVM", "23_nvm_score"],
  ["DRM", "26_drm_score"],
  ["SIM", "29_sim_score"],
  ["RMM", "32_rmm_score"],
  ["CEM", "35_cem_score"],
  ["GAM", "38_gam_score"],
  ["DCM", "41_dcm_score"],
  ["CXM", "44_cxm_score"],
];

const MODEL_NAME_MAP: Array<[string, ModelName]> = [
  ["chatgpt", "ChatGPT"], ["gpt", "ChatGPT"], ["openai", "ChatGPT"],
  ["perplexity", "Perplexity"],
  ["gemini", "Gemini"], ["google", "Gemini"],
  ["deepseek", "DeepSeek"],
  ["grok", "Grok"], ["xai", "Grok"],
  ["qwen", "Qwen"], ["alibaba", "Qwen"],
];

function normModel(raw: unknown): ModelName | null {
  const s = String(raw ?? "").toLowerCase().trim();
  for (const [k, v] of MODEL_NAME_MAP) if (s.includes(k)) return v;
  return null;
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

function avg(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

async function fetchEntity(supabase: any, ticker: string, fromISO: string, toISO: string): Promise<any[]> {
  const all: any[] = [];
  const lazy = isLazyBrutoEnabled();
  const projection = lazy ? LIGHT_SELECT : SELECT;
  console.log(`[RIX-V2][comparison] fetchEntity ticker=${ticker} from=${fromISO} to=${toISO} projection=${lazy ? "LIGHT" : "FULL"}`);
  for (let p = 0; p < 3; p++) {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(projection)
      .eq("05_ticker", ticker)
      .gte("batch_execution_date", fromISO)
      .lte("batch_execution_date", toISO)
      .range(p * 1000, (p + 1) * 1000 - 1);
    if (error) { console.error("[RIX-V2][comparison]", ticker, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  const distinctModels = new Set(all.map((r) => r["02_model_name"]));
  console.log(`[RIX-V2][egress] skill=comparison ticker=${ticker} path=${lazy ? "LIGHT_SELECT" : "FULL_SELECT"} rows=${all.length} bytes_fetched_supabase=${(() => { try { return JSON.stringify(all).length; } catch { return 0; } })()} models=${[...distinctModels].join(",")}`);
  return all;
}

interface EntityAgg {
  ticker: string;
  name: string;
  per_metric: Record<string, number | null>;
  models: ModelName[];
  obs: number;
}

function aggregateEntity(ticker: string, rows: any[]): EntityAgg {
  const name = String(rows[0]?.["03_target_name"] ?? ticker);
  const per_metric: Record<string, number | null> = {};
  for (const [label, col] of METRIC_COLS) {
    const vals = rows.map((r) => parseFloat(r[col])).filter((x) => Number.isFinite(x));
    per_metric[label] = avg(vals);
  }
  const modelsSet = new Set<ModelName>();
  for (const r of rows) {
    const m = normModel(r["02_model_name"]);
    if (m) modelsSet.add(m);
  }
  return { ticker, name, per_metric, models: [...modelsSet], obs: rows.length };
}

function renderComparisonTable(entities: EntityAgg[]): string {
  const head = ["Métrica", ...entities.map((e) => `${e.name} (${e.ticker})`), "Δ"];
  const lines = METRIC_COLS.map(([label]) => {
    const cells = entities.map((e) => fmt(e.per_metric[label]));
    const numeric = entities.map((e) => e.per_metric[label]).filter((v): v is number => Number.isFinite(v as number));
    const delta = numeric.length >= 2 ? Math.max(...numeric) - Math.min(...numeric) : null;
    return `| ${label} | ${cells.join(" | ")} | ${fmt(delta)} |`;
  });
  return [
    "**Tabla comparativa lado a lado (media del período)**",
    "",
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...lines,
  ].join("\n");
}

function buildUserMessage(question: string, table: string, entities: EntityAgg[]): string {
  const compact = entities.map((e) => `• ${e.name} (${e.ticker}) → ${e.obs} obs, modelos: ${e.models.join(", ") || "(ninguno)"}`).join("\n");
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    "TABLA COMPARATIVA PRE-RENDERIZADA (úsala literal, NO la regeneres):",
    "",
    table,
    "",
    "COBERTURA POR EMPRESA:",
    compact,
  ].join("\n");
}

/**
 * COMPACT prompt builder for multi-entity comparisons.
 * Sends ONLY the numeric comparison table + minimal coverage metadata.
 * Excludes raw text, URLs, model breakdowns and other heavy blocks to
 * stay well under the OpenAI 400 payload threshold for 5+ entities.
 * Cited sources are appended after streaming via the standard pipeline.
 */
function buildCompactComparisonMessage(
  question: string,
  comparisonTable: string,
  entities: EntityAgg[],
  fromISO: string,
  toISO: string,
  models: string[],
  observationsCount: number,
  uniqueWeeks: number,
): string {
  const compact = entities
    .map((e) => `• ${e.name} (${e.ticker}) → ${e.obs} obs · modelos: ${e.models.join(", ") || "n/d"}`)
    .join("\n");
  const methodology = [
    "**Ficha metodológica**",
    `• Período: ${fromISO} → ${toISO}`,
    `• Modelos: ${models.length ? models.join(", ") : "n/d"}`,
    `• Observaciones: ${observationsCount} · Semanas con datos: ${uniqueWeeks}`,
  ].join("\n");
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    "TABLA COMPARATIVA PRE-RENDERIZADA (úsala literalmente, NO la regeneres):",
    "",
    comparisonTable,
    "",
    "COBERTURA POR EMPRESA:",
    compact,
    "",
    methodology,
    "",
    "ESTRUCTURA OBLIGATORIA DEL INFORME:",
    "## 1. Titular — 2 frases con la conclusión de la comparación.",
    "## 2. Tabla comparativa — inserta literalmente la tabla pre-renderizada.",
    "## 3. Lectura por empresa — 1 párrafo breve por cada empresa explicando sus fortalezas/debilidades según las métricas.",
    "## 4. Conclusiones — 3-5 bullets accionables.",
    "## 5. Ficha metodológica — inserta literalmente el bloque metodológico.",
  ].join("\n");
}

function buildMetadata(entities: EntityAgg[], fromISO: string, toISO: string): ReportMetadata {
  const allRix = entities.map((e) => e.per_metric["RIX"]).filter((v): v is number => Number.isFinite(v as number));
  const range = allRix.length >= 2 ? Math.max(...allRix) - Math.min(...allRix) : 0;
  const obs = entities.reduce((a, e) => a + e.obs, 0);
  const allModels = new Set<string>();
  entities.forEach((e) => e.models.forEach((m) => allModels.add(m)));
  return {
    models_used: [...allModels].join(","),
    period_from: fromISO,
    period_to: toISO,
    observations_count: obs,
    divergence_level: range < 5 ? "bajo" : range < 15 ? "medio" : "alto",
    divergence_points: Math.round(range),
    unique_companies: entities.length,
    unique_weeks: 0,
  };
}

export const comparisonSkill: Skill = {
  name: "comparison",
  intents: ["comparison"],

  async execute(input: SkillInput): Promise<SkillOutput> {
    const { parsed, supabase, logPrefix, onChunk } = input;
    const tag = `${logPrefix}[comparison]`;
    const targets = parsed.entities.filter((e) => e.ticker && e.ticker !== "N/A");
    if (targets.length < 2) {
      const msg = "Para comparar necesito al menos dos empresas resueltas. Ejemplo: 'compara ACS con FCC'.";
      try { onChunk?.(msg); } catch (_) { /* noop */ }
      return {
        datapack: {
          entity: targets[0] ?? { ticker: "N/A", company_name: "N/A", sector_category: null, source: "exact" },
          temporal: parsed.temporal, mode: parsed.mode, models_used: parsed.models,
          models_coverage: { requested: parsed.models, with_data: [], missing: parsed.models },
          metrics: [], raw_rows: [], pre_rendered_tables: [msg],
        },
        prompt_modules: ["base", "antiHallucination"],
        metadata: buildMetadata([], parsed.temporal.from, parsed.temporal.to),
      };
    }

    const rowsPerEntity = await Promise.all(
      targets.map((e) => fetchEntity(supabase, e.ticker, parsed.temporal.from, parsed.temporal.to)),
    );
    // T2 Fase B — comparison.needsCitedSources = true. Hydrate *_bruto on
    // demand when LAZY flag is on so downstream extractors stay parity-clean.
    if (isLazyBrutoEnabled()) {
      for (let i = 0; i < rowsPerEntity.length; i++) {
        const { rows: hydrated } = await hydrateBrutoColumns(
          supabase,
          rowsPerEntity[i],
          `comparison:${targets[i].ticker}`,
        );
        rowsPerEntity[i] = hydrated;
      }
    }
    const aggs = targets.map((e, i) => aggregateEntity(e.ticker, rowsPerEntity[i]));
    const table = renderComparisonTable(aggs);
    const commonModels = aggs.reduce<ModelName[]>((acc, a, i) => i === 0 ? a.models : acc.filter((m) => a.models.includes(m)), [] as ModelName[]);

    const datapack: DataPack = {
      entity: targets[0],
      temporal: parsed.temporal,
      mode: parsed.mode,
      models_used: commonModels,
      models_coverage: { requested: parsed.models, with_data: commonModels, missing: parsed.models.filter((m) => !commonModels.includes(m)) },
      metrics: [],
      raw_rows: rowsPerEntity.flat(),
      pre_rendered_tables: [table],
    };

    const modules = ["base", "antiHallucination", parsed.mode === "period" ? "periodMode" : "snapshotMode", "comparisonMode"];
    const systemPrompt = [
      buildCoverageBanner(parsed.temporal),
      buildBasePrompt({ languageName: "español" }),
      buildAntiHallucinationRules(),
      parsed.mode === "period"
        ? buildPeriodRules({ fromISO: parsed.temporal.from, toISO: parsed.temporal.to, weeksCount: parsed.temporal.snapshots_available, requestedLabel: parsed.temporal.requested_label })
        : buildSnapshotRules({ weekFromISO: parsed.temporal.from, weekToISO: parsed.temporal.to }),
      buildComparisonRules({
        entitiesLabel: aggs.map((a) => `${a.name} (${a.ticker})`).join(" vs "),
        weeksCount: parsed.temporal.snapshots_available,
        modelsWithData: commonModels,
      }),
    ].filter(Boolean).join("\n\n");

    const flatRows = rowsPerEntity.flat();
    const uniqueWeeks = new Set(flatRows.map((r) => String(r.batch_execution_date).slice(0, 10))).size;
    const userMessage = buildCompactComparisonMessage(
      parsed.effective_question ?? parsed.raw_question,
      table,
      aggs,
      parsed.temporal.from,
      parsed.temporal.to,
      commonModels,
      flatRows.length,
      uniqueWeeks,
    );
    console.log(`${tag} compact prompt | entities=${aggs.length} | user_chars=${userMessage.length} | sys_chars≈pending`);
    const { fullText, error } = await streamOpenAIResponse({
      systemPrompt, userMessage, logPrefix: tag,
      model: "o3",
      reasoning_effort: "medium",
      maxTokens: 24000,
      temperature: 0,
      onChunk: (d) => { try { onChunk?.(d); } catch (_) { /* noop */ } },
    });
    const finalContent = fullText && fullText.trim().length > 0
      ? fullText
      : (() => {
          const fb = `**Comparación**\n\n${table}\n\n_Síntesis no disponible (${error ?? "sin texto"})._`;
          try { onChunk?.(fb); } catch (_) { /* noop */ }
          return fb;
        })();

    return {
      datapack: { ...datapack, pre_rendered_tables: [finalContent, table] },
      prompt_modules: modules,
      metadata: buildMetadata(aggs, parsed.temporal.from, parsed.temporal.to),
    };
  },
};

export const __test__ = { aggregateEntity, renderComparisonTable };