// chat-intelligence-v2 / scope / featureFlags.ts
// Fase 1 — Switch entre legacy y scoped skills.
// La unica via para activar el camino scoped es la variable de entorno
// USE_SCOPED_SKILLS. NUNCA hardcoded. Permite rollback inmediato sin
// redeploy editando el secreto en Supabase Dashboard.

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
// Default OFF en producción. Activación consciente posterior, una vez
// pasado phase1-full 21/21 verde y completada la ventana de observación
// definida en el plan Fase 2 (E5).
export function isEnrichRankingSubmetricsEnabled(): boolean {
  return readBool("ENRICH_RANKING_SUBMETRICS");
}

export function scopeFlagsSnapshot(): Record<string, boolean> {
  return {
    use_scoped_skills: isUseScopedSkillsEnabled(),
    freeze_cosmetic_injectors: isCosmeticInjectorsFrozen(),
    enrich_ranking_submetrics: isEnrichRankingSubmetricsEnabled(),
  };
}