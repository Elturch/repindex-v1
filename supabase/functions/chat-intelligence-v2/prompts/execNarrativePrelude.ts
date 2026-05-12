// chat-intelligence-v2 / prompts / execNarrativePrelude.ts
// Fase 2 — Eje C. Bloque de instrucciones que se INYECTA al system prompt
// SOLO cuando EXEC_NARRATIVE=true. Es informativo + contractual: dice al
// modelo qué estructura debe producir y qué trazabilidad numérica exige.
// NO inyecta cifras, NO inyecta tablas, NO escribe markdown por el LLM.
// Si el flag está OFF, esta función no se llama y el prompt es idéntico
// al de Fase 1 (regresión cero garantizada).

import {
  EXEC_NARRATIVE_HEADLINE_MAX_WORDS_V1,
  EXEC_NARRATIVE_BULLETS_REQUIRED_V1,
  EXEC_NARRATIVE_LECTURA_MAX_WORDS_V1,
  EXEC_NARRATIVE_POLICY_VERSION,
} from "../scope/policies/execNarrativeLimits.ts";

export function buildExecNarrativePrelude(): string {
  const h = EXEC_NARRATIVE_HEADLINE_MAX_WORDS_V1;
  const b = EXEC_NARRATIVE_BULLETS_REQUIRED_V1;
  const l = EXEC_NARRATIVE_LECTURA_MAX_WORDS_V1;
  return [
    `# Contrato narrativo ejecutivo (policy v${EXEC_NARRATIVE_POLICY_VERSION})`,
    ``,
    `Antes del cuerpo del informe, abre la respuesta con esta estructura exacta:`,
    ``,
    `1. Headline en una sola línea, máximo ${h} palabras, sin signos finales decorativos.`,
    `2. Bloque "TL;DR" con exactamente ${b} bullets ("- "). Cada bullet ≤ 25 palabras.`,
    `3. Bloque "Lectura:" con un párrafo único de máximo ${l} palabras.`,
    ``,
    `Trazabilidad numérica obligatoria:`,
    `- Cada cifra que cites en headline/TL;DR/Lectura debe existir en el dataset entregado.`,
    `- No inventes porcentajes, deltas, ni recuentos. Si no hay dato exacto, usa lenguaje cualitativo.`,
    ``,
    `Restricciones:`,
    `- No uses "mediana", "white-paper", "data-room", "roadshow", "RIX medio".`,
    `- No fabriques fechas, eventos, hojas de ruta ni deliverables.`,
    ``,
    `Tras estos tres bloques, continúa con el informe canónico habitual.`,
  ].join("\n");
}