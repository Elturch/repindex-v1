import type { SupabaseClient } from "@supabase/supabase-js";

// ── Shared result type ──────────────────────────────────────────────
export interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    batch_date?: string;
    rows_returned?: number;
    execution_ms?: number;
  };
}

// ── Sunday snapshot helper ──────────────────────────────────────────
// Finds the most recent batch_execution_date that falls on a Sunday
// AND has >= 180 records (30 companies × 6 models minimum).
let cachedSunday: { date: string; fetched_at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getLatestValidSunday(
  supabase: SupabaseClient
): Promise<SkillResult<string>> {
  const start = Date.now();

  // Return cache if fresh
  if (cachedSunday && Date.now() - cachedSunday.fetched_at < CACHE_TTL_MS) {
    return {
      success: true,
      data: cachedSunday.date,
      meta: { batch_date: cachedSunday.date, execution_ms: Date.now() - start },
    };
  }

  try {
    // Get the last 10 distinct batch_execution_date values, ordered desc
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select("batch_execution_date")
      .order("batch_execution_date", { ascending: false })
      .limit(2000);

    if (error) {
      return { success: false, error: `getLatestValidSunday query failed: ${error.message}` };
    }
    if (!data || data.length === 0) {
      return { success: false, error: "No rix_runs_v2 records found" };
    }

    // Group by date and count, filtering for Sundays with >=180 records
    const dateCounts = new Map<string, number>();
    for (const row of data) {
      const raw = row.batch_execution_date;
      if (!raw) continue;
      const d = new Date(raw);
      const dateKey = d.toISOString().split("T")[0];
      dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
    }

    // Sort dates descending
    const sortedDates = Array.from(dateCounts.entries()).sort(
      (a, b) => b[0].localeCompare(a[0])
    );

    for (const [dateStr, count] of sortedDates) {
      const d = new Date(dateStr + "T00:00:00Z");
      if (d.getUTCDay() === 0 && count >= 180) {
        cachedSunday = { date: dateStr, fetched_at: Date.now() };
        return {
          success: true,
          data: dateStr,
          meta: { batch_date: dateStr, rows_returned: count, execution_ms: Date.now() - start },
        };
      }
    }

    // Fallback: return most recent date with >= 180 records regardless of day
    for (const [dateStr, count] of sortedDates) {
      if (count >= 180) {
        cachedSunday = { date: dateStr, fetched_at: Date.now() };
        return {
          success: true,
          data: dateStr,
          meta: { batch_date: dateStr, rows_returned: count, execution_ms: Date.now() - start },
        };
      }
    }

    return { success: false, error: "No batch_execution_date found with >= 180 records" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `getLatestValidSunday exception: ${msg}` };
  }
}

// ── Metric column mapping ───────────────────────────────────────────
export const METRIC_COLUMNS = {
  rix_score: "09_rix_score",
  nvm_score: "23_nvm_score",
  drm_score: "26_drm_score",
  sim_score: "29_sim_score",
  rmm_score: "32_rmm_score",
  cem_score: "35_cem_score",
  gam_score: "38_gam_score",
  dcm_score: "41_dcm_score",
  cxm_score: "44_cxm_score",
} as const;

export const SCORE_SELECT = [
  "02_model_name",
  "03_target_name",
  "05_ticker",
  "09_rix_score",
  "23_nvm_score",
  "26_drm_score",
  "29_sim_score",
  "32_rmm_score",
  "35_cem_score",
  "38_gam_score",
  "41_dcm_score",
  "44_cxm_score",
  "batch_execution_date",
].join(",");

export const SCORE_SELECT_WITH_TEXT = [
  SCORE_SELECT,
  "10_resumen",
  "11_puntos_clave",
].join(",");

// ── Median helper ───────────────────────────────────────────────────
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ── Date filter helper ──────────────────────────────────────────────
export function buildDateFilter(dateStr: string): { gte: string; lt: string } {
  const d = new Date(dateStr + "T00:00:00Z");
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    gte: d.toISOString(),
    lt: next.toISOString(),
  };
}
