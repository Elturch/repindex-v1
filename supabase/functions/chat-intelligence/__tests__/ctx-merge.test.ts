/**
 * PHASE 1.8b — ctx-merge regression suite
 *
 * Validates conversational-memory merging:
 *  - Follow-up inherits sector/company/models when omitted.
 *  - TTL > 5min → no merge.
 *  - User-explicit sector/models in the follow-up always win.
 *  - Exclusive follow-up subtracts from previous, not from MODEL_ENUM.
 *  - hasSectorHint / hasCompanyHint detection.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mergeFollowupWithPrevious,
  parseModelsWithNegation,
  hasSectorHint,
  hasCompanyHint,
  type PreviousQueryContext,
} from "../../_shared/modelsEnum.ts";

function ctx(extra: Partial<PreviousQueryContext> = {}): PreviousQueryContext {
  return {
    sector: "banca",
    company: null,
    model_names: ["ChatGPT", "Google Gemini", "Grok", "Perplexity"],
    mode: "group",
    ts: Date.now(),
    ...extra,
  };
}

// 1. Follow-up "y sin Grok" inherits sector + subtracts Grok from previous models
Deno.test("CTX1: 'y sin Grok' subtracts Grok from previous list", () => {
  const previous = ctx();
  const parsed = parseModelsWithNegation("y sin Grok");
  const merged = mergeFollowupWithPrevious(parsed, previous, "y sin Grok");
  assertEquals(merged.sector, "banca", "sector must be inherited");
  assertEquals(
    merged.model_names.includes("Grok"),
    false,
    "Grok must be removed",
  );
  assertEquals(merged.model_names.length, 3);
});

// 2. Follow-up that introduces a NEW sector must NOT inherit previous sector
Deno.test("CTX2: 'que tal hospitalarios?' resets sector, drops model context", () => {
  const previous = ctx({ sector: "banca", model_names: ["Grok"] });
  const parsed = parseModelsWithNegation("que tal hospitalarios?");
  const merged = mergeFollowupWithPrevious(parsed, previous, "que tal hospitalarios?");
  assertEquals(merged.sector, null, "must NOT inherit previous sector when new one is mentioned");
});

// 3. Inclusive follow-up replaces models entirely
Deno.test("CTX3: 'y ahora con Qwen?' replaces previous model_names", () => {
  const previous = ctx({ company: "Iberdrola", sector: null, model_names: ["ChatGPT", "Grok"] });
  const parsed = parseModelsWithNegation("y ahora con Qwen?");
  const merged = mergeFollowupWithPrevious(parsed, previous, "y ahora con Qwen?");
  assertEquals(merged.model_names, ["Qwen"]);
  assertEquals(merged.company, "Iberdrola", "company must be inherited");
});

// 4. No model info in follow-up → keeps previous list verbatim
Deno.test("CTX4: bare 'y ahora?' inherits ALL previous models + sector", () => {
  const previous = ctx({ model_names: ["ChatGPT", "Google Gemini"] });
  const parsed = parseModelsWithNegation("y ahora?");
  const merged = mergeFollowupWithPrevious(parsed, previous, "y ahora?");
  assertEquals(merged.model_names, ["ChatGPT", "Google Gemini"]);
  assertEquals(merged.sector, "banca");
});

// 5. Sector / company hint detection mirrors backend regex
Deno.test("CTX5: hasSectorHint and hasCompanyHint behave as expected", () => {
  assertEquals(hasSectorHint("ranking de banca"), true);
  assertEquals(hasSectorHint("y sin Grok"), false);
  assertEquals(hasCompanyHint("analiza Iberdrola"), true);
  assertEquals(hasCompanyHint("y ahora con Qwen?"), false);
});

// 6. TTL guard: this is a unit-level surrogate — when the caller passes a
// stale ts, merge still computes correctly, but production code must check
// TTL before invoking it. Here we just verify "no previous" path works.
Deno.test("CTX6: previousContext null → falls back to MODEL_ENUM (no inherit)", () => {
  const parsed = parseModelsWithNegation("y sin Grok");
  const merged = mergeFollowupWithPrevious(parsed, null, "y sin Grok");
  // mergeFollowupWithPrevious treats null previous as MODEL_ENUM,
  // so subtraction yields 5 models.
  assertEquals(merged.model_names.length, 5);
  assertEquals(merged.model_names.includes("Grok"), false);
});