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
