// Agente Rix v2 — skill sectorRanking (max 300 LOC)
// Maneja el intent "sector_ranking": construye un ranking real de empresas
// por RIX medio (con desglose por modelo) y delega la síntesis al LLM en
// streaming. Sigue el mismo patrón que companyAnalysis.ts.
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
import { buildCoverageRules } from "../prompts/coverageRules.ts";
import { buildRankingRules } from "../prompts/rankingMode.ts";
import { streamOpenAIResponse } from "../shared/streamOpenAI.ts";
import {
  assembleReport,
  buildPreRenderedSection,
  metricsFromRows,
  renderMethodologyFooter,
  selectBlocks,
  ensureSection7,
} from "../datapack/reportAssembler.ts";
import { computeDivergenceStats } from "../datapack/divergenceStats.ts";
import { extractCitedSources, renderCitedSourcesBlock } from "../datapack/citedSources.ts";
import { aggregateConsensus, type ConsensusLevel } from "../../_shared/consensusRanking.ts";
import { resolveSemanticGroup } from "../../_shared/semanticGroups.ts";
import { computePeriodAggregation } from "../../_shared/periodAggregation.ts";

/**
 * Compact summary of cited URLs for the LLM prompt only. Mirrors the helper
 * in companyAnalysis.ts: full bibliography is appended AFTER streaming via
 * the <!--CITEDSOURCESHERE--> marker, so we never blow OpenAI 400 limits.
 */
function buildCitedSourcesSummary(report: ReturnType<typeof extractCitedSources>): string {
  if (report.totalUrls === 0) return "";
  const topDomains = report.byDomain.slice(0, 10)
    .map((d) => `${d.domain} (${d.sources.length})`)
    .join(", ");
  // FASE 2 — Overlap de fuentes por IA en informes sectoriales.
  const sharedDomains = report.byDomain.filter((d) => d.models.length >= 2);
  const exclusiveByModel = new Map<string, string[]>();
  for (const d of report.byDomain) {
    if (d.models.length === 1) {
      const m = d.models[0];
      const arr = exclusiveByModel.get(m) ?? [];
      arr.push(d.domain);
      exclusiveByModel.set(m, arr);
    }
  }
  const topShared = sharedDomains.slice(0, 6)
    .map((d) => `${d.domain} [${d.models.join("+")}]`)
    .join(", ");
  const exclusiveSummary = Array.from(exclusiveByModel.entries())
    .map(([model, doms]) => `${model}: ${doms.slice(0, 3).join(", ")}${doms.length > 3 ? ` (+${doms.length - 3})` : ""}`)
    .join(" | ");
  const sharedPct = report.totalDomains > 0
    ? Math.round((sharedDomains.length / report.totalDomains) * 100)
    : 0;
  return [
    "**Resumen de fuentes citadas (para narrativa, NO copies este bloque):**",
    `- Total: ${report.totalUrls} URLs únicas de ${report.totalDomains} medios distintos`,
    `- Top 10 dominios: ${topDomains}`,
    "",
    "**Overlap de fuentes por IA (consenso narrativo entre modelos):**",
    `- Dominios compartidos por ≥2 IAs: ${sharedDomains.length}/${report.totalDomains} (${sharedPct}% de consenso de fuente)`,
    `- Top 6 dominios con MAYOR coincidencia: ${topShared || "(ninguno)"}`,
    `- Dominios EXCLUSIVOS por IA: ${exclusiveSummary || "(ninguno)"}`,
    "",
    "INSTRUCCIÓN SECCIÓN 8: NO listes URLs a mano. Escribe 3-4 frases introductorias que mencionen los dominios con MAYOR coincidencia entre IAs (citando qué IAs los comparten) y al menos un dominio EXCLUSIVO por IA. Termina con la línea exacta `<!--CITEDSOURCESHERE-->`. El sistema sustituirá ese marcador por la bibliografía completa.",
  ].join("\n");
}

/**
 * Build a per-company source listing (top dominios por empresa) so the LLM
 * pueda citar medios concretos en la sección 3 (análisis empresa-por-empresa)
 * y en la sección 7 (recomendaciones accionables). Limita a 5 dominios por
 * empresa para no inflar el prompt.
 */
function buildPerCompanySourceList(rows: any[]): string {
  const RAW_FIELDS = [
    "20_res_gpt_bruto", "21_res_perplex_bruto", "22_res_gemini_bruto",
    "23_res_deepseek_bruto", "respuesta_bruto_claude", "respuesta_bruto_grok", "respuesta_bruto_qwen",
  ];
  const URL_RE = /https?:\/\/[^\s)\]"<>]+/g;
  const byTicker = new Map<string, { name: string; domains: Map<string, number> }>();
  for (const r of rows) {
    const t = String(r["05_ticker"] ?? "").trim();
    if (!t) continue;
    const slot = byTicker.get(t) ?? { name: String(r["03_target_name"] ?? t), domains: new Map() };
    for (const f of RAW_FIELDS) {
      const txt = r[f];
      if (!txt || typeof txt !== "string") continue;
      const matches = txt.match(URL_RE) ?? [];
      for (const u of matches) {
        try {
          const d = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
          if (!d || d === "schema.org" || d === "w3.org") continue;
          slot.domains.set(d, (slot.domains.get(d) ?? 0) + 1);
        } catch { /* skip */ }
      }
    }
    byTicker.set(t, slot);
  }
  if (byTicker.size === 0) return "";
  const lines = ["**FUENTES DISPONIBLES POR EMPRESA (úsalas para citar medios reales en secciones 3 y 7):**", ""];
  for (const [ticker, info] of byTicker) {
    const top = [...info.domains.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d, n]) => `${d} (${n})`)
      .join(", ");
    if (top) lines.push(`- ${info.name} (${ticker}): ${top}`);
  }
  return lines.join("\n");
}

