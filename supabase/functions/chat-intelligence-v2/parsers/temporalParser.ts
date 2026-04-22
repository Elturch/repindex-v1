// chat-intelligence-v2 / parsers / temporalParser.ts
// Reuses _shared/temporalGuard.ts. No prompts, no SQL beyond reconcileWindow.
// Max 250 LOC.
import {
  parseTemporalIntent,
  reconcileWindow,
  toISODate,
  type TheoreticalWindow,
  type ReconciledWindow,
} from "../../_shared/temporalGuard.ts";
import type { Mode, ResolvedTemporal } from "../types.ts";

const DEFAULT_WEEKS_BACK = 4;

function buildDefaultWindow(today: Date): TheoreticalWindow {
  const end = new Date(today);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - DEFAULT_WEEKS_BACK * 7);
  return {
    start_t: toISODate(start),
    end_t: toISODate(end),
    label: `últimas ${DEFAULT_WEEKS_BACK} semanas (por defecto)`,
    granularity: "weekly",
    kind: "default",
  };
}

function reconciledToResolved(rec: ReconciledWindow): ResolvedTemporal {
  const expected = Math.max(1, rec.n_expected || 0);
  const available = rec.n_real || 0;
  const coverage = expected > 0 ? Math.min(1, available / expected) : 0;
  const isPartial = available < expected;
  return {
    from: rec.start_r ?? rec.requested.start_t,
    to: rec.end_r ?? rec.requested.end_t,
    requested_label: rec.requested.label,
    snapshots_expected: expected,
    snapshots_available: available,
    coverage_ratio: Number(coverage.toFixed(3)),
    is_partial: isPartial,
  };
}

export function inferMode(temporal: ResolvedTemporal): Mode {
  return (temporal.snapshots_available || 0) > 1 ? "period" : "snapshot";
}

/**
 * parseTemporal(question, supabase, ticker?)
 *
 * 1. parseTemporalIntent(question) → TheoreticalWindow
 * 2. reconcileWindow(supabase, ticker, requested) → ReconciledWindow
 * 3. Convert to ResolvedTemporal with coverage_ratio + is_partial
 */
export async function parseTemporal(
  question: string,
  supabase: any,
  ticker: string | null = null,
): Promise<ResolvedTemporal> {
  const today = new Date();
  const intent = parseTemporalIntent(question, today);
  const requested = intent.primary ?? buildDefaultWindow(today);
  let reconciled: ReconciledWindow;
  try {
    reconciled = await reconcileWindow(supabase, ticker, requested);
  } catch (e) {
    console.error("[RIX-V2][temporal] reconcileWindow error:", e);
    reconciled = {
      requested,
      start_r: null,
      end_r: null,
      n_real: 0,
      n_expected: 1,
      first_available_snapshot: null,
      last_available_snapshot: null,
      gap_days_start: 0,
      gap_days_end: 0,
      isComplete: false,
    };
  }
  return reconciledToResolved(reconciled);
}

export const __test__ = { buildDefaultWindow, reconciledToResolved };