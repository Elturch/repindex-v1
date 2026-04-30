/**
 * Shared consensus DESCRIPTOR — single source of truth.
 * Used by useLandingTopFives (home/landing) and Dashboard.
 *
 * Rules (NEW — anti-mediana, never average across AIs):
 *  - Group rows by ticker.
 *  - Expose min, max, range and a qualitative consensus level.
 *  - NO trim-mean. NO single "RIX number". The caller must show the
 *    range or pick a specific model — never collapse 6 different AIs
 *    into one synthetic score.
 *
 *  Consensus level (from max − min):
 *      • <= 10  → "alto"
 *      • <= 20  → "medio"
 *      •  > 20  → "bajo"
 */

export type ConsensusLevel = "alto" | "medio" | "bajo";

export interface ConsensusInput {
  ticker: string;
  rix_score: number | null | undefined;
}

export interface ConsensusAggregate {
  ticker: string;
  min: number;
  max: number;
  consensusLevel: ConsensusLevel;
  range: number;
  modelsCount: number;
}

export function classifyConsensus(range: number): ConsensusLevel {
  if (range <= 10) return "alto";
  if (range <= 20) return "medio";
  return "bajo";
}

/**
 * Group rows by ticker and produce one consensus DESCRIPTOR per ticker
 * (min/max/range + qualitative level). Never returns an aggregated score.
 */
export function aggregateConsensus<T extends ConsensusInput>(
  rows: T[]
): Map<string, ConsensusAggregate> {
  const grouped = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.ticker) continue;
    if (!grouped.has(r.ticker)) grouped.set(r.ticker, []);
    grouped.get(r.ticker)!.push(r);
  }

  const result = new Map<string, ConsensusAggregate>();
  for (const [ticker, items] of grouped) {
    const scores = items
      .map(i => i.rix_score)
      .filter((s): s is number => typeof s === "number" && !isNaN(s));
    if (scores.length === 0) continue;
    const sorted = [...scores].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min;
    result.set(ticker, {
      ticker,
      min,
      max,
      consensusLevel: classifyConsensus(range),
      range,
      modelsCount: scores.length,
    });
  }
  return result;
}

const LEVEL_ORDER: Record<ConsensusLevel, number> = { alto: 0, medio: 1, bajo: 2 };

/**
 * Comparator — sort by consensus level (alto → bajo) then by tighter range.
 * `asc` flips: alto last, looser range first (used for "worst consensus").
 */
export function compareConsensus(
  a: ConsensusAggregate,
  b: ConsensusAggregate,
  asc = false
): number {
  const cDiff = LEVEL_ORDER[a.consensusLevel] - LEVEL_ORDER[b.consensusLevel];
  if (cDiff !== 0) return asc ? -cDiff : cDiff;
  // Tighter range first (better agreement) when desc; widest first when asc.
  return asc ? b.range - a.range : a.range - b.range;
}

/**
 * Helper for UI: render "min–max" or just the single value if min===max.
 */
export function formatRange(agg: { min: number; max: number } | null | undefined): string {
  if (!agg) return "—";
  if (agg.min === agg.max) return `${Math.round(agg.min)}`;
  return `${Math.round(agg.min)}–${Math.round(agg.max)}`;
}