/**
 * Build a high-priority coverage warning that the LLM MUST surface in the
 * first paragraph when the requested period is only partially covered.
 */
import { buildCoverageBanner, probeRowsCount } from "../../_shared/coverageBanner.ts";

const RANKING_SELECT =
  "05_ticker, 03_target_name, 02_model_name, 09_rix_score, batch_execution_date, 06_period_from, 07_period_to, " +
  // P1-C.1 — 8 dimension scores so Sec.3 ("análisis empresa por empresa")
  // can show strongest/weakest per ticker (parity with single-entity).
  // Columns are taken from datapack/builder.ts FULL_SELECT (single source
  // of truth for dimension naming). aggregateRanking does NOT read these,
  // so the ranking RIX values remain bit-identical.
  "23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, " +
  "35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score";

// P1-C.1 — Per-company dimension aggregation for Sec.3 of sector reports.
// For each (ticker, dimension), compute the mean across all (model × week)
// rows. Mirrors what computePeriodAggregation does for a single entity but
// partitioned per ticker. Pure function — no SQL, no I/O. Identifies
// strongest (max) and weakest (min) dimension per ticker.
const DIMENSION_COLS: Array<{ key: string; metric: "NVM"|"DRM"|"SIM"|"RMM"|"CEM"|"GAM"|"DCM"|"CXM" }> = [
  { key: "23_nvm_score", metric: "NVM" },
  { key: "26_drm_score", metric: "DRM" },
  { key: "29_sim_score", metric: "SIM" },
  { key: "32_rmm_score", metric: "RMM" },
  { key: "35_cem_score", metric: "CEM" },
  { key: "38_gam_score", metric: "GAM" },
  { key: "41_dcm_score", metric: "DCM" },
  { key: "44_cxm_score", metric: "CXM" },
];

