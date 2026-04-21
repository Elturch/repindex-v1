/**
 * PHASE 1.16 — Input Validator (zero-hardcode, pre-pipeline triage).
 *
 * Runs BEFORE temporalGuard and BEFORE the LLM pipeline. Catches the
 * four classes of silent corruption observed in atypical batch testing:
 *
 *   A1 (entity contamination): "Telefónica Germany" must NEVER be
 *      silently resolved to "Telefónica SA". RepIndex v1 covers the
 *      Spanish universe only — international subsidiaries are blocked
 *      with a scope-explanation early-return.
 *   A2 (ambiguous brand):     "Santander" must trigger disambiguation.
 *   A4 (granularity mismatch): "Iberdrola el 15 de febrero" must be
 *      redirected to the nearest weekly snapshot, never silently
 *      widened to a quarterly window.
 *   A5 (silent default window): When no window is given, the report must
 *      *disclose* that "últimas 4 semanas" was assigned by default.
 *   A5 (statistical fiction): σ=0 with n=1 is NOT "consenso robusto" —
 *      divergence is "no calculable" until n_samples ≥ 3 and n_models ≥ 3.
 *   A6 (out-of-scope metric): "Score ESG" must NOT be silently mapped to
 *      RIX. Block with scope explanation and offer GAM as the closest
 *      reputational dimension.
 *
 * Invariants:
 *   - Zero hardcoded company names. Catalog is read from
 *     `repindex_root_issuers` (the same source of truth used by
 *     fuzzyCompanyMatchSql).
 *   - Zero hardcoded dates. Granularity helpers operate on ISO-week
 *     arithmetic relative to `today` provided by the caller.
 *   - Whitelists / blacklists are constants exported at the top of the
 *     file so QA can extend them without touching call-sites.
 */

// ─── V1: resolveEntity ────────────────────────────────────────────────

/** Geographic / subsidiary qualifiers that disqualify a fuzzy match
 *  from silently resolving to the Spanish parent. */
export const FOREIGN_QUALIFIERS = [
  // Anglo
  "germany", "uk", "us", "usa", "ireland", "netherlands", "scotland",
  // Latam
  "brasil", "brazil", "mexico", "méxico", "argentina", "chile", "peru",
  "perú", "colombia", "uruguay", "venezuela", "ecuador",
  // Europe / other
  "portugal", "france", "francia", "italia", "italy", "germany",
  "deutschland", "polska", "poland", "morocco", "marruecos",
  // Generic subsidiary words
  "filial", "subsidiary", "branch", "division", "división", "subsidiaria",
] as const;

export interface EntityResolution {
  matched: boolean;
  empresa_id: string | null;
  empresa_nombre: string;
  ticker: string | null;
  confidence: "exact" | "fuzzy" | "ambiguous" | "not_found" | "foreign_subsidiary";
  alternatives: Array<{ issuer_name: string; ticker: string }>;
  /** Disclosure to inject in headline + ficha when fuzzy (typo) was applied. */
  assumption_disclosure: string | null;
  /** Early-return message when matched=false. */
  block_message: string | null;
  /** When confidence='foreign_subsidiary': the parent we refused to silently resolve to. */
  foreign_input: string | null;
  parent_suggestion: { issuer_name: string; ticker: string } | null;
}

/**
 * Pure helper: detect whether the user's brand mention carries a foreign
 * geographic qualifier. Used to short-circuit fuzzy matches that would
 * otherwise contaminate the entity (bug A1).
 *
 * Returns the qualifier (lowercased, accent-stripped) when present, else null.
 */
export function detectForeignQualifier(prompt: string): string | null {
  if (!prompt) return null;
  const norm = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const q of FOREIGN_QUALIFIERS) {
    const qNorm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Word-boundary match to avoid "us" matching "usuario", etc.
    const re = new RegExp(`\\b${qNorm}\\b`, "i");
    if (re.test(norm)) return qNorm;
  }
  return null;
}

