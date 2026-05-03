// Agente Rix v2 — skill modelDivergence (max 300 LOC)
// Intent "model_divergence": para una empresa, agrupa scores por modelo de IA
// y calcula sigma inter-modelo + outliers. Streaming del LLM.
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
import { buildDivergenceRules } from "../prompts/divergenceMode.ts";
import { streamOpenAIResponse } from "../shared/streamOpenAI.ts";
import { isLazyBrutoEnabled } from "../shared/featureFlags.ts";
import { hydrateBrutoColumns } from "../datapack/builder.ts";
import {
  assembleReport,
  buildPreRenderedSection,
  metricsFromRows,
  renderMethodologyFooter,
  selectBlocks,
  ensureSection7,
} from "../datapack/reportAssembler.ts";
import { extractCitedSources } from "../datapack/citedSources.ts";
import { computePeriodAggregation } from "../../_shared/periodAggregation.ts";

import { buildCoverageBanner, probeRowsCount } from "../../_shared/coverageBanner.ts";

const SELECT =
  "05_ticker, 03_target_name, 02_model_name, 09_rix_score, batch_execution_date, " +
  "23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, 35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score, " +
  // Raw response columns for cited-sources extraction (URL bibliography).
  "20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, " +
  "respuesta_bruto_claude, respuesta_bruto_grok, respuesta_bruto_qwen";

// T2 — LIGHT projection (no *_bruto). Hydrated on demand under
// CHAT_V2_LAZY_BRUTO=true (modelDivergence.needsCitedSources=true).
const LIGHT_SELECT =
  "id, 05_ticker, 03_target_name, 02_model_name, 09_rix_score, batch_execution_date, " +
  "23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, 35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score";

const METRIC_COLS: Array<[string, string]> = [
  ["RIX", "09_rix_score"], ["NVM", "23_nvm_score"], ["DRM", "26_drm_score"],
  ["SIM", "29_sim_score"], ["RMM", "32_rmm_score"], ["CEM", "35_cem_score"],
  ["GAM", "38_gam_score"], ["DCM", "41_dcm_score"], ["CXM", "44_cxm_score"],
];