function buildPerCompanyDimensionsBlock(
  rows: any[],
  logTag: string,
): { block: string; tickersWithDims: number; tickersWithoutDims: number } {
  const byTicker = new Map<string, { name: string; dims: Map<string, number[]> }>();
  for (const r of rows) {
    const t = String(r["05_ticker"] ?? "").trim();
    if (!t) continue;
    const slot = byTicker.get(t) ?? { name: String(r["03_target_name"] ?? t), dims: new Map() };
    for (const { key, metric } of DIMENSION_COLS) {
      const raw = r[key];
      const v = typeof raw === "number" ? raw : parseFloat(raw);
      if (!Number.isFinite(v)) continue;
      if (!slot.dims.has(metric)) slot.dims.set(metric, []);
      slot.dims.get(metric)!.push(v);
    }
    byTicker.set(t, slot);
  }
  if (byTicker.size === 0) {
    return { block: "", tickersWithDims: 0, tickersWithoutDims: 0 };
  }
  const lines: string[] = [
    "**MÉTRICAS DIMENSIONALES POR EMPRESA (úsalas LITERALMENTE en la sección 3 'análisis empresa por empresa'):**",
    "Para cada empresa: usa los 8 valores reales y declara explícitamente la métrica más fuerte (max) y la más débil (min) calculadas más abajo. PROHIBIDO escribir 'dato no disponible' si la dimensión tiene un valor numérico aquí.",
    "",
    "| Empresa | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM | Más fuerte | Más débil |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  let withDims = 0;
  let withoutDims = 0;
  for (const [ticker, info] of byTicker) {
    const means: Record<string, number> = {};
    let dimsPresent = 0;
    for (const { metric } of DIMENSION_COLS) {
      const arr = info.dims.get(metric);
      if (arr && arr.length > 0) {
        means[metric] = arr.reduce((a, b) => a + b, 0) / arr.length;
        dimsPresent += 1;
      }
    }
    if (dimsPresent === 0) {
      withoutDims += 1;
      console.log(`${logTag} sector_path=true | ticker=${ticker} | dims_present=0 | fallback=DATA_UNAVAILABLE`);
      continue;
    }
    withDims += 1;
    const cells = DIMENSION_COLS.map(({ metric }) => fmt(means[metric]));
    const present = Object.entries(means);
    let strongest = present[0];
    let weakest = present[0];
    for (const e of present) {
      if (e[1] > strongest[1]) strongest = e;
      if (e[1] < weakest[1]) weakest = e;
    }
    const strongestLabel = `${strongest[0]} (${fmt(strongest[1])})`;
    const weakestLabel = `${weakest[0]} (${fmt(weakest[1])})`;
    lines.push(`| ${info.name} (${ticker}) | ${cells.join(" | ")} | ${strongestLabel} | ${weakestLabel} |`);
    console.log(`${logTag} sector_path=true | ticker=${ticker} | dims_present=${dimsPresent} | strongest=${strongestLabel} | weakest=${weakestLabel}`);
  }
  return { block: lines.join("\n"), tickersWithDims: withDims, tickersWithoutDims: withoutDims };
}

// P1-A.2 — separate, heavier SELECT used ONLY to aggregate raw response
// columns (URLs) for sector-wide citations. Kept distinct from RANKING_SELECT
// so the ranking aggregation stays cheap (12k+ rows) and we only pull the
// raw text columns once per sweep window.
const SOURCE_SELECT = [
  "05_ticker",
  "03_target_name",
  "06_period_from",
  "07_period_to",
  "batch_execution_date",
  "20_res_gpt_bruto",
  "21_res_perplex_bruto",
  "22_res_gemini_bruto",
  "23_res_deepseek_bruto",
  "respuesta_bruto_claude",
  "respuesta_bruto_grok",
  "respuesta_bruto_qwen",
].join(", ");

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

function semaforo(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "⚪";
  if (n >= 70) return "🟢";
  if (n >= 50) return "🟡";
  return "🔴";
}

interface RankingRow {
  ticker: string;
  name: string;
  // ANTI-MEDIANA: ya NO promediamos puntuaciones entre IAs.
  // Exponemos el rango (min..max) inter-modelo y el peor caso semanal.
  rix_min: number;             // mínimo del consenso semanal a través del periodo
  rix_max: number;             // máximo del consenso semanal a través del periodo
  obs: number;
  consensusLevel: ConsensusLevel; // alto/medio/bajo (peor caso semanal)
  weekly_range_avg: number;       // rango (max-min) inter-modelo promedio entre semanas
  per_model: Partial<Record<ModelName, number>>;
}

async function fetchRankingRows(
  supabase: any,
  fromISO: string,
  toISO: string,
  sector: string | null,
  ibexOnly: boolean,
  scopeTickers?: string[] | null,
): Promise<any[]> {
  // PHASE 5 — Align filter to SWEEP axis (07_period_to = Sunday).
  // Snapshot (from===to) → eq; period → range, both on 07_period_to.
  const isSnapshot = fromISO === toISO;
  let q = supabase
    .from("rix_runs_v2")
    .select(RANKING_SELECT)
    .not("09_rix_score", "is", null);
  q = isSnapshot
    ? q.eq("07_period_to", fromISO)
    : q.gte("07_period_to", fromISO).lte("07_period_to", toISO);
  // PRIORITY: explicit scope_tickers (sub-segment) override sector/ibex.
  if (Array.isArray(scopeTickers) && scopeTickers.length > 0) {
    const upper = scopeTickers.map((t) => String(t).toUpperCase());
    q = q.in("05_ticker", upper);
    console.log(`[RIX-V2][sectorRanking] scope_tickers applied | n=${upper.length} | tickers=${upper.join(",")}`);
  } else if ((sector && sector.trim().length > 0) || ibexOnly) {
    // Resolve scope filter (sector OR ibex membership) → list of tickers.
    let scopeQ = supabase.from("repindex_root_issuers").select("ticker");
    if (sector && sector.trim().length > 0) {
      scopeQ = scopeQ.eq("sector_category", sector);
    }
    if (ibexOnly) {
      // IBEX-35 membership: filter by canonical family code (35 issuers).
      // NOT ibex_status (that field flags sweep coverage, ~130 active issuers).
      scopeQ = scopeQ.eq("ibex_family_code", "IBEX-35");
    }
    const { data: tks } = await scopeQ;
    const list = (tks ?? []).map((t: any) => t.ticker).filter(Boolean);
    if (list.length > 0) q = q.in("05_ticker", list);
  }
  const all: any[] = [];
  // 13 weeks × 130 issuers × 6 models ≈ 10k rows. Use 15 pages × 1000 = 15k cap.
  for (let p = 0; p < 15; p++) {
    const { data, error } = await q.range(p * 1000, (p + 1) * 1000 - 1);
    if (error) { console.error("[RIX-V2][sectorRanking]", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`[RIX-V2][sectorRanking] fetched=${all.length} rows | window=${fromISO}→${toISO} | ibexOnly=${ibexOnly} | sector=${sector ?? "n/d"} | scope_tickers=${scopeTickers?.length ?? 0}`);
  return all;
}

// P1-A.2 — Fetch raw response columns for sector scope so we can aggregate
// cited URLs across ALL companies in the leaderboard (not just the seed
// entity). Uses the same scope filters as fetchRankingRows but with the
// heavier SOURCE_SELECT projection. Capped at 5 pages × 1000 = 5k rows
// (≈ 130 issuers × 6 models × 13 weeks max for IBEX-35).
async function fetchSectorSourceRows(
  supabase: any,
  fromISO: string,
  toISO: string,
  sector: string | null,
  ibexOnly: boolean,
  scopeTickers?: string[] | null,
): Promise<any[]> {
  // PHASE 5 — Align filter to SWEEP axis (07_period_to).
  const isSnapshot = fromISO === toISO;
  let q = supabase.from("rix_runs_v2").select(SOURCE_SELECT);
  q = isSnapshot
    ? q.eq("07_period_to", fromISO)
    : q.gte("07_period_to", fromISO).lte("07_period_to", toISO);
  if (Array.isArray(scopeTickers) && scopeTickers.length > 0) {
    const upper = scopeTickers.map((t) => String(t).toUpperCase());
    q = q.in("05_ticker", upper);
  } else if ((sector && sector.trim().length > 0) || ibexOnly) {
    let scopeQ = supabase.from("repindex_root_issuers").select("ticker");
    if (sector && sector.trim().length > 0) scopeQ = scopeQ.eq("sector_category", sector);
    if (ibexOnly) scopeQ = scopeQ.eq("ibex_family_code", "IBEX-35");
    const { data: tks } = await scopeQ;
    const list = (tks ?? []).map((t: any) => t.ticker).filter(Boolean);
    if (list.length > 0) q = q.in("05_ticker", list);
  }
  const all: any[] = [];
  for (let p = 0; p < 8; p++) {
    const { data, error } = await q.range(p * 1000, (p + 1) * 1000 - 1);
    if (error) { console.error("[RIX-V2][sectorRanking] sourceRows", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`[RIX-V2][sectorRanking] source_rows=${all.length} | window=${fromISO}→${toISO} | sector=${sector ?? "n/d"} | ibexOnly=${ibexOnly} | scope_tickers=${scopeTickers?.length ?? 0}`);
  return all;
}

function aggregateRanking(rows: any[], topN: number): RankingRow[] {
  // ANTI-MEDIANA (paridad dashboard nuevo modelo):
  //   1) Agrupar por (ticker, semana) → aggregateConsensus expone min/max/range/level
  //      por snapshot semanal (NO promediamos entre IAs).
  //   2) rix_min = mínimo del periodo, rix_max = máximo del periodo.
  //   3) Worst-case consensusLevel entre semanas (alto < medio < bajo).
  //   4) per_model: valor por modelo (media intra-modelo entre semanas, informativo).
  const byTicker = new Map<string, {
    name: string;
    bySnapshot: Map<string, { ticker: string; rix_score: number }[]>; // key = semana ISO
    per_model: Map<ModelName, number[]>;
    obsTotal: number;
  }>();
  for (const r of rows) {
    const t = String(r["05_ticker"] ?? "").trim();
    if (!t) continue;
    const v = typeof r["09_rix_score"] === "number" ? r["09_rix_score"] : parseFloat(r["09_rix_score"]);
    if (!Number.isFinite(v)) continue;
    const week = String(r["06_period_from"] ?? r.batch_execution_date ?? "").slice(0, 10);
    if (!byTicker.has(t)) {
      byTicker.set(t, {
        name: String(r["03_target_name"] ?? t),
        bySnapshot: new Map(),
        per_model: new Map(),
        obsTotal: 0,
      });
    }
    const slot = byTicker.get(t)!;
    slot.obsTotal += 1;
    if (!slot.bySnapshot.has(week)) slot.bySnapshot.set(week, []);
    slot.bySnapshot.get(week)!.push({ ticker: t, rix_score: v });
    const m = normModel(r["02_model_name"]);
    if (m) {
      if (!slot.per_model.has(m)) slot.per_model.set(m, []);
      slot.per_model.get(m)!.push(v);
    }
  }

  const LEVEL_RANK: Record<ConsensusLevel, number> = { alto: 0, medio: 1, bajo: 2 };
  const RANK_LEVEL: ConsensusLevel[] = ["alto", "medio", "bajo"];

  const out: RankingRow[] = [];
  for (const [ticker, info] of byTicker) {
    const weeklyMins: number[] = [];
    const weeklyMaxs: number[] = [];
    const weeklyRanges: number[] = [];
    let worstLevelRank = 0;
    for (const [, snapRows] of info.bySnapshot) {
      const agg = aggregateConsensus(snapRows).get(ticker);
      if (!agg) continue;
      weeklyMins.push(agg.min);
      weeklyMaxs.push(agg.max);
      weeklyRanges.push(agg.range);
      worstLevelRank = Math.max(worstLevelRank, LEVEL_RANK[agg.consensusLevel]);
    }
    if (weeklyMins.length === 0) continue;
    const rix_min = Math.min(...weeklyMins);
    const rix_max = Math.max(...weeklyMaxs);
    const weekly_range_avg = weeklyRanges.reduce((a, b) => a + b, 0) / weeklyRanges.length;
    const per_model: RankingRow["per_model"] = {};
    for (const [m, vals] of info.per_model) {
      per_model[m] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    out.push({
      ticker,
      name: info.name,
      rix_min,
      rix_max,
      obs: info.obsTotal,
      consensusLevel: RANK_LEVEL[worstLevelRank],
      weekly_range_avg,
      per_model,
    });
  }

  // Sort: nivel de consenso (alto→bajo) primero, luego rango más estrecho primero.
  out.sort((a, b) => {
    const ld = LEVEL_RANK[a.consensusLevel] - LEVEL_RANK[b.consensusLevel];
    if (ld !== 0) return ld;
    return a.weekly_range_avg - b.weekly_range_avg;
  });
  return out.slice(0, topN);
}

function renderRankingTable(
  rows: RankingRow[],
  models: ModelName[],
  coverage: { weeksCount: number; weeksExpected: number; isPartial: boolean; isSnapshot?: boolean },
): string {
  const head = ["#", "Empresa", "RIX rango", "Consenso", ...models, "Obs."];
  const sep = head.map(() => "---").join(" | ");
  const lines = rows.map((r, i) => {
    const cells = [
      String(i + 1),
      `${r.name} (${r.ticker})`,
      `${fmt(r.rix_min)}–${fmt(r.rix_max)}`,
      r.consensusLevel,
      ...models.map((m) => fmt(r.per_model[m])),
      String(r.obs),
    ];
    return `| ${cells.join(" | ")} |`;
  });
  // Footnote metodológico: ANTI-MEDIANA. Exponemos rango inter-modelo
  // (no promediamos entre IAs distintas).
  const partialSuffix = coverage.isPartial && coverage.weeksExpected > coverage.weeksCount
    ? ` (de ${coverage.weeksExpected} esperados)`
    : "";
  const unit = coverage.isSnapshot ? "modelos" : "semanas";
  const verb = coverage.isSnapshot ? "respondieron" : "observadas";
  const footnote = `*RIX rango = mínimo–máximo de las puntuaciones individuales de las 6 IAs (${coverage.weeksCount} ${unit} ${verb}${partialSuffix}). NO se promedia entre IAs. Consenso: alto (≤10 pts dispersión) · medio (≤20) · bajo (>20).*`;
  return [
    "**Ranking por consenso entre IAs (con desglose por modelo)**",
    "",
    `| ${head.join(" | ")} |`,
    `| ${sep} |`,
    ...lines,
    "",
    footnote,
  ].join("\n");
}

/**
 * BLOQUE 3C — Competitive context: group the top-N ranking by sector,
 * highlighting which sector dominates the leaderboard. Uses the
 * sector_category field from repindex_root_issuers (fetched here, single
 * additional SQL — same pattern as companyAnalysis competitiveContext).
 */
async function buildCompetitiveContextBlock(
  supabase: any,
  ranking: RankingRow[],
): Promise<string> {
  if (ranking.length === 0) return "";
  const tickers = ranking.map((r) => r.ticker);
  const { data } = await supabase
    .from("repindex_root_issuers")
    .select("ticker, sector_category")
    .in("ticker", tickers);
  const sectorByTicker = new Map<string, string>();
  for (const row of data ?? []) {
    if (row?.ticker) sectorByTicker.set(row.ticker, row.sector_category ?? "Sin sector");
  }
  const bySector = new Map<string, RankingRow[]>();
  for (const r of ranking) {
    const s = sectorByTicker.get(r.ticker) ?? "Sin sector";
    if (!bySector.has(s)) bySector.set(s, []);
    bySector.get(s)!.push(r);
  }
  const sortedSectors = [...bySector.entries()].sort((a, b) => b[1].length - a[1].length);
  const lines: string[] = [
    "**Contexto competitivo — distribución sectorial del top**",
    "",
    "| Sector | Empresas en el top | Tickers | RIX rango del grupo |",
    "|---|---|---|---|",
  ];
  for (const [sector, list] of sortedSectors) {
    const groupMin = Math.min(...list.map((r) => r.rix_min));
    const groupMax = Math.max(...list.map((r) => r.rix_max));
    lines.push(`| ${sector} | ${list.length} | ${list.map((r) => r.ticker).join(", ")} | ${fmt(groupMin)}–${fmt(groupMax)} |`);
  }
  const dominant = sortedSectors[0];
  if (dominant && dominant[1].length >= 2) {
    lines.push("", `_Sector dominante en el top: **${dominant[0]}** (${dominant[1].length} de ${ranking.length} empresas)._`);
  }
  return lines.join("\n");
}

function buildUserMessage(question: string, scope: string, table: string, rows: RankingRow[]): string {
  const compact = rows.map((r, i) => `${i + 1}. ${r.name} (${r.ticker}) RIX=${fmt(r.rix_min)}–${fmt(r.rix_max)} (consenso ${r.consensusLevel})`).join("\n");
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `ALCANCE: ${scope}`,
    "",
    "TABLA DE RANKING PRE-RENDERIZADA (úsala literal, NO la regeneres):",
    "",
    table,
    "",
    "RESUMEN COMPACTO PARA REFERENCIA:",
    compact,
  ].join("\n");
}

/**
 * FASE D — Build the user message using the transversal reportAssembler.
 * The ranking table is the skill's primary block; modelBreakdown +
 * divergenceStats + KPI table + methodology footer are appended.
 */
function buildUserMessageWithAssembler(
  question: string,
  scope: string,
  rankingTable: string,
  rows: RankingRow[],
  rawRows: any[],
  fromISO: string,
  toISO: string,
  models: string[],
  competitiveContext: string,
  citedSourcesSummary: string,
  perCompanySources: string,
  perCompanyDimensions: string,
): string {
  const metrics = metricsFromRows(rawRows);
  const _aggForReco = computePeriodAggregation(rawRows);
  const report = assembleReport({
    raw_rows: rawRows,
    metrics,
    mode: "period",
    competitiveContext,
    submetricsRange: _aggForReco.period_summary.submetrics_range,
    rixRangeSummary: {
      rix_min: _aggForReco.period_summary.rix_min,
      rix_max: _aggForReco.period_summary.rix_max,
      rix_consensus_level: _aggForReco.period_summary.rix_consensus_level,
    },
  });
  const blocks = selectBlocks(report, "sectorRanking");
  const divergence = computeDivergenceStats(rawRows);
  const uniqueWeeks = new Set(
    rawRows.map((r) => String(r["06_period_from"] ?? r.batch_execution_date ?? "").slice(0, 10)).filter(Boolean),
  ).size;
  const methodology = renderMethodologyFooter({
    fromISO, toISO, models, observationsCount: rawRows.length,
    uniqueWeeks,
    divergenceLevel: divergence.models_count > 0
      ? `${divergence.level} (σ inter-modelo = ${(Math.round(divergence.sigma * 10) / 10)} pts, snapshot ${divergence.snapshot_date ?? "n/d"})`
      : "no calculable",
  });
  const compact = rows.map((r, i) => `${i + 1}. ${r.name} (${r.ticker}) RIX=${fmt(r.rix_min)}–${fmt(r.rix_max)} (consenso ${r.consensusLevel})`).join("\n");
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `ALCANCE: ${scope}`,
    "",
    `MÉTRICAS GLOBALES VERIFICADAS (úsalas literalmente, NO recalcules):`,
    `• Observaciones totales: ${rawRows.length}`,
    `• Semanas únicas con datos: ${uniqueWeeks}`,
    `• Empresas únicas analizadas: ${new Set(rawRows.map((r) => r["05_ticker"])).size}`,
    "",
    "ETIQUETADO OBLIGATORIO (no confundir):",
    "• 'Volatilidad temporal (SD)' = dispersión semanal del RIX medio del índice (suele ser baja, ~2 pts).",
    "• 'Dispersión inter-modelo (σ)' = desacuerdo entre modelos en una misma semana (más alta, ~8-10 pts).",
    "Etiqueta SIEMPRE qué tipo de dispersión muestras y nunca uses 'SD' y 'σ' como sinónimos.",
    "",
    buildPreRenderedSection(
      `<PRE_RENDERED_RANKING_TABLE>\n${rankingTable}\n</PRE_RENDERED_RANKING_TABLE>`,
      blocks,
      methodology,
    ),
    "",
    perCompanyDimensions,
    "",
    perCompanySources,
    "",
    citedSourcesSummary,
    "",
    "Sigue ESTRICTAMENTE la estructura de 9 secciones definida en el system prompt (MODO RANKING). No omitas la sección 3 (análisis empresa por empresa) ni la 7 (5+ recomendaciones específicas). Termina la sección 8 con el marcador <!--CITEDSOURCESHERE--> en su propia línea.",
    "",
    "RESUMEN COMPACTO PARA REFERENCIA:",
    compact,
  ].join("\n");
}

function buildMetadata(
  ranking: RankingRow[],
  rawRows: any[],
  fromISO: string,
  toISO: string,
  models: ModelName[],
): ReportMetadata {
  // Rango global del ranking = max(rix_max) - min(rix_min) entre las empresas listadas.
  const mins = ranking.map((r) => r.rix_min).filter((n) => Number.isFinite(n));
  const maxs = ranking.map((r) => r.rix_max).filter((n) => Number.isFinite(n));
  const range = mins.length && maxs.length ? Math.max(...maxs) - Math.min(...mins) : 0;
  const uniqueWeeks = new Set(
    rawRows.map((r) => String(r["06_period_from"] ?? r.batch_execution_date ?? "").slice(0, 10)).filter(Boolean),
  ).size;
  const uniqueCompanies = new Set(rawRows.map((r) => r["05_ticker"]).filter(Boolean)).size;
  return {
    models_used: models.join(","),
    period_from: fromISO,
    period_to: toISO,
    // BLOQUE 2 fix: single source of truth = full SQL result count.
    observations_count: rawRows.length,
    divergence_level: range < 10 ? "bajo" : range < 25 ? "medio" : "alto",
    divergence_points: Math.round(range),
    unique_companies: uniqueCompanies || ranking.length,
    unique_weeks: uniqueWeeks,
  };
}

export const sectorRankingSkill: Skill = {
  name: "sectorRanking",
  intents: ["sector_ranking"],

  async execute(input: SkillInput): Promise<SkillOutput> {
    const { parsed, supabase, logPrefix, onChunk } = input;
    const tag = `${logPrefix}[sectorRanking]`;
    // GAP 3 — Resolución de grupos canónicos.
    // Prioridad: (1) scope_tickers ya poblado por orchestrator (4 hardcoded),
    //            (2) fallback DB-driven a rix_semantic_groups (21 grupos)
    //                con soporte de exclusions.
    let scopeTickers: string[] | null =
      (parsed.scope_tickers && parsed.scope_tickers.length > 0)
        ? parsed.scope_tickers
        : null;
    if (!scopeTickers) {
      const grp = await resolveSemanticGroup(parsed.raw_question, supabase);
      if (grp.canonical_key && grp.issuer_ids.length > 0) {
        const excl = new Set(grp.exclusions.map((t) => t.toUpperCase()));
        scopeTickers = grp.issuer_ids.filter((t) => !excl.has(t.toUpperCase()));
        console.log(`[RIX-V2][sectorRanking] semanticGroup fallback="${grp.canonical_key}" tickers=${scopeTickers.join(",")} excl=[${grp.exclusions.join(",")}]`);
      }
    }
    // When explicit sub-segment tickers are present, ignore sector_category
    // entirely (e.g. "grupos hospitalarios" must NOT load all of "Salud y
    // Farmacéutico"). Otherwise fall back to the resolved entity sector.
    const sector = scopeTickers ? null : (parsed.entities[0]?.sector_category ?? null);
    // Detect IBEX hint directly from the raw question (sector_ranking has
    // no resolved entity by design).
    const ibexOnly = /\bibex(?:[-\s]?\d+)?\b/i.test(parsed.raw_question);
    // Detect explicit "top N" → cap N between 3 and 35.
    const topMatch = parsed.raw_question.match(/\btop\s*(\d{1,2})\b/i);
    const topN = topMatch ? Math.max(3, Math.min(35, parseInt(topMatch[1], 10))) : 15;
    const scopeLabel = scopeTickers
      ? `grupo seleccionado (${scopeTickers.length} empresas: ${scopeTickers.join(", ")})`
      : sector
        ? `sector ${sector}`
        : (ibexOnly ? "IBEX-35" : "todas las empresas cubiertas");

    // Use the REQUESTED window (e.g. Q1 = 2026-01-01 → 2026-03-31) for the
    // SQL bounds, NOT the reconciled/clamped window which may collapse to a
    // 1-2 day range when reconcileWindow's row-limit truncates the scan.
    const sqlFrom = parsed.temporal.requested_from ?? parsed.temporal.from;
    const sqlTo = parsed.temporal.requested_to ?? parsed.temporal.to;
    console.log(`${tag} SQL window | requested=${sqlFrom}→${sqlTo} | reconciled=${parsed.temporal.from}→${parsed.temporal.to}`);
    const rows = await fetchRankingRows(supabase, sqlFrom, sqlTo, sector, ibexOnly, scopeTickers);
    // P1-C.1 — forensic log for dimension propagation in sector path.
    const _uniqTickers = new Set(rows.map((r) => r["05_ticker"]).filter(Boolean)).size;
    console.log(`[RIX-V2][companyAnalysis] dimension_metrics_fetched | tickers=${_uniqTickers} | rows=${rows.length} | window=${sqlFrom}→${sqlTo}`);
    // TAREA -1.D — Recompute temporal coverage from the REAL fetched rows.
    // `parsed.temporal.snapshots_available` comes from reconcileWindow which
    // applies a 2000-row LIMIT and can collapse to 2 weeks for large groups
    // (e.g. IBEX-35: 35 × 6 × 13 ≈ 2730 rows). The ranking SQL has no such
    // limit and returns the full window, so we trust `rows` as ground truth.
    // We DO NOT mutate parsed.temporal in-place to avoid side-effects on
    // other consumers; we build a local `effectiveTemporal` and pass it
    // explicitly to the 3 prompt builders that read coverage metadata.
    const prevSnapshotsAvailable = parsed.temporal.snapshots_available;
    // Snapshot puntual (from===to) ⇒ snapshots_expected semantics is
    // "modelos esperados (6)", NOT "semanas". Count DISTINCT MODELS so the
    // banner / footnote / prompts report 6/6 models, not 1/6 weeks.
    const isSnapshotMode = parsed.temporal.from === parsed.temporal.to;
    const realWeekKeys = new Set<string>();
    const realModelKeys = new Set<string>();
    for (const r of rows) {
      const periodTo = r["07_period_to"] ?? r["07_period_from"];
      if (typeof periodTo === "string" && periodTo.length >= 10) {
        realWeekKeys.add(periodTo.slice(0, 10));
      }
      const m = r["02_model_name"];
      if (typeof m === "string" && m.length > 0) realModelKeys.add(m);
    }
    const realWeeksCount = realWeekKeys.size;
    const realObservedCount = isSnapshotMode ? realModelKeys.size : realWeeksCount;
    const effectiveTemporal = realObservedCount > 0
      ? {
          ...parsed.temporal,
          snapshots_available: realObservedCount,
          coverage_ratio: parsed.temporal.snapshots_expected > 0
            ? Math.min(1, realObservedCount / parsed.temporal.snapshots_expected)
            : parsed.temporal.coverage_ratio,
          is_partial: parsed.temporal.snapshots_expected > 0
            ? realObservedCount < parsed.temporal.snapshots_expected
            : parsed.temporal.is_partial,
        }
      : parsed.temporal;
    console.log(`${tag} temporal recompute | mode=${isSnapshotMode ? "snapshot" : "period"} | snapshots_available was=${prevSnapshotsAvailable} now=${effectiveTemporal.snapshots_available} (weeks=${realWeeksCount}, models=${realModelKeys.size}, expected=${parsed.temporal.snapshots_expected})`);
    const ranking = aggregateRanking(rows, topN);
    const models = parsed.models;
    const table = ranking.length > 0
      ? renderRankingTable(ranking, models, {
          weeksCount: effectiveTemporal.snapshots_available,
          weeksExpected: effectiveTemporal.snapshots_expected,
          isPartial: effectiveTemporal.is_partial,
          isSnapshot: isSnapshotMode,
        })
      : "_Sin datos para el período/alcance solicitado._";

    const datapack: DataPack = {
      entity: parsed.entities[0] ?? { ticker: "N/A", company_name: scopeLabel, sector_category: sector, source: "exact" },
      temporal: { ...parsed.temporal, from: sqlFrom, to: sqlTo },
      mode: parsed.mode,
      models_used: models,
      models_coverage: { requested: models, with_data: models, missing: [] },
      metrics: [],
      raw_rows: rows,
      pre_rendered_tables: [table],
    };

    const modules: string[] = ["base", "antiHallucination", "rankingMode"];
    if (parsed.mode === "period") modules.push("periodMode"); else modules.push("snapshotMode");
    // Always include coverageRules so consensus/divergence rules apply (parity with companyAnalysis).
    modules.push("coverageRules");

    if (ranking.length === 0) {
      // C — Honest fallback: probe rix_runs_v2 with a raw COUNT(*) before
      // claiming "Sin datos". Operator log + user-facing surfacing of the
      // raw row count when the scope dropped them.
      const probeTickers = Array.isArray(scopeTickers) && scopeTickers.length ? scopeTickers : null;
      const probedCount = await probeRowsCount(supabase, { fromISO: sqlFrom, toISO: sqlTo, tickers: probeTickers });
      console.log(`${tag} ranking-empty fallback | probe_count=${probedCount} | scope=${scopeLabel}`);
      const probeNote = probedCount > 0
        ? ` (probe: ${probedCount} filas crudas en rix_runs_v2 para ese período no encajaron en el alcance pedido)`
        : "";
      const fallback = `**Ranking · ${scopeLabel}**\n\n_Sin datos suficientes para construir un ranking en el período ${sqlFrom} → ${sqlTo}${probeNote}._`;
      try { onChunk?.(fallback); } catch (_) { /* noop */ }
      return {
        datapack: { ...datapack, pre_rendered_tables: [fallback] },
        prompt_modules: modules,
        metadata: buildMetadata([], rows, sqlFrom, sqlTo, models),
      };
    }

    const systemPrompt = [
      buildCoverageBanner(effectiveTemporal),
      buildBasePrompt({ languageName: "español" }),
      buildAntiHallucinationRules(),
      parsed.mode === "period"
        ? buildPeriodRules({ fromISO: sqlFrom, toISO: sqlTo, weeksCount: effectiveTemporal.snapshots_available, requestedLabel: effectiveTemporal.requested_label })
        : buildSnapshotRules({ weekFromISO: sqlFrom, weekToISO: sqlTo }),
      buildRankingRules({ scopeLabel, topN: ranking.length, weeksCount: effectiveTemporal.snapshots_available, modelsCount: models.length, isSnapshot: isSnapshotMode }),
      buildCoverageRules({
        requested: models,
        withData: models,
        missing: [],
        snapshotsExpected: effectiveTemporal.snapshots_expected,
        snapshotsAvailable: effectiveTemporal.snapshots_available,
        coverageRatio: effectiveTemporal.coverage_ratio,
        isPartial: effectiveTemporal.is_partial,
        isSnapshot: isSnapshotMode,
      }),
    ].filter(Boolean).join("\n\n");

    const competitiveContext = await buildCompetitiveContextBlock(supabase, ranking);
    // P1-A.2 — Aggregate cited URLs across the FULL sector scope by issuing
    // a second SQL with the heavy raw-response columns. RANKING_SELECT is too
    // narrow (no raw text), so the previous extractCitedSources(rows) always
    // yielded 0 URLs in sector reports. We now call fetchSectorSourceRows()
    // and feed those rows into extractCitedSources/renderCitedSourcesBlock.
    const sourceRows = await fetchSectorSourceRows(supabase, sqlFrom, sqlTo, sector, ibexOnly, scopeTickers);
    const citedSourcesReport = extractCitedSources(sourceRows);
    const citedSourcesFull = renderCitedSourcesBlock(citedSourcesReport, sqlFrom, sqlTo);
    const citedSourcesSummary = buildCitedSourcesSummary(citedSourcesReport);
    const perCompanySources = buildPerCompanySourceList(sourceRows);
    console.log(`${tag} sector cited sources | source_rows=${sourceRows.length} | total=${citedSourcesReport.totalUrls} URLs · ${citedSourcesReport.totalDomains} domains`);

    const userMessage = buildUserMessageWithAssembler(
      parsed.effective_question ?? parsed.raw_question,
      scopeLabel,
      table,
      ranking,
      rows,
      sqlFrom,
      sqlTo,
      models,
      competitiveContext,
      citedSourcesSummary,
      perCompanySources,
      buildPerCompanyDimensionsBlock(rows, `[RIX-V2][companyAnalysis]`).block,
    );
    // P1-A.2 — Buffer the LLM output instead of streaming raw chunks. The
    // marker substitution happens AFTER the LLM finishes, so streaming raw
    // chunks would leak the literal `<!--CITEDSOURCESHERE-->` to the UI
    // before we get a chance to replace it. We emit the sanitized
    // finalContent in a single onChunk call below.
    const { fullText, error } = await streamOpenAIResponse({
      systemPrompt, userMessage, logPrefix: tag,
      model: "o3",
      reasoning_effort: "medium",
      maxTokens: 32000,
      temperature: 0,
      onChunk: (_d) => { /* buffered: do not stream raw LLM output */ },
    });

    let finalContent = fullText && fullText.trim().length > 0
      ? fullText
      : `**Ranking · ${scopeLabel}**\n\n${table}\n\n_No se pudo completar la síntesis (${error ?? "sin texto"})._`;

    // Bug A — scrub: si el LLM copió los delimitadores literales o regeneró
    // el footnote viejo ("RIX medio = promedio del consenso semanal ... HOY"),
    // sustituimos por el footnote canónico anti-mediana.
    {
      const before = finalContent;
      // 1) Quitar delimitadores literales si el LLM los emitió.
      finalContent = finalContent
        .replace(/<\/?PRE_RENDERED_RANKING_TABLE>\s*/g, "");
      // 2) Reemplazar footnote viejo en cursiva (variantes con/sin "Fecha de cálculo: HOY").
      const OLD_FOOTNOTE_RE = /\*RIX medio\s*=\s*promedio[^*\n]*?(?:HOY[^*\n]*?)?\*/gi;
      const canonicalFootnote = `*RIX rango = mínimo–máximo de las puntuaciones individuales de las 6 IAs durante las semanas observadas. NO se promedia entre IAs. Consenso: alto (≤10 pts dispersión) · medio (≤20) · bajo (>20).*`;
      finalContent = finalContent.replace(OLD_FOOTNOTE_RE, canonicalFootnote);
      // 3) Safety net: literal "Fecha de cálculo: \"HOY\"" sin envolver.
      finalContent = finalContent.replace(/Fecha de cálculo:\s*"?HOY"?\.?/gi, "");
      if (before !== finalContent) {
        console.log(`${tag} ranking_footnote_scrub | applied`);
      }
    }

    // P1-A — ALWAYS substitute the cited-sources marker, even when there are
    // no verifiable URLs. Previously the entire substitution was skipped when
    // citedSourcesFull was empty, which left the literal marker in the output
    // for sector-wide queries with 0 aggregated URLs (Banca regression).
    {
      const MARKER = "<!--CITEDSOURCESHERE-->";
      const MARKER_RE = /<!--\s*[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*CITED[\s_]*<?\/?(?:strong|em|b|i)?>?[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*SOURCES[\s_]*<?\/?(?:strong|em|b|i)?>?[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*HERE\s*<?\/?(?:strong|em|b|i)?>?[*_\s]*-->/i;
      const hasUrls = !!(citedSourcesFull && citedSourcesFull.trim().length > 0);
      const replacement = hasUrls
        ? citedSourcesFull
        : "_No hay fuentes verificables en este período._";
      const markerPresent = finalContent.includes(MARKER) || MARKER_RE.test(finalContent);
      if (markerPresent) {
        finalContent = finalContent.includes(MARKER)
          ? finalContent.replace(MARKER, replacement)
          : finalContent.replace(MARKER_RE, replacement);
      } else if (hasUrls) {
        const tail = "\n\n" + replacement;
        finalContent = finalContent + tail;
      }
      // Final safety net: scrub residual variants of the marker if any survived.
      finalContent = finalContent.replace(new RegExp(MARKER_RE.source, "gi"), "").split(MARKER).join("");
      console.log(`${tag} cited_sources_substitution | hasUrls=${hasUrls} markerPresent=${markerPresent}`);
    }

    // P1-A — append canonical Sec.7 if the LLM omitted it.
    {
      const _s7Agg = computePeriodAggregation(rows);
      const _s7 = ensureSection7(
        finalContent,
        metricsFromRows(rows),
        _s7Agg.period_summary.submetrics_range,
      );
      finalContent = _s7.content;
    }

    // P1-A.2 — Emit the fully-sanitized finalContent as a single chunk
    // (post-marker, post-Sec7). This is the ONLY place where chunks reach
    // the UI for the sector path, guaranteeing no marker leak in stream.
    try { onChunk?.(finalContent); } catch (_) { /* noop */ }

    return {
      datapack: {
        ...datapack,
        pre_rendered_tables: [finalContent, table],
        // P0-1 — Structured cited-sources report for SSE done metadata.
        cited_sources_report: citedSourcesReport,
      },
      prompt_modules: modules,
      metadata: buildMetadata(ranking, rows, sqlFrom, sqlTo, models),
    };
  },
};

export const __test__ = { aggregateRanking, renderRankingTable, normModel };