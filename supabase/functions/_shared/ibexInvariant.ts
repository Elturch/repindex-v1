/**
 * IBEX-35 Invariant Guardrail
 * ---------------------------
 * The IBEX-35 index, by definition and by name, has exactly 35 components.
 * The simulated 2026 universe in `repindex_root_issuers` must respect that
 * invariant. Any drift (e.g. promotion without a balancing demotion) is a
 * data-quality bug that contaminates rankings, banners, and exports.
 *
 * This helper performs a non-blocking check and logs a structured warning
 * when the active count deviates from 35. It is intentionally cheap so it
 * can be called inline from hot paths (sectorRanking, sweep-runner) without
 * adding latency.
 */

export const IBEX35_EXPECTED_COUNT = 35;
export const IBEX35_FAMILY_CODE = "IBEX-35";

export interface IbexInvariantResult {
  ok: boolean;
  expected: number;
  actual: number;
  drift: number;
  tickers: string[];
}

/**
 * Query the canonical IBEX-35 active set and report drift.
 * Never throws — logs and returns a result object so callers can decide.
 */
export async function assertIbex35Invariant(
  supabase: any,
  context: string = "unknown",
): Promise<IbexInvariantResult> {
  const { data, error } = await supabase
    .from("repindex_root_issuers")
    .select("ticker")
    .eq("ibex_family_code", IBEX35_FAMILY_CODE);

  if (error) {
    console.warn(
      `[ibex-invariant][${context}] query_failed | error=${error.message}`,
    );
    return { ok: false, expected: IBEX35_EXPECTED_COUNT, actual: -1, drift: NaN, tickers: [] };
  }

  const tickers = (data ?? []).map((r: any) => r.ticker).filter(Boolean);
  const actual = tickers.length;
  const drift = actual - IBEX35_EXPECTED_COUNT;
  const ok = drift === 0;

  if (!ok) {
    console.warn(
      `[ibex-invariant][${context}] DRIFT detected | expected=${IBEX35_EXPECTED_COUNT} | actual=${actual} | drift=${drift > 0 ? "+" + drift : drift}`,
    );
  }
  return { ok, expected: IBEX35_EXPECTED_COUNT, actual, drift, tickers };
}

/**
 * Pure helper for tests: compute drift from a known ticker list.
 */
export function computeDrift(tickers: string[]): IbexInvariantResult {
  const actual = tickers.length;
  const drift = actual - IBEX35_EXPECTED_COUNT;
  return {
    ok: drift === 0,
    expected: IBEX35_EXPECTED_COUNT,
    actual,
    drift,
    tickers,
  };
}