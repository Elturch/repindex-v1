/**
 * Regression tests for the multi-model parser.
 * Phase 1: deterministic global regex with alias normalization.
 *
 * These 6 trap-queries were the historical failure cases that motivated
 * `extractModelNames`. CI must keep them green.
 *
 * Run from project root:
 *   deno test --allow-net --allow-env supabase/functions/chat-intelligence/__tests__/parser.test.ts
 */

import {
  assertEquals,
  assertArrayIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MODEL_ENUM,
  extractModelNames,
  parseModelsWithNegation,
  detectUnsupportedModels,
} from "../../_shared/modelsEnum.ts";

// ── T1: real-world failure case (Grupos Hospitalarios) ──────────────
Deno.test("T1: 'Grok, Perplexity y Deepseek' → 3 models", () => {
  const q =
    "dame el ranking de Grok, Perplexity y Deepseek para Grupos Hospitalarios el 19 de abril de 2026";
  const result = extractModelNames(q);
  assertEquals(result.length, 3, `Expected 3, got ${result.length}: [${result.join(", ")}]`);
  assertArrayIncludes(result, ["Grok", "Perplexity", "DeepSeek"]);
});

// ── T2: simple two-model query ──────────────────────────────────────
Deno.test("T2: 'ranking de ChatGPT y Gemini' → 2 models", () => {
  const result = extractModelNames("ranking de ChatGPT y Gemini");
  assertEquals(result.length, 2);
  assertArrayIncludes(result, ["ChatGPT", "Google Gemini"]);
});

// ── T3: single model ─────────────────────────────────────────────────
Deno.test("T3: 'qué dice Qwen' → 1 model", () => {
  const result = extractModelNames("qué dice Qwen");
  assertEquals(result.length, 1);
  assertEquals(result[0], "Qwen");
});

// ── T4: no model mentioned → empty (means 'all 6 implicit') ─────────
Deno.test("T4: 'ranking general' → 0 models (=> all 6 implicit)", () => {
  const result = extractModelNames("ranking general");
  assertEquals(result.length, 0);
});

// ── T5: alias + non-supported model ─────────────────────────────────
Deno.test("T5: 'compara GPT vs Claude' → 1 model (only ChatGPT, Claude not in enum)", () => {
  const result = extractModelNames("compara GPT vs Claude");
  assertEquals(result.length, 1, `Expected 1 (only ChatGPT), got ${result.length}: [${result.join(", ")}]`);
  assertEquals(result[0], "ChatGPT");
});

// ── T6: literal "los 6 modelos" → 0 (no model names mentioned literally) ──
// Design choice: "los 6 modelos" is a quantity, not a list of model names.
// Empty array means "all 6 implicit" downstream. Either 0 or 6 is acceptable
// per the spec — we choose 0 to keep the parser purely literal (no inference).
Deno.test("T6: 'ranking de los 6 modelos' → 0 (no literal model names)", () => {
  const result = extractModelNames("ranking de los 6 modelos");
  assertEquals(result.length, 0);
});

// ── Bonus: dedup, order, and case variants ──────────────────────────
Deno.test("Bonus 1: case-insensitive + dedup", () => {
  const result = extractModelNames("CHATGPT, chatgpt, ChatGPT");
  assertEquals(result.length, 1);
  assertEquals(result[0], "ChatGPT");
});

Deno.test("Bonus 2: 'deep seek' (with space) and 'chat gpt' (with space)", () => {
  const result = extractModelNames("compara deep seek con chat gpt");
  assertEquals(result.length, 2);
  assertArrayIncludes(result, ["DeepSeek", "ChatGPT"]);
});

Deno.test("Bonus 3: order preserved (first appearance wins)", () => {
  const result = extractModelNames("Grok primero, luego Perplexity, luego ChatGPT");
  assertEquals(result, ["Grok", "Perplexity", "ChatGPT"]);
});

Deno.test("Bonus 4: all 6 listed explicitly", () => {
  const q = "compara ChatGPT, Perplexity, Gemini, DeepSeek, Grok y Qwen";
  const result = extractModelNames(q);
  assertEquals(result.length, 6);
  for (const m of MODEL_ENUM) assertArrayIncludes(result, [m]);
});

// ──────────────────────────────────────────────────────────────────
// PHASE 1.7 — negation, groups, unsupported, expanded aliases
// ──────────────────────────────────────────────────────────────────