const MODEL_NAME_MAP: Array<[string, ModelName]> = [
  ["chatgpt", "ChatGPT"], ["gpt", "ChatGPT"], ["openai", "ChatGPT"],
  ["perplexity", "Perplexity"], ["gemini", "Gemini"], ["google", "Gemini"],
  ["deepseek", "DeepSeek"], ["grok", "Grok"], ["xai", "Grok"],
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

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

async function fetchRows(supabase: any, ticker: string, fromISO: string, toISO: string): Promise<any[]> {
  const all: any[] = [];
  const lazy = isLazyBrutoEnabled();
  const projection = lazy ? LIGHT_SELECT : SELECT;
  for (let p = 0; p < 3; p++) {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(projection)
      .eq("05_ticker", ticker)
      .gte("batch_execution_date", fromISO)
      .lte("batch_execution_date", toISO)
      .range(p * 1000, (p + 1) * 1000 - 1);
    if (error) { console.error("[RIX-V2][modelDivergence]", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`[RIX-V2][egress] skill=modelDivergence ticker=${ticker} path=${lazy ? "LIGHT_SELECT" : "FULL_SELECT"} rows=${all.length} bytes_fetched_supabase=${(() => { try { return JSON.stringify(all).length; } catch { return 0; } })()}`);
  return all;
}

interface ModelAgg {
  model: ModelName;
  obs: number;
  per_metric: Record<string, number>;
}

function aggregateByModel(rows: any[]): ModelAgg[] {
  const grouped = new Map<ModelName, any[]>();
  for (const r of rows) {
    const m = normModel(r["02_model_name"]);
    if (!m) continue;
    if (!grouped.has(m)) grouped.set(m, []);
    grouped.get(m)!.push(r);
  }
  const out: ModelAgg[] = [];
  for (const [model, items] of grouped) {
    const per_metric: Record<string, number> = {};
    for (const [label, col] of METRIC_COLS) {
      const vals = items.map((r) => parseFloat(r[col])).filter((x) => Number.isFinite(x));
      per_metric[label] = vals.length ? avg(vals) : NaN;
    }
    out.push({ model, obs: items.length, per_metric });
  }
  out.sort((a, b) => (b.per_metric["RIX"] || 0) - (a.per_metric["RIX"] || 0));
  return out;
}

function renderModelTable(aggs: ModelAgg[]): string {
  const head = ["Modelo", ...METRIC_COLS.map(([l]) => l), "Obs."];
  const lines = aggs.map((a) =>
    `| ${a.model} | ${METRIC_COLS.map(([l]) => fmt(a.per_metric[l])).join(" | ")} | ${a.obs} |`,
  );
  // fila de sigma por métrica
  const sigmaCells = METRIC_COLS.map(([l]) => {
    const vals = aggs.map((a) => a.per_metric[l]).filter((x) => Number.isFinite(x));
    return fmt(stdev(vals));
  });
  return [
    "**Tabla modelo a modelo (media del período por métrica)**",
    "",
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...lines,
    `| **σ inter-modelo** | ${sigmaCells.join(" | ")} | — |`,
  ].join("\n");
}

function buildUserMessage(question: string, ticker: string, table: string, sigmaRix: number, top: string, bot: string): string {
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `EMPRESA: ${ticker}`,
    `σ inter-modelo del RIX: ${sigmaRix.toFixed(1)} | Modelo más alto: ${top} | Modelo más bajo: ${bot}`,
    "",
    "TABLA PRE-RENDERIZADA (úsala literal, NO la regeneres):",
    "",
    table,
  ].join("\n");
}

/** FASE D — modelDivergence assembled with the transversal helper. */
function buildUserMessageWithAssembler(
  question: string,
  ticker: string,
  modelTable: string,
  sigmaRix: number,
  top: string,
  bot: string,
  rawRows: any[],
  fromISO: string,
  toISO: string,
  models: string[],
): string {
  const metrics = metricsFromRows(rawRows);
  const _aggForReco = computePeriodAggregation(rawRows);
  const report = assembleReport({
    raw_rows: rawRows,
    metrics,
    mode: "period",
    periodFrom: fromISO,
    periodTo: toISO,
    submetricsRange: _aggForReco.period_summary.submetrics_range,
    rixRangeSummary: {
      rix_min: _aggForReco.period_summary.rix_min,
      rix_max: _aggForReco.period_summary.rix_max,
      rix_consensus_level: _aggForReco.period_summary.rix_consensus_level,
    },
  });
  const blocks = selectBlocks(report, "modelDivergence");
  const methodology = renderMethodologyFooter({
    fromISO, toISO, models, observationsCount: rawRows.length,
    uniqueWeeks: new Set(rawRows.map((r) => String(r.batch_execution_date).slice(0, 10))).size,
  });
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `EMPRESA: ${ticker}`,
    `σ inter-modelo del RIX: ${sigmaRix.toFixed(1)} | Modelo más alto: ${top} | Modelo más bajo: ${bot}`,
    "",
    buildPreRenderedSection(modelTable, blocks, methodology),
    "",
    "ESTRUCTURA OBLIGATORIA DEL INFORME:",
    "## 1. Titular — 2 frases con el nivel de divergencia.",
    "## 2. Tabla modelo a modelo — inserta literalmente la tabla principal.",
    "## 3. Visión por modelo — inserta literalmente el bloque de breakdown.",
    "## 4. Divergencia inter-modelo — inserta literalmente el bloque de divergencia.",
    "## 5. KPIs agregados — inserta literalmente la tabla de KPIs.",
    "## 6. Ficha metodológica — inserta literalmente el bloque metodológico.",
  ].join("\n");
}

function buildMetadata(aggs: ModelAgg[], fromISO: string, toISO: string, sigma: number): ReportMetadata {
  return {
    models_used: aggs.map((a) => a.model).join(","),
    period_from: fromISO,
    period_to: toISO,
    observations_count: aggs.reduce((a, x) => a + x.obs, 0),
    divergence_level: sigma < 8 ? "bajo" : sigma < 15 ? "medio" : "alto",
    divergence_points: Math.round(sigma),
    unique_companies: 1,
    unique_weeks: 0,
  };
}

export const modelDivergenceSkill: Skill = {
  name: "modelDivergence",
  intents: ["model_divergence"],

  async execute(input: SkillInput): Promise<SkillOutput> {
    const { parsed, supabase, logPrefix, onChunk } = input;
    const tag = `${logPrefix}[modelDivergence]`;
    const entity = parsed.entities[0];
    if (!entity || entity.ticker === "N/A") {
      const msg = "No reconozco la empresa. Indica el ticker o el nombre exacto.";
      try { onChunk?.(msg); } catch (_) { /* noop */ }
      return {
        datapack: {
          entity: { ticker: "N/A", company_name: "N/A", sector_category: null, source: "exact" },
          temporal: parsed.temporal, mode: parsed.mode, models_used: parsed.models,
          models_coverage: { requested: parsed.models, with_data: [], missing: parsed.models },
          metrics: [], raw_rows: [], pre_rendered_tables: [msg],
        },
        prompt_modules: ["base", "antiHallucination"],
        metadata: buildMetadata([], parsed.temporal.from, parsed.temporal.to, 0),
      };
    }

    const rows = await fetchRows(supabase, entity.ticker, parsed.temporal.from, parsed.temporal.to);
    // T2 Fase B — modelDivergence.needsCitedSources = true. Hydrate *_bruto
    // on demand when LAZY flag is on so future citation extractors stay
    // parity-clean.
    let workingRows = rows;
    if (isLazyBrutoEnabled()) {
      const { rows: hydrated } = await hydrateBrutoColumns(
        supabase,
        rows,
        `modelDivergence:${entity.ticker}`,
      );
      workingRows = hydrated;
    }
    const aggs = aggregateByModel(workingRows);
    const rixVals = aggs.map((a) => a.per_metric["RIX"]).filter((x) => Number.isFinite(x));
    const sigmaRix = stdev(rixVals);
    const top = aggs[0]?.model ?? "n/d";
    const bot = aggs[aggs.length - 1]?.model ?? "n/d";
    const table = aggs.length > 0 ? renderModelTable(aggs) : "_Sin datos en el período._";

    const datapack: DataPack = {
      entity, temporal: parsed.temporal, mode: parsed.mode,
      models_used: aggs.map((a) => a.model),
      models_coverage: { requested: parsed.models, with_data: aggs.map((a) => a.model), missing: parsed.models.filter((m) => !aggs.find((a) => a.model === m)) },
      metrics: [], raw_rows: workingRows, pre_rendered_tables: [table],
    };

    if (aggs.length === 0) {
      const probedCount = await probeRowsCount(supabase, { fromISO: parsed.temporal.from, toISO: parsed.temporal.to, ticker: entity.ticker });
      console.log(`[RIX-V2][modelDivergence] empty fallback | probe_count=${probedCount} | ticker=${entity.ticker}`);
      const probeNote = probedCount > 0 ? ` (probe: ${probedCount} filas crudas existen pero no encajan en el alcance pedido)` : "";
      const fb = `**Divergencia inter-modelo · ${entity.company_name}**\n\n_Sin datos en el período ${parsed.temporal.from} → ${parsed.temporal.to}${probeNote}._`;
      try { onChunk?.(fb); } catch (_) { /* noop */ }
      return {
        datapack: { ...datapack, pre_rendered_tables: [fb] },
        prompt_modules: ["base", "antiHallucination"],
        metadata: buildMetadata([], parsed.temporal.from, parsed.temporal.to, 0),
      };
    }

    const systemPrompt = [
      buildCoverageBanner(parsed.temporal),
      buildBasePrompt({ languageName: "español" }),
      buildAntiHallucinationRules(),
      buildDivergenceRules({
        ticker: entity.ticker, modelsCount: aggs.length, weeksCount: parsed.temporal.snapshots_available,
        sigmaRix, highestModel: top, lowestModel: bot,
      }),
    ].filter(Boolean).join("\n\n");

    const userMessage = buildUserMessageWithAssembler(
      parsed.effective_question ?? parsed.raw_question,
      entity.ticker, table, sigmaRix, top, bot,
      workingRows,
      parsed.temporal.from,
      parsed.temporal.to,
      aggs.map((a) => a.model),
    );
    const { fullText, error } = await streamOpenAIResponse({
      systemPrompt, userMessage, logPrefix: tag,
      model: "o3",
      reasoning_effort: "medium",
      maxTokens: 16000,
      temperature: 0,
      onChunk: (d) => { try { onChunk?.(d); } catch (_) { /* noop */ } },
    });
    let finalContent = fullText && fullText.trim().length > 0
      ? fullText
      : (() => {
          const fb = `**Divergencia inter-modelo · ${entity.ticker}**\n\n${table}\n\n_Síntesis no disponible (${error ?? "sin texto"})._`;
          try { onChunk?.(fb); } catch (_) { /* noop */ }
          return fb;
        })();

    // P1-A — append canonical Sec.7 if the LLM omitted it.
    {
      const _s7Agg = computePeriodAggregation(workingRows);
      const _s7 = ensureSection7(
        finalContent,
        metricsFromRows(workingRows),
        _s7Agg.period_summary.submetrics_range,
      );
      finalContent = _s7.content;
      if (_s7.appended) { try { onChunk?.(_s7.tail); } catch (_) { /* noop */ } }
    }

    // P1-B — populate cited_sources_report so index.ts/verifiedSourcesAdapter
    // can ship VerifiedSource[] in SSE done.metadata for the PDF bibliography.
    const _divergenceCited = extractCitedSources(workingRows);

    return {
      datapack: {
        ...datapack,
        pre_rendered_tables: [finalContent, table],
        cited_sources_report: _divergenceCited,
      },
      prompt_modules: ["base", "antiHallucination", "divergenceMode"],
      metadata: buildMetadata(aggs, parsed.temporal.from, parsed.temporal.to, sigmaRix),
    };
  },
};

export const __test__ = { aggregateByModel, renderModelTable, stdev };