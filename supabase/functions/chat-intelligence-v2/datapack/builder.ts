// Agente Rix v2 — DataPack builder (real Supabase queries, max 200 LOC)
// Extrae filas reales de rix_runs_v2 para una entidad + rango temporal,
// computa agregación de período (reutiliza _shared/periodAggregation.ts) y
// devuelve un DataPack listo para el LLM.
import {
  computePeriodAggregation,
  type RawRunRow,
} from "../../_shared/periodAggregation.ts";
import type {
  DataPack,
  MetricAggregation,
  MetricName,
  ModelName,
  ParsedQuery,
  ResolvedEntity,
} from "../types.ts";
import {
  renderEvolutionTable,
  renderModelTable,
  renderPeriodKpiTable,
} from "./tableRenderer.ts";
import { snapshotFlags, isLazyBrutoEnabled } from "../shared/featureFlags.ts";

// Extraído de v1/index.ts línea 887 (FULL_SELECT) — columnas que la skill
// principal necesita para construir tablas + agregados + textos brutos.
const FULL_SELECT =
  "05_ticker, 02_model_name, 03_target_name, 09_rix_score, " +
  "10_resumen, 11_puntos_clave, 17_flags, " +
  "23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, " +
  "35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score, " +
  "25_nvm_categoria, 28_drm_categoria, 31_sim_categoria, 34_rmm_categoria, " +
  "37_cem_categoria, 40_gam_categoria, 43_dcm_categoria, 46_cxm_categoria, " +
  "48_precio_accion, 06_period_from, 07_period_to, batch_execution_date, " +
  "20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, " +
  // 8-column coverage for cited-sources extraction (URL bibliography). The
  // citedSources extractor scans these for [title](url) markdown links and
  // bare URLs, dedupes, and groups them by domain.
  "respuesta_bruto_claude, respuesta_bruto_grok, respuesta_bruto_qwen";

// T2 — LIGHT_SELECT: identical metadata coverage to FULL_SELECT but WITHOUT
// the 7 heavy *_bruto columns. Includes `id` so we can later JOIN-hydrate
// the raw text on demand for skills that actually consume citations
// (companyAnalysis, sectorRanking, comparison, modelDivergence). Keeping
// 05_ticker + 06_period_from in the projection lets hydrateBrutoColumns
// rebuild the row using a stable composite key as a fallback when `id` is
// missing on a legacy row.
const LIGHT_SELECT =
  "id, " +
  "05_ticker, 02_model_name, 03_target_name, 09_rix_score, " +
  "10_resumen, 11_puntos_clave, 17_flags, " +
  "23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, " +
  "35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score, " +
  "25_nvm_categoria, 28_drm_categoria, 31_sim_categoria, 34_rmm_categoria, " +
  "37_cem_categoria, 40_gam_categoria, 43_dcm_categoria, 46_cxm_categoria, " +
  "48_precio_accion, 06_period_from, 07_period_to, batch_execution_date";

// T0 — heavy *_bruto columns isolated, used by the legacy fetch path. When
// CHAT_V2_LAZY_BRUTO becomes true (T2), these are excluded from the main
// SELECT and fetched on demand by skills that consume citations.
const BRUTO_COLUMNS = [
  "20_res_gpt_bruto",
  "21_res_perplex_bruto",
  "22_res_gemini_bruto",
  "23_res_deepseek_bruto",
  "respuesta_bruto_claude",
  "respuesta_bruto_grok",
  "respuesta_bruto_qwen",
] as const;

const BRUTO_SELECT =
  "id, " + BRUTO_COLUMNS.join(", ");

/**
 * Rough byte-size estimate of a fetched row set. Used only for egress
 * instrumentation (T0). Cheap and intentionally not exact: JSON.stringify
 * length is a faithful proxy for the wire payload Supabase REST returns.
 */
function estimateBytes(rows: unknown[]): number {
  if (!rows || rows.length === 0) return 0;
  try {
    return JSON.stringify(rows).length;
  } catch {
    return 0;
  }
}

