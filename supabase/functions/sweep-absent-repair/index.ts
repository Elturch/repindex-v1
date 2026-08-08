import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

// sweep-absent-repair · BLINDAJE anti-ausencias del barrido semanal RepIndex.
// Causa raíz (incidente 2026-08-02): el enforcer existente (enforce_sweep_completeness
// / rix_incomplete_cells) SÓLO repara CELDAS incompletas (filas que EXISTEN con
// "09_rix_score" null). NO detecta emisores activos TOTALMENTE AUSENTES (0 filas esa
// semana). Ese domingo 5 emisores (IBE, ADX, ART2, GAM, NET) quedaron con CERO filas y
// nadie avisó. Esta función cubre ese hueco: detecta ausentes vía RPC rix_absent_issuers,
// re-puntúa (rix-search-v2 -> rix-analyze-v2) y avisa por email. NO toca el flag global
// de barrido. Sólo emisores ausentes. Cap 30. verify_jwt=false + auth propia (service o anon).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

const ABSENT_CAP = 30;
const CONCURRENCY = 3;
const SEARCH_TIMEOUT_MS = 90_000;
const ANALYZE_TIMEOUT_MS = 110_000;
const WAIT_AFTER_SEARCH_MS = 15_000;
const WAIT_BEFORE_RETRY_MS = 10_000;
const SOFT_DEADLINE_MS = 135_000;

