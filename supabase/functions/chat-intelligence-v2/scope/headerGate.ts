// chat-intelligence-v2 / scope / headerGate.ts
// Paso 2.5 — Construye el RequestHeaderContext que decide si los flags Fase 2
// pueden evaluarse para esta request concreta. Pure salvo Deno.env.get.
// Fail-closed: ante cualquier ambigüedad, phase2_unlocked = false.

import {
  PHASE2_ISOLATION_HEADER,
  PHASE2_STAGING_ONLY_ENV,
  PHASE2_HEADER_TOKEN_ENV,
} from "./policies/phase2IsolationPolicy.ts";

export interface RequestHeaderContext {
  /** True ⇒ los `*WithContext()` pueden devolver true si el Secret está ON. */
  phase2_unlocked: boolean;
  /** True mientras PHASE2_STAGING_ONLY=true (default). Sólo lectura para telemetría. */
  phase2_isolation_active: boolean;
}

/** Default fail-closed para callers que no pueden construir headers. */
export const FAIL_CLOSED_HEADER_CONTEXT: RequestHeaderContext = {
  phase2_unlocked: false,
  phase2_isolation_active: true,
};

function readBoolDefaultTrue(name: string): boolean {
  const raw = (Deno.env.get(name) ?? "").trim().toLowerCase();
  if (raw === "") return true; // default ON: el aislamiento está activo
  return !(raw === "false" || raw === "0" || raw === "off" || raw === "no");
}

export function buildHeaderContext(
  headers: Headers | null | undefined,
): RequestHeaderContext {
  const isolationActive = readBoolDefaultTrue(PHASE2_STAGING_ONLY_ENV);

  // Modo "abierto" futuro: PHASE2_STAGING_ONLY=false → no se exige header.
  if (!isolationActive) {
    return { phase2_unlocked: true, phase2_isolation_active: false };
  }

  const expected = (Deno.env.get(PHASE2_HEADER_TOKEN_ENV) ?? "").trim();
  // Fail-closed: sin token Secret no hay forma de desbloquear.
  if (!expected) {
    return { phase2_unlocked: false, phase2_isolation_active: true };
  }

  const provided = headers?.get(PHASE2_ISOLATION_HEADER) ?? "";
  // Comparación byte-a-byte estricta. NO trim del provided.
  const unlocked = provided.length > 0 && provided === expected;
  return { phase2_unlocked: unlocked, phase2_isolation_active: true };
}