/**
 * T2 — Fase B: hydrate the 7 *_bruto columns onto an existing set of rows
 * fetched with LIGHT_SELECT. Uses `.in('id', ids)` for a single round trip,
 * then merges by `id` so the caller receives the same shape as FULL_SELECT.
 *
 * Skills that don't need citations skip this call entirely. When
 * CHAT_V2_CITED_URLS_VIEW becomes true (T3), this function will be replaced
 * by a view-read with no per-row payload.
 */
export async function hydrateBrutoColumns(
  supabase: any,
  rows: any[],
  logTag = "hydrate",
): Promise<{ rows: any[]; bytes: number }> {
  if (!rows || rows.length === 0) return { rows, bytes: 0 };
  const ids = rows
    .map((r) => r?.id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0) {
    console.warn(`[RIX-V2][${logTag}] no row ids — skipping hydration (rows=${rows.length})`);
    return { rows, bytes: 0 };
  }
  const all: any[] = [];
  // Page in batches of 1000 to stay under URL limits and PostgREST defaults.
  const PAGE = 1000;
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(BRUTO_SELECT)
      .in("id", slice);
    if (error) {
      console.error(`[RIX-V2][${logTag}] hydrate error:`, error.message);
      break;
    }
    if (data && data.length > 0) all.push(...data);
  }
  const byId = new Map<string, any>(all.map((r) => [r.id, r]));
  const merged = rows.map((r) => {
    const extra = r?.id ? byId.get(r.id) : undefined;
    return extra ? { ...r, ...extra } : r;
  });
  const bytes = estimateBytes(all);
  console.log(
    `[RIX-V2][${logTag}] hydrated rows=${all.length}/${ids.length} bytes_fetched_supabase=${bytes}`,
  );
  return { rows: merged, bytes };
}

const MODEL_NAME_MAP: Array<[string, ModelName]> = [
  ["chatgpt", "ChatGPT"], ["gpt", "ChatGPT"], ["openai", "ChatGPT"],
  ["perplexity", "Perplexity"], ["perp", "Perplexity"],
  ["gemini", "Gemini"], ["google", "Gemini"],
  ["deepseek", "DeepSeek"],
  ["grok", "Grok"], ["xai", "Grok"],
  ["qwen", "Qwen"], ["alibaba", "Qwen"],
];

function normalizeModelName(raw: unknown): ModelName | null {
  const s = String(raw ?? "").toLowerCase().trim();
  for (const [k, v] of MODEL_NAME_MAP) if (s.includes(k)) return v;
  return null;
}

function toMetricAggregation(
  k: string,
  agg: ReturnType<typeof computePeriodAggregation>["period_aggregation"][string],
): MetricAggregation | null {
  if (!agg || agg.weeks_count === 0) return null;
  return {
    metric: k as MetricName,
    mean: agg.mean ?? 0,
    median: agg.median ?? 0,
    min: agg.min ?? 0,
    max: agg.max ?? 0,
    first_week: agg.first_week_value ?? 0,
    last_week: agg.last_week_value ?? 0,
    delta_period: agg.delta_period ?? 0,
    trend: (agg.trend === "n/d" ? "estable" : agg.trend) as MetricAggregation["trend"],
    volatility: agg.volatility ?? 0,
    weeks_count: agg.weeks_count,
  };
}

/**
 * Lee filas reales de rix_runs_v2 para la entidad y rango de la pregunta.
 * Pagina hasta 5 páginas de 1000 filas (suficiente para análisis típicos).
 */
