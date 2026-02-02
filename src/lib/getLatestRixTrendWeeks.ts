import { supabase } from "@/integrations/supabase/client";

type GetLatestRixTrendWeeksOptions = {
  desired?: number;
  /** PostgREST default limit is 1000; use a larger page size to span weeks. */
  pageSize?: number;
  /** Safety bound to avoid unbounded pagination. */
  maxPages?: number;
};

/**
 * Returns the latest unique `batch_week` values from `rix_trends`.
 *
 * Why pagination?
 * `rix_trends` contains ~1000+ rows per week, so a naive select() may only return
 * one week due to PostgREST's default 1000 row limit.
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
      .from("rix_trends")
      .select("batch_week")
      .order("batch_week", { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const w = row.batch_week;
      if (!w) continue;
      if (!weeks.includes(w)) weeks.push(w);
      if (weeks.length >= desired) break;
    }

    from += pageSize;
  }

  return weeks;
}
