// chat-intelligence-v2 / skills / sectorRanking.scoped.ts
// Fase 1 — Skill estricta de ranking sectorial.
// Recibe SOLO un ScopeContract (no resuelve tickers, no detecta familia,
// no consulta repindex_root_issuers). Lee SOLO via runScopedQuery (acceso
// unico a rix_runs_v2). PROHIBIDO:
//   - imputacion por peers
//   - imputacion por mediana / promedio entre IAs
//   - imputacion por semana adyacente
//   - rellenar huecos con sector vecino
//
// Salida: filas crudas + ranking determinista (rix_min/max por ticker
// dentro del scope), coverage_report, scope. Cada celda ausente queda
// reflejada en coverage_report.missing_cells. NO se inventa nada.

import type { ModelName } from "../types.ts";
import type { ScopeContract } from "../scope/scopeContract.ts";
import { runScopedQuery, type CoverageReport } from "../data/scopedQuery.ts";

export interface ScopedRankingRow {
  ticker: string;
  name: string;
  rix_min: number;            // min observado en el scope (sin imputacion)
  rix_max: number;            // max observado en el scope
  obs: number;                // numero de filas reales en el scope
  weeks_observed: number;     // semanas con al menos una fila
  models_observed: number;    // modelos con al menos una fila
  per_model: Partial<Record<ModelName, { min: number; max: number; obs: number }>>;
}

export interface ScopedRankingResult {
  ranking: ScopedRankingRow[];
  rows: any[];
  coverage_report: CoverageReport;
  scope: ScopeContract;
}

const RANKING_COLUMNS =
  '"05_ticker","03_target_name","02_model_name","09_rix_score",' +
  '"23_nvm_score","26_drm_score","29_sim_score","32_rmm_score",' +
  '"35_cem_score","38_gam_score","41_dcm_score","44_cxm_score",' +
  'batch_execution_date';

function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const v = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(v) ? v : null;
}

/**
 * Run the strict scoped sector ranking. ScopeContract MUST come from
 * buildScopeContract. Any imputation is forbidden by construction: this
 * function only reads what runScopedQuery returns and aggregates it
 * deterministically per ticker.
 */
export async function runScopedSectorRanking(
  scope: ScopeContract,
  supabase: any,
): Promise<ScopedRankingResult> {
  const { rows, coverage_report } = await runScopedQuery(scope, supabase, {
    columns: RANKING_COLUMNS,
  });

  const byTicker = new Map<string, {
    name: string;
    values: number[];
    weeks: Set<string>;
    models: Set<string>;
    perModel: Map<string, number[]>;
  }>();

  for (const r of rows as any[]) {
    const t = String(r["05_ticker"] ?? "").toUpperCase();
    if (!t) continue;
    const v = num(r["09_rix_score"]);
    if (v === null) continue;
    const m = String(r["02_model_name"] ?? "");
    const w = String(r.batch_execution_date ?? "").slice(0, 10);
    const slot = byTicker.get(t) ?? {
      name: String(r["03_target_name"] ?? t),
      values: [],
      weeks: new Set<string>(),
      models: new Set<string>(),
      perModel: new Map<string, number[]>(),
    };
    slot.values.push(v);
    if (w) slot.weeks.add(w);
    if (m) {
      slot.models.add(m);
      const arr = slot.perModel.get(m) ?? [];
      arr.push(v);
      slot.perModel.set(m, arr);
    }
    byTicker.set(t, slot);
  }

  const ranking: ScopedRankingRow[] = [];
  // Iterate scope.tickers (not byTicker.keys) to expose tickers without rows.
  for (const t of scope.tickers) {
    const slot = byTicker.get(t);
    if (!slot || slot.values.length === 0) {
      // Sin imputacion: el ticker queda como ausente, sin metricas.
      ranking.push({
        ticker: t,
        name: t,
        rix_min: NaN,
        rix_max: NaN,
        obs: 0,
        weeks_observed: 0,
        models_observed: 0,
        per_model: {},
      });
      continue;
    }
    const per_model: ScopedRankingRow["per_model"] = {};
    for (const [m, vals] of slot.perModel) {
      if (vals.length === 0) continue;
      per_model[m as ModelName] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
        obs: vals.length,
      };
    }
    ranking.push({
      ticker: t,
      name: slot.name,
      rix_min: Math.min(...slot.values),
      rix_max: Math.max(...slot.values),
      obs: slot.values.length,
      weeks_observed: slot.weeks.size,
      models_observed: slot.models.size,
      per_model,
    });
  }

  // Orden determinista por rix_max desc, luego ticker asc. Tickers sin obs
  // se quedan al final.
  ranking.sort((a, b) => {
    const aHas = a.obs > 0 ? 1 : 0;
    const bHas = b.obs > 0 ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    if (aHas === 0) return a.ticker.localeCompare(b.ticker);
    if (b.rix_max !== a.rix_max) return b.rix_max - a.rix_max;
    return a.ticker.localeCompare(b.ticker);
  });

  return { ranking, rows, coverage_report, scope };
}