async function fetchRows(
  supabase: any,
  entity: ResolvedEntity,
  fromISO: string,
  toISO: string,
): Promise<RawRunRow[]> {
  const all: RawRunRow[] = [];
  const flags = snapshotFlags();
  const lazy = isLazyBrutoEnabled();
  const projection = lazy ? LIGHT_SELECT : FULL_SELECT;
  console.log(
    `[RIX-V2][datapack] SQL window | ticker=${entity.ticker} | from=${fromISO} | to=${toISO} | projection=${lazy ? "LIGHT" : "FULL"} | flags=${JSON.stringify(flags)}`,
  );
  for (let page = 0; page < 5; page++) {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(projection)
      .eq("05_ticker", entity.ticker)
      // BLOQUE 1 fix: filter by semantic week (06_period_from), not by run
      // date. batch_execution_date is the date the LLM was run; period_from
      // is the Sunday-anchored snapshot week. Using period_from aligns with
      // sectorRanking / divergenceStats / temporalEvolution and makes Q1
      // return the full ~13 weeks instead of ~11.
      .gte("06_period_from", fromISO)
      .lte("06_period_from", toISO)
      .order("06_period_from", { ascending: false })
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) {
      console.error("[RIX-V2][datapack] fetchRows error:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  // T0 instrumentation — bytes fetched from Supabase for this skill call.
  const bytes = estimateBytes(all);
  console.log(
    `[RIX-V2][egress] skill=companyAnalysis path=${lazy ? "LIGHT_SELECT" : "FULL_SELECT"} rows=${all.length} bytes_fetched_supabase=${bytes}`,
  );
  return all;
}

export interface BuiltDataPack {
  datapack: DataPack;
  raw_rows: RawRunRow[];
  observations_count: number;
}

/**
 * Build a real DataPack from Supabase for the company referenced by parsedQuery.
 * Falls back to empty datapack (with explicit coverage) if no rows are returned.
 */
export async function buildDataPack(
  supabase: any,
  parsed: ParsedQuery,
): Promise<BuiltDataPack> {
  const entity = parsed.entities[0];
  if (!entity || entity.ticker === "N/A") {
    return {
      datapack: emptyDatapack(parsed),
      raw_rows: [],
      observations_count: 0,
    };
  }

  const rows = await fetchRows(supabase, entity, parsed.temporal.from, parsed.temporal.to);
  console.log(
    `[RIX-V2][datapack] ${entity.ticker} ${parsed.temporal.from}→${parsed.temporal.to}: ${rows.length} rows`,
  );

  // Modelos presentes en los datos
  const modelsPresent = new Set<ModelName>();
  for (const r of rows) {
    const m = normalizeModelName(r["02_model_name"]);
    if (m) modelsPresent.add(m);
  }
  const requested = parsed.models;
  const withData = requested.filter((m) => modelsPresent.has(m));
  const missing = requested.filter((m) => !modelsPresent.has(m));

  // Agregación de período (reutiliza _shared/periodAggregation.ts)
  const agg = computePeriodAggregation(rows);
  const metrics: MetricAggregation[] = [];
  for (const k of ["RIX", "NVM", "DRM", "SIM", "RMM", "CEM", "GAM", "DCM", "CXM"]) {
    const m = toMetricAggregation(k, agg.period_aggregation[k]);
    if (m) metrics.push(m);
  }

  const periodSummary = metrics.length > 0
    ? {
      rix_mean: agg.period_summary.rix_mean ?? 0,
      rix_trend: agg.period_summary.rix_trend,
      strongest: (agg.period_summary.strongest_metric ?? "RIX") as MetricName,
      weakest: (agg.period_summary.weakest_metric ?? "RIX") as MetricName,
      most_volatile: (agg.period_summary.most_volatile ?? "RIX") as MetricName,
    }
    : undefined;

  // Pre-renderizar tablas (todas en markdown, NUNCA las genera el LLM — constraint #9)
  const preRendered: string[] = [];
  if (metrics.length > 0) preRendered.push(renderPeriodKpiTable(metrics, parsed.mode));
  if (rows.length > 0) preRendered.push(renderModelTable(rows));
  if (parsed.mode === "period" && rows.length > 1) {
    preRendered.push(renderEvolutionTable(rows));
  }

  const datapack: DataPack = {
    entity,
    temporal: parsed.temporal,
    mode: parsed.mode,
    models_used: withData.length > 0 ? withData : requested,
    models_coverage: { requested, with_data: withData, missing },
    metrics,
    raw_rows: rows,
    pre_rendered_tables: preRendered,
    period_summary: periodSummary,
  };

  return { datapack, raw_rows: rows, observations_count: rows.length };
}

function emptyDatapack(parsed: ParsedQuery): DataPack {
  const entity: ResolvedEntity = parsed.entities[0] ?? {
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
    models_coverage: { requested: parsed.models, with_data: [], missing: parsed.models },
    metrics: [],
    raw_rows: [],
    pre_rendered_tables: [],
  };
}

export const __test__ = { normalizeModelName, FULL_SELECT, LIGHT_SELECT, BRUTO_COLUMNS, BRUTO_SELECT, estimateBytes };