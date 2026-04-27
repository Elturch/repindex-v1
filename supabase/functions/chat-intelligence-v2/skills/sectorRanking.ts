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
} from "../datapack/reportAssembler.ts";
import { computeDivergenceStats } from "../datapack/divergenceStats.ts";
import { extractCitedSources, renderCitedSourcesBlock } from "../datapack/citedSources.ts";
import { aggregateConsensus, type ConsensusLevel } from "../../_shared/consensusRanking.ts";
import { resolveSemanticGroup } from "../../_shared/semanticGroups.ts";

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
  return [
    "**Resumen de fuentes citadas (para narrativa, NO copies este bloque):**",
    `- Total: ${report.totalUrls} URLs únicas de ${report.totalDomains} medios distintos`,
    `- Top 10 dominios: ${topDomains}`,
    "",
    "INSTRUCCIÓN SECCIÓN 8: NO listes URLs a mano. Escribe 2-3 frases introductorias y termina con la línea exacta `<!--CITEDSOURCESHERE-->`. El sistema sustituirá ese marcador por la bibliografía completa.",
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
function buildCoverageBanner(t: { from: string; to: string; coverage_ratio: number; is_partial: boolean; snapshots_available: number; snapshots_expected: number }): string {
  if (!t.is_partial && t.coverage_ratio >= 0.9) return "";
  const pct = Math.round((t.coverage_ratio ?? 0) * 100);
  return `IMPORTANTE — COBERTURA PARCIAL (PRIORIDAD MÁXIMA):
• El período solicitado solo dispone de datos desde ${t.from} hasta ${t.to} (${t.snapshots_available}/${t.snapshots_expected} snapshots, ~${pct}% del período pedido).
• ABRE el informe declarando esta cobertura parcial en el primer párrafo.
• PROHIBIDO extrapolar tendencias a las semanas no cubiertas.`;
}

const RANKING_SELECT =
  "05_ticker, 03_target_name, 02_model_name, 09_rix_score, batch_execution_date, 06_period_from";

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
  rix_mean: number;            // = majorityScore promediada por semana (paridad dashboard)
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
  let q = supabase
    .from("rix_runs_v2")
    .select(RANKING_SELECT)
    .gte("06_period_from", fromISO)
    .lte("06_period_from", toISO)
    .not("09_rix_score", "is", null);
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

function aggregateRanking(rows: any[], topN: number): RankingRow[] {
  // PARIDAD BIT-IDÉNTICA con dashboard (c2):
  //   1) Agrupar por (ticker, semana) → aggregateConsensus por snapshot semanal
  //      (descarta max+min si ≥4 modelos en esa semana).
  //   2) Promediar las majorityScores semanales → rix_mean del ranking.
  //   3) Worst-case consensusLevel entre semanas (alto < medio < bajo).
  //   4) per_model: media simple por modelo a través de todas las semanas (informativo).
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
    const weeklyMajority: number[] = [];
    const weeklyRanges: number[] = [];
    let worstLevelRank = 0;
    for (const [, snapRows] of info.bySnapshot) {
      const agg = aggregateConsensus(snapRows).get(ticker);
      if (!agg) continue;
      weeklyMajority.push(agg.majorityScore);
      weeklyRanges.push(agg.range);
      worstLevelRank = Math.max(worstLevelRank, LEVEL_RANK[agg.consensusLevel]);
    }
    if (weeklyMajority.length === 0) continue;
    const rix_mean = weeklyMajority.reduce((a, b) => a + b, 0) / weeklyMajority.length;
    const weekly_range_avg = weeklyRanges.reduce((a, b) => a + b, 0) / weeklyRanges.length;
    const per_model: RankingRow["per_model"] = {};
    for (const [m, vals] of info.per_model) {
      per_model[m] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    out.push({
      ticker,
      name: info.name,
      rix_mean,
      obs: info.obsTotal,
      consensusLevel: RANK_LEVEL[worstLevelRank],
      weekly_range_avg,
      per_model,
    });
  }

  // Sort paridad dashboard: nivel de consenso (alto→bajo) primero, luego score desc.
  out.sort((a, b) => {
    const ld = LEVEL_RANK[a.consensusLevel] - LEVEL_RANK[b.consensusLevel];
    if (ld !== 0) return ld;
    return b.rix_mean - a.rix_mean;
  });
  return out.slice(0, topN);
}

function renderRankingTable(rows: RankingRow[], models: ModelName[]): string {
  const head = ["#", "Empresa", "RIX medio", ...models, "Obs."];
  const sep = head.map(() => "---").join(" | ");
  const lines = rows.map((r, i) => {
    const cells = [
      String(i + 1),
      `${r.name} (${r.ticker})`,
      `${semaforo(r.rix_mean)} ${fmt(r.rix_mean)}`,
      ...models.map((m) => fmt(r.per_model[m])),
      String(r.obs),
    ];
    return `| ${cells.join(" | ")} |`;
  });
  return [
    "**Ranking por RIX medio (con desglose por modelo)**",
    "",
    `| ${head.join(" | ")} |`,
    `| ${sep} |`,
    ...lines,
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
    "| Sector | Empresas en el top | Tickers | RIX medio del grupo |",
    "|---|---|---|---|",
  ];
  for (const [sector, list] of sortedSectors) {
    const groupAvg = list.reduce((a, r) => a + r.rix_mean, 0) / list.length;
    lines.push(`| ${sector} | ${list.length} | ${list.map((r) => r.ticker).join(", ")} | ${fmt(groupAvg)} |`);
  }
  const dominant = sortedSectors[0];
  if (dominant && dominant[1].length >= 2) {
    lines.push("", `_Sector dominante en el top: **${dominant[0]}** (${dominant[1].length} de ${ranking.length} empresas)._`);
  }
  return lines.join("\n");
}

function buildUserMessage(question: string, scope: string, table: string, rows: RankingRow[]): string {
  const compact = rows.map((r, i) => `${i + 1}. ${r.name} (${r.ticker}) RIX=${fmt(r.rix_mean)}`).join("\n");
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
): string {
  const metrics = metricsFromRows(rawRows);
  const report = assembleReport({ raw_rows: rawRows, metrics, mode: "period", competitiveContext });
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
  const compact = rows.map((r, i) => `${i + 1}. ${r.name} (${r.ticker}) RIX=${fmt(r.rix_mean)}`).join("\n");
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
    buildPreRenderedSection(rankingTable, blocks, methodology),
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
  const rixs = ranking.map((r) => r.rix_mean).filter((n) => Number.isFinite(n));
  const range = rixs.length ? Math.max(...rixs) - Math.min(...rixs) : 0;
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
    // TAREA -1.D — Recompute temporal coverage from the REAL fetched rows.
    // `parsed.temporal.snapshots_available` comes from reconcileWindow which
    // applies a 2000-row LIMIT and can collapse to 2 weeks for large groups
    // (e.g. IBEX-35: 35 × 6 × 13 ≈ 2730 rows). The ranking SQL has no such
    // limit and returns the full window, so we trust `rows` as ground truth.
    // We DO NOT mutate parsed.temporal in-place to avoid side-effects on
    // other consumers; we build a local `effectiveTemporal` and pass it
    // explicitly to the 3 prompt builders that read coverage metadata.
    const prevSnapshotsAvailable = parsed.temporal.snapshots_available;
    const realWeekKeys = new Set<string>();
    for (const r of rows) {
      const periodTo = r["07_period_to"] ?? r["07_period_from"];
      if (typeof periodTo === "string" && periodTo.length >= 10) {
        realWeekKeys.add(periodTo.slice(0, 10));
      }
    }
    const realWeeksCount = realWeekKeys.size;
    const effectiveTemporal = realWeeksCount > 0
      ? {
          ...parsed.temporal,
          snapshots_available: realWeeksCount,
          coverage_ratio: parsed.temporal.snapshots_expected > 0
            ? realWeeksCount / parsed.temporal.snapshots_expected
            : parsed.temporal.coverage_ratio,
          is_partial: parsed.temporal.snapshots_expected > 0
            ? realWeeksCount < parsed.temporal.snapshots_expected
            : parsed.temporal.is_partial,
        }
      : parsed.temporal;
    console.log(`${tag} temporal recompute | snapshots_available was=${prevSnapshotsAvailable} now=${effectiveTemporal.snapshots_available} (real weeks in rows=${realWeeksCount}, expected=${parsed.temporal.snapshots_expected})`);
    const ranking = aggregateRanking(rows, topN);
    const models = parsed.models;
    const table = ranking.length > 0 ? renderRankingTable(ranking, models) : "_Sin datos para el período/alcance solicitado._";

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
      const fallback = `**Ranking · ${scopeLabel}**\n\n_Sin datos suficientes para construir un ranking en el período ${sqlFrom} → ${sqlTo}._`;
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
      buildRankingRules({ scopeLabel, topN: ranking.length, weeksCount: effectiveTemporal.snapshots_available, modelsCount: models.length }),
      buildCoverageRules({
        requested: models,
        withData: models,
        missing: [],
        snapshotsExpected: effectiveTemporal.snapshots_expected,
        snapshotsAvailable: effectiveTemporal.snapshots_available,
        coverageRatio: effectiveTemporal.coverage_ratio,
        isPartial: effectiveTemporal.is_partial,
      }),
    ].filter(Boolean).join("\n\n");

    const competitiveContext = await buildCompetitiveContextBlock(supabase, ranking);
    // Cited sources (real URLs from raw-response columns). Pre-rendered as a
    // markdown block; appended AFTER streaming via the marker substitution.
    const citedSourcesReport = extractCitedSources(rows);
    const citedSourcesFull = renderCitedSourcesBlock(citedSourcesReport, sqlFrom, sqlTo);
    const citedSourcesSummary = buildCitedSourcesSummary(citedSourcesReport);
    const perCompanySources = buildPerCompanySourceList(rows);
    console.log(`${tag} cited sources | total=${citedSourcesReport.totalUrls} URLs · ${citedSourcesReport.totalDomains} domains`);

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
    );
    const { fullText, error } = await streamOpenAIResponse({
      systemPrompt, userMessage, logPrefix: tag,
      model: "o3",
      reasoning_effort: "medium",
      maxTokens: 32000,
      temperature: 0,
      onChunk: (d) => { try { onChunk?.(d); } catch (_) { /* noop */ } },
    });

    let finalContent = fullText && fullText.trim().length > 0
      ? fullText
      : (() => {
          const fb = `**Ranking · ${scopeLabel}**\n\n${table}\n\n_No se pudo completar la síntesis (${error ?? "sin texto"})._`;
          try { onChunk?.(fb); } catch (_) { /* noop */ }
          return fb;
        })();

    // Substitute <!--CITEDSOURCESHERE--> with the full bibliography. If the
    // LLM omitted the marker, append the block at the end. Mirrors the same
    // logic used by companyAnalysis.ts to keep section 8 fully populated.
    if (citedSourcesFull && citedSourcesFull.trim().length > 0) {
      const MARKER = "<!--CITEDSOURCESHERE-->";
      // Tolerant matcher: o3 occasionally emits the marker with markdown
      // decorations inside the comment (e.g. <!--**CITED**_**SOURCES**_**HERE**-->),
      // which fails the strict literal substring check and leaks the raw
      // comment into the rendered HTML/PDF.
      const MARKER_RE = /<!--\s*[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*CITED[\s_]*<?\/?(?:strong|em|b|i)?>?[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*SOURCES[\s_]*<?\/?(?:strong|em|b|i)?>?[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*HERE\s*<?\/?(?:strong|em|b|i)?>?[*_\s]*-->/i;
      if (finalContent.includes(MARKER) || MARKER_RE.test(finalContent)) {
        finalContent = finalContent.includes(MARKER)
          ? finalContent.replace(MARKER, citedSourcesFull)
          : finalContent.replace(MARKER_RE, citedSourcesFull);
        try { onChunk?.("\n\n" + citedSourcesFull); } catch (_) { /* noop */ }
      } else {
        const tail = "\n\n" + citedSourcesFull;
        finalContent = finalContent + tail;
        try { onChunk?.(tail); } catch (_) { /* noop */ }
      }
      // Final safety net: scrub residual variants of the marker if any survived.
      finalContent = finalContent.replace(MARKER_RE, "").replace(MARKER, "");
    }

    return {
      datapack: { ...datapack, pre_rendered_tables: [finalContent, table] },
      prompt_modules: modules,
      metadata: buildMetadata(ranking, rows, sqlFrom, sqlTo, models),
    };
  },
};

export const __test__ = { aggregateRanking, renderRankingTable, normModel };