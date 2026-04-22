// Phase 5 — Observabilidad. Inserta una fila en chat_logs por cada consulta del
// chat y, ad-hoc, escribe una alerta en chat_guard_alerts si en la última hora
// más del 50% de las consultas han sido rechazadas por un guard.
// Diseño: fire-and-forget desde el frontend. Nunca bloquea al usuario.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type LogPayload = {
  user_id?: string | null;
  session_id?: string | null;
  question: string;
  response_type: "guard_rejection" | "report" | "error";
  guard_type?: string | null;
  guard_reason?: string | null;
  duration_ms?: number | null;
  models_used?: string[] | null;
  intent?: string | null;
  ticker?: string | null;
  error_message?: string | null;
};

function isValidPayload(p: any): p is LogPayload {
  return (
    p &&
    typeof p.question === "string" &&
    p.question.length > 0 &&
    typeof p.response_type === "string" &&
    ["guard_rejection", "report", "error"].includes(p.response_type)
  );
}

// Soft-check: in the last hour, if guard ratio >50% (and total >= 5) write an alert.
async function maybeRaiseGuardAlert(client: ReturnType<typeof createClient>) {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await client
      .from("chat_logs")
      .select("response_type, guard_type")
      .gte("created_at", since);
    if (error || !data) return;
    const total = data.length;
    if (total < 5) return;
    const guards = data.filter((r) => r.response_type === "guard_rejection");
    const ratio = guards.length / total;
    if (ratio <= 0.5) return;

    // Avoid duplicate alerts in the same window: skip if one was raised in the last 30 min.
    const recentSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count } = await client
      .from("chat_guard_alerts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", recentSince);
    if ((count ?? 0) > 0) return;

    // Dominant guard type
    const counter: Record<string, number> = {};
    for (const g of guards) {
      const k = g.guard_type ?? "unknown";
      counter[k] = (counter[k] ?? 0) + 1;
    }
    const dominant =
      Object.entries(counter).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    await client.from("chat_guard_alerts").insert({
      window_start: since,
      window_end: new Date().toISOString(),
      total_queries: total,
      guard_queries: guards.length,
      guard_ratio: Number(ratio.toFixed(3)),
      dominant_guard_type: dominant,
    });
    console.warn(
      `[log-chat-query] guard alert raised: ${guards.length}/${total} (${(ratio * 100).toFixed(1)}%) dominant=${dominant}`,
    );
  } catch (e) {
    console.error("[log-chat-query] maybeRaiseGuardAlert error", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => null);
    if (!isValidPayload(body)) {
      return new Response(
        JSON.stringify({ error: "invalid_payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const row = {
      user_id: body.user_id ?? null,
      session_id: body.session_id ?? null,
      question: body.question.slice(0, 4000),
      response_type: body.response_type,
      guard_type: body.guard_type ?? null,
      guard_reason: body.guard_reason?.slice(0, 500) ?? null,
      duration_ms: typeof body.duration_ms === "number" ? body.duration_ms : null,
      models_used: Array.isArray(body.models_used) ? body.models_used.slice(0, 12) : null,
      intent: body.intent ?? null,
      ticker: body.ticker ?? null,
      error_message: body.error_message?.slice(0, 1000) ?? null,
    };

    const { error } = await client.from("chat_logs").insert(row);
    if (error) {
      console.error("[log-chat-query] insert error", error);
      return new Response(
        JSON.stringify({ error: "insert_failed", detail: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fire-and-forget alert check (do not await: keep response fast).
    maybeRaiseGuardAlert(client);

    // Soft rate warning: count this user's last hour.
    let rateWarning = false;
    if (body.user_id) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await client
        .from("chat_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", body.user_id)
        .gte("created_at", since);
      rateWarning = (count ?? 0) >= 20;
    }

    return new Response(
      JSON.stringify({ ok: true, rateWarning }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[log-chat-query] fatal", e);
    return new Response(
      JSON.stringify({ error: "fatal", detail: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});