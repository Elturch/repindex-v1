import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestValidSunday, buildDateFilter, median, type SkillResult } from "./shared";

export interface SectorComparisonInput {
  sector_category: string;
  batch_date?: string;
}

export interface SectorCompany {
  company: string;
  ticker: string;
  median_rix: number;
  scores_by_model: Array<{ model: string; rix_score: number | null }>;
}

export interface SectorComparisonOutput {
  sector: string;
  batch_date: string;
  companies: SectorCompany[];
}

export async function skillGetSectorComparison(
  params: SectorComparisonInput,
  supabase: SupabaseClient
): Promise<SkillResult<SectorComparisonOutput>> {
  const start = Date.now();
  try {
    if (!params.sector_category) {
      return { success: false, error: "sector_category is required" };
    }

    let batchDate = params.batch_date;
    if (!batchDate) {
      const sundayResult = await getLatestValidSunday(supabase);
      if (!sundayResult.success || !sundayResult.data) {
        return { success: false, error: sundayResult.error || "Could not resolve batch date" };
      }
      batchDate = sundayResult.data;
    }

    // Get tickers in sector
    const { data: issuers, error: issuerError } = await supabase
      .from("repindex_root_issuers")
      .select("ticker,issuer_name")
      .ilike("sector_category", `%${params.sector_category}%`)
      .limit(100);

    if (issuerError) {
      return { success: false, error: `Issuer query failed: ${issuerError.message}` };
    }
    if (!issuers || issuers.length === 0) {
      return { success: false, error: `No companies found in sector ${params.sector_category}` };
    }

    const tickers = issuers.map((r: Record<string, unknown>) => String(r.ticker));
    const { gte, lt } = buildDateFilter(batchDate);

    // Fetch scores
    let allData: Record<string, unknown>[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 3; page++) {
      const { data, error } = await supabase
        .from("rix_runs_v2")
        .select("02_model_name,03_target_name,05_ticker,09_rix_score")
        .in("05_ticker", tickers)
        .gte("batch_execution_date", gte)
        .lt("batch_execution_date", lt)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) return { success: false, error: `Scores query failed: ${error.message}` };
      if (!data || data.length === 0) break;
      allData = allData.concat(data as Record<string, unknown>[]);
      if (data.length < pageSize) break;
    }

    // Group by ticker
    const grouped = new Map<string, { company: string; ticker: string; scores: Array<{ model: string; rix_score: number | null }> }>();
    for (const row of allData) {
      const ticker = String(row["05_ticker"] ?? "");
      if (!grouped.has(ticker)) {
        grouped.set(ticker, { company: String(row["03_target_name"] ?? ""), ticker, scores: [] });
      }
      grouped.get(ticker)!.scores.push({
        model: String(row["02_model_name"] ?? ""),
        rix_score: row["09_rix_score"] as number | null,
      });
    }

    const companies: SectorCompany[] = Array.from(grouped.values())
      .map((g) => {
        const valid = g.scores.map((s) => s.rix_score).filter((v): v is number => v != null);
        return { company: g.company, ticker: g.ticker, median_rix: median(valid), scores_by_model: g.scores };
      })
      .sort((a, b) => b.median_rix - a.median_rix);

    return {
      success: true,
      data: { sector: params.sector_category, batch_date: batchDate, companies },
      meta: { batch_date: batchDate, rows_returned: companies.length, execution_ms: Date.now() - start },
    };
  } catch (e: unknown) {
    return { success: false, error: `skillGetSectorComparison exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}
