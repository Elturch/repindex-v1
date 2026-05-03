// Agente Rix v2 — pre-rendered markdown tables (max 150 LOC)
// Constraint #9: las tablas de KPIs SIEMPRE se pre-renderizan aquí, NUNCA
// las genera el LLM. Extraído del estilo de tablas de v1/index.ts y de
// _shared/periodAggregation.ts (renderPeriodAggregationBlock).
import type { MetricAggregation, Mode } from "../types.ts";

/** Subset of DataPack.period_summary used by the KPI table renderer when
 *  rendering the anti-mediana view (mode=period). Optional so existing
 *  callers that omit it keep working with a sensible (degraded) header. */
export interface KpiTablePeriodSummary {
  submetrics_by_model?: Record<string, Record<string, number | null>>;
  submetrics_range?: Record<
    string,
    { min: number | null; max: number | null; range: number | null; level: "alto" | "medio" | "bajo" | "n/d" }
  >;
  rix_by_model?: Record<string, number | null>;
  rix_min?: number | null;
  rix_max?: number | null;
  rix_range?: number | null;
  rix_consensus_level?: "alto" | "medio" | "bajo" | "n/d";
}

const METRIC_LABEL: Record<string, string> = {
  RIX: "RIX (índice global)",
  NVM: "NVM · Calidad de la Narrativa",
  DRM: "DRM · Fortaleza de Evidencia",
  SIM: "SIM · Autoridad de Fuentes",
  RMM: "RMM · Actualidad y Empuje",
  CEM: "CEM · Gestión de Controversias",
  GAM: "GAM · Percepción de Gobernanza",
  DCM: "DCM · Coherencia Informativa",
  CXM: "CXM · Ejecución Corporativa",
};

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return Math.round(n * 10) / 10 + "";
}

/** F — Volatility cell. Null/undefined ⇒ explicit "n/a (≥2 snapshots)" so
 *  the LLM cannot misread a single-snapshot run as "perfect stability". */
function fmtVolatility(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a (≥2 snapshots)";
  return Math.round(n * 10) / 10 + "";
}

function sign(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  if (n > 0) return `+${fmt(n)}`;
  return fmt(n);
}

