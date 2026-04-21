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
/**
 * PHASE 1.14c — Column-aware mock.
 *
 * Each input date is interpreted as the Sunday on which the sweep ran
 * (`batch_execution_date`). The mock derives the *evaluated week*
 * window for that sweep:
 *
 *   batch_execution_date = SUN  (e.g. 2026-01-18)
 *   07_period_to         = SAT  one day before  (2026-01-17)  — end of evaluated week
 *   06_period_from       = SUN  seven days before (2026-01-11) — start of evaluated week
 *
 * Filters (`gte` / `lte`) and ordering apply to whichever column the
 * caller actually requested in `.select()` / `.order()` / `.gte()` /
 * `.lte()`. This way the test suite proves that `reconcileWindow`
 * really reads from the column it claims to read from — no silent
 * column drift.
 */
const KNOWN_COLS = new Set([
  "batch_execution_date",
  "06_period_from",
  "07_period_to",
]);

function deriveRow(sweepDate: string): Record<string, string> {
  const sweep = new Date(`${sweepDate}T00:00:00Z`);
  const periodTo = new Date(sweep);
  periodTo.setUTCDate(periodTo.getUTCDate() - 1); // SAT before sweep SUN
  const periodFrom = new Date(sweep);
  periodFrom.setUTCDate(periodFrom.getUTCDate() - 7); // SUN one week before
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    batch_execution_date: `${sweepDate}T00:00:00Z`,
    "07_period_to": `${iso(periodTo)}T00:00:00Z`,
    "06_period_from": `${iso(periodFrom)}T00:00:00Z`,
  };
}

