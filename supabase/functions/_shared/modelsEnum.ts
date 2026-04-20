/**
 * Single source of truth for the AI model enum used by the Agente Rix.
 *
 * Canonical names match EXACTLY the values stored in `rix_runs_v2."02_model_name"`.
 * (Importante: la BD usa "Google Gemini", no "Gemini".)
 *
 * Phase 1.7 additions:
 *  - Expanded ALIAS_MAP (GPT4/GPT-4/GPT-4o, Gemini 1.5/2/2.5/Pro/Flash, Grok 2/3/4, DSK, PPX/Perplex…)
 *  - UNSUPPORTED_MODELS list (Claude, Llama, Mistral, Nemotron) with detection helper.
 *  - MODEL_GROUPS (americanas, chinos, openai, google, anthropic, "open source", todos…).
 *  - parseModelsWithNegation(query): handles "sin contar X", "excepto Y", "menos Z" etc.
 *
 * Strategy: NO LLM. Deterministic regex + dictionaries.
 */

export const MODEL_ENUM = [
  "ChatGPT",
  "Perplexity",
  "Google Gemini",
  "DeepSeek",
  "Grok",
  "Qwen",
] as const;

export type ModelName = typeof MODEL_ENUM[number];

/**
 * Models we know about but DO NOT monitor. Detection of these triggers an
 * "unsupported model" warning in the report. They are NEVER added to
 * `model_names`.
 */
export const UNSUPPORTED_MODELS = [
  "Claude",
  "Llama",
  "Mistral",
  "Nemotron",
] as const;
export type UnsupportedModelName = typeof UNSUPPORTED_MODELS[number];

const UNSUPPORTED_ALIAS_MAP: Record<string, UnsupportedModelName> = {
  "claude": "Claude",
  "claude 3": "Claude",
  "claude 3.5": "Claude",
  "claude sonnet": "Claude",
  "claude opus": "Claude",
  "claude haiku": "Claude",
  "anthropic claude": "Claude",
  "llama": "Llama",
  "llama 2": "Llama",
  "llama 3": "Llama",
  "llama2": "Llama",
  "llama3": "Llama",
  "meta llama": "Llama",
  "mistral": "Mistral",
  "mixtral": "Mistral",
  "nemotron": "Nemotron",
};

/**
 * Alias → canonical name map. Keys are lowercase, whitespace-collapsed.
 *
 * Phase 1.7: expanded with model-version suffixes (gpt-4, gpt-4o, gemini 2.5,
 * grok 3, deepseek-v3, etc.). Boundary handled by MODEL_REGEX.
 */
const ALIAS_MAP: Record<string, ModelName> = {
  // ── ChatGPT family ──
  "chatgpt": "ChatGPT",
  "chat gpt": "ChatGPT",
  "gpt": "ChatGPT",
  "gpt-3": "ChatGPT",
  "gpt3": "ChatGPT",
  "gpt-3.5": "ChatGPT",
  "gpt3.5": "ChatGPT",
  "gpt-4": "ChatGPT",
  "gpt4": "ChatGPT",
  "gpt 4": "ChatGPT",
  "gpt-4o": "ChatGPT",
  "gpt4o": "ChatGPT",
  "gpt-4-turbo": "ChatGPT",
  "gpt-5": "ChatGPT",
  "gpt5": "ChatGPT",
  "openai": "ChatGPT",
  "open ai": "ChatGPT",
  "o1": "ChatGPT",
  "o3": "ChatGPT",
  // ── Perplexity ──
  "perplexity": "Perplexity",
  "perplex": "Perplexity",
  "pplx": "Perplexity",
  "ppx": "Perplexity",
  // ── Gemini (canonical = "Google Gemini") ──
  "gemini": "Google Gemini",
  "google gemini": "Google Gemini",
  "gemini 1.5": "Google Gemini",
  "gemini-1.5": "Google Gemini",
  "gemini 2": "Google Gemini",
  "gemini 2.0": "Google Gemini",
  "gemini-2.0": "Google Gemini",
  "gemini 2.5": "Google Gemini",
  "gemini-2.5": "Google Gemini",
  "gemini pro": "Google Gemini",
  "gemini flash": "Google Gemini",
  "gemini-pro": "Google Gemini",
  "gemini-flash": "Google Gemini",
  "google": "Google Gemini",
  "bard": "Google Gemini",
  // ── DeepSeek ──
  "deepseek": "DeepSeek",
  "deep seek": "DeepSeek",
  "deepseek-v2": "DeepSeek",
  "deepseek v2": "DeepSeek",
  "deepseek-v3": "DeepSeek",
  "deepseek v3": "DeepSeek",
  "deepseek-r1": "DeepSeek",
  "dsk": "DeepSeek",
  // ── Grok ──
  "grok": "Grok",
  "grok 2": "Grok",
  "grok-2": "Grok",
  "grok 3": "Grok",
  "grok-3": "Grok",
  "grok 4": "Grok",
  "grok-4": "Grok",
  "xai": "Grok",
  "x ai": "Grok",
  "x.ai": "Grok",
  // ── Qwen ──
  "qwen": "Qwen",
  "qwen2": "Qwen",
  "qwen 2": "Qwen",
  "qwen-2.5": "Qwen",
  "qwen2.5": "Qwen",
  "alibaba": "Qwen",
  "tongyi": "Qwen",
};

