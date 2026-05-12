// Stress matrix report — aggregate summary of the latest (or specified) run.
// GET /stress-matrix-report?run_id=<uuid>  (optional; defaults to latest)
// Admin-only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function isCallerAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return false;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  return !!data;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!(await isCallerAdmin(req.headers.get("authorization")))) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const runIdParam = url.searchParams.get("run_id");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let runId = runIdParam;
  if (!runId) {
    const { data } = await admin.from("stress_runs").select("id").order("started_at", { ascending: false }).limit(1).maybeSingle();
    runId = data?.id ?? null;
  }
  if (!runId) {
    return new Response(JSON.stringify({ error: "no runs found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: run } = await admin.from("stress_runs").select("*").eq("id", runId).single();
  const { data: results } = await admin.from("stress_results").select("*").eq("run_id", runId);
  const rows = results ?? [];

  // Heatmap: by scope × model.
  const heatmap: Record<string, Record<string, { pass: number; fail: number; error: number }>> = {};
  const byFamily: Record<string, { pass: number; fail: number; error: number }> = {};
  const byModel: Record<string, { pass: number; fail: number; error: number }> = {};
  const failedCases: Array<{ case_id: string; scope: string; model: string | null; failed: any[] }> = [];

  for (const r of rows) {
    const model = (r.model_filter as string | null) ?? "multi";
    heatmap[r.scope] ??= {};
    heatmap[r.scope][model] ??= { pass: 0, fail: 0, error: 0 };
    byFamily[r.family] ??= { pass: 0, fail: 0, error: 0 };
    byModel[model] ??= { pass: 0, fail: 0, error: 0 };
    const bucket = r.status === "pass" ? "pass" : r.status === "fail" ? "fail" : r.status === "error" ? "error" : null;
    if (bucket) {
      heatmap[r.scope][model][bucket]++;
      byFamily[r.family][bucket]++;
      byModel[model][bucket]++;
    }
    if (r.status === "fail") {
      failedCases.push({
        case_id: r.case_id,
        scope: r.scope,
        model,
        failed: (r.asserts_failed as any[]) ?? [],
      });
    }
  }

  return new Response(JSON.stringify({
    run, totals: { byFamily, byModel }, heatmap, failedCases,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});