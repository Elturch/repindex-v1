// Agente Rix v2 — Bloque 5: Recomendaciones priorizadas (max 200 LOC)
// Lógica determinista: las 3 métricas con peor media generan recomendación.
// Cada recomendación: prioridad + métrica + valor actual + target (+15) +
// acciones predefinidas por tipo de métrica. Pre-renderiza markdown.
import type { MetricAggregation, MetricName } from "../types.ts";

type Priority = "Alta" | "Media" | "Baja";

const ACTIONS: Record<MetricName, string[]> = {
  RIX: [
    "Revisar narrativa global y reforzar coherencia inter-modelo",
    "Publicar contenidos verificables que aborden los modelos con peor cobertura",
  ],
  NVM: [
    "Mejorar la narrativa con datos verificables y casos de uso concretos",
    "Reforzar el storytelling estratégico en notas de prensa y blog corporativo",
  ],
  DRM: [
    "Fortalecer evidencia con fuentes primarias (informes oficiales, resultados auditados)",
    "Publicar dossiers descargables con datos cuantificables y trazabilidad",
  ],
  SIM: [
    "Publicar informe integrado con XBRL y enlaces a registros oficiales",
    "Incrementar presencia en medios de autoridad (Tier 1) con datos primarios",
  ],
  RMM: [
    "Aumentar el ritmo de publicaciones con hitos verificables",
    "Coordinar agenda de hitos corporativos con cobertura de IR",
  ],
  CEM: [
    "Activar plan de respuesta proactiva a controversias detectadas",
    "Publicar comunicados oficiales que aborden percepciones críticas",
  ],
  GAM: [
    "Reforzar transparencia en informes de gobernanza y composición del consejo",
    "Publicar políticas ESG y de remuneración con métricas auditables",
  ],
  DCM: [
    "Auditar consistencia entre comunicados, web corporativa y declaraciones",
    "Unificar mensajes clave entre IR, comunicación y dirección general",
  ],
  CXM: [
    "Documentar y publicar avances de ejecución de plan estratégico",
    "Reforzar comunicación de resultados operativos vs guidance",
  ],
};

function priorityFromScore(score: number): Priority {
  if (score < 50) return "Alta";
  if (score < 65) return "Media";
  return "Baja";
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

export interface Recommendation {
  priority: Priority;
  metric: MetricName;
  /** Rango actual inter-IA (min–max). Reemplaza a "current: number"
   *  para honrar la regla anti-mediana: nunca un único número agregado. */
  range_min: number | null;
  range_max: number | null;
  /** Nivel cualitativo derivado del rango: alto / medio / bajo. */
  consensus_level: "alto" | "medio" | "bajo" | "n/d";
  /** Target = max + 5 (sube el techo, no la media). */
  target: number;
  actions: string[];
}

/**
 * Pick the 3 weakest metrics (excluding the global RIX) and build recs.
 *
 * ANTI-MEDIANA — única fuente de verdad: el `submetrics_range` calculado
 * por periodAggregation. NO usamos `MetricAggregation.mean` (que mezcla
 * IAs intra-semana). Si no llega `submetricsRange` (legacy caller), la
 * función degrada a [] y el bloque queda vacío en vez de inventar números.
 */
export function computeRecommendations(
  metrics: MetricAggregation[],
  submetricsRange?: Record<
    string,
    { min: number | null; max: number | null; range: number | null; level: "alto" | "medio" | "bajo" | "n/d" }
  >,
): Recommendation[] {
  if (!submetricsRange) return [];
  // Ranking por techo (max) — la métrica con peor techo es la más débil
  // sin necesidad de promediar entre IAs.
  const candidates = metrics
    .filter((m) => m.metric !== "RIX")
    .map((m) => ({ m, r: submetricsRange[m.metric] }))
    .filter((x) => x.r && x.r.max != null)
    .sort((a, b) => (a.r!.max as number) - (b.r!.max as number))
    .slice(0, 3);
  return candidates.map(({ m, r }) => {
    const target = Math.min(100, Math.round((r!.max as number) + 5));
    // Prioridad basada en techo: si el max ya es bajo, urgencia alta.
    return {
      priority: priorityFromScore(r!.max as number),
      metric: m.metric,
      range_min: r!.min,
      range_max: r!.max,
      consensus_level: r!.level,
      target,
      actions: ACTIONS[m.metric] ?? [],
    };
  });
}

/** Render a markdown block with the prioritized recommendations. */
export function renderRecommendationsBlock(
  metrics: MetricAggregation[],
  submetricsRange?: Record<
    string,
    { min: number | null; max: number | null; range: number | null; level: "alto" | "medio" | "bajo" | "n/d" }
  >,
): string {
  const recs = computeRecommendations(metrics, submetricsRange);
  if (recs.length === 0) return "";
  const lines: string[] = ["**Recomendaciones priorizadas (anti-mediana)**", ""];
  recs.forEach((r, i) => {
    const icon = r.priority === "Alta" ? "🔴" : r.priority === "Media" ? "🟡" : "🟢";
    const rangeTxt =
      r.range_min != null && r.range_max != null && r.range_min !== r.range_max
        ? `${fmt(r.range_min)}–${fmt(r.range_max)}`
        : fmt(r.range_max ?? r.range_min);
    lines.push(
      `**${i + 1}. ${icon} Prioridad ${r.priority} — ${r.metric}**`,
      `• Rango actual por IA: ${rangeTxt} · Consenso: ${r.consensus_level} → Target (techo): ${r.target}`,
      ...r.actions.map((a) => `• ${a}`),
      "",
    );
  });
  return lines.join("\n").trimEnd();
}

export const __test__ = { priorityFromScore, fmt, computeRecommendations, ACTIONS };