/**
 * Semantic groups → canonical model subsets.
 * Lookup is lowercase + accent-stripped.
 */
export const MODEL_GROUPS: Record<string, ModelName[]> = {
  // Geographic groups
  "americanas": ["ChatGPT", "Google Gemini", "Grok", "Perplexity"],
  "americanos": ["ChatGPT", "Google Gemini", "Grok", "Perplexity"],
  "ias americanas": ["ChatGPT", "Google Gemini", "Grok", "Perplexity"],
  "modelos americanos": ["ChatGPT", "Google Gemini", "Grok", "Perplexity"],
  "estadounidenses": ["ChatGPT", "Google Gemini", "Grok", "Perplexity"],
  "us models": ["ChatGPT", "Google Gemini", "Grok", "Perplexity"],
  "us ai": ["ChatGPT", "Google Gemini", "Grok", "Perplexity"],
  "chinos": ["DeepSeek", "Qwen"],
  "chinas": ["DeepSeek", "Qwen"],
  "ias chinas": ["DeepSeek", "Qwen"],
  "modelos chinos": ["DeepSeek", "Qwen"],
  "chinese models": ["DeepSeek", "Qwen"],
  "chinese ai": ["DeepSeek", "Qwen"],
  // Vendor groups
  "openai": ["ChatGPT"],
  "open ai": ["ChatGPT"],
  "google": ["Google Gemini"],
  "anthropic": [], // unsupported; emits warning
  // License groups
  "open source": ["DeepSeek", "Qwen"],
  "opensource": ["DeepSeek", "Qwen"],
  "open-source": ["DeepSeek", "Qwen"],
  // "All" group → returns full enum
  "todos": [...MODEL_ENUM],
  "todas": [...MODEL_ENUM],
  "all": [...MODEL_ENUM],
  "all models": [...MODEL_ENUM],
  "todos los modelos": [...MODEL_ENUM],
  "los 6": [...MODEL_ENUM],
  "los seis": [...MODEL_ENUM],
};

const ALIAS_KEYS_SORTED = Object.keys(ALIAS_MAP).sort(
  (a, b) => b.length - a.length,
);
const ESCAPED_ALIASES = ALIAS_KEYS_SORTED.map((k) =>
  k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
);
export const MODEL_REGEX = new RegExp(
  `\\b(${ESCAPED_ALIASES.join("|")})\\b`,
  "gi",
);

const UNSUPPORTED_KEYS_SORTED = Object.keys(UNSUPPORTED_ALIAS_MAP).sort(
  (a, b) => b.length - a.length,
);
const ESCAPED_UNSUPPORTED = UNSUPPORTED_KEYS_SORTED.map((k) =>
  k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
);
export const UNSUPPORTED_MODEL_REGEX = new RegExp(
  `\\b(${ESCAPED_UNSUPPORTED.join("|")})\\b`,
  "gi",
);

const GROUP_KEYS_SORTED = Object.keys(MODEL_GROUPS).sort(
  (a, b) => b.length - a.length,
);
const ESCAPED_GROUPS = GROUP_KEYS_SORTED.map((k) =>
  k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
);
export const MODEL_GROUP_REGEX = new RegExp(
  `\\b(${ESCAPED_GROUPS.join("|")})\\b`,
  "gi",
);

/**
 * Negation triggers. When one of these appears within ±25 chars of a model
 * mention, we treat the parse as "exclude these models from MODEL_ENUM".
 */
const NEGATION_REGEX = /\b(sin(\s+contar|\s+incluir)?|excepto|salvo|menos|no\s+inclu(y|i)as?|fuera\s+de|exclu[yi]e?n?d?o?|quitando|sin\s+tener\s+en\s+cuenta|except|excluding|without|but\s+not)\b/gi;

const NEGATION_PROXIMITY_CHARS = 25;

