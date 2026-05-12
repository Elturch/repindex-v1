// Stress matrix runner — invokes chat-intelligence-v2 across the SDD matrix,
// captures markdown + metadata via SSE, applies deterministic asserts, and
// persists results to stress_runs / stress_results.
//
// Auth: requires admin JWT to start a run. The runner itself uses the
// service-role key internally to call chat-intelligence-v2 and write rows.
//
// Concurrency: 3 in-flight cases. Background execution via EdgeRuntime.waitUntil.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runAsserts, type StressCase } from "./asserts.ts";
import { expandCases } from "./spec.ts";
import { validateScopeIntegrity } from "./scopeIntegrityValidator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type RunBody = {
  family?: "all" | "small" | "sanity" | "hotels-reits" | "phase1-small" | "phase1-full" | "phase2-tiny" | "phase2-exec" | "phase2-full";
  limit?: number;
};

async function isCallerAdmin(authHeader: string | null): Promise<{ ok: boolean; uid: string | null }> {
  if (!authHeader) return { ok: false, uid: null };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const uid = userData?.user?.id ?? null;
  if (!uid) return { ok: false, uid: null };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  return { ok: !!roleRow, uid };
}

const AGENT_TIMEOUT_MS = 180_000; // 3 min max per case
const SSE_INACTIVITY_MS = 60_000;  // 60s without data = hung stream

async function invokeAgent(
  caseSpec: StressCase,
  sessionId: string,
): Promise<{ markdown: string; meta: Record<string, unknown> | null; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  const url = `${SUPABASE_URL}/functions/v1/chat-intelligence-v2`;
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
      },
      body: JSON.stringify({
        question: caseSpec.query,
        session_id: sessionId,
        conversation_history: [],
        previousContext: null,
        isFollowup: false,
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof DOMException && e.name === "AbortError"
      ? `fetch timeout after ${AGENT_TIMEOUT_MS}ms`
      : `fetch failed: ${e}`;
    return { markdown: "", meta: null, latency_ms: Date.now() - t0, error: msg };
  }
  clearTimeout(timeoutId);
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    return { markdown: "", meta: null, latency_ms: Date.now() - t0, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
  }
  // Consume SSE: accumulate chunk.text frames, capture done.metadata.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let markdown = "";
  let meta: Record<string, unknown> | null = null;
  let lastDataAt = Date.now();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        lastDataAt = Date.now();
      } else if (Date.now() - lastDataAt > SSE_INACTIVITY_MS) {
        return { markdown, meta, latency_ms: Date.now() - t0, error: `SSE inactivity timeout (>${SSE_INACTIVITY_MS}ms)` };
      }
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!frame.startsWith("data:")) continue;
        const payload = frame.replace(/^data:\s*/, "").trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          if (obj?.type === "chunk" && typeof obj.text === "string") {
            markdown += obj.text;
          } else if (obj?.type === "done" && obj.metadata) {
            meta = obj.metadata as Record<string, unknown>;
          } else if (obj?.metadata === true) {
            // intermediate metadata frame (reportContext) — keep as fallback
            if (!meta) meta = obj as Record<string, unknown>;
          } else if (obj?.type === "error") {
            return { markdown, meta, latency_ms: Date.now() - t0, error: String(obj.error || "stream error") };
          }
        } catch { /* ignore parse errors */ }
      }
      // Also guard against inactivity between frames.
      if (Date.now() - lastDataAt > SSE_INACTIVITY_MS) {
        return { markdown, meta, latency_ms: Date.now() - t0, error: `SSE inactivity timeout (>${SSE_INACTIVITY_MS}ms)` };
      }
    }
  } catch (e) {
    return { markdown, meta, latency_ms: Date.now() - t0, error: `SSE read error: ${e}` };
  }
  return { markdown, meta, latency_ms: Date.now() - t0 };
}

