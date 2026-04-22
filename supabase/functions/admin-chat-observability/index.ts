// Phase 5 — Observabilidad. Devuelve métricas agregadas de chat_logs para el
// dashboard de admin. Solo accesible para usuarios con rol 'admin'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    // Verify admin via JWT
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRows } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const period = url.searchParams.get("period") ?? "7d";
    const hours = period === "24h" ? 24 : period === "7d" ? 24 * 7 : 24 * 30;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: logs, error } = await admin
      .from("chat_logs")
      .select("response_type, guard_type, duration_ms, models_used, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const total = logs?.length ?? 0;
    const guardLogs = (logs ?? []).filter((l) => l.response_type === "guard_rejection");
    const reportLogs = (logs ?? []).filter((l) => l.response_type === "report");
    const errorLogs = (logs ?? []).filter((l) => l.response_type === "error");

    const guardRatio = total > 0 ? guardLogs.length / total : 0;
    const guardBreakdown: Record<string, number> = {};
    for (const g of guardLogs) {
      const k = g.guard_type ?? "unknown";
      guardBreakdown[k] = (guardBreakdown[k] ?? 0) + 1;
    }

    const durations = reportLogs
      .map((l) => l.duration_ms)
      .filter((d): d is number => typeof d === "number" && d > 0)
      .sort((a, b) => a - b);
    const avgMs = durations.length > 0
      ? Math.round(durations.reduce((s, x) => s + x, 0) / durations.length)
      : 0;
    const p50 = percentile(durations, 0.5);
    const p95 = percentile(durations, 0.95);

    // Model usage frequency
    const modelFreq: Record<string, number> = {};
    for (const l of reportLogs) {
      for (const m of l.models_used ?? []) {
        modelFreq[m] = (modelFreq[m] ?? 0) + 1;
      }
    }

    // Active alerts (last 24h)
    const alertSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: alerts } = await admin
      .from("chat_guard_alerts")
      .select("window_start, window_end, total_queries, guard_queries, guard_ratio, dominant_guard_type, created_at")
      .gte("created_at", alertSince)
      .order("created_at", { ascending: false })
      .limit(20);

    return new Response(
      JSON.stringify({
        period,
        since,
        summary: {
          total,
          reports: reportLogs.length,
          guard_rejections: guardLogs.length,
          errors: errorLogs.length,
          guard_ratio: Number(guardRatio.toFixed(3)),
          avg_duration_ms: avgMs,
          p50_duration_ms: p50,
          p95_duration_ms: p95,
        },
        guard_breakdown: guardBreakdown,
        model_usage: modelFreq,
        recent_alerts: alerts ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[admin-chat-observability] fatal", e);
    return new Response(
      JSON.stringify({ error: "fatal", detail: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});