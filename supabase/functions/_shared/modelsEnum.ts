/**
 * Single source of truth for the AI model enum used by the Agente Rix.
 *
 * Canonical names match EXACTLY the values stored in `rix_runs_v2."02_model_name"`.
 * (Importante: la BD usa "Google Gemini", no "Gemini".)
 *
 * This module exports:
 *  - MODEL_ENUM:        canonical names (immutable tuple).
 *  - ModelName:         union type derived from MODEL_ENUM.
 *  - MODEL_REGEX:       case-insensitive global regex with all aliases.
 *  - extractModelNames: deterministic multi-model parser. Returns canonical
 *                       names, deduplicated, in order of first appearance.
 *
 * Phase 1 strategy: NO LLM. Just a global regex with alias normalization.
 * Future Phase 2 may add an LLM extractor for enumerative edge cases.
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
 * Alias → canonical name map.
 * Keys are lowercase, whitespace-collapsed.
 * NOTE: "claude" is intentionally NOT included — Claude is not a model the
 * pipeline supports; queries mentioning Claude must NOT be misrouted.
 */
const ALIAS_MAP: Record<string, ModelName> = {
  // ChatGPT family
  "chatgpt": "ChatGPT",
  "chat gpt": "ChatGPT",
  "gpt": "ChatGPT",
  "gpt-4": "ChatGPT",
  "gpt4": "ChatGPT",
  "openai": "ChatGPT",
  // Perplexity
  "perplexity": "Perplexity",
  "pplx": "Perplexity",
  // Gemini (canonical = "Google Gemini")
  "gemini": "Google Gemini",
  "google gemini": "Google Gemini",
  "google": "Google Gemini",
  // DeepSeek
  "deepseek": "DeepSeek",
  "deep seek": "DeepSeek",
  // Grok
  "grok": "Grok",
  "xai": "Grok",
  // Qwen
  "qwen": "Qwen",
  "alibaba": "Qwen",
};

/**
 * Global, case-insensitive regex that matches any known alias as a whole word.
 * Alternation is sorted by length DESC so longer aliases ("chat gpt", "deep seek",
 * "google gemini") win over their shorter prefixes.
 */
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

/**
 * Extract all AI model names mentioned in a free-text query.
 *
 * Returns canonical names, deduplicated, preserving order of first appearance.
 * Returns an empty array if no models are detected (caller decides whether
 * that means "all models" or "none").
 *
 * Examples:
 *   extractModelNames("ranking de Grok, Perplexity y Deepseek")
 *     → ["Grok", "Perplexity", "DeepSeek"]
 *   extractModelNames("compara GPT vs Claude")
 *     → ["ChatGPT"]   // Claude not in enum
 *   extractModelNames("ranking general")
 *     → []
 */
export function extractModelNames(question: string | null | undefined): ModelName[] {
  if (!question) return [];
  const matches = question.matchAll(MODEL_REGEX);
  const seen = new Set<ModelName>();
  const ordered: ModelName[] = [];
  for (const m of matches) {
    const raw = m[1].toLowerCase().replace(/\s+/g, " ").trim();
    const canonical = ALIAS_MAP[raw] ?? ALIAS_MAP[raw.replace(/\s/g, "")];
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      ordered.push(canonical);
    }
  }
  return ordered;
}

/**
 * Helper: returns true if `name` is one of the canonical model names.
 */
export function isCanonicalModel(name: string): name is ModelName {
  return (MODEL_ENUM as readonly string[]).includes(name);
}