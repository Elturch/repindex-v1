// Agente Rix v2 — Divergencia inter-modelo POR DIMENSIÓN (max 200 LOC)
// Calcula sigma + rango entre modelos para cada una de las 8 sub-métricas
// (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM) en el snapshot más reciente del
// período. Hermano de divergenceStats.ts (que solo cubre el RIX agregado).
// Pure function — opera sobre las raw_rows ya cargadas por builder.ts.

export type DimDivergenceLevel = "baja" | "media" | "alta";

export interface DimensionDivergenceRow {
  metric: string;            // "NVM" | "DRM" | ...
  sigma: number;
  range: number;
  min: number;
  max: number;
  mean: number;
  level: DimDivergenceLevel;
  models_count: number;
  highest_model: string | null;
  lowest_model: string | null;
}

export interface DimensionDivergenceReport {
  rows: DimensionDivergenceRow[];      // ordenado por sigma desc (más divergente primero)
  snapshot_date: string | null;
  models_count: number;
  most_divergent: DimensionDivergenceRow | null;
  most_consensual: DimensionDivergenceRow | null;
}

// Métrica canónica → columna de score en rix_runs_v2 (alineado con FULL_SELECT
// en datapack/builder.ts:29-32).
const METRIC_COLS: Array<[string, string]> = [
  ["NVM", "23_nvm_score"],
  ["DRM", "26_drm_score"],
  ["SIM", "29_sim_score"],
  ["RMM", "32_rmm_score"],
  ["CEM", "35_cem_score"],
  ["GAM", "38_gam_score"],
  ["DCM", "41_dcm_score"],
  ["CXM", "44_cxm_score"],
];

function classifySigma(sigma: number): DimDivergenceLevel {
  if (!Number.isFinite(sigma)) return "baja";
  if (sigma < 10) return "baja";
  if (sigma <= 20) return "media";
  return "alta";
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

function icon(level: DimDivergenceLevel): string {
  return level === "alta" ? "🔴" : level === "media" ? "🟡" : "🟢";
}

/**
 * Para cada dimensión, calcula sigma/rango/min/max entre los modelos del
 * snapshot más reciente. Mantiene también qué modelo es el más optimista y
 * cuál el más crítico, lo que la narrativa puede usar para explicar el gap.
 */
export function computeDimensionDivergence(rows: any[]): DimensionDivergenceReport {
  const empty: DimensionDivergenceReport = {
    rows: [], snapshot_date: null, models_count: 0,
    most_divergent: null, most_consensual: null,
  };
  if (!rows.length) return empty;

  const weekKey = (r: any) => String(r["06_period_from"] ?? r.batch_execution_date ?? "");
  const sorted = [...rows].sort((a, b) => weekKey(b).localeCompare(weekKey(a)));
  const latest = weekKey(sorted[0]).slice(0, 10);
  if (!latest) return empty;
  const sameWeek = sorted.filter((r) => weekKey(r).slice(0, 10) === latest);

  const out: DimensionDivergenceRow[] = [];
  let snapshotModels = 0;
  for (const [metric, col] of METRIC_COLS) {
    const pairs: Array<{ model: string; value: number }> = [];
    for (const r of sameWeek) {
      const raw = r[col];
      const v = typeof raw === "number" ? raw : parseFloat(raw);
      if (!Number.isFinite(v)) continue;
      const model = String(r["02_model_name"] ?? "(desconocido)");
      pairs.push({ model, value: v });
    }
    if (pairs.length === 0) continue;
    snapshotModels = Math.max(snapshotModels, pairs.length);

    const values = pairs.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    const sigma = Math.sqrt(variance);
    const highest = pairs.reduce((a, b) => (b.value > a.value ? b : a)).model;
    const lowest = pairs.reduce((a, b) => (b.value < a.value ? b : a)).model;

    out.push({
      metric,
      sigma, range: max - min, min, max, mean,
      level: classifySigma(sigma),
      models_count: pairs.length,
      highest_model: highest,
      lowest_model: lowest,
    });
  }

  if (out.length === 0) return { ...empty, snapshot_date: latest };

  // Ordenado por sigma desc (las más conflictivas arriba). Sirve también para
  // que la narrativa cite primero las dimensiones de mayor desacuerdo.
  out.sort((a, b) => b.sigma - a.sigma);
  const most_divergent = out[0];
  const most_consensual = out[out.length - 1];

  return {
    rows: out,
    snapshot_date: latest,
    models_count: snapshotModels,
    most_divergent,
    most_consensual,
  };
}

/**
 * Render markdown table — ordenado por sigma desc. Cada fila muestra la
 * dimensión, el nivel (semáforo), sigma, rango, min/max y los modelos que
 * marcan los extremos. Pensado para inyectarse en Sec.9-A junto al bloque
 * del RIX, sin duplicar narrativa.
 */
export function renderDimensionDivergenceBlock(rows: any[]): string {
  const r = computeDimensionDivergence(rows);
  if (r.rows.length === 0) return "";
  const body = r.rows.map((d) =>
    `| ${icon(d.level)} ${d.metric} | ${d.level} | ${fmt(d.sigma)} | ${fmt(d.range)} (${fmt(d.min)} → ${fmt(d.max)}) | ${d.highest_model ?? "n/d"} | ${d.lowest_model ?? "n/d"} |`,
  ).join("\n");
  const headline = r.most_divergent && r.most_consensual && r.most_divergent.metric !== r.most_consensual.metric
    ? `Mayor desacuerdo entre IAs: **${r.most_divergent.metric}** (σ ${fmt(r.most_divergent.sigma)}). Mayor consenso: **${r.most_consensual.metric}** (σ ${fmt(r.most_consensual.sigma)}).`
    : `Divergencia por dimensión calculada sobre ${r.models_count} modelos · snapshot ${r.snapshot_date ?? "n/d"}.`;
  return [
    "**Divergencia inter-modelo POR DIMENSIÓN (snapshot más reciente)**",
    "",
    headline,
    "",
    "| Dimensión | Nivel | σ | Rango (min → max) | Modelo + alto | Modelo + bajo |",
    "|---|---|---|---|---|---|",
    body,
  ].join("\n");
}

export const __test__ = { classifySigma, fmt, METRIC_COLS, computeDimensionDivergence };