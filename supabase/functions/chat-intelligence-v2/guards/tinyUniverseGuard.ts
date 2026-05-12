// chat-intelligence-v2 / guards / tinyUniverseGuard.ts
// Fase 2 — Eje B. Post-validador PASIVO sobre el markdown final cuando el
// universo es pequeño (N <= TINY_UNIVERSE_MAX_N) y TINY_UNIVERSE_GUARD está
// activo. NO reescribe el output. Devuelve los términos detectados con
// regex word-boundary case-insensitive sobre la lista versionada
// TINY_UNIVERSE_PROHIBITED_V1.
//
// Contrato:
//   - Pure function. Sin I/O. Determinista.
//   - Si scope.tickers.length > TINY_UNIVERSE_MAX_N → { applies:false }.
//   - Si flag OFF → ni siquiera se llama (decisión del orchestrator).
//   - El output del guard se publica en `result.metadata.tiny_universe`
//     y como warning SSE para que el FE pueda anotarlo. La persistencia
//     en chat_logs se hace via `meta` en el ciclo SSE estándar.

import {
  TINY_UNIVERSE_PROHIBITED_V1,
  TINY_UNIVERSE_PROHIBITED_VERSION,
  TINY_UNIVERSE_MAX_N,
} from "../scope/policies/tinyUniverseProhibited.ts";

export interface TinyUniverseScanResult {
  /** true sólo si N<=TINY_UNIVERSE_MAX_N. Si false el resto de campos son neutros. */
  applies: boolean;
  /** true si se detectaron términos prohibidos. */
  violation: boolean;
  /** términos detectados (orden y duplicados eliminados). */
  terms: string[];
  /** versión de la lista prohibida usada. */
  policy_version: number;
  /** N del scope al momento del scan. */
  n: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Escanea `markdown` aplicando word-boundary case-insensitive. Para
 * términos multi-palabra se exige que el match esté delimitado por inicio
 * de palabra a la izquierda y por carácter no alfanumérico a la derecha.
 */
export function scanTinyUniverse(
  markdown: string,
  scopeTickerCount: number,
): TinyUniverseScanResult {
  const n = scopeTickerCount;
  if (n > TINY_UNIVERSE_MAX_N) {
    return {
      applies: false,
      violation: false,
      terms: [],
      policy_version: TINY_UNIVERSE_PROHIBITED_VERSION,
      n,
    };
  }
  const found = new Set<string>();
  for (const term of TINY_UNIVERSE_PROHIBITED_V1) {
    // Word boundary works for ASCII. Para términos con caracteres acentuados
    // (líder, último) usamos lookarounds equivalentes basados en clases
    // alfanuméricas extendidas. JS regex con `i` y `u` flags.
    const pat = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegex(term)}(?![\\p{L}\\p{N}])`,
      "iu",
    );
    if (pat.test(markdown)) found.add(term.toLowerCase());
  }
  return {
    applies: true,
    violation: found.size > 0,
    terms: Array.from(found),
    policy_version: TINY_UNIVERSE_PROHIBITED_VERSION,
    n,
  };
}