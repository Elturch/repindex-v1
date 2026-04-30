// Agente Rix v2 — Bloque 3: Evolución temporal (max 200 LOC)
// Pre-renderiza una tabla markdown fecha | RIX | delta vs anterior.
// Trabaja sobre raw_rows ya cargadas. Agrupa por batch_execution_date
// (snapshot semanal) y promedia el RIX inter-modelo de cada semana.

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

function sign(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.05) return "0,0";
  if (n > 0) return `+${fmt(n)}`;
  return fmt(n);
}

function semaforo(score: number): string {
  if (!Number.isFinite(score)) return "⚪";
  if (score >= 70) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

export interface TemporalEvolutionRow {
  snapshot_date: string;
  rix_avg: number;
  delta_vs_prev: number | null;
  models_count: number;
}

/** Compute the per-snapshot evolution from already-loaded raw rows. */
export function computeTemporalEvolution(rows: any[]): TemporalEvolutionRow[] {
  const byWeek = new Map<string, number[]>();
  for (const r of rows) {
    // Prefer 06_period_from (semantic week) over batch_execution_date (run date).
    const w = String(r["06_period_from"] ?? r.batch_execution_date ?? "").slice(0, 10);
    if (!w) continue;
    const v = typeof r["09_rix_score"] === "number"
      ? r["09_rix_score"]
      : parseFloat(r["09_rix_score"]);
    if (!Number.isFinite(v)) continue;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(v);
  }
  const weeks = [...byWeek.keys()].sort();
  const out: TemporalEvolutionRow[] = [];
  let prev: number | null = null;
  for (const w of weeks) {
    const vals = byWeek.get(w)!;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    out.push({
      snapshot_date: w,
      rix_avg: avg,
      delta_vs_prev: prev == null ? null : avg - prev,
      models_count: vals.length,
    });
    prev = avg;
  }
  return out;
}

/** Render temporal evolution as a markdown table. Returns "" when <2 weeks. */
export function renderTemporalEvolutionTable(rows: any[]): string {
  const evolution = computeTemporalEvolution(rows);
  if (evolution.length < 2) return "";
  const body = evolution
    .map((r) =>
      `| ${r.snapshot_date} | ${semaforo(r.rix_avg)} ${fmt(r.rix_avg)} | ${sign(r.delta_vs_prev)} | ${r.models_count} |`,
    )
    .join("\n");
  return [
    "**Evolución temporal — RIX por snapshot semanal**",
    "",
    "| Fecha | RIX medio semanal | Δ vs semana previa | Filas |",
    "|---|---|---|---|",
    body,
  ].join("\n");
}

// Nota: "RIX medio semanal" = promedio de los modelos disponibles ESA semana,
// distinto del rango inter-modelo del periodo (anti-mediana) usado en la
// tabla principal y en el ranking. Se mantiene aquí porque la evolución
// temporal necesita un único valor por semana para visualizar la tendencia.

export const __test__ = { fmt, sign, semaforo, computeTemporalEvolution };