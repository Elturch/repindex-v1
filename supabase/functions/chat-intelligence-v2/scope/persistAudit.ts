// chat-intelligence-v2 / scope / persistAudit.ts
// Fase 1 — Persiste los 3 jsonb (scope_contract, coverage_report, scope_audit)
// en `chat_logs` para CADA ejecucion del agente, con o sin USE_SCOPED_SKILLS.
// Fire-and-forget: NUNCA debe romper el SSE ni la respuesta al usuario.

import type { ScopeContract } from "./scopeContract.ts";
import type { CoverageReport } from "../data/scopedQuery.ts";
import type { ScopeAuditReport } from "../guards/scopeAudit.ts";

export interface PersistAuditInput {
  supabase: any;
  user_id?: string | null;
  session_id?: string | null;
  question: string;
  intent?: string | null;
  ticker?: string | null;
  models_used?: string[] | null;
  duration_ms?: number | null;
  /** 'report' cuando todo OK; 'error' cuando hubo ScopeResolutionError /
   *  ScopeAuditFailed / ScopedQueryError. Constraint en DB acepta solo
   *  ['guard_rejection','report','error']. */
  response_type: "report" | "error";
  error_message?: string | null;
  scope_contract?: ScopeContract | null;
  coverage_report?: CoverageReport | null;
  scope_audit?: ScopeAuditReport | null;
  flags?: Record<string, boolean> | null;
}

function safeJson(x: unknown): unknown {
  if (x === null || x === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(x));
  } catch (_) {
    return null;
  }
}

export async function persistChatLogAudit(input: PersistAuditInput): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      user_id: input.user_id ?? null,
      session_id: input.session_id ?? null,
      question: String(input.question ?? "").slice(0, 4000),
      response_type: input.response_type,
      intent: input.intent ?? null,
      ticker: input.ticker ?? null,
      models_used: Array.isArray(input.models_used) ? input.models_used.slice(0, 12) : null,
      duration_ms: typeof input.duration_ms === "number" ? input.duration_ms : null,
      error_message: input.error_message ? String(input.error_message).slice(0, 1000) : null,
      scope_contract: safeJson(input.scope_contract ?? null),
      coverage_report: safeJson(input.coverage_report ?? null),
      scope_audit: input.scope_audit
        ? safeJson({ ...input.scope_audit, flags: input.flags ?? {} })
        : (input.flags ? safeJson({ flags: input.flags, ok: null, results: [] }) : null),
    };
    const { error } = await input.supabase.from("chat_logs").insert(row);
    if (error) {
      console.warn("[scope/persistAudit] insert chat_logs failed:", error.message);
    }
  } catch (e) {
    console.warn("[scope/persistAudit] threw (non-fatal):", (e as Error).message);
  }
}