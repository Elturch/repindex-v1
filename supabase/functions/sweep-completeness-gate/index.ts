import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

// sweep-completeness-gate · GATE DE COMPLETITUD del barrido semanal RepIndex.
// Unifica el blindaje anti-ausencias (antes sweep-absent-repair) + la reparación de
// celdas incompletas en UNA sola función autoritativa que corre JUSTO TRAS EL BARRIDO,
// en varias pasadas (dom 03:30 / 05:00 / 06:30 / 08:00 UTC + backstop lun 05:30), para
// llevar los datos a 185/185 en ~1h y cubrir fallos transitorios de las APIs de IA.
//
// Detecta:
//   · AUSENTES  → emisor activo con 0 filas esa semana (RPC rix_absent_issuers).
//   · INCOMPLETAS → celdas con "09_rix_score" null (RPC rix_incomplete_cells): con bruto
//     presente se re-analiza (rix-analyze-v2 {record_id}); sin fila/sin bruto se relanza
//     la búsqueda del modelo (rix-search-v2 {ticker, single_model, repair_mode}).
//
// Reparación de AUSENTES: rix-search-v2 {ticker, issuer_name} (idempotente; puede 504 pero
// haber insertado) → espera → rix-analyze-v2 sobre filas con score null → 1 reintento.
//
// GUARDA anti-carrera: si sweep_status.in_progress=true O hay filas pending/processing en
// sweep_queue, NO repara (el barrido sigue vivo); registra y sale 200. Otra pasada lo coge.
// TOPE: si (ausentes+incompletas) > 30 → email de ALERTA, NO repara en masa.
// EMAIL: nunca spam. Sólo si (a) quedan huecos sin cerrar (fallo real), (b) tope superado,
// o (c) confirmación en la ÚLTIMA pasada del día (final=true) cuando hubo reparaciones.
// NO toca el flag global sweep_status. Idempotente; sólo toca emisores/celdas con hueco.
// verify_jwt=false + auth propia (SERVICE_ROLE_KEY o ANON/publishable key).

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

const GAP_CAP = 30;              // ausentes + emisores incompletos por encima → alerta, sin reparar en masa
const CONCURRENCY = 3;
const SEARCH_TIMEOUT_MS = 90_000;
const ANALYZE_TIMEOUT_MS = 110_000;
const WAIT_AFTER_SEARCH_MS = 15_000;
const WAIT_BEFORE_RETRY_MS = 10_000;
const SOFT_DEADLINE_MS = 150_000;

