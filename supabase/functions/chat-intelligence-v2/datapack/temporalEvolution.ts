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

/**
 * Normaliza una fecha YYYY-MM-DD al lunes ISO de su semana.
 * Evita que period_from caídos en martes/miércoles aparezcan como filas
 * sueltas en la tabla de evolución temporal (ej. 2026-01-18 dom y
 * 2026-01-19 lun deben colapsarse en la misma semana ISO).
 */
function toIsoMonday(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  // getUTCDay(): 0=domingo, 1=lunes, ..., 6=sábado.
  const dow = d.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
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
    const raw = String(r["06_period_from"] ?? r.batch_execution_date ?? "").slice(0, 10);
    if (!raw) continue;
    // Colapsa días sueltos a la semana ISO (lunes) para evitar filas
    // separadas cuando period_from cae a mitad de semana.
    const w = toIsoMonday(raw);
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

export const __test__ = { fmt, sign, semaforo, computeTemporalEvolution, toIsoMonday };