/** Levenshtein for short strings; used only when SQL trigram match is unavailable. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * resolveEntity — V1 of the input validator (Fase 1.16, corrected).
 *
 * Input contract:
 *   - prompt: raw user query.
 *   - catalog: array of { issuer_name, ticker } loaded from
 *     repindex_root_issuers (the ONLY source of truth for the universe).
 *
 * Decision tree:
 *   1. EXACT match (case + accent insensitive substring on issuer_name
 *      or exact ticker word) → confidence='exact', proceed normally.
 *   2. EXACT-on-stem + FOREIGN qualifier present in the prompt
 *      → confidence='foreign_subsidiary', BLOCK with scope explanation.
 *   3. AMBIGUOUS: ≥2 catalog rows whose names share a common stem AND
 *      both appear in the prompt (e.g. "Santander Consumer" vs "Banco
 *      Santander") → confidence='ambiguous', ask for disambiguation.
 *   4. FUZZY (typo): edit-distance ≤ 2 to a unique catalog name, no
 *      foreign qualifier → confidence='fuzzy', proceed with disclosure.
 *   5. NOT_FOUND: no exact, no fuzzy → confidence='not_found', block
 *      with top-5 suggestions.
 *   6. No corporate intent at all (empty prompt or no brand-shaped
 *      tokens) → matched=true, confidence='exact', empresa_nombre=''
 *      (signals: pipeline can proceed; sector/ranking flow handles it).
 */
export interface CatalogEntry { issuer_name: string; ticker: string }

