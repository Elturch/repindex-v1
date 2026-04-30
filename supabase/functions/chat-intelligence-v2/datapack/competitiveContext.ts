// Agente Rix v2 — Bloque 4: Contexto competitivo sectorial (max 200 LOC)
// Dos queries: (1) tickers del sector desde repindex_root_issuers,
// (2) scores desde rix_runs_v2 IN (...). Evita asumir FK declarada.
import type { ResolvedEntity, ResolvedTemporal } from "../types.ts";
import { aggregateConsensus, type ConsensusLevel } from "../../_shared/consensusRanking.ts";

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

function semaforo(score: number): string {
  if (!Number.isFinite(score)) return "⚪";
  if (score >= 70) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

// PARIDAD V1/Dashboard: consenso por RANGO (max-min) calculado en
// _shared/consensusRanking.ts (umbrales 10/20). Worst-case semanal.

export interface CompetitiveRow {
  ticker: string;
  company_name: string;
  // ANTI-MEDIANA: rango inter-modelo (no promediamos entre IAs).
  rix_min: number;
  rix_max: number;
  range: number;           // rango (max-min) inter-modelo promedio entre semanas
  consensus: ConsensusLevel;
  rank: number;
}

export interface CompetitiveContext {
  entity_rank: number | null;
  total: number;
  table: CompetitiveRow[];
}

/** Group rows by (ticker, week) preserving model scores per snapshot. */
function groupByTickerAndWeek(
  rows: any[],
): Map<string, { name: string; bySnapshot: Map<string, { ticker: string; rix_score: number }[]> }> {
  const by = new Map<string, { name: string; bySnapshot: Map<string, { ticker: string; rix_score: number }[]> }>();
  for (const r of rows) {
    const t = String(r["05_ticker"] ?? "").trim();
    if (!t) continue;
    const v = typeof r["09_rix_score"] === "number" ? r["09_rix_score"] : parseFloat(r["09_rix_score"]);
    if (!Number.isFinite(v)) continue;
    const week = String(r["06_period_from"] ?? r.batch_execution_date ?? "").slice(0, 10);
    if (!by.has(t)) by.set(t, { name: String(r["03_target_name"] ?? t), bySnapshot: new Map() });
    const slot = by.get(t)!;
    if (!slot.bySnapshot.has(week)) slot.bySnapshot.set(week, []);
    slot.bySnapshot.get(week)!.push({ ticker: t, rix_score: v });
  }
  return by;
}

/** Run the SQL + compute aggregates. Falls back to empty table on error. */
export async function buildCompetitiveContext(
  supabase: any,
  entity: ResolvedEntity,
  temporal: ResolvedTemporal,
  topN = 8,
): Promise<CompetitiveContext> {
  const empty: CompetitiveContext = { entity_rank: null, total: 0, table: [] };
  if (!entity.sector_category) return empty;

  // 1) Tickers del mismo sector
  const { data: peers, error: peersErr } = await supabase
    .from("repindex_root_issuers")
    .select("ticker, issuer_name")
    .eq("sector_category", entity.sector_category)
    .limit(60);
  if (peersErr || !peers || peers.length === 0) {
    if (peersErr) console.warn("[RIX-V2][competitive] peers error:", peersErr.message);
    return empty;
  }
  const tickers = peers.map((p: any) => String(p.ticker)).filter(Boolean);
  if (tickers.length === 0) return empty;

  // 2) Scores del período para esos tickers (incluye 06_period_from para
  //    agrupación bit-idéntica con dashboard por snapshot semanal).
  const { data, error } = await supabase
    .from("rix_runs_v2")
    .select("05_ticker, 03_target_name, 09_rix_score, batch_execution_date, 06_period_from")
    .in("05_ticker", tickers)
    .gte("batch_execution_date", temporal.from)
    .lte("batch_execution_date", temporal.to)
    .limit(5000);
  if (error) {
    console.warn("[RIX-V2][competitive] scores error:", error.message);
    return empty;
  }
  const grouped = groupByTickerAndWeek(data ?? []);
  if (grouped.size === 0) return empty;

  // PARIDAD BIT-IDÉNTICA con dashboard (c2):
  // Por cada (ticker, semana): aggregateConsensus → majorityScore + range + level.
  // Luego promediar majorityScores semanales y rangos; worst-case level entre semanas.
  const LEVEL_RANK: Record<ConsensusLevel, number> = { alto: 0, medio: 1, bajo: 2 };
  const RANK_LEVEL: ConsensusLevel[] = ["alto", "medio", "bajo"];
  const rows: CompetitiveRow[] = [];
  for (const [ticker, { name, bySnapshot }] of grouped) {
    const weeklyMins: number[] = [];
    const weeklyMaxs: number[] = [];
    const weeklyRanges: number[] = [];
    let worstLevelRank = 0;
    for (const [, snapRows] of bySnapshot) {
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
    const range = weeklyRanges.reduce((a, b) => a + b, 0) / weeklyRanges.length;
    rows.push({
      ticker,
      company_name: name,
      rix_min,
      rix_max,
      range,
      consensus: RANK_LEVEL[worstLevelRank],
      rank: 0,
    });
  }
  // Sort: consenso (alto→bajo) primero, luego rango más estrecho primero.
  rows.sort((a, b) => {
    const ld = LEVEL_RANK[a.consensus] - LEVEL_RANK[b.consensus];
    if (ld !== 0) return ld;
    return a.range - b.range;
  });
  rows.forEach((r, i) => { r.rank = i + 1; });

  const entityRank = rows.find((r) => r.ticker === entity.ticker)?.rank ?? null;

  // Top N + asegurar que la entidad analizada esté presente.
  let table = rows.slice(0, topN);
  if (entityRank && entityRank > topN) {
    const self = rows.find((r) => r.ticker === entity.ticker);
    if (self) table = [...table, self];
  }
  return { entity_rank: entityRank, total: rows.length, table };
}

/** Render the competitive context as a markdown table. */
export function renderCompetitiveContextTable(ctx: CompetitiveContext, entityTicker: string): string {
  if (ctx.table.length === 0) return "";
  const body = ctx.table
    .map((r) => {
      const marker = r.ticker === entityTicker ? " ⬅︎" : "";
      return `| #${r.rank} | ${r.company_name} (${r.ticker})${marker} | ${fmt(r.rix_min)}–${fmt(r.rix_max)} | ${fmt(r.range)} | ${r.consensus} |`;
    })
    .join("\n");
  const header = ctx.entity_rank
    ? `**Contexto competitivo sectorial — posición #${ctx.entity_rank} de ${ctx.total}**`
    : `**Contexto competitivo sectorial — ${ctx.total} empresas**`;
  return [
    header,
    "",
    "| Ranking | Empresa | RIX rango | Δ inter-modelo (avg) | Consenso |",
    "|---|---|---|---|---|",
    body,
  ].join("\n");
}

export const __test__ = { fmt, semaforo, groupByTickerAndWeek };