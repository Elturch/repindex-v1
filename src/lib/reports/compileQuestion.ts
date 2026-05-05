import { FilterState } from "./filterState";
import { CompanyMeta } from "./coherenceEngine";

/**
 * Compila el FilterState en una pregunta en lenguaje natural determinista
 * que el Agente RIX V2 sabe interpretar (intent + entidades + temporal +
 * modelos + métrica + topN + orden).
 */
export function compileFiltersToQuestion(
  state: FilterState,
  companies: CompanyMeta[],
): string {
  const parts: string[] = [];

  // Intent
  const intentMap: Record<string, string> = {
    vision_general: "Genera un informe ejecutivo",
    ranking: "Genera un ranking",
    comparativa: "Compara",
    evolucion: "Analiza la evolución",
    divergencia: "Analiza la divergencia entre modelos de IA",
    perfil: "Genera el perfil reputacional",
  };
  parts.push(intentMap[state.intent.value] ?? "Genera un informe");

  // Métrica eje
  if (state.axisMetric.value && state.intent.value !== "vision_general") {
    parts.push(`de la métrica ${state.axisMetric.value}`);
  }

  // Empresa(s)
  if (state.tickers.value.length > 0) {
    const names = state.tickers.value
      .map((t) => companies.find((c) => c.ticker === t)?.issuer_name ?? t)
      .join(", ");
    parts.push(`de ${names}`);
  } else if (state.subsector.value.length > 0) {
    parts.push(`del subsector ${state.subsector.value.join(", ")}`);
  } else if (state.sector.value.length > 0) {
    parts.push(`del sector ${state.sector.value.join(", ")}`);
  } else if (state.universe.value.length > 0) {
    parts.push(`del universo ${state.universe.value.join(", ")}`);
  } else {
    parts.push("del IBEX-35");
  }

  // Top N (solo ranking)
  if (state.intent.value === "ranking") {
    parts.push(`top ${state.topN.value}`);
    if (state.order.value === "asc") parts.push("(peores primero)");
    else if (state.order.value === "divergence") parts.push("ordenado por divergencia");
  }

  // Temporal
  parts.push(`entre ${state.window.value.from} y ${state.window.value.to}`);
  if (state.granularity.value !== "snapshot") {
    const gMap: Record<string, string> = {
      weekly: "con desglose semanal",
      monthly: "con desglose mensual",
      quarterly: "con desglose trimestral",
    };
    parts.push(gMap[state.granularity.value] ?? "");
  }

  // Modelos
  if (state.models.value.length > 0 && state.models.value.length < 6) {
    parts.push(`usando solo ${state.models.value.join(", ")}`);
  }

  // Tipo de fuente
  if (state.sourceTier.value !== "all") {
    const sMap: Record<string, string> = {
      regulatory: "priorizando fuentes regulatorias",
      media: "priorizando medios",
      owned: "priorizando fuentes propias",
    };
    parts.push(sMap[state.sourceTier.value] ?? "");
  }

  return parts.filter(Boolean).join(" ").trim() + ".";
}