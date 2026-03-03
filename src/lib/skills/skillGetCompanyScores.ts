import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestValidSunday, SCORE_SELECT, buildDateFilter, type SkillResult } from "./shared";

export interface CompanyScoresInput {
  ticker?: string;
  target_name?: string;
  batch_date?: string;
}

export interface ModelScore {
  model_name: string;
  rix_score: number | null;
  nvm_score: number | null;
  drm_score: number | null;
  sim_score: number | null;
  rmm_score: number | null;
  cem_score: number | null;
  gam_score: number | null;
  dcm_score: number | null;
  cxm_score: number | null;
}

export interface CompanyScoresOutput {
  company: string;
  ticker: string;
  batch_date: string;
  scores: ModelScore[];
}

export async function skillGetCompanyScores(
  params: CompanyScoresInput,
  supabase: SupabaseClient
): Promise<SkillResult<CompanyScoresOutput>> {
  const start = Date.now();
  try {
    if (!params.ticker && !params.target_name) {
      return { success: false, error: "Either ticker or target_name is required" };
    }

    // Resolve batch date
    let batchDate = params.batch_date;
    if (!batchDate) {
      const sundayResult = await getLatestValidSunday(supabase);
      if (!sundayResult.success || !sundayResult.data) {
        return { success: false, error: sundayResult.error || "Could not resolve batch date" };
      }
      batchDate = sundayResult.data;
    }

    const { gte, lt } = buildDateFilter(batchDate);

    let query = supabase
      .from("rix_runs_v2")
      .select(SCORE_SELECT)
      .gte("batch_execution_date", gte)
      .lt("batch_execution_date", lt);

    if (params.ticker) {
      query = query.eq("05_ticker", params.ticker);
    } else if (params.target_name) {
      query = query.ilike("03_target_name", `%${params.target_name}%`);
    }

    const { data, error } = await query.limit(20);

    if (error) {
      return { success: false, error: `Query failed: ${error.message}` };
    }
    if (!data || data.length === 0) {
      return { success: false, error: `No scores found for ${params.ticker || params.target_name} on ${batchDate}` };
    }

    const scores: ModelScore[] = (data as unknown as Record<string, unknown>[]).map((row) => ({
      model_name: String(row["02_model_name"] ?? ""),
      rix_score: row["09_rix_score"] as number | null,
      nvm_score: row["23_nvm_score"] as number | null,
      drm_score: row["26_drm_score"] as number | null,
      sim_score: row["29_sim_score"] as number | null,
      rmm_score: row["32_rmm_score"] as number | null,
      cem_score: row["35_cem_score"] as number | null,
      gam_score: row["38_gam_score"] as number | null,
      dcm_score: row["41_dcm_score"] as number | null,
      cxm_score: row["44_cxm_score"] as number | null,
    }));

    return {
      success: true,
      data: {
        company: String(data[0]["03_target_name"] ?? ""),
        ticker: String(data[0]["05_ticker"] ?? ""),
        batch_date: batchDate,
        scores,
      },
      meta: { batch_date: batchDate, rows_returned: data.length, execution_ms: Date.now() - start },
    };
  } catch (e: unknown) {
    return { success: false, error: `skillGetCompanyScores exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}