async function processCase(
  admin: ReturnType<typeof createClient>,
  resultId: string,
  caseSpec: StressCase,
): Promise<"pass" | "fail" | "error"> {
  // Use a stable session id so we can fetch the persisted audit afterwards.
  const sessionId = `stress-${caseSpec.case_id}-${Date.now()}`;
  const out = await invokeAgent(caseSpec, sessionId);
  if (out.error || !out.markdown) {
    await admin.from("stress_results").update({
      status: "error",
      error_message: out.error ?? "empty markdown",
      latency_ms: out.latency_ms,
      response_meta: out.meta as any,
    }).eq("id", resultId);
    return "error";
  }
  // Fase 1 — pull persisted scope audit from chat_logs by session_id.
  // (Movido ANTES de runAsserts para que A9 reescrito en Fase 2 pueda
  // leer coverage_report.submetrics_coverage cuando el flag esté ON.)
  const { data: logRow } = await admin
    .from("chat_logs")
    .select("scope_contract,coverage_report,scope_audit")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const scope_contract = (logRow as any)?.scope_contract ?? null;
  const coverage_report = (logRow as any)?.coverage_report ?? null;
  const scope_audit = (logRow as any)?.scope_audit ?? null;

  const legacyChecks = runAsserts({
    caseSpec,
    markdown: out.markdown,
    meta: out.meta,
    coverage_report,
  });
  const passedLegacy = legacyChecks.filter((c) => c.ok).map((c) => c.id);
  const failedLegacy = legacyChecks.filter((c) => !c.ok).map((c) => ({ id: c.id, msg: c.msg }));

  // Fase 1 — SQL bit-by-bit validator (N=5 random rows).
  let scope_validation: any = null;
  if (scope_contract) {
    try {
      scope_validation = await validateScopeIntegrity(admin, scope_contract);
    } catch (e) {
      scope_validation = { ok: false, sampled: 0, rechecked: 0, diffs: [], reason: `validator threw: ${(e as Error).message}` };
    }
  } else {
    scope_validation = { ok: false, sampled: 0, rechecked: 0, diffs: [], reason: "scope_contract no persistido (chat_logs vacio para session)" };
  }

  // Fase 1 — derive cell status from S1..S5 + SQL_DIFF (gating).
  const sResults = Array.isArray(scope_audit?.results) ? scope_audit.results : [];
  const sFailed = sResults.filter((r: any) => r && r.ok === false).map((r: any) => ({ id: r.id, msg: r.msg }));
  const sqlOk = !!scope_validation?.ok;
  const phase1Pass = sResults.length > 0 && sFailed.length === 0 && sqlOk;

  // Fase 2 — Eje B. Para families con prefijo `phase2-`, promovemos los
  // asserts B*/C* (cuando estén disponibles) al gating compuesto. Hoy
  // sólo B1_tiny_universe_clean. Si phase1Pass=false, no hace falta
  // evaluar los phase2 — la celda ya falla por gating Fase 1.
  let phase2Fails: Array<{ id: string; msg?: string }> = [];
  const isPhase2 = caseSpec.family.startsWith("phase2-");
  if (isPhase2) {
    const b1 = legacyChecks.find((c) => c.id === "B1_tiny_universe_clean");
    if (b1 && !b1.ok) phase2Fails.push({ id: b1.id, msg: b1.msg });
    // Fase 2 — Eje C. Promover C1/C2 al gating compuesto sólo para
    // families con prefijo `phase2-`. Si EXEC_NARRATIVE está OFF en el
    // entorno de la edge function, meta.exec_narrative no existe → C1
    // y C2 pasan por defecto (regresión cero).
    const c1 = legacyChecks.find((c) => c.id === "C1_exec_narrative_structure");
    if (c1 && !c1.ok) phase2Fails.push({ id: c1.id, msg: c1.msg });
    const c2 = legacyChecks.find((c) => c.id === "C2_exec_narrative_traceability");
    if (c2 && !c2.ok) phase2Fails.push({ id: c2.id, msg: c2.msg });
  }
  const status: "pass" | "fail" =
    phase1Pass && phase2Fails.length === 0 ? "pass" : "fail";

  // ── Reclasificación oficial Fase 1 (post phase1-small 8/8 verde) ─────────
  // ── CIERRE FASE 1 (2026-05-12 21:19) ─────────────────────────────────────
  // FASE 1 CERRADA: S1–S5 + SQL_DIFF al 100% en 29/29 celdas combinadas
  //   - phase1-small  (2026-05-12 21:07): 8/8 pass
  //   - phase1-full   (2026-05-12 21:19): 21/21 pass
  // Histórico hotels-reits (misma matriz, pre-blindaje): 0/21 → 0/21 → 6/21
  // → 21/21 tras aplicar ScopeContract + runScopedQuery + auditScope S1..S5
  // + validador SQL bit a bit + congelación de inyectores cosméticos.
  // USE_SCOPED_SKILLS permanece OFF en producción (modo sombra).
  // FREEZE_COSMETIC_INJECTORS permanece ON (default Fase 1).
  // ─────────────────────────────────────────────────────────────────────────
  // GATING (gobiernan VERDE/ROJO global del cierre Fase 1):
  //   - S1 tickers_in_scope, S2 models_in_scope, S3 dates_in_window,
  //     S4 no_peer_leak, S5 coverage_report_consistent
  //   - SQL_DIFF (validador SQL bit a bit, 10 campos × N=5 muestras)
  // OBSERVABILIDAD (NO bloquean Fase 1, reclasificados como objetivo Fase 2):
  //   - Legacy A1..A10 (narrativa, bibliografía, sub-métricas, anti-mediana...)
  //   - Esperado que A9 / A3 fallen tras congelar inyectores cosméticos
  //     (frase MEL, 8 métricas forzadas, bibliografía determinista).
  // El UI los pinta en columnas separadas (StressTestsPanel.tsx).
  const failedComposite = [
    ...sFailed.map((f: any) => ({ id: f.id, msg: f.msg })),
    ...(!sqlOk
      ? [{ id: "SQL_DIFF", msg: scope_validation?.reason ?? `${scope_validation?.diffs?.length ?? 0} divergencias` }]
      : []),
    ...phase2Fails,
    ...failedLegacy.map((f) => ({ id: `L:${f.id}`, msg: f.msg })),
  ];
  const passedComposite = [
    ...sResults.filter((r: any) => r.ok).map((r: any) => r.id),
    ...(sqlOk ? ["SQL_DIFF"] : []),
    ...(isPhase2
      ? legacyChecks
          .filter((c) => /^([BC]\d+_)/.test(c.id) && c.ok)
          .map((c) => c.id)
      : []),
    ...passedLegacy.map((id) => `L:${id}`),
  ];

  const actualSkill =
    (out.meta as any)?.questionCategory ??
    (out.meta as any)?.responseType ??
    null;
  await admin.from("stress_results").update({
    status,
    asserts_passed: passedComposite,
    asserts_failed: failedComposite,
    response_markdown: out.markdown.slice(0, 200_000),
    response_meta: out.meta as any,
    actual_skill: actualSkill,
    latency_ms: out.latency_ms,
    scope_contract,
    coverage_report,
    scope_audit,
    scope_validation,
  }).eq("id", resultId);
  return status;
}