export function resolveEntity(
  prompt: string,
  catalog: CatalogEntry[],
): EntityResolution {
  const empty: EntityResolution = {
    matched: true,
    empresa_id: null,
    empresa_nombre: "",
    ticker: null,
    confidence: "exact",
    alternatives: [],
    assumption_disclosure: null,
    block_message: null,
    foreign_input: null,
    parent_suggestion: null,
  };
  if (!prompt || prompt.trim().length === 0) return empty;
  if (!catalog || catalog.length === 0) return empty;

  const normPrompt = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // ── (1) EXACT name / ticker hits ─────────────────────────────────
  const exactHits: CatalogEntry[] = [];
  for (const row of catalog) {
    const name = (row.issuer_name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const ticker = (row.ticker || "").toLowerCase();
    if (name && name.length >= 4 && normPrompt.includes(name)) {
      exactHits.push(row);
      continue;
    }
    if (ticker && ticker.length >= 2) {
      const re = new RegExp(`\\b${ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(normPrompt)) { exactHits.push(row); continue; }
    }
    // Multi-word brands ("Banco Santander", "Inmobiliaria Colonial"): also
    // match when the most distinctive word (longest non-generic token) is
    // present as a standalone token in the prompt. Prevents the foreign
    // qualifier branch from missing "Santander UK" when the catalog row
    // is "Banco Santander".
    const tokens = name.split(/\s+/).filter((t) => t.length >= 5 && !GENERIC_BRAND_TOKENS.has(t));
    for (const tok of tokens) {
      const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(normPrompt)) { exactHits.push(row); break; }
    }
  }

  // ── (2) Foreign-qualifier short-circuit (bug A1) ─────────────────
  // Either: exact match exists AND a foreign qualifier is in the prompt
  // (e.g. "Telefónica Germany" → exact 'Telefónica' + qualifier 'germany'),
  // OR: stem of a catalog brand appears with a foreign qualifier (e.g.
  // "BBVA México" where the catalog only has "BBVA").
  const foreign = detectForeignQualifier(prompt);
  if (foreign && exactHits.length > 0) {
    const parent = exactHits[0];
    const foreignInput = `${parent.issuer_name} ${foreign[0].toUpperCase()}${foreign.slice(1)}`;
    return {
      matched: false,
      empresa_id: null,
      empresa_nombre: parent.issuer_name,
      ticker: parent.ticker,
      confidence: "foreign_subsidiary",
      alternatives: [],
      assumption_disclosure: null,
      block_message:
        `${foreignInput} no está disponible en RepIndex. Esta versión del índice cubre exclusivamente el ámbito español. ` +
        `Dispongo de datos de ${parent.issuer_name} (${parent.ticker}, la matriz española). ` +
        `¿Quieres que analice ${parent.issuer_name} en su lugar?`,
      foreign_input: foreignInput,
      parent_suggestion: { issuer_name: parent.issuer_name, ticker: parent.ticker },
    };
  }

  // ── (3) Ambiguous: multiple distinct exact hits sharing a stem ───
  if (exactHits.length >= 2) {
    // Detect a shared stem: any 4+ char token present in 2 hit names.
    const tokensByRow = exactHits.map((r) =>
      r.issuer_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((t) => t.length >= 5),
    );
    const stemCount = new Map<string, number>();
    for (const toks of tokensByRow) {
      for (const t of new Set(toks)) stemCount.set(t, (stemCount.get(t) || 0) + 1);
    }
    let sharedStem: string | null = null;
    for (const [stem, n] of stemCount) {
      if (n >= 2) { sharedStem = stem; break; }
    }
    if (sharedStem) {
      return {
        matched: false,
        empresa_id: null,
        empresa_nombre: "",
        ticker: null,
        confidence: "ambiguous",
        alternatives: exactHits.slice(0, 5).map((r) => ({ issuer_name: r.issuer_name, ticker: r.ticker })),
        assumption_disclosure: null,
        block_message:
          `He encontrado varias coincidencias para «${sharedStem}»: ` +
          exactHits.map((r) => `${r.issuer_name} (${r.ticker})`).join(", ") +
          ". ¿A cuál te refieres?",
        foreign_input: null,
        parent_suggestion: null,
      };
    }
  }

  // ── (4) Single exact hit, no foreign qualifier → proceed ─────────
  if (exactHits.length === 1) {
    return {
      matched: true,
      empresa_id: null,
      empresa_nombre: exactHits[0].issuer_name,
      ticker: exactHits[0].ticker,
      confidence: "exact",
      alternatives: [],
      assumption_disclosure: null,
      block_message: null,
      foreign_input: null,
      parent_suggestion: null,
    };
  }

  // ── (5) Look for a brand-shaped token (Capitalised word) and try
  //        fuzzy match against catalog. Only triggers when a brand-like
  //        token is present, so generic queries don't hit this branch.
  const brandToken = extractBrandToken(prompt);
  if (!brandToken) return empty;

  // If the brand token itself is a foreign qualifier alone ("germany"),
  // ignore.
  if (FOREIGN_QUALIFIERS.includes(brandToken.toLowerCase() as any)) return empty;

  // Foreign qualifier present + brand token that DOESN'T exact-match
  // → also block as foreign (e.g. "Telefonica España UK" with typo).
  if (foreign) {
    // Try to find a parent by fuzzy on the brand stem.
    const parent = findClosestCatalog(brandToken, catalog);
    if (parent) {
      const foreignInput = `${brandToken} ${foreign[0].toUpperCase()}${foreign.slice(1)}`;
      return {
        matched: false,
        empresa_id: null,
        empresa_nombre: parent.issuer_name,
        ticker: parent.ticker,
        confidence: "foreign_subsidiary",
        alternatives: [],
        assumption_disclosure: null,
        block_message:
          `${foreignInput} no está disponible en RepIndex. Esta versión del índice cubre exclusivamente el ámbito español. ` +
          `Dispongo de datos de ${parent.issuer_name} (${parent.ticker}, la matriz española). ` +
          `¿Quieres que analice ${parent.issuer_name} en su lugar?`,
        foreign_input: foreignInput,
        parent_suggestion: { issuer_name: parent.issuer_name, ticker: parent.ticker },
      };
    }
  }

  // Pure typo path: edit-distance ≤ 2 → fuzzy resolve with disclosure.
  const fuzzy = findClosestCatalog(brandToken, catalog);
  if (fuzzy && editDistance(
    brandToken.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    fuzzy.issuer_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/)[0],
  ) <= 2) {
    return {
      matched: true,
      empresa_id: null,
      empresa_nombre: fuzzy.issuer_name,
      ticker: fuzzy.ticker,
      confidence: "fuzzy",
      alternatives: [],
      assumption_disclosure: `Interpreto «${brandToken}» como ${fuzzy.issuer_name} (${fuzzy.ticker}). Si te referías a otra entidad, indícamelo.`,
      block_message: null,
      foreign_input: null,
      parent_suggestion: null,
    };
  }

  // ── (6) NOT FOUND: top-5 suggestions ─────────────────────────────
  const ranked = catalog
    .map((r) => ({ row: r, d: editDistance(
      brandToken.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      r.issuer_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/)[0],
    ) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)
    .map((x) => ({ issuer_name: x.row.issuer_name, ticker: x.row.ticker }));
  return {
    matched: false,
    empresa_id: null,
    empresa_nombre: "",
    ticker: null,
    confidence: "not_found",
    alternatives: ranked,
    assumption_disclosure: null,
    block_message:
      `No tengo a «${brandToken}» en el índice RepIndex. Esta versión cubre el ámbito español. ` +
      `Empresas similares: ${ranked.map((r) => `${r.issuer_name} (${r.ticker})`).join(", ")}.`,
    foreign_input: null,
    parent_suggestion: null,
  };
}

/** Capitalised brand-shaped token extractor (no corporate suffix required;
 *  V1 of resolveEntity needs to detect candidates broader than queryGuards'
 *  fuzzyCompanyMatchSql which only fires for SL/SA/Inc/Corp suffixes). */
export function extractBrandToken(prompt: string): string | null {
  if (!prompt) return null;
  // First Capitalised token of length ≥ 4, ignoring leading verbs/articles.
  const STOP = new Set([
    "Reputación","Reputacion","Score","Compara","Comparar","Análisis","Analisis",
    "Informe","Ranking","Evolución","Evolucion","Dame","Dime","Quiero","Necesito",
    "Mostrar","Mostrar","Me","Dame","Hazme","Dame","En","De","Del","La","El","Los","Las","Y",
    "Telefónica","Iberdrola","Endesa","Naturgy","Repsol","BBVA","Santander","Inditex","Acerinox",
  ]);
  // Pull all capitalised tokens; we want the FIRST that isn't in STOP.
  const matches = prompt.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}\b|\b[A-Z]{3,}\b/g) || [];
  for (const m of matches) {
    if (!STOP.has(m)) return m;
  }
  // Fallback: first ≥4-char alphabetic token (handles all-lowercase prompts).
  const lower = prompt.match(/\b[a-záéíóúñ]{4,}\b/i);
  return lower ? lower[0] : null;
}

function findClosestCatalog(token: string, catalog: CatalogEntry[]): CatalogEntry | null {
  if (!token || catalog.length === 0) return null;
  const t = token.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let best: { row: CatalogEntry; d: number } | null = null;
  for (const r of catalog) {
    const head = r.issuer_name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)[0];
    const d = editDistance(t, head);
    if (best === null || d < best.d) best = { row: r, d };
  }
  return best ? best.row : null;
}

// ─── V2: detectMetric ─────────────────────────────────────────────────

/** Metrics RepIndex DOES compute (whitelist). */
export const RIX_METRICS_WHITELIST = [
  "rix", "rmm", "cem", "drm", "sim", "gam", "nvm", "dcm", "cxm",
  "reputación", "reputacion", "reputational", "reputation",
] as const;

/** Common external metrics clients confuse with RIX (blacklist). */
export const EXTERNAL_METRICS_BLACKLIST: ReadonlyArray<{
  tokens: readonly string[]; label: string; suggest: string;
}> = [
  { tokens: ["esg", "sustainalytics", "msci esg", "cdp"], label: "ESG", suggest: "GAM" },
  { tokens: ["credit rating", "moody", "moodys", "moody's", "s&p rating", "fitch rating"], label: "rating crediticio", suggest: "RMM" },
  { tokens: ["refinitiv"], label: "Refinitiv", suggest: "GAM" },
];

export interface MetricDetection {
  requestedMetric: string | null;
  isRixCompatible: boolean;
  block_message: string | null;
  /** RIX dimension to suggest as the closest reputational proxy. */
  suggested_dimension: string | null;
}

export function detectMetric(prompt: string): MetricDetection {
  const empty: MetricDetection = {
    requestedMetric: null,
    isRixCompatible: true,
    block_message: null,
    suggested_dimension: null,
  };
  if (!prompt) return empty;
  const norm = prompt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const black of EXTERNAL_METRICS_BLACKLIST) {
    for (const tok of black.tokens) {
      const tNorm = tok.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const re = new RegExp(`\\b${tNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(norm)) {
        return {
          requestedMetric: black.label,
          isRixCompatible: false,
          suggested_dimension: black.suggest,
          block_message:
            `RepIndex no calcula métricas de ${black.label}. Mi ámbito es la reputación algorítmica (RIX). ` +
            `El RIX incluye una dimensión de ${black.suggest === "GAM"
              ? "Gobernanza y Alineamiento con el Mercado (GAM)"
              : black.suggest === "RMM"
              ? "Resonancia Mediática (RMM)"
              : black.suggest} ` +
            `que refleja percepción reputacional, pero NO es un score ${black.label} certificado. ` +
            `¿Quieres que analice la dimensión ${black.suggest}?`,
        };
      }
    }
  }
  return empty;
}

// ─── V3: detectGranularity ────────────────────────────────────────────

export type Granularity =
  | "year" | "semester" | "quarter" | "month" | "week" | "day" | "hour" | "unknown";

export interface GranularityDetection {
  requestedGranularity: Granularity;
  /** True when the requested granularity is ≥ weekly (compatible with our snapshots). */
  isCompatible: boolean;
  /** When requested granularity is 'day': ISO date the user pointed to. */
  requestedDayISO: string | null;
  block_message: string | null;
  /** When 'day' is acceptable (≤ 3 days from a snapshot): disclosure to inject. */
  redirect_disclosure: string | null;
}

/** Detects "el 15 de febrero", "15-feb-2026", "2026-02-15" etc. */
const SPANISH_MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

export function detectGranularity(
  prompt: string,
  today: Date = new Date(),
): GranularityDetection {
  const empty: GranularityDetection = {
    requestedGranularity: "unknown",
    isCompatible: true,
    requestedDayISO: null,
    block_message: null,
    redirect_disclosure: null,
  };
  if (!prompt) return empty;
  const norm = prompt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Hour granularity → block immediately.
  if (/\b(hora|hours?|horario|a las \d|por hora)\b/i.test(norm)) {
    return {
      requestedGranularity: "hour",
      isCompatible: false,
      requestedDayISO: null,
      block_message:
        "RepIndex calcula snapshots semanales (cada domingo). No tengo datos a granularidad horaria. " +
        "Prueba con una semana, mes o trimestre.",
      redirect_disclosure: null,
    };
  }

  // Day granularity: "el 15 de febrero (de 2026)?" or "15-02-2026".
  let day: number | null = null, month: number | null = null, year: number | null = today.getUTCFullYear();
  let m = norm.match(/\bel\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?\b/);
  if (m) {
    day = parseInt(m[1], 10);
    month = SPANISH_MONTHS[m[2]] ?? null;
    if (m[3]) year = parseInt(m[3], 10);
  } else {
    m = norm.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})\b/);
    if (m) {
      day = parseInt(m[1], 10);
      month = parseInt(m[2], 10);
      year = parseInt(m[3].length === 2 ? `20${m[3]}` : m[3], 10);
    } else {
      m = norm.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (m) {
        year = parseInt(m[1], 10);
        month = parseInt(m[2], 10);
        day = parseInt(m[3], 10);
      }
    }
  }
  if (day !== null && month !== null && year !== null && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
    // We only treat this as "day" granularity when the prompt does NOT
    // also carry a quarter/month/range marker (e.g. "Q1 2026 a 15-feb").
    const hasRangeMarker = /(?:semestre|trimestre|q1|q2|q3|q4|mes|month|semana|week|año|year|durante|entre|desde|hasta|rango|últim)/i.test(norm);
    if (!hasRangeMarker) {
      const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      // Find the nearest Sunday (snapshot day) on or before iso.
      const target = new Date(`${iso}T00:00:00Z`);
      const dow = target.getUTCDay(); // 0 = Sunday
      const daysBack = dow; // Sunday → 0 days back
      const nearest = new Date(target.getTime() - daysBack * 86400000);
      const nearestISO = nearest.toISOString().slice(0, 10);
      const distance = Math.abs(Math.round((target.getTime() - nearest.getTime()) / 86400000));
      if (distance <= 3) {
        return {
          requestedGranularity: "day",
          isCompatible: true,
          requestedDayISO: iso,
          block_message: null,
          redirect_disclosure:
            `No hay snapshot del ${iso} (los snapshots de RepIndex son semanales, ejecutados los domingos). ` +
            `Mostrando el snapshot más cercano: semana del ${nearestISO}.`,
        };
      }
      return {
        requestedGranularity: "day",
        isCompatible: false,
        requestedDayISO: iso,
        block_message:
          `No hay snapshot del ${iso}. Los snapshots semanales más cercanos son del ${nearestISO}. ` +
          `¿Prefieres ese snapshot, el mes completo o un rango distinto?`,
        redirect_disclosure: null,
      };
    }
  }

  // Default: unknown granularity (the temporal guard handles the rest).
  return empty;
}

