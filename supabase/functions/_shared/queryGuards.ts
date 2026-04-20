/**
 * PHASE 1.11 — Edge-case query guards (deterministic, no LLM).
 *
 * These guards run BEFORE the heavy data pipeline in `chat-intelligence`
 * to short-circuit pathological inputs with a friendly clarification
 * instead of letting them flow into the SQL/RAG layer.
 *
 * Each guard is pure, side-effect free, and individually unit-tested in
 * `chat-intelligence/__tests__/phase111.test.ts`.
 *
 * Order applied in index.ts (first hit wins):
 *   T6 prompt-injection  → fixed canned answer (no echo of system prompt)
 *   T2 welcome / empty   → welcome card
 *   T1 negative period   → "I can't go back negative weeks"
 *   T4 future date       → "no data after <floor>"
 *   T3 homonym           → disambiguation prompt
 *   T5 fuzzy unknown     → top-3 suggestions
 */

// ── T1: negative / zero period ─────────────────────────────────────
// `\b` does not match between a space and `-`; allow optional minus directly.
const NEGATIVE_PERIOD_REGEX =
  /(?:^|[^\p{L}])(?:[uú]ltim[oa]s?|past|previous|last|durante|during)\s+(-\s*\d+|0)\s+(semanas?|weeks?|meses?|months?|d[ií]as?|days?)\b/iu;

export interface InvalidPeriodResult {
  invalid: boolean;
  raw_match: string | null;
  reason: "negative" | "zero" | null;
}

export function detectInvalidPeriod(question: string | null | undefined): InvalidPeriodResult {
  const empty: InvalidPeriodResult = { invalid: false, raw_match: null, reason: null };
  if (!question) return empty;
  const m = question.match(NEGATIVE_PERIOD_REGEX);
  if (!m) return empty;
  const numTok = m[1].replace(/\s+/g, "");
  const n = parseInt(numTok, 10);
  if (Number.isNaN(n)) return empty;
  if (n < 0) return { invalid: true, raw_match: m[0], reason: "negative" };
  if (n === 0) return { invalid: true, raw_match: m[0], reason: "zero" };
  return empty;
}