/**
 * Result of parsing a free-text query for AI-model mentions.
 *
 *  - model_names:        canonical models the query asks about.
 *                        Empty array means "no explicit mention" (caller decides
 *                        whether that defaults to all 6).
 *  - mode:               'inclusive' (mention → include) | 'exclusive' (negation
 *                        detected → MODEL_ENUM minus mentions) | 'group'
 *                        (a semantic group like "americanas" was used) | 'none'.
 *  - unsupported_models: any non-monitored model the user named (Claude, Llama…).
 *                        UI must render an "AVISO … no monitorizado" line.
 *  - matched_aliases:    raw aliases that matched, useful for debug logs.
 *  - matched_group:      the semantic group key, when mode='group'.
 */
export interface ParsedModelsResult {
  model_names: ModelName[];
  mode: "inclusive" | "exclusive" | "group" | "none";
  unsupported_models: UnsupportedModelName[];
  matched_aliases: string[];
  matched_group: string | null;
}

function normalizeAliasKey(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Detect unsupported models mentioned in the query. Always runs, regardless
 * of the inclusive/exclusive parse outcome.
 */
export function detectUnsupportedModels(question: string): UnsupportedModelName[] {
  if (!question) return [];
  const matches = question.matchAll(UNSUPPORTED_MODEL_REGEX);
  const seen = new Set<UnsupportedModelName>();
  const ordered: UnsupportedModelName[] = [];
  for (const m of matches) {
    const key = normalizeAliasKey(m[1]);
    const canonical = UNSUPPORTED_ALIAS_MAP[key] ?? UNSUPPORTED_ALIAS_MAP[key.replace(/\s/g, "")];
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      ordered.push(canonical);
    }
  }
  return ordered;
}

/**
 * Match a semantic model group (e.g., "americanas", "open source", "openai")
 * and return the corresponding model subset. First match wins.
 */
function detectModelGroup(question: string): { key: string; models: ModelName[] } | null {
  if (!question) return null;
  const lower = stripAccents(question.toLowerCase());
  // Try longest groups first (already sorted)
  for (const groupKey of GROUP_KEYS_SORTED) {
    const escaped = groupKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) {
      return { key: groupKey, models: MODEL_GROUPS[groupKey] };
    }
  }
  return null;
}

/**
 * PHASE 1.7 — Multi-model parser with negation, groups, and unsupported detection.
 *
 * Resolution order (first match wins for the inclusive/exclusive verdict):
 *   1. Negation context: "sin contar Qwen ni Perplexity" → MODEL_ENUM minus mentioned.
 *   2. Semantic group: "las IAs americanas" → preset subset.
 *   3. Plain mention list: "Grok y Perplexity" → those two.
 *   4. Nothing: returns mode='none' with empty model_names.
 *
 * Unsupported models are ALWAYS reported in `unsupported_models`, regardless of
 * which branch matched.
 */
export function parseModelsWithNegation(question: string | null | undefined): ParsedModelsResult {
  const empty: ParsedModelsResult = {
    model_names: [],
    mode: "none",
    unsupported_models: [],
    matched_aliases: [],
    matched_group: null,
  };
  if (!question) return empty;

  const unsupported = detectUnsupportedModels(question);

  // ── Step 1: collect raw alias matches with positions ───────────────
  type AliasHit = { raw: string; canonical: ModelName; index: number };
  const aliasHits: AliasHit[] = [];
  for (const m of question.matchAll(MODEL_REGEX)) {
    const key = normalizeAliasKey(m[1]);
    const canonical = ALIAS_MAP[key] ?? ALIAS_MAP[key.replace(/\s/g, "")];
    if (canonical && typeof m.index === "number") {
      aliasHits.push({ raw: m[1], canonical, index: m.index });
    }
  }

  // ── Step 2: collect negation positions ─────────────────────────────
  const negationIndices: number[] = [];
  for (const m of question.matchAll(NEGATION_REGEX)) {
    if (typeof m.index === "number") negationIndices.push(m.index);
  }

  // ── Step 3: if any alias hit is near a negation → exclusive mode ──
  if (negationIndices.length > 0 && aliasHits.length > 0) {
    const excluded = new Set<ModelName>();
    let anyNear = false;
    for (const hit of aliasHits) {
      const isNear = negationIndices.some(
        (ni) => Math.abs(hit.index - ni) <= NEGATION_PROXIMITY_CHARS && ni <= hit.index,
      );
      if (isNear) {
        excluded.add(hit.canonical);
        anyNear = true;
      }
    }
    if (anyNear) {
      const remaining = (MODEL_ENUM as readonly ModelName[]).filter((m) => !excluded.has(m));
      return {
        model_names: remaining,
        mode: "exclusive",
        unsupported_models: unsupported,
        matched_aliases: aliasHits.map((h) => h.raw),
        matched_group: null,
      };
    }
  }

  // ── Step 4: semantic group (only when no plain alias mention dominates) ──
  const group = detectModelGroup(question);
  if (group && aliasHits.length === 0) {
    return {
      model_names: group.models,
      mode: "group",
      unsupported_models: unsupported,
      matched_aliases: [],
      matched_group: group.key,
    };
  }

  // ── Step 5: plain inclusive list ────────────────────────────────────
  if (aliasHits.length > 0) {
    const seen = new Set<ModelName>();
    const ordered: ModelName[] = [];
    for (const hit of aliasHits) {
      if (!seen.has(hit.canonical)) {
        seen.add(hit.canonical);
        ordered.push(hit.canonical);
      }
    }
    return {
      model_names: ordered,
      mode: "inclusive",
      unsupported_models: unsupported,
      matched_aliases: aliasHits.map((h) => h.raw),
      matched_group: null,
    };
  }

  // ── Step 6: only a group when also no alias → use it ─────────────
  if (group) {
    return {
      model_names: group.models,
      mode: "group",
      unsupported_models: unsupported,
      matched_aliases: [],
      matched_group: group.key,
    };
  }

  return { ...empty, unsupported_models: unsupported };
}