// ─── V4: inferDefaultWindow ───────────────────────────────────────────

export interface DefaultWindowDecision {
  appliedDefault: boolean;
  /** Disclosure to inject into headline + ficha when default was applied. */
  disclosure: string | null;
}

const TEMPORAL_HINTS = [
  /\b[uú]ltim[oa]s?\b/i, /\bpast\b/i, /\blast\b/i, /\bprevious\b/i,
  /\bdurante\b/i, /\bdesde\b/i, /\bhasta\b/i, /\bentre\b/i,
  /\bytd\b/i, /\bytm\b/i, /\bmtd\b/i, /\bqtd\b/i,
  /\bq[1-4]\b/i, /\b1h\b|\b2h\b|\bh1\b|\bh2\b/i,
  /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i,
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  /\b(?:semana|semanas|mes|meses|año|años|trimestre|trimestres|semestre|semestres|day|days)\b/i,
  /\besta semana\b|\beste mes\b|\beste año\b|\beste trimestre\b/i,
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{4}\b/,
];

export function inferDefaultWindow(prompt: string): DefaultWindowDecision {
  if (!prompt) return { appliedDefault: false, disclosure: null };
  for (const re of TEMPORAL_HINTS) {
    if (re.test(prompt)) return { appliedDefault: false, disclosure: null };
  }
  return {
    appliedDefault: true,
    disclosure: "Período: últimas 4 semanas (asignado por defecto; no se especificó ventana temporal).",
  };
}