type AbsentRow = { ticker: string; issuer_name: string };
type CellRow = { id: string; ticker: string; model_name: string; has_bruto: boolean };

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

  const reqBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const forceEmail = !!reqBody.force_email;
  const isFinal = !!reqBody.final;                 // pasada final del día → email de confirmación si hubo reparaciones
  const dryRun = !!reqBody.dry_run;                // sólo detecta + informa (respuesta), NO repara ni cambia nada
  const passLabel = String(reqBody.trigger ?? reqBody.pass ?? "manual");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const sendEmail = async (subject: string, html: string) => {
    try {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      const { error } = await resend.emails.send({ from: "RepIndex <no-reply@repindex.ai>", to: ["datos@hablamosde.com"], bcc: ["info@repindex.ai"], subject, html });
      if (error) { console.error("[gate] resend", error); return false; }
      return true;
    } catch (e) { console.error("[gate] email", e); return false; }
  };

  // ── Semana objetivo ────────────────────────────────────────────────────────
  let week = reqBody.week as string | undefined;
  if (!week) {
    const { data } = await supabase.from("rix_runs_v2").select("batch_execution_date").order("batch_execution_date", { ascending: false }).limit(1);
    week = String(data?.[0]?.batch_execution_date ?? "").slice(0, 10);
  }
  if (!week) {
    return new Response(JSON.stringify({ error: "no_week_resolved" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const logCheck = async (status: string, http: number, extra?: string) => {
    try {
      await supabase.from("model_health_checks").insert({
        provider: "_sweep", display_name: "COMPLETENESS_GATE", model_string: String(week),
        status, http_status: http, error_excerpt: extra ? `${passLabel} · ${extra}`.slice(0, 500) : passLabel,
      });
    } catch (e) { console.error("[gate] log insert", e); }
  };

  // ── GUARDA anti-carrera: no reparar si el barrido sigue vivo ────────────────
  let sweepInProgress = false;
  let queueActive = 0;
  try {
    const { data: cfg } = await supabase.from("app_config").select("value").eq("key", "sweep_status").limit(1);
    sweepInProgress = !!((cfg?.[0]?.value as Record<string, unknown> | undefined)?.in_progress);
  } catch (e) { console.error("[gate] sweep_status read", e); }
  try {
    const { count } = await supabase.from("sweep_queue").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]);
    queueActive = count ?? 0;
  } catch (e) { console.error("[gate] sweep_queue read", e); }

  if (!dryRun && (sweepInProgress || queueActive > 0)) {
    await logCheck("skipped_sweep_active", queueActive, `in_progress=${sweepInProgress} queue_active=${queueActive}`);
    console.log(`[gate] week=${week} pass=${passLabel} SKIP: barrido activo (in_progress=${sweepInProgress}, queue=${queueActive})`);
    return new Response(JSON.stringify({ week, pass: passLabel, action: "skipped_sweep_active", in_progress: sweepInProgress, queue_active: queueActive }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Detección de huecos ─────────────────────────────────────────────────────
  const detect = async (): Promise<{ absent: AbsentRow[]; cells: CellRow[]; incompleteTickers: string[]; gapUnits: number }> => {
    const { data: absentData, error: absentErr } = await supabase.rpc("rix_absent_issuers", { p_week: week });
    if (absentErr) throw new Error(`rix_absent_issuers: ${absentErr.message}`);
    const { data: cellData, error: cellErr } = await supabase.rpc("rix_incomplete_cells", { p_week: week });
    if (cellErr) throw new Error(`rix_incomplete_cells: ${cellErr.message}`);
    const absent = (absentData ?? []) as AbsentRow[];
    const cells = (cellData ?? []) as CellRow[];
    const incompleteTickers = Array.from(new Set(cells.map((c) => c.ticker)));
    return { absent, cells, incompleteTickers, gapUnits: absent.length + incompleteTickers.length };
  };

  let d0;
  try {
    d0 = await detect();
  } catch (e) {
    console.error("[gate] detect error", e);
    await logCheck("detect_error", 500, String(e).slice(0, 200));
    return new Response(JSON.stringify({ error: "detect_failed", details: String(e).slice(0, 200) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const absentTickers = d0.absent.map((a) => a.ticker);
  console.log(`[gate] week=${week} pass=${passLabel} absent=${d0.absent.length} incomplete_issuers=${d0.incompleteTickers.length} incomplete_cells=${d0.cells.length} dry=${dryRun}`);

  // ── dry_run: sólo informa detección, no repara ─────────────────────────────
  if (dryRun) {
    return new Response(JSON.stringify({
      week, pass: passLabel, dry_run: true, in_progress: sweepInProgress, queue_active: queueActive,
      absent: d0.absent.map((a) => a.ticker), incomplete_issuers: d0.incompleteTickers,
      incomplete_cells: d0.cells.map((c) => ({ ticker: c.ticker, model: c.model_name, has_bruto: c.has_bruto })),
      gap_units: d0.gapUnits,
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Sin huecos: no repara, no email (evita spam) ───────────────────────────
  if (d0.gapUnits === 0) {
    await logCheck("complete", 0);
    let emailed = false;
    if (forceEmail) {
      emailed = await sendEmail(
        `✅ RepIndex — barrido ${week} COMPLETO (185/185, 0 huecos)`,
        `<div style="font-family:system-ui,Arial,sans-serif;color:#111"><h2>Gate de completitud &middot; ${esc(week)}</h2><p>Sin emisores ausentes ni celdas incompletas. Nada que reparar.</p></div>`,
      );
    }
    console.log(`[gate] 0 huecos → completo (week=${week}, pass=${passLabel})`);
    return new Response(JSON.stringify({ week, pass: passLabel, action: "complete", gap_units: 0, emailed }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── TOPE de seguridad: demasiados huecos → alerta, sin reparar en masa ──────
  if (d0.gapUnits > GAP_CAP) {
    const emailed = await sendEmail(
      `🚨 RepIndex — ${d0.gapUnits} huecos en barrido ${week} (posible fallo de barrido)`,
      `<div style="font-family:system-ui,Arial,sans-serif;color:#111"><h2>⚠️ Alerta de barrido &middot; ${esc(week)}</h2>` +
      `<p><b>${d0.absent.length}</b> emisores ausentes + <b>${d0.incompleteTickers.length}</b> emisores incompletos = <b>${d0.gapUnits}</b> huecos (umbral: ${GAP_CAP}).</p>` +
      `<p>Excede lo esperable para un "fleco": <b>NO se ha reparado en masa</b>. Se recomienda revisión manual del barrido/orquestador.</p>` +
      `<p style="font-size:12px;color:#666">Ausentes: ${esc(absentTickers.slice(0, 60).join(", "))}</p>` +
      `<p style="font-size:12px;color:#666">Incompletos: ${esc(d0.incompleteTickers.slice(0, 60).join(", "))}</p></div>`,
    );
    await logCheck("alert_over_cap", d0.gapUnits, `absent=[${absentTickers.join(",")}] incomplete=[${d0.incompleteTickers.join(",")}]`);
    console.warn(`[gate] ${d0.gapUnits} huecos > cap ${GAP_CAP} → ALERTA, sin reparar`);
    return new Response(JSON.stringify({ week, pass: passLabel, action: "alert_over_cap", gap_units: d0.gapUnits, absent: absentTickers, incomplete_issuers: d0.incompleteTickers, emailed }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Reparación (1..30 huecos) ───────────────────────────────────────────────
  // 1) AUSENTES: search por ticker (idempotente; puede insertar y 504)
  if (d0.absent.length > 0) {
    const sr = await runPool(d0.absent, CONCURRENCY, (a) =>
      postFn("rix-search-v2", { ticker: a.ticker, issuer_name: a.issuer_name }, SEARCH_TIMEOUT_MS).then((r) => ({ ticker: a.ticker, ...r })),
    );
    console.log("[gate] absent search fired", JSON.stringify(sr));
  }
  // 2) INCOMPLETAS sin bruto (modelo que falta / sin búsqueda): re-lanzar search del modelo
  const cellsNoBruto = d0.cells.filter((c) => !c.has_bruto);
  if (cellsNoBruto.length > 0) {
    const sr = await runPool(cellsNoBruto, CONCURRENCY, (c) =>
      postFn("rix-search-v2", { ticker: c.ticker, single_model: c.model_name, repair_mode: true }, SEARCH_TIMEOUT_MS).then((r) => ({ ticker: c.ticker, model: c.model_name, ...r })),
    );
    console.log("[gate] incomplete(no-bruto) search fired", JSON.stringify(sr));
  }
  // 3) INCOMPLETAS con bruto (fila sin puntuar): analyze directo
  const cellsWithBruto = d0.cells.filter((c) => c.has_bruto);
  if (cellsWithBruto.length > 0) {
    await runPool(cellsWithBruto, CONCURRENCY, (c) => postFn("rix-analyze-v2", { record_id: c.id }, ANALYZE_TIMEOUT_MS));
  }

  // 4) Espera y re-analiza: las search anteriores pueden haber insertado filas con bruto y
  //    score null (ausentes recuperados o modelos rehechos). Re-detecta celdas con bruto y
  //    dispara analyze. Un reintento si queda tiempo.
  const affected = new Set<string>([...absentTickers, ...d0.incompleteTickers]);
  const reanalyze = async () => {
    const { data: cellData } = await supabase.rpc("rix_incomplete_cells", { p_week: week });
    const pending = ((cellData ?? []) as CellRow[]).filter((c) => c.has_bruto && affected.has(c.ticker));
    if (pending.length > 0) await runPool(pending, CONCURRENCY, (c) => postFn("rix-analyze-v2", { record_id: c.id }, ANALYZE_TIMEOUT_MS));
    return pending.length;
  };

  await sleep(Math.max(0, Math.min(WAIT_AFTER_SEARCH_MS, timeLeft() - 45_000)));
  await reanalyze();
  if (timeLeft() > WAIT_BEFORE_RETRY_MS + 20_000) {
    await sleep(WAIT_BEFORE_RETRY_MS);
    await reanalyze();
  }

  // ── Re-chequeo final ────────────────────────────────────────────────────────
  let d1;
  try {
    d1 = await detect();
  } catch (e) {
    console.error("[gate] final detect error", e);
    d1 = d0; // conservador
  }
  const remaining = d1.gapUnits;
  const closed = Math.max(0, d0.gapUnits - remaining);
  const allOk = remaining === 0;

  // ── Política de email ───────────────────────────────────────────────────────
  // · quedan huecos (fallo real) → email SIEMPRE.
  // · todo cerrado → email SÓLO en pasada final del día (o force_email). Sin spam.
  let emailed = false;
  const shouldEmail = !allOk || forceEmail || (isFinal && closed > 0);
  if (shouldEmail) {
    const remAbsent = d1.absent.map((a) => a.ticker);
    const remInc = d1.incompleteTickers;
    const subject = allOk
      ? `🛡️ RepIndex — barrido ${week} completado por el gate (${closed} hueco(s) cerrados, 185/185)`
      : `⚠️ RepIndex — barrido ${week}: ${closed} cerrados, quedan ${remaining} hueco(s)`;
    const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#111">` +
      `<h2>Gate de completitud &middot; ${esc(week)}</h2>` +
      `<p>Pasada <b>${esc(passLabel)}</b>. Huecos al inicio: <b>${d0.gapUnits}</b> ` +
      `(${d0.absent.length} ausentes + ${d0.incompleteTickers.length} incompletos). Cerrados: <b>${closed}</b>.</p>` +
      (allOk
        ? `<p style="background:#eefbf0;border:1px solid #a9dcb5;padding:10px;border-radius:6px">✅ <b>0 huecos restantes.</b> Barrido completo.</p>`
        : `<p style="background:#fff3f3;border:1px solid #f0b0b0;padding:10px;border-radius:6px">⚠️ <b>${remaining} hueco(s) sin cerrar</b> (fallo transitorio persistente).<br>` +
          `Ausentes: ${esc(remAbsent.join(", ") || "—")}<br>Incompletos: ${esc(remInc.join(", ") || "—")}<br>` +
          `<span style="font-size:12px;color:#666">Las siguientes pasadas (dom 05:00/06:30/08:00, backstop lun 05:30) reintentarán automáticamente.</span></p>`) +
      `<p style="font-size:12px;color:#666">Gate automático sweep-completeness-gate. No toca el flag global; sólo emisores/celdas con hueco.</p></div>`;
    emailed = await sendEmail(subject, html);
  }

  await logCheck(allOk ? "repaired" : "partial", remaining, `closed=${closed} rem_absent=[${d1.absent.map((a) => a.ticker).join(",")}] rem_incomplete=[${d1.incompleteTickers.join(",")}]`);

  console.log(`[gate] DONE week=${week} pass=${passLabel} start_gaps=${d0.gapUnits} closed=${closed} remaining=${remaining} emailed=${emailed}`);
  return new Response(JSON.stringify({
    week, pass: passLabel, action: allOk ? "repaired" : "partial",
    start_gap_units: d0.gapUnits, closed, remaining,
    remaining_absent: d1.absent.map((a) => a.ticker), remaining_incomplete_issuers: d1.incompleteTickers,
    emailed,
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