/**
 * Backwards-compatible helper. Returns just the canonical model names
 * (now powered by parseModelsWithNegation under the hood, so it transparently
 * benefits from negation, groups and the expanded alias table).
 */
export function extractModelNames(question: string | null | undefined): ModelName[] {
  return parseModelsWithNegation(question).model_names;
}

/**
 * Helper: returns true if `name` is one of the canonical model names.
 */
export function isCanonicalModel(name: string): name is ModelName {
  return (MODEL_ENUM as readonly string[]).includes(name);
}

// ──────────────────────────────────────────────────────────────────
// PHASE 1.8 — Conversational memory + quantifier parsing
// ──────────────────────────────────────────────────────────────────

/**
 * Detects anaphoric / follow-up queries that should inherit the previous
 * query context (sector, models, period). Heuristic: short question (< 8
 * words) starting with a follow-up connector OR containing demonstrative
 * pronouns referring back to a previous answer.
 *
 * Examples that match:
 *   "y ahora sin Grok?"
 *   "¿y sin Qwen?"
 *   "ahora con Gemini"
 *   "pero excluye DeepSeek"
 *   "y si quitamos PPX?"
 *   "ese último modelo"
 */
const FOLLOWUP_PREFIX_REGEX =
  /^[¿\s]*(y|ahora|sin|con|tambi[eé]n|pero|en\s+cambio|y\s+si|y\s+ahora|quita|quitando|excluye|excluyendo|a[ñn]ade|a[ñn]adiendo|incluye|incluyendo|adem[aá]s)\b/i;
const FOLLOWUP_ANAPHOR_REGEX = /\b(ese|esa|esos|esas|este|esta|estos|estas|aquel|aquella|el\s+anterior|el\s+ultimo|el\s+último|los\s+mismos|esa\s+misma)\b/i;

const COMPANY_HINT_REGEX = /\b(iberdrola|telefonica|telef[oó]nica|santander|bbva|inditex|repsol|caixabank|naturgy|endesa|acs|ferrovial|aena|grifols|cellnex|amadeus|mapfre|enagas|red\s+el[eé]ctrica|acciona|sabadell|bankinter|merlin|ibex|s&p|nasdaq|dow)\b/i;

export function isFollowupQuery(question: string): boolean {
  if (!question) return false;
  const trimmed = question.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 10) return false;
  // Don't treat a query that introduces a brand-new sector/company as follow-up
  // (we still allow it if it's purely a model modifier — sector check handled in caller).
  if (FOLLOWUP_ANAPHOR_REGEX.test(trimmed)) return true;
  return FOLLOWUP_PREFIX_REGEX.test(trimmed);
}

/**
 * Quantifier patterns: "los 3 mejores modelos", "los cuatro principales",
 * "la mitad de las IAs", "la mayoría de los modelos", etc.
 * Returns the requested count (clamped to 1..MODEL_ENUM.length) or null.
 *
 * Mode "top_coverage" tells the caller to pick the top-N models by
 * recent observation coverage in the queried sector/company.
 */
export interface QuantifierResult {
  count: number;
  mode: "top_coverage";
  raw_match: string;
  label: string; // e.g., "Top 3 por cobertura"
}

export interface QuantifierParseResult {
  companyQuantifier: CompanyQuantifierResult | null;
  modelFilter: QuantifierResult | null;
}

const NUMBER_WORDS_ES: Record<string, number> = {
  "uno": 1, "una": 1,
  "dos": 2,
  "tres": 3,
  "cuatro": 4,
  "cinco": 5,
  "seis": 6,
};

