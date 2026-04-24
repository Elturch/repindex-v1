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

/**
 * Compact summary of cited URLs for the LLM prompt only. Mirrors the helper
 * in companyAnalysis.ts: full bibliography is appended AFTER streaming via
 * the <!--CITED_SOURCES_HERE--> marker, so we never blow OpenAI 400 limits.
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
    "INSTRUCCIÓN SECCIÓN 8: NO listes URLs a mano. Escribe 2-3 frases introductorias y termina con la línea exacta `<!--CITED_SOURCES_HERE-->`. El sistema sustituirá ese marcador por la bibliografía completa.",
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
  rix_mean: number;
  obs: number;
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
      // IBEX membership uses ibex_status='active' (130 active issuers).
      scopeQ = scopeQ.eq("ibex_status", "active");
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
  const byTicker = new Map<string, { name: string; values: number[]; per_model: Map<ModelName, number[]> }>();
  for (const r of rows) {
    const t = String(r["05_ticker"] ?? "").trim();
    if (!t) continue;
    const v = typeof r["09_rix_score"] === "number" ? r["09_rix_score"] : parseFloat(r["09_rix_score"]);
    if (!Number.isFinite(v)) continue;
    if (!byTicker.has(t)) {
      byTicker.set(t, { name: String(r["03_target_name"] ?? t), values: [], per_model: new Map() });
    }
    const slot = byTicker.get(t)!;
    slot.values.push(v);
    const m = normModel(r["02_model_name"]);
    if (m) {
      if (!slot.per_model.has(m)) slot.per_model.set(m, []);
      slot.per_model.get(m)!.push(v);
    }
  }
  const out: RankingRow[] = [];
  for (const [ticker, info] of byTicker) {
    const mean = info.values.reduce((a, b) => a + b, 0) / Math.max(info.values.length, 1);
    const per_model: RankingRow["per_model"] = {};
    for (const [m, vals] of info.per_model) {
      per_model[m] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    out.push({ ticker, name: info.name, rix_mean: mean, obs: info.values.length, per_model });
  }
  out.sort((a, b) => b.rix_mean - a.rix_mean);
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
    "ESTRUCTURA OBLIGATORIA DEL INFORME:",
    "## 1. Titular — 3-4 frases incluyendo: empresa #1, tendencia general del período (alcista/bajista/estable), dato cuantitativo de evolución temporal (delta total Q1) y empresa o sector destacado.",
    "## 2. Ranking — inserta literalmente la tabla de ranking.",
    "## 3. Visión por modelo — inserta literalmente el bloque de breakdown.",
    "## 4. Divergencia inter-modelo — inserta literalmente el bloque de divergencia.",
    "## 5. Evolución temporal — inserta literalmente la tabla de evolución y añade UNA frase de tendencia (ej. 'Tendencia bajista sostenida: el RIX medio cayó X pts').",
    "## 6. KPIs agregados del alcance — inserta literalmente la tabla de KPIs (etiqueta como 'Volatilidad temporal (SD)').",
    "## 7. Recomendaciones — inserta literalmente el bloque de recomendaciones.",
    "## 8. Contexto competitivo — inserta literalmente la tabla sectorial y la ficha metodológica al final.",
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
    const scopeTickers = (parsed.scope_tickers && parsed.scope_tickers.length > 0)
      ? parsed.scope_tickers
      : null;
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

    const modules = ["base", "antiHallucination", "rankingMode"];
    if (parsed.mode === "period") modules.push("periodMode"); else modules.push("snapshotMode");

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
      buildCoverageBanner(parsed.temporal),
      buildBasePrompt({ languageName: "español" }),
      buildAntiHallucinationRules(),
      parsed.mode === "period"
        ? buildPeriodRules({ fromISO: sqlFrom, toISO: sqlTo, weeksCount: parsed.temporal.snapshots_available, requestedLabel: parsed.temporal.requested_label })
        : buildSnapshotRules({ weekFromISO: sqlFrom, weekToISO: sqlTo }),
      buildRankingRules({ scopeLabel, topN: ranking.length, weeksCount: parsed.temporal.snapshots_available, modelsCount: models.length }),
    ].filter(Boolean).join("\n\n");

    const competitiveContext = await buildCompetitiveContextBlock(supabase, ranking);
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
    );
    const { fullText, error } = await streamOpenAIResponse({
      systemPrompt, userMessage, logPrefix: tag,
      onChunk: (d) => { try { onChunk?.(d); } catch (_) { /* noop */ } },
    });

    const finalContent = fullText && fullText.trim().length > 0
      ? fullText
      : (() => {
          const fb = `**Ranking · ${scopeLabel}**\n\n${table}\n\n_No se pudo completar la síntesis (${error ?? "sin texto"})._`;
          try { onChunk?.(fb); } catch (_) { /* noop */ }
          return fb;
        })();

    return {
      datapack: { ...datapack, pre_rendered_tables: [finalContent, table] },
      prompt_modules: modules,
      metadata: buildMetadata(ranking, rows, sqlFrom, sqlTo, models),
    };
  },
};

export const __test__ = { aggregateRanking, renderRankingTable, normModel };