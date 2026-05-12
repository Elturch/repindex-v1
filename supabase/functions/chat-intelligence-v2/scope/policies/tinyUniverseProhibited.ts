// chat-intelligence-v2 / scope / policies / tinyUniverseProhibited.ts
// Fase 2 — Eje B (E2). Lista CERRADA y VERSIONADA de términos prohibidos
// en universos pequeños (N <= 3). Solo aplica cuando TINY_UNIVERSE_GUARD
// está activo. Las palabras se buscan con word-boundary case-insensitive
// en `tinyUniverseGuard.scan`. NUNCA mutar _V1: cualquier ampliación
// crea _V2 con bump explícito de versión y se documenta el cambio.
//
// Justificación: con N<=3, el lenguaje ordinal/comparativo absoluto
// ("líder", "el peor", "se distancia") induce al lector a leer un
// ranking que el universo no soporta estadísticamente. El guard NO
// reescribe el output: solo emite warning + persiste para auditar.

export const TINY_UNIVERSE_PROHIBITED_VERSION = 1 as const;

export const TINY_UNIVERSE_PROHIBITED_V1: readonly string[] = [
  "líder",
  "rezagado",
  "destaca",
  "se distancia",
  "se aleja",
  "lidera el grupo",
  "queda detrás",
  "el mejor",
  "el peor",
  "el primero",
  "el último",
  "sobresale",
  "se descuelga",
] as const;

/**
 * N máximo del scope para que el guard sea aplicable. Si scope.tickers > 3
 * el guard no se ejecuta (universos no-tiny tienen ranking estadístico
 * legítimo, el lenguaje comparativo es válido).
 */
export const TINY_UNIVERSE_MAX_N = 3 as const;