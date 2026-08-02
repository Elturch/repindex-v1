import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

// model-health-canary · Prueba EN VIVO los 6 modelos del barrido con una mini-llamada
// real, para detectar deprecacion / clave muerta / timeout ANTES del barrido semanal.
// IMPORTANTE: los strings de modelo deben reflejar rix-search-v2 > getSearchModelConfigs().
// AMPLIADO: tras los 6 modelos, prueba tambien el pipeline report-analysis para detectar
// una regresion a la version antigua (markdown) en vez de la v23 con analysis_json estructurado.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Probe = {
  display: string; provider: string; keyEnv: string; endpoint: string; model: string;
  build: (k: string) => { url: string; headers: Record<string, string>; body: unknown };
};

const PROBES: Probe[] = [
  { display: "ChatGPT", provider: "openai", keyEnv: "OPENAI_API_KEY",
    endpoint: "https://api.openai.com/v1/responses", model: "gpt-4.1-mini",
    build: (k) => ({ url: "https://api.openai.com/v1/responses",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: { model: "gpt-4.1-mini", input: "Responde solo: OK", max_output_tokens: 16 } }) },
  { display: "Perplexity", provider: "perplexity", keyEnv: "PERPLEXITY_API_KEY",
    endpoint: "https://api.perplexity.ai/chat/completions", model: "sonar-pro",
    build: (k) => ({ url: "https://api.perplexity.ai/chat/completions",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: { model: "sonar-pro", messages: [{ role: "user", content: "Responde solo: OK" }], max_tokens: 16 } }) },
  { display: "Google Gemini", provider: "gemini", keyEnv: "GOOGLE_GEMINI_API_KEY",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", model: "gemini-2.5-pro",
    build: (k) => ({ url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${k}`,
      headers: { "Content-Type": "application/json" },
      body: { contents: [{ parts: [{ text: "Responde solo: OK" }] }], generationConfig: { maxOutputTokens: 16 } } }) },
  { display: "Deepseek", provider: "deepseek", keyEnv: "DEEPSEEK_API_KEY",
    endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash",
    build: (k) => ({ url: "https://api.deepseek.com/chat/completions",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: { model: "deepseek-v4-flash", messages: [{ role: "user", content: "Responde solo: OK" }], max_tokens: 16 } }) },
  { display: "Grok", provider: "xai", keyEnv: "XAI_API_KEY",
    endpoint: "https://api.x.ai/v1/responses", model: "grok-4-1-fast",
    build: (k) => ({ url: "https://api.x.ai/v1/responses",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: { model: "grok-4-1-fast", input: "Responde solo: OK", max_output_tokens: 16 } }) },
  { display: "Qwen", provider: "alibaba", keyEnv: "DASHSCOPE_API_KEY",
    endpoint: "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation", model: "qwen-max",
    build: (k) => ({ url: "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: { model: "qwen-max", input: { messages: [{ role: "user", content: "Responde solo: OK" }] }, parameters: { max_tokens: 16 } } }) },
];

function classify(http: number | null, body: string, timedOut: boolean, noKey: boolean): string {
  if (noKey) return "sin_clave";
  if (timedOut) return "timeout";
  if (http === null) return "error_red";
  if (http >= 200 && http < 300) return "ok";
  const b = (body || "").toLowerCase();
  if (http === 404) return "deprecado";
  if (http === 400) {
    if (b.includes("model") && (b.includes("support") || b.includes("deprecat") || b.includes("not found") ||
        b.includes("does not exist") || b.includes("invalid") || b.includes("no longer"))) return "deprecado";
    return "error_400";
  }
  if (http === 401 || http === 403) return "clave_invalida";
  if (http === 429) return "rate_limit";
  return `http_${http}`;
}

async function probeOne(p: Probe) {
  const key = Deno.env.get(p.keyEnv);
  const started = Date.now();
  if (!key) return { display: p.display, provider: p.provider, model: p.model, endpoint: p.endpoint,
    status: "sin_clave", http_status: null, latency_ms: 0, error_excerpt: `Falta variable ${p.keyEnv}` };
  const { url, headers, body } = p.build(key);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25000);
  let http: number | null = null; let respBody = ""; let timedOut = false;
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    http = r.status;
    respBody = (await r.text()).slice(0, 900);
  } catch (e) {
    timedOut = (e as Error).name === "AbortError";
    respBody = String(e).slice(0, 300);
  } finally { clearTimeout(to); }
  const status = classify(http, respBody, timedOut, false);
  return { display: p.display, provider: p.provider, model: p.model, endpoint: p.endpoint, status,
    http_status: http, latency_ms: Date.now() - started, error_excerpt: status === "ok" ? null : respBody.slice(0, 600) };
}

// NUEVO: prueba del pipeline report-analysis (deteccion de regresion).
// status "ok" solo si HTTP 200 Y el JSON tiene analysis_json.titular no vacio;
// "degradado" si 200 sin analysis_json (p.ej. solo 'analysis' markdown) o titular vacio;
// "error_400"/"error_HTTP"/"timeout" segun corresponda.
async function probeReportAnalysis() {
  const started = Date.now();
  const display = "report-analysis";
  const provider = "pipeline";
  const model = "report-analysis";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const endpoint = `${supabaseUrl}/functions/v1/report-analysis`;
  if (!anonKey) {
    return { display, provider, model, endpoint, status: "error_HTTP", http_status: null,
      latency_ms: 0, error_excerpt: "Falta variable SUPABASE_ANON_KEY" };
  }
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);
  let http: number | null = null; let respBody = ""; let timedOut = false;
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "profile", tickers: ["ACS"] }),
      signal: ctrl.signal,
    });
    http = r.status;
    respBody = await r.text();
  } catch (e) {
    timedOut = (e as Error).name === "AbortError";
    respBody = String(e).slice(0, 300);
  } finally { clearTimeout(to); }

  let status: string;
  let reason: string | null = null;
  if (timedOut) {
    status = "timeout";
    reason = "report-analysis no respondio en 60s (timeout)";
  } else if (http === null) {
    status = "error_HTTP";
    reason = respBody.slice(0, 600);
  } else if (http === 400) {
    status = "error_400";
    reason = respBody.slice(0, 600);
  } else if (http < 200 || http >= 300) {
    status = "error_HTTP";
    reason = `HTTP ${http}: ${respBody.slice(0, 500)}`;
  } else {
    let parsed: any = null;
    try { parsed = JSON.parse(respBody); } catch { parsed = null; }
    const titular = parsed?.analysis_json?.titular;
    if (parsed && parsed.analysis_json && typeof titular === "string" && titular.trim().length > 0) {
      status = "ok";
    } else {
      status = "degradado";
      reason = (parsed && parsed.analysis && !parsed.analysis_json)
        ? "REGRESION: HTTP 200 con 'analysis' (markdown) y SIN analysis_json estructurado (posible despliegue de la version antigua)"
        : "HTTP 200 pero sin analysis_json.titular no vacio (posible regresion)";
    }
  }

  return {
    display, provider, model, endpoint, status,
    http_status: http, latency_ms: Date.now() - started,
    error_excerpt: status === "ok" ? null : (reason ?? "").slice(0, 600),
  };
}

function esc(s: string) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const reqBody = await req.json().catch(() => ({} as Record<string, unknown>));
  const forceEmail = !!(reqBody as Record<string, unknown>).force_email;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const modelResults = await Promise.all(PROBES.map(probeOne));
  // Tras las 6 pruebas de modelo, una prueba mas: el pipeline report-analysis.
  const raResult = await probeReportAnalysis();
  const results = [...modelResults, raResult];
  const checkedAt = new Date().toISOString();

  try {
    await supabase.from("model_health_checks").insert(results.map((r) => ({
      checked_at: checkedAt, provider: r.provider, display_name: r.display, model_string: r.model,
      endpoint: r.endpoint, status: r.status, http_status: r.http_status, latency_ms: r.latency_ms, error_excerpt: r.error_excerpt,
    })));
  } catch (e) { console.error("[canary] insert error", e); }

  const failing = results.filter((r) => r.status !== "ok");
  const deprecated = results.filter((r) => r.status === "deprecado");

  let emailed = false;
  if (failing.length > 0 || forceEmail) {
    try {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      const rows = results.map((r) => {
        const icon = r.status === "ok" ? "✅" : (r.status === "deprecado" ? "⛔" : "⚠️");
        return `<tr><td>${icon} <b>${esc(r.display)}</b></td><td><code>${esc(r.model)}</code></td><td><b>${esc(r.status)}</b></td><td>${r.http_status ?? "-"}</td><td>${r.latency_ms} ms</td></tr>` +
          (r.error_excerpt ? `<tr><td colspan="5" style="color:#b00020;font-size:12px;">${esc(r.error_excerpt)}</td></tr>` : "");
      }).join("");
      const subject = deprecated.length > 0
        ? `⛔ RepIndex — modelo IA DEPRECADO: ${deprecated.map((d) => d.display).join(", ")}`
        : (failing.length > 0
          ? `⚠️ RepIndex — ${failing.length} modelo(s) IA con problema: ${failing.map((f) => f.display).join(", ")}`
          : `✅ RepIndex — chequeo de modelos (test)`);
      const advice = deprecated.length > 0
        ? `<p style="background:#fff3f3;border:1px solid #f0b0b0;padding:10px;border-radius:6px"><b>Accion antes del barrido del domingo:</b> actualiza el nombre del modelo en <code>rix-search-v2</code> (getSearchModelConfigs) y vuelve a desplegar la funcion. El texto del error de la API suele indicar el nombre valido del modelo.</p>`
        : "";
      const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#111"><h2>Salud de modelos IA &middot; RepIndex</h2>` +
        `<p>${esc(checkedAt)} &middot; <b>${failing.length}</b> con problema de ${results.length}.</p>${advice}` +
        `<table cellpadding="6" style="border-collapse:collapse;font-size:14px" border="1"><tr><th>Modelo</th><th>String enviado</th><th>Estado</th><th>HTTP</th><th>Latencia</th></tr>${rows}</table>` +
        `<p style="font-size:12px;color:#666">Canary automatico. Si todo esta OK no recibes este correo.</p></div>`;
      const { error } = await resend.emails.send({
        from: "RepIndex <no-reply@repindex.ai>",
        to: ["datos@hablamosde.com"],
        bcc: ["info@repindex.ai"],
        subject, html,
      });
      emailed = !error;
      if (error) console.error("[canary] resend error", error);
    } catch (e) { console.error("[canary] email exception", e); }
  }

  return new Response(JSON.stringify({
    checked_at: checkedAt, total: results.length, ok: results.length - failing.length,
    failing: failing.map((f) => ({ model: f.display, status: f.status, http: f.http_status })),
    emailed, results,
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
