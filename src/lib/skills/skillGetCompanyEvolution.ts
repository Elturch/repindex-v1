import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillResult } from "./shared";
import { format } from "date-fns";

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

    let allData: { batch_week: string; model_name: string; rix_score: number | null; stock_price: number | null; company_name: string }[] = [];
    const seenWeeks = new Set<string>();

    // FASE 1 — Fuente única: rix_runs_v2. Si V2 no tiene historia suficiente,
    // devolvemos lo que haya (estado vacío controlado, NUNCA fallback a legacy).
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("rix_runs_v2")
        .select(
          '"02_model_name","03_target_name","09_rix_score","51_rix_score_adjusted","48_precio_accion",batch_execution_date'
        )
        .eq("05_ticker", params.ticker)
        .order("batch_execution_date", { ascending: false })
        .range(from, to);

      if (error) {
        return { success: false, error: `Evolution query failed: ${error.message}` };
      }
      if (!data || data.length === 0) break;

      for (const raw of data as any[]) {
        const batch = raw.batch_execution_date;
        if (!batch) continue;
        const week = format(new Date(batch), "yyyy-MM-dd");
        const model = raw["02_model_name"];
        const rix = raw["51_rix_score_adjusted"] ?? raw["09_rix_score"];
        if (!model || rix === null || rix === undefined) continue;
        // Stock price normalization (heurística simple sin contexto histórico).
        let stockPrice: number | null = null;
        if (raw["48_precio_accion"] !== null && raw["48_precio_accion"] !== undefined) {
          const n = Number(String(raw["48_precio_accion"]).replace(/[^0-9.\-]/g, ""));
          if (Number.isFinite(n) && n > 0) {
            stockPrice = n >= 100000 ? n / 100000 : n >= 10000 ? n / 1000 : n >= 1000 ? n / 100 : n;
          }
        }
        seenWeeks.add(week);
        allData.push({
          batch_week: week,
          model_name: String(model),
          rix_score: Number(rix),
          stock_price: stockPrice,
          company_name: String(raw["03_target_name"] || params.ticker),
        });
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
      .filter((row) => weekSet.has(row.batch_week))
      .map((row) => ({
        batch_week: row.batch_week,
        model_name: row.model_name,
        rix_score: row.rix_score,
        stock_price: row.stock_price,
      }))
      .sort((a, b) => a.batch_week.localeCompare(b.batch_week));

    const companyName = allData[0].company_name || params.ticker;

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
