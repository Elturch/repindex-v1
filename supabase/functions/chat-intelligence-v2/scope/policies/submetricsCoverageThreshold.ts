// chat-intelligence-v2 / scope / policies / submetricsCoverageThreshold.ts
// Fase 2 — Eje A (E1).
//
// Umbral de cobertura mínima para que una sub-métrica sea EXIGIBLE en el
// output del LLM. Se calcula como:
//
//   coverage(m) = filas no nulas para la sub-métrica m
//                 ----------------------------------------------
//                 (tickers x models x weeks)  del dataset entregado
//
// Solo cuando coverage(m) >= SUBMETRICS_COVERAGE_MIN se permite que el
// assert A9 (anti-fabricación de sub-métricas) la marque como obligatoria.
// Las sub-métricas por debajo del umbral se IGNORAN silenciosamente: ni
// se exigen ni se reportan como missing.
//
// Justificación del valor 0.70 (70 %):
//
//   (a) Evita exigir sub-métricas con huecos estructurales conocidos
//       (CXM en emisores no cotizados, GAM en universos pequeños), que
//       producirían falsos positivos de "fabricación" si el LLM optase
//       por no citarlas correctamente.
//
//   (b) Impide que el modelo cite sub-métricas marginales (presentes
//       solo en 1-2 modelos sobre 6) como si fueran consenso del scope,
//       lo que sí es una fabricación material.
//
//   (c) 0.70 deja pasar las 8 métricas en subsectores con cobertura
//       limpia (banca, energía) y filtra automáticamente cuando hay
//       degradación parcial (fines de semana sin Perplexity, batches
//       incompletos).
//
// Ajuste posterior solo con evidencia empírica de >=2 ejecuciones full
// (phase1-full + phase2-full) que muestren que el umbral está produciendo
// falsos positivos o falsos negativos sistemáticos.

export const SUBMETRICS_COVERAGE_MIN = 0.70;

export const SUBMETRICS_COVERAGE_VERSION = 1;

/** Lista canónica de las 8 sub-métricas RIX en orden estable. */
export const RIX_SUBMETRICS: readonly ["NVM", "DRM", "SIM", "RMM", "CEM", "GAM", "DCM", "CXM"] = [
  "NVM", "DRM", "SIM", "RMM", "CEM", "GAM", "DCM", "CXM",
] as const;

export type RixSubmetric = typeof RIX_SUBMETRICS[number];

/**
 * Devuelve el subconjunto de sub-métricas exigibles dado un mapa
 * {NVM: 0.83, DRM: 0.42, ...}. Pure function; no side-effects.
 */
export function exigibleSubmetrics(
  coverage: Partial<Record<RixSubmetric, number>>,
  threshold: number = SUBMETRICS_COVERAGE_MIN,
): RixSubmetric[] {
  return RIX_SUBMETRICS.filter((m) => (coverage[m] ?? 0) >= threshold);
}

/**
 * Inverso de `exigibleSubmetrics`: las que se IGNORAN porque están por
 * debajo del umbral. No se reportan como missing, solo trazabilidad.
 */
export function ignoredSubmetrics(
  coverage: Partial<Record<RixSubmetric, number>>,
  threshold: number = SUBMETRICS_COVERAGE_MIN,
): RixSubmetric[] {
  return RIX_SUBMETRICS.filter((m) => (coverage[m] ?? 0) < threshold);
}