function makeMockSupabase(snapshotsByTicker: Record<string, string[]>) {
  // snapshotsByTicker: ticker → array of sweep dates (Sundays, YYYY-MM-DD)
  return {
    from(_table: string) {
      const state: any = {
        _ticker: null,
        _selectCol: null as string | null,
        _gteCol: null as string | null,
        _gte: null as string | null,
        _lteCol: null as string | null,
        _lte: null as string | null,
        _order: { col: null as string | null, asc: true },
        _limit: 2000,
      };
      const builder: any = {
        select(cols: string) {
          // Pick the first known temporal column appearing in the SELECT.
          const trimmed = String(cols || "").split(",").map((s) => s.trim());
          for (const c of trimmed) if (KNOWN_COLS.has(c)) { state._selectCol = c; break; }
          return builder;
        },
        eq(col: string, val: string) { if (col === "05_ticker") state._ticker = val; return builder; },
        gte(col: string, val: string) { state._gteCol = col; state._gte = String(val).slice(0, 10); return builder; },
        lte(col: string, val: string) { state._lteCol = col; state._lte = String(val).slice(0, 10); return builder; },
        order(col: string, opts: { ascending: boolean }) { state._order = { col, asc: opts.ascending }; return builder; },
        limit(n: number) { state._limit = n; return builder; },
        then(resolve: (v: any) => void) {
          const sweepDates = state._ticker
            ? (snapshotsByTicker[state._ticker] ?? [])
            : Array.from(new Set(Object.values(snapshotsByTicker).flat()));
          let rows = sweepDates.map(deriveRow);
          // Filter by whichever column the caller filtered on.
          const filterCol = state._gteCol || state._lteCol;
          if (filterCol && KNOWN_COLS.has(filterCol)) {
            rows = rows.filter((r) => {
              const v = String(r[filterCol] || "").slice(0, 10);
              if (state._gte && v < state._gte) return false;
              if (state._lte && v > state._lte) return false;
              return true;
            });
          }
          // Sort by whichever column was requested in .order(); fall back
          // to the SELECT column. Defaults to batch_execution_date.
          const sortCol = (state._order.col && KNOWN_COLS.has(state._order.col))
            ? state._order.col
            : (state._selectCol || "batch_execution_date");
          rows.sort((a, b) => String(a[sortCol]).localeCompare(String(b[sortCol])));
          if (!state._order.asc) rows.reverse();
          rows = rows.slice(0, state._limit);
          resolve({ data: rows, error: null });
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
  // Canonical column is now `07_period_to` (= SAT before each sweep SUN).
  // First sweep SUN = 18-ene → 07_period_to = 17-ene.
  // Last sweep SUN inside Q1 = 29-mar → 07_period_to = 28-mar.
  assertEquals(w.start_r, "2026-01-17");
  assertEquals(w.end_r, "2026-03-28");
  assert(w.n_real >= 10 && w.n_real <= 12, `n_real=${w.n_real}`);
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertStringIncludes(disc, "Q1 2026");
  assertStringIncludes(disc, "2026-01-17");
  assertStringIncludes(disc, "2026-03-28");
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
  // Last sweep SUN = 19-abr → 07_period_to = 18-abr.
  assertStringIncludes(disc, "2026-04-18");
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
  // First sweep SUN = 18-ene → canonical 07_period_to = 17-ene.
  assertEquals(w.first_available_snapshot, "2026-01-17");
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertStringIncludes(disc, "2026-01-17");
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
  // 07_period_to of first sweep SUN 18-ene = 17-ene.
  assertStringIncludes(disc, "2026-01-17");
});

Deno.test("T-inv-B: data backfilled to 1-ene → Q1 emits NO disclaimer", async () => {
  // Simulate a future backfill: snapshots cover the entire Q1 2026 perfectly
  // Sweep SUN 4-ene → 07_period_to = 3-ene. To cover Q1 perfectly under
  // the new canon (07_period_to ∈ Q1 means SAT in [1-ene, 31-mar]) we
  // need the first sweep to be SUN 11-ene (07_period_to = 10-ene).
  // Wait — Q1 starts 1-ene. The first valid 07_period_to inside Q1 must
  // be ≥ 1-ene. Earliest such SAT = SAT 3-ene → preceded by sweep SUN
  // 4-ene. So sweep range 4-ene…29-mar covers 07_period_to 3-ene…28-mar
  // → 13 SATs in Q1. Use 4-ene as the first sweep date.
  const sup = makeMockSupabase({ IBE: sundaysBetween("2026-01-04", "2026-04-19") });
  const intent = parseTemporalIntent("Iberdrola Q1 2026", TODAY);
  const w = await reconcileWindow(sup, "IBE", intent.primary!);
  // 07_period_to canon: count distinct SATs of evaluated weeks ∈ [1-ene, 31-mar].
  // Sweep SUN 4-ene gives 07_period_to 3-ene (in Q1). Last Q1 sweep SUN
  // 29-mar → 07_period_to 28-mar (in Q1). Total = 13 distinct SATs.
  assertEquals(w.n_real, 13);
  // n_expected counts Sundays in [first_avail, end_t]; this is unchanged
  // arithmetic, so it remains 13 when the company is on board for all
  // Sundays in Q1 (first_avail = 3-ene ≤ first Sunday of Q1 = 4-ene).
  assertEquals(w.n_expected, 13);
  assert(w.isComplete, "Q1 must be complete after backfill");
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertEquals(disc, "", "no disclaimer when window is fully covered");
});

Deno.test("T-inv-C: company onboarded 15-feb → disclaimer cites company-specific floor", async () => {
  // First snapshot for this company is the Sunday on/after 15-feb-2026 → 15-feb (Sunday)
  const sup = makeMockSupabase({ NEW: sundaysBetween("2026-02-15", "2026-04-19") });
  const intent = parseTemporalIntent("NewCo Q1 2026", TODAY);
  const w = await reconcileWindow(sup, "NEW", intent.primary!);
  // Sweep SUN 15-feb → 07_period_to = 14-feb.
  assertEquals(w.first_available_snapshot, "2026-02-14");
  const disc = buildTemporalDisclaimer(w, TODAY);
  assertStringIncludes(disc, "2026-02-14");
});

// ── Sanity: nextExpectedSundaySnapshot is pure ─────────────────────
Deno.test("nextExpectedSundaySnapshot — pure date arithmetic", () => {
  // Tuesday 21-abr-2026 → next Sunday 26-abr-2026
  assertEquals(nextExpectedSundaySnapshot(new Date("2026-04-21T10:00:00Z")), "2026-04-26");
  // Sunday 26-abr-2026 → same day
  assertEquals(nextExpectedSundaySnapshot(new Date("2026-04-26T10:00:00Z")), "2026-04-26");
});
