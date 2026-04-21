/**
 * PHASE 1.19a — Period-mode temporal aggregation.
 *
 * When the requested temporal range covers more than one weekly snapshot,
 * the LLM should NOT describe a single week as if it were the whole period.
 * This module computes, for the 9 RIX metrics (RIX + 8 sub-metrics),
 * mean / median / min / max / first->last delta / volatility (sd) so the
 * synthesis prompt can render a "MEDIA / INICIO→FIN / DELTA / MIN / MAX"
 * KPI table and refer to the period as a whole.
 *
 * The weekly-evolution table that already lists each individual snapshot
 * stays intact — period_aggregation is complementary, not a replacement.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RawRunRow = Record<string, any>;

export interface MetricAggregate {
  metric: string;
  weeks_count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  first_week_value: number | null;
  last_week_value: number | null;
  delta_period: number | null;
  trend: "alcista" | "bajista" | "estable" | "n/d";
  volatility: number | null; // population standard deviation
}

export interface PeriodSummary {
  mode: "period" | "snapshot";
  weeks_count: number;
  weeks: string[];                  // sorted ascending YYYY-MM-DD
  rix_mean: number | null;
  rix_first: number | null;
  rix_last: number | null;
  rix_delta: number | null;
  rix_trend: "alcista" | "bajista" | "estable" | "n/d";
  strongest_metric: string | null;  // metric with highest mean
  weakest_metric: string | null;    // metric with lowest mean
  most_volatile: string | null;     // metric with highest sd
}

export interface PeriodAggregationResult {
  period_summary: PeriodSummary;
  period_aggregation: Record<string, MetricAggregate>;
}

const METRIC_COLUMNS: Array<{ key: string; col: string }> = [
  { key: "RIX", col: "09_rix_score" },
  { key: "NVM", col: "23_nvm_score" },
  { key: "DRM", col: "26_drm_score" },
  { key: "SIM", col: "29_sim_score" },
  { key: "RMM", col: "32_rmm_score" },
  { key: "CEM", col: "35_cem_score" },
  { key: "GAM", col: "38_gam_score" },
  { key: "DCM", col: "41_dcm_score" },
  { key: "CXM", col: "44_cxm_score" },
];

function snapshotKey(r: RawRunRow): string | null {
  const d = r.batch_execution_date || r["07_period_to"] || r["06_period_from"];
  return d ? String(d).slice(0, 10) : null;
}

function toNum(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number | null {
  if (xs.length < 2) return xs.length === 1 ? 0 : null;
  const m = mean(xs)!;
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

function trendOf(delta: number | null): MetricAggregate["trend"] {
  if (delta == null) return "n/d";
  if (delta > 3) return "alcista";
  if (delta < -3) return "bajista";
  return "estable";
}

function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

/**
 * Compute period aggregation from raw runs (rix_runs / rix_runs_v2 rows).
 * - Groups rows by snapshot week (YYYY-MM-DD).
 * - For each metric, averages across all models within a single week
 *   (so each week contributes ONE value), then aggregates across weeks.
 * - Returns mode = "snapshot" if only one distinct week is present.
 */
export function computePeriodAggregation(rows: RawRunRow[]): PeriodAggregationResult {
  const grouped = new Map<string, RawRunRow[]>();
  for (const r of rows || []) {
    const k = snapshotKey(r);
    if (!k) continue;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(r);
  }

  const weeks = [...grouped.keys()].sort(); // ascending
  const weeks_count = weeks.length;
  const mode: "period" | "snapshot" = weeks_count > 1 ? "period" : "snapshot";

  const period_aggregation: Record<string, MetricAggregate> = {};

  for (const { key, col } of METRIC_COLUMNS) {
    // weekly value = mean of all model rows that week for this metric
    const weeklyValues: number[] = [];
    for (const w of weeks) {
      const vals = grouped.get(w)!
        .map((r) => toNum(r[col]))
        .filter((v): v is number => v != null);
      const m = mean(vals);
      if (m != null) weeklyValues.push(m);
    }

    const first_week_value = weeklyValues.length ? weeklyValues[0] : null;
    const last_week_value = weeklyValues.length ? weeklyValues[weeklyValues.length - 1] : null;
    const delta_period = first_week_value != null && last_week_value != null
      ? last_week_value - first_week_value
      : null;

    period_aggregation[key] = {
      metric: key,
      weeks_count: weeklyValues.length,
      mean: round1(mean(weeklyValues)),
      median: round1(median(weeklyValues)),
      min: round1(weeklyValues.length ? Math.min(...weeklyValues) : null),
      max: round1(weeklyValues.length ? Math.max(...weeklyValues) : null),
      first_week_value: round1(first_week_value),
      last_week_value: round1(last_week_value),
      delta_period: round1(delta_period),
      trend: trendOf(delta_period),
      volatility: round1(stddev(weeklyValues)),
    };
  }

  // Build summary using non-RIX metrics for strongest/weakest/most_volatile
  const subMetrics = METRIC_COLUMNS.slice(1).map((m) => period_aggregation[m.key]).filter((m) => m.mean != null);
  let strongest: string | null = null;
  let weakest: string | null = null;
  let mostVol: string | null = null;
  if (subMetrics.length) {
    strongest = subMetrics.reduce((a, b) => (a.mean! >= b.mean! ? a : b)).metric;
    weakest = subMetrics.reduce((a, b) => (a.mean! <= b.mean! ? a : b)).metric;
    const withVol = subMetrics.filter((m) => m.volatility != null);
    if (withVol.length) {
      mostVol = withVol.reduce((a, b) => (a.volatility! >= b.volatility! ? a : b)).metric;
    }
  }

  const rix = period_aggregation["RIX"];

  const period_summary: PeriodSummary = {
    mode,
    weeks_count,
    weeks,
    rix_mean: rix?.mean ?? null,
    rix_first: rix?.first_week_value ?? null,
    rix_last: rix?.last_week_value ?? null,
    rix_delta: rix?.delta_period ?? null,
    rix_trend: rix?.trend ?? "n/d",
    strongest_metric: strongest,
    weakest_metric: weakest,
    most_volatile: mostVol,
  };

  return { period_summary, period_aggregation };
}