const QUANT_TOPN_REGEX =
  /\b(?:los?|las?)\s+(\d+|uno|una|dos|tres|cuatro|cinco|seis)\s+(?:mejores?|principales|m[aá]s\s+(?:fiables|completos?|robustos?|relevantes?))\s+(?:modelos?|ias?|iaas?)\b/i;
// Variant: "los 3 modelos más fiables" (modelos before the qualifier)
const QUANT_TOPN_REGEX_INV =
  /\b(?:los?|las?)\s+(\d+|uno|una|dos|tres|cuatro|cinco|seis)\s+(?:modelos?|ias?)\s+(?:mejores?|principales|m[aá]s\s+(?:fiables|completos?|robustos?|relevantes?))\b/i;
const QUANT_HALF_REGEX = /\b(?:la\s+mitad|las?\s+mitad)\s+de\s+(?:los?|las?)\s+(?:modelos?|ias?)\b/i;
const QUANT_MAJORITY_REGEX = /\b(?:la\s+mayor[ií]a)\s+de\s+(?:los?|las?)\s+(?:modelos?|ias?)\b/i;

export function parseQuantifier(question: string | null | undefined): QuantifierResult | null {
  if (!question) return null;
  const max = MODEL_ENUM.length;

  const m = question.match(QUANT_TOPN_REGEX) || question.match(QUANT_TOPN_REGEX_INV);
  if (m) {
    const tok = m[1].toLowerCase();
    const n = /^\d+$/.test(tok) ? parseInt(tok, 10) : (NUMBER_WORDS_ES[tok] ?? 0);
    if (n >= 1 && n <= max) {
      return {
        count: n,
        mode: "top_coverage",
        raw_match: m[0],
        label: `Top ${n} por cobertura`,
      };
    }
  }

  if (QUANT_HALF_REGEX.test(question)) {
    const n = Math.ceil(max / 2); // 6 → 3
    return {
      count: n,
      mode: "top_coverage",
      raw_match: question.match(QUANT_HALF_REGEX)![0],
      label: `Top ${n} por cobertura (mitad)`,
    };
  }
  if (QUANT_MAJORITY_REGEX.test(question)) {
    const n = Math.ceil(max / 2) + 1; // 4
    return {
      count: n,
      mode: "top_coverage",
      raw_match: question.match(QUANT_MAJORITY_REGEX)![0],
      label: `Top ${n} por cobertura (mayoría)`,
    };
  }

  return null;
}

const MODEL_N_REGEX = /\b(\d+)\s+(?:mejores?|peores?|primeros?|ultimos?|últimos?)?\s*(modelos?|ias?|llms?)\b/i;

export function parseQuantifiers(question: string | null | undefined): QuantifierParseResult {
  if (!question) return { companyQuantifier: null, modelFilter: null };
  const modelFilter = parseQuantifier(question);
  if (modelFilter) {
    return { companyQuantifier: null, modelFilter };
  }
  const modelN = question.match(MODEL_N_REGEX);
  if (modelN) {
    const n = parseInt(modelN[1], 10);
    if (n >= 1 && n <= MODEL_ENUM.length) {
      return {
        companyQuantifier: null,
        modelFilter: {
          count: n,
          mode: "top_coverage",
          raw_match: modelN[0],
          label: `Top ${n} por cobertura`,
        },
      };
    }
  }
  return { companyQuantifier: parseCompanyQuantifier(question), modelFilter: null };
}

// ──────────────────────────────────────────────────────────────────
// PHASE 1.8b — Company-ranking quantifiers ("top 3 empresas", "los 5
// mejores", "peores 2"). MUST NOT fire when the qualifier is followed
// by "modelos|ias|iaas" (that case is handled by parseQuantifier and
// targets MODEL selection, not company ranking).
// ──────────────────────────────────────────────────────────────────

export interface CompanyQuantifierResult {
  /** Number of companies to keep. 1..N. */
  count: number;
  /** "top" → keep highest scores; "bottom" → keep lowest. */
  mode: "top" | "bottom";
  /** Original matched fragment, useful for logs. */
  raw_match: string;
  /** Localized label for the InfoBar (e.g. "Top 3", "Peores 2"). */
  label: string;
}

// Negative lookahead: must NOT be followed (within ~30 chars) by "modelos|ias|iaas".
// We test the trailing fragment manually to keep the regex simple/portable.
const COMPANY_QUANT_TOP_REGEX =
  /\b(?:top|los?|las?)\s+(\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:mejores?|principales|primer[oa]s?|m[aá]s\s+(?:relevantes?|destacad[oa]s?))?\s*(empresas?|compañ[ií]as?|cotizadas?|firmas?|grupos?)?\b/i;
