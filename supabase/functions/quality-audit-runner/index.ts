import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ── Embedded query catalog (mirrors specs/quality-audit-queries.md) ──────
const CATALOG: QueryDef[] = [
  { id: "S1", family: "snapshot", question: "¿Cómo está la reputación de Iberdrola esta semana?", expects: { must_mention: ["Iberdrola"], must_not_match: ["mediana"] } },
  { id: "S2", family: "snapshot", question: "Dame el RIX actual de Inditex con detalle por IA", expects: { must_mention: ["Inditex"] } },
  { id: "S3", family: "snapshot", question: "Reputación algorítmica de Banco Santander hoy", expects: { must_mention: ["Santander"] } },
  { id: "S4", family: "snapshot", question: "Estado actual de Telefónica en percepción IA", expects: { must_mention: ["Telefónica"] } },
  { id: "P1", family: "period", question: "Balance de Ferrovial del primer trimestre de 2026", expects: { must_mention: ["Ferrovial"], must_not_match: ["esta semana", "mediana"] } },
  { id: "P2", family: "period", question: "Evolución de Repsol en el último mes", expects: { must_mention: ["Repsol"] } },
  { id: "P3", family: "period", question: "Cómo ha cambiado la reputación de BBVA en los últimos 30 días", expects: { must_mention: ["BBVA"] } },
  { id: "P4", family: "period", question: "Tendencia de Aena durante febrero y marzo", expects: { must_mention: ["Aena"] } },
  { id: "R1", family: "ranking", question: "Top 10 del IBEX-35 por RIX esta semana", expects: { must_mention: ["IBEX"] } },
  { id: "R2", family: "ranking", question: "Ranking del sector energía", expects: { must_mention: ["energ"] } },
  { id: "R3", family: "ranking", question: "Quiénes son las 5 peores del IBEX en consenso IA", expects: { must_mention: ["IBEX"] } },
  { id: "R4", family: "ranking", question: "Comparativa de los bancos del IBEX", expects: { must_mention: ["banco"] } },
  { id: "C1", family: "comparison", question: "Compara Iberdrola con Endesa", expects: { must_mention: ["Iberdrola", "Endesa"] } },
  { id: "C2", family: "comparison", question: "BBVA vs Santander en reputación algorítmica", expects: { must_mention: ["BBVA", "Santander"] } },
  { id: "C3", family: "comparison", question: "Compara Inditex con sus competidores verificados", expects: { must_mention: ["Inditex"] } },
  { id: "C4", family: "comparison", question: "Telefónica frente a sus competidores", expects: { must_mention: ["Telefónica"] } },
  { id: "D1", family: "divergence", question: "Dónde discrepan más los modelos sobre Repsol", expects: { must_mention: ["Repsol"] } },
  { id: "D2", family: "divergence", question: "Consenso entre IAs sobre Iberdrola esta semana", expects: { must_mention: ["Iberdrola"] } },
  { id: "D3", family: "divergence", question: "Qué IA es más crítica con Inditex", expects: { must_mention: ["Inditex"] } },
  { id: "D4", family: "divergence", question: "Divergencias por métrica en BBVA en el primer trimestre", expects: { must_mention: ["BBVA"] } },
  { id: "E1", family: "edge", question: "Qué tiempo hace mañana", expects: { must_mention: [] } },
  { id: "E2", family: "edge", question: "Reputación de Telefónica Germany", expects: { must_mention: ["España"] } },
  { id: "E3", family: "edge", question: "REP esta semana", expects: { must_mention: ["Repsol"] } },
  { id: "E4", family: "edge", question: "Balance del top 5 del ibex en el primer semestre", expects: { must_mention: [] } },
];

interface QueryDef {
  id: string;
  family: string;
  question: string;
  expects: {
    must_mention?: string[];
    must_not_match?: string[];
  };
}

const MODEL_NAMES = ["ChatGPT", "Perplexity", "Gemini", "DeepSeek", "Grok", "Qwen"];
const RIX_AGENT_URL = `${SUPABASE_URL}/functions/v1/chat-intelligence-v2`;

