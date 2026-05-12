// chat-intelligence-v2 / skills / periodEvolution.scoped.ts
// Fase 1 — Skill estricta de evolucion temporal.
// Recibe SOLO un ScopeContract. Lee SOLO via runScopedQuery. PROHIBIDO:
//   - rellenar semanas vacias por la semana adyacente
//   - imputar mediana entre IAs como serie
//   - mezclar tickers fuera del scope
//
// La serie por (ticker, semana) expone num modelos disponibles, rix_min,
// rix_max y rix_mean DE LO OBSERVADO. Las celdas faltantes vienen en
// coverage_report.missing_cells; aqui no se interpolan.

import type { ScopeContract } from "../scope/scopeContract.ts";
import { runScopedQuery, type CoverageReport } from "../data/scopedQuery.ts";

const EVOLUTION_COLUMNS =
  '"05_ticker","03_target_name","02_model_name","09_rix_score",batch_execution_date';

export interface ScopedSeriesPoint {
  ticker: string;
  week: string;             // ISO yyyy-mm-dd
  rix_min: number;
  rix_max: number;
  rix_mean: number;         // media simple de lo observado esa semana
  models_count: number;     // distintos modelos con dato esa semana
}

export interface ScopedEvolutionResult {
  series: ScopedSeriesPoint[];   // ordenada por (ticker, week)
  rows: any[];
  coverage_report: CoverageReport;
  scope: ScopeContract;
}

function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const v = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(v) ? v : null;
}

export async function runScopedPeriodEvolution(
  scope: ScopeContract,
  supabase: any,
): Promise<ScopedEvolutionResult> {
  const { rows, coverage_report } = await runScopedQuery(scope, supabase, {
    columns: EVOLUTION_COLUMNS,
  });

  // Agrupacion (ticker, week) -> { values, models }
  const bucket = new Map<string, { ticker: string; week: string; values: number[]; models: Set<string> }>();
  for (const r of rows as any[]) {
    const t = String(r["05_ticker"] ?? "").toUpperCase();
    const w = String(r.batch_execution_date ?? "").slice(0, 10);
    const v = num(r["09_rix_score"]);
    if (!t || !w || v === null) continue;
    const key = `${t}|${w}`;
    const slot = bucket.get(key) ?? { ticker: t, week: w, values: [], models: new Set<string>() };
    slot.values.push(v);
    const m = String(r["02_model_name"] ?? "");
    if (m) slot.models.add(m);
    bucket.set(key, slot);
  }

  const series: ScopedSeriesPoint[] = [];
  for (const slot of bucket.values()) {
    if (slot.values.length === 0) continue;
    const sum = slot.values.reduce((a, b) => a + b, 0);
    series.push({
      ticker: slot.ticker,
      week: slot.week,
      rix_min: Math.min(...slot.values),
      rix_max: Math.max(...slot.values),
      rix_mean: sum / slot.values.length,
      models_count: slot.models.size,
    });
  }
  series.sort((a, b) =>
    a.ticker === b.ticker ? a.week.localeCompare(b.week) : a.ticker.localeCompare(b.ticker)
  );

  return { series, rows, coverage_report, scope };
}