const COMPANY_QUANT_BOTTOM_REGEX =
  /\b(?:bottom|peores?|últim[oa]s?|ultim[oa]s?|los?|las?)\s+(\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:peores?|últim[oa]s?|ultim[oa]s?|colistas?|m[aá]s\s+(?:bajos?|rezagad[oa]s?))\s*(empresas?|compañ[ií]as?|cotizadas?|firmas?|grupos?)?\b/i;
// Bare "top N" / "bottom N"
const BARE_TOP_REGEX = /\btop\s+(\d+)\b/i;
const BARE_BOTTOM_REGEX = /\b(?:bottom|peores)\s+(\d+)\b/i;

const COMPANY_NUMBER_WORDS: Record<string, number> = {
  ...NUMBER_WORDS_ES,
  "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
};

function isFollowedByModelsKeyword(question: string, matchEnd: number): boolean {
  const tail = question.slice(matchEnd, matchEnd + 40).toLowerCase();
  return /^\s*(?:de\s+|con\s+|para\s+|seg[uú]n\s+)?(?:los?|las?)?\s*(?:\d+\s+)?(?:mejores?|peores?|primeros?|ultimos?|últimos?)?\s*(?:modelos?|ias?|iaas?|llms?)\b/.test(tail);
}

export function parseCompanyQuantifier(
  question: string | null | undefined,
): CompanyQuantifierResult | null {
  if (!question) return null;

  // Bare "top 3" / "bottom 5" — strong signal, no need for lookahead trick.
  // Still skip if followed by modelos.
  const bareTop = question.match(BARE_TOP_REGEX);
  if (bareTop && typeof bareTop.index === "number") {
    const end = bareTop.index + bareTop[0].length;
    if (!isFollowedByModelsKeyword(question, end)) {
      const n = parseInt(bareTop[1], 10);
      if (n >= 1 && n <= 50) {
        return { count: n, mode: "top", raw_match: bareTop[0], label: `Top ${n}` };
      }
    }
  }
  const bareBot = question.match(BARE_BOTTOM_REGEX);
  if (bareBot && typeof bareBot.index === "number") {
    const end = bareBot.index + bareBot[0].length;
    if (!isFollowedByModelsKeyword(question, end)) {
      const n = parseInt(bareBot[1], 10);
      if (n >= 1 && n <= 50) {
        return { count: n, mode: "bottom", raw_match: bareBot[0], label: `Peores ${n}` };
      }
    }
  }

  // "los 3 mejores empresas" / "las 5 peores cotizadas"
  const top = question.match(COMPANY_QUANT_TOP_REGEX);
  if (top && typeof top.index === "number") {
    const end = top.index + top[0].length;
    // Reject if the trailing context says "modelos" → that's parseQuantifier's job.
    if (!isFollowedByModelsKeyword(question, end)) {
      const tok = top[1].toLowerCase();
      const n = /^\d+$/.test(tok) ? parseInt(tok, 10) : (COMPANY_NUMBER_WORDS[tok] ?? 0);
      // Require either an explicit company keyword OR a "mejores/principales" qualifier
      // to avoid catching "los 3 últimos días" etc.
      const hasCompanyWord = !!top[2];
      const hasQualifier = /\b(mejores?|principales|primer[oa]s?|m[aá]s\s+(?:relevantes?|destacad[oa]s?))\b/i.test(top[0]);
      if (n >= 1 && n <= 50 && (hasCompanyWord || hasQualifier)) {
        return { count: n, mode: "top", raw_match: top[0], label: `Top ${n}` };
      }
    }
  }
  const bot = question.match(COMPANY_QUANT_BOTTOM_REGEX);
  if (bot && typeof bot.index === "number") {
    const end = bot.index + bot[0].length;
    if (!isFollowedByModelsKeyword(question, end)) {
      const tok = bot[1].toLowerCase();
      const n = /^\d+$/.test(tok) ? parseInt(tok, 10) : (COMPANY_NUMBER_WORDS[tok] ?? 0);
      if (n >= 1 && n <= 50) {
        return { count: n, mode: "bottom", raw_match: bot[0], label: `Peores ${n}` };
      }
    }
  }

  return null;
}

/**
 * Sector hint detection — used by caller to decide whether a follow-up
 * query introduces a NEW sector (in which case we must NOT inherit
 * previous models). Mirrors the client-side CLIENT_SECTOR_REGEX.
 */
