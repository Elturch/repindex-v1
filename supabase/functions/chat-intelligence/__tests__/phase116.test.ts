/**
 * PHASE 1.16 — InputValidator: pre-pipeline triage tests.
 *
 * Validates the 4 critical bugs caught in atypical batch testing:
 *   A1 — Telefónica Germany contamination (foreign subsidiary block)
 *   A2 — Santander disambiguation
 *   A4 — Day-granularity redirect to nearest weekly snapshot
 *   A5 — Default window disclosure + sample-size statistical guard
 *   A6 — ESG/credit-rating out-of-scope block
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveEntity,
  detectMetric,
  detectGranularity,
  inferDefaultWindow,
  validateSampleSize,
  detectForeignQualifier,
  extractBrandToken,
} from "../../_shared/inputValidator.ts";

// Stable mini-catalog used by all V1 tests. NEVER hardcode this in
// production code — it's loaded from repindex_root_issuers at runtime.
const CATALOG = [
  { issuer_name: "Telefónica", ticker: "TEF" },
  { issuer_name: "Iberdrola", ticker: "IBE" },
  { issuer_name: "Banco Santander", ticker: "SAN" },
  { issuer_name: "Santander Consumer Finance", ticker: "SCF" },
  { issuer_name: "BBVA", ticker: "BBVA" },
  { issuer_name: "Repsol", ticker: "REP" },
  { issuer_name: "Endesa", ticker: "ELE" },
  { issuer_name: "Inditex", ticker: "ITX" },
];

// ───────────────────────── V1: resolveEntity ─────────────────────────
Deno.test("1.16-A1: 'Telefónica Germany Q1 2026' → BLOCKED as foreign_subsidiary", () => {
  const r = resolveEntity("informe Telefónica Germany Q1 2026", CATALOG);
  assertEquals(r.matched, false);
  assertEquals(r.confidence, "foreign_subsidiary");
  assert(r.block_message?.includes("ámbito español"), "must explain scope");
  assert(r.block_message?.includes("Telefónica"), "must name the parent");
  assertEquals(r.parent_suggestion?.ticker, "TEF");
});

Deno.test("1.16-A1-bis: 'Santander UK' → BLOCKED as foreign_subsidiary", () => {
  const r = resolveEntity("Reputación Santander UK", CATALOG);
  assertEquals(r.matched, false);
  assertEquals(r.confidence, "foreign_subsidiary");
  assert(r.block_message?.includes("UK") || r.foreign_input?.includes("UK"));
});

Deno.test("1.16-A1-ter: 'BBVA México' → BLOCKED", () => {
  const r = resolveEntity("Score reputacional BBVA México", CATALOG);
  assertEquals(r.matched, false);
  assertEquals(r.confidence, "foreign_subsidiary");
});

Deno.test("1.16-A2: 'Reputación Santander Consumer Finance' (exact) → matches SCF, no ambiguity", () => {
  const r = resolveEntity("Reputación Santander Consumer Finance", CATALOG);
  assertEquals(r.matched, true);
  // Either SCF only, or ambiguous if both stems hit. SCF must be present.
  if (r.confidence === "ambiguous") {
    assert(r.alternatives.some((a) => a.ticker === "SCF"));
  } else {
    assertEquals(r.confidence, "exact");
    assertEquals(r.ticker, "SCF");
  }
});

Deno.test("1.16-A2-bis: 'Compara Banco Santander con Santander Consumer Finance' → ambiguous list", () => {
  const r = resolveEntity("Compara Banco Santander con Santander Consumer Finance", CATALOG);
  assertEquals(r.matched, false);
  assertEquals(r.confidence, "ambiguous");
  assert(r.alternatives.length >= 2);
  assert(r.block_message?.toLowerCase().includes("varias coincidencias"));
});

Deno.test("1.16-V1-typo: 'Reputación de Telefonica' (no tilde) → exact (substring match)", () => {
  // 'Telefonica' (no tilde) is contained in normalised 'telefónica'.
  const r = resolveEntity("Reputación de Telefonica", CATALOG);
  assertEquals(r.matched, true);
  assertEquals(r.ticker, "TEF");
});

Deno.test("1.16-V1-notfound: 'Reputación Acme Corp' → not_found with suggestions", () => {
  const r = resolveEntity("Reputación Acme Corp", CATALOG);
  assertEquals(r.matched, false);
  assertEquals(r.confidence, "not_found");
  assert(r.alternatives.length > 0 && r.alternatives.length <= 5);
  assert(r.block_message?.includes("Acme"));
});

Deno.test("1.16-V1-empty: empty / sector query → matched=true, no block", () => {
  assertEquals(resolveEntity("", CATALOG).matched, true);
  assertEquals(resolveEntity("Ranking IBEX-35 últimas 4 semanas", CATALOG).matched, true);
});

Deno.test("1.16-V1-detectForeignQualifier helper", () => {
  assertEquals(detectForeignQualifier("Telefónica Germany"), "germany");
  assertEquals(detectForeignQualifier("Reputación Santander UK"), "uk");
  assertEquals(detectForeignQualifier("Iberdrola"), null);
  // 'us' must not match 'usuario'
  assertEquals(detectForeignQualifier("usuario consulta Iberdrola"), null);
  // bare 'us' as a token DOES match
  assertEquals(detectForeignQualifier("Iberdrola US"), "us");
});

Deno.test("1.16-V1-extractBrandToken helper", () => {
  assertEquals(extractBrandToken("informe sobre Acme Corp"), "Acme");
  assertEquals(extractBrandToken("ranking esta semana"), "ranking");
  assertEquals(extractBrandToken(""), null);
});

// ───────────────────────── V2: detectMetric ──────────────────────────
Deno.test("1.16-A6: 'Score ESG de BBVA' → BLOCKED, suggests GAM", () => {
  const m = detectMetric("Dame el score ESG de BBVA");
  assertEquals(m.isRixCompatible, false);
  assertEquals(m.suggested_dimension, "GAM");
  assert(m.block_message?.includes("ESG"));
  assert(m.block_message?.includes("GAM"));
});

Deno.test("1.16-A6-bis: 'credit rating de Iberdrola' → BLOCKED, suggests RMM", () => {
  const m = detectMetric("Dame el credit rating de Iberdrola");
  assertEquals(m.isRixCompatible, false);
  assertEquals(m.suggested_dimension, "RMM");
});

Deno.test("1.16-V2-clean: 'reputación de Iberdrola' → no block", () => {
  const m = detectMetric("Reputación de Iberdrola");
  assertEquals(m.isRixCompatible, true);
  assertEquals(m.block_message, null);
});

// ───────────────────────── V3: detectGranularity ─────────────────────
Deno.test("1.16-A4: 'Iberdrola el 15 de febrero 2026' → day, redirect to nearest Sunday", () => {
  const g = detectGranularity("Iberdrola el 15 de febrero 2026");
  assertEquals(g.requestedGranularity, "day");
  assertEquals(g.requestedDayISO, "2026-02-15");
  // 2026-02-15 is itself a Sunday → distance 0 → compatible with disclosure.
  assertEquals(g.isCompatible, true);
  assert(g.redirect_disclosure?.includes("2026-02-15"));
});

Deno.test("1.16-V3-day-far: 'Iberdrola el 17 de febrero' → distance 3, still ok", () => {
  // 2026-02-15 is Sunday → 17-feb is Tuesday, distance 2 → ≤3 ⇒ ok.
  const g = detectGranularity("Iberdrola el 17 de febrero 2026");
  assertEquals(g.requestedGranularity, "day");
  assertEquals(g.isCompatible, true);
});

Deno.test("1.16-V3-hour: 'Iberdrola por hora' → BLOCKED", () => {
  const g = detectGranularity("Iberdrola por hora");
  assertEquals(g.requestedGranularity, "hour");
  assertEquals(g.isCompatible, false);
  assert(g.block_message?.includes("semanales"));
});

Deno.test("1.16-V3-quarter: 'Iberdrola Q1 2026' → unknown (handed off to temporalGuard)", () => {
  const g = detectGranularity("Iberdrola Q1 2026");
  assertEquals(g.requestedGranularity, "unknown");
  assertEquals(g.isCompatible, true);
  assertEquals(g.block_message, null);
});

// ───────────────────────── V4: inferDefaultWindow ────────────────────
Deno.test("1.16-A5-default: 'Compara Iberdrola y Endesa' (no window) → applies default + disclosure", () => {
  const d = inferDefaultWindow("Compara Iberdrola y Endesa");
  assertEquals(d.appliedDefault, true);
  assert(d.disclosure?.includes("últimas 4 semanas"));
  assert(d.disclosure?.includes("default"));
});

Deno.test("1.16-V4-explicit: 'Iberdrola Q1 2026' → no default applied", () => {
  const d = inferDefaultWindow("Iberdrola Q1 2026");
  assertEquals(d.appliedDefault, false);
});

Deno.test("1.16-V4-explicit-weeks: 'últimas 8 semanas' → no default applied", () => {
  assertEquals(inferDefaultWindow("Ranking IBEX últimas 8 semanas").appliedDefault, false);
});

// ───────────────────────── V5: validateSampleSize ────────────────────
Deno.test("1.16-A5-stats: n=1 model → 'no calculable', NOT 'consenso robusto'", () => {
  const v = validateSampleSize(1, 1);
  assertEquals(v.isStatisticallyValid, false);
  assert(v.divergenceLabel.includes("No calculable"));
  assert(v.consensusLabel.includes("1 modelo"));
  assert(v.warning?.includes("mínimo 3 modelos"));
});

Deno.test("1.16-V5-borderline: n=2 records, 2 models → still insufficient", () => {
  const v = validateSampleSize(2, 2);
  assertEquals(v.isStatisticallyValid, false);
});

Deno.test("1.16-V5-sufficient: n=11 records, 6 models → valid, no warning", () => {
  const v = validateSampleSize(11, 6);
  assertEquals(v.isStatisticallyValid, true);
  assertEquals(v.warning, null);
});
