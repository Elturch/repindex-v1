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