import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillResult } from "./shared";

export interface CompanyEvolutionInput {
  ticker: string;
  weeks_back?: number;
}

export interface EvolutionPoint {
  batch_week: string;
  model_name: string;
  rix_score: number | null;
  stock_price: number | null;
}

export interface CompanyEvolutionOutput {
  ticker: string;
  company_name: string;
  weeks_requested: number;
  evolution: EvolutionPoint[];
}

export async function skillGetCompanyEvolution(
  params: CompanyEvolutionInput,
  supabase: SupabaseClient
): Promise<SkillResult<CompanyEvolutionOutput>> {
  const start = Date.now();
  try {
    if (!params.ticker) {
      return { success: false, error: "ticker is required" };
    }

    const weeksBack = params.weeks_back ?? 12;
    const pageSize = 1500;
    const maxPages = 5;

    let allData: Record<string, unknown>[] = [];
    const seenWeeks = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("rix_trends")
        .select("batch_week,model_name,rix_score,stock_price,company_name")
        .eq("ticker", params.ticker)
        .order("batch_week", { ascending: false })
        .range(from, to);

      if (error) {
        return { success: false, error: `Evolution query failed: ${error.message}` };
      }
      if (!data || data.length === 0) break;

      for (const row of data as Record<string, unknown>[]) {
        const week = String(row.batch_week ?? "");
        seenWeeks.add(week);
        allData.push(row);
      }

      if (data.length < pageSize || seenWeeks.size >= weeksBack) break;
    }

    if (allData.length === 0) {
      return { success: false, error: `No evolution data found for ${params.ticker}` };
    }

    // Keep only the requested number of weeks
    const sortedWeeks = Array.from(seenWeeks).sort().reverse().slice(0, weeksBack);
    const weekSet = new Set(sortedWeeks);

    const evolution: EvolutionPoint[] = allData
      .filter((row) => weekSet.has(String(row.batch_week ?? "")))
      .map((row) => ({
        batch_week: String(row.batch_week ?? ""),
        model_name: String(row.model_name ?? ""),
        rix_score: row.rix_score as number | null,
        stock_price: row.stock_price as number | null,
      }))
      .sort((a, b) => a.batch_week.localeCompare(b.batch_week));

    const companyName = String(allData[0].company_name ?? params.ticker);

    return {
      success: true,
      data: {
        ticker: params.ticker,
        company_name: companyName,
        weeks_requested: weeksBack,
        evolution,
      },
      meta: { rows_returned: evolution.length, execution_ms: Date.now() - start },
    };
  } catch (e: unknown) {
    return { success: false, error: `skillGetCompanyEvolution exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}
