import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLastClosedSunday } from "./sundayResolver";

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

  // PHASE 5 — Delegate to canonical sundayResolver (uses 07_period_to with
  // ≥180 rows floor). Same algorithm runs in Deno via
  // supabase/functions/_shared/sundayResolver.ts.
  try {
    const r = await resolveLastClosedSunday(supabase);
    if (r.source === "fallback_calendar" && r.rowsAvailable === 0) {
      return { success: false, error: "No Sunday with ≥180 rows in rix_runs_v2" };
    }
    cachedSunday = { date: r.sundayISO, fetched_at: Date.now() };
    return {
      success: true,
      data: r.sundayISO,
      meta: { batch_date: r.sundayISO, rows_returned: r.rowsAvailable, execution_ms: Date.now() - start },
    };
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