const SECTOR_HINT_REGEX =
  /\b(banca|banc[ao]s?|tecnol[oó]gic[ao]s?|hospitalari[oa]s?|asegurador[ae]s?|farmac[eé]utic[ao]s?|inmobiliari[ao]s?|energ[eé]tic[ao]s?|teleco|telecos|retailers?|seguros|salud|farma|sector|ibex|ibex\s*35|ibex35|energ[ií]a|tecnolog[ií]a|real\s+estate|telecomunicaciones|retail)\b/i;

export function hasSectorHint(question: string): boolean {
  return !!question && SECTOR_HINT_REGEX.test(question);
}

export function hasCompanyHint(question: string): boolean {
  return !!question && COMPANY_HINT_REGEX.test(question);
}

// ──────────────────────────────────────────────────────────────────
// PHASE 1.9 — A2  Model-ranking-for-entity intent
// PHASE 1.9 — A3  Period weeks parser (cap 12)
// PHASE 1.9 — A1  Multi-sector comparison detector
// ──────────────────────────────────────────────────────────────────

/**
 * A2 — Detects queries asking which AI MODELS are best at evaluating an
 * entity (company / sector). e.g. "qué modelos miden mejor a CaixaBank",
 * "ranking de modelos para Inditex", "qué IA evalúa mejor el IBEX".
 * MUST be paired with an entity hint downstream — this helper only signals
 * the linguistic pattern.
 */
const MODEL_RANKING_REGEX = /\b(?:qu[eé]\s+(?:modelos?|ias?|llms?)|ranking\s+de\s+(?:modelos?|ias?|llms?)|qu[eé]\s+ia\s+(?:mide|eval[uú]a|cubre|analiza)|cu[aá]l(?:es)?\s+(?:modelos?|ias?)\s+(?:mide|eval[uú]a|cubre|analiza|funciona)|which\s+(?:models?|ais?|llms?)\s+(?:rank|measure|evaluate|cover)|best\s+(?:models?|ais?|llms?)\s+(?:for|to))\b/i;

export interface ModelRankingResult {
  active: boolean;
  raw_match: string | null;
  label: string; // e.g., "Ranking de modelos"
}

export function parseModelRankingForEntity(
  question: string | null | undefined,
): ModelRankingResult {
  if (!question) return { active: false, raw_match: null, label: "" };
  const m = question.match(MODEL_RANKING_REGEX);
  if (!m) return { active: false, raw_match: null, label: "" };
  return {
    active: true,
    raw_match: m[0],
    label: "Ranking de modelos",
  };
}

/**
 * A3 — Extracts a relative period in weeks from queries like
 * "últimas 8 semanas", "past 12 weeks", "los 3 meses" (months → weeks*4).
 * Capped at 12 weeks (system limit). Returns null if no explicit N.
 */
const PERIOD_WEEKS_REGEX =
  /(?:^|[^\p{L}])(?:[uú]ltim[oa]s?|past|previous|last|durante|during)\s+(\d{1,2})\s+(semanas?|weeks?|meses?|months?|d[ií]as?|days?)\b/iu;

export interface PeriodWeeksResult {
  weeks: number;
  raw_match: string;
  unit: "weeks" | "months" | "days";
}

export function parsePeriodWeeks(
  question: string | null | undefined,
): PeriodWeeksResult | null {
  if (!question) return null;
  const m = question.match(PERIOD_WEEKS_REGEX);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const unitRaw = m[2].toLowerCase();
  let weeks = n;
  let unit: PeriodWeeksResult["unit"] = "weeks";
  if (unitRaw.startsWith("mes") || unitRaw.startsWith("month")) {
    weeks = n * 4;
    unit = "months";
  } else if (unitRaw.startsWith("d")) {
    weeks = Math.max(1, Math.ceil(n / 7));
    unit = "days";
  }
  weeks = Math.min(12, Math.max(1, weeks));
  return { weeks, raw_match: m[0], unit };
}

/**
 * A1 — Detects multi-sector comparison queries
 * ("compara banca y energía", "banca vs tecnología").
 * Returns the canonical sector tokens detected (>= 2 distinct sectors)
 * so the caller can ask the user to choose ONE.
 */
const SECTOR_TOKEN_MAP: Record<string, string> = {
  "banca": "banca",
  "bancos": "banca",
  "banking": "banca",
  "energ[ií]a": "energía",
  "energetic": "energía",
  "energy": "energía",
  "tecnolog": "tecnología",
  "technology": "tecnología",
  "tech": "tecnología",
  "salud": "salud",
  "farma": "farmacéuticas",
  "pharma": "farmacéuticas",
  "telecom": "telecomunicaciones",
  "teleco": "telecomunicaciones",
  "seguros": "seguros",
  "insurance": "seguros",
  "retail": "retail",
  "inmobiliari": "inmobiliarias",
  "real estate": "inmobiliarias",
  "construcci": "construcción",
  "automoci": "automoción",
  "turismo": "turismo",
  "hotel": "turismo",
};

