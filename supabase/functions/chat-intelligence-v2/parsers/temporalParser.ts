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
import { resolveLastClosedSunday, formatSundayLabel } from "../../_shared/sundayResolver.ts";
import type { Mode, ResolvedTemporal } from "../types.ts";

// Default window policy (when the user does NOT specify a period):
//   - try MAX_WEEKS (1 trimestre, full editorial coverage),
//   - clamp to the actual rix_runs_v2 coverage for the ticker,
//   - never go below MIN_WEEKS.
// The user can still force shorter windows ("última semana") because that
// path goes through parseTemporalIntent → primary != null and skips this.
const MAX_WEEKS = 13;
const MIN_WEEKS = 4;

// PHASE 4 — Expected number of AI models per weekly snapshot. A "complete"
// week has snapshots for all 6 models (ChatGPT, Perplexity, Gemini,
// DeepSeek, Grok, Qwen). Used to classify current week as complete vs partial.
const EXPECTED_MODELS_PER_SNAPSHOT = 6;

function buildSyntheticDefaultWindow(today: Date, weeks: number): TheoreticalWindow {
  const end = new Date(today);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - weeks * 7);
  return {
    start_t: toISODate(start),
    end_t: toISODate(end),
    label: `últimas ${weeks} semanas (por defecto)`,
    granularity: "weekly",
    kind: "default",
  };
}

/**
 * Build a coverage-aware default window when the user did NOT specify a
 * period. Asks rix_runs_v2 for the latest period_to available for the
 * ticker (or globally) and walks MAX_WEEKS back from there. Falls back to
 * the synthetic "today − N×7" window if the SQL probe fails.
 */
async function buildAdaptiveDefaultWindow(
  supabase: any,
  ticker: string | null,
  today: Date,
): Promise<TheoreticalWindow> {
  try {
    let q = supabase
      .from("rix_runs_v2")
      .select("07_period_to")
      .order("07_period_to", { ascending: false })
      .limit(1);
    if (ticker) q = q.eq("05_ticker", ticker);
    const { data } = await q;
    const lastIso = data?.[0]?.["07_period_to"]
      ? String(data[0]["07_period_to"]).slice(0, 10)
      : null;
    if (!lastIso) {
      return buildSyntheticDefaultWindow(today, MAX_WEEKS);
    }
    const end = new Date(`${lastIso}T00:00:00Z`);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - MAX_WEEKS * 7);
    return {
      start_t: toISODate(start),
      end_t: toISODate(end),
      label: `cobertura completa (${MAX_WEEKS} semanas hasta ${toISODate(end)})`,
      granularity: "weekly",
      kind: "default_adaptive",
    };
  } catch (e) {
    console.error("[RIX-V2][temporal] buildAdaptiveDefaultWindow probe failed:", e);
    return buildSyntheticDefaultWindow(today, MAX_WEEKS);
  }
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
    requested_from: rec.requested.start_t,
    requested_to: rec.requested.end_t,
  };
}

/**
 * PHASE 4 — Snapshot-aware resolver for the "esta semana" / "this week"
 * intent. PHASE 5 — Delegates to the canonical Sunday resolver
 * (_shared/sundayResolver.ts) which aligns the window to the SWEEP axis
 * (Sunday = 07_period_to) instead of the ISO Monday-Sunday week. This
 * fixes the off-by-one that previously dropped the current week's row
 * (period_from = previous Sunday) from the [Mon..Sun] range.
 */
async function resolveCurrentWeekWindow(
  supabase: any,
  ticker: string | null,
  requested: TheoreticalWindow,
  today: Date,
): Promise<{ resolved: ResolvedTemporal; reason: ResolvedTemporal["window_reason"] }> {
  const closed = await resolveLastClosedSunday(supabase, today);
  // Probe how many of the 6 models have a row on that exact Sunday
  // (snapshot puntual, NO rango lunes-domingo).
  let qModels = supabase
    .from("rix_runs_v2")
    .select("02_model_name")
    .eq("07_period_to", closed.sundayISO);
  if (ticker) qModels = qModels.eq("05_ticker", ticker);
  let nModels = 0;
  try {
    const { data } = await qModels;
    const set = new Set<string>();
    for (const r of (data ?? [])) set.add(String(r["02_model_name"] ?? ""));
    nModels = set.size;
  } catch (_e) { /* nModels stays 0 */ }

  const reason: ResolvedTemporal["window_reason"] = closed.sweepInProgress
    ? "fallback_last_complete_week"
    : (nModels >= EXPECTED_MODELS_PER_SNAPSHOT
        ? "current_week_complete"
        : "current_week_partial");

  return {
    resolved: {
      from: closed.sundayISO,
      to: closed.sundayISO,
      requested_label: formatSundayLabel(closed.sundayISO, closed.sweepInProgress),
      snapshots_expected: EXPECTED_MODELS_PER_SNAPSHOT,
      snapshots_available: nModels,
      coverage_ratio: Number(Math.min(1, nModels / EXPECTED_MODELS_PER_SNAPSHOT).toFixed(3)),
      is_partial: nModels < EXPECTED_MODELS_PER_SNAPSHOT,
      requested_from: closed.sundayISO,
      requested_to: closed.sundayISO,
      window_reason: reason,
    },
    reason,
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

  // PHASE 4 — "esta semana" / "this week" gets the snapshot-aware resolver
  // (current_week_complete | current_week_partial | fallback_last_complete_week).
  if (intent.primary?.kind === "current_iso_week") {
    const { resolved } = await resolveCurrentWeekWindow(supabase, ticker, intent.primary, today);
    return resolved;
  }

  // If the user explicitly stated a period, respect it. Otherwise
  // build a coverage-aware default (up to MAX_WEEKS = 13).
  const requested = intent.primary ?? await buildAdaptiveDefaultWindow(supabase, ticker, today);
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
  let resolved = reconciledToResolved(reconciled);

  // Floor enforcement: when the user did NOT specify a period and the
  // adaptive window returned fewer than MIN_WEEKS real snapshots, widen
  // the window backwards until we reach MIN_WEEKS (or run out of data).
  if (intent.primary == null && resolved.snapshots_available < MIN_WEEKS) {
    try {
      const widened = buildSyntheticDefaultWindow(today, MAX_WEEKS);
      const wRec = await reconcileWindow(supabase, ticker, widened);
      const wResolved = reconciledToResolved(wRec);
      if (wResolved.snapshots_available > resolved.snapshots_available) {
        resolved = wResolved;
      }
    } catch (_e) { /* keep original */ }
  }
  return resolved;
}

export const __test__ = { buildSyntheticDefaultWindow, buildAdaptiveDefaultWindow, reconciledToResolved };