import { supabase } from "@/integrations/supabase/client";

type GetLatestRixTrendWeeksOptions = {
  desired?: number;
  pageSize?: number;
  maxPages?: number;
};

/**
 * FASE 1 — V2-only. Returns the latest unique `batch_execution_date` values
 * (Sunday-anchored) from `rix_runs_v2`, formatted as `YYYY-MM-DD`. The
 * legacy `rix_trends` table has been retired for the agent stack.
 *
 * Why pagination? rix_runs_v2 has ~1050 rows per week (175 tickers × 6 IAs),
 * so a naive select() may only return one week due to PostgREST's 1000
 * row default.
 */
export async function getLatestRixTrendWeeks(
  opts: GetLatestRixTrendWeeksOptions = {},
): Promise<string[]> {
  const desired = opts.desired ?? 2;
  const pageSize = opts.pageSize ?? 1500;
  const maxPages = opts.maxPages ?? 5;

  const weeks: string[] = [];
  let from = 0;

  for (let page = 0; page < maxPages && weeks.length < desired; page++) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select("batch_execution_date")
      .order("batch_execution_date", { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const d = (row as { batch_execution_date: string | null }).batch_execution_date;
      if (!d) continue;
      // Normalize to YYYY-MM-DD
      const dateOnly = String(d).slice(0, 10);
      if (!weeks.includes(dateOnly)) weeks.push(dateOnly);
      if (weeks.length >= desired) break;
    }

    from += pageSize;
  }

  return weeks;
}