// ── T2: empty / welcome ────────────────────────────────────────────
const WELCOME_PUNCT_ONLY_REGEX = /^[\s\?¿!¡.\-_*~`'"]*$/;

export function isWelcomeQuery(question: string | null | undefined): boolean {
  if (question == null) return true;
  const trimmed = question.trim();
  if (trimmed.length === 0) return true;
  if (WELCOME_PUNCT_ONLY_REGEX.test(trimmed)) return true;
  // Pure ellipsis / interjections
  if (/^(?:hola|hi|hello|hey|hola!|test|prueba)\.?$/i.test(trimmed)) return true;
  return false;
}

// ── T3: corporate homonyms ─────────────────────────────────────────
/**
 * Pairs of (canonical_a, canonical_b) that share a brand stem and must
 * never be silently merged. Detection requires BOTH variants to appear
 * in the same question.
 */
export interface HomonymPair {
  stem: string;
  variants: [string, string];
  /** Regex that must match for variant A. */
  reA: RegExp;
  reB: RegExp;
}

export const HOMONYM_PAIRS: HomonymPair[] = [
  {
    stem: "santander",
    variants: ["Banco Santander (España)", "Santander Río (Argentina)"],
    reA: /\bbanco\s+santander\b/i,
    reB: /\bsantander\s+r[ií]o\b/i,
  },
  {
    stem: "bbva",
    variants: ["BBVA (España)", "BBVA México"],
    reA: /\bbbva\b(?!\s+m[eé]xico)/i,
    reB: /\bbbva\s+m[eé]xico\b/i,
  },
];

export interface HomonymResult {
  ambiguous: boolean;
  stem: string | null;
  variants: string[];
}

export function detectHomonymAmbiguity(
  question: string | null | undefined,
): HomonymResult {
  const empty: HomonymResult = { ambiguous: false, stem: null, variants: [] };
  if (!question) return empty;
  for (const pair of HOMONYM_PAIRS) {
    if (pair.reA.test(question) && pair.reB.test(question)) {
      return { ambiguous: true, stem: pair.stem, variants: pair.variants };
    }
  }
  return empty;
}

// ── T4: future date beyond data floor ──────────────────────────────
const MONTH_MAP_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const MONTH_REGEX =
  /\b(?:en\s+|mes\s+de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?\b/i;

export interface FutureDateResult {
  future: boolean;
  requested_period_label: string | null;
  data_available_to: string | null;
}

/**
 * Detects a question that names a future period (month/year) past the
 * latest available data date. `today` and `dataAvailableTo` are
 * injected for testability (today = "now", dataAvailableTo = last
 * Sunday with full coverage, ISO YYYY-MM-DD).
 */
export function detectFuturePeriod(
  question: string | null | undefined,
  today: Date,
  dataAvailableTo: string,
): FutureDateResult {
  const empty: FutureDateResult = { future: false, requested_period_label: null, data_available_to: dataAvailableTo };
  if (!question) return empty;
  const lower = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = lower.match(MONTH_REGEX);
  if (!m) return empty;
  const monthNum = MONTH_MAP_ES[m[1]];
  if (!monthNum) return empty;
  const year = m[2] ? parseInt(m[2], 10) : today.getUTCFullYear();
  // First day of the requested month
  const requestedFirst = new Date(Date.UTC(year, monthNum - 1, 1));
  const floorDate = new Date(dataAvailableTo + "T00:00:00Z");
  if (requestedFirst.getTime() > floorDate.getTime()) {
    const label = `${m[1]} de ${year}`;
    return { future: true, requested_period_label: label, data_available_to: dataAvailableTo };
  }
  return empty;
}

// ── T5: fuzzy unknown company ──────────────────────────────────────
/** Damerau-light edit distance (insert/delete/substitute, no transposition). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Lightweight company shape used by the matcher. Real catalog has more fields. */
export interface FuzzyCandidate { issuer_name: string; ticker?: string }

export interface FuzzySuggestion { issuer_name: string; ticker?: string; score: number }

/**
 * Returns up to `limit` suggestions when the user names what looks like
 * a company (capitalized token + corporate suffix like SL/SA/Inc) but
 * NO catalog entry matches exactly. Edit-distance threshold is 35 % of
 * the candidate token length, capped at 4.
 */
export function fuzzyCompanyMatch(
  question: string | null | undefined,
  catalog: FuzzyCandidate[],
  limit = 3,
): FuzzySuggestion[] {
  if (!question || !catalog || catalog.length === 0) return [];
  // Strip corporate suffix to get the brand stem
  const corpSuffix = /\b(s\.?l\.?|s\.?a\.?|inc\.?|corp\.?|ltd\.?|gmbh|s\.?l\.?u\.?)\b/i;
  // Pick the longest capitalized token group as the candidate brand
  const brandMatch = question.match(/\b([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+)*)\b/);
  if (!brandMatch) return [];
  let brand = brandMatch[1].replace(corpSuffix, "").trim();
  brand = normalize(brand);
  if (brand.length < 4) return [];
  // Reject if brand exactly matches a known issuer (substring) → not unknown
  for (const c of catalog) {
    const n = normalize(c.issuer_name);
    if (n.includes(brand) || brand.includes(n)) return [];
  }
  const threshold = Math.min(4, Math.max(2, Math.round(brand.length * 0.35)));
  const scored: FuzzySuggestion[] = [];
  for (const c of catalog) {
    const n = normalize(c.issuer_name);
    // Compare brand against each token of the issuer name; take best
    let best = Infinity;
    for (const tok of n.split(/\s+/)) {
      if (tok.length < 3) continue;
      const d = editDistance(brand, tok);
      if (d < best) best = d;
    }
    if (best <= threshold) {
      scored.push({ issuer_name: c.issuer_name, ticker: c.ticker, score: best });
    }
  }
  scored.sort((a, b) => a.score - b.score || a.issuer_name.localeCompare(b.issuer_name));
  return scored.slice(0, limit);
}

// ── T5 (runtime): pg_trgm-backed fuzzy matcher ─────────────────────
/**
 * Extract the candidate brand stem from a free-text question. Returns
 * `null` when the question does not look like a company-shaped query
 * (no capitalized token followed by a corporate suffix). Used by the
 * SQL-backed runtime guard below to avoid a DB round-trip on queries
 * that obviously do not name a company (e.g. "ranking IBEX-35").
 */
export function extractCompanyBrand(question: string | null | undefined): string | null {
  if (!question) return null;
  const corpSuffix = /\b(s\.?l\.?u?\.?|s\.?a\.?|inc\.?|corp(?:oration)?\.?|ltd\.?|gmbh|plc|ag|holding(?:s)?)\b/i;
  // Require a corporate suffix to be present for the runtime gate. Without
  // a suffix, the cost of a false-positive clarification is too high for
  // legitimate one-word queries like "Naturgy" or "Telefónica".
  if (!corpSuffix.test(question)) return null;
  const brandMatch = question.match(
    /\b([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+)*)\b/,
  );
  if (!brandMatch) return null;
  const brand = brandMatch[1].replace(corpSuffix, "").trim();
  if (brand.length < 4) return null;
  return brand;
}

/**
 * Live, pg_trgm-backed fuzzy matcher for the runtime gate. Hits
 * `repindex_root_issuers` with `similarity(issuer_name, $1) >= floor`
 * and returns the top `limit` real issuer names.
 *
 *  - If the brand resolves to an exact / substring match on a known
 *    issuer, returns `null` (signal: NOT unknown, let pipeline run).
 *  - If no candidate clears the floor, returns `[]` (signal: unknown
 *    AND no useful suggestion — let pipeline run rather than mislead).
 *  - Otherwise returns up to `limit` suggestions sorted by similarity.
 *
 * The `supabase` parameter is typed `any` to avoid pulling the SDK
 * types into this shared module (also imported by Deno tests with no
 * network access).
 */
export async function fuzzyCompanyMatchSql(
  question: string | null | undefined,
  supabase: any,
  opts: { limit?: number; floor?: number } = {},
): Promise<{ status: "known" | "unknown_no_match" | "unknown_with_suggestions"; suggestions: FuzzySuggestion[]; brand: string | null }> {
  const brand = extractCompanyBrand(question);
  if (!brand) {
    return { status: "known", suggestions: [], brand: null };
  }
  const limit = opts.limit ?? 3;
  const floor = opts.floor ?? 0.15;
  // 1) Exact/substring shortcut — cheaper than a trigram scan and avoids
  //    false-positives on real issuers whose name happens to be short.
  try {
    const { data: exact } = await supabase
      .from("repindex_root_issuers")
      .select("issuer_name, ticker")
      .ilike("issuer_name", `%${brand}%`)
      .limit(1);
    if (exact && exact.length > 0) {
      return { status: "known", suggestions: [], brand };
    }
  } catch (_e) {
    // fall through to trigram path
  }
  // 2) pg_trgm similarity ranking via the public.similarity() wrapper
  //    installed by migration 20260420_pg_trgm_for_fuzzy_company_match.
  try {
    const { data, error } = await supabase.rpc("fuzzy_match_issuers", {
      brand_in: brand,
      floor_in: floor,
      limit_in: limit,
    });
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) {
      const suggestions: FuzzySuggestion[] = data.map((r: any) => ({
        issuer_name: r.issuer_name,
        ticker: r.ticker ?? undefined,
        score: typeof r.sim === "number" ? r.sim : Number(r.sim),
      }));
      return { status: "unknown_with_suggestions", suggestions, brand };
    }
  } catch (_e) {
    // RPC not available — fall back to client-side ordering on a
    // bounded pull. This keeps the gate functional even if the
    // migration has not propagated yet.
    try {
      const { data: pool } = await supabase
        .from("repindex_root_issuers")
        .select("issuer_name, ticker")
        .limit(500);
      if (pool && pool.length > 0) {
        const suggestions = fuzzyCompanyMatch(
          brand,
          pool.map((c: any) => ({ issuer_name: c.issuer_name, ticker: c.ticker })),
          limit,
        );
        if (suggestions.length > 0) {
          return { status: "unknown_with_suggestions", suggestions, brand };
        }
      }
    } catch (_e2) {
      // give up silently
    }
  }
  return { status: "unknown_no_match", suggestions: [], brand };
}

// ── T6: prompt-injection / system-prompt exfiltration ──────────────
const PROMPT_INJECTION_REGEX =
  /\b(?:ignore|ignora|olvida|forget|disregard)\s+(?:all\s+|todas?\s+las\s+|previous\s+|prior\s+|anterior(?:es)?\s+)?(?:instructions?|instrucci[oó]n(?:es)?|prompt|messages?|reglas?|rules?)\b/i;
const PROMPT_EXFIL_REGEX =
  /\b(?:devuelve|muestra|reveal|show|print|leak|dame|give\s+me|repeat)\s+(?:el\s+|the\s+|tu\s+|your\s+)?(?:system\s+prompt|prompt\s+del\s+sistema|instrucciones?\s+del\s+sistema|system\s+message|initial\s+prompt)\b/i;
const ROLE_HIJACK_REGEX =
  /\b(?:act\s+as|act[uú]a\s+como|pretend\s+to\s+be|finge\s+ser|you\s+are\s+now|ahora\s+eres)\b/i;

export interface InjectionResult {
  detected: boolean;
  kind: "ignore_instructions" | "exfil_prompt" | "role_hijack" | null;
  raw_match: string | null;
}

export function detectPromptInjection(question: string | null | undefined): InjectionResult {
  const empty: InjectionResult = { detected: false, kind: null, raw_match: null };
  if (!question) return empty;
  const exfil = question.match(PROMPT_EXFIL_REGEX);
  if (exfil) return { detected: true, kind: "exfil_prompt", raw_match: exfil[0] };
  const ign = question.match(PROMPT_INJECTION_REGEX);
  if (ign) return { detected: true, kind: "ignore_instructions", raw_match: ign[0] };
  const hi = question.match(ROLE_HIJACK_REGEX);
  if (hi) return { detected: true, kind: "role_hijack", raw_match: hi[0] };
  return empty;
}