function semaforo(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "⚪";
  if (score >= 70) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

/** Render "min–max" or "n/d". Single source of truth for range cells. */
function fmtRange(r: { min: number | null; max: number | null } | undefined | null): string {
  if (!r || r.min == null || r.max == null) return "n/d";
  if (r.min === r.max) return fmt(r.min);
  return `${fmt(r.min)}–${fmt(r.max)}`;
}

function consensusBadge(level: "alto" | "medio" | "bajo" | "n/d" | undefined): string {
  if (!level || level === "n/d") return "n/d";
  if (level === "alto") return "🟢 alto";
  if (level === "medio") return "🟡 medio";
  return "🔴 bajo";
}

/**
 * Tabla principal de KPIs.
 * - mode=period (anti-mediana): RANGO POR IA / CONSENSO / INICIO→FIN / Δ / VOLATILIDAD
 *   Usa submetrics_range del period_summary (matriz por IA, NUNCA media cross-modelo).
 * - mode=snapshot: VALOR / TENDENCIA (delta vs primera semana del rango)
 */
export function renderPeriodKpiTable(
  metrics: MetricAggregation[],
  mode: Mode,
  periodSummary?: KpiTablePeriodSummary,
): string {
  if (!metrics.length) return "";

  if (mode === "snapshot") {
    const rows = metrics
      .map(
        (m) =>
          `| ${semaforo(m.last_week)} ${METRIC_LABEL[m.metric] ?? m.metric} | ${fmt(m.last_week)} | ${sign(m.delta_period)} |`,
      )
      .join("\n");
    return [
      "**Tabla principal — snapshot semanal**",
      "",
      "| Indicador | Valor | Δ vs semana previa |",
      "|---|---|---|",
      rows,
    ].join("\n");
  }

  // ANTI-MEDIANA — modo período: NO se reporta una "media" cross-modelo
  // como verdad agregada. Cada KPI muestra el RANGO inter-IA (min–max)
  // y un nivel cualitativo de CONSENSO derivado del rango. La columna
  // Inicio→Fin / Δ se mantiene como referencia temporal del consenso
  // semanal medio (intra-período), claramente etiquetada.
  const sm = periodSummary?.submetrics_range ?? {};
  const rxRange =
    periodSummary && periodSummary.rix_min != null && periodSummary.rix_max != null
      ? { min: periodSummary.rix_min, max: periodSummary.rix_max }
      : null;
  const rxLevel = periodSummary?.rix_consensus_level ?? "n/d";
  const rows = metrics
    .map((m) => {
      const isRix = m.metric === "RIX";
      const range = isRix ? rxRange : sm[m.metric] ?? null;
      const level = isRix ? rxLevel : sm[m.metric]?.level ?? "n/d";
      // semáforo basado en mid-range (min+max)/2 para señal visual rápida
      const mid = range && range.min != null && range.max != null ? (range.min + range.max) / 2 : null;
      return `| ${semaforo(mid)} ${METRIC_LABEL[m.metric] ?? m.metric} | ${fmtRange(range)} | ${consensusBadge(level)} | ${fmt(m.first_week)} → ${fmt(m.last_week)} | ${sign(m.delta_period)} | ${fmtVolatility(m.volatility)} |`;
    })
    .join("\n");
  return [
    "**Tabla principal — KPIs del período (anti-mediana, por IA)**",
    "",
    "_Cada celda 'Rango por IA' muestra min–max entre los 6 modelos. Nunca se promedia entre IAs._",
    "",
    "| Indicador | Rango por IA | Consenso | Inicio → Fin (referencia) | Δ período | Volatilidad (sd) |",
    "|---|---|---|---|---|---|",
    rows,
  ].join("\n");
}

/**
 * Tabla cruzada por modelo de IA: muestra el RIX de cada modelo en el
 * último snapshot disponible. Crítica para REGLA #1 (análisis cruzado).
 */
export function renderModelTable(rows: any[]): string {
  if (!rows.length) return "";
  // Tomamos el snapshot más reciente y agrupamos por modelo.
  const sorted = [...rows].sort((a, b) =>
    String(b.batch_execution_date).localeCompare(String(a.batch_execution_date)),
  );
  const latest = sorted[0]?.batch_execution_date;
  const sameWeek = sorted.filter((r) => r.batch_execution_date === latest);

  const body = sameWeek
    .map((r) => {
      const model = String(r["02_model_name"] ?? "n/d");
      const rix = r["09_rix_score"];
      return `| ${model} | ${semaforo(rix)} ${fmt(rix)} | ${fmt(r["23_nvm_score"])} | ${fmt(r["26_drm_score"])} | ${fmt(r["29_sim_score"])} | ${fmt(r["32_rmm_score"])} | ${fmt(r["35_cem_score"])} | ${fmt(r["38_gam_score"])} | ${fmt(r["41_dcm_score"])} | ${fmt(r["44_cxm_score"])} |`;
    })
    .join("\n");

  return [
    `**Tabla cruzada por modelo — snapshot ${String(latest ?? "n/d").slice(0, 10)}**`,
    "",
    "| Modelo | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |",
    "|---|---|---|---|---|---|---|---|---|---|",
    body,
  ].join("\n");
}

/**
 * Tabla de evolución semanal: una fila por semana con la mediana de RIX
 * de todos los modelos de esa semana. Solo se renderiza si hay >1 semana.
 */
export function renderEvolutionTable(rows: any[]): string {
  if (!rows.length) return "";
  const byWeek = new Map<string, number[]>();
  for (const r of rows) {
    const w = String(r.batch_execution_date ?? "").slice(0, 10);
    if (!w) continue;
    const v = typeof r["09_rix_score"] === "number" ? r["09_rix_score"] : parseFloat(r["09_rix_score"]);
    if (Number.isFinite(v)) {
      if (!byWeek.has(w)) byWeek.set(w, []);
      byWeek.get(w)!.push(v);
    }
  }
  const weeks = [...byWeek.keys()].sort();
  if (weeks.length === 0) return "";
  const body = weeks
    .map((w) => {
      const vals = byWeek.get(w)!;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return `| ${w} | ${semaforo(avg)} ${fmt(avg)} | ${vals.length} |`;
    })
    .join("\n");
  return [
    "**Evolución semanal del RIX**",
    "",
    "| Semana | RIX medio semanal | Modelos con dato |",
    "|---|---|---|",
    body,
  ].join("\n");
}

export const __test__ = { fmt, sign, semaforo, fmtRange, consensusBadge, fmtVolatility };