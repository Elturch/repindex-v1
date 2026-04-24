/**
 * PHASE 1.19a — Period-mode aggregation tests.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computePeriodAggregation,
  renderPeriodAggregationBlock,
} from "../../_shared/periodAggregation.ts";

function row(date: string, model: string, rix: number, cem: number) {
  return {
    batch_execution_date: date,
    "02_model_name": model,
    "09_rix_score": rix,
    "35_cem_score": cem,
  };
}

Deno.test("19a-1: single week → mode=snapshot", () => {
  const rows = [row("2026-04-19", "gpt-4o", 65, 88)];
  const r = computePeriodAggregation(rows);
  assertEquals(r.period_summary.mode, "snapshot");
  assertEquals(r.period_summary.weeks_count, 1);
});

Deno.test("19a-2: 10 weeks Q1 Ferrovial → mode=period, mean & delta", () => {
  const weeks = [
    "2026-01-25", "2026-02-01", "2026-02-08", "2026-02-15", "2026-02-22",
    "2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29",
  ];
  const rixSeries = [63, 64, 63, 65, 64, 66, 65, 64, 65, 65];
  const rows = weeks.flatMap((d, i) => [
    row(d, "gpt-4o", rixSeries[i], 88),
    row(d, "perplexity", rixSeries[i] + 1, 90),
  ]);
  const r = computePeriodAggregation(rows);
  assertEquals(r.period_summary.mode, "period");
  assertEquals(r.period_summary.weeks_count, 10);
  assertEquals(r.period_summary.rix_first, 63.5);
  assertEquals(r.period_summary.rix_last, 65.5);
  assertEquals(r.period_summary.rix_delta, 2);
  assertEquals(r.period_summary.rix_trend, "estable"); // |2| ≤ 3
});

Deno.test("19a-3: rendered block contains MEDIA PERÍODO header & rule", () => {
  const weeks = ["2026-03-01", "2026-03-08", "2026-03-15"];
  const rows = weeks.map((d, i) => row(d, "gpt-4o", 60 + i * 5, 80));
  const r = computePeriodAggregation(rows);
  const txt = renderPeriodAggregationBlock(r);
  if (!txt.includes("MEDIA PERÍODO")) throw new Error("Missing MEDIA PERÍODO header");
  if (!txt.includes("INICIO → FIN")) throw new Error("Missing INICIO → FIN header");
  if (!txt.includes("PROHIBIDO decir")) throw new Error("Missing anti-snapshot rule");
});

Deno.test("19a-4: snapshot mode → empty render block", () => {
  const r = computePeriodAggregation([row("2026-04-19", "gpt-4o", 70, 85)]);
  assertEquals(renderPeriodAggregationBlock(r), "");
});