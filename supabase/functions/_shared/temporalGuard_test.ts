// P0 — 12 acceptance tests for the temporal resolution layer.
// Covers AJUSTES 1-5 + F volatility null:
//   A.1 last_iso_week, A.2 explicit_date, A.3 explicit_range,
//   AJUSTE 4 snapshot expected = 6 models,
//   AJUSTE 5(c) coverageBanner uses from===to as snapshot/period discriminant,
//   F          stddev returns null when weeks_count <= 1.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseTemporalIntent,
  toISODate,
} from "./temporalGuard.ts";
import { buildCoverageBanner } from "./coverageBanner.ts";
import { computePeriodAggregation } from "./periodAggregation.ts";

// Anchor "today" inside the live data window (Sunday 3-may-2026 → previous
// closed Sunday is 26-abr-2026). Used to pin assertions to known Sundays.
const TODAY = new Date("2026-05-03T12:00:00Z");

Deno.test("P0-1 · A.1 — 'semana pasada' → kind=last_iso_week, end_t = previous Sunday", () => {
  const intent = parseTemporalIntent("top 5 ibex semana pasada", TODAY);
  assert(intent.primary, "expected primary window");
  assertEquals(intent.primary!.kind, "last_iso_week");
  // Previous ISO week ending Sun 2026-04-26.
  assertEquals(intent.primary!.end_t, "2026-04-26");
});

Deno.test("P0-2 · A.1 — 'última semana' alias also resolves to last_iso_week", () => {
  const intent = parseTemporalIntent("rix de Iberdrola última semana", TODAY);
  assert(intent.primary);
  assertEquals(intent.primary!.kind, "last_iso_week");
});

Deno.test("P0-3 · A.1 — 'last week' English alias", () => {
  const intent = parseTemporalIntent("ibex top 5 last week", TODAY);
  assert(intent.primary);
  assertEquals(intent.primary!.kind, "last_iso_week");
});

Deno.test("P0-4 · A.2 — explicit ISO date '2026-04-26' → snapshot puntual (start===end)", () => {
  const intent = parseTemporalIntent("top 5 ibex 2026-04-26", TODAY);
  assert(intent.primary);
  assertEquals(intent.primary!.kind, "explicit_date");
  assertEquals(intent.primary!.start_t, "2026-04-26");
  assertEquals(intent.primary!.end_t, "2026-04-26");
});

Deno.test("P0-5 · A.3 — explicit range 'del 2026-04-19 al 2026-04-26'", () => {
  const intent = parseTemporalIntent("ranking ibex del 2026-04-19 al 2026-04-26", TODAY);
  assert(intent.primary);
  assertEquals(intent.primary!.kind, "explicit_range");
  assertEquals(intent.primary!.start_t, "2026-04-19");
  assertEquals(intent.primary!.end_t, "2026-04-26");
});

Deno.test("P0-6 · A.3 — explicit range with 'hasta'", () => {
  const intent = parseTemporalIntent("evolución 2026-04-12 hasta 2026-04-26", TODAY);
  assert(intent.primary);
  assertEquals(intent.primary!.kind, "explicit_range");
  assertEquals(intent.primary!.start_t, "2026-04-12");
  assertEquals(intent.primary!.end_t, "2026-04-26");
});

Deno.test("P0-7 · AJUSTE 5(c) — coverageBanner reports MODELOS when from===to", () => {
  const banner = buildCoverageBanner({
    from: "2026-04-26",
    to: "2026-04-26",
    coverage_ratio: 6 / 6,
    is_partial: false,
    snapshots_available: 6,
    snapshots_expected: 6,
  });
  // Full coverage on snapshot ⇒ banner is empty (no warning needed).
  assertEquals(banner, "");
});

Deno.test("P0-8 · AJUSTE 5(c) — partial snapshot reports 'modelos' (not 'semanas')", () => {
  const banner = buildCoverageBanner({
    from: "2026-04-26",
    to: "2026-04-26",
    coverage_ratio: 1 / 6,
    is_partial: true,
    snapshots_available: 1,
    snapshots_expected: 6,
  });
  assertStringIncludes(banner, "modelos respondieron");
  assertStringIncludes(banner, "1/6");
  // Anti-bug: must NOT claim "% del período" or "snapshots semanales" on
  // a punctual snapshot.
  assert(!banner.includes("snapshots semanales"));
  assert(!banner.includes("% del período"));
});

Deno.test("P0-9 · AJUSTE 5(c) — multi-week period reports 'snapshots semanales'", () => {
  const banner = buildCoverageBanner({
    from: "2026-03-01",
    to: "2026-04-26",
    coverage_ratio: 4 / 8,
    is_partial: true,
    snapshots_available: 4,
    snapshots_expected: 8,
  });
  assertStringIncludes(banner, "snapshots semanales");
  assertStringIncludes(banner, "4/8");
  assert(!banner.includes("modelos respondieron"));
});

Deno.test("P0-10 · F — volatility is NULL with a single weekly observation", () => {
  const result = computePeriodAggregation([
    { batch_execution_date: "2026-04-26", "02_model_name": "ChatGPT", "09_rix_score": 70 },
    { batch_execution_date: "2026-04-26", "02_model_name": "Google Gemini", "09_rix_score": 72 },
  ]);
  assertEquals(result.period_summary.weeks_count, 1);
  assertEquals(result.period_aggregation["RIX"].volatility, null);
});

Deno.test("P0-11 · F — volatility is a number with ≥2 weekly observations", () => {
  const result = computePeriodAggregation([
    { batch_execution_date: "2026-04-19", "02_model_name": "ChatGPT", "09_rix_score": 60 },
    { batch_execution_date: "2026-04-26", "02_model_name": "ChatGPT", "09_rix_score": 80 },
  ]);
  assertEquals(result.period_summary.weeks_count, 2);
  const vol = result.period_aggregation["RIX"].volatility;
  assert(typeof vol === "number" && vol > 0, `expected positive volatility, got ${vol}`);
});

Deno.test("P0-12 · A.2 + toISODate — explicit_date round-trips to the same Sunday string", () => {
  const intent = parseTemporalIntent("snapshot 2026-04-26", TODAY);
  assert(intent.primary);
  assertEquals(intent.primary!.start_t, "2026-04-26");
  assertEquals(toISODate(new Date("2026-04-26T00:00:00Z")), "2026-04-26");
});