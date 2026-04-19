/**
 * Shared consensus ranking algorithm — single source of truth.
 * Used by useLandingTopFives (home/landing) and Dashboard.
 *
 * Rules:
 *  - Group rows by ticker.
 *  - Compute the "majority block score":
 *      • If >= 4 models, drop the highest and lowest, average the rest.
 *      • Otherwise, plain average.
 *  - Compute "consensus level" from the score range (max - min):
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
  majorityScore: number;
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
 * Group rows by ticker and produce one consensus aggregate per ticker.
 * Generic so callers can preserve their own row metadata via mergeMeta.
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
    const range = sorted[sorted.length - 1] - sorted[0];
    let majorityScores = sorted;
    if (sorted.length >= 4) majorityScores = sorted.slice(1, -1);
    const majorityScore =
      majorityScores.reduce((a, b) => a + b, 0) / majorityScores.length;
    result.set(ticker, {
      ticker,
      majorityScore,
      consensusLevel: classifyConsensus(range),
      range,
      modelsCount: scores.length,
    });
  }
  return result;
}

const LEVEL_ORDER: Record<ConsensusLevel, number> = { alto: 0, medio: 1, bajo: 2 };

/**
 * Comparator — sort by consensus level (alto → bajo) then by majority score.
 * `asc` flips the score direction (used for "bottom" rankings).
 */
export function compareConsensus(
  a: ConsensusAggregate,
  b: ConsensusAggregate,
  asc = false
): number {
  const cDiff = LEVEL_ORDER[a.consensusLevel] - LEVEL_ORDER[b.consensusLevel];
  if (cDiff !== 0) return cDiff;
  return asc ? a.majorityScore - b.majorityScore : b.majorityScore - a.majorityScore;
}
