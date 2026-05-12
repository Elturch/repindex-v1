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

export function scopeFlagsSnapshot(): Record<string, boolean> {
  return { use_scoped_skills: isUseScopedSkillsEnabled() };
}