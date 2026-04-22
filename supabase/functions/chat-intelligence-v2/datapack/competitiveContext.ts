// Agente Rix v2 — Bloque 4: Contexto competitivo sectorial (max 200 LOC)
// Query SQL adicional: trae top empresas del mismo sector en el período y
// calcula el rango de la entidad analizada. Devuelve markdown pre-renderizado.
import type { ResolvedEntity, ResolvedTemporal } from "../types.ts";

const COMPETITIVE_SELECT =
  "05_ticker, 03_target_name, 09_rix_score, batch_execution_date";

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

function consensusFromSigma(sigma: number): "alto" | "medio" | "bajo" {
  if (sigma < 10) return "alto";
  if (sigma <= 20) return "medio";
  return "bajo";
}

export interface CompetitiveRow {
  ticker: string;
  company_name: string;
  rix_mean: number;
  sigma: number;
  consensus: "alto" | "medio" | "bajo";
  rank: number;
}

export interface CompetitiveContext {
  entity_rank: number | null;
  total: number;
  table: CompetitiveRow[];
}

/** Aggregate (mean + sigma) of RIX scores by ticker. */
function aggregateBySector(rows: any[]): Map<string, { name: string; vals: number[] }> {
  const by = new Map<string, { name: string; vals: number[] }>();
  for (const r of rows) {
    const t = String(r["05_ticker"] ?? "").trim();
    if (!t) continue;
    const v = typeof r["09_rix_score"] === "number"
      ? r["09_rix_score"]
      : parseFloat(r["09_rix_score"]);
    if (!Number.isFinite(v)) continue;
    if (!by.has(t)) by.set(t, { name: String(r["03_target_name"] ?? t), vals: [] });
    by.get(t)!.vals.push(v);
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

  const { data, error } = await supabase
    .from("rix_runs_v2")
    .select(`${COMPETITIVE_SELECT}, repindex_root_issuers!inner(sector_category)`)
    .eq("repindex_root_issuers.sector_category", entity.sector_category)
    .gte("batch_execution_date", temporal.from)
    .lte("batch_execution_date", temporal.to)
    .limit(5000);
  if (error) {
    console.warn("[RIX-V2][competitive] query error:", error.message);
    return empty;
  }
  const grouped = aggregateBySector(data ?? []);
  if (grouped.size === 0) return empty;

  const rows: CompetitiveRow[] = [];
  for (const [ticker, { name, vals }] of grouped) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length;
    const sigma = Math.sqrt(variance);
    rows.push({ ticker, company_name: name, rix_mean: mean, sigma, consensus: consensusFromSigma(sigma), rank: 0 });
  }
  rows.sort((a, b) => b.rix_mean - a.rix_mean);
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
      return `| #${r.rank} | ${r.company_name} (${r.ticker})${marker} | ${semaforo(r.rix_mean)} ${fmt(r.rix_mean)} | ${fmt(r.sigma)} | ${r.consensus} |`;
    })
    .join("\n");
  const header = ctx.entity_rank
    ? `**Contexto competitivo sectorial — posición #${ctx.entity_rank} de ${ctx.total}**`
    : `**Contexto competitivo sectorial — ${ctx.total} empresas**`;
  return [
    header,
    "",
    "| Ranking | Empresa | RIX (media) | σ inter-modelo | Consenso |",
    "|---|---|---|---|---|",
    body,
  ].join("\n");
}

export const __test__ = { fmt, semaforo, consensusFromSigma, aggregateBySector };