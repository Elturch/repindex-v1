import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestValidSunday, buildDateFilter, median, type SkillResult } from "./shared";

export interface CompanyRankingInput {
  sector_category?: string;
  ibex_family_code?: string;
  top_n?: number;
  batch_date?: string;
}

export interface RankedCompany {
  company: string;
  ticker: string;
  median_rix: number;
  min_rix: number;
  max_rix: number;
  range: number;
  consensus_level: string;
  scores_by_model: Array<{ model: string; rix_score: number | null }>;
}

export interface CompanyRankingOutput {
  batch_date: string;
  filter: string;
  ranking: RankedCompany[];
}

export async function skillGetCompanyRanking(
  params: CompanyRankingInput,
  supabase: SupabaseClient
): Promise<SkillResult<CompanyRankingOutput>> {
  const start = Date.now();
  try {
    const topN = params.top_n ?? 50;

    let batchDate = params.batch_date;
    if (!batchDate) {
      const sundayResult = await getLatestValidSunday(supabase);
      if (!sundayResult.success || !sundayResult.data) {
        return { success: false, error: sundayResult.error || "Could not resolve batch date" };
      }
      batchDate = sundayResult.data;
    }

    const { gte, lt } = buildDateFilter(batchDate);

    // If filtering by sector/family, first get the tickers
    let tickerFilter: string[] | null = null;
    if (params.sector_category || params.ibex_family_code) {
      let issuerQuery = supabase
        .from("repindex_root_issuers")
        .select("ticker");

      if (params.sector_category) {
        issuerQuery = issuerQuery.ilike("sector_category", `%${params.sector_category}%`);
      }
      if (params.ibex_family_code) {
        issuerQuery = issuerQuery.eq("ibex_family_code", params.ibex_family_code);
      }

      const { data: issuers, error: issuerError } = await issuerQuery.limit(200);
      if (issuerError) {
        return { success: false, error: `Issuer query failed: ${issuerError.message}` };
      }
      tickerFilter = (issuers || []).map((r: Record<string, unknown>) => String(r.ticker));
      if (tickerFilter.length === 0) {
        return { success: false, error: `No issuers found for filter` };
      }
    }

    // Fetch scores — paginate to avoid 1000-row limit
    let allData: Record<string, unknown>[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 6; page++) {
      let query = supabase
        .from("rix_runs_v2")
        .select("02_model_name,03_target_name,05_ticker,09_rix_score")
        .gte("batch_execution_date", gte)
        .lt("batch_execution_date", lt)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (tickerFilter) {
        query = query.in("05_ticker", tickerFilter);
      }

      const { data, error } = await query;
      if (error) {
        return { success: false, error: `Ranking query failed: ${error.message}` };
      }
      if (!data || data.length === 0) break;
      allData = allData.concat(data as Record<string, unknown>[]);
      if (data.length < pageSize) break;
    }

    if (allData.length === 0) {
      return { success: false, error: `No data found for ranking on ${batchDate}` };
    }

    // Group by ticker
    const grouped = new Map<string, { company: string; ticker: string; scores: Array<{ model: string; rix_score: number | null }> }>();
    for (const row of allData) {
      const ticker = String(row["05_ticker"] ?? "");
      if (!ticker) continue;
      if (!grouped.has(ticker)) {
        grouped.set(ticker, {
          company: String(row["03_target_name"] ?? ""),
          ticker,
          scores: [],
        });
      }
      grouped.get(ticker)!.scores.push({
        model: String(row["02_model_name"] ?? ""),
        rix_score: row["09_rix_score"] as number | null,
      });
    }

    // Compute median and rank
    const ranking: RankedCompany[] = Array.from(grouped.values())
      .map((g) => {
        const validScores = g.scores
          .map((s) => s.rix_score)
          .filter((v): v is number => v != null);
        const med = median(validScores);
        const min = validScores.length > 0 ? Math.min(...validScores) : 0;
        const max = validScores.length > 0 ? Math.max(...validScores) : 0;
        const range = max - min;
        const consensus = range <= 5 ? "alto" : range <= 12 ? "medio" : "bajo";

        return {
          company: g.company,
          ticker: g.ticker,
          median_rix: med,
          min_rix: min,
          max_rix: max,
          range,
          consensus_level: consensus,
          scores_by_model: g.scores,
        };
      })
      .sort((a, b) => b.median_rix - a.median_rix)
      .slice(0, topN);

    const filterLabel = params.sector_category || params.ibex_family_code || "all";

    return {
      success: true,
      data: { batch_date: batchDate, filter: filterLabel, ranking },
      meta: { batch_date: batchDate, rows_returned: ranking.length, execution_ms: Date.now() - start },
    };
  } catch (e: unknown) {
    return { success: false, error: `skillGetCompanyRanking exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}
