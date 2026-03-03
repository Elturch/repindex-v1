import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestValidSunday, buildDateFilter, type SkillResult } from "./shared";

export interface RawTextsInput {
  ticker: string;
  batch_date?: string;
}

export interface ModelText {
  model_name: string;
  resumen: string | null;
  puntos_clave: unknown;
}

export interface RawTextsOutput {
  ticker: string;
  company: string;
  batch_date: string;
  texts: ModelText[];
}

export async function skillGetRawTexts(
  params: RawTextsInput,
  supabase: SupabaseClient
): Promise<SkillResult<RawTextsOutput>> {
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

    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select("02_model_name,03_target_name,05_ticker,10_resumen,11_puntos_clave")
      .eq("05_ticker", params.ticker)
      .gte("batch_execution_date", gte)
      .lt("batch_execution_date", lt)
      .limit(20);

    if (error) {
      return { success: false, error: `Query failed: ${error.message}` };
    }
    if (!data || data.length === 0) {
      return { success: false, error: `No texts found for ${params.ticker} on ${batchDate}` };
    }

    const rows = data as Record<string, unknown>[];

    const texts: ModelText[] = rows.map((row) => ({
      model_name: String(row["02_model_name"] ?? ""),
      resumen: row["10_resumen"] as string | null,
      puntos_clave: row["11_puntos_clave"],
    }));

    return {
      success: true,
      data: {
        ticker: params.ticker,
        company: String(rows[0]["03_target_name"] ?? ""),
        batch_date: batchDate,
        texts,
      },
      meta: { batch_date: batchDate, rows_returned: texts.length, execution_ms: Date.now() - start },
    };
  } catch (e: unknown) {
    return { success: false, error: `skillGetRawTexts exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}
