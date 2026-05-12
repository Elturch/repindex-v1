// chat-intelligence-v2 / scope / policies / phase2IsolationPolicy.ts
// Paso 2.5 — Aislamiento estricto Fase 2 vía header.
//
// Contrato (resumen, ver .lovable/plan.md sección 1):
//
//   PHASE2_STAGING_ONLY  header válido  Secret flag  →  efectivo
//   true (default)       no             true/false    →  false   ← USUARIOS REALES
//   true                 sí             true          →  true    ← runner stress
//   true                 sí             false         →  false
//   false                cualquiera     true          →  true    ← modo "abierto" futuro
//   false                cualquiera     false         →  false
//
// Regla de oro: un usuario real NUNCA envía `x-repindex-stress` →
// los 3 flags Fase 2 (ENRICH_RANKING_SUBMETRICS / TINY_UNIVERSE_GUARD /
// EXEC_NARRATIVE) son `false` efectivos siempre, independientemente del
// Secret. Path de ejecución idéntico al baseline Fase 1.
//
// Rollback (E5 ampliado):
//   - Flag Fase 2 falla aislado    → Secret flag = false        (<5 min)
//   - Token leak / mal gating       → rotar STRESS_TESTS_HEADER_TOKEN (<5 min)
//   - Revertir Paso 2.5 entero      → git revert + redeploy auto (<15 min)

export const PHASE2_ISOLATION_HEADER = "x-repindex-stress" as const;
export const PHASE2_ISOLATION_VERSION = 1 as const;

/** Nombre del Secret maestro de aislamiento. Default tratado como `true`. */
export const PHASE2_STAGING_ONLY_ENV = "PHASE2_STAGING_ONLY" as const;

/** Nombre del Secret con el token compartido. Comparación byte-a-byte (`===`). */
export const PHASE2_HEADER_TOKEN_ENV = "STRESS_TESTS_HEADER_TOKEN" as const;