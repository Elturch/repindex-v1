/**
 * PHASE 1.9 — A1 (multi-sector) + A2 (model ranking for entity) + A3 (period weeks)
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseModelRankingForEntity,
  parsePeriodWeeks,
  parseMultiSectorComparison,
} from "../../_shared/modelsEnum.ts";

// ─── A2: Model ranking for entity ────────────────────────────────
Deno.test("A2-1: 'qué modelos miden mejor a CaixaBank' → active", () => {
  const r = parseModelRankingForEntity("qué modelos miden mejor a CaixaBank");
  assertEquals(r.active, true);
  assertEquals(r.label, "Ranking de modelos");
});

Deno.test("A2-2: 'ranking de modelos para Inditex' → active", () => {
  const r = parseModelRankingForEntity("ranking de modelos para Inditex");
  assertEquals(r.active, true);
});

Deno.test("A2-3: 'ranking de banca' → not a model-ranking query", () => {
  const r = parseModelRankingForEntity("ranking de banca");
  assertEquals(r.active, false);
});

// ─── A3: Period weeks ────────────────────────────────────────────
Deno.test("A3-1: 'evolución de banca últimas 8 semanas' → 8 weeks", () => {
  const r = parsePeriodWeeks("evolución de banca últimas 8 semanas");
  assertEquals(r?.weeks, 8);
  assertEquals(r?.unit, "weeks");
});

Deno.test("A3-2: 'past 12 weeks' → 12 weeks", () => {
  const r = parsePeriodWeeks("show me past 12 weeks");
  assertEquals(r?.weeks, 12);
});

Deno.test("A3-3: 'últimos 3 meses' → 12 weeks (capped)", () => {
  const r = parsePeriodWeeks("evolución últimos 3 meses");
  assertEquals(r?.weeks, 12);
  assertEquals(r?.unit, "months");
});

// ─── A1: Multi-sector comparison ─────────────────────────────────
Deno.test("A1-1: 'compara banca y energía' → 2 sectors detected", () => {
  const r = parseMultiSectorComparison("compara banca y energía");
  assertEquals(r.active, true);
  assertEquals(r.sectors.length >= 2, true);
});

Deno.test("A1-2: 'banca vs tecnología' → active", () => {
  const r = parseMultiSectorComparison("banca vs tecnología");
  assertEquals(r.active, true);
});

Deno.test("A1-3: 'ranking de banca' → NOT multi-sector (single)", () => {
  const r = parseMultiSectorComparison("ranking de banca");
  assertEquals(r.active, false);
});
