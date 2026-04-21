/**
 * PHASE 1.14 — Temporal Window Guard tests.
 *
 * Coverage:
 *   T1  Iberdrola Q1 2026 with partial data → disclaimer mentions real window
 *   T2  Repsol YTD → disclaimer mentions cutoff + next snapshot
 *   T3  BBVA Q1-2026 vs Q1-2025 (no data for Q1-2025) → block comparison
 *   T4  Exolum Q1 2026 with later first snapshot → disclaimer cites first snap
 *   A1  "December 2025" (pre-index) → disclaimer reports zero data
 *   A2  "últimos 30 días" with weekly grain → expected = number of Sundays
 *   T-inv-A  Snapshots from 16-ene → Q1 disclaimer cites real start 16-ene
 *   T-inv-B  Snapshots from 1-ene  → Q1 emits NO disclaimer (perfect fit)
 *   T-inv-C  Snapshots from 15-feb → disclaimer cites company onboarded 15-feb
 *
 * NO hardcoded production date acts as a floor; all tests inject `today`
 * and a mock supabase client that returns synthetic snapshot rows.
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseTemporalIntent,
  reconcileWindow,
  buildTemporalDisclaimer,
  blockIfImpossibleComparison,
  nextExpectedSundaySnapshot,
  toISODate,
} from "../../_shared/temporalGuard.ts";

// ── Mock Supabase client ───────────────────────────────────────────
function makeMockSupabase(snapshotsByTicker: Record<string, string[]>) {
  // snapshotsByTicker: ticker → array of ISO dates (YYYY-MM-DD)
  return {
    from(_table: string) {
      const state: any = { _ticker: null, _gte: null, _lte: null, _order: { col: null, asc: true }, _limit: 2000 };
      const builder: any = {
        select(_cols: string) { return builder; },
        eq(col: string, val: string) { if (col === "05_ticker") state._ticker = val; return builder; },
        gte(_col: string, val: string) { state._gte = String(val).slice(0, 10); return builder; },
        lte(_col: string, val: string) { state._lte = String(val).slice(0, 10); return builder; },
        order(col: string, opts: { ascending: boolean }) { state._order = { col, asc: opts.ascending }; return builder; },
        limit(n: number) { state._limit = n; return builder; },
        then(resolve: (v: any) => void) {
          // Pick the source set
          const source = state._ticker
            ? (snapshotsByTicker[state._ticker] ?? [])
            : Array.from(new Set(Object.values(snapshotsByTicker).flat()));
          let dates = [...source].sort();
          if (state._gte) dates = dates.filter((d) => d >= state._gte);
          if (state._lte) dates = dates.filter((d) => d <= state._lte);
          if (!state._order.asc) dates.reverse();
          dates = dates.slice(0, state._limit);
          resolve({ data: dates.map((d) => ({ batch_execution_date: `${d}T00:00:00Z` })), error: null });
        },
      };
      return builder;
    },
  };
}

// Generate every Sunday in inclusive range
function sundaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getTime() <= end.getTime()) {
    out.push(toISODate(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// Frozen "today" for deterministic tests.
const TODAY = new Date("2026-04-21T10:00:00Z");

// ── T1 — Iberdrola Q1 2026 with first snapshot 16-ene ──────────────
Deno.test("T1: Iberdrola Q1 2026 — disclaimer cites real window 16-ene→29-mar", async () => {
  const sup = makeMockSupabase({ IBE: sundaysBetween("2026-01-16", "2026-04-19") });
  const intent = parseTemporalIntent("Evolución Iberdrola Q1 2026", TODAY);
  assert(intent.primary, "should parse Q1 2026");
  const w = await reconcileWindow(sup, "IBE", intent.primary!);
  assertEquals(w.start_r, "2026-01-18"); // first Sunday >= 16-ene
  assertEquals(w.end_r, "2026-03-29");
  assert(w.n_real >= 10 && w.n_real <= 12, `n_real=${w.n_real}`);
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertStringIncludes(disc, "Q1 2026");
  assertStringIncludes(disc, "2026-01-18");
  assertStringIncludes(disc, "2026-03-29");
});

// ── T2 — Repsol YTD with cutoff and next-snapshot mention ──────────
Deno.test("T2: Repsol YTD — disclaimer mentions next snapshot date", async () => {
  const sup = makeMockSupabase({ REP: sundaysBetween("2026-01-16", "2026-04-19") });
  const intent = parseTemporalIntent("Repsol en lo que llevamos de 2026", TODAY);
  assert(intent.primary && intent.isOpenEnded);
  assertEquals(intent.primary!.kind, "ytd");
  const w = await reconcileWindow(sup, "REP", intent.primary!);
  const disc = buildTemporalDisclaimer(w, TODAY);
  // Next Sunday >= 21-abr-2026 = 26-abr-2026
  assertStringIncludes(disc, "2026-04-26");
  assertStringIncludes(disc, "2026-04-19");
});

// ── T3 — BBVA Q1-2026 vs Q1-2025 → block ────────────────────────────
Deno.test("T3: BBVA Q1-2026 vs Q1-2025 — comparison is blocked", async () => {
  const sup = makeMockSupabase({ BBVA: sundaysBetween("2026-01-16", "2026-04-19") });
  const intent = parseTemporalIntent("Compara Q1 2026 vs Q1 2025 BBVA", TODAY);
  assert(intent.isComparison, "must detect comparison");
  assert(intent.primary && intent.secondary);
  const w1 = await reconcileWindow(sup, "BBVA", intent.primary!);
  const w2 = await reconcileWindow(sup, "BBVA", intent.secondary!);
  assert(w1.n_real > 0, "primary should have data");
  assertEquals(w2.n_real, 0, "secondary (Q1 2025) must have zero data");
  const block = blockIfImpossibleComparison(w1, w2);
  assert(block.blocked, "must block comparison");
  assertEquals(block.empty_side, "secondary");
  assertStringIncludes(block.message, "No dispongo de datos");
});

// ── T4 — Exolum Q1 2026, first snapshot 17-ene ──────────────────────
Deno.test("T4: Exolum Q1 2026 — disclaimer cites company-specific first snapshot", async () => {
  // Exolum was onboarded a day later: first snapshot Sunday 18-ene-2026
  const sup = makeMockSupabase({ EXO: sundaysBetween("2026-01-18", "2026-04-19") });
  const intent = parseTemporalIntent("Reputación Exolum Q1 2026", TODAY);
  const w = await reconcileWindow(sup, "EXO", intent.primary!);
  assertEquals(w.first_available_snapshot, "2026-01-18");
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertStringIncludes(disc, "2026-01-18");
});

// ── A1 — "diciembre 2025" pre-index → no data ──────────────────────
Deno.test("A1: 'diciembre 2025' query — disclaimer reports zero data", async () => {
  const sup = makeMockSupabase({ IBE: sundaysBetween("2026-01-16", "2026-04-19") });
  const intent = parseTemporalIntent("Iberdrola en diciembre 2025", TODAY);
  assert(intent.primary);
  const w = await reconcileWindow(sup, "IBE", intent.primary!);
  assertEquals(w.n_real, 0);
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertStringIncludes(disc, "No existen datos");
});

// ── A2 — "últimos 30 días" → expected = Sundays in the window ──────
Deno.test("A2: 'últimos 30 días' — expected_n equals Sundays count", async () => {
  const sup = makeMockSupabase({ IBE: sundaysBetween("2026-01-16", "2026-04-19") });
  const intent = parseTemporalIntent("Iberdrola últimos 30 días", TODAY);
  assert(intent.primary && intent.primary!.kind === "rolling_days");
  const w = await reconcileWindow(sup, "IBE", intent.primary!);
  // 30-day window ending 2026-04-21 starts 2026-03-22 → 5 Sundays
  assertEquals(w.n_expected, 5);
  assert(w.n_real >= 4, `n_real=${w.n_real}`);
});

// ══════════════════════════════════════════════════════════════════
// T-inv — same code, three rix_runs_v2 scenarios
// ══════════════════════════════════════════════════════════════════
Deno.test("T-inv-A: data starts 16-ene → Q1 disclaimer present", async () => {
  const sup = makeMockSupabase({ IBE: sundaysBetween("2026-01-16", "2026-04-19") });
  const intent = parseTemporalIntent("Iberdrola Q1 2026", TODAY);
  const w = await reconcileWindow(sup, "IBE", intent.primary!);
  assert(!w.isComplete, "must NOT be complete (gap at start)");
  const disc = buildTemporalDisclaimer(w, TODAY);
  assert(disc.length > 0, "disclaimer must be present");
  assertStringIncludes(disc, "2026-01-18");
});

Deno.test("T-inv-B: data backfilled to 1-ene → Q1 emits NO disclaimer", async () => {
  // Simulate a future backfill: snapshots cover the entire Q1 2026 perfectly
  const sup = makeMockSupabase({ IBE: sundaysBetween("2026-01-04", "2026-04-19") });
  const intent = parseTemporalIntent("Iberdrola Q1 2026", TODAY);
  const w = await reconcileWindow(sup, "IBE", intent.primary!);
  // Q1 has 13 Sundays (4-ene through 29-mar inclusive)
  assertEquals(w.n_expected, 13);
  assertEquals(w.n_real, 13);
  assert(w.isComplete, "Q1 must be complete after backfill");
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertEquals(disc, "", "no disclaimer when window is fully covered");
});

Deno.test("T-inv-C: company onboarded 15-feb → disclaimer cites company-specific floor", async () => {
  // First snapshot for this company is the Sunday on/after 15-feb-2026 → 15-feb (Sunday)
  const sup = makeMockSupabase({ NEW: sundaysBetween("2026-02-15", "2026-04-19") });
  const intent = parseTemporalIntent("NewCo Q1 2026", TODAY);
  const w = await reconcileWindow(sup, "NEW", intent.primary!);
  assertEquals(w.first_available_snapshot, "2026-02-15");
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertStringIncludes(disc, "2026-02-15");
});

// ── Sanity: nextExpectedSundaySnapshot is pure ─────────────────────
Deno.test("nextExpectedSundaySnapshot — pure date arithmetic", () => {
  // Tuesday 21-abr-2026 → next Sunday 26-abr-2026
  assertEquals(nextExpectedSundaySnapshot(new Date("2026-04-21T10:00:00Z")), "2026-04-26");
  // Sunday 26-abr-2026 → same day
  assertEquals(nextExpectedSundaySnapshot(new Date("2026-04-26T10:00:00Z")), "2026-04-26");
});
