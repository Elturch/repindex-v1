// Agente Rix v2 — Bloque 6: Divergencia inter-modelo sigma + rango (max 200 LOC)
// Calcula sigma (stddev) y rango (max-min) del RIX entre modelos en el snapshot
// más reciente del período. Pre-renderiza un mini-bloque markdown.

export type DivergenceLevel = "baja" | "media" | "alta";

export interface DivergenceStats {
  sigma: number;
  range: number;
  min: number;
  max: number;
  level: DivergenceLevel;
  models_count: number;
  snapshot_date: string | null;
}

function classifySigma(sigma: number): DivergenceLevel {
  if (!Number.isFinite(sigma)) return "baja";
  if (sigma < 10) return "baja";
  if (sigma <= 20) return "media";
  return "alta";
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

/**
 * Pick the most recent snapshot in the rows and compute divergence
 * across the model RIX scores of that week.
 */
export function computeDivergenceStats(rows: any[]): DivergenceStats {
  const empty: DivergenceStats = {
    sigma: 0, range: 0, min: 0, max: 0,
    level: "baja", models_count: 0, snapshot_date: null,
  };
  if (!rows.length) return empty;

  // Prefer 06_period_from (semantic week) over batch_execution_date (run date).
  const weekKey = (r: any) => String(r["06_period_from"] ?? r.batch_execution_date ?? "");
  const sorted = [...rows].sort((a, b) => weekKey(b).localeCompare(weekKey(a)));
  const latest = weekKey(sorted[0]).slice(0, 10);
  if (!latest) return empty;

  const sameWeek = sorted.filter((r) => weekKey(r).slice(0, 10) === latest);
  const scores: number[] = [];
  for (const r of sameWeek) {
    const v = typeof r["09_rix_score"] === "number"
      ? r["09_rix_score"]
      : parseFloat(r["09_rix_score"]);
    if (Number.isFinite(v)) scores.push(v);
  }
  if (scores.length === 0) return { ...empty, snapshot_date: latest };

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((acc, v) => acc + (v - mean) ** 2, 0) / scores.length;
  const sigma = Math.sqrt(variance);

  return {
    sigma,
    range: max - min,
    min,
    max,
    level: classifySigma(sigma),
    models_count: scores.length,
    snapshot_date: latest,
  };
}

/** Render a compact markdown block describing inter-model divergence. */
export function renderDivergenceBlock(rows: any[]): string {
  const s = computeDivergenceStats(rows);
  if (s.models_count === 0) return "";
  const icon = s.level === "alta" ? "🔴" : s.level === "media" ? "🟡" : "🟢";
  return [
    "**Divergencia inter-modelo (snapshot más reciente)**",
    "",
    `${icon} **Nivel:** ${s.level} · σ = ${fmt(s.sigma)} · rango = ${fmt(s.range)} pts (${fmt(s.min)} → ${fmt(s.max)}) · ${s.models_count} modelos · ${s.snapshot_date ?? "n/d"}`,
  ].join("\n");
}

export const __test__ = { classifySigma, fmt, computeDivergenceStats };