async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function postFn(slug: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number | null; error?: string }> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${FN_BASE}/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    await r.text().catch(() => "");
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: null, error: (e as Error).name === "AbortError" ? "client_timeout" : String(e).slice(0, 200) };
  } finally {
    clearTimeout(to);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || (token !== SERVICE_KEY && token !== ANON_KEY)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const startedAt = Date.now();
  const timeLeft = () => SOFT_DEADLINE_MS - (Date.now() - startedAt);

  const reqBody = await req.json().catch(() => ({} as Record<string, unknown>));
  const forceEmail = !!(reqBody as Record<string, unknown>).force_email;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let week = (reqBody as Record<string, unknown>).week as string | undefined;
  if (!week) {
    const { data } = await supabase.from("rix_runs_v2").select("batch_execution_date").order("batch_execution_date", { ascending: false }).limit(1);
    week = String(data?.[0]?.batch_execution_date ?? "").slice(0, 10);
  }
  if (!week) {
    return new Response(JSON.stringify({ error: "no_week_resolved" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { data: absentData, error: absentErr } = await supabase.rpc("rix_absent_issuers", { p_week: week });
  if (absentErr) {
    console.error("[absent-repair] rix_absent_issuers error", absentErr);
    return new Response(JSON.stringify({ error: "absent_rpc_failed", details: absentErr.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const absent = (absentData ?? []) as Array<{ ticker: string; issuer_name: string }>;
  const absentCount = absent.length;
  const tickers = absent.map((a) => a.ticker);
  console.log(`[absent-repair] week=${week} absent=${absentCount} tickers=[${tickers.join(",")}]`);

  const logCheck = async (status: string, extra?: string) => {
    try {
      await supabase.from("model_health_checks").insert({
        provider: "_sweep", display_name: "ABSENT_REPAIR", model_string: String(week),
        status, http_status: absentCount, error_excerpt: extra ?? null,
      });
    } catch (e) { console.error("[absent-repair] log insert", e); }
  };
  const sendEmail = async (subject: string, html: string) => {
    try {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      const { error } = await resend.emails.send({ from: "RepIndex <no-reply@repindex.ai>", to: ["datos@hablamosde.com"], bcc: ["info@repindex.ai"], subject, html });
      if (error) { console.error("[absent-repair] resend", error); return false; }
      return true;
    } catch (e) { console.error("[absent-repair] email", e); return false; }
  };

  if (absentCount === 0) {
    await logCheck("none");
    let emailed = false;
    if (forceEmail) {
      emailed = await sendEmail(
        `✅ RepIndex — barrido ${week}: 0 emisores ausentes`,
        `<div style="font-family:system-ui,Arial,sans-serif;color:#111"><h2>Blindaje de ausencias &middot; ${esc(week)}</h2><p>Barrido completo: <b>0 emisores activos ausentes</b>. No se re-puntuó nada.</p></div>`,
      );
    }
    console.log(`[absent-repair] 0 ausentes → completo, sin re-puntuar (week=${week})`);
    return new Response(JSON.stringify({ week, absent: 0, action: "none", rescored: false, emailed }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (absentCount > ABSENT_CAP) {
    const emailed = await sendEmail(
      `🚨 RepIndex — ${absentCount} emisores AUSENTES en barrido ${week} (posible fallo de barrido)`,
      `<div style="font-family:system-ui,Arial,sans-serif;color:#111"><h2>⚠️ Alerta de barrido &middot; ${esc(week)}</h2>` +
      `<p><b>${absentCount}</b> emisores activos sin ninguna fila esta semana (umbral de seguridad: ${ABSENT_CAP}).</p>` +
      `<p>Esto excede lo esperable para un "fleco": <b>NO se ha re-puntuado en masa</b>. Se recomienda revisión manual del barrido/orquestador.</p>` +
      `<p style="font-size:12px;color:#666">Ausentes (hasta 60): ${esc(tickers.slice(0, 60).join(", "))}</p></div>`,
    );
    await logCheck("alert_over_cap", tickers.join(", "));
    console.warn(`[absent-repair] ${absentCount} ausentes > cap ${ABSENT_CAP} → ALERTA, sin re-puntuar`);
    return new Response(JSON.stringify({ week, absent: absentCount, action: "alert_over_cap", rescored: false, emailed }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const searchResults = await runPool(absent, CONCURRENCY, (a) =>
    postFn("rix-search-v2", { ticker: a.ticker, issuer_name: a.issuer_name }, SEARCH_TIMEOUT_MS).then((r) => ({ ticker: a.ticker, ...r })),
  );
  console.log("[absent-repair] search fired", JSON.stringify(searchResults));

  const nullRowIdsForTickers = async (): Promise<string[]> => {
    const { data } = await supabase.from("rix_runs_v2").select('id,"05_ticker",batch_execution_date,"09_rix_score"').in("05_ticker", tickers).is("09_rix_score", null);
    return (data ?? [])
      .filter((r: Record<string, unknown>) => String(r.batch_execution_date ?? "").slice(0, 10) === week)
      .map((r: Record<string, unknown>) => String(r.id));
  };

  await sleep(Math.max(0, Math.min(WAIT_AFTER_SEARCH_MS, timeLeft() - 40_000)));

  const analyzeIds = await nullRowIdsForTickers();
  if (analyzeIds.length > 0) {
    await runPool(analyzeIds, CONCURRENCY, (id) => postFn("rix-analyze-v2", { record_id: id }, ANALYZE_TIMEOUT_MS));
  }

  if (timeLeft() > WAIT_BEFORE_RETRY_MS + 15_000) {
    await sleep(WAIT_BEFORE_RETRY_MS);
    const retryIds = await nullRowIdsForTickers();
    if (retryIds.length > 0) {
      await runPool(retryIds, CONCURRENCY, (id) => postFn("rix-analyze-v2", { record_id: id }, ANALYZE_TIMEOUT_MS));
    }
  }

  const { data: finalRows } = await supabase.from("rix_runs_v2").select('"05_ticker",batch_execution_date,"09_rix_score"').in("05_ticker", tickers);
  const perTicker = new Map<string, { rows: number; scored: number }>();
  for (const t of tickers) perTicker.set(t, { rows: 0, scored: 0 });
  for (const r of (finalRows ?? []) as Record<string, unknown>[]) {
    if (String(r.batch_execution_date ?? "").slice(0, 10) !== week) continue;
    const agg = perTicker.get(String(r["05_ticker"]));
    if (!agg) continue;
    agg.rows += 1;
    if (r["09_rix_score"] !== null && r["09_rix_score"] !== undefined) agg.scored += 1;
  }
  const full: string[] = [];
  const incomplete: Array<{ ticker: string; rows: number; scored: number }> = [];
  for (const a of absent) {
    const agg = perTicker.get(a.ticker) ?? { rows: 0, scored: 0 };
    if (agg.rows >= 6 && agg.scored >= 6) full.push(a.ticker);
    else incomplete.push({ ticker: a.ticker, rows: agg.rows, scored: agg.scored });
  }

  const detectedList = absent.map((a) => `${esc(a.ticker)} (${esc(a.issuer_name)})`).join(", ");
  const incompleteList = incomplete.map((c) => `${esc(c.ticker)} [${c.scored}/${c.rows}]`).join(", ");
  const allOk = incomplete.length === 0;
  const subject = allOk
    ? `🛡️ RepIndex — ${full.length} emisor(es) ausente(s) recuperado(s) en barrido ${week}`
    : `⚠️ RepIndex — barrido ${week}: ${full.length}/${absentCount} ausentes recuperados, ${incomplete.length} incompleto(s)`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#111">` +
    `<h2>Blindaje de ausencias &middot; ${esc(week)}</h2>` +
    `<p>Emisores activos que estaban <b>totalmente ausentes</b> del barrido (0 filas) y se han re-puntuado:</p>` +
    `<p><b>${absentCount} detectado(s):</b> ${detectedList}</p>` +
    `<p>✅ Recuperados a 6/6: <b>${full.length}</b>${full.length ? " — " + esc(full.join(", ")) : ""}</p>` +
    (allOk ? "" : `<p style="background:#fff3f3;border:1px solid #f0b0b0;padding:10px;border-radius:6px">⚠️ Aún incompletos: <b>${incomplete.length}</b> — ${incompleteList}<br><span style="font-size:12px;color:#666">La 2ª pasada (lunes 05:30 UTC) y el enforcer de celdas reintentarán automáticamente.</span></p>`) +
    `<p style="font-size:12px;color:#666">Blindaje automático sweep-absent-repair. No toca el flag global de barrido; sólo actúa sobre emisores ausentes.</p></div>`;
  const emailed = await sendEmail(subject, html);

  await logCheck(allOk ? "repaired" : "partial", `full=[${full.join(",")}] incomplete=[${incomplete.map((c) => `${c.ticker}:${c.scored}/${c.rows}`).join(",")}]`);

  console.log(`[absent-repair] DONE week=${week} absent=${absentCount} full6=${full.length} incomplete=${incomplete.length} emailed=${emailed}`);
  return new Response(JSON.stringify({ week, absent: absentCount, action: "repaired", rescored: true, detected: tickers, recovered_full: full, still_incomplete: incomplete, emailed }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