// N1: explicit exclusion of two models
Deno.test("N1: 'sin contar Qwen ni Perplexity' → 4 models, mode=exclusive", () => {
  const r = parseModelsWithNegation(
    "ranking de banca el 19 de abril sin contar Qwen ni Perplexity",
  );
  assertEquals(r.mode, "exclusive");
  assertEquals(r.model_names.length, 4);
  assertArrayIncludes(r.model_names, ["ChatGPT", "Google Gemini", "DeepSeek", "Grok"]);
});

// N2: GPT4 alias + Claude unsupported + sector adjective handled upstream
Deno.test("N2: 'compara GPT4 vs claude para tecnologicas' → ChatGPT only, Claude unsupported", () => {
  const r = parseModelsWithNegation("compara GPT4 vs claude para tecnologicas");
  assertEquals(r.mode, "inclusive");
  assertEquals(r.model_names, ["ChatGPT"]);
  assertEquals(r.unsupported_models, ["Claude"]);
});

// N3: semantic group "americanas"
Deno.test("N3: 'con las IAs americanas' → 4 American models, mode=group", () => {
  const r = parseModelsWithNegation("ranking de banca solo con las IAs americanas");
  assertEquals(r.mode, "group");
  assertEquals(r.model_names.length, 4);
  assertArrayIncludes(r.model_names, ["ChatGPT", "Google Gemini", "Grok", "Perplexity"]);
  assertEquals(r.matched_group, "ias americanas");
});

// N4: semantic group "modelos chinos"
Deno.test("N4: 'con los modelos chinos' → DeepSeek + Qwen", () => {
  const r = parseModelsWithNegation("ranking de tecnológicas con los modelos chinos");
  assertEquals(r.mode, "group");
  assertEquals(r.model_names.length, 2);
  assertArrayIncludes(r.model_names, ["DeepSeek", "Qwen"]);
});

// N5: "excepto Gemini" → 5 models
Deno.test("N5: 'excepto Gemini' → 5 models, mode=exclusive", () => {
  const r = parseModelsWithNegation("ranking general excepto Gemini");
  assertEquals(r.mode, "exclusive");
  assertEquals(r.model_names.length, 5);
  for (const m of MODEL_ENUM) {
    if (m === "Google Gemini") continue;
    assertArrayIncludes(r.model_names, [m]);
  }
});

// N6: "solo OpenAI" → ChatGPT only via vendor group
Deno.test("N6: 'solo OpenAI' → [ChatGPT]", () => {
  // Note: "openai" is also an ALIAS_MAP entry, so it resolves via inclusive path.
  const r = parseModelsWithNegation("ranking de banca solo OpenAI");
  assertEquals(r.model_names, ["ChatGPT"]);
});

// N7: sector adjective routed at the chat-intelligence layer (parser stays clean)
Deno.test("N7: 'para hospitalarios' → no models mentioned, parser returns empty", () => {
  const r = parseModelsWithNegation("ranking para hospitalarios");
  assertEquals(r.mode, "none");
  assertEquals(r.model_names.length, 0);
  assertEquals(r.unsupported_models.length, 0);
});

// N8: Anthropic group → 0 supported models, but Claude detected as unsupported elsewhere
Deno.test("N8: 'según Anthropic' → empty supported list (group anthropic = [])", () => {
  const r = parseModelsWithNegation("ranking según Anthropic");
  assertEquals(r.model_names.length, 0);
  assertEquals(r.matched_group, "anthropic");
});

// N9: model-version aliases (Grok 3, Gemini 2.5, DSK, PPX)
Deno.test("N9: 'Grok 3, Gemini 2.5, DSK, PPX' → 4 canonical models", () => {
  const r = parseModelsWithNegation("compara Grok 3, Gemini 2.5, DSK y PPX");
  assertEquals(r.model_names.length, 4);
  assertArrayIncludes(r.model_names, ["Grok", "Google Gemini", "DeepSeek", "Perplexity"]);
});

// N10: detectUnsupportedModels standalone helper
Deno.test("N10: detectUnsupportedModels picks up Claude, Llama, Mistral", () => {
  const u = detectUnsupportedModels("compara Claude, Llama y Mistral");
  assertEquals(u.length, 3);
  assertArrayIncludes(u, ["Claude", "Llama", "Mistral"]);
});