async function runMatrix(
  runId: string,
  family: "all" | "small" | "sanity" | "hotels-reits" | "phase1-small" | "phase1-full" | "phase2-tiny" | "phase2-exec" | "phase2-full",
  limit?: number,
) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let cases = expandCases(family);
  if (limit && limit > 0) cases = cases.slice(0, limit);

  // Insert all pending result rows up-front so the UI can show progress.
  const rows = cases.map((c) => ({
    run_id: runId,
    case_id: c.case_id,
    family: c.family,
    query: c.query,
    model_filter: c.model_filter,
    weeks: c.weeks,
    scope: c.scope,
    expected_skill: c.expected_skill,
    status: "pending",
  }));
  const { data: inserted, error: insErr } = await admin.from("stress_results").insert(rows).select("id, case_id");
  if (insErr) {
    console.error("[stress-runner] insert pending failed:", insErr);
    await admin.from("stress_runs").update({
      status: "error",
      finished_at: new Date().toISOString(),
      notes: `insert pending failed: ${insErr.message}`,
    }).eq("id", runId);
    return;
  }
  await admin.from("stress_runs").update({ total_cases: cases.length }).eq("id", runId);

  const idByCaseId = new Map<string, string>();
  for (const r of inserted ?? []) idByCaseId.set(r.case_id, r.id);

  // Concurrency 3.
  const queue = [...cases];
  let pass = 0, fail = 0, err = 0;
  const worker = async () => {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) break;
      const rid = idByCaseId.get(c.case_id);
      if (!rid) continue;
      try {
        const status = await processCase(admin, rid, c);
        if (status === "pass") pass++;
        else if (status === "fail") fail++;
        else err++;
      } catch (e) {
        err++;
        console.error("[stress-runner] case crashed:", c.case_id, e);
        await admin.from("stress_results").update({
          status: "error",
          error_message: String(e).slice(0, 500),
        }).eq("id", rid);
      }
      // Update aggregate counters live.
      await admin.from("stress_runs").update({
        passed: pass, failed: fail, errored: err,
      }).eq("id", runId);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  await admin.from("stress_runs").update({
    status: "completed",
    finished_at: new Date().toISOString(),
    passed: pass, failed: fail, errored: err,
  }).eq("id", runId);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("authorization");
  const { ok: isAdmin, uid } = await isCallerAdmin(auth);
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden: admin required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as RunBody;
  const family = (body.family ?? "hotels-reits") as
    "all" | "small" | "sanity" | "hotels-reits" | "phase1-small" | "phase1-full" | "phase2-tiny" | "phase2-exec" | "phase2-full";
  const limit = body.limit;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const cases = expandCases(family);
  const limited = limit ? cases.slice(0, limit) : cases;
  const { data: runRow, error: runErr } = await admin.from("stress_runs").insert({
    family,
    spec_version: "v1",
    total_cases: limited.length,
    triggered_by: uid,
    status: "running",
    notes: `concurrency=3 weeks=4 cases=${limited.length}`,
  }).select("id").single();
  if (runErr || !runRow) {
    return new Response(JSON.stringify({ error: runErr?.message ?? "insert run failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id as string;

  // Background execution.
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) {
    er.waitUntil(runMatrix(runId, family, limit));
  } else {
    // Fallback: fire and forget.
    runMatrix(runId, family, limit).catch((e) => console.error("[stress-runner] bg crash:", e));
  }

  return new Response(JSON.stringify({
    ok: true, run_id: runId, family, total_cases: limited.length,
  }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});