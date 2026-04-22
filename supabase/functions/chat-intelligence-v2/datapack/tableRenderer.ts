// Agente Rix v2 — pre-rendered markdown tables (max 150 LOC)
// Constraint #9: las tablas de KPIs SIEMPRE se pre-renderizan aquí, NUNCA
// las genera el LLM. Extraído del estilo de tablas de v1/index.ts y de
// _shared/periodAggregation.ts (renderPeriodAggregationBlock).
import type { MetricAggregation, Mode } from "../types.ts";

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

/**
 * Tabla principal de KPIs.
 * - mode=period: MEDIA / INICIO→FIN / DELTA / MIN / MAX / VOLATILIDAD
 * - mode=snapshot: VALOR / TENDENCIA (delta vs primera semana del rango)
 */
export function renderPeriodKpiTable(metrics: MetricAggregation[], mode: Mode): string {
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

  const rows = metrics
    .map(
      (m) =>
        `| ${semaforo(m.mean)} ${METRIC_LABEL[m.metric] ?? m.metric} | ${fmt(m.mean)} | ${fmt(m.first_week)} → ${fmt(m.last_week)} | ${sign(m.delta_period)} | ${fmt(m.min)} | ${fmt(m.max)} | ${fmt(m.volatility)} |`,
    )
    .join("\n");
  return [
    "**Tabla principal — KPIs del período**",
    "",
    "| Indicador | Media | Inicio → Fin | Δ período | Min | Max | Volatilidad (sd) |",
    "|---|---|---|---|---|---|---|",
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
    "| Semana | RIX (media inter-modelo) | Modelos con dato |",
    "|---|---|---|",
    body,
  ].join("\n");
}

export const __test__ = { fmt, sign, semaforo };