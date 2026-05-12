// chat-intelligence-v2 / guards / scopeAudit.ts
// Fase 1 — Auditoria scope-vs-output (S1..S5).
// Se ejecuta ANTES de inyectar datos en el prompt. Si cualquier assert
// falla, el pipeline aborta y NUNCA se llama al LLM.

import type { ScopeContract } from "../scope/scopeContract.ts";
import type { CoverageReport } from "../data/scopedQuery.ts";

export type ScopeAssertId = "S1" | "S2" | "S3" | "S4" | "S5";

export interface ScopeAssertResult {
  id: ScopeAssertId;
  ok: boolean;
  msg?: string;
  offenders?: unknown;
}

export interface ScopeAuditReport {
  ok: boolean;
  results: ScopeAssertResult[];
}

function isoDay(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

/**
 * Audita el dataset entregado por scopedQuery contra el ScopeContract.
 * S1..S5 segun spec. Si supabase se proporciona, S4 cruza contra
 * v_issuer_scope para detectar peer-leak.
 */
export async function auditScope(
  scope: ScopeContract,
  rows: any[],
  coverage: CoverageReport,
  supabase?: any,
): Promise<ScopeAuditReport> {
  const results: ScopeAssertResult[] = [];

  // S1 — todos los tickers del dataset estan en scope.tickers.
  {
    const allowed = new Set(scope.tickers as string[]);
    const offenders: string[] = [];
    for (const r of rows) {
      const t = String((r as any)["05_ticker"] ?? "").toUpperCase();
      if (t && !allowed.has(t)) offenders.push(t);
    }
    const ok = offenders.length === 0;
    results.push({
      id: "S1",
      ok,
      msg: ok ? undefined : `Tickers fuera de scope: ${Array.from(new Set(offenders)).slice(0, 8).join(", ")}`,
      offenders: ok ? undefined : Array.from(new Set(offenders)),
    });
  }

  // S2 — todos los modelos del dataset estan en scope.models.
  {
    const allowed = new Set(scope.models as string[]);
    const offenders: string[] = [];
    for (const r of rows) {
      const m = String((r as any)["02_model_name"] ?? "");
      if (m && !allowed.has(m)) offenders.push(m);
    }
    const ok = offenders.length === 0;
    results.push({
      id: "S2",
      ok,
      msg: ok ? undefined : `Modelos fuera de scope: ${Array.from(new Set(offenders)).join(", ")}`,
      offenders: ok ? undefined : Array.from(new Set(offenders)),
    });
  }

  // S3 — todas las fechas dentro de scope.window.
  {
    const offenders: string[] = [];
    for (const r of rows) {
      const w = (r as any).batch_execution_date;
      if (!w) continue;
      const d = isoDay(w);
      if (d < scope.window.from || d > scope.window.to) offenders.push(d);
    }
    const ok = offenders.length === 0;
    results.push({
      id: "S3",
      ok,
      msg: ok ? undefined : `Fechas fuera de ventana: ${Array.from(new Set(offenders)).slice(0, 5).join(", ")}`,
      offenders: ok ? undefined : Array.from(new Set(offenders)),
    });
  }

  // S4 — anti peer-leak: ningun ticker fuera del subsector/sector declarado.
  // Solo se evalua si el scope declara subsector o sector y supabase esta
  // disponible. Cruza contra v_issuer_scope.
  {
    let ok = true;
    let msg: string | undefined;
    let offenders: string[] | undefined;
    if (supabase && (scope.subsector || scope.sector)) {
      try {
        let q = supabase.from("v_issuer_scope").select("ticker");
        if (scope.subsector) q = q.ilike("subsector", scope.subsector);
        else if (scope.sector) q = q.eq("sector_category", scope.sector);
        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          const allowed = new Set(data.map((r: any) => String(r.ticker).toUpperCase()));
          const off = (scope.tickers as string[]).filter((t) => !allowed.has(t));
          if (off.length > 0) {
            ok = false;
            offenders = off;
            msg = `Tickers ajenos al ${scope.subsector ? "subsector" : "sector"} declarado: ${off.join(", ")}`;
          }
        }
      } catch (e) {
        // No bloqueamos por fallo de S4 si v_issuer_scope cae; lo registramos.
        ok = false;
        msg = `S4 inaplicable (error consultando v_issuer_scope): ${(e as Error).message}`;
      }
    }
    results.push({ id: "S4", ok, msg, offenders });
  }

  // S5 — coverage_report presente y consistente con scope.
  {
    const ok = !!coverage
      && Array.isArray(coverage.tickers_requested)
      && Array.isArray(coverage.models_requested)
      && Array.isArray(coverage.weeks_requested)
      && setsEqual(coverage.tickers_requested, scope.tickers as string[])
      && setsEqual(coverage.models_requested, scope.models as string[]);
    results.push({
      id: "S5",
      ok,
      msg: ok ? undefined : "coverage_report ausente o inconsistente con el scope",
    });
  }

  const reportOk = results.every((r) => r.ok);
  return { ok: reportOk, results };
}

function setsEqual(a: string[], b: ReadonlyArray<string>): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

export class ScopeAuditFailed extends Error {
  report: ScopeAuditReport;
  constructor(report: ScopeAuditReport) {
    super("Scope audit failed: " + report.results.filter((r) => !r.ok).map((r) => `${r.id}=${r.msg ?? "fail"}`).join(" | "));
    this.name = "ScopeAuditFailed";
    this.report = report;
  }
}
