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
  current: number;
  target: number;
  actions: string[];
}

/** Pick the 3 weakest metrics (excluding the global RIX) and build recs. */
export function computeRecommendations(metrics: MetricAggregation[]): Recommendation[] {
  const candidates = metrics
    .filter((m) => m.metric !== "RIX" && Number.isFinite(m.mean))
    .sort((a, b) => a.mean - b.mean)
    .slice(0, 3);
  return candidates.map((m) => {
    const target = Math.min(100, Math.round(m.mean + 15));
    return {
      priority: priorityFromScore(m.mean),
      metric: m.metric,
      current: Math.round(m.mean * 10) / 10,
      target,
      actions: ACTIONS[m.metric] ?? [],
    };
  });
}

/** Render a markdown block with the prioritized recommendations. */
export function renderRecommendationsBlock(metrics: MetricAggregation[]): string {
  const recs = computeRecommendations(metrics);
  if (recs.length === 0) return "";
  const lines: string[] = ["**Recomendaciones priorizadas**", ""];
  recs.forEach((r, i) => {
    const icon = r.priority === "Alta" ? "🔴" : r.priority === "Media" ? "🟡" : "🟢";
    lines.push(
      `**${i + 1}. ${icon} Prioridad ${r.priority} — ${r.metric}**`,
      `• Valor actual: ${fmt(r.current)} → Target: ${r.target}`,
      ...r.actions.map((a) => `• ${a}`),
      "",
    );
  });
  return lines.join("\n").trimEnd();
}

export const __test__ = { priorityFromScore, fmt, computeRecommendations, ACTIONS };