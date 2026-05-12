// chat-intelligence-v2 / scope / policies / execNarrativeLimits.ts
// Fase 2 — Eje C. Constantes inmutables del contrato EXEC_NARRATIVE.
//
//   - HEADLINE_MAX_WORDS: longitud máxima del headline ejecutivo.
//   - BULLETS_REQUIRED:   nº exacto de bullets en el TL;DR.
//   - LECTURA_MAX_WORDS:  longitud máxima del bloque "Lectura:".
//   - MAX_RETRIES:        E3 — máximo 2 reintentos (3 intentos totales).
//
// Versionado explícito para que cualquier cambio futuro requiera bump.
// Cualquier ajuste de los límites se hace creando _V2 y bump de versión,
// nunca mutando _V1.

export const EXEC_NARRATIVE_HEADLINE_MAX_WORDS_V1 = 12;
export const EXEC_NARRATIVE_BULLETS_REQUIRED_V1 = 3;
export const EXEC_NARRATIVE_LECTURA_MAX_WORDS_V1 = 60;
export const EXEC_NARRATIVE_MAX_RETRIES_V1 = 2; // E3
export const EXEC_NARRATIVE_POLICY_VERSION = 1;