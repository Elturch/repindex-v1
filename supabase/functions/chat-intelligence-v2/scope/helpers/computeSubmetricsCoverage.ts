// chat-intelligence-v2 / scope / helpers / computeSubmetricsCoverage.ts
// Fase 2 — Eje A.
//
// Helper PURO (sin side-effects, sin DB) que toma las filas devueltas por
// runScopedQuery + el ScopeContract y calcula:
//
//   - submetrics_coverage: { NVM: 0.92, DRM: 0.58, ... }  fracción [0..1]
//     de celdas (ticker x model x week) con valor numérico no nulo para
//     cada sub-métrica.
//
//   - submetrics_summary: media observada (sin imputación) por sub-métrica
//     sobre todas las filas del dataset. Se omite si no hay observaciones.
//
// Estricto cero-imputación:
//   * No rellena huecos.
//   * No promedia entre modelos donde no hay dato.
//   * `null` se ignora; nunca se cuenta como 0.
//
// Las claves de columna corresponden 1:1 a rix_runs_v2:
//   23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score,
//   35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score.

import { RIX_SUBMETRICS, type RixSubmetric } from "../policies/submetricsCoverageThreshold.ts";
import type { ScopeContract } from "../scopeContract.ts";

const COL_BY_METRIC: Record<RixSubmetric, string> = {
  NVM: "23_nvm_score",
  DRM: "26_drm_score",
  SIM: "29_sim_score",
  RMM: "32_rmm_score",
  CEM: "35_cem_score",
  GAM: "38_gam_score",
  DCM: "41_dcm_score",
  CXM: "44_cxm_score",
};

export interface SubmetricsCoverage {
  /** Fracción [0..1] de celdas con valor numérico para esta sub-métrica. */
  coverage: Partial<Record<RixSubmetric, number>>;
  /** Media observada (sin imputación). Se omite la clave si obs=0. */
  mean: Partial<Record<RixSubmetric, number>>;
  /** Número de observaciones reales por sub-métrica. */
  obs: Partial<Record<RixSubmetric, number>>;
  /** Tamaño teórico del universo: tickers x models x weeks observadas. */
  cells_total: number;
  /** Versión del cálculo, para compatibilidad futura. */
  version: 1;
}

function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const v = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(v) ? v : null;
}

function isoDay(d: unknown): string {
  if (!d) return "";
  const s = typeof d === "string" ? d : new Date(d as any).toISOString();
  return s.slice(0, 10);
}

/**
 * Calcula cobertura y media de las 8 sub-métricas sobre un conjunto de
 * filas ya filtrado por ScopeContract. Pure: no toca DB, no muta args.
 */
export function computeSubmetricsCoverage(
  rows: any[],
  scope: ScopeContract,
): SubmetricsCoverage {
  const weeksObserved = new Set<string>();
  for (const r of rows) {
    const w = isoDay(r?.batch_execution_date);
    if (w) weeksObserved.add(w);
  }
  const cellsTotal = scope.tickers.length * scope.models.length * weeksObserved.size;

  const obs: Partial<Record<RixSubmetric, number>> = {};
  const sum: Partial<Record<RixSubmetric, number>> = {};

  for (const m of RIX_SUBMETRICS) {
    const col = COL_BY_METRIC[m];
    let count = 0;
    let acc = 0;
    for (const r of rows) {
      const v = num(r?.[col]);
      if (v === null) continue;
      count++;
      acc += v;
    }
    if (count > 0) {
      obs[m] = count;
      sum[m] = acc;
    }
  }

  const coverage: Partial<Record<RixSubmetric, number>> = {};
  const mean: Partial<Record<RixSubmetric, number>> = {};
  for (const m of RIX_SUBMETRICS) {
    const o = obs[m] ?? 0;
    if (cellsTotal > 0) {
      coverage[m] = o / cellsTotal;
    } else {
      coverage[m] = 0;
    }
    if (o > 0) {
      mean[m] = (sum[m] as number) / o;
    }
  }

  return {
    coverage,
    mean,
    obs,
    cells_total: cellsTotal,
    version: 1,
  };
}