function runAutoChecks(output: string, datapack: any, latencyMs: number, expects: QueryDef["expects"]) {
  const text = (output || "").toString();
  const lower = text.toLowerCase();
  const checks: Record<string, { pass: boolean; detail?: string }> = {};

  checks.forbidden_mediana = { pass: !/\bmediana\b/i.test(text) };
  checks.forbidden_internal_jargon = { pass: !/F[0-9]_|skill[A-Z]/.test(text) };
  checks.forbidden_knowledge_cutoff = {
    pass: !/según mi conocimiento|i (don't|do not) have/i.test(text),
  };

  const modelsFound = MODEL_NAMES.filter((m) => text.includes(m));
  checks.mentions_models = {
    pass: modelsFound.length >= 4,
    detail: `${modelsFound.length}/6: ${modelsFound.join(",")}`,
  };

  if (expects.must_mention?.length) {
    const missing = expects.must_mention.filter((t) => !lower.includes(t.toLowerCase()));
    checks.must_mention_terms = {
      pass: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(",")}` : "ok",
    };
  }
  if (expects.must_not_match?.length) {
    const hits = expects.must_not_match.filter((t) => lower.includes(t.toLowerCase()));
    checks.must_not_match = {
      pass: hits.length === 0,
      detail: hits.length ? `unexpected: ${hits.join(",")}` : "ok",
    };
  }

  checks.latency_ok = { pass: latencyMs < 90_000, detail: `${latencyMs}ms` };

  const coverage = datapack?.models_coverage?.with_data?.length;
  if (typeof coverage === "number") {
    checks.models_coverage_complete = {
      pass: coverage === 6,
      detail: `${coverage}/6`,
    };
  }

  return checks;
}

async function callRixAgent(question: string, signal: AbortSignal) {
  const t0 = Date.now();
  const resp = await fetch(RIX_AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      question,
      role: "general",
      stream: false,
      audit_mode: true,
    }),
    signal,
  });

  let output = "";
  let datapack: any = null;
  let metadata: any = null;

  if (!resp.ok) {
    const txt = await resp.text();
    return {
      output: "",
      datapack: null,
      metadata: null,
      latency_ms: Date.now() - t0,
      error: `HTTP ${resp.status}: ${txt.slice(0, 500)}`,
    };
  }

  const ctype = resp.headers.get("content-type") || "";

  if (ctype.includes("text/event-stream")) {
    // Parse SSE — concatenate deltas, capture final done frame
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") continue;
        try {
          const ev = JSON.parse(json);
          if (ev.type === "delta" && ev.content) output += ev.content;
          else if (ev.type === "done") {
            datapack = ev.datapack ?? ev.metadata?.datapack ?? null;
            metadata = ev.metadata ?? null;
            if (ev.content && !output) output = ev.content;
          } else if (ev.choices?.[0]?.delta?.content) {
            output += ev.choices[0].delta.content;
          }
        } catch { /* ignore partial */ }
      }
    }
  } else {
    const json = await resp.json();
    output = json.content || json.output || JSON.stringify(json);
    datapack = json.datapack ?? null;
    metadata = json.metadata ?? null;
  }

  return {
    output,
    datapack,
    metadata,
    latency_ms: Date.now() - t0,
    error: null as string | null,
  };
}

async function executeRun(runId: string, supa: any) {
  for (let i = 0; i < CATALOG.length; i++) {
    const q = CATALOG[i];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);

    let res;
    try {
      res = await callRixAgent(q.question, ctrl.signal);
    } catch (e) {
      res = {
        output: "",
        datapack: null,
        metadata: null,
        latency_ms: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    clearTimeout(timer);

    const checks = runAutoChecks(res.output, res.datapack, res.latency_ms, q.expects);

    await supa.from("audit_results").insert({
      run_id: runId,
      query_id: q.id,
      family: q.family,
      question: q.question,
      output: res.output,
      datapack: res.datapack,
      metadata: res.metadata,
      latency_ms: res.latency_ms,
      auto_checks: checks,
      error: res.error,
    });

    await supa
      .from("audit_runs")
      .update({
        completed_queries: i + 1,
        failed_queries: res.error ? 1 : 0,
      })
      .eq("id", runId);

    // throttle
    await new Promise((r) => setTimeout(r, 3000));
  }

  await supa
    .from("audit_runs")
    .update({ status: "completed", finished_at: new Date().toISOString() })
    .eq("id", runId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify caller is admin
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: isAdminData } = await admin.rpc("is_admin", { check_uid: user.id });
    if (!isAdminData) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "start";

    if (action === "catalog") {
      return new Response(JSON.stringify({ queries: CATALOG }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "start") {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const { data: run, error } = await admin
        .from("audit_runs")
        .insert({
          status: "running",
          total_queries: CATALOG.length,
          notes: body.notes ?? null,
          triggered_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Fire-and-forget background execution
      executeRun(run.id, admin).catch(async (e) => {
        console.error("[audit] run failed:", e);
        await admin
          .from("audit_runs")
          .update({ status: "failed", finished_at: new Date().toISOString(), notes: String(e) })
          .eq("id", run.id);
      });

      return new Response(JSON.stringify({ run_id: run.id, total: CATALOG.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[quality-audit-runner] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});