/**
 * PHASE 1.8b — Company-quantifier regression suite
 *
 * Validates parseCompanyQuantifier:
 *  - "top 3" / "los 3 mejores empresas" → top mode.
 *  - "peores 2" / "bottom 5" → bottom mode.
 *  - "los 3 mejores MODELOS" must NOT be parsed (that's parseQuantifier).
 *  - Word-numbers ("tres", "cuatro").
 */
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseCompanyQuantifier,
  parseQuantifier,
} from "../../_shared/modelsEnum.ts";

Deno.test("CQ1: 'top 3' → count=3, mode=top", () => {
  const r = parseCompanyQuantifier("dame el top 3 de banca");
  assertEquals(r?.count, 3);
  assertEquals(r?.mode, "top");
});

Deno.test("CQ2: 'los 5 mejores empresas' → count=5, mode=top", () => {
  const r = parseCompanyQuantifier("muestrame los 5 mejores empresas del IBEX");
  assertEquals(r?.count, 5);
  assertEquals(r?.mode, "top");
});

Deno.test("CQ3: 'peores 2' → count=2, mode=bottom", () => {
  const r = parseCompanyQuantifier("ranking de banca peores 2");
  assertEquals(r?.count, 2);
  assertEquals(r?.mode, "bottom");
});

Deno.test("CQ4: 'bottom 5' → count=5, mode=bottom", () => {
  const r = parseCompanyQuantifier("dame el bottom 5 del IBEX");
  assertEquals(r?.count, 5);
  assertEquals(r?.mode, "bottom");
});

Deno.test("CQ5: trampa — 'ranking de banca con los 3 mejores modelos' → null (not a company quantifier)", () => {
  const r = parseCompanyQuantifier("ranking de banca con los 3 mejores modelos");
  assertEquals(r, null, "must NOT activate company top-N when 'modelos' follows");
  // …but the model-quantifier path SHOULD fire
  const m = parseQuantifier("ranking de banca con los 3 mejores modelos");
  assertEquals(m?.count, 3);
  assertEquals(m?.mode, "top_coverage");
});

Deno.test("CQ6: word number 'los tres mejores empresas' → count=3", () => {
  const r = parseCompanyQuantifier("dame las tres mejores empresas");
  assertEquals(r?.count, 3);
  assertEquals(r?.mode, "top");
});

Deno.test("CQ7: 'top 3' followed by 'modelos' → null", () => {
  const r = parseCompanyQuantifier("top 3 modelos para banca");
  assertEquals(r, null);
});

Deno.test("CQ8: bare 'ranking de banca' (no quantifier) → null", () => {
  const r = parseCompanyQuantifier("ranking de banca");
  assertEquals(r, null);
});

// ──────────────────────────────────────────────────────────────────
// PHASE 1.8c — Disambiguation: N modelos vs N empresas
// ──────────────────────────────────────────────────────────────────

Deno.test("CQ9: 'ranking de banca con los 3 mejores modelos' → company=null, model count=3", () => {
  const q = "ranking de banca con los 3 mejores modelos";
  assertEquals(parseCompanyQuantifier(q), null, "must NOT slice companies when '3' refers to modelos");
  const m = parseQuantifier(q);
  assertEquals(m?.count, 3);
  assertEquals(m?.mode, "top_coverage");
});

Deno.test("CQ10: 'top 3 empresas de banca' → company count=3 mode=top, model=null", () => {
  const q = "top 3 empresas de banca";
  const c = parseCompanyQuantifier(q);
  assertEquals(c?.count, 3);
  assertEquals(c?.mode, "top");
  assertEquals(parseQuantifier(q), null, "no model quantifier when 'empresas' is explicit");
});

Deno.test("CQ11: 'top 5 modelos para Inditex' → company=null, model count=5", () => {
  const q = "top 5 modelos para Inditex";
  assertEquals(parseCompanyQuantifier(q), null, "must NOT slice companies when '5' refers to modelos");
  const m = parseQuantifier(q);
  // parseQuantifier requires "los/las N mejores/principales modelos" — bare
  // "top 5 modelos" is a valid model selector intent but not matched by the
  // current top_coverage regex. The critical assertion is that companies are
  // NOT sliced (CQ7 covers 'top 3 modelos para banca' → null already).
  assertEquals(m, null, "bare 'top N modelos' currently routes via parseModels not parseQuantifier");
});

Deno.test("CQ12: 'los 2 peores bancos según los 3 mejores modelos' → company count=2 bottom, model count=3", () => {
  const q = "los 2 peores bancos según los 3 mejores modelos";
  const c = parseCompanyQuantifier(q);
  assertEquals(c?.count, 2, "company quantifier captures the '2 peores'");
  assertEquals(c?.mode, "bottom");
  const m = parseQuantifier(q);
  assertEquals(m?.count, 3, "model quantifier captures the trailing '3 mejores modelos'");
  assertEquals(m?.mode, "top_coverage");
});