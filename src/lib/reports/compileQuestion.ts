import { FilterState, toDbModelNames } from "./filterState";
import { CompanyMeta } from "./coherenceEngine";

/** Une nombres con comas y "y" antes del último (más natural para el agente). */
function joinAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

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

  // Métricas (multi)
  if (
    state.axisMetrics.value.length > 0 &&
    state.intent.value !== "vision_general"
  ) {
    const metrics = state.axisMetrics.value;
    const hasRix = metrics.includes("RIX" as any);
    const canonical = metrics.filter((m) => m !== ("RIX" as any));
    if (metrics.length === 1 && hasRix) {
      parts.push("del índice RIX global");
    } else if (metrics.length === 1) {
      parts.push(`de la métrica ${metrics[0]}`);
    } else if (metrics.length >= 9) {
      parts.push("de todas las métricas RIX");
    } else if (hasRix && canonical.length > 0) {
      parts.push(
        `de las métricas ${canonical.join(", ")} incluyendo el índice RIX global`,
      );
    } else {
      parts.push(`de las métricas ${metrics.join(", ")}`);
    }
  }

  // Empresa(s)
  if (state.tickers.value.length > 0) {
    const names = joinAnd(
      state.tickers.value.map(
        (t) => companies.find((c) => c.ticker === t)?.issuer_name ?? t,
      ),
    );
    parts.push(`de ${names}`);
  } else if (state.subsector.value.length > 0) {
    parts.push(`del subsector ${joinAnd(state.subsector.value)}`);
  } else if (state.sector.value.length > 0) {
    parts.push(`del sector ${joinAnd(state.sector.value)}`);
  } else if (state.universe.value.length > 0) {
    parts.push(`del universo ${joinAnd(state.universe.value)}`);
  } else {
    parts.push("de todos los universos cotizados");
  }

  // Top N — se aplica siempre que tenga sentido (no en perfil ni cuando hay
  // un único ticker explícito). Antes sólo se emitía en "ranking", lo que
  // hacía que el usuario perdiera su selección de Top N al usar otros intents.
  const singleTicker = state.tickers.value.length === 1;
  const userTouched =
    state.topN.origin === "user-set" || state.order.origin === "user-set";
  // Sólo añadir la cláusula Top N / orden si:
  //  - el intent es ranking (intrínseco), o
  //  - el usuario fijó explícitamente Top N u orden,
  //  y nunca en "perfil" ni "vision_general" (esta última quedaba con
  //  narrativa contradictoria tipo "informe ejecutivo … limitado a las 10
  //  mejores" cuando el usuario tocaba topN sin querer).
  const topNApplies =
    state.intent.value !== "perfil" &&
    state.intent.value !== "vision_general" &&
    !singleTicker &&
    (state.intent.value === "ranking" || userTouched);
  if (topNApplies) {
    if (state.order.value === "asc") {
      parts.push(`limitado a las ${state.topN.value} peores`);
    } else if (state.order.value === "divergence") {
      parts.push(
        `limitado a las ${state.topN.value} de mayor divergencia entre modelos`,
      );
    } else {
      parts.push(`limitado a las ${state.topN.value} mejores`);
    }
  }

  // Temporal
  if (state.window.value.preset === "ytd") {
    parts.push(
      `en lo que va de año (year to date, entre ${state.window.value.from} y ${state.window.value.to})`,
    );
  } else {
    parts.push(`entre ${state.window.value.from} y ${state.window.value.to}`);
  }
  if (state.granularity.value !== "snapshot") {
    const gMap: Record<string, string> = {
      weekly: "con desglose semanal",
      monthly: "con desglose mensual",
      quarterly: "con desglose trimestral",
    };
    parts.push(gMap[state.granularity.value] ?? "");
  } else {
    parts.push("como foto fija del último barrido disponible");
  }

  // Modelos
  if (state.models.value.length > 0 && state.models.value.length < 6) {
    parts.push(`usando solo ${joinAnd(toDbModelNames(state.models.value))}`);
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