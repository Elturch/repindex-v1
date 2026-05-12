// chat-intelligence-v2 / prompts / submetricsAvailableSlot.ts
// Fase 2 — Eje A.
//
// Genera un bloque de TEXTO INFORMATIVO (no instructivo) que se inyecta
// al system prompt cuando ENRICH_RANKING_SUBMETRICS=true. Su único
// propósito es DOCUMENTAR al modelo qué sub-métricas están disponibles
// con cobertura suficiente (>= SUBMETRICS_COVERAGE_MIN) en el dataset
// que se le va a entregar, junto con la media observada (sin imputación).
//
// Reglas estrictas (Cero fabricación):
//   * NUNCA rellenar valores: solo se documentan los OBSERVADOS.
//   * NUNCA forzar al modelo a citarlas: se le permite, no se le obliga.
//   * NUNCA reescribir el output: este módulo solo emite texto informativo.
//
// El LLM decide si las usa. El assert A9 valida a posteriori que no haya
// citado sub-métricas con coverage < umbral.

import {
  SUBMETRICS_COVERAGE_MIN,
  SUBMETRICS_COVERAGE_VERSION,
  exigibleSubmetrics,
  ignoredSubmetrics,
  type RixSubmetric,
} from "../scope/policies/submetricsCoverageThreshold.ts";
import type { SubmetricsCoverage } from "../scope/helpers/computeSubmetricsCoverage.ts";

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "n/d";
  return n.toFixed(digits);
}

/**
 * Construye el slot informativo. Devuelve `null` si no hay sub-métricas
 * exigibles (en ese caso no se inyecta nada y el comportamiento del
 * prompt queda inalterado).
 */
export function buildSubmetricsAvailableSlot(
  cov: SubmetricsCoverage,
): string | null {
  const exigible = exigibleSubmetrics(cov.coverage);
  if (exigible.length === 0) return null;

  const ignored = ignoredSubmetrics(cov.coverage);

  const lines: string[] = [];
  lines.push(
    `[SUB-MÉTRICAS DISPONIBLES en el dataset entregado · v${SUBMETRICS_COVERAGE_VERSION}]`,
  );
  lines.push(
    `Estas sub-métricas tienen cobertura >= ${(SUBMETRICS_COVERAGE_MIN * 100).toFixed(0)}% (celdas con valor real / tickers x modelos x semanas observadas):`,
  );
  for (const m of exigible) {
    const c = cov.coverage[m] ?? 0;
    const meanLine = cov.mean[m] !== undefined
      ? `media observada=${fmt(cov.mean[m] as number, 1)}`
      : "media n/d";
    lines.push(
      `  - ${m}: cobertura=${(c * 100).toFixed(0)}% · ${meanLine} · obs=${cov.obs[m] ?? 0}`,
    );
  }
  if (ignored.length > 0) {
    lines.push(
      `Sub-métricas IGNORADAS (cobertura < ${(SUBMETRICS_COVERAGE_MIN * 100).toFixed(0)}%, no exigirlas ni mencionarlas como consenso): ${ignored.join(", ")}.`,
    );
  }
  lines.push(
    `Reglas: (1) puedes citar las disponibles si tu análisis lo requiere; (2) NO inventes valores; (3) NO menciones las ignoradas como "consenso del scope"; (4) si decides no citarlas, el output es válido igualmente.`,
  );
  return lines.join("\n");
}
