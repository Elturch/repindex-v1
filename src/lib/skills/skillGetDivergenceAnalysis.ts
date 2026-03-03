import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestValidSunday, METRIC_COLUMNS, buildDateFilter, type SkillResult } from "./shared";

export interface DivergenceInput {
  ticker: string;
  batch_date?: string;
}

export interface MetricDivergence {
  metric: string;
  max_model: string;
  max_value: number;
  min_model: string;
  min_value: number;
  range: number;
  consensus: string;
}

export interface DivergenceOutput {
  ticker: string;
  company: string;
  batch_date: string;
  divergences: MetricDivergence[];
  overall_consensus: string;
}

export async function skillGetDivergenceAnalysis(
  params: DivergenceInput,
  supabase: SupabaseClient
): Promise<SkillResult<DivergenceOutput>> {
  const start = Date.now();
  try {
    if (!params.ticker) {
      return { success: false, error: "ticker is required" };
    }

    let batchDate = params.batch_date;
    if (!batchDate) {
      const sundayResult = await getLatestValidSunday(supabase);
      if (!sundayResult.success || !sundayResult.data) {
        return { success: false, error: sundayResult.error || "Could not resolve batch date" };
      }
      batchDate = sundayResult.data;
    }

    const { gte, lt } = buildDateFilter(batchDate);

    const selectCols = [
      "02_model_name",
      "03_target_name",
      ...Object.values(METRIC_COLUMNS),
    ].join(",");

    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(selectCols)
      .eq("05_ticker", params.ticker)
      .gte("batch_execution_date", gte)
      .lt("batch_execution_date", lt)
      .limit(20);

    if (error) {
      return { success: false, error: `Query failed: ${error.message}` };
    }
    if (!data || data.length === 0) {
      return { success: false, error: `No data found for ${params.ticker} on ${batchDate}` };
    }

    const rows = data as unknown as Record<string, unknown>[];
    const company = String(rows[0]["03_target_name"] ?? "");

    const divergences: MetricDivergence[] = [];
    for (const [metricKey, colName] of Object.entries(METRIC_COLUMNS)) {
      let maxModel = "";
      let maxVal = -Infinity;
      let minModel = "";
      let minVal = Infinity;

      for (const row of rows) {
        const val = row[colName] as number | null;
        if (val == null) continue;
        const model = String(row["02_model_name"] ?? "");
        if (val > maxVal) { maxVal = val; maxModel = model; }
        if (val < minVal) { minVal = val; minModel = model; }
      }

      if (maxVal === -Infinity) continue;

      const range = maxVal - minVal;
      const consensus = range <= 5 ? "alto" : range <= 12 ? "medio" : "bajo";

      divergences.push({
        metric: metricKey,
        max_model: maxModel,
        max_value: maxVal,
        min_model: minModel,
        min_value: minVal,
        range,
        consensus,
      });
    }

    const avgRange = divergences.length > 0
      ? divergences.reduce((s, d) => s + d.range, 0) / divergences.length
      : 0;
    const overallConsensus = avgRange <= 5 ? "alto" : avgRange <= 12 ? "medio" : "bajo";

    return {
      success: true,
      data: {
        ticker: params.ticker,
        company,
        batch_date: batchDate,
        divergences,
        overall_consensus: overallConsensus,
      },
      meta: { batch_date: batchDate, rows_returned: rows.length, execution_ms: Date.now() - start },
    };
  } catch (e: unknown) {
    return { success: false, error: `skillGetDivergenceAnalysis exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}
