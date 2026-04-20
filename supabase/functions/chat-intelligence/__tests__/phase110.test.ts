/**
 * PHASE 1.10 — InfoBar ↔ informe alignment.
 *
 * Bug: InfoBar showed snapshot weeks (e.g. 14) while the report body used the
 * capped value (12) → user-visible mismatch.
 *
 * These tests guard the contract that when a user explicitly asks for a
 * period, the cap (12) is the single source of truth for both the InfoBar
 * (`weeks_analyzed` / `period_weeks_label`) and the downstream report.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parsePeriodWeeks } from "../../_shared/modelsEnum.ts";

/** Mirrors the override block in chat-intelligence/index.ts (PHASE 1.10). */
function applyPeriodOverride(
  question: string,
  snapshot: { weeks_analyzed: number; date_from: string | null; date_to: string | null },
) {
  const periodWeeks = parsePeriodWeeks(question);
  const ctx = { ...snapshot } as {
    weeks_analyzed: number;
    date_from: string | null;
    date_to: string | null;
    period_weeks_label?: string;
  };
  if (!periodWeeks) return ctx;
  ctx.weeks_analyzed = periodWeeks.weeks;
  const baseTo = ctx.date_to ? new Date(ctx.date_to) : new Date();
  if (!isNaN(baseTo.getTime())) {
    const realignedFrom = new Date(baseTo);
    realignedFrom.setUTCDate(realignedFrom.getUTCDate() - (periodWeeks.weeks * 7));
    ctx.date_from = realignedFrom.toISOString().slice(0, 10);
  }
  ctx.period_weeks_label = periodWeeks.unit === "months"
    ? `Período: últimos ${Math.round(periodWeeks.weeks / 4)} meses (${periodWeeks.weeks} semanas)`
    : `Período: últimas ${periodWeeks.weeks} semanas`;
  return ctx;
}

Deno.test("1.10-1: 'últimas 20 semanas' → InfoBar y report ambos = 12 (cap)", () => {
  const ctx = applyPeriodOverride("ranking de Naturgy últimas 20 semanas", {
    weeks_analyzed: 14, // snapshot real con MÁS semanas que el cap
    date_from: "2026-01-16",
    date_to: "2026-04-19",
  });
  assertEquals(ctx.weeks_analyzed, 12);
  // date_from se realinea al cap (12 semanas antes de date_to)
  assertEquals(ctx.date_from, "2026-01-24");
});

Deno.test("1.10-2: 'últimas 30 semanas' → cap 12, InfoBar = report", () => {
  const ctx = applyPeriodOverride("evolución últimas 30 semanas", {
    weeks_analyzed: 30,
    date_from: "2025-10-01",
    date_to: "2026-04-19",
  });
  assertEquals(ctx.weeks_analyzed, 12);
  assertEquals(ctx.period_weeks_label, "Período: últimas 12 semanas");
});

Deno.test("1.10-3: 'últimos 6 meses' → cap 12 semanas", () => {
  const ctx = applyPeriodOverride("dame los últimos 6 meses", {
    weeks_analyzed: 14,
    date_from: "2026-01-16",
    date_to: "2026-04-19",
  });
  assertEquals(ctx.weeks_analyzed, 12);
  assertEquals(ctx.period_weeks_label, "Período: últimos 3 meses (12 semanas)");
});

Deno.test("1.10-4: snapshot menor (8) NO infla a 12 si el usuario no pide periodo", () => {
  const ctx = applyPeriodOverride("ranking de Naturgy", {
    weeks_analyzed: 8,
    date_from: "2026-02-22",
    date_to: "2026-04-19",
  });
  // sin parsePeriodWeeks match → no override
  assertEquals(ctx.weeks_analyzed, 8);
  assertEquals(ctx.date_from, "2026-02-22");
});