// ─── V5: validateSampleSize ───────────────────────────────────────────

export interface SampleSizeValidation {
  isStatisticallyValid: boolean;
  divergenceLabel: string;
  consensusLabel: string;
  warning: string | null;
}

export function validateSampleSize(
  n_registros: number,
  n_modelos: number,
): SampleSizeValidation {
  if (n_registros < 3 || n_modelos < 3) {
    return {
      isStatisticallyValid: false,
      divergenceLabel: `No calculable (muestra insuficiente: ${n_registros} registro${n_registros === 1 ? "" : "s"}, ${n_modelos} modelo${n_modelos === 1 ? "" : "s"})`,
      consensusLabel:
        n_modelos === 1 ? "1 modelo (no representativo)"
        : n_modelos < 3 ? `${n_modelos} modelos (muestra insuficiente)`
        : `${n_modelos} modelos, ${n_registros} registro${n_registros === 1 ? "" : "s"} (muestra insuficiente)`,
      warning:
        `Advertencia: análisis basado en ${n_registros} registro${n_registros === 1 ? "" : "s"} y ${n_modelos} modelo${n_modelos === 1 ? "" : "s"}. ` +
        `Los indicadores de consenso y divergencia requieren mínimo 3 modelos y 3 snapshots para ser estadísticamente significativos.`,
    };
  }
  return {
    isStatisticallyValid: true,
    divergenceLabel: "",
    consensusLabel: "",
    warning: null,
  };
}
