// Deterministic asserts for the stress-matrix runner. Pure Deno, no LLM.
// Each assert receives (ctx) and returns null when it passes, or a string
// with the failure reason. The runner aggregates results into
// stress_results.asserts_passed / asserts_failed.

export type StressCase = {
  case_id: string;
  family: string;
  query: string;
  scope: string;            // subsector name or ibex family code
  scope_kind: "subsector" | "ibex_family";
  tickers: string[];        // canonical tickers in the scope
  n: number;                // size of the scope
  weeks: number;
  model_filter: string | null;
  expected_skill: string;
};

export type AssertCtx = {
  caseSpec: StressCase;
  markdown: string;
  meta: Record<string, unknown> | null;
};

export type AssertResult = { id: string; ok: boolean; msg?: string };

const ALL_MODELS = ["gemini", "deepseek", "grok", "qwen", "perplexity", "chatgpt"];
const RIX_METRICS = ["NVM", "DRM", "SIM", "RMM", "CEM", "GAM", "DCM", "CXM"];

function lower(s: string): string { return (s || "").toLowerCase(); }

// A1 — every URL in §6 references a ticker in scope (heuristic: at least
// one ticker token appears as substring in the same line as the URL, OR
// the canonical ticker is present anywhere in the bibliography section).
function a1_scope_integrity(ctx: AssertCtx): AssertResult {
  if (ctx.caseSpec.expected_skill !== "sectorRanking") {
    return { id: "A1_scope_integrity", ok: true };
  }
  const md = ctx.markdown;
  const sectionMatch = md.match(/(?:###?\s*6\.|Anexo|Bibliograf[íi]a)[\s\S]*$/i);
  const section = sectionMatch ? sectionMatch[0] : "";
  if (!section) return { id: "A1_scope_integrity", ok: true };
  // Extract URLs in the bibliography section.
  const urls = section.match(/https?:\/\/[^\s)]+/g) || [];
  if (urls.length === 0) return { id: "A1_scope_integrity", ok: true };
  // Build a set of allowed tickers (lowercase, also strip suffixes).
  const allowed = new Set(
    ctx.caseSpec.tickers.map((t) => t.toLowerCase().replace(/[-.].*$/, "")),
  );
  // Heuristic: scan for ticker mentions OR known company-domain patterns.
  // We accept the section if every URL line contains at least one allowed
  // ticker substring. If not, we report up to 3 offending URLs.
  const offenders: string[] = [];
  for (const url of urls) {
    const lineRegex = new RegExp(`[^\\n]*${url.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[^\\n]*`);
    const line = section.match(lineRegex)?.[0]?.toLowerCase() || "";
    let ok = false;
    for (const tk of allowed) {
      if (line.includes(tk)) { ok = true; break; }
    }
    if (!ok) offenders.push(url);
  }
  if (offenders.length === 0) return { id: "A1_scope_integrity", ok: true };
  return {
    id: "A1_scope_integrity",
    ok: false,
    msg: `URLs sin ticker del scope: ${offenders.slice(0, 3).join(", ")}`,
  };
}

function a2_single_model_lang(ctx: AssertCtx): AssertResult {
  if (!ctx.caseSpec.model_filter) return { id: "A2_single_model_lang", ok: true };
  const md = lower(ctx.markdown);
  const banned = [
    "entre modelos", "consenso multi", "los demás modelos",
    "rix medio", "promedio entre",
  ];
  const hit = banned.find((b) => md.includes(b));
  if (hit) {
    return { id: "A2_single_model_lang", ok: false, msg: `Lenguaje multi-modelo: "${hit}"` };
  }
  return { id: "A2_single_model_lang", ok: true };
}

function a3_anti_fabrication(ctx: AssertCtx): AssertResult {
  const md = ctx.markdown;
  const patterns: Array<[RegExp, string]> = [
    [/Q[1-4][- ]?20\d\d/, "Q?-20XX"],
    [/FY[- ]?20\d\d/, "FY-20XX"],
    [/\bAGM\b/, "AGM"],
    [/target [0-9]/i, "target N"],
    [/\+\d+,\d+\s*pts?/, "+x,x pts"],
    [/horizonte de \d+/i, "horizonte de N"],
    [/data[- ]?room/i, "data-room"],
    [/white[- ]?paper/i, "white-paper"],
    [/roadshow/i, "roadshow"],
    [/\bprotocolo\b/i, "protocolo"],
    [/\bwebinar\b/i, "webinar"],
    [/\bbriefing\b/i, "briefing"],
    [/nota de prensa/i, "nota de prensa"],
    [/mesa redonda/i, "mesa redonda"],
  ];
  const hits = patterns.filter(([re]) => re.test(md)).map(([, name]) => name);
  if (hits.length === 0) return { id: "A3_anti_fabrication", ok: true };
  return { id: "A3_anti_fabrication", ok: false, msg: `Fabricaciones: ${hits.join(", ")}` };
}

function a4_small_n(ctx: AssertCtx): AssertResult {
  if (ctx.caseSpec.n > 3 || ctx.caseSpec.scope_kind !== "subsector") {
    return { id: "A4_small_n", ok: true };
  }
  const md = lower(ctx.markdown);
  if (md.includes("top-5") || md.includes("top 5")) {
    return { id: "A4_small_n", ok: false, msg: `Subsector N=${ctx.caseSpec.n} pero menciona top-5` };
  }
  return { id: "A4_small_n", ok: true };
}

function a5_hotels_edge(ctx: AssertCtx): AssertResult {
  if (ctx.caseSpec.scope !== "Hoteles") return { id: "A5_hotels_edge", ok: true };
  const md = lower(ctx.markdown);
  // Must declare uniqueness OR at least not invent peer competitors.
  const declares = /1\s*único\s*emisor|único emisor cotizado|único cotizado|solo emisor cotizado|único representante/.test(md);
  if (declares) return { id: "A5_hotels_edge", ok: true };
  // If it doesn't declare, check it didn't invent peers (any other ticker).
  const inventedPeer = /\bnh\b|nh hoteles|riu|barcel[oó]|sercotel|iberostar|paradores/.test(md);
  if (inventedPeer) {
    return { id: "A5_hotels_edge", ok: false, msg: "No declara unicidad e inventa peers de hoteles" };
  }
  return { id: "A5_hotels_edge", ok: false, msg: "No declara que el subsector tiene 1 único emisor (MEL)" };
}

function a6_anti_mediana(ctx: AssertCtx): AssertResult {
  if (/\bmediana\b/i.test(ctx.markdown)) {
    return { id: "A6_anti_mediana", ok: false, msg: 'Usa la palabra "mediana"' };
  }
  return { id: "A6_anti_mediana", ok: true };
}

function a7_period_coherence(ctx: AssertCtx): AssertResult {
  // Find any explicit dates of the form 20XX-MM-DD or DD/MM/20XX.
  const md = ctx.markdown;
  const isoDates = md.match(/\b(20\d\d)-(\d{2})-(\d{2})\b/g) || [];
  for (const d of isoDates) {
    if (d < "2026-01-01") {
      return { id: "A7_period_coherence", ok: false, msg: `Fecha previa al floor 2026-01-01: ${d}` };
    }
  }
  return { id: "A7_period_coherence", ok: true };
}

function a8_models_coverage(ctx: AssertCtx): AssertResult {
  if (ctx.caseSpec.model_filter !== null) return { id: "A8_models_coverage", ok: true };
  const md = lower(ctx.markdown);
  const missing = ALL_MODELS.filter((m) => !md.includes(m));
  if (missing.length === 0) return { id: "A8_models_coverage", ok: true };
  return { id: "A8_models_coverage", ok: false, msg: `Modelos no citados: ${missing.join(", ")}` };
}

function a9_ranking_enrichment(ctx: AssertCtx): AssertResult {
  if (ctx.caseSpec.expected_skill !== "sectorRanking") return { id: "A9_ranking_enrichment", ok: true };
  const md = ctx.markdown;
  const missing = RIX_METRICS.filter((m) => !new RegExp(`\\b${m}\\b`).test(md));
  if (missing.length === 0) return { id: "A9_ranking_enrichment", ok: true };
  return { id: "A9_ranking_enrichment", ok: false, msg: `Sub-métricas ausentes: ${missing.join(", ")}` };
}

function a10_biblio_min(ctx: AssertCtx): AssertResult {
  if (ctx.caseSpec.expected_skill !== "sectorRanking") return { id: "A10_biblio_min", ok: true };
  const md = ctx.markdown;
  const sectionMatch = md.match(/(?:###?\s*6\.|Anexo|Bibliograf[íi]a)[\s\S]*$/i);
  const section = sectionMatch ? sectionMatch[0] : "";
  if (!section) return { id: "A10_biblio_min", ok: false, msg: "Sin sección bibliografía" };
  const lc = section.toLowerCase();
  const ranked = ctx.caseSpec.tickers.slice(0, Math.min(5, ctx.caseSpec.n));
  const missing: string[] = [];
  for (const tk of ranked) {
    const stem = tk.toLowerCase().replace(/[-.].*$/, "");
    if (!lc.includes(stem)) missing.push(tk);
  }
  if (missing.length === 0) return { id: "A10_biblio_min", ok: true };
  return { id: "A10_biblio_min", ok: false, msg: `Tickers sin URL en §6: ${missing.join(", ")}` };
}

export function runAsserts(ctx: AssertCtx): AssertResult[] {
  return [
    a1_scope_integrity(ctx),
    a2_single_model_lang(ctx),
    a3_anti_fabrication(ctx),
    a4_small_n(ctx),
    a5_hotels_edge(ctx),
    a6_anti_mediana(ctx),
    a7_period_coherence(ctx),
    a8_models_coverage(ctx),
    a9_ranking_enrichment(ctx),
    a10_biblio_min(ctx),
  ];
}