/**
 * Render a compact text block ready to be appended to the LLM user prompt.
 * Only emitted when mode === "period".
 */
export function renderPeriodAggregationBlock(result: PeriodAggregationResult): string {
  const { period_summary: ps, period_aggregation: pa } = result;
  if (ps.mode !== "period") return "";

  const rangeStart = ps.weeks[0];
  const rangeEnd = ps.weeks[ps.weeks.length - 1];

  const fmt = (n: number | null) => (n == null ? "n/d" : String(n));
  const sign = (n: number | null) => {
    if (n == null) return "n/d";
    if (n > 0) return `+${n}`;
    return String(n);
  };

  const rows = ["RIX", "NVM", "DRM", "SIM", "RMM", "CEM", "GAM", "DCM", "CXM"]
    .map((k) => pa[k])
    .filter(Boolean)
    .map((m) =>
      `| ${m.metric} | ${fmt(m.mean)} | ${fmt(m.first_week_value)} → ${fmt(m.last_week_value)} | ${sign(m.delta_period)} | ${fmt(m.min)} | ${fmt(m.max)} | ${fmt(m.volatility)} |`,
    )
    .join("\n");

  return [
    "═══ AGREGACIÓN TEMPORAL DEL PERÍODO (PHASE 1.19a) ═══",
    `Modo: PERÍODO (no snapshot). Semanas agregadas: ${ps.weeks_count} (${rangeStart} → ${rangeEnd}).`,
    `RIX medio del período: ${fmt(ps.rix_mean)} | Inicio→Fin: ${fmt(ps.rix_first)} → ${fmt(ps.rix_last)} | Delta período: ${sign(ps.rix_delta)} | Tendencia: ${ps.rix_trend}.`,
    ps.strongest_metric ? `Métrica más fuerte (mayor media): ${ps.strongest_metric}.` : "",
    ps.weakest_metric ? `Métrica más débil (menor media): ${ps.weakest_metric}.` : "",
    ps.most_volatile ? `Métrica más volátil (mayor sd): ${ps.most_volatile}.` : "",
    "",
    "Tabla de KPIs del período (úsala literalmente como tabla principal del informe):",
    "| INDICADOR | MEDIA PERÍODO | INICIO → FIN | DELTA PERÍODO | MIN | MAX | VOLATILIDAD (sd) |",
    "|---|---|---|---|---|---|---|",
    rows,
    "",
    "REGLA DE AGREGACIÓN TEMPORAL (INQUEBRANTABLE):",
    "1. PROHIBIDO decir \"esta semana\", \"cierra la semana\" o describir KPIs como si fueran de una semana puntual.",
    "2. Usa SIEMPRE expresiones de período: \"durante el período\", \"en promedio durante el trimestre\", \"la media del período fue X\".",
    "3. El dato principal de cada métrica es la MEDIA del período, NO el valor de la última semana.",
    "4. El delta relevante es INICIO→FIN del período (delta_period), NO última semana vs. penúltima.",
    "5. Menciona la tendencia con la magnitud: \"pasó de X a Y (delta Z en N semanas)\".",
    "6. Para métricas con volatilidad alta (sd > 5), señálalo explícitamente como inestable.",
    "7. El Titular-Respuesta debe reflejar el período completo, no una semana suelta. Ejemplo: \"Ferrovial en Q1 2026: RIX medio de 64,5 con tendencia estable (+2 en 10 semanas)\".",
    "8. La tabla principal de KPIs DEBE usar las columnas: INDICADOR | MEDIA PERÍODO | INICIO → FIN | DELTA PERÍODO | MIN | MAX. NO uses la cabecera \"VALOR / DELTA SEMANA PREVIA\".",
    "9. La tabla de evolución semanal (snapshot por snapshot) se mantiene como sección complementaria.",
    "═══════════════════════════════════════════════════════",
  ].filter(Boolean).join("\n");
}