const MULTI_SECTOR_TRIGGER_REGEX =
  /\b(compara|comparar|comparativa|vs\.?|versus|frente\s+a|y|e|contra)\b/i;

export interface MultiSectorResult {
  active: boolean;
  sectors: string[];
  raw_match: string;
}

export function parseMultiSectorComparison(
  question: string | null | undefined,
): MultiSectorResult {
  const empty: MultiSectorResult = { active: false, sectors: [], raw_match: "" };
  if (!question) return empty;
  const lower = stripAccents(question.toLowerCase());
  // Must contain a comparator
  if (!MULTI_SECTOR_TRIGGER_REGEX.test(lower)) return empty;
  // Need at least one explicit "compara/vs/versus/frente" — bare "y" alone is too weak
  const hasStrongComparator = /\b(compara|comparar|comparativa|vs\.?|versus|frente\s+a|contra)\b/i.test(lower);
  if (!hasStrongComparator) return empty;
  const detected: string[] = [];
  const seen = new Set<string>();
  for (const [pattern, canonical] of Object.entries(SECTOR_TOKEN_MAP)) {
    const re = new RegExp(`\\b${pattern}[a-z]*\\b`, "i");
    if (re.test(lower) && !seen.has(canonical)) {
      seen.add(canonical);
      detected.push(canonical);
    }
  }
  if (detected.length < 2) return empty;
  return { active: true, sectors: detected.slice(0, 4), raw_match: question.slice(0, 80) };
}

/**
 * Conversational memory snapshot stored client-side and forwarded in the
 * request body as `previousContext`.
 */
export interface PreviousQueryContext {
  sector?: string | null;
  company?: string | null;
  model_names?: ModelName[];
  mode?: "inclusive" | "exclusive" | "group" | "none";
  period_from?: string | null;
  period_to?: string | null;
  /** Epoch ms when the context was captured; caller enforces TTL. */
  ts?: number;
}

/**
 * Merges a follow-up parse with the previous context. Logic:
 *  - If the follow-up parsed in EXCLUSIVE mode (e.g. "y sin Grok"), apply
 *    that exclusion to the previous model_names (NOT to MODEL_ENUM).
 *  - If the follow-up parsed in INCLUSIVE / GROUP mode, the new model
 *    list REPLACES the previous one entirely (user chose new models).
 *  - If the follow-up parsed NONE → keep previous model_names.
 *  - Sector/company are always inherited from previous when the new
 *    question has no sector/company hint.
 */
export function mergeFollowupWithPrevious(
  followupParsed: ParsedModelsResult,
  previous: PreviousQueryContext | null | undefined,
  followupQuestion: string,
): { model_names: ModelName[]; mode: ParsedModelsResult["mode"]; sector: string | null; company: string | null; merged: boolean } {
  const prev = previous || {};
  const prevModels = (prev.model_names && prev.model_names.length > 0)
    ? prev.model_names
    : [...MODEL_ENUM];
  const newSectorMentioned = hasSectorHint(followupQuestion);
  const newCompanyMentioned = hasCompanyHint(followupQuestion);

  // Exclusive follow-up: subtract from previous
  if (followupParsed.mode === "exclusive" && followupParsed.model_names.length > 0) {
    // followupParsed.model_names already = MODEL_ENUM minus mentioned in negation
    // Re-derive "excluded set" by diffing against MODEL_ENUM:
    const stillIncluded = new Set(followupParsed.model_names);
    const excluded = (MODEL_ENUM as readonly ModelName[]).filter((m) => !stillIncluded.has(m));
    const merged = prevModels.filter((m) => !excluded.includes(m));
    return {
      model_names: merged.length > 0 ? merged : prevModels,
      mode: "exclusive",
      sector: newSectorMentioned ? null : (prev.sector ?? null),
      company: newCompanyMentioned ? null : (prev.company ?? null),
      merged: true,
    };
  }

  // Inclusive / group follow-up: new list replaces
  if ((followupParsed.mode === "inclusive" || followupParsed.mode === "group")
      && followupParsed.model_names.length > 0) {
    return {
      model_names: followupParsed.model_names,
      mode: followupParsed.mode,
      sector: newSectorMentioned ? null : (prev.sector ?? null),
      company: newCompanyMentioned ? null : (prev.company ?? null),
      merged: true,
    };
  }

  // No model info in follow-up → inherit everything
  return {
    model_names: prevModels,
    mode: prev.mode ?? "none",
    sector: newSectorMentioned ? null : (prev.sector ?? null),
    company: newCompanyMentioned ? null : (prev.company ?? null),
    merged: true,
  };
}
