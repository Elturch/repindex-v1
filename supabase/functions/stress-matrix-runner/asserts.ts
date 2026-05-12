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
  // Optional human-readable issuer names for fairer A10/A1 matching.
  issuer_names?: string[];
};

export type AssertCtx = {
  caseSpec: StressCase;
  markdown: string;
  meta: Record<string, unknown> | null;
  // Fase 2 — Eje A. coverage_report persistido en chat_logs (puede ser
  // null si la celda no pasó por el scope rail). Cuando contiene
  // submetrics_coverage, el assert A9 conmuta a la lógica nueva
  // (umbral SUBMETRICS_COVERAGE_MIN). Si es null o no contiene
  // submetrics_coverage, A9 conserva su comportamiento legacy
  // (regresión cero).
  coverage_report?: Record<string, unknown> | null;
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
  const urls = section.match(/https?:\/\/[^\s)]+/g) || [];
  if (urls.length === 0) return { id: "A1_scope_integrity", ok: true };
  const allowed = new Set(
    ctx.caseSpec.tickers.map((t) => t.toLowerCase().replace(/[-.].*$/, "")),
  );
  const allowedNames = (ctx.caseSpec.issuer_names ?? [])
    .map((n) => n.toLowerCase())
    .filter((n) => n.length >= 3);
  // Tolerated official/regulatory domains (treated as in-scope when ticker
  // appears anywhere in the section).
  const OFFICIAL_DOMAINS = /(cnmv\.es|bolsasymercados\.es|bmegrowth\.es|ecb\.europa\.eu|esma\.europa\.eu)/i;
  const offenders: string[] = [];
  for (const url of urls) {
    const lineRegex = new RegExp(`[^\\n]*${url.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[^\\n]*`);
    const line = section.match(lineRegex)?.[0]?.toLowerCase() || "";
    let ok = false;
    for (const tk of allowed) {
      if (line.includes(tk)) { ok = true; break; }
    }
    if (!ok) {
      for (const nm of allowedNames) {
        if (line.includes(nm)) { ok = true; break; }
      }
    }
    if (!ok && OFFICIAL_DOMAINS.test(url)) ok = true;
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
  // Accept any explicit declaration of uniqueness (broad set of variants).
  const declares = /(1|un|único|unico)\s*(?:único|unico)?\s*emisor[^.\n]{0,40}cotizad[oa]/.test(md)
    || /único hotelero cotizado/.test(md)
    || /único representante/.test(md)
    || /1\s*emisor en el subsector/.test(md)
    || /mel\s+es\s+(?:el|la)\s+única|mel\s+es\s+el\s+único/.test(md)
    || /subsector(?:\s+hoteles)?\s+(?:tiene|cuenta\s+con|incluye)\s+(?:un|1|sólo|solo|únicamente|unicamente)\s+(?:1\s+)?emisor/.test(md);
  if (declares) return { id: "A5_hotels_edge", ok: true };
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

  // Fase 2 — Eje A. Si el coverage_report trae submetrics_coverage,
  // A9 cambia su semántica: solo exige las sub-métricas con cobertura
  // >= 0.70 (SUBMETRICS_COVERAGE_MIN) en el dataset entregado al LLM.
  // Las que están por debajo del umbral se IGNORAN: ni se exigen ni se
  // marcan como missing. Esto convierte A9 en un assert anti-fabricación
  // alineado con el slot del prompt (la lista de "exigibles" coincide
  // 1:1 con la lista que vio el modelo).
  const SUBMETRICS_COVERAGE_MIN = 0.70;
  const sm = (ctx.coverage_report as any)?.submetrics_coverage;
  if (sm && sm.coverage && typeof sm.coverage === "object") {
    const required: string[] = RIX_METRICS.filter(
      (m) => Number(sm.coverage[m] ?? 0) >= SUBMETRICS_COVERAGE_MIN,
    );
    if (required.length === 0) {
      // No hay ninguna exigible (dataset muy parcial): A9 pasa por defecto.
      return { id: "A9_ranking_enrichment", ok: true };
    }
    const missing = required.filter((m) => !new RegExp(`\\b${m}\\b`).test(md));
    if (missing.length === 0) return { id: "A9_ranking_enrichment", ok: true };
    return {
      id: "A9_ranking_enrichment",
      ok: false,
      msg: `Sub-métricas exigibles ausentes (cov>=70%): ${missing.join(", ")}`,
    };
  }

  // Comportamiento legacy (Fase 1, regresión cero cuando flag OFF):
  const missing = RIX_METRICS.filter((m) => !new RegExp(`\\b${m}\\b`).test(md));
  if (missing.length === 0) return { id: "A9_ranking_enrichment", ok: true };
  return { id: "A9_ranking_enrichment", ok: false, msg: `Sub-métricas ausentes: ${missing.join(", ")}` };
}

function a10_biblio_min(ctx: AssertCtx): AssertResult {
  if (ctx.caseSpec.expected_skill !== "sectorRanking") return { id: "A10_biblio_min", ok: true };
  const md = ctx.markdown;
  // Accept §6, §8 (canonical "Fuentes citadas") and any Anexo/Bibliografía heading.
  const sectionMatch = md.match(/(?:###?\s*[68]\.|Fuentes\s+citadas|Referencias\s+citadas|Anexo|Bibliograf[íi]a)[\s\S]*$/i);
  const section = sectionMatch ? sectionMatch[0] : "";
  if (!section) return { id: "A10_biblio_min", ok: false, msg: "Sin sección bibliografía" };
  const lc = section.toLowerCase();
  const issuerNames = (ctx.caseSpec.issuer_names ?? []).map((n) => n.toLowerCase());
  const ranked = ctx.caseSpec.tickers.slice(0, Math.min(5, ctx.caseSpec.n));
  const missing: string[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const tk = ranked[i];
    const stem = tk.toLowerCase().replace(/[-.].*$/, "");
    const nm = issuerNames[i] ?? "";
    const matches = lc.includes(stem) || (nm.length >= 3 && lc.includes(nm));
    if (!matches) missing.push(tk);
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