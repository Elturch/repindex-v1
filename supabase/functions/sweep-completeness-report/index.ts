import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let week = (body as Record<string, unknown>).week as string | undefined;
  if (!week) {
    const { data } = await supabase.from("rix_runs_v2").select("batch_execution_date").order("batch_execution_date", { ascending: false }).limit(1);
    week = String(data?.[0]?.batch_execution_date ?? "").slice(0, 10);
  }

  const { data: sum } = await supabase.rpc("rix_model_completeness", { p_week: week });
  const { data: cells } = await supabase.rpc("rix_incomplete_cells", { p_week: week });
  const remaining = (cells ?? []).length;
  const total = (sum ?? []).reduce((a: number, m: Record<string, unknown>) => a + Number(m.total), 0);
  const scored = (sum ?? []).reduce((a: number, m: Record<string, unknown>) => a + Number(m.scored), 0);

  try {
    await supabase.from("model_health_checks").insert({ provider: "_sweep", display_name: "COMPLETENESS", model_string: String(week), status: remaining === 0 ? "complete" : "incomplete", http_status: remaining });
  } catch (e) { console.error("[report] insert", e); }

  const rows = (sum ?? []).map((m: Record<string, unknown>) => {
    const gap = Number(m.total) - Number(m.scored);
    return `<tr><td>${gap === 0 ? "✅" : "⚠️"} ${esc(String(m.model_name))}</td><td>${m.scored}/${m.total}</td></tr>`;
  }).join("");
  let stuck = "";
  if (remaining > 0) {
    const list = (cells ?? []).slice(0, 60).map((c: Record<string, unknown>) => `${esc(String(c.ticker))}/${esc(String(c.model_name))}${c.has_bruto ? " (sin nota)" : " (sin busqueda)"}`).join(", ");
    stuck = `<p style="background:#fff3f3;border:1px solid #f0b0b0;padding:10px;border-radius:6px"><b>${remaining} celda(s) sin completar:</b><br>${list}</p>`;
  }
  const subject = remaining === 0
    ? `✅ RepIndex — barrido ${week} COMPLETO (${scored}/${total})`
    : `⚠️ RepIndex — barrido ${week} INCOMPLETO: faltan ${remaining} (${scored}/${total})`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#111"><h2>Completitud del barrido &middot; ${esc(String(week))}</h2>` +
    `<p><b>${scored}/${total}</b> celdas puntuadas (6 modelos × empresas).</p>${stuck}` +
    `<table cellpadding="6" border="1" style="border-collapse:collapse;font-size:14px"><tr><th>Modelo</th><th>Puntuadas</th></tr>${rows}</table></div>`;

  let emailed = false;
  try {
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const { error } = await resend.emails.send({ from: "RepIndex <no-reply@repindex.ai>", to: ["datos@hablamosde.com"], bcc: ["info@repindex.ai"], subject, html });
    emailed = !error;
    if (error) console.error("[report] resend", error);
  } catch (e) { console.error("[report] email", e); }

  return new Response(JSON.stringify({ week, total, scored, remaining, emailed }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
