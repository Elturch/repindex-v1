// chat-intelligence-v2 / scope / featureFlags.ts
// Fase 1 — Switch entre legacy y scoped skills.
// La unica via para activar el camino scoped es la variable de entorno
// USE_SCOPED_SKILLS. NUNCA hardcoded. Permite rollback inmediato sin
// redeploy editando el secreto en Supabase Dashboard.
//
// Paso 2.5 — Aislamiento Fase 2. Los 3 flags Fase 2
// (ENRICH_RANKING_SUBMETRICS / TINY_UNIVERSE_GUARD / EXEC_NARRATIVE) NO
// se leen ya directamente desde el orchestrator. Se usan las variantes
// `*WithContext(ctx)` que aplican el gate de header (RequestHeaderContext).
// Las funciones `isXxxEnabled()` legacy se conservan únicamente para no
// romper imports externos y están marcadas @deprecated.

import type { RequestHeaderContext } from "./headerGate.ts";

function readBool(name: string): boolean {
  const raw = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
}

export function isUseScopedSkillsEnabled(): boolean {
  return readBool("USE_SCOPED_SKILLS");
}

// Fase 1 — Congelacion de inyectores cosmeticos.
// Default = true durante toda la Fase 1: el output del LLM sale CRUDO, sin
// frase MEL forzada, sin tabla de 8 metricas auto-rellenada y sin bloque
// de bibliografia auto-inyectado. Para descongelar puntualmente (debug)
// basta con FREEZE_COSMETIC_INJECTORS=false en el entorno.
export function isCosmeticInjectorsFrozen(): boolean {
  const raw = (Deno.env.get("FREEZE_COSMETIC_INJECTORS") ?? "").trim().toLowerCase();
  if (raw === "") return true; // default Fase 1
  return !(raw === "false" || raw === "0" || raw === "off" || raw === "no");
}

// Fase 2 — Eje A: enriquecimiento del payload con sub-métricas disponibles.
// @deprecated Paso 2.5 — usa `isEnrichRankingSubmetricsEnabledWithContext(ctx)`.
// Conservada únicamente para compatibilidad de imports externos. NO debe
// llamarse desde el orchestrator: ignora el gate de header.
export function isEnrichRankingSubmetricsEnabled(): boolean {
  return readBool("ENRICH_RANKING_SUBMETRICS");
}

// Fase 2 — Eje B: tiny universe guard (post-validador pasivo).
// @deprecated Paso 2.5 — usa `isTinyUniverseGuardEnabledWithContext(ctx)`.
export function isTinyUniverseGuardEnabled(): boolean {
  return readBool("TINY_UNIVERSE_GUARD");
}

// Fase 2 — Eje C: relato directivo opcional (headline + TL;DR + Lectura).
// @deprecated Paso 2.5 — usa `isExecNarrativeEnabledWithContext(ctx)`.
export function isExecNarrativeEnabled(): boolean {
  return readBool("EXEC_NARRATIVE");
}

// ── Paso 2.5 — Variantes con header gate ─────────────────────────────────
// Cada `*WithContext(ctx)` devuelve `true` SOLO si:
//   (1) ctx.phase2_unlocked === true  (header válido o aislamiento OFF), y
//   (2) el Secret correspondiente está ON.
// Si ctx.phase2_unlocked === false, ni siquiera se lee el Secret.

export function isEnrichRankingSubmetricsEnabledWithContext(
  ctx: RequestHeaderContext,
): boolean {
  return ctx.phase2_unlocked && readBool("ENRICH_RANKING_SUBMETRICS");
}

export function isTinyUniverseGuardEnabledWithContext(
  ctx: RequestHeaderContext,
): boolean {
  return ctx.phase2_unlocked && readBool("TINY_UNIVERSE_GUARD");
}

export function isExecNarrativeEnabledWithContext(
  ctx: RequestHeaderContext,
): boolean {
  return ctx.phase2_unlocked && readBool("EXEC_NARRATIVE");
}

/**
 * Snapshot completo. Si se pasa `ctx`, expone tanto el valor `raw` (Secret
 * tal cual) como el `effective` (Secret AND gate de header) por cada flag
 * Fase 2, plus phase2_isolation_active y phase2_unlocked. Sin `ctx` se
 * comporta como antes (compat con callers legacy de telemetría).
 */
export function scopeFlagsSnapshot(
  ctx?: RequestHeaderContext,
): Record<string, unknown> {
  const raw = {
    use_scoped_skills: isUseScopedSkillsEnabled(),
    freeze_cosmetic_injectors: isCosmeticInjectorsFrozen(),
    enrich_ranking_submetrics: readBool("ENRICH_RANKING_SUBMETRICS"),
    tiny_universe_guard: readBool("TINY_UNIVERSE_GUARD"),
    exec_narrative: readBool("EXEC_NARRATIVE"),
  };
  if (!ctx) return raw;
  return {
    ...raw,
    phase2_isolation_active: ctx.phase2_isolation_active,
    phase2_unlocked: ctx.phase2_unlocked,
    phase2_flags_effective: {
      enrich_ranking_submetrics: ctx.phase2_unlocked && raw.enrich_ranking_submetrics,
      tiny_universe_guard: ctx.phase2_unlocked && raw.tiny_universe_guard,
      exec_narrative: ctx.phase2_unlocked && raw.exec_narrative,
    },
  };
}