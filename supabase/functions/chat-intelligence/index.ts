// v2.1-temporal
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// SKILLS PIPELINE — Feature flag and inlined skill functions
// =============================================================================
const USE_SKILLS_PIPELINE = true;

// ── Shared helpers (Edge versions) ──────────────────────────────────
let cachedSundayEdge: { date: string; fetched_at: number } | null = null;
const CACHE_TTL_EDGE = 5 * 60 * 1000;

async function getLatestValidSundayEdge(supabase: any): Promise<{ success: boolean; data?: string; error?: string }> {
  if (cachedSundayEdge && Date.now() - cachedSundayEdge.fetched_at < CACHE_TTL_EDGE) {
    return { success: true, data: cachedSundayEdge.date };
  }
  try {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select("batch_execution_date")
      .order("batch_execution_date", { ascending: false })
      .limit(2000);
    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) return { success: false, error: "No rix_runs_v2 records" };
    const dateCounts = new Map<string, number>();
    for (const row of data) {
      const raw = row.batch_execution_date;
      if (!raw) continue;
      const d = new Date(raw);
      const dateKey = d.toISOString().split("T")[0];
      dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
    }
    const sorted = Array.from(dateCounts.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    for (const [dateStr, count] of sorted) {
      const d = new Date(dateStr + "T00:00:00Z");
      if (d.getUTCDay() === 0 && count >= 180) {
        cachedSundayEdge = { date: dateStr, fetched_at: Date.now() };
        return { success: true, data: dateStr };
      }
    }
    for (const [dateStr, count] of sorted) {
      if (count >= 180) {
        cachedSundayEdge = { date: dateStr, fetched_at: Date.now() };
        return { success: true, data: dateStr };
      }
    }
    return { success: false, error: "No valid batch date found" };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

// ── Temporal expression parser ──────────────────────────────────────
const DATA_AVAILABLE_FROM = "2026-01-01";

interface TemporalRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  label: string; // human-readable description
  adjusted: boolean; // true if floor was applied
}

function parseTemporalExpression(question: string): TemporalRange | null {
  if (!question) return null;
  const q = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const now = new Date();
  const currentYear = now.getUTCFullYear();

  const MONTH_MAP: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  };

  let from: string | null = null;
  let to: string | null = null;
  let label = "";

  // ── Trimestres ──
  const trimestreMatch = q.match(/\b(primer|segundo|tercer|cuarto|1er|2do|3er|4to|q1|q2|q3|q4)\s*trimestre(?:\s+(?:de\s+)?(\d{4}))?/);
  if (trimestreMatch) {
    const ordMap: Record<string, number> = { primer: 1, "1er": 1, q1: 1, segundo: 2, "2do": 2, q2: 2, tercer: 3, "3er": 3, q3: 3, cuarto: 4, "4to": 4, q4: 4 };
    const trimNum = ordMap[trimestreMatch[1]] || 1;
    const year = trimestreMatch[2] ? parseInt(trimestreMatch[2]) : currentYear;
    const startMonth = (trimNum - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const lastDay = new Date(year, endMonth, 0).getDate();
    from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    to = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    label = `${trimestreMatch[1]} trimestre de ${year}`;
  }

  // ── Semestres ──
  if (!from) {
    const semestreMatch = q.match(/\b(primer|segundo|1er|2do)\s*semestre(?:\s+(?:de\s+)?(\d{4}))?/);
    if (semestreMatch) {
      const year = semestreMatch[2] ? parseInt(semestreMatch[2]) : currentYear;
      if (semestreMatch[1] === "primer" || semestreMatch[1] === "1er") {
        from = `${year}-01-01`; to = `${year}-06-30`;
        label = `primer semestre de ${year}`;
      } else {
        from = `${year}-07-01`; to = `${year}-12-31`;
        label = `segundo semestre de ${year}`;
      }
    }
  }

  // ── Months: "enero 2026", "en enero", "mes de marzo" ──
  if (!from) {
    const monthMatch = q.match(/\b(?:en\s+|mes\s+de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?/);
    if (monthMatch) {
      const monthNum = MONTH_MAP[monthMatch[1]];
      const year = monthMatch[2] ? parseInt(monthMatch[2]) : currentYear;
      const lastDay = new Date(year, monthNum, 0).getDate();
      from = `${year}-${String(monthNum).padStart(2, "0")}-01`;
      to = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      label = `${monthMatch[1]} de ${year}`;
    }
  }

  // ── Relative: "últimos N meses" / "últimas N semanas" ──
  if (!from) {
    const relMatch = q.match(/ultim[oa]s?\s+(\d+)\s+(meses?|semanas?)/);
    if (relMatch) {
      const n = parseInt(relMatch[1]);
      const unit = relMatch[2];
      const end = new Date(now);
      const start = new Date(now);
      if (unit.startsWith("mes")) {
        start.setUTCMonth(start.getUTCMonth() - n);
      } else {
        start.setUTCDate(start.getUTCDate() - n * 7);
      }
      from = start.toISOString().split("T")[0];
      to = end.toISOString().split("T")[0];
      label = `últimos ${n} ${unit}`;
    }
  }

  // ── Full year: "2025", "en 2025", "año 2025" ──
  if (!from) {
    const yearMatch = q.match(/\b(?:en\s+|ano\s+)?(\d{4})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (year >= 2024 && year <= 2030) {
        from = `${year}-01-01`; to = `${year}-12-31`;
        label = `año ${year}`;
      }
    }
  }

  if (!from || !to) return null;

  // Apply data availability floor
  let adjusted = false;
  if (from < DATA_AVAILABLE_FROM) {
    from = DATA_AVAILABLE_FROM;
    adjusted = true;
  }

  // If from > to after adjustment, no valid range
  if (from > to) return null;

  console.log(`[TEMPORAL] Parsed temporal expression: ${JSON.stringify({ from, to, label, adjusted })} from question: "${question}"`);
  return { from, to, label, adjusted };
}

function buildDateFilterEdge(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  return { gte: d.toISOString(), lt: next.toISOString() };
}

function medianEdge(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const METRIC_COLUMNS_EDGE: Record<string, string> = {
  rix_score: "09_rix_score", nvm_score: "23_nvm_score", drm_score: "26_drm_score",
  sim_score: "29_sim_score", rmm_score: "32_rmm_score", cem_score: "35_cem_score",
  gam_score: "38_gam_score", dcm_score: "41_dcm_score", cxm_score: "44_cxm_score",
};

const SCORE_SELECT_EDGE = "02_model_name,03_target_name,05_ticker,09_rix_score,23_nvm_score,26_drm_score,29_sim_score,32_rmm_score,35_cem_score,38_gam_score,41_dcm_score,44_cxm_score,batch_execution_date";

// ── Inlined skill: Company Scores ───────────────────────────────────
async function executeSkillGetCompanyScores(supabase: any, params: { ticker?: string; target_name?: string; batch_date?: string }) {
  const start = Date.now();
  try {
    if (!params.ticker && !params.target_name) return { success: false, error: "ticker or target_name required" };
    let batchDate = params.batch_date;
    if (!batchDate) {
      const sr = await getLatestValidSundayEdge(supabase);
      if (!sr.success || !sr.data) return { success: false, error: sr.error };
      batchDate = sr.data;
    }
    const { gte, lt } = buildDateFilterEdge(batchDate!);
    let query = supabase.from("rix_runs_v2").select(SCORE_SELECT_EDGE).gte("batch_execution_date", gte).lt("batch_execution_date", lt);
    if (params.ticker) query = query.eq("05_ticker", params.ticker);
    else query = query.ilike("03_target_name", `%${params.target_name}%`);
    const { data, error } = await query.limit(20);
    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) return { success: false, error: `No scores for ${params.ticker || params.target_name}` };
    const scores = data.map((r: any) => ({
      model_name: r["02_model_name"] || "", rix_score: r["09_rix_score"], nvm_score: r["23_nvm_score"],
      drm_score: r["26_drm_score"], sim_score: r["29_sim_score"], rmm_score: r["32_rmm_score"],
      cem_score: r["35_cem_score"], gam_score: r["38_gam_score"], dcm_score: r["41_dcm_score"], cxm_score: r["44_cxm_score"],
    }));
    console.log(`[SKILL] CompanyScores for ${params.ticker || params.target_name}: ${scores.length} models in ${Date.now() - start}ms`);
    return { success: true, data: { company: data[0]["03_target_name"] || "", ticker: data[0]["05_ticker"] || "", batch_date: batchDate, scores } };
  } catch (e: any) { return { success: false, error: e.message || String(e) }; }
}

// ── Inlined skill: Company Ranking ──────────────────────────────────
async function executeSkillGetCompanyRanking(supabase: any, params: { sector_category?: string; ibex_family_code?: string; top_n?: number; batch_date?: string; model_name?: string; ticker_filter?: string[] }) {
  const start = Date.now();
  try {
    const topN = params.top_n ?? 50;
    const filterByModel = params.model_name || null;
    let batchDate = params.batch_date;
    if (!batchDate) {
      const sr = await getLatestValidSundayEdge(supabase);
      if (!sr.success || !sr.data) return { success: false, error: sr.error };
      batchDate = sr.data;
    }
    const { gte, lt } = buildDateFilterEdge(batchDate!);
    let tickerFilter: string[] | null = params.ticker_filter || null;
    if (!tickerFilter && (params.sector_category || params.ibex_family_code)) {
      let iq = supabase.from("repindex_root_issuers").select("ticker");
      if (params.sector_category) iq = iq.ilike("sector_category", `%${params.sector_category}%`);
      if (params.ibex_family_code) iq = iq.eq("ibex_family_code", params.ibex_family_code);
      const { data: issuers, error: ie } = await iq.limit(200);
      if (ie) return { success: false, error: ie.message };
      tickerFilter = (issuers || []).map((r: any) => r.ticker);
      if (tickerFilter!.length === 0) return { success: false, error: "No issuers for filter" };
    }
    let allData: any[] = [];
    for (let page = 0; page < 6; page++) {
      let q = supabase.from("rix_runs_v2").select("02_model_name,03_target_name,05_ticker,09_rix_score")
        .gte("batch_execution_date", gte).lt("batch_execution_date", lt).range(page * 1000, (page + 1) * 1000 - 1);
      if (tickerFilter) q = q.in("05_ticker", tickerFilter);
      if (filterByModel) q = q.eq("02_model_name", filterByModel);
      const { data, error } = await q;
      if (error) return { success: false, error: error.message };
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < 1000) break;
    }
    if (allData.length === 0) return { success: false, error: `No ranking data for ${batchDate}${filterByModel ? ` (model: ${filterByModel})` : ""}` };
    
    // When filtering by a single model, use direct scores instead of median
    if (filterByModel) {
      const ranking = allData.map((row: any) => ({
        company: row["03_target_name"] || "",
        ticker: row["05_ticker"] || "",
        median_rix: row["09_rix_score"] ?? 0,
        min_rix: row["09_rix_score"] ?? 0,
        max_rix: row["09_rix_score"] ?? 0,
        range: 0,
        consensus_level: "n/a (single model)",
        scores_by_model: [{ model: filterByModel, rix_score: row["09_rix_score"] }],
      })).sort((a: any, b: any) => b.median_rix - a.median_rix).slice(0, topN);
      console.log(`[SKILL] CompanyRanking (model=${filterByModel}): ${ranking.length} companies in ${Date.now() - start}ms`);
      return { success: true, data: { batch_date: batchDate, filter: params.sector_category || params.ibex_family_code || "all", model_filter: filterByModel, ranking } };
    }
    
    const grouped = new Map<string, { company: string; ticker: string; scores: { model: string; rix_score: number | null }[] }>();
    for (const row of allData) {
      const t = row["05_ticker"] || "";
      if (!grouped.has(t)) grouped.set(t, { company: row["03_target_name"] || "", ticker: t, scores: [] });
      grouped.get(t)!.scores.push({ model: row["02_model_name"] || "", rix_score: row["09_rix_score"] });
    }
    const ranking = Array.from(grouped.values()).map(g => {
      const valid = g.scores.map(s => s.rix_score).filter((v): v is number => v != null);
      const med = medianEdge(valid);
      const min = valid.length > 0 ? Math.min(...valid) : 0;
      const max = valid.length > 0 ? Math.max(...valid) : 0;
      const range = max - min;
      const consensus_level = range <= 10 ? "alto" : range <= 20 ? "medio" : "bajo";
      // Majority block: largest cluster of models within ±5 pts
      let bestBlock: number[] = [];
      for (const anchor of valid) {
        const block = valid.filter(v => Math.abs(v - anchor) <= 5);
        if (block.length > bestBlock.length) bestBlock = block;
      }
      const majority_block_score = bestBlock.length > 0 ? Math.round(bestBlock.reduce((a, b) => a + b, 0) / bestBlock.length) : med;
      const majority_block_models = g.scores
        .filter(s => s.rix_score != null && bestBlock.includes(s.rix_score))
        .map(s => s.model);
      // Per-model scores map
      const scores_individuales: Record<string, number | null> = {};
      for (const s of g.scores) scores_individuales[s.model] = s.rix_score;
      return { company: g.company, ticker: g.ticker, median_rix: med, min_rix: min, max_rix: max, range, consensus_level, scores_by_model: g.scores, majority_block_score, majority_block_models, scores_individuales };
    })
    // Primary sort: consensus alto first, then by majority block score
    .sort((a, b) => {
      const order: Record<string, number> = { alto: 0, medio: 1, bajo: 2 };
      const cDiff = (order[a.consensus_level] ?? 1) - (order[b.consensus_level] ?? 1);
      if (cDiff !== 0) return cDiff;
      return b.majority_block_score - a.majority_block_score;
    }).slice(0, topN);
    console.log(`[SKILL] CompanyRanking: ${ranking.length} companies in ${Date.now() - start}ms`);
    return { success: true, data: { batch_date: batchDate, filter: params.sector_category || params.ibex_family_code || "all", ranking } };
  } catch (e: any) { return { success: false, error: e.message || String(e) }; }
}

// ── Inlined skill: Company Evolution ────────────────────────────────
async function executeSkillGetCompanyEvolution(supabase: any, params: { ticker: string; weeks_back?: number }) {
  const start = Date.now();
  try {
    if (!params.ticker) return { success: false, error: "ticker required" };
    const weeksBack = params.weeks_back ?? 12;
    let allData: any[] = [];
    const seenWeeks = new Set<string>();
    for (let page = 0; page < 5; page++) {
      const { data, error } = await supabase.from("rix_trends")
        .select("batch_week,model_name,rix_score,stock_price,company_name")
        .eq("ticker", params.ticker).order("batch_week", { ascending: false }).range(page * 1500, (page + 1) * 1500 - 1);
      if (error) return { success: false, error: error.message };
      if (!data || data.length === 0) break;
      for (const row of data) { seenWeeks.add(String(row.batch_week ?? "")); allData.push(row); }
      if (data.length < 1500 || seenWeeks.size >= weeksBack) break;
    }
    // Fallback to rix_runs_v2 if rix_trends has no data
    if (allData.length === 0) {
      console.log(`[SKILL] CompanyEvolution: rix_trends empty for ${params.ticker}, falling back to rix_runs_v2`);
      const seenDates = new Set<string>();
      for (let page = 0; page < 5; page++) {
        const { data: runs, error: runErr } = await supabase.from("rix_runs_v2")
          .select("batch_execution_date,02_model_name,03_target_name,09_rix_score")
          .eq("05_ticker", params.ticker)
          .order("batch_execution_date", { ascending: false })
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (runErr || !runs || runs.length === 0) break;
        for (const row of runs) {
          const raw = row.batch_execution_date;
          if (!raw) continue;
          const dateKey = new Date(raw).toISOString().split("T")[0];
          seenDates.add(dateKey);
          allData.push({
            batch_week: dateKey,
            model_name: row["02_model_name"] || "",
            rix_score: row["09_rix_score"],
            stock_price: null,
            company_name: row["03_target_name"] || params.ticker,
          });
        }
        if (runs.length < 1000 || seenDates.size >= weeksBack) break;
      }
      if (allData.length === 0) return { success: false, error: `No evolution for ${params.ticker}` };
      // Use seenDates instead of seenWeeks for the fallback
      const sortedDates = Array.from(seenDates).sort().reverse().slice(0, weeksBack);
      const dateSet = new Set(sortedDates);
      const evolution = allData.filter(r => dateSet.has(String(r.batch_week ?? ""))).map(r => ({
        batch_week: String(r.batch_week ?? ""), model_name: String(r.model_name ?? ""),
        rix_score: r.rix_score, stock_price: r.stock_price,
      })).sort((a, b) => a.batch_week.localeCompare(b.batch_week));
      console.log(`[SKILL] CompanyEvolution for ${params.ticker} (v2 fallback): ${evolution.length} points in ${Date.now() - start}ms`);
      return { success: true, data: { ticker: params.ticker, company_name: allData[0].company_name || params.ticker, weeks_requested: weeksBack, evolution } };
    }

    const sortedWeeks = Array.from(seenWeeks).sort().reverse().slice(0, weeksBack);
    const weekSet = new Set(sortedWeeks);
    const evolution = allData.filter(r => weekSet.has(String(r.batch_week ?? ""))).map(r => ({
      batch_week: String(r.batch_week ?? ""), model_name: String(r.model_name ?? ""),
      rix_score: r.rix_score, stock_price: r.stock_price,
    })).sort((a, b) => a.batch_week.localeCompare(b.batch_week));
    console.log(`[SKILL] CompanyEvolution for ${params.ticker}: ${evolution.length} points in ${Date.now() - start}ms`);
    return { success: true, data: { ticker: params.ticker, company_name: allData[0].company_name || params.ticker, weeks_requested: weeksBack, evolution } };
  } catch (e: any) { return { success: false, error: e.message || String(e) }; }
}

// ── Helper: Resolve competitor tickers (STRICTLY verified_competitors only) ─────
async function getCompetitorTickers(supabase: any, ticker: string, logPrefix: string): Promise<{ tickers: string[]; source: "verified" | "none"; sector_category: string | null }> {
  try {
    const { data, error } = await supabase.from("repindex_root_issuers")
      .select("verified_competitors,sector_category")
      .eq("ticker", ticker)
      .limit(1)
      .maybeSingle();
    if (error || !data) return { tickers: [], source: "none", sector_category: null };

    const vc = data.verified_competitors;
    const vcArray: string[] = Array.isArray(vc) ? vc.filter((t: any) => typeof t === "string" && t.length > 0) : [];

    if (vcArray.length > 0) {
      console.log(`${logPrefix} [COMPETITORS] ${ticker}: ${vcArray.length} verified competitors: ${vcArray.join(",")}`);
      return { tickers: vcArray, source: "verified", sector_category: data.sector_category };
    }

    // NO sector fallback — competitors are an editorial/strategic decision
    console.log(`${logPrefix} [COMPETITORS] ${ticker}: no verified competitors defined`);
    return { tickers: [], source: "none", sector_category: data.sector_category };
  } catch (e: any) {
    console.error(`${logPrefix} [COMPETITORS] Error resolving competitors for ${ticker}: ${e.message}`);
    return { tickers: [], source: "none", sector_category: null };
  }
}

// ── Inlined skill: Company Detail ───────────────────────────────────
async function executeSkillGetCompanyDetail(supabase: any, params: { ticker?: string; issuer_name?: string }) {
  const start = Date.now();
  try {
    if (!params.ticker && !params.issuer_name) return { success: false, error: "ticker or issuer_name required" };
    let q = supabase.from("repindex_root_issuers").select("*");
    if (params.ticker) q = q.eq("ticker", params.ticker);
    else q = q.ilike("issuer_name", `%${params.issuer_name}%`);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: `No issuer for ${params.ticker || params.issuer_name}` };
    let corporate: any = null;
    const { data: snap } = await supabase.from("corporate_snapshots")
      .select("ceo_name,company_description,headquarters_city,headquarters_country,employees_approx,founded_year,last_reported_revenue")
      .eq("ticker", data.ticker).order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
    if (snap) corporate = snap;
    console.log(`[SKILL] CompanyDetail for ${data.ticker} in ${Date.now() - start}ms`);
    return { success: true, data: { ...data, corporate } };
  } catch (e: any) { return { success: false, error: e.message || String(e) }; }
}

// ── Inlined skill: Sector Comparison (multi-week) ───────────────────
async function executeSkillGetSectorComparison(supabase: any, params: { sector_category: string; batch_date?: string }) {
  const start = Date.now();
  const WEEKS_TO_FETCH = 4;
  try {
    if (!params.sector_category) return { success: false, error: "sector_category required" };

    // 1. Get sector tickers
    const { data: issuers, error: ie } = await supabase.from("repindex_root_issuers").select("ticker,issuer_name").ilike("sector_category", `%${params.sector_category}%`).limit(100);
    if (ie) return { success: false, error: ie.message };
    if (!issuers || issuers.length === 0) return { success: false, error: `No companies in sector ${params.sector_category}` };
    const tickers = issuers.map((r: any) => r.ticker);

    // 2. Discover the last N distinct batch_execution_date values for these tickers
    const { data: dateRows, error: dateErr } = await supabase.from("rix_runs_v2")
      .select("batch_execution_date")
      .in("05_ticker", tickers)
      .order("batch_execution_date", { ascending: false })
      .limit(2000);
    if (dateErr) return { success: false, error: dateErr.message };

    const distinctDates: string[] = [];
    const seenDates = new Set<string>();
    for (const row of (dateRows || [])) {
      const raw = row.batch_execution_date;
      if (!raw) continue;
      const key = new Date(raw).toISOString().split("T")[0];
      if (!seenDates.has(key)) { seenDates.add(key); distinctDates.push(key); }
      if (distinctDates.length >= WEEKS_TO_FETCH) break;
    }
    if (distinctDates.length === 0) return { success: false, error: `No data for sector ${params.sector_category}` };

    const latestDate = distinctDates[0];
    const earliestDate = distinctDates[distinctDates.length - 1];

    // 3. Fetch ALL rows across the date range in one paginated sweep
    const { gte: rangeGte } = buildDateFilterEdge(earliestDate);
    const { lt: rangeLt } = buildDateFilterEdge(latestDate);
    // lt should be day after latest
    const dayAfterLatest = new Date(latestDate + "T00:00:00Z");
    dayAfterLatest.setUTCDate(dayAfterLatest.getUTCDate() + 1);
    const rangeLtFinal = dayAfterLatest.toISOString();

    let allData: any[] = [];
    for (let page = 0; page < 6; page++) {
      const { data, error } = await supabase.from("rix_runs_v2")
        .select("02_model_name,03_target_name,05_ticker,09_rix_score,batch_execution_date")
        .in("05_ticker", tickers)
        .gte("batch_execution_date", rangeGte)
        .lt("batch_execution_date", rangeLtFinal)
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (error) return { success: false, error: error.message };
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < 1000) break;
    }

    // 4. Group by ticker for LATEST week snapshot (current ranking)
    const latestFilter = buildDateFilterEdge(latestDate);
    const latestRows = allData.filter((r: any) => {
      const d = new Date(r.batch_execution_date).toISOString().split("T")[0];
      return d === latestDate;
    });
    const grouped = new Map<string, { company: string; ticker: string; scores: { model: string; rix_score: number | null }[] }>();
    for (const row of latestRows) {
      const t = row["05_ticker"] || "";
      if (!grouped.has(t)) grouped.set(t, { company: row["03_target_name"] || "", ticker: t, scores: [] });
      grouped.get(t)!.scores.push({ model: row["02_model_name"] || "", rix_score: row["09_rix_score"] });
    }
    const companies = Array.from(grouped.values()).map(g => {
      const valid = g.scores.map((s: any) => s.rix_score).filter((v: any): v is number => v != null);
      return { company: g.company, ticker: g.ticker, median_rix: medianEdge(valid), scores_by_model: g.scores };
    }).sort((a, b) => b.median_rix - a.median_rix);

    // 5. Build evolution_by_company: { [ticker]: [ { week, median_rix } ] }
    const evoMap = new Map<string, Map<string, number[]>>();
    for (const row of allData) {
      const t = row["05_ticker"] || "";
      const score = row["09_rix_score"];
      if (score == null) continue;
      const weekKey = new Date(row.batch_execution_date).toISOString().split("T")[0];
      if (!evoMap.has(t)) evoMap.set(t, new Map());
      const weekMap = evoMap.get(t)!;
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
      weekMap.get(weekKey)!.push(score);
    }
    const evolution_by_company: Record<string, Array<{ week: string; median_rix: number }>> = {};
    for (const [ticker, weekMap] of evoMap.entries()) {
      evolution_by_company[ticker] = Array.from(weekMap.entries())
        .map(([week, scores]) => ({ week, median_rix: medianEdge(scores) }))
        .sort((a, b) => a.week.localeCompare(b.week));
    }

    console.log(`[SKILL] SectorComparison for ${params.sector_category}: ${companies.length} companies, ${distinctDates.length} weeks in ${Date.now() - start}ms`);
    return {
      success: true,
      data: {
        sector: params.sector_category,
        batch_date: latestDate,
        weeks_available: distinctDates.sort(),
        companies,
        evolution_by_company,
      },
    };
  } catch (e: any) { return { success: false, error: e.message || String(e) }; }
}

// ── Inlined skill: Divergence Analysis ──────────────────────────────
async function executeSkillGetDivergenceAnalysis(supabase: any, params: { ticker: string; batch_date?: string }) {
  const start = Date.now();
  try {
    if (!params.ticker) return { success: false, error: "ticker required" };
    let batchDate = params.batch_date;
    if (!batchDate) {
      const sr = await getLatestValidSundayEdge(supabase);
      if (!sr.success || !sr.data) return { success: false, error: sr.error };
      batchDate = sr.data;
    }
    const { gte, lt } = buildDateFilterEdge(batchDate!);
    const cols = ["02_model_name", "03_target_name", ...Object.values(METRIC_COLUMNS_EDGE)].join(",");
    const { data, error } = await supabase.from("rix_runs_v2").select(cols).eq("05_ticker", params.ticker)
      .gte("batch_execution_date", gte).lt("batch_execution_date", lt).limit(20);
    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) return { success: false, error: `No data for ${params.ticker}` };
    const divergences: any[] = [];
    for (const [metricKey, colName] of Object.entries(METRIC_COLUMNS_EDGE)) {
      let maxModel = "", maxVal = -Infinity, minModel = "", minVal = Infinity;
      for (const row of data) {
        const val = row[colName]; if (val == null) continue;
        const model = row["02_model_name"] || "";
        if (val > maxVal) { maxVal = val; maxModel = model; }
        if (val < minVal) { minVal = val; minModel = model; }
      }
      if (maxVal === -Infinity) continue;
      const range = maxVal - minVal;
      divergences.push({ metric: metricKey, max_model: maxModel, max_value: maxVal, min_model: minModel, min_value: minVal, range, consensus: range <= 5 ? "alto" : range <= 12 ? "medio" : "bajo" });
    }
    const avgRange = divergences.length > 0 ? divergences.reduce((s: number, d: any) => s + d.range, 0) / divergences.length : 0;
    console.log(`[SKILL] DivergenceAnalysis for ${params.ticker}: ${divergences.length} metrics in ${Date.now() - start}ms`);
    return { success: true, data: { ticker: params.ticker, company: data[0]["03_target_name"] || "", batch_date: batchDate, divergences, overall_consensus: avgRange <= 5 ? "alto" : avgRange <= 12 ? "medio" : "bajo" } };
  } catch (e: any) { return { success: false, error: e.message || String(e) }; }
}

// ── NEW SKILL 1: skillCompanyProfile — Consolidated company profile ─
async function skillCompanyProfile(supabase: any, ticker: string, options?: { dateRange?: { from: string; to: string } }): Promise<{ success: boolean; data?: any; error?: string }> {
  const start = Date.now();
  try {
    if (!ticker) return { success: false, error: "ticker required" };

    const dateRange = options?.dateRange;
    let query = supabase
      .from("rix_runs_v2")
      .select("02_model_name, 03_target_name, 07_period_to, 09_rix_score, 10_resumen, 11_puntos_clave, 17_flags, 23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, 35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score, 25_nvm_categoria, 28_drm_categoria, 31_sim_categoria, 34_rmm_categoria, 37_cem_categoria, 40_gam_categoria, 43_dcm_categoria, 46_cxm_categoria, 48_precio_accion, 20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, respuesta_bruto_grok, respuesta_bruto_qwen, 06_period_from, batch_execution_date")
      .eq("05_ticker", ticker)
      .order("batch_execution_date", { ascending: false });

    if (dateRange) {
      // Query all data within the requested date range
      query = query.gte("batch_execution_date", dateRange.from + "T00:00:00Z")
                   .lte("batch_execution_date", dateRange.to + "T23:59:59Z");
      // Fetch more rows for multi-week ranges (up to ~20 weeks × 6 models = 120)
      query = query.limit(200);
      console.log(`[SKILL] CompanyProfile for ${ticker}: querying date range ${dateRange.from} to ${dateRange.to}`);
    } else {
      query = query.limit(24);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: `Query failed: ${error.message}` };
    if (!data || data.length === 0) return { success: false, error: `No data for ${ticker}` };

    const rows = data as any[];
    const companyName = rows[0]["03_target_name"] || ticker;

    // Group by week (07_period_to)
    const weekMap = new Map<string, any[]>();
    for (const row of rows) {
      const week = String(row["07_period_to"] || "").split("T")[0];
      if (!week) continue;
      if (!weekMap.has(week)) weekMap.set(week, []);
      weekMap.get(week)!.push(row);
    }

    const sortedWeeks = Array.from(weekMap.keys()).sort().reverse();
    const METRIC_KEYS = [
      { key: "NVM", col: "23_nvm_score", catCol: "25_nvm_categoria" },
      { key: "DRM", col: "26_drm_score", catCol: "28_drm_categoria" },
      { key: "SIM", col: "29_sim_score", catCol: "31_sim_categoria" },
      { key: "RMM", col: "32_rmm_score", catCol: "34_rmm_categoria" },
      { key: "CEM", col: "35_cem_score", catCol: "37_cem_categoria" },
      { key: "GAM", col: "38_gam_score", catCol: "40_gam_categoria" },
      { key: "DCM", col: "41_dcm_score", catCol: "43_dcm_categoria" },
      { key: "CXM", col: "44_cxm_score", catCol: "46_cxm_categoria" },
    ];

    // Helper: compute metric stats for a week's rows
    function weekMetrics(weekRows: any[]) {
      const result: Record<string, any> = {};
      // RIX median
      const rixVals = weekRows.map(r => r["09_rix_score"]).filter((v: any) => v != null) as number[];
      const rixMedian = medianEdge(rixVals);

      for (const m of METRIC_KEYS) {
        const vals = weekRows.map(r => r[m.col]).filter((v: any) => v != null) as number[];
        if (vals.length === 0) { result[m.key] = null; continue; }
        // Find dominant category
        const catCounts = new Map<string, number>();
        for (const r of weekRows) {
          const cat = r[m.catCol];
          if (cat) catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
        }
        let dominantCat = "";
        let maxCount = 0;
        for (const [cat, count] of catCounts) { if (count > maxCount) { maxCount = count; dominantCat = cat; } }

        result[m.key] = {
          mediano: medianEdge(vals),
          min: Math.min(...vals),
          max: Math.max(...vals),
          categoria_dominante: dominantCat || null,
        };
      }
      return { rix_mediano: rixMedian, metricas: result };
    }

    // Build evolution (all weeks) with full metric medians
    const evolucion: Array<{ semana: string; rix_mediano: number; metricas?: Record<string, number> }> = [];
    const weekStats: Array<{ semana: string; stats: ReturnType<typeof weekMetrics> }> = [];
    for (const week of sortedWeeks) {
      const wRows = weekMap.get(week)!;
      const stats = weekMetrics(wRows);
      const metricMeds: Record<string, number> = {};
      for (const m of METRIC_KEYS) {
        if (stats.metricas[m.key]?.mediano != null) metricMeds[m.key] = stats.metricas[m.key].mediano;
      }
      evolucion.push({ semana: week, rix_mediano: stats.rix_mediano, metricas: metricMeds });
      weekStats.push({ semana: week, stats });
    }

    // Current week metrics with delta vs previous
    const currentStats = weekStats[0]?.stats;
    const previousStats = weekStats.length > 1 ? weekStats[1].stats : null;

    const metricasConDelta: Record<string, any> = {};
    if (currentStats) {
      for (const m of METRIC_KEYS) {
        const curr = currentStats.metricas[m.key];
        if (!curr) continue;
        const prevM = previousStats?.metricas?.[m.key];
        metricasConDelta[m.key] = {
          ...curr,
          delta: prevM ? Math.round((curr.mediano - prevM.mediano) * 10) / 10 : null,
          has_delta: !!prevM,
        };
      }
    }

    // ── Build raw_runs: ALL 24 rows with full granularity ──────
    const rawTextCols = ["20_res_gpt_bruto", "21_res_perplex_bruto", "22_res_gemini_bruto", "23_res_deepseek_bruto", "respuesta_bruto_grok", "respuesta_bruto_qwen"];
    const raw_runs = rows.map((r: any) => {
      // Pick the non-null raw text for this row's model, truncated to 2000 chars
      let texto_bruto = "";
      for (const col of rawTextCols) {
        const txt = r[col];
        if (typeof txt === "string" && txt.length > texto_bruto.length) {
          texto_bruto = txt;
        }
      }
      return {
        model_name: r["02_model_name"] || "",
        rix_score: r["09_rix_score"],
        nvm: r["23_nvm_score"], drm: r["26_drm_score"], sim: r["29_sim_score"],
        rmm: r["32_rmm_score"], cem: r["35_cem_score"], gam: r["38_gam_score"],
        dcm: r["41_dcm_score"], cxm: r["44_cxm_score"],
        nvm_cat: r["25_nvm_categoria"], drm_cat: r["28_drm_categoria"],
        sim_cat: r["31_sim_categoria"], rmm_cat: r["34_rmm_categoria"],
        cem_cat: r["37_cem_categoria"], gam_cat: r["40_gam_categoria"],
        dcm_cat: r["43_dcm_categoria"], cxm_cat: r["46_cxm_categoria"],
        resumen: r["10_resumen"] || "",
        puntos_clave: r["11_puntos_clave"],
        flags: r["17_flags"],
        period_from: r["06_period_from"],
        period_to: r["07_period_to"],
        precio_accion: r["48_precio_accion"],
        texto_bruto: texto_bruto.substring(0, 2000),
        // Preserve original bruto fields for source extraction (extractSourcesFromRixData)
        "20_res_gpt_bruto": r["20_res_gpt_bruto"] ?? null,
        "21_res_perplex_bruto": r["21_res_perplex_bruto"] ?? null,
        "06_period_from": r["06_period_from"] ?? null,
        "07_period_to": r["07_period_to"] ?? null,
      };
    });

    // Per-model detail for latest week (subset of raw_runs for convenience)
    const latestWeekRows = weekMap.get(sortedWeeks[0]) || [];
    const modelos = raw_runs.filter((r: any) => {
      const w = String(r.period_to || "").split("T")[0];
      return w === sortedWeeks[0];
    });

    // Dominant flags (appear in >=3 models in latest week)
    const flagCounts = new Map<string, number>();
    for (const r of latestWeekRows) {
      const flags = r["17_flags"];
      if (Array.isArray(flags)) {
        for (const f of flags) { flagCounts.set(f, (flagCounts.get(f) || 0) + 1); }
      } else if (typeof flags === "string" && flags.length > 0) {
        flagCounts.set(flags, (flagCounts.get(flags) || 0) + 1);
      }
    }
    const flagsDominantes = Array.from(flagCounts.entries())
      .filter(([_, count]) => count >= 3)
      .map(([flag]) => flag);

    const result = {
      skill: "company_profile",
      ticker,
      empresa: companyName,
      semana_actual: sortedWeeks[0] || "",
      // Raw runs: ALL 24 rows with full per-model granularity (6 models × 4 weeks)
      raw_runs,
      // Medians as reference aggregates (NOT the central data)
      rix_mediano: currentStats?.rix_mediano || 0,
      delta_rix: previousStats ? Math.round(((currentStats?.rix_mediano || 0) - previousStats.rix_mediano) * 10) / 10 : null,
      medianas_por_metrica: metricasConDelta,
      // Latest week models (convenience shortcut into raw_runs)
      modelos,
      // Weekly evolution of medians (useful for trend narrative)
      evolucion: evolucion.reverse(), // chronological order
      flags_dominantes: flagsDominantes,
    };

    console.log(`[SKILL] CompanyProfile for ${ticker}: ${rows.length} raw_runs, ${sortedWeeks.length} weeks in ${Date.now() - start}ms`);
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, error: `skillCompanyProfile exception: ${e.message || String(e)}` };
  }
}

// ── NEW SKILL 2: skillSectorSnapshot — Sector-level consolidated view ─
async function skillSectorSnapshot(supabase: any, sectorCategory: string, tickerFilterOverride?: string[], options?: { modelFilter?: string; dateRange?: { from: string; to: string } }): Promise<{ success: boolean; data?: any; error?: string }> {
  const start = Date.now();
  try {
    if (!sectorCategory && !tickerFilterOverride) return { success: false, error: "sector_category or ticker_filter required" };

    let issuers: any[];
    if (tickerFilterOverride && tickerFilterOverride.length > 0) {
      // Use canonical group issuer_ids directly — no sector_category lookup
      const { data: issuerData, error: ie } = await supabase
        .from("repindex_root_issuers")
        .select("ticker, issuer_name, verified_competitors")
        .in("ticker", tickerFilterOverride)
        .limit(100);
      if (ie) return { success: false, error: `Issuer query failed: ${ie.message}` };
      issuers = issuerData || [];
    } else {
      // 1. Get tickers in sector (including verified_competitors)
      const { data: issuerData, error: ie } = await supabase
        .from("repindex_root_issuers")
        .select("ticker, issuer_name, verified_competitors")
        .ilike("sector_category", `%${sectorCategory}%`)
        .limit(100);
      if (ie) return { success: false, error: `Issuer query failed: ${ie.message}` };
      issuers = issuerData || [];
    }
    if (issuers.length === 0) return { success: false, error: `No companies for ${tickerFilterOverride ? 'group' : 'sector'} ${sectorCategory || 'override'}` };

    const tickers = issuers.map((r: any) => String(r.ticker));
    const nameMap = new Map(issuers.map((r: any) => [r.ticker, r.issuer_name]));
    const competitorsMap = new Map<string, string[]>(issuers.map((r: any) => [r.ticker, Array.isArray(r.verified_competitors) ? r.verified_competitors : []]));

    const modelFilter = options?.modelFilter || null;
    const dateRange = options?.dateRange || null;

    // 2. Fetch data — paginated. If dateRange provided, filter by it; otherwise last 4 weeks.
    const FULL_SELECT = "05_ticker, 02_model_name, 03_target_name, 09_rix_score, 10_resumen, 11_puntos_clave, 17_flags, 23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, 35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score, 25_nvm_categoria, 28_drm_categoria, 31_sim_categoria, 34_rmm_categoria, 37_cem_categoria, 40_gam_categoria, 43_dcm_categoria, 46_cxm_categoria, 48_precio_accion, 06_period_from, 07_period_to, batch_execution_date, 20_res_gpt_bruto, 21_res_perplex_bruto";

    let allRuns: any[] = [];
    for (let page = 0; page < 8; page++) {
      let q = supabase
        .from("rix_runs_v2")
        .select(FULL_SELECT)
        .in("05_ticker", tickers)
        .order("batch_execution_date", { ascending: false })
        .range(page * 1000, (page + 1) * 1000 - 1);

      // Apply date range filter at query level
      if (dateRange) {
        q = q.gte("batch_execution_date", dateRange.from + "T00:00:00Z")
             .lte("batch_execution_date", dateRange.to + "T23:59:59Z");
      }
      // Apply model filter at query level
      if (modelFilter) {
        q = q.eq("02_model_name", modelFilter);
      }

      const { data: pageData, error: pageErr } = await q;
      if (pageErr) return { success: false, error: `Runs query failed: ${pageErr.message}` };
      if (!pageData || pageData.length === 0) break;
      allRuns = allRuns.concat(pageData);
      // Check if we have enough data (4 distinct weeks or dateRange satisfied)
      const weeks = new Set(allRuns.map((r: any) => String(r["07_period_to"] || "").split("T")[0]).filter(Boolean));
      if (!dateRange && weeks.size >= 4 && pageData.length < 1000) break;
      if (!dateRange && weeks.size >= 4) break;
      if (dateRange && pageData.length < 1000) break;
    }

    if (allRuns.length === 0) return { success: false, error: `No runs for sector ${sectorCategory}` };

    // Detect distinct weeks
    const weekSet = new Set<string>();
    for (const r of allRuns) {
      const w = String(r["07_period_to"] || "").split("T")[0];
      if (w) weekSet.add(w);
    }
    const sortedWeeks = Array.from(weekSet).sort().reverse().slice(0, 4);
    const latestWeek = sortedWeeks[0];

    // Filter rows to only these 4 weeks
    const validWeeks = new Set(sortedWeeks);
    const filteredRuns = allRuns.filter((r: any) => {
      const w = String(r["07_period_to"] || "").split("T")[0];
      return validWeeks.has(w);
    });

    // Latest week rows
    const latestRows = filteredRuns.filter((r: any) => {
      const w = String(r["07_period_to"] || "").split("T")[0];
      return w === latestWeek;
    });

    // 3. Group latest week by ticker — build ranking with per-model detail
    const METRIC_COLS = ["23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score", "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score"];
    const METRIC_NAMES = ["NVM", "DRM", "SIM", "RMM", "CEM", "GAM", "DCM", "CXM"];
    const CAT_COLS = ["25_nvm_categoria", "28_drm_categoria", "31_sim_categoria", "34_rmm_categoria", "37_cem_categoria", "40_gam_categoria", "43_dcm_categoria", "46_cxm_categoria"];

    const grouped = new Map<string, any[]>();
    const sectorMetricAccum: Record<string, number[]> = {};
    for (const col of METRIC_COLS) sectorMetricAccum[col] = [];

    for (const row of latestRows) {
      const t = String(row["05_ticker"] || "");
      if (!grouped.has(t)) grouped.set(t, []);
      grouped.get(t)!.push(row);
      for (const col of METRIC_COLS) {
        const v = row[col];
        if (v != null) sectorMetricAccum[col].push(v);
      }
    }

    // Build ranking with scores_por_modelo + consensus-based analysis
    const ranking = Array.from(grouped.entries())
      .map(([t, tickerRows]) => {
        const rixVals = tickerRows.map((r: any) => r["09_rix_score"]).filter((v: any) => v != null) as number[];
        const scores_por_modelo = tickerRows.map((r: any) => {
          const modelMetrics: Record<string, any> = {};
          METRIC_COLS.forEach((col, i) => { modelMetrics[METRIC_NAMES[i]] = r[col]; });
          CAT_COLS.forEach((col, i) => { modelMetrics[METRIC_NAMES[i] + "_cat"] = r[col]; });
          return {
            model_name: r["02_model_name"] || "",
            rix: r["09_rix_score"],
            ...modelMetrics,
            resumen: (r["10_resumen"] || "").substring(0, 500),
            puntos_clave: r["11_puntos_clave"],
            flags: r["17_flags"],
            period_from: r["06_period_from"],
            period_to: r["07_period_to"],
            precio_accion: r["48_precio_accion"],
          };
        });

        // ── Consensus-based analysis ──
        const rixMedian = medianEdge(rixVals);
        const rixMin = rixVals.length > 0 ? Math.min(...rixVals) : 0;
        const rixMax = rixVals.length > 0 ? Math.max(...rixVals) : 0;
        const rixRange = rixMax - rixMin;
        const consenso = rixRange <= 10 ? "alto" : rixRange <= 20 ? "medio" : "bajo";

        // Majority block: models within ±5 pts of each other (largest cluster)
        let bestBlock: number[] = [];
        for (const anchor of rixVals) {
          const block = rixVals.filter(v => Math.abs(v - anchor) <= 5);
          if (block.length > bestBlock.length) bestBlock = block;
        }
        const bloque_mayoritario_score = bestBlock.length > 0 ? Math.round(bestBlock.reduce((a, b) => a + b, 0) / bestBlock.length) : rixMedian;
        const bloque_mayoritario_modelos = scores_por_modelo
          .filter((s: any) => s.rix != null && bestBlock.includes(s.rix))
          .map((s: any) => s.model_name);
        const outlier_modelos = scores_por_modelo
          .filter((s: any) => s.rix != null && !bestBlock.includes(s.rix))
          .map((s: any) => ({ model: s.model_name, rix: s.rix }));

        // Per-model scores map for cross-table
        const scores_individuales: Record<string, number | null> = {};
        for (const s of scores_por_modelo) {
          scores_individuales[s.model_name] = s.rix;
        }

        return {
          ticker: t,
          empresa: nameMap.get(t) || t,
          rix_mediano: rixMedian,
          rix_min: rixMin,
          rix_max: rixMax,
          rango: rixRange,
          consenso,
          bloque_mayoritario: { score: bloque_mayoritario_score, modelos: bloque_mayoritario_modelos },
          outliers: outlier_modelos,
          scores_individuales,
          scores_por_modelo,
          verified_competitors: competitorsMap.get(t) || [],
        };
      })
      // Primary sort: consensus alto first, then by majority block score
      .sort((a, b) => {
        const consensoOrder: Record<string, number> = { alto: 0, medio: 1, bajo: 2 };
        const cDiff = (consensoOrder[a.consenso] ?? 1) - (consensoOrder[b.consenso] ?? 1);
        if (cDiff !== 0) return cDiff;
        return b.bloque_mayoritario.score - a.bloque_mayoritario.score;
      })
      .map((r, i) => ({ pos: i + 1, ...r }));

    const allMedians = ranking.map(r => r.rix_mediano);
    const medianaSectorial = medianEdge(allMedians);
    const lider = ranking[0] || null;
    const colista = ranking[ranking.length - 1] || null;

    // Sector-level metric medians
    const metricasSector: Record<string, number> = {};
    METRIC_COLS.forEach((col, i) => {
      metricasSector[METRIC_NAMES[i]] = medianEdge(sectorMetricAccum[col]);
    });

    // 4. per_model_detail: ALL raw rows from latest week, grouped by ticker
    // This gives E3/E4 the full granularity they need
    const per_model_detail = latestRows.map((row: any) => ({
      ticker: String(row["05_ticker"] || ""),
      empresa: nameMap.get(String(row["05_ticker"] || "")) || String(row["03_target_name"] || ""),
      modelo: String(row["02_model_name"] || ""),
      model_name: String(row["02_model_name"] || ""),
      rix: row["09_rix_score"],
      nvm: row["23_nvm_score"],
      drm: row["26_drm_score"],
      sim: row["29_sim_score"],
      rmm: row["32_rmm_score"],
      cem: row["35_cem_score"],
      gam: row["38_gam_score"],
      dcm: row["41_dcm_score"],
      cxm: row["44_cxm_score"],
      resumen: row["10_resumen"],
      puntos_clave: row["11_puntos_clave"],
      flags: row["12_flags"] ?? row["17_flags"],
      period_from: row["06_period_from"] ?? row["07_period_to"],
      period_to: row["07_period_to"],
      // Preserve raw AI responses for bibliography/source extraction
      "20_res_gpt_bruto": row["20_res_gpt_bruto"] ?? null,
      "21_res_perplex_bruto": row["21_res_perplex_bruto"] ?? null,
      "06_period_from": row["06_period_from"] ?? null,
      "07_period_to": row["07_period_to"] ?? null,
    }));

    // 5. evolucion_sector: array semanal por ticker (últimas 4 semanas)
    const evoMap = new Map<string, Map<string, number[]>>();
    for (const row of filteredRuns) {
      const ticker = String(row["05_ticker"] || "");
      const score = row["09_rix_score"];
      const weekKey = String(row["07_period_to"] || "").split("T")[0];
      if (!ticker || !weekKey || score == null) continue;
      if (!evoMap.has(ticker)) evoMap.set(ticker, new Map());
      const weekMap = evoMap.get(ticker)!;
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
      weekMap.get(weekKey)!.push(score);
    }

    const evolucion_sector: Array<{ fecha: string; ticker: string; empresa: string; rix_mediano: number }> = [];
    for (const [ticker, weekMap] of evoMap.entries()) {
      const empresa = nameMap.get(ticker) || ticker;
      for (const [week, scores] of weekMap.entries()) {
        evolucion_sector.push({
          fecha: week,
          ticker,
          empresa,
          rix_mediano: medianEdge(scores),
        });
      }
    }
    evolucion_sector.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const result = {
      skill: "sector_snapshot",
      sector: sectorCategory,
      semana: latestWeek,
      semanas_disponibles: sortedWeeks,
      mediana_sectorial: medianaSectorial,
      num_empresas: ranking.length,
      ranking,
      metricas_sector: metricasSector,
      lider: lider ? { empresa: lider.empresa, ticker: lider.ticker, rix: lider.rix_mediano } : null,
      colista: colista ? { empresa: colista.empresa, ticker: colista.ticker, rix: colista.rix_mediano } : null,
      brecha_lider_mediana: lider ? lider.rix_mediano - medianaSectorial : 0,
      per_model_detail,
      evolucion_sector,
    };

    console.log(`[SKILL] SectorSnapshot for ${sectorCategory}: ${ranking.length} companies, ${per_model_detail.length} model rows, ${sortedWeeks.length} weeks in ${Date.now() - start}ms`);
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, error: `skillSectorSnapshot exception: ${e.message || String(e)}` };
  }
}

// ── Lexicon-based normalizeQuery ────────────────────────────────────
const SECTOR_LEXICON: Record<string, string[]> = {
  "Alimentación": ["alimentación","alimentacion","alimentaria","alimentarias","alimentario","alimentarios","agroalimentario","agroalimentaria","comida","bebidas","bebida","cervecera","cerveceras","alimenticias","refrescos","vinos","alimenticio"],
  "Automoción": ["automoción","automocion","automóvil","automovil","automóviles","automoviles","automovilístico","automovilistica","automovilística","automotriz","coches","vehículos","vehiculos","motor","motorístico","motoristico","coche"],
  "Banca y Servicios Financieros": ["banca","banco","bancos","bancario","bancaria","bancarios","bancarias","financiero","financiera","financieros","financieras","entidad financiera","entidades financieras","servicios financieros","ibex financiero","sector financiero","capital riesgo","gestora"],
  "Construcción": ["construcción","construccion","constructora","constructoras","constructor","constructores","obra","obras","constructivo","inmuebles pequeñas"],
  "Construcción e Infraestructuras": ["infraestructura","infraestructuras","promotor","promotora","promotoras","promotores","inmobiliaria","inmobiliarias","inmobiliario","real estate","socimi","socimis","concesionaria","concesionarias","autopistas","aeropuertos","patrimonio inmobiliario","infraestructura pública","grandes constructoras"],
  "Consultoría y Auditoría": ["consultoría","consultoria","consultora","consultoras","consultor","consultores","auditoría","auditoria","auditora","auditoras","big four","servicios profesionales"],
  "Distribución": ["distribución","distribucion","distribuidor","distribuidora","distribuidoras","distribuidores","supermercado","supermercados","retail alimentación","gran distribución"],
  "Energía y Gas": ["energía","energia","energético","energetico","energética","energetica","energéticos","energeticos","energéticas","energeticas","electricidad","eléctrico","electrico","eléctrica","electrica","eléctricos","electricos","eléctricas","electricas","gas","renovable","renovables","solar","eólica","eolica","eólico","eolico","eólicos","eolicos","eólicas","eolicas","fotovoltaico","fotovoltaica","fotovoltaicos","hidráulica","hidraulica","utilities","utility","generación eléctrica","distribución eléctrica","red eléctrica"],
  "Hoteles y Turismo": ["turismo","hotelero","hotelera","hoteleros","hoteleras","hotel","hoteles","turístico","turistico","turística","turistica","turísticos","turisticos","turísticas","turisticas","vacacional","vacaciones","aerolínea","aerolinea","aerolíneas","aerolineas","vuelos","viajes"],
  "Industria": ["industria","industrial","industriales","manufactura","fabricación","fabricacion","fabricante"],
  "Logística": ["logística","logistica","logístico","logistico","logísticas","logisticas","transporte paquetería","correos","mensajería","mensajeria","cadena suministro"],
  "Materias Primas y Siderurgia": ["siderurgia","siderúrgico","siderurgico","siderúrgica","siderurgica","siderúrgicos","siderurgicos","siderúrgicas","siderurgicas","acero","acería","aceria","metalurgia","metalúrgico","metalurgico","metalúrgica","metalurgica","mineral","minerales","materias primas","minería","mineria","minero","minera"],
  "Moda y Distribución": ["moda","textil","textiles","ropa","confección","confeccion","lujo","gran distribución moda","fashion"],
  "Otros Sectores": ["otros sectores"],
  "Petróleo y Energía": ["petróleo","petroleo","petrolera","petroleras","petrolero","petroleros","oil","refino","refinería","refineria","hidrocarburos","combustibles","carburantes","gasolinera","gasolineras","oil gas","upstream","downstream"],
  "Restauración": ["restauración","restauracion","hostelería","hosteleria","hostelero","restaurante","restaurantes","comida rápida","fast food","cadena restaurantes"],
  "Salud y Farmacéutico": ["salud","sanidad","sanitario","sanitaria","sanitarios","sanitarias","farmacéutico","farmaceutico","farmacéutica","farmaceutica","farmacéuticos","farmaceuticos","farmacéuticas","farmaceuticas","farmacia","farma","biotecnología","biotecnologia","biotecnológico","biotecnologico","biotecnológica","biotecnologica","biotech","clínica","clinica","clínicas","clinicas","hospital","hospitales","médico","medico","médica","medica","médicos","medicos","laboratorio","laboratorios"],
  "Seguros": ["seguros","aseguradoras","aseguradora","asegurador","reaseguro","mutua","mutualidad"],
  "Telecomunicaciones y Tecnología": ["tecnología","tecnologia","tecnológico","tecnologico","tecnológica","tecnologica","tecnológicos","tecnologicos","tecnológicas","tecnologicas","telecom","telecomunicaciones","telecomunicación","telecomunicacion","internet","digital","software","tech","telco","telcos","operadora","operadoras","soluciones tecnológicas","cloud","ciberseguridad"],
  "Transporte": ["transporte","transportes","ferroviario","ferroviaria","tren","trenes","movilidad","infraestructura transporte"],
};

const SECTOR_REVERSE_MAP: Array<[string, string]> = [];
for (const [sector, terms] of Object.entries(SECTOR_LEXICON)) {
  for (const term of terms) SECTOR_REVERSE_MAP.push([term, sector]);
}
SECTOR_REVERSE_MAP.sort((a, b) => b[0].length - a[0].length);

const COMPANY_TICKER_MAP: Record<string, string> = {
  // ── Banca ──
  santander: "SAN", "banco santander": "SAN",
  bbva: "BBVA",
  caixabank: "CABK", "la caixa": "CABK",
  bankinter: "BKT",
  sabadell: "SAB", "banco sabadell": "SAB",
  unicaja: "UNI", "unicaja banco": "UNI",
  // ── Telecomunicaciones / Tech ──
  "telefónica": "TEF", telefonica: "TEF", movistar: "TEF",
  inditex: "ITX", zara: "ITX",
  amadeus: "AMS", "amadeus it": "AMS", "amadeus it group": "AMS",
  cellnex: "CLNX", "cellnex telecom": "CLNX",
  indra: "IDR", "indra sistemas": "IDR",
  altia: "ALT", "altia consultores": "ALT",
  gigas: "GIGA", "gigas hosting": "GIGA",
  airtificial: "ART",
  amper: "AMP",
  // ── Energía ──
  repsol: "REP",
  iberdrola: "IBE",
  endesa: "ELE",
  naturgy: "NTGY", "naturgy energy": "NTGY",
  "enagás": "ENG", enagas: "ENG",
  acciona: "ANA",
  "acciona energía": "ANE.MC", "acciona energia": "ANE.MC",
  solaria: "SLR",
  audax: "ADX", "audax renovables": "ADX",
  grenergy: "GRE",
  ence: "ENC", "ence energía": "ENC",
  redeia: "RED", "red eléctrica": "RED", "red electrica": "RED", "redeia corporación": "RED", "redeia corporacion": "RED",
  elecnor: "ENO",
  eidf: "EIDF", "eidf solar": "EIDF",
  enerside: "ENS", "enerside energy": "ENS",
  berkeley: "BKY", "berkeley energía": "BKY", "berkeley energia": "BKY",
  ecoener: "ECR",
  // ── Construcción / Infraestructuras ──
  acs: "ACS", "grupo acs": "ACS",
  ferrovial: "FER",
  sacyr: "SCYR",
  "global dominion": "DOM", dominion: "DOM",
  talgo: "TLGO",
  caf: "CAF", "construcciones y auxiliar de ferrocarriles": "CAF",
  ohla: "OHLA", ohl: "OHLA",
  fcc: "FCC-PRIV",
  clerhp: "CLE",
  // ── Inmobiliarias / SOCIMI ──
  merlin: "MRL", "merlin properties": "MRL",
  colonial: "COL", "inmobiliaria colonial": "COL",
  "árima": "ARM", arima: "ARM", "arima real estate": "ARM",
  castellana: "CAST", "castellana properties": "CAST",
  aedas: "AED", "aedas homes": "AED",
  // ── Aerolineas / Turismo ──
  iag: "IAG", iberia: "IAG", "international airlines group": "IAG",
  "meliá": "MEL", melia: "MEL", "meliá hotels": "MEL",
  edreams: "EDR", "edreams odigeo": "EDR",
  "all iron": "AIRON",
  // ── Alimentación / Distribución ──
  dia: "DIA", "supermercados dia": "DIA", "grupo dia": "DIA",
  ebro: "EBR", "ebro foods": "EBR",
  viscofan: "VIS",
  deoleo: "OLE",
  telepizza: "TPZ",
  // ── Farmacéuticas / Salud ──
  grifols: "GRF",
  pharmamar: "PHM", "pharma mar": "PHM",
  rovi: "ROVI", "laboratorios rovi": "ROVI",
  almirall: "ALM",
  "faes farma": "FAE", faes: "FAE",
  "atrys health": "ATR", atrys: "ATR",
  "clínica baviera": "CBAV", "clinica baviera": "CBAV",
  // ── Seguros ──
  mapfre: "MAP",
  catalana: "GCO.MC", "catalana occidente": "GCO.MC",
  "línea directa": "LDA", "linea directa": "LDA",
  prosegur: "PSG",
  // ── Industrial / Automoción ──
  acerinox: "ACX",
  arcelormittal: "MTS",
  cie: "CIE", "cie automotive": "CIE",
  gestamp: "GEST",
  fluidra: "FDR",
  azkoyen: "AZK",
  "duro felguera": "MDF",
  ercros: "ECR2",
  arteche: "ART2",
  // ── Transporte / Logística ──
  aena: "AENA",
  logista: "LOG", "logista holdings": "LOG",
  // ── Medios ──
  atresmedia: "A3M",
  // ── Varios ──
  puig: "PUIG", "puig brands": "PUIG",
  "alantra": "ALTR", "alantra partners": "ALTR",
  ezentis: "EZE",
  "coca-cola europacific": "CCEP", "coca cola": "CCEP",
  "applus": "AS", "applus services": "AS",
  gam: "GAM",
  cepsa: "CEPSA", moeve: "MOV.MC", exolum: "EXOLUM-PRIV",
  // ── Empresas privadas relevantes ──
  "el corte inglés": "ECI-PRIV", "el corte ingles": "ECI-PRIV",
  mercadona: "MERCADONA-PRIV",
  correos: "CORREOS-PRIV",
  eroski: "EROSKI-PRIV",
  abertis: "ABERTIS-PRIV",
  cosentino: "CSN.MC",
  damm: "DAMM-PRIV",
  "escribano": "EME-PRIV",
  fever: "FEVER-PRIV",
  airbus: "AIR",
  agile: "AGIL", "agile content": "AGIL",
  cevasa: "CEVA",
};
const COMPANY_KEYS_SORTED = Object.keys(COMPANY_TICKER_MAP).sort((a, b) => b.length - a.length);

const INTENT_HINT_PATTERNS: Array<[RegExp, string]> = [
  // Ranking
  [/\b(ranking|clasificaci[oó]n|top|bottom|botom|mejor|peor|peores|l[ií]der|rezagad|posici[oó]n|puesto|colistas?|cola|últimos|worst|best|leaders?|laggards?|leaderboard)\b/i, "ranking"],
  // Comparison
  [/\b(compar|versus|vs|frente a|contra)\b/i, "comparación"],
  // Evolution
  [/\b(evoluci[oó]n|tendencia|trend|hist[oó]ric|temporal|semanas?|weeks?|últim[oa]s?|progres|trayectoria|trajectory)\b/i, "evolución"],
  // Metrics
  [/\b(m[eé]trica|subscore|nvm|drm|sim|rmm|cem|gam|dcm|cxm|rix|score|puntuaci[oó]n|nota|calificaci[oó]n)\b/i, "métrica"],
  // Sector
  [/\b(sector|sectorial|sectores|industry|indústria|industria)\b/i, "sector"],
  // Divergence
  [/\b(divergencia|consenso|discrepancia|acuerdo|desacuerdo|dispersi[oó]n|desacoplamiento|brecha|desfase|desconexi[oó]n|mismatch|gap)\b/i, "divergencia"],
  // Financial / Earnings
  [/\b(beneficio|ingresos|facturaci[oó]n|ebitda|margen|rentabilidad|resultados\s+(?:trimestral|anual)|earnings|revenue|profit)\b/i, "financiero"],
  [/\b(dividendo|payout|recompra|buyback|retribuci[oó]n\s+al\s+accionista)\b/i, "financiero"],
  [/\b(deuda|apalancamiento|leverage|rating\s+crediticio|endeudamiento)\b/i, "financiero"],
  // Corporate events
  [/\b(opa|fusi[oó]n|adquisici[oó]n|m&a|spin[\s-]?off|ipo|opv|takeover|merger|acquisition|ampliaci[oó]n\s+de\s+capital)\b/i, "corporativo"],
  // Market / Stock
  [/\b(cotizaci[oó]n|bolsa|acci[oó]n|burs[aá]til|precio\s+(?:de\s+la\s+)?acci[oó]n|stock\s+price|market\s+cap|capitalizaci[oó]n)\b/i, "bursátil"],
  // Governance / ESG
  [/\b(esg|sostenibilidad|gobernanza|gobierno\s+corporativo|sustainability|governance|responsabilidad\s+social)\b/i, "gobernanza"],
  // Crisis / Alert
  [/\b(crisis|esc[aá]ndalo|controversia|riesgo\s+reputacional|alerta|problem[aá]tic|scandal|controversy)\b/i, "alerta"],
  // Due diligence / Forensic
  [/\b(due\s+diligence|diligencia\s+debida|peritaje|informe\s+pericial|an[aá]lisis\s+forense)\b/i, "due_diligence"],
  // Talent / Employer
  [/\b(employer\s+branding|marca\s+empleadora|glassdoor|clima\s+laboral|talento|talent)\b/i, "talento"],
  // Temporal
  [/\b4\s*semanas?\b/i, "4 semanas"],
  [/\b[uú]ltima\s+semana\b/i, "última semana"],
  // English general
  [/\b(how\s+is|what\s+about|analyze|analyse|evaluate|assessment|status\s+of)\b/i, "análisis"],
  [/\b(best\s+performing|top\s+rated|highest\s+score|lowest\s+score)\b/i, "ranking"],
];

function removeAccentsEdge(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeQuery(question: string): { sector_categories: string[]; company_tickers: string[]; company_names: string[]; intent_hints: string[] } {
  const lower = question.toLowerCase();
  const lowerNoAccent = removeAccentsEdge(lower);

  const foundSectors = new Set<string>();
  const usedRanges: Array<[number, number]> = [];
  for (const [term, sector] of SECTOR_REVERSE_MAP) {
    const termNoAccent = removeAccentsEdge(term);
    const idx = lowerNoAccent.indexOf(termNoAccent);
    if (idx === -1) continue;
    const end = idx + termNoAccent.length;
    const before = idx === 0 || /\W/.test(lowerNoAccent[idx - 1]);
    const after = end >= lowerNoAccent.length || /\W/.test(lowerNoAccent[end]);
    if (!before || !after) continue;
    foundSectors.add(sector);
    if (!usedRanges.some(([s, e]) => idx < e && end > s)) usedRanges.push([idx, end]);
  }

  const foundTickers: string[] = [];
  const foundNames: string[] = [];
  for (const key of COMPANY_KEYS_SORTED) {
    const keyNoAccent = removeAccentsEdge(key);
    const idx = lowerNoAccent.indexOf(keyNoAccent);
    if (idx === -1) continue;
    const end = idx + keyNoAccent.length;
    const before = idx === 0 || /\W/.test(lowerNoAccent[idx - 1]);
    const after = end >= lowerNoAccent.length || /\W/.test(lowerNoAccent[end]);
    if (!before || !after) continue;
    const ticker = COMPANY_TICKER_MAP[key];
    if (!foundTickers.includes(ticker)) { foundTickers.push(ticker); foundNames.push(key); }
  }

  const hints: string[] = [];
  for (const [pattern, hint] of INTENT_HINT_PATTERNS) {
    if (pattern.test(lower) && !hints.includes(hint)) hints.push(hint);
  }

  return { sector_categories: Array.from(foundSectors), company_tickers: foundTickers, company_names: foundNames, intent_hints: hints };
}

// =============================================================================
// SEMANTIC GROUPS — Deterministic canonical group resolution
// =============================================================================

let cachedSemanticGroups: { data: any[]; fetched_at: number } | null = null;
const SEMANTIC_GROUPS_TTL = 5 * 60 * 1000; // 5 min cache

async function resolveSemanticGroup(
  question: string,
  supabaseClient: any
): Promise<{ canonical_key: string | null; display_name: string | null; issuer_ids: string[]; exclusions: string[] }> {
  try {
    // Fetch and cache groups
    if (!cachedSemanticGroups || Date.now() - cachedSemanticGroups.fetched_at > SEMANTIC_GROUPS_TTL) {
      const { data, error } = await supabaseClient
        .from("rix_semantic_groups")
        .select("canonical_key, display_name, aliases, issuer_ids, exclusions")
        .limit(100);
      if (error || !data) {
        console.warn(`[SEMANTIC_GROUPS] Failed to fetch: ${error?.message}`);
        return { canonical_key: null, display_name: null, issuer_ids: [], exclusions: [] };
      }
      cachedSemanticGroups = { data, fetched_at: Date.now() };
    }

    const lower = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    console.log(`[SEMANTIC_GROUPS] Matching question: "${lower}"`);
    const matches: { canonical_key: string; display_name: string; issuer_ids: string[]; exclusions: string[]; alias_len: number }[] = [];

    for (const group of cachedSemanticGroups.data) {
      const aliases: string[] = group.aliases || [];
      for (const alias of aliases) {
        const aliasNorm = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        // Word-boundary match (not substring inside another word)
        const idx = lower.indexOf(aliasNorm);
        if (idx === -1) continue;
        const end = idx + aliasNorm.length;
        const before = idx === 0 || /[\s,;:.!?¿¡()\-\/]/.test(lower[idx - 1]);
        const after = end >= lower.length || /[\s,;:.!?¿¡()\-\/]/.test(lower[end]);
        if (before && after) {
          console.log(`[SEMANTIC_GROUPS] Match found: alias="${alias}" -> group="${group.canonical_key}" (${group.issuer_ids?.length || 0} tickers)`);
          matches.push({
            canonical_key: group.canonical_key,
            display_name: group.display_name,
            issuer_ids: group.issuer_ids || [],
            exclusions: group.exclusions || [],
            alias_len: aliasNorm.length,
          });
          break; // One match per group is enough
        }
      }
    }

    if (matches.length === 0) {
      console.log(`[SEMANTIC_GROUPS] No match found for question. ${cachedSemanticGroups?.data?.length || 0} groups checked.`);
      return { canonical_key: null, display_name: null, issuer_ids: [], exclusions: [] };
    }

    if (matches.length === 1) {
      console.log(`[SEMANTIC_GROUPS] Resolved: "${matches[0].canonical_key}" (${matches[0].issuer_ids.length} issuers)`);
      return matches[0];
    }

    // Multiple matches: pick the longest alias match (most specific)
    matches.sort((a, b) => b.alias_len - a.alias_len);
    console.log(`[SEMANTIC_GROUPS] Multiple matches: ${matches.map(m => m.canonical_key).join(", ")} — picking most specific: "${matches[0].canonical_key}"`);
    return matches[0];
  } catch (e: any) {
    console.warn(`[SEMANTIC_GROUPS] Error: ${e.message}`);
    return { canonical_key: null, display_name: null, issuer_ids: [], exclusions: [] };
  }
}

// =============================================================================

interface SemanticBridgeResult {
  enriched_question: string;
  detected_metrics: string[];
  detected_intent: string | null;
  detected_temporal: string | null;
  detected_companies: Array<{ ticker: string; issuer_name: string }>;
  used_llm_fallback: boolean;
}

// ── AMBIGUOUS COMPANY NAMES — short names that collide with common words ──
const AMBIGUOUS_COMPANY_NAMES = new Set([
  "dia", "acs", "ohl", "ohla", "iag", "cie", "caf", "gam", "ree", "ree",
  "air", "amp", "art", "dom", "ole", "log", "map", "red", "sal",
  "colonial", "indra", "merlin", "solaria", "puig", "faes", "ence",
  "audax", "amper", "talgo", "arima", "rovi", "alma",
]);

// Common-word false-positive patterns (article + ambiguous name NOT in company context)
const NOT_COMPANY_PATTERNS = [
  /\b(un|el|al|del|cada|otro|alg[uú]n|buen|mal|primer|todo|cada)\s+d[ií]a\b/i,
  /\bbuen[oa]s?\s+d[ií]as?\b/i,
  /\bhoy\s+(en\s+)?d[ií]a\b/i,
  /\bd[ií]a\s+(a\s+d[ií]a|tras\s+d[ií]a|de\s+hoy|de\s+mañana|siguiente|anterior|festivo|laborable)\b/i,
  /\b(el|un)\s+mapa?\b/i,
  /\b(el|un|al)\s+aire?\b/i,
  /\b(el|un)\s+arte?\b/i,
  /\b(el|un)\s+log\b/i,
];

const COMPANY_CONTEXT_PATTERNS = [
  /\b(empresa|compañ[ií]a|compa[nñ][ií]a|emisor[a]?|cotizada|analiza|reputaci[oó]n\s+de|informe\s+de|c[oó]mo\s+est[aá]|qu[eé]\s+tal|score\s+de|puntuaci[oó]n\s+de|rix\s+de|datos?\s+de|ficha\s+de|perfil\s+de|an[aá]lisis\s+de|situaci[oó]n\s+de|bolet[ií]n\s+de)\b/i,
  /\b(acciones|acci[oó]n|cotizaci[oó]n|bolsa|ibex|ticker|burs[aá]til)\b/i,
];

function isCompanyMention(word: string, question: string, pos: number): boolean {
  const lower = question.toLowerCase();
  const wordLower = word.toLowerCase();
  
  if (!AMBIGUOUS_COMPANY_NAMES.has(wordLower)) return true; // not ambiguous → always company
  
  // Check if it's uppercase in the original question → likely company
  const originalWord = question.substring(pos, pos + word.length);
  if (originalWord === originalWord.toUpperCase() && originalWord.length >= 2) return true;
  
  // Check false-positive patterns
  for (const pat of NOT_COMPANY_PATTERNS) {
    if (pat.test(lower)) return false;
  }
  
  // Check company context
  for (const pat of COMPANY_CONTEXT_PATTERNS) {
    if (pat.test(lower)) return true;
  }
  
  // DEFAULT: assume company (better to analyze DIA than ignore it)
  return true;
}

// ── CONCEPT THESAURUS (Layer 1 — deterministic, 0ms) ─────────────────

const METRIC_THESAURUS: Record<string, string[]> = {
  "35_cem_score": [
    "crisis","escándalo","escandalo","demanda","litigio","problema legal","pleito","polémica","polemica",
    "conflicto","cancelación","cancelacion","boicot","denuncia","multa","sanción","sancion",
    "investigación judicial","investigacion judicial","fraude","corrupción","corrupcion",
    "quiebra","bancarrota","impago","irregularidad","mala praxis","accidente","desastre",
    "contaminación","contaminacion","vertido","fuga","explosión","explosion","muerte","víctima","victima",
    "negligencia","despido masivo","ere","huelga","protesta","manifestación","manifestacion",
    "acoso","discriminación","discriminacion","machismo","abuso","robo","espionaje",
    "hackeo","brecha de datos","ciberseguridad","cierre","clausura","embargo",
    "queja","reclamación","reclamacion","problemática","problematica","riesgo reputacional",
    "controversia","controversias","riesgo","riesgos","problema","problemas",
    "escándalos","escandalos","demandas","litigios","multas","sanciones","denuncias",
    "conflictos","polémicas","polemicas","irregularidades","huelgas","protestas",
    "accidentes","negligencias","abusos","quejas","reclamaciones",
    "crisis reputacional","crisis de imagen",
    "soborno","blanqueo","estafa","manipulación","manipulacion",
    "expediente","cese","dimisión","dimision",
    "destitución","destitucion","imputación","imputacion",
    // P1/3 additions
    "escándalo corporativo","escandalo corporativo","cancel culture","fake news",
    "desinformación","desinformacion","difamación","difamacion","calumnia","injuria",
    "difamación corporativa","difamacion corporativa","daño reputacional","dano reputacional",
    "viral","trending topic negativo",
    // IR controversy terms
    "hecho relevante","material event","información privilegiada","informacion privilegiada",
    "insider information","blackout period","abuso de mercado","market abuse","mar",
    "mifid ii","mifid","cnmv","sec","insider trading","pdmr transactions",
    "short selling","posición corta","posicion corta","halt de cotización","halt de cotizacion",
    "circuit breaker","sell-off","corrección","correccion","sanción regulatoria","sancion regulatoria",
    // EN
    "controversy","scandal","crisis","lawsuit","litigation","regulation","fine","sanction",
    "investigation","fraud","corruption","risk","threat","boycott","complaint",
    "material event","insider information","market abuse","insider trading","short selling",
    "trading halt","regulatory sanction",
    // PT
    "controvérsia","controversia","escândalo","escandalo","crise","litígio","litigio",
    "multa","sanção","sancao","investigação","investigacao","fraude","corrupção","corrupcao",
    "fato relevante","informação privilegiada","informacao privilegiada","abuso de mercado",
    // CA
    "controvèrsia","controversia","escàndol","escandol","crisi","litigi",
    "multa","sanció","sancio","investigació","investigacio","frau","corrupció","corrupcio",
    "fet rellevant","informació privilegiada","informacio privilegiada","abús de mercat","abus de mercat"
  ],
  "29_sim_score": [
    "fuentes","credibilidad","fiabilidad","referencias","documentos oficiales","regulador",
    "cnmv","boe","informes","auditoría","auditoria","verificación","verificacion",
    "transparencia documental","evidencia documental","pruebas documentales",
    "certificación","certificacion","acreditación","acreditacion","homologación","homologacion",
    "sello","estándar","estandar","norma","iso","compliance","cumplimiento normativo",
    "quien lo dice","de donde sale","origen información","origen informacion",
    "base documental","soporte documental","respaldo","garantía informativa","garantia informativa",
    "fuentes oficiales","fuente primaria","fuentes primarias","tier 1","tier 2",
    "prensa financiera","bloomberg","reuters","financial times","sec","reguladores",
    "documentación","documentacion","trazabilidad","corroboración","corroboracion",
    "autoridad de fuentes","calidad de fuentes","jerarquía de fuentes","jerarquia de fuentes",
    // P1/3 additions
    "cuota de voz","share of voice","sov","cuota de voz algorítmica","cuota de voz algoritmica",
    "fuente tier 1","reputación online","reputacion online",
    // IR Source authority terms
    "cnmv filings","sec filings","registro oficial","regulador bursátil","regulador bursatil",
    "fuentes tier-1","factiva","dow jones",
    // EN
    "reuters","bloomberg","cnmv filings","sec filings","official registry","stock regulator",
    "tier-1 sources","factiva","dow jones","regulatory filings",
    // PT
    "fontes tier-1","registro oficial","regulador bolsista","fontes oficiais",
    // CA
    "fonts tier-1","registre oficial","regulador borsari","fonts oficials"
  ],
  "23_nvm_score": [
    "relato","comunicación","comunicacion","mensaje","historia","storytelling","discurso",
    "narrativa","branding","imagen","percepción pública","percepcion publica",
    "opinión","opinion","reputación general","reputacion general","marca","posicionamiento",
    "cómo se cuenta","como se cuenta","cómo comunica","como comunica",
    "estrategia comunicativa","pr","relaciones públicas","relaciones publicas",
    "prensa","medios","cobertura mediática","cobertura mediatica",
    "presencia mediática","presencia mediatica","visibilidad","notoriedad","awareness",
    "calidad de la narrativa","calidad narrativa","coherencia del discurso",
    "sentimiento","sentimiento positivo","sentimiento negativo","tono","percepción","percepcion",
    "imagen corporativa","imagen pública","imagen publica","opinión pública","opinion publica",
    "comunicación corporativa","comunicacion corporativa","relato corporativo",
    // P1/3 additions
    "narrativa corporativa","messaging","spin","brecha narrativa","narrative gap",
    "nota de prensa","press release","statement","comunicado","portavoz","spokesperson",
    // IR Narrative terms
    "equity story","narrativa corporativa","narrativa de inversión","narrativa de inversion",
    "investment case","tesis de inversión","tesis de inversion","guidance narrativo",
    "strategy update","capital allocation",
    // EN
    "narrative","story","communication","message","public perception","public opinion",
    "corporate image","media coverage","brand perception","sentiment","tone","visibility",
    "corporate communications","public relations","media presence",
    "equity story","investment case","investment thesis","narrative strategy","capital allocation",
    // PT
    "narrativa","comunicação","comunicacao","mensagem","percepção pública","percepcao publica",
    "opinião pública","opiniao publica","imagem corporativa","cobertura mediática","cobertura mediatica",
    "equity story","caso de investimento","tese de investimento",
    // CA
    "narrativa","comunicació","missatge","percepció pública","percepcio publica","imatge corporativa",
    "equity story","cas d'inversió","tesi d'inversió"
  ],
  "26_drm_score": [
    "evidencia","datos","pruebas","hechos","cifras","números","numeros",
    "resultados","métricas duras","metricas duras","kpis","indicadores",
    "estadísticas","estadisticas","informes financieros","cuentas","balance",
    "ebitda","beneficio","facturación","facturacion","ingresos","deuda",
    "dividendo","fundamentales",
    "fortaleza de evidencia","calidad de evidencia","solidez","verificable",
    "datos duros","cifras concretas","hechos verificables","documentación financiera","documentacion financiera",
    "cuentas anuales","informe anual","resultados financieros","memoria anual",
    "ratios","ratio","margen","rentabilidad","roi","roa","roe",
    // P1/3 additions — coherence/factual terms map here
    "error factual","error factual algorítmico","error factual algoritmico",
    "fact-checking","fact checking","transparencia corporativa","accountability",
    // IR Evidence terms
    "folleto informativo","prospectus","due diligence","nota de análisis","nota de analisis",
    "research note","cobertura de analistas","analyst coverage","initiation of coverage",
    "upgrade","downgrade","buy","hold","sell","overweight","underweight",
    // EN
    "evidence","data","proof","facts","figures","financial reports","annual accounts","financial statements",
    "hard metrics","fundamentals","data quality","verifiable","factual error",
    "prospectus","due diligence","research note","analyst coverage","initiation of coverage",
    // PT
    "evidência","evidencia","dados","provas","fatos","cifras","relatórios financeiros","relatorios financeiros",
    "contas anuais","demonstrações financeiras","demonstracoes financeiras",
    "prospeto","nota de análise","nota de analise","cobertura de analistas",
    // CA
    "evidència","dades","proves","fets","xifres","informes financers","comptes anuals",
    "prospecte","nota d'anàlisi","nota d analisi","cobertura d'analistes"
  ],
  "32_rmm_score": [
    "actualidad","reciente","últimas noticias","ultimas noticias","trending","momento",
    "impulso","momentum","ahora","esta semana","últimos días","ultimos dias",
    "tendencia","novedad","breaking","flash","inmediato","fresco","vigente",
    "dinámico","dinamico","activo","caliente","viral","actualizado",
    "empuje","frescura","temporalidad","ventana temporal","recencia",
    "últimas semanas","ultimas semanas","recientemente","nuevo","novedades",
    "de actualidad","al día","al dia","última hora","ultima hora",
    "noticias recientes","información reciente","informacion reciente",
    // IR Momentum terms
    "rally","bull market","bear market","movers","breakout","golden cross","death cross",
    "tendencia alcista","tendencia bajista","rebalanceo de índice","rebalanceo de indice",
    "inclusión en índice","inclusion en indice","exclusión de índice","exclusion de indice",
    // EN
    "latest news","recent","trending","momentum","breaking news","current","up to date","freshness",
    "rally","bull market","bear market","breakout","golden cross","death cross",
    "index rebalancing","index inclusion","index exclusion",
    // PT
    "atualidade","recente","últimas notícias","ultimas noticias","momento","tendência","tendencia",
    "rally","tendência altista","tendencia altista","tendência baixista","tendencia baixista",
    "rebalanceamento de índice","rebalanceamento de indice",
    // CA
    "actualitat","recent","últimes notícies","ultimes noticies","tendència","tendencia",
    "rally","tendència alcista","tendencia alcista","tendència baixista","tendencia baixista",
    "rebalanceig d'índex","rebalanceig d index"
  ],
  "38_gam_score": [
    "gobernanza","gobierno corporativo","consejo","directivos","ceo","presidente",
    "gestión","gestion","administración","administracion","ética","etica",
    "valores","rsc","rse","esg","sostenibilidad","responsabilidad social",
    "diversidad","inclusión","inclusion","paridad","independencia",
    "accionista","accionistas","junta","comité","comite","retribución","retribucion",
    "bonus","stock options","conflicto de intereses","conflicto intereses",
    "nepotismo","puertas giratorias","consejero","consejeros","consejo de administración","consejo de administracion",
    "buen gobierno","gobierno","autonomía","autonomia","independencia directiva",
    "transparencia","estructura directiva","equipo directivo","alta dirección","alta direccion",
    "gobernanza corporativa","percepción de gobierno","percepcion de gobierno",
    // P1/3 additions — ESG terms map to governance perception
    "greenwashing","net zero","neutralidad de carbono","huella de carbono",
    "d&i","diversidad e inclusión","diversidad e inclusion",
    // IR Governance terms — ES
    "consejero independiente","comité de auditoría","comite de auditoria",
    "comité de nombramientos y retribuciones","comite de nombramientos y retribuciones",
    "junta general de accionistas","say on pay","proxy advisor","iss","glass lewis",
    "informe de gobierno corporativo","iagc","participaciones significativas",
    "accionistas de referencia","inversores institucionales","accionista activista",
    "derechos de voto","diluciones","ampliación de capital","ampliacion de capital",
    "autocartera","treasury shares","rating esg","djsi","ftse4good","msci esg",
    "taxonomía europea","taxonomia europea","doble materialidad","csrd","esrs",
    // EN
    "governance","corporate governance","board","directors","management","ethics",
    "sustainability","social responsibility","shareholder","shareholders","transparency",
    "executive team","board of directors","independent director","audit committee",
    "nomination committee","remuneration committee","annual general meeting","agm",
    "proxy advisor","institutional investors","activist shareholder","voting rights",
    "capital increase","share dilution","esg rating",
    // PT
    "governança","governanca","governo corporativo","conselho","diretores","gestão","gestao",
    "ética","etica","sustentabilidade","responsabilidade social","acionistas",
    "conselheiro independente","comitê de auditoria","comite de auditoria",
    "assembleia geral","investidores institucionais","acionista ativista",
    // CA
    "governança","governanca","govern corporatiu","consell","directius","gestió","ètica","etica",
    "sostenibilitat","responsabilitat social","accionistes","conseller independent",
    "comitè d'auditoria","comite d auditoria","junta general d'accionistes"
  ],
  "41_dcm_score": [
    "coherencia","consistencia","contradicción","contradiccion","discrepancia informativa",
    "alineación","alineacion","congruencia","uniformidad","armonía","armonia",
    "coincidencia","concordancia","lo mismo en todos lados","versión única","version unica",
    "un solo mensaje","fragmentación","fragmentacion","confusión","confusion",
    "desorden","caos informativo","ruido","incoherencia","inconsistencia",
    "coherencia informativa","datos contradictorios","información contradictoria","informacion contradictoria",
    "versiones distintas","cada modelo dice algo diferente","no coinciden",
    "información fragmentada","informacion fragmentada","datos dispersos",
    "misma información","misma informacion","datos alineados","consenso de datos",
    // IR Coherence terms
    "perception study","shareholder engagement","targeting de inversores",
    "one-on-one meetings","q&a con analistas","fact book","presentación institucional","presentacion institucional",
    "activism defense",
    // EN
    "coherence","consistency","contradiction","alignment","congruence","uniformity",
    "fragmentation","noise","incoherence","inconsistency","contradictory data",
    "perception study","shareholder engagement","investor targeting","fact book",
    // PT
    "coerência","coerencia","consistência","consistencia","contradição","contradicao",
    "alinhamento","fragmentação","fragmentacao","incoerência","incoerencia",
    "estudo de perceção","engajamento de acionistas",
    // CA
    "coherència","coherencia","consistència","consistencia","contradicció","contraccio",
    "alineació","fragmentació","incoherència","incoherencia",
    "estudi de percepció","engagement d'accionistes"
  ],
  "44_cxm_score": [
    "ejecución","ejecucion","resultados","operaciones","rendimiento","performance",
    "eficiencia","productividad","entrega","cumplimiento","objetivos",
    "plan estratégico","plan estrategico","hitos","inversiones",
    "m&a","adquisiciones","fusiones","expansión","expansion","crecimiento",
    "liderazgo operativo","cuota de mercado","cuota mercado",
    "ejecución corporativa","ejecucion corporativa","desempeño","desempeno",
    "resultados operativos","capacidad de ejecución","capacidad de ejecucion",
    "estrategia corporativa","plan de negocio","operativa","operativo",
    "capacidad operativa","excelencia operativa","resultados empresariales",
    // Stock price / valuation synonyms — ES
    "cotización","cotizacion","bursátil","bursatil","bolsa","acción","accion",
    "capitalización","capitalizacion","valor","precio de mercado","capitalización bursátil","capitalizacion bursatil",
    "valor en bolsa","precio de la acción","precio de la accion","valoración bursátil","valoracion bursatil",
    "precio bursátil","precio bursatil","valor bursátil","valor bursatil",
    "valoración de mercado","valoracion de mercado","valor de cotización","valor de cotizacion",
    "precio de negociación","precio de negociacion","tasación de mercado","tasacion de mercado",
    // Stock price / valuation — EN
    "stock price","market valuation","market capitalization","market cap","share price",
    "equity valuation","stock valuation","market price","trading price","market worth",
    "stock market value","equity price",
    // Stock price / valuation — PT
    "cotação","cotacao","preço de mercado","preco de mercado","capitalização bolsista","capitalizacao bolsista",
    "valor em bolsa","preço da ação","preco da acao","avaliação de mercado","avaliacao de mercado",
    "valor bolsista","preço bolsista","preco bolsista","valor de cotação","valor de cotacao",
    "preço de negociação","preco de negociacao",
    // Stock price / valuation — CA
    "cotització","cotitzacio","preu de mercat","capitalització borsària","capitalitzacio borsaria",
    "valor en borsa","preu de l'acció","preu de l accio","valoració de mercat","valoracio de mercat",
    // IR Financial terms — ES
    "precio de cierre","precio objetivo","target price","enterprise value","valor empresa",
    "book value","valor contable","fair value","nav","free float","volumen de negociación","volumen de negociacion",
    "liquidez","per","price-to-earnings","peg","price-to-book","p/b","ev/ebitda","ev/ebit",
    "dividend yield","rentabilidad por dividendo","earnings yield","tsr","total shareholder return",
    "alpha","beta","sharpe ratio","bpa","eps","beneficio por acción","beneficio por accion",
    "ebit","margen operativo","margen neto","profit warning","earnings surprise","beat","miss",
    "consensus estimate","dividendo por acción","dividendo por accion","payout ratio",
    "share buyback","recompra de acciones","deuda neta","apalancamiento","leverage",
    "rating crediticio","investment grade","cobertura de intereses","volatilidad","drawdown","var",
    "ibex 35","euro stoxx 50","benchmark","precio objetivo medio",
    "dcf","descuento de flujos","sum-of-the-parts","sotp","múltiplos","multiplos","comparables",
    "presentación de resultados","presentacion de resultados","earnings release","conference call",
    "capital markets day","roadshow","ipo","opa","opv","fusión","fusion","adquisición","adquisicion",
    "spin-off","equity story","tesis de inversión","tesis de inversion","investment thesis",
    "forward-looking statements","fact sheet",
    // IR Additional financial terms
    "wacc","coste de capital","cost of equity","cost of debt","spread de crédito","spread de credito",
    "cds","credit default swap","covenant financiero","ratio de cobertura del dividendo",
    "scrip dividend","retribución flexible","retribucion flexible","ex-date","record date",
    "free cash flow","fcf yield","capex","opex","working capital","nof","cash conversion",
    "roe","roa","roic","roce","margen bruto","ingresos recurrentes",
    "arr","mrr","churn","ltv","cac","nrr","arpu",
    "same-store sales","like-for-like","organic growth","backlog","book-to-bill",
    "order intake","pipeline comercial","market share","tam","sam","som"
  ],
  // P1/3 — General RIX / algorithmic reputation concepts (map to 09_rix_score for overall)
  "09_rix_score": [
    "reputación algorítmica","reputacion algoritmica","arm","algorithmic reputation management",
    "geo","generative engine optimization","prompt optimization",
    "riesgo reputacional algorítmico","riesgo reputacional algoritmico",
    "señal predictiva","senal predictiva","rix","índice rix","indice rix",
    "reputación digital","reputacion digital","score general","puntuación general","puntuacion general"
  ],
};

const INTENT_THESAURUS: Record<string, string[]> = {
  company_analysis: [
    "analízame","analizame","diagnostica","evalúa","evalua","cómo está","como esta",
    "qué tal","que tal","situación de","situacion de","estado de",
    "informe de","reporte de","dime sobre","cuéntame de","cuentame de",
    "ficha de","perfil de","resúmeme","resumeme","análisis de","analisis de",
    "cómo le va","como le va","cómo va","como va","qué pasa con","que pasa con",
    "háblame de","hablame de","explícame","explicame","detállame","detallame",
    "radiografía","radiografia","diagnóstico","diagnostico","auditoría reputacional","auditoria reputacional",
    // EN
    "analyze","analyse","diagnose","evaluate","how is","tell me about","report on","profile of",
    "what about","status of","assessment of","overview of",
    // PT
    "analisa","diagnostica","avalia","como está","como esta","situação de","situacao de",
    "estado de","relatório de","relatorio de","perfil de",
    // CA
    "analitza","diagnostica","avalua","com està","com esta","situació de","situacio de","informe de"
  ],
  ranking: [
    "ranking","clasificación","clasificacion","top","mejores","peores",
    "líderes","lideres","colistas","comparativa","quién gana","quien gana",
    "quién pierde","quien pierde","primero","último","ultimo","posición","posicion",
    "puesto","orden","lista","tabla","escalafón","escalafon",
    "quién lidera","quien lidera","quién está primero","quien esta primero",
    "las mejores","las peores","cuáles destacan","cuales destacan",
    // EN
    "best","worst","leaders","laggards","who leads","who wins","who loses","leaderboard",
    // PT
    "melhores","piores","líderes","lideres","classificação","classificacao","quem lidera",
    // CA
    "millors","pitjors","líders","liders","classificació","classificacio","qui lidera"
  ],
  evolution: [
    "evolución","evolucion","histórico","historico","tendencia","trayectoria",
    "progreso","cambio","delta","subió","subio","bajó","bajo",
    "mejoró","mejoro","empeoró","empeoro","últimas semanas","ultimas semanas",
    "temporal","serie","cómo ha ido","como ha ido","comparar periodos",
    "variación","variacion","crecimiento","caída","caida","recuperación","recuperacion",
    "ha mejorado","ha empeorado","ha subido","ha bajado","cómo ha evolucionado","como ha evolucionado",
    "tendencia temporal","serie temporal","progresión","progresion",
    // P1/3 additions
    "delta reputacional","variación del índice","variacion del indice",
    "línea base","linea base","baseline","recuperación reputacional","recuperacion reputacional",
    "periodo de afectación","periodo de afectacion","hecho desencadenante","trigger event",
    // EN
    "evolution","history","trend","trajectory","progress","change","improved","worsened",
    "went up","went down","over time","time series","how has it evolved",
    // PT
    "evolução","evolucao","histórico","historico","tendência","tendencia","progresso",
    "melhorou","piorou","subiu","desceu","como evoluiu",
    // CA
    "evolució","evolucio","històric","historic","tendència","tendencia","progrés","progres",
    "ha millorat","ha empitjorat","com ha evolucionat"
  ],
  sector_comparison: [
    "sector","sectorial","industria","todas las de","empresas de","compañías de","companias de",
    "comparar sectores","comparación sectorial","comparacion sectorial",
    "todo el sector","panorama del sector","cómo va el sector","como va el sector",
    // EN
    "sector","industry","all companies in","sector comparison","sector overview","how is the sector",
    // PT
    "setor","setorial","indústria","industria","comparação setorial","comparacao setorial",
    // CA
    "sector","sectorial","indústria","industria","comparació sectorial","comparacio sectorial"
  ],
  divergence: [
    "divergencia","desacuerdo","consenso","disenso","discrepancia entre ias",
    "diferencia entre modelos","quién tiene razón","quien tiene razon",
    "por qué difieren","por que difieren","opinión dividida","opinion dividida",
    "no se ponen de acuerdo","modelos discrepan","las ias no coinciden",
    "cada ia dice algo diferente","spread entre modelos","dispersión","dispersion",
    // Decoupling / mismatch synonyms — ES
    "desacoplamiento","brecha","desfase","desconexión","desconexion",
    "descorrelación","descorrelacion","desalineación","desalineacion",
    "asimetría","asimetria","desajuste","desequilibrio","disociación","disociacion",
    "desvinculación","desvinculacion","separación","separacion","distanciamiento",
    "discrepancia","falta de correspondencia",
    // EN
    "divergence","disagreement","consensus","dissent","discrepancy between ais",
    "difference between models","models disagree","ais don't agree",
    "decoupling","disconnect","misalignment","gap","mismatch","asymmetry",
    "deviation","disparity","imbalance","delinking","dislocation","detachment","spread",
    // PT
    "divergência","divergencia","desacordo","consenso","discrepância","discrepancia",
    "desacoplamento","desconexão","desconexao","descorrelação","descorrelacao",
    "desalinhamento","desequilíbrio","desequilibrio",
    // CA
    "divergència","divergencia","desacord","consens","discrepància","discrepancia",
    "desacoblament","desconnexió","desconnexio","desfasament","bretxa","desalineació","desalineacio"
  ],
  metric_deep_dive: [
    "métrica","metrica","score","puntuación","puntuacion","nota","calificación","calificacion",
    "valoración","valoracion","indicador","índice","indice","kpi",
    "desglose","detalle","profundizar","zoom","por qué tiene","por que tiene",
    "explícame la métrica","explicame la metrica","qué mide","que mide",
    "cómo se calcula","como se calcula","significado de","qué significa","que significa",
    // EN
    "metric","score","rating","grade","indicator","index","breakdown","detail","deep dive",
    "explain the metric","what does it measure","how is it calculated",
    // PT
    "métrica","metrica","pontuação","pontuacao","nota","indicador","índice","indice",
    "detalhe","o que mede","como se calcula",
    // CA
    "mètrica","metrica","puntuació","puntuacio","nota","indicador","índex","index",
    "detall","què mesura","que mesura","com es calcula"
  ],
  // Financial results intent
  financial_results: [
    // ES
    "cuentas anuales","presentación de resultados","presentacion de resultados",
    "resultados trimestrales","resultados anuales","informe financiero","memoria anual",
    "presentación a inversores","presentacion a inversores","earnings","beneficio neto",
    "ingresos","ebitda","guidance","previsión de resultados","prevision de resultados",
    "rendición de cuentas","rendicion de cuentas",
    // EN
    "financial results","annual accounts","earnings release","earnings call",
    "quarterly results","annual report","investor presentation","results presentation",
    "financial statements","accountability",
    // PT
    "contas anuais","resultados financeiros","demonstrações financeiras","demonstracoes financeiras",
    "relatório anual","relatorio anual","apresentação de resultados","apresentacao de resultados",
    "resultados trimestrais","prestação de contas","prestacao de contas",
    // CA
    "comptes anuals","resultats financers","presentació de resultats","presentacio de resultats",
    "rendició de comptes","rendicio de comptes"
  ],
  // Equity story intent
  equity_story: [
    // ES
    "equity story","relato de equity","historia de inversión","historia de inversion",
    "tesis de inversión","tesis de inversion","narrativa de la compañía para el mercado",
    "narrativa de la compania para el mercado","relato estratégico para inversores",
    "relato estrategico para inversores",
    // EN
    "equity story","investment thesis","equity narrative","company story for investors",
    "strategic narrative",
    // PT
    "equity story","tese de investimento","narrativa para investidores","história de investimento",
    "historia de investimento",
    // CA
    "equity story","tesi d'inversió","tesi d inversio","narrativa per a inversors"
  ],
  // P2/3 — New intents
  due_diligence: [
    "due diligence","due diligence reputacional","screening sectorial","screening",
    "análisis pre-operación","analisis pre-operacion","evaluación de riesgo reputacional",
    "evaluacion de riesgo reputacional","diligencia debida","análisis previo","analisis previo",
    "informe pre-adquisición","informe pre-adquisicion","risk assessment","reputational due diligence"
  ],
  corporate_event: [
    "opa","m&a","fusión","fusion","adquisición","adquisicion","ipo","salida a bolsa",
    "desinversión","desinversion","profit warning","guidance","oferta pública","oferta publica",
    "takeover","merger","acquisition","operación corporativa","operacion corporativa",
    "evento corporativo","hecho relevante","cnmv hecho relevante",
    "ampliación de capital","ampliacion de capital","split","contrasplit",
    "reestructuración","reestructuracion","spinoff","spin-off","carve-out"
  ],
  forensic_analysis: [
    "informe pericial","perito","análisis forense","analisis forense",
    "prueba documental","medición longitudinal","medicion longitudinal",
    "nexo causal","cuantificación del daño","cuantificacion del dano",
    "imputabilidad","periodo de afectación","periodo de afectacion",
    "comparativa sectorial forense","dictamen pericial","peritaje",
    "evidencia forense","análisis causal","analisis causal",
    "antes y después","antes y despues","impacto medible","daño reputacional cuantificado"
  ],
  risk_signal: [
    "señal predictiva","senal predictiva","riesgo reputacional algorítmico","riesgo reputacional algoritmico",
    "inteligencia regulatoria","tendencia regulatoria","alerta temprana",
    "early warning","risk signal","señal de riesgo","senal de riesgo",
    "detección de riesgo","deteccion de riesgo","indicador adelantado",
    "predicción","prediccion","pronóstico","pronostico","anticipación","anticipacion"
  ],
  talent_reputation: [
    "employer branding","marca empleadora","glassdoor","ere",
    "huelga laboral","conflicto laboral","cultura corporativa",
    "diversidad","d&i","diversidad e inclusión","diversidad e inclusion",
    "reputación como empleador","reputacion como empleador",
    "atracción de talento","atraccion de talento","retención de talento","retencion de talento",
    "clima laboral","great place to work","bienestar laboral"
  ],
};

const TEMPORAL_THESAURUS: Record<string, string[]> = {
  latest: [
    "última","ultima","reciente","actual","ahora","hoy","esta semana",
    "último barrido","ultimo barrido","última recogida","ultima recogida",
    "datos actuales","último dato","ultimo dato"
  ],
  evolution_4w: [
    "últimas 4","ultimas 4","último mes","ultimo mes","4 semanas","cuatro semanas",
    "un mes","mensual","últimas cuatro","ultimas cuatro"
  ],
  evolution_all: [
    "todo el histórico","todo el historico","desde el principio","toda la serie",
    "completo","todas las semanas","desde siempre","serie completa"
  ],
};

// Build reverse lookup maps for O(1) matching
const METRIC_REVERSE: Map<string, string> = new Map();
for (const [metric, synonyms] of Object.entries(METRIC_THESAURUS)) {
  for (const syn of synonyms) METRIC_REVERSE.set(syn, metric);
}

const INTENT_REVERSE: Map<string, string> = new Map();
for (const [intent, synonyms] of Object.entries(INTENT_THESAURUS)) {
  for (const syn of synonyms) INTENT_REVERSE.set(syn, intent);
}

const TEMPORAL_REVERSE: Map<string, string> = new Map();
for (const [temporal, synonyms] of Object.entries(TEMPORAL_THESAURUS)) {
  for (const syn of synonyms) TEMPORAL_REVERSE.set(syn, temporal);
}

// Sort all synonym keys by length descending for greedy matching
const ALL_METRIC_KEYS = Array.from(METRIC_REVERSE.keys()).sort((a, b) => b.length - a.length);
const ALL_INTENT_KEYS = Array.from(INTENT_REVERSE.keys()).sort((a, b) => b.length - a.length);
const ALL_TEMPORAL_KEYS = Array.from(TEMPORAL_REVERSE.keys()).sort((a, b) => b.length - a.length);

function thesaurusMatch(lower: string, lowerNoAccent: string, keys: string[], reverseMap: Map<string, string>): string[] {
  const found = new Set<string>();
  for (const key of keys) {
    const keyNA = removeAccentsEdge(key);
    const idx = lowerNoAccent.indexOf(keyNA);
    if (idx === -1) continue;
    const end = idx + keyNA.length;
    const before = idx === 0 || /[\s,;:.!?¿¡()\[\]{}'"\/\-]/.test(lowerNoAccent[idx - 1]);
    const after = end >= lowerNoAccent.length || /[\s,;:.!?¿¡()\[\]{}'"\/\-]/.test(lowerNoAccent[end]);
    if (before && after) {
      found.add(reverseMap.get(key)!);
    }
  }
  return Array.from(found);
}

// ── Layer 2: Micro-LLM fallback ─────────────────────────────────────
async function semanticBridgeLLMFallback(question: string): Promise<{ metrics: string[]; intent: string | null }> {
  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return { metrics: [], intent: null };
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 80,
        messages: [
          { role: "system", content: `Eres un clasificador. Dada una pregunta sobre reputación corporativa, devuelve JSON con:
- metrics: array de métricas relevantes. Valores válidos: 23_nvm_score, 26_drm_score, 29_sim_score, 32_rmm_score, 35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score
- intent: uno de: company_analysis, ranking, evolution, sector_comparison, divergence, metric_deep_dive, null
Solo devuelve el JSON, nada más.` },
          { role: "user", content: question }
        ],
      }),
    });
    clearTimeout(timeout);
    
    if (!resp.ok) return { metrics: [], intent: null };
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(content);
    const validMetrics = ["23_nvm_score","26_drm_score","29_sim_score","32_rmm_score","35_cem_score","38_gam_score","41_dcm_score","44_cxm_score"];
    const validIntents = ["company_analysis","ranking","evolution","sector_comparison","divergence","metric_deep_dive"];
    return {
      metrics: (parsed.metrics || []).filter((m: string) => validMetrics.includes(m)),
      intent: validIntents.includes(parsed.intent) ? parsed.intent : null,
    };
  } catch {
    return { metrics: [], intent: null };
  }
}

// ── Main semanticBridge function ─────────────────────────────────────
async function semanticBridge(
  question: string,
  companiesList?: Array<{ ticker: string; issuer_name: string; include_terms?: any }> | null,
): Promise<SemanticBridgeResult> {
  const lower = question.toLowerCase();
  const lowerNA = removeAccentsEdge(lower);
  
  // ── Phase 0: Dynamic company detection from DB list ──────────────
  const detectedCompanies: Array<{ ticker: string; issuer_name: string }> = [];
  
  if (companiesList && companiesList.length > 0) {
    // Build a dynamic lookup from DB companies
    const candidates: Array<{ term: string; ticker: string; issuer_name: string; priority: number }> = [];
    
    for (const co of companiesList) {
      const name = co.issuer_name || "";
      const nameLower = name.toLowerCase();
      const nameNA = removeAccentsEdge(nameLower);
      
      // Full name (highest priority)
      if (nameNA.length > 0) candidates.push({ term: nameNA, ticker: co.ticker, issuer_name: name, priority: 100 });
      
      // include_terms
      try {
        const terms = Array.isArray(co.include_terms) ? co.include_terms : (co.include_terms ? JSON.parse(co.include_terms) : []);
        for (const t of terms) {
          const tNA = removeAccentsEdge((t as string).toLowerCase());
          if (tNA.length >= 2 && tNA !== nameNA) candidates.push({ term: tNA, ticker: co.ticker, issuer_name: name, priority: 90 });
        }
      } catch { /* ignore */ }
      
      // First word of name (if >= 3 chars)
      const firstWord = nameNA.split(/\s+/)[0];
      if (firstWord && firstWord.length >= 3 && firstWord !== nameNA) {
        candidates.push({ term: firstWord, ticker: co.ticker, issuer_name: name, priority: 50 });
      }
      
      // Ticker without .MC suffix
      const tickerClean = removeAccentsEdge(co.ticker.toLowerCase().replace(/\.mc$/i, "").replace(/-priv$/i, ""));
      if (tickerClean.length >= 2) candidates.push({ term: tickerClean, ticker: co.ticker, issuer_name: name, priority: 80 });
    }
    
    // Sort by term length desc (greedy matching), then priority desc
    candidates.sort((a, b) => b.term.length - a.term.length || b.priority - a.priority);
    
    const seenTickers = new Set<string>();
    for (const cand of candidates) {
      if (seenTickers.has(cand.ticker)) continue;
      const idx = lowerNA.indexOf(cand.term);
      if (idx === -1) continue;
      const end = idx + cand.term.length;
      const before = idx === 0 || /[\s,;:.!?¿¡()\[\]{}'"\/\-]/.test(lowerNA[idx - 1]);
      const after = end >= lowerNA.length || /[\s,;:.!?¿¡()\[\]{}'"\/\-]/.test(lowerNA[end]);
      if (!before || !after) continue;
      
      // Disambiguation check for short/ambiguous names
      if (isCompanyMention(cand.term, question, idx)) {
        detectedCompanies.push({ ticker: cand.ticker, issuer_name: cand.issuer_name });
        seenTickers.add(cand.ticker);
      }
    }
    
    if (detectedCompanies.length > 0) {
      console.log(`[SEMANTIC_BRIDGE] Dynamic company detection: ${detectedCompanies.map(c => `${c.issuer_name}(${c.ticker})`).join(", ")}`);
    }
  }
  
  // ── Fallback: static COMPANY_TICKER_MAP for companies not in DB ──
  if (detectedCompanies.length === 0) {
    for (const key of COMPANY_KEYS_SORTED) {
      const keyNA = removeAccentsEdge(key);
      const idx = lowerNA.indexOf(keyNA);
      if (idx === -1) continue;
      const end = idx + keyNA.length;
      const before = idx === 0 || /[\s,;:.!?¿¡()\[\]{}'"\/\-]/.test(lowerNA[idx - 1]);
      const after = end >= lowerNA.length || /[\s,;:.!?¿¡()\[\]{}'"\/\-]/.test(lowerNA[end]);
      if (!before || !after) continue;
      if (isCompanyMention(key, question, idx)) {
        const ticker = COMPANY_TICKER_MAP[key];
        if (!detectedCompanies.some(c => c.ticker === ticker)) {
          detectedCompanies.push({ ticker, issuer_name: key });
        }
      }
    }
    if (detectedCompanies.length > 0) {
      console.log(`[SEMANTIC_BRIDGE] Static map company detection: ${detectedCompanies.map(c => `${c.issuer_name}(${c.ticker})`).join(", ")}`);
    }
  }
  
  // Layer 1: Deterministic thesaurus matching
  const detectedMetrics = thesaurusMatch(lower, lowerNA, ALL_METRIC_KEYS, METRIC_REVERSE);
  const detectedIntents = thesaurusMatch(lower, lowerNA, ALL_INTENT_KEYS, INTENT_REVERSE);
  const detectedTemporals = thesaurusMatch(lower, lowerNA, ALL_TEMPORAL_KEYS, TEMPORAL_REVERSE);
  
  const intent = detectedIntents.length > 0 ? detectedIntents[0] : null;
  const temporal = detectedTemporals.length > 0 ? detectedTemporals[0] : null;
  
  let usedLLM = false;
  let finalMetrics = detectedMetrics;
  let finalIntent = intent;
  
  // Layer 2: LLM fallback only if Layer 1 found nothing useful
  if (detectedMetrics.length === 0 && !intent) {
    console.log(`[SEMANTIC_BRIDGE] Layer 1 found nothing, trying LLM fallback...`);
    const llmResult = await semanticBridgeLLMFallback(question);
    usedLLM = true;
    if (llmResult.metrics.length > 0) finalMetrics = llmResult.metrics;
    if (llmResult.intent) finalIntent = llmResult.intent;
    console.log(`[SEMANTIC_BRIDGE] LLM fallback: metrics=${llmResult.metrics.join(",")}, intent=${llmResult.intent}`);
  }
  
  // If we detected companies but no intent, default to company_analysis
  if (detectedCompanies.length > 0 && !finalIntent) {
    finalIntent = "company_analysis";
    console.log(`[SEMANTIC_BRIDGE] Auto-set intent=company_analysis (company detected, no explicit intent)`);
  }
  
  // Build enriched question with canonical tags appended
  const tags: string[] = [];
  for (const m of finalMetrics) tags.push(`[${m}]`);
  if (finalIntent) tags.push(`[${finalIntent}]`);
  if (temporal) tags.push(`[${temporal}]`);
  
  // Map metrics to regex-friendly canonical terms that interpretQueryEdge already understands
  const canonicalTerms: string[] = [];
  for (const m of finalMetrics) {
    if (m === "35_cem_score") canonicalTerms.push("controversias");
    if (m === "29_sim_score") canonicalTerms.push("fuentes");
    if (m === "23_nvm_score") canonicalTerms.push("narrativa");
    if (m === "26_drm_score") canonicalTerms.push("evidencia");
    if (m === "32_rmm_score") canonicalTerms.push("actualidad");
    if (m === "38_gam_score") canonicalTerms.push("gobernanza");
    if (m === "41_dcm_score") canonicalTerms.push("coherencia");
    if (m === "44_cxm_score") canonicalTerms.push("ejecución");
  }
  // Map intents to regex-friendly terms
  if (finalIntent === "company_analysis") canonicalTerms.push("análisis");
  if (finalIntent === "ranking") canonicalTerms.push("ranking");
  if (finalIntent === "evolution") canonicalTerms.push("evolución");
  if (finalIntent === "sector_comparison") canonicalTerms.push("sectorial");
  if (finalIntent === "divergence") canonicalTerms.push("divergencia");
  if (finalIntent === "metric_deep_dive") canonicalTerms.push("métrica");
  
  const enriched = canonicalTerms.length > 0
    ? `${question} ${canonicalTerms.join(" ")} ${tags.join(" ")}`
    : question;
  
  if (finalMetrics.length > 0 || finalIntent || detectedCompanies.length > 0) {
    console.log(`[SEMANTIC_BRIDGE] Detected metrics=[${finalMetrics.join(",")}], intent=${finalIntent}, temporal=${temporal}, companies=${detectedCompanies.length}, llm=${usedLLM}`);
  }
  
  return {
    enriched_question: enriched,
    detected_metrics: finalMetrics,
    detected_intent: finalIntent,
    detected_temporal: temporal,
    detected_companies: detectedCompanies,
    used_llm_fallback: usedLLM,
  };
}

// ── Interpret Query (lexicon + regex, no LLM) ───────────────────────
const IBEX_PATTERNS_EDGE = /\b(ibex[- ]?35|ibex|índice|indice|panorama general|ranking general)\b/i;
const EVOLUTION_PATTERNS_EDGE = /\b(evoluci[oó]n|tendencia|trend|hist[oó]ric|temporal|semanas?|weeks?|últim[oa]s?|progres)/i;
const RANKING_PATTERNS_EDGE = /\b(ranking|clasificaci[oó]n|top|bottom|botom|mejor|peor|peores|l[ií]der|rezagad|posici[oó]n|puesto|colistas?|cola|últimos|los\s+m[aá]s\s+bajos|worst|best|leaders?|laggards?|leaderboard)\b/i;
const DIVERGENCE_PATTERNS_EDGE = /\b(divergencia|consenso|discrepancia|acuerdo|desacuerdo|modelos? difieren|spread|dispersi[oó]n)/i;
const COMPANY_QUESTION_PATTERNS_EDGE = /\b(c[oó]mo est[aá]|qu[eé] tal|an[aá]lisis|diagn[oó]stico|situaci[oó]n|reputaci[oó]n|score|puntuaci[oó]n|nota)\b/i;
const ALERT_PATTERNS_EDGE = /\b(crisis|alerta|alertas|riesgo|peligro|problemas?|hundimiento|ca[ií]da|peor(?:es)?|en\s+crisis|riesgo\s+reputacional)\b/i;

// ── Semantic Glossary Lookup (fallback for specialized terms) ──
interface GlossaryTerm {
  term: string;
  definition: string;
  category: string;
  related_metrics: string[] | null;
  repindex_relevance: string | null;
}

let glossaryCache: { terms: GlossaryTerm[]; fetched_at: number } | null = null;
const GLOSSARY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function lookupGlossaryTerms(supabase: any, query: string, maxResults = 3): Promise<GlossaryTerm[]> {
  // Fetch and cache glossary
  if (!glossaryCache || Date.now() - glossaryCache.fetched_at > GLOSSARY_CACHE_TTL) {
    const { data, error } = await supabase
      .from("rix_semantic_glossary")
      .select("term, aliases, definition, category, related_metrics, repindex_relevance");
    if (error || !data) {
      console.warn("[GLOSSARY] Failed to fetch glossary:", error?.message);
      return [];
    }
    glossaryCache = { terms: data, fetched_at: Date.now() };
  }

  const lower = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const matches: { term: GlossaryTerm; score: number }[] = [];

  for (const entry of glossaryCache.terms) {
    const termLower = (entry as any).term?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
    const aliases: string[] = (entry as any).aliases || [];
    
    // Check term match
    if (lower.includes(termLower) && termLower.length >= 3) {
      matches.push({ term: entry, score: termLower.length }); // longer terms = more specific = higher score
      continue;
    }
    
    // Check aliases
    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes(aliasLower) && aliasLower.length >= 3) {
        matches.push({ term: entry, score: aliasLower.length });
        break;
      }
    }
  }

  // Sort by specificity (longest match first) and limit
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, maxResults).map(m => m.term);
}

async function interpretQueryEdge(question: string): Promise<{ intent: string; entities: string[]; filters: Record<string, string>; recommended_skills: string[]; confidence: number }> {
  const lower = question.toLowerCase();
  const entities: string[] = [];
  const filters: Record<string, string> = {};
  let intent = "general_question";
  const recommended_skills: string[] = [];
  let confidence = 0.6;

  // Lexicon-first: robust sector/company/intent detection
  const lexicon = normalizeQuery(question);
  if (lexicon.sector_categories.length > 0) {
    filters.sector_category = lexicon.sector_categories[0];
    for (const sc of lexicon.sector_categories) entities.push(sc);
    console.log(`[LEXICON] Detected sectors: ${lexicon.sector_categories.join(", ")}`);
  }
  if (lexicon.company_tickers.length > 0) {
    console.log(`[LEXICON] Detected companies: ${lexicon.company_names.join(", ")} → ${lexicon.company_tickers.join(", ")}`);
  }
  if (lexicon.intent_hints.length > 0) {
    console.log(`[LEXICON] Intent hints: ${lexicon.intent_hints.join(", ")}`);
  }

  const hasEvolution = EVOLUTION_PATTERNS_EDGE.test(lower) || lexicon.intent_hints.includes("evolución");
  const hasDivergence = DIVERGENCE_PATTERNS_EDGE.test(lower) || lexicon.intent_hints.includes("divergencia");
  const hasRanking = RANKING_PATTERNS_EDGE.test(lower) || lexicon.intent_hints.includes("ranking");
  const hasSector = filters.sector_category != null || lexicon.intent_hints.includes("sector");
  const hasIbex = IBEX_PATTERNS_EDGE.test(lower);
  const hasAlert = ALERT_PATTERNS_EDGE.test(lower);

  // Detect AI model mentioned in query
  const MODEL_NAME_PATTERNS = /\b(chatgpt|chat\s*gpt|perplexity|gemini|deepseek|deep\s*seek|grok|qwen)\b/i;
  const modelMatch = lower.match(MODEL_NAME_PATTERNS);
  if (modelMatch) {
    const MODEL_MAP: Record<string, string> = { chatgpt: "ChatGPT", "chat gpt": "ChatGPT", perplexity: "Perplexity", gemini: "Google Gemini", deepseek: "DeepSeek", "deep seek": "DeepSeek", grok: "Grok", qwen: "Qwen" };
    const key = modelMatch[1].toLowerCase().replace(/\s+/g, " ");
    filters.model_name = MODEL_MAP[key] || MODEL_MAP[key.replace(/\s/g, "")] || modelMatch[1];
    console.log(`[INTERPRET] Detected model filter: ${filters.model_name}`);
  }

  if (hasAlert && !hasEvolution && !hasDivergence) {
    intent = "alert"; recommended_skills.push("skillCrisisScan"); confidence = 0.85;
  } else if (hasRanking && (hasIbex || filters.sector_category)) {
    // Ranking + IBEX/sector takes priority over evolution — "top 5 IBEX últimas 4 semanas" is a ranking query with temporal filter
    intent = "ranking"; recommended_skills.push("skillGetCompanyRanking", "skillGetCompanyEvolution");
    if (hasIbex) filters.ibex_family_code = "IBEX-35";
    if (filters.sector_category) recommended_skills.push("skillGetSectorComparison");
    confidence = 0.85;
    // Extract top_n / bottom_n quantities
    const topMatch = lower.match(/\btop\s*(\d+)\b/i);
    const bottomMatch = lower.match(/\b(?:bottom|botom|últimos|peores|colistas?|cola|worst)\s*(\d+)?\b/i);
    if (topMatch) filters.top_n = topMatch[1] || "5";
    if (bottomMatch) filters.bottom_n = bottomMatch[1] || "5";
    if (!topMatch && !bottomMatch && /\b(top|mejor|l[ií]der)/i.test(lower)) filters.top_n = "5";
    const hasBottomIntent = /\b(bottom|botom|peor|peores|últimos|colistas?|cola|worst|los\s+m[aá]s\s+bajos)\b/i.test(lower);
    if (hasBottomIntent && !filters.bottom_n) filters.bottom_n = "5";
  } else if (hasEvolution) {
    intent = "evolution"; recommended_skills.push("skillGetCompanyEvolution", "skillGetCompanyScores"); confidence = 0.85;
  } else if (hasDivergence) {
    intent = "divergence"; recommended_skills.push("skillGetDivergenceAnalysis", "skillGetCompanyScores"); confidence = 0.85;
  } else if (hasRanking) {
    intent = "ranking"; recommended_skills.push("skillGetCompanyRanking", "skillGetCompanyEvolution");
    if (hasIbex) filters.ibex_family_code = "IBEX-35";
    if (filters.sector_category) recommended_skills.push("skillGetSectorComparison");
    confidence = 0.85;
    const topMatch = lower.match(/\btop\s*(\d+)\b/i);
    const bottomMatch = lower.match(/\b(?:bottom|botom|últimos|peores|colistas?|cola|worst)\s*(\d+)?\b/i);
    if (topMatch) filters.top_n = topMatch[1] || "5";
    if (bottomMatch) filters.bottom_n = bottomMatch[1] || "5";
    if (!topMatch && !bottomMatch && /\b(top|mejor|l[ií]der)/i.test(lower)) filters.top_n = "5";
    const hasBottomIntent = /\b(bottom|botom|peor|peores|últimos|colistas?|cola|worst|los\s+m[aá]s\s+bajos)\b/i.test(lower);
    if (hasBottomIntent && !filters.bottom_n) filters.bottom_n = "5";
  } else if (hasSector && filters.sector_category) {
    intent = "sector_comparison"; recommended_skills.push("skillGetSectorComparison", "skillGetCompanyRanking", "skillGetCompanyEvolution"); confidence = 0.8;
  } else if (hasIbex) {
    intent = "ranking"; filters.ibex_family_code = "IBEX-35"; recommended_skills.push("skillGetCompanyRanking"); confidence = 0.9;
  } else if (COMPANY_QUESTION_PATTERNS_EDGE.test(lower)) {
    intent = "company_analysis"; recommended_skills.push("skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyEvolution", "skillGetDivergenceAnalysis"); confidence = 0.75;
  }

  if (["company_analysis", "evolution", "divergence"].includes(intent) && !recommended_skills.includes("skillGetCompanyDetail")) {
    recommended_skills.push("skillGetCompanyDetail");
  }
  if (intent === "general_question") { recommended_skills.push("skillGetCompanyDetail"); confidence = 0.3; }

  // Attach lexicon for downstream
  (filters as any)._lexicon = lexicon;

  // ── LLM Fallback: when regex confidence is low, use gpt-4o-mini to classify ──
  if (confidence < 0.7 && intent === "general_question") {
    try {
      const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
      if (openAIApiKey) {
        console.log(`[INTERPRET_LLM_FALLBACK] Confidence ${confidence} < 0.7, calling gpt-4o-mini for classification`);
        const llmClassifyStart = Date.now();
        const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0,
            max_tokens: 300,
            messages: [
              { role: "system", content: `Eres un clasificador de intención para consultas sobre reputación corporativa del IBEX 35 y empresas españolas.
Devuelve JSON con esta estructura exacta:
{
  "intent": "ranking" | "evolution" | "company_analysis" | "sector_comparison" | "divergence" | "alert" | "general_question",
  "filters": {
    "ibex_family_code": "IBEX-35" (solo si menciona IBEX),
    "sector_category": "nombre del sector" (solo si menciona sector),
    "model_name": "ChatGPT" | "Perplexity" | "Google Gemini" | "DeepSeek" | "Grok" | "Qwen" (solo si menciona modelo de IA),
    "top_n": "5" (si pide top N),
    "bottom_n": "5" (si pide bottom/peores N)
  },
  "skills": ["skillGetCompanyRanking", "skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyEvolution", "skillGetSectorComparison", "skillGetDivergenceAnalysis"]
}
Intents y cuándo usarlos:
- ranking: rankings, top, bottom, mejores, peores, líderes, colistas
- evolution: evolución temporal, tendencia, trayectoria, progreso, histórico
- company_analysis: análisis de empresa, resultados financieros (beneficios, EBITDA, dividendos, deuda), equity story, due diligence, eventos corporativos (OPA, fusión, M&A, IPO), ESG/sostenibilidad, gobernanza, employer branding, talento, cotización/bolsa
- sector_comparison: comparar sectores, panorama sectorial
- divergence: divergencia entre modelos de IA, consenso, discrepancia, desacoplamiento
- alert: crisis, escándalo, controversia, riesgo reputacional, señales de riesgo, alerta temprana
- general_question: solo si ningún otro intent aplica
Si el usuario usa términos especializados (reputación algorítmica, OPA, compliance, delta reputacional, cuota de voz, etc.), clasifica según el contexto reputacional más cercano.

Skills disponibles:
- skillGetCompanyRanking: rankings, top, bottom, mejores, peores
- skillGetCompanyScores: puntuaciones, métricas RIX de una empresa
- skillGetCompanyDetail: perfil/detalle de empresa, resúmenes cualitativos
- skillGetCompanyEvolution: evolución temporal, tendencias, serie histórica
- skillGetSectorComparison: comparar empresas dentro de un sector
- skillGetDivergenceAnalysis: divergencias entre modelos de IA, consenso
Solo devuelve el JSON, sin texto adicional.` },
              { role: "user", content: question }
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (llmResponse.ok) {
          const llmData = await llmResponse.json();
          const parsed = JSON.parse(llmData.choices?.[0]?.message?.content || "{}");
          const llmMs = Date.now() - llmClassifyStart;
          console.log(`[INTERPRET_LLM_FALLBACK] Result in ${llmMs}ms: intent=${parsed.intent}, filters=${JSON.stringify(parsed.filters)}`);
          
          if (parsed.intent && parsed.intent !== "general_question") {
            intent = parsed.intent;
            confidence = 0.8; // LLM classification is reliable
            
            // Merge LLM-detected filters (don't overwrite existing ones)
            if (parsed.filters) {
              for (const [k, v] of Object.entries(parsed.filters)) {
                if (v && !filters[k] && k !== "_lexicon") {
                  filters[k] = v as string;
                }
              }
            }
            
            // Use LLM-recommended skills
            if (parsed.skills && Array.isArray(parsed.skills) && parsed.skills.length > 0) {
              recommended_skills.length = 0;
              for (const s of parsed.skills) recommended_skills.push(s);
            } else {
              // Default skills based on LLM intent
              recommended_skills.length = 0;
              if (intent === "ranking") recommended_skills.push("skillGetCompanyRanking", "skillGetCompanyEvolution");
              else if (intent === "evolution") recommended_skills.push("skillGetCompanyEvolution", "skillGetCompanyScores");
              else if (intent === "divergence") recommended_skills.push("skillGetDivergenceAnalysis", "skillGetCompanyScores");
              else if (intent === "sector_comparison") recommended_skills.push("skillGetSectorComparison", "skillGetCompanyRanking");
              else if (intent === "company_analysis") recommended_skills.push("skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyEvolution");
              else if (intent === "alert") recommended_skills.push("skillGetCompanyRanking");
            }
          }
        }
      }
    } catch (llmErr) {
      console.warn(`[INTERPRET_LLM_FALLBACK] Error:`, llmErr);
      // Continue with regex result — this is just a fallback
    }
  }

  return { intent, entities, filters, recommended_skills, confidence };
}

// ── buildDataPackFromSkills — Skills-first DataPack builder (v2: consolidated skills) ─
async function buildDataPackFromSkills(
  question: string,
  supabaseClient: any,
  companiesCacheLocal: any[] | null,
  logPrefix: string,
  originalQuestion?: string,
): Promise<(DataPack & { divergencias_detalle?: any[] }) | null> {
  const totalStart = Date.now();
  try {
    // ── Temporal expression parsing: MUST run on original question BEFORE normalize-query ──
    const temporalRange = parseTemporalExpression(originalQuestion || question);
    if (temporalRange) {
      console.log(`${logPrefix} [TEMPORAL] Using temporal range: ${temporalRange.from} to ${temporalRange.to} (${temporalRange.label})${temporalRange.adjusted ? " [floor adjusted]" : ""}`);
    }
    // ── Semantic Bridge: enrich question with canonical terms ──────
    const bridge = await semanticBridge(question, companiesCacheLocal);
    let enrichedQuestion = bridge.enriched_question;
    console.log(`${logPrefix} [SEMANTIC_BRIDGE] metrics=[${bridge.detected_metrics.join(",")}], intent=${bridge.detected_intent}, companies=${bridge.detected_companies.map(c=>c.issuer_name).join(",")}, llm=${bridge.used_llm_fallback}`);
    
    const interpret = await interpretQueryEdge(enrichedQuestion);
    console.log(`${logPrefix} [SKILLS-v2] interpretQuery: intent=${interpret.intent}, confidence=${interpret.confidence}`);

    // ── Bridge→Interpret propagation: if interpret fell to general_question but bridge detected an advanced intent, use it ──
    if (interpret.intent === "general_question" && bridge.detected_intent) {
      const BRIDGE_TO_INTERPRET_MAP: Record<string, { intent: string; skills: string[] }> = {
        financial_results: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyEvolution"] },
        equity_story: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
        due_diligence: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetDivergenceAnalysis"] },
        corporate_event: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
        forensic_analysis: { intent: "evolution", skills: ["skillGetCompanyEvolution", "skillGetCompanyScores"] },
        risk_signal: { intent: "alert", skills: ["skillGetCompanyRanking", "skillGetCompanyScores"] },
        talent_reputation: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
        metric_deep_dive: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
        company_analysis: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyEvolution"] },
        ranking: { intent: "ranking", skills: ["skillGetCompanyRanking", "skillGetCompanyEvolution"] },
        evolution: { intent: "evolution", skills: ["skillGetCompanyEvolution", "skillGetCompanyScores"] },
        sector_comparison: { intent: "sector_comparison", skills: ["skillGetSectorComparison", "skillGetCompanyRanking"] },
        divergence: { intent: "divergence", skills: ["skillGetDivergenceAnalysis", "skillGetCompanyScores"] },
      };
      const mapped = BRIDGE_TO_INTERPRET_MAP[bridge.detected_intent];
      if (mapped) {
        interpret.intent = mapped.intent;
        interpret.confidence = 0.75;
        interpret.recommended_skills.length = 0;
        for (const s of mapped.skills) interpret.recommended_skills.push(s);
        console.log(`${logPrefix} [BRIDGE→INTERPRET] Propagated bridge intent '${bridge.detected_intent}' → '${mapped.intent}' with skills [${mapped.skills.join(",")}]`);
      }
    }
    // ── Also check lexicon intent_hints for advanced intents not caught by regex ──
    const lexiconHints = (interpret.filters as any)?._lexicon?.intent_hints || [];
    if (interpret.intent === "general_question" && lexiconHints.length > 0) {
      const HINT_TO_INTENT: Record<string, { intent: string; skills: string[] }> = {
        "financiero": { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
        "corporativo": { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
        "bursátil": { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetDivergenceAnalysis"] },
        "gobernanza": { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
        "alerta": { intent: "alert", skills: ["skillGetCompanyRanking", "skillGetCompanyScores"] },
        "due_diligence": { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetDivergenceAnalysis"] },
        "talento": { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
        "análisis": { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyEvolution"] },
      };
      for (const hint of lexiconHints) {
        const hintMap = HINT_TO_INTENT[hint];
        if (hintMap) {
          interpret.intent = hintMap.intent;
          interpret.confidence = 0.7;
          interpret.recommended_skills.length = 0;
          for (const s of hintMap.skills) interpret.recommended_skills.push(s);
          console.log(`${logPrefix} [LEXICON→INTERPRET] Hint '${hint}' → '${hintMap.intent}'`);
          break;
        }
      }
    }

    // ── Glossary fallback: when still general_question with low confidence, look up specialized terms ──
    if (interpret.intent === "general_question" && interpret.confidence < 0.5) {
      try {
        const glossaryTerms = await lookupGlossaryTerms(supabaseClient, question);
        if (glossaryTerms.length > 0) {
          // Inject glossary context into the enriched question for the LLM
          const glossaryContext = glossaryTerms.map(t => `[GLOSARIO: "${t.term}" = ${t.definition}${t.related_metrics?.length ? ` (métricas: ${t.related_metrics.join(", ")})` : ""}]`).join(" ");
          enrichedQuestion = `${enrichedQuestion} ${glossaryContext}`;
          console.log(`${logPrefix} [GLOSSARY_FALLBACK] Found ${glossaryTerms.length} terms: ${glossaryTerms.map(t=>t.term).join(", ")}`);
          
          // Determine intent from glossary category
          const CATEGORY_TO_INTENT: Record<string, { intent: string; skills: string[] }> = {
            reputacion_algoritmica: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            optimizacion: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyEvolution"] },
            comunicacion: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            corporativo: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            financiero: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyEvolution"] },
            legal: { intent: "alert", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetCompanyRanking"] },
            institucional: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            digital: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            esg: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            pericial: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail", "skillGetDivergenceAnalysis"] },
            roles: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            // New categories from semantic dictionary
            agrupacion: { intent: "ranking", skills: ["skillGetCompanyRanking", "skillGetCompanyScores"] },
            marca_matriz: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            nombre_historico: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            persona_empresa: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            sector_coloquial: { intent: "sector_comparison", skills: ["skillGetSectorComparison", "skillGetCompanyRanking"] },
            filtro: { intent: "ranking", skills: ["skillGetCompanyRanking"] },
            propiedad: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            acronimo: { intent: "company_analysis", skills: ["skillGetCompanyScores", "skillGetCompanyDetail"] },
            no_disponible: { intent: "general_question", skills: [] },
          };
          const primaryCategory = glossaryTerms[0].category;
          const catMap = CATEGORY_TO_INTENT[primaryCategory];
          if (catMap) {
            interpret.intent = catMap.intent;
            interpret.confidence = primaryCategory === "no_disponible" ? 0.9 : 0.70;
            interpret.recommended_skills.length = 0;
            for (const s of catMap.skills) interpret.recommended_skills.push(s);
            console.log(`${logPrefix} [GLOSSARY→INTERPRET] Category '${primaryCategory}' → '${catMap.intent}'`);

            // Extract tickers from repindex_relevance for entity-bearing categories
            const ENTITY_CATEGORIES = new Set(["agrupacion", "marca_matriz", "nombre_historico", "persona_empresa", "sector_coloquial", "filtro", "acronimo", "propiedad"]);
            if (ENTITY_CATEGORIES.has(primaryCategory)) {
              for (const gt of glossaryTerms) {
                const rel = gt.repindex_relevance || "";
                // Handle no_disponible in persona_empresa (e.g., Tim Cook → Apple not in BBDD)
                if (rel.startsWith("no_disponible:")) {
                  interpret.intent = "general_question";
                  interpret.confidence = 0.9;
                  interpret.recommended_skills.length = 0;
                  enrichedQuestion = `${enrichedQuestion} [NO_DISPONIBLE: ${rel.replace("no_disponible:", "")}]`;
                  console.log(`${logPrefix} [GLOSSARY→NO_DISPONIBLE] ${gt.term}: ${rel}`);
                  break;
                }
                // Extract tickers
                const tickerMatch = rel.match(/tickers?:([^|]+)/);
                if (tickerMatch) {
                  const tickers = tickerMatch[1].split(",").map((t: string) => t.trim()).filter(Boolean);
                  for (const tk of tickers) {
                    if (!interpret.entities.includes(tk)) interpret.entities.push(tk);
                  }
                  if (tickers.length === 1 && !interpret.filters.ticker) {
                    interpret.filters.ticker = tickers[0];
                  }
                }
                // Extract filters (e.g., filter:cotiza_en_bolsa=true)
                const filterMatch = rel.match(/filter:([^|]+)/);
                if (filterMatch) {
                  const parts = filterMatch[1].split("=");
                  if (parts.length === 2) {
                    interpret.filters[parts[0]] = parts[1];
                  }
                }
                // Extract sector hints
                const sectorMatch = rel.match(/sector:([^|]+)/);
                if (sectorMatch) {
                  const sectors = sectorMatch[1].split(",").map((s: string) => s.trim());
                  if (!interpret.filters.sector_category) {
                    interpret.filters.sector_category = sectors[0];
                  }
                }
                // Extract extra_tickers
                const extraMatch = rel.match(/extra_tickers:([^|]+)/);
                if (extraMatch) {
                  const extras = extraMatch[1].split(",").map((t: string) => t.trim());
                  for (const tk of extras) {
                    if (!interpret.entities.includes(tk)) interpret.entities.push(tk);
                  }
                }
              }
              if (interpret.entities.length > 0) {
                console.log(`${logPrefix} [GLOSSARY→ENTITIES] Extracted ${interpret.entities.length} entities: ${interpret.entities.slice(0, 5).join(", ")}${interpret.entities.length > 5 ? "..." : ""}`);
              }
            }
          }
        }
      } catch (glossaryErr) {
        console.warn(`${logPrefix} [GLOSSARY_FALLBACK] Error:`, glossaryErr);
      }
    }

    // Fallback: if model not detected in normalized question, try original question
    if (originalQuestion && !interpret.filters.model_name) {
      const origLower = originalQuestion.toLowerCase();
      const MODEL_NAME_PATTERNS_FALLBACK = /\b(chatgpt|chat\s*gpt|perplexity|gemini|deepseek|deep\s*seek|grok|qwen)\b/i;
      const origModelMatch = origLower.match(MODEL_NAME_PATTERNS_FALLBACK);
      if (origModelMatch) {
        const MODEL_MAP_FALLBACK: Record<string, string> = { chatgpt: "ChatGPT", "chat gpt": "ChatGPT", perplexity: "Perplexity", gemini: "Google Gemini", deepseek: "DeepSeek", "deep seek": "DeepSeek", grok: "Grok", qwen: "Qwen" };
        const key = origModelMatch[1].toLowerCase().replace(/\s+/g, " ");
        interpret.filters.model_name = MODEL_MAP_FALLBACK[key] || MODEL_MAP_FALLBACK[key.replace(/\s/g, "")] || origModelMatch[1];
        console.log(`${logPrefix} [SKILLS-v2] Model detected from originalQuestion fallback: ${interpret.filters.model_name}`);
      }
    }

    // Direct crisis detection (independent from interpretQueryEdge)
    const questionLower = question
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const crisisKeywords = ["crisis", "alerta", "alertas", "riesgo", "peligro", "caida", "hundimiento", "peor", "peores", "problemas", "en peligro", "desplome", "colapso", "en crisis"];
    const hasDirectCrisisKeywords = crisisKeywords.some((kw) => questionLower.includes(kw));

    if (interpret.intent === "general_question" && interpret.confidence < 0.4 && !hasDirectCrisisKeywords) {
      console.log(`${logPrefix} [SKILLS-v2] Low confidence (${interpret.confidence}), skipping`);
      return null;
    }

    // Resolve ticker: prefer semanticBridge detected companies, then legacy detection
    let resolvedTicker: string | null = null;
    let resolvedName: string | null = null;

    // Priority 1: semanticBridge dynamic detection (handles DIA, ACS, etc. with disambiguation)
    if (bridge.detected_companies.length > 0) {
      resolvedTicker = bridge.detected_companies[0].ticker;
      resolvedName = bridge.detected_companies[0].issuer_name;
      console.log(`${logPrefix} [SKILLS-v2] Resolved via semanticBridge: ${resolvedName} (${resolvedTicker})`);
    }

    // Priority 2: legacy detectCompaniesInQuestion
    // PHASE 3 FIX: Skip fuzzy company matching when a semantic group has been resolved
    // (prevents "grupos hospitalarios" from fuzzy-matching "Grupo Azvi")
    const semanticGroupPending = await resolveSemanticGroup(originalQuestion || question, supabaseClient);
    const hasSemanticGroupMatch = semanticGroupPending.canonical_key != null;
    
    if (!resolvedTicker && !hasSemanticGroupMatch && companiesCacheLocal && companiesCacheLocal.length > 0) {
      const detected = detectCompaniesInQuestion(question, companiesCacheLocal);
      if (detected.length > 0) {
        resolvedTicker = detected[0].ticker;
        resolvedName = detected[0].issuer_name;
        console.log(`${logPrefix} [SKILLS-v2] Resolved via legacy: ${resolvedName} (${resolvedTicker})`);
      }
      if (!resolvedTicker) {
        const qLower = question.toLowerCase();
        for (const entry of companiesCacheLocal) {
          const name = (entry.issuer_name || "").toLowerCase();
          const shortName = name.split(" ")[0];
          if (name && (qLower.includes(name) || (shortName.length >= 4 && qLower.includes(shortName)))) {
            resolvedTicker = entry.ticker;
            resolvedName = entry.issuer_name;
            console.log(`${logPrefix} [SKILLS-v2] Fuzzy resolved: ${resolvedName} (${resolvedTicker})`);
            break;
          }
        }
      }
    } else if (hasSemanticGroupMatch && !resolvedTicker) {
      console.log(`${logPrefix} [SKILLS-v2] Skipping fuzzy company match — semantic group "${semanticGroupPending.canonical_key}" resolved`);
    }

    const shouldRunCrisisScan = !resolvedTicker && (hasDirectCrisisKeywords || interpret.intent === "alert");
    console.log(`${logPrefix} [SKILLS-v2] crisis detection: direct=${hasDirectCrisisKeywords}, interpretAlert=${interpret.intent === "alert"}, resolvedTicker=${resolvedTicker || "none"}, shouldRun=${shouldRunCrisisScan}`);

    // ── Crisis scan: cross-company alert query (hardcoded, no GPT) ──
    let crisisScanEmpty = false;
    let crisisScanData: any[] | null = null;
    if (shouldRunCrisisScan) {
      console.log(`${logPrefix} [SKILLS-v2] Running crisis_scan (hardcoded query)...`);
      try {
        const { data: crisisRows, error: crisisErr } = await supabaseClient.rpc("execute_sql", {
          sql_query: `SELECT r."05_ticker", r."03_target_name", r."09_rix_score", r."35_cem_score", r."23_nvm_score", r.batch_execution_date, i.sector_category, i.ibex_family_code FROM rix_runs_v2 r JOIN repindex_root_issuers i ON r."05_ticker" = i.ticker WHERE r.batch_execution_date = (SELECT MAX(batch_execution_date) FROM rix_runs_v2) AND (r."35_cem_score" < 40 OR r."09_rix_score" < 40) ORDER BY r."09_rix_score" ASC LIMIT 30`,
        });
        if (crisisErr) {
          console.warn(`${logPrefix} [SKILLS-v2] crisis_scan query error: ${crisisErr.message}`);
        } else if (crisisRows && crisisRows.length > 0) {
          crisisScanData = crisisRows;
          console.log(`${logPrefix} [SKILLS-v2] crisis_scan found ${crisisRows.length} rows`);
        } else {
          crisisScanEmpty = true;
          console.log(`${logPrefix} [SKILLS-v2] crisis_scan: no companies in crisis`);
        }
      } catch (csErr: any) {
        console.warn(`${logPrefix} [SKILLS-v2] crisis_scan exception: ${csErr.message}`);
      }
    }

    // ── Semantic Groups: deterministic canonical group resolution ──
    // This MUST run before sector_category-based skill calls.
    // If a canonical group is resolved, it overrides sector_category with a closed ticker list.
    // PROBLEM 1 FIX: Try BOTH the normalized question AND the original user question
    let semanticGroup = await resolveSemanticGroup(question, supabaseClient);
    if (!semanticGroup.canonical_key && originalQuestion && originalQuestion !== question) {
      console.log(`${logPrefix} [SEMANTIC_GROUPS] No match on normalized question, retrying with originalQuestion: "${originalQuestion}"`);
      semanticGroup = await resolveSemanticGroup(originalQuestion, supabaseClient);
    }
    let resolvedGroupTickerFilter: string[] | null = null;
    if (semanticGroup.canonical_key) {
      // Apply exclusions: remove excluded tickers from group
      const exclusionSet = new Set(semanticGroup.exclusions || []);
      resolvedGroupTickerFilter = semanticGroup.issuer_ids.filter((t: string) => !exclusionSet.has(t));
      // ALWAYS override intent when canonical group is resolved, regardless of LLM classification
      interpret.intent = "sector_comparison";
      interpret.confidence = Math.max(interpret.confidence, 0.85);
      interpret.recommended_skills = ["skillGetSectorComparison", "skillGetCompanyRanking", "skillGetCompanyEvolution"];
      // Clear sector_category so downstream skills don't also do ILIKE matching
      delete interpret.filters.sector_category;
      console.log(`${logPrefix} [SEMANTIC_GROUPS] Resolved group "${semanticGroup.canonical_key}" (${semanticGroup.display_name}) -> ${resolvedGroupTickerFilter!.length} tickers: [${resolvedGroupTickerFilter!.join(", ")}]`);
      // Store in pack metadata for downstream
      (interpret.filters as any)._resolved_group = semanticGroup.canonical_key;
      (interpret.filters as any)._resolved_group_name = semanticGroup.display_name;
    }

    // ── Build skill options from temporal range and model filter ──
    const skillDateRange = temporalRange ? { from: temporalRange.from, to: temporalRange.to } : undefined;
    const skillModelFilter = interpret.filters.model_name || undefined;

    // ── Execute NEW consolidated skills in parallel ──────────────
    const skillCalls: Record<string, Promise<any>> = {};

    // Company profile: always when we have a ticker
    if (resolvedTicker) {
      skillCalls.companyProfile = skillCompanyProfile(supabaseClient, resolvedTicker, { dateRange: skillDateRange });
      skillCalls.detail = executeSkillGetCompanyDetail(supabaseClient, { ticker: resolvedTicker });
    }

    // Sector snapshot: when sector detected, ranking intent, canonical group, or IBEX ranking
    const sectorCategory = interpret.filters.sector_category;
    const sectorOptions = { modelFilter: skillModelFilter, dateRange: skillDateRange };
    if (resolvedGroupTickerFilter) {
      // Use canonical group tickers — bypass sector_category entirely
      skillCalls.sectorSnapshot = skillSectorSnapshot(supabaseClient, semanticGroup.display_name || semanticGroup.canonical_key!, resolvedGroupTickerFilter, sectorOptions);
    } else if (sectorCategory) {
      skillCalls.sectorSnapshot = skillSectorSnapshot(supabaseClient, sectorCategory, undefined, sectorOptions);
    } else if (interpret.filters.ibex_family_code && (interpret.intent === "ranking" || interpret.intent === "sector_comparison")) {
      // IBEX ranking/comparison: resolve tickers from ibex_family_code and call sectorSnapshot
      // This ensures per-model detail is available for cross-model tables
      const ibexCode = interpret.filters.ibex_family_code;
      const { data: ibexIssuers } = await supabaseClient.from("repindex_root_issuers").select("ticker").eq("ibex_family_code", ibexCode).limit(200);
      if (ibexIssuers && ibexIssuers.length > 0) {
        const ibexTickers = ibexIssuers.map((r: any) => r.ticker);
        skillCalls.sectorSnapshot = skillSectorSnapshot(supabaseClient, `IBEX (${ibexCode})`, ibexTickers, sectorOptions);
        console.log(`${logPrefix} [SKILLS-v2] IBEX sectorSnapshot triggered for ${ibexCode}: ${ibexTickers.length} tickers`);
      }
    }

    // Ranking: IBEX filter, sector filter, canonical group, or general ranking intent
    if (interpret.intent === "ranking" || interpret.filters.ibex_family_code || resolvedGroupTickerFilter) {
      skillCalls.ranking = executeSkillGetCompanyRanking(supabaseClient, {
        ibex_family_code: interpret.filters.ibex_family_code,
        sector_category: resolvedGroupTickerFilter ? undefined : sectorCategory,
        ticker_filter: resolvedGroupTickerFilter || undefined,
        model_name: interpret.filters.model_name,
      });
    }

    // For alert/crisis cross-company queries with crisis data, we don't need other skills
    if (shouldRunCrisisScan && (crisisScanData || crisisScanEmpty)) {
      // Build a minimal pack directly
      const alertPack: DataPack & { crisis_scan_empty?: boolean; crisis_batch_date?: string } = {
        snapshot: [], sector_avg: null, ranking: [], evolucion: [], divergencia: null,
        memento: null, noticias: [], raw_texts: [], empresa_primaria: null,
        competidores_verificados: [], competidores_metricas_avg: null,
        explicaciones_metricas: [], puntos_clave: [], categorias_metricas: [], mercado: null,
      };
      if (crisisScanData && crisisScanData.length > 0) {
        // Deduplicate by ticker using worst RIX per company
        const byTicker = new Map<string, any>();
        for (const row of crisisScanData) {
          const t = row["05_ticker"];
          if (!byTicker.has(t) || (row["09_rix_score"] ?? 100) < (byTicker.get(t)["09_rix_score"] ?? 100)) {
            byTicker.set(t, row);
          }
        }
        alertPack.ranking = Array.from(byTicker.values()).map((r: any, i: number) => ({
          pos: i + 1,
          ticker: r["05_ticker"],
          nombre: r["03_target_name"],
          rix_avg: r["09_rix_score"],
          cem: r["35_cem_score"],
          nvm: r["23_nvm_score"],
          sector: r.sector_category,
        }));
        alertPack.crisis_batch_date = crisisScanData[0]?.batch_execution_date
          ? String(crisisScanData[0].batch_execution_date).slice(0, 10)
          : null;
      } else {
        alertPack.crisis_scan_empty = true;
        // Fetch batch date for the positive message
        try {
          const { data: maxDateRows } = await supabaseClient.rpc("execute_sql", {
            sql_query: `SELECT MAX(batch_execution_date)::text as max_date FROM rix_runs_v2`,
          });
          alertPack.crisis_batch_date = maxDateRows?.[0]?.max_date?.slice(0, 10) || null;
        } catch (_e) { /* ignore */ }
      }
      console.log(`${logPrefix} [SKILLS-v2] crisis_scan pack built: ranking=${alertPack.ranking.length}, empty=${alertPack.crisis_scan_empty}`);
      return alertPack as any;
    }

    if (Object.keys(skillCalls).length === 0) {
      console.log(`${logPrefix} [SKILLS-v2] No skill calls to make`);
      return null;
    }

    // Execute all in parallel
    const keys = Object.keys(skillCalls);
    const results = await Promise.allSettled(Object.values(skillCalls));
    const resultMap: Record<string, any> = {};
    for (let i = 0; i < keys.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value?.success) {
        resultMap[keys[i]] = r.value.data;
      } else {
        const err = r.status === "rejected" ? r.reason : r.value?.error;
        console.warn(`${logPrefix} [SKILLS-v2] ${keys[i]} failed: ${err}`);
      }
    }
    console.log(`${logPrefix} [SKILLS-v2] Completed: ${Object.keys(resultMap).join(",")} in ${Date.now() - totalStart}ms`);

    // ── Temporal filtering: if user requested a specific date range, filter raw data ──
    if (temporalRange) {
      const tFrom = temporalRange.from;
      const tTo = temporalRange.to;
      const isInRange = (row: any) => {
        const periodFrom = String(row["06_period_from"] || row.period_from || row.batch_execution_date || "").slice(0, 10);
        const periodTo = String(row["07_period_to"] || row.period_to || periodFrom).slice(0, 10);
        if (!periodFrom) return true; // keep rows without dates
        return periodTo >= tFrom && periodFrom <= tTo;
      };

      // Filter companyProfile raw_runs
      if (resultMap.companyProfile?.raw_runs) {
        const before = resultMap.companyProfile.raw_runs.length;
        resultMap.companyProfile.raw_runs = resultMap.companyProfile.raw_runs.filter(isInRange);
        console.log(`${logPrefix} [TEMPORAL] Filtered companyProfile raw_runs: ${before} -> ${resultMap.companyProfile.raw_runs.length}`);
      }

      // Filter sectorSnapshot per_model_detail and ranking scores
      if (resultMap.sectorSnapshot?.per_model_detail) {
        const before = resultMap.sectorSnapshot.per_model_detail.length;
        resultMap.sectorSnapshot.per_model_detail = resultMap.sectorSnapshot.per_model_detail.filter(isInRange);
        console.log(`${logPrefix} [TEMPORAL] Filtered sectorSnapshot per_model_detail: ${before} -> ${resultMap.sectorSnapshot.per_model_detail.length}`);
      }

      // Filter ranking enrichment data if present
      if (resultMap.ranking && Array.isArray(resultMap.ranking)) {
        // ranking rows themselves don't have dates, but enrichment data does
      }
    }

    let competidoresDirectos: Array<{ticker: string, issuer_name: string, median_rix: number | null}> = [];
    let competidoresSinDatos: string[] = [];
    let competidoresNota: string | undefined;
    let competitorSource: "verified" | "none" = "none";
    if (resolvedTicker) {
      const compInfo = await getCompetitorTickers(supabaseClient, resolvedTicker, logPrefix);
      competitorSource = compInfo.source;
      if (compInfo.tickers.length > 0) {
        console.log(`${logPrefix} [SKILLS-v2] Fetching competitor profiles (source: verified): ${compInfo.tickers.join(",")}`);
        const compPromises = compInfo.tickers.map((t: string) => skillCompanyProfile(supabaseClient, t, { dateRange: skillDateRange }));
        const compResults = await Promise.allSettled(compPromises);
        for (let ci = 0; ci < compInfo.tickers.length; ci++) {
          const cr = compResults[ci];
          if (cr.status === "fulfilled" && cr.value?.success && cr.value.data) {
            const cd = cr.value.data;
            competidoresDirectos.push({ ticker: cd.ticker, issuer_name: cd.empresa, median_rix: cd.rix_mediano });
          } else {
            // Track competitors without RIX data — don't silently drop them
            competidoresSinDatos.push(compInfo.tickers[ci]);
          }
        }
        console.log(`${logPrefix} [SKILLS-v2] Competitors resolved: ${competidoresDirectos.length}/${compInfo.tickers.length}, without data: ${competidoresSinDatos.length}`);
      } else {
        competidoresNota = "No se han definido competidores directos para esta empresa";
      }
    }

    // ── Build DataPack from consolidated results ─────────────────
    const pack: DataPack & { divergencias_detalle?: any[]; competidores_directos?: any[]; competidores_sin_datos?: string[]; competidores_nota?: string; competidores_fuente?: string } = {
      snapshot: [], sector_avg: null, ranking: [], evolucion: [], divergencia: null,
      memento: null, noticias: [], raw_texts: [], empresa_primaria: null,
      competidores_verificados: [], competidores_metricas_avg: null,
      explicaciones_metricas: [], puntos_clave: [], categorias_metricas: [], mercado: null,
      competidores_directos: competidoresDirectos,
      competidores_sin_datos: competidoresSinDatos,
      competidores_nota: competidoresNota,
      competidores_fuente: competitorSource,
    };

    // ── Map companyProfile → snapshot, evolucion, raw_texts, divergencia ──
    const cp = resultMap.companyProfile;
    if (cp) {
      pack.empresa_primaria = { ticker: cp.ticker, nombre: cp.empresa, sector: null, subsector: null };

      // snapshot: per-model detail from latest week (with all metric scores)
      pack.snapshot = (cp.modelos || []).map((m: any) => ({
        modelo: m.model_name, rix: m.rix_score, rix_adj: null,
        nvm: m.nvm, drm: m.drm, sim: m.sim, rmm: m.rmm,
        cem: m.cem, gam: m.gam, dcm: m.dcm, cxm: m.cxm,
        resumen: m.resumen, flags: m.flags, puntos_clave: m.puntos_clave,
        nvm_cat: m.nvm_cat, drm_cat: m.drm_cat, sim_cat: m.sim_cat,
        rmm_cat: m.rmm_cat, cem_cat: m.cem_cat, gam_cat: m.gam_cat,
        dcm_cat: m.dcm_cat, cxm_cat: m.cxm_cat, precio: m.precio_accion,
        period_from: m.period_from, period_to: m.period_to || cp.semana_actual,
      }));

      // raw_texts from modelos
      pack.raw_texts = (cp.modelos || []).map((m: any) => ({
        modelo: m.nombre,
        texto: m.resumen || "",
      }));

      // puntos_clave from modelos
      pack.puntos_clave = (cp.modelos || [])
        .filter((m: any) => m.puntos_clave)
        .map((m: any) => {
          const puntos = Array.isArray(m.puntos_clave) ? m.puntos_clave : typeof m.puntos_clave === "string" ? [m.puntos_clave] : [];
          return { modelo: m.nombre, puntos };
        });

      // evolucion from consolidated weekly medians
      pack.evolucion = (cp.evolucion || []).map((e: any, i: number, arr: any[]) => ({
        fecha: e.semana,
        rix_avg: e.rix_mediano,
        modelos: 6,
        delta: i > 0 ? Math.round((e.rix_mediano - arr[i - 1].rix_mediano) * 10) / 10 : null,
      }));

      // delta_rix
      if (cp.evolucion && cp.evolucion.length >= 2) {
        const last = cp.evolucion[cp.evolucion.length - 1];
        const prev = cp.evolucion[cp.evolucion.length - 2];
        (pack as any).delta_rix = { current: last.rix_mediano, previous: prev.rix_mediano, delta: Math.round((last.rix_mediano - prev.rix_mediano) * 10) / 10 };
      }

      // divergencia: compute from per-model RIX scores
      const rixScores = (cp.modelos || []).map((m: any) => m.rix_score).filter((v: any) => v != null) as number[];
      if (rixScores.length >= 2) {
        const maxRix = Math.max(...rixScores);
        const minRix = Math.min(...rixScores);
        const range = maxRix - minRix;
        const maxModel = cp.modelos.find((m: any) => m.rix_score === maxRix)?.model_name || "";
        const minModel = cp.modelos.find((m: any) => m.rix_score === minRix)?.model_name || "";
        pack.divergencia = {
          sigma: Math.round(range / 2),
          nivel: range <= 5 ? "alto" : range <= 12 ? "medio" : "bajo",
          modelo_alto: maxModel,
          modelo_bajo: minModel,
          rango: range,
        };
      }

      // Pass consolidated metrics (medianas) and flags as extra fields
      (pack as any).metricas_consolidadas = cp.medianas_por_metrica;
      (pack as any).flags_dominantes = cp.flags_dominantes;
      (pack as any).rix_mediano = cp.rix_mediano;
      (pack as any).delta_rix_value = cp.delta_rix;
      (pack as any).precio_accion = cp.modelos?.[0]?.precio_accion || null;

      // Pass ALL raw_runs (24 rows, 6 models × 4 weeks) for full granularity
      if (cp.raw_runs) {
        (pack as any)._rawRunsForSources = cp.raw_runs;
        (pack as any).raw_runs_completos = cp.raw_runs;
      }
    }

    // ── Map detail → memento, sector info ────────────────────────
    if (resultMap.detail) {
      const d = resultMap.detail;
      if (pack.empresa_primaria) {
        pack.empresa_primaria.sector = d.sector_category;
        pack.empresa_primaria.subsector = d.subsector;
      } else {
        pack.empresa_primaria = { ticker: d.ticker, nombre: d.issuer_name, sector: d.sector_category, subsector: d.subsector };
      }
      if (d.corporate) {
        pack.memento = {
          ceo: d.corporate.ceo_name, presidente: null, chairman: null,
          sede: d.corporate.headquarters_city ? `${d.corporate.headquarters_city}, ${d.corporate.headquarters_country || ""}` : null,
          descripcion: d.corporate.company_description, fecha: null,
          empleados: d.corporate.employees_approx, fundacion: d.corporate.founded_year,
          ingresos: d.corporate.last_reported_revenue, ejercicio_fiscal: null, mision: null, otros_ejecutivos: null,
        };
      }
      if (competidoresDirectos && competidoresDirectos.length > 0) {
        pack.competidores_verificados = competidoresDirectos.map((cd: any) => ({
          ticker: cd.ticker,
          nombre: cd.issuer_name || cd.ticker,
          rix_avg: cd.median_rix ?? null,
        }));
      } else if (d.verified_competitors && Array.isArray(d.verified_competitors) && d.verified_competitors.length > 0) {
        // Fallback: query rix_runs_v2 for each competitor
        const compWithRix = [];
        for (const t of d.verified_competitors) {
          const comp = (companiesCacheLocal || []).find((c: any) => c.ticker === t);
          const { data: compRows } = await supabaseClient
            .from('rix_runs_v2')
            .select('"09_rix_score"')
            .eq('05_ticker', t)
            .not('09_rix_score', 'is', null)
            .order('batch_execution_date', { ascending: false })
            .limit(6);
          let rixMedian = null;
          if (compRows && compRows.length > 0) {
            const scores = compRows.map((r: any) => r["09_rix_score"]).filter((v: any) => v != null).sort((a: number, b: number) => a - b);
            if (scores.length > 0) {
              const mid = Math.floor(scores.length / 2);
              rixMedian = scores.length % 2 ? scores[mid] : Math.round((scores[mid - 1] + scores[mid]) / 2);
            }
          }
          compWithRix.push({ ticker: t, nombre: comp?.issuer_name || t, rix_avg: rixMedian });
        }
        pack.competidores_verificados = compWithRix;
      } else {
        pack.competidores_verificados = [];
      }
    }

    // ── Map sectorSnapshot → ranking + snapshot/raw_texts when no companyProfile ─
    const ss = resultMap.sectorSnapshot;
    if (ss) {
      pack.ranking = (ss.ranking || []).map((r: any) => ({
        pos: r.pos, ticker: r.ticker, nombre: r.empresa, rix_avg: r.rix_mediano,
        rix_min: r.rix_min, rix_max: r.rix_max, rango: r.rango,
        consenso: r.consenso, bloque_mayoritario: r.bloque_mayoritario,
        outliers: r.outliers, scores_individuales: r.scores_individuales,
      }));
      (pack as any).sector_snapshot = ss;

      // When there's NO companyProfile (sector-only query), fill snapshot + raw_texts
      // from the sector leader's per_model_detail so E3/E4 don't skip
      if (!cp && ss.per_model_detail && ss.per_model_detail.length > 0) {
        const leaderTicker = ss.lider?.ticker || ss.ranking?.[0]?.ticker;

        if (leaderTicker) {
          const leaderModels = ss.per_model_detail.filter((r: any) => r.ticker === leaderTicker);

          // Fill snapshot with leader's per-model detail
          pack.snapshot = leaderModels.map((m: any) => ({
            modelo: m.modelo || m.model_name,
            rix: m.rix,
            rix_adj: null,
            nvm: m.nvm,
            drm: m.drm,
            sim: m.sim,
            rmm: m.rmm,
            cem: m.cem,
            gam: m.gam,
            dcm: m.dcm,
            cxm: m.cxm,
            resumen: m.resumen,
            flags: m.flags,
            puntos_clave: m.puntos_clave,
            period_from: m.period_from,
            period_to: m.period_to,
          }));

          // Fill raw_texts from leader models
          pack.raw_texts = leaderModels.map((m: any) => ({
            modelo: m.modelo || m.model_name,
            texto: m.resumen || "",
          }));

          // Fill empresa_primaria from sector leader
          const leaderRanking = (ss.ranking || []).find((r: any) => r.ticker === leaderTicker);
          pack.empresa_primaria = {
            ticker: leaderTicker,
            nombre: leaderRanking?.empresa || ss.lider?.empresa || leaderTicker,
            sector: ss.sector,
            subsector: null,
          };

          (pack as any).rix_mediano = leaderRanking?.rix_mediano ?? ss.lider?.rix ?? ss.mediana_sectorial;
          (pack as any).metricas_consolidadas = ss.metricas_sector;

          // Populate _rawRunsForSources from per_model_detail (contains 20_res_gpt_bruto, 21_res_perplex_bruto)
          // so extractSourcesFromRixData can find bibliography URLs for sector queries
          (pack as any)._rawRunsForSources = ss.per_model_detail;
        }

        // Fill evolucion from evolucion_sector for leader
        if (Array.isArray(ss.evolucion_sector) && leaderTicker) {
          const leaderEvo = ss.evolucion_sector
            .filter((e: any) => e.ticker === leaderTicker)
            .sort((a: any, b: any) => String(a.fecha).localeCompare(String(b.fecha)));

          if (leaderEvo.length > 0) {
            pack.evolucion = leaderEvo.map((e: any, i: number, arr: any[]) => ({
              fecha: e.fecha,
              rix_avg: e.rix_mediano,
              modelos: 6,
              delta: i > 0 ? Math.round((e.rix_mediano - arr[i - 1].rix_mediano) * 10) / 10 : null,
            }));
          }
          (pack as any).evolucion_sector = ss.evolucion_sector;
        }
      }

      pack.sector_avg = ss.mediana_sectorial || null;

      // PHASE 4: Inject canonical KPIs as explicit sector medians
      if (ss.metricas_sector) {
        (pack as any).kpis_sector_canonicos = {
          nota: "Medianas sectoriales calculadas sobre todos los modelos y empresas del grupo/sector en la última semana",
          ...ss.metricas_sector,
        };
      }

      // ── Build competidores_por_empresa from ranking verified_competitors ──
      const competidoresPorEmpresa: Record<string, string[]> = {};
      for (const r of (ss.ranking || [])) {
        if (r.verified_competitors && Array.isArray(r.verified_competitors) && r.verified_competitors.length > 0) {
          competidoresPorEmpresa[r.ticker] = r.verified_competitors;
        }
      }
      (pack as any).competidores_por_empresa = competidoresPorEmpresa;

      // ── Build divergencias_detalle from per_model_detail ──
      if (ss.per_model_detail && ss.per_model_detail.length > 0) {
        const METRIC_KEYS = [
          { key: "rix", label: "RIX" },
          { key: "nvm", label: "Calidad Narrativa (NVM)" },
          { key: "drm", label: "Fortaleza Evidencia (DRM)" },
          { key: "sim", label: "Autoridad Fuentes (SIM)" },
          { key: "rmm", label: "Actualidad y Empuje (RMM)" },
          { key: "cem", label: "Gestión Controversias (CEM)" },
          { key: "gam", label: "Percepción Gobernanza (GAM)" },
          { key: "dcm", label: "Coherencia Informativa (DCM)" },
          { key: "cxm", label: "Ejecución Corporativa (CXM)" },
        ];
        // Group per_model_detail by ticker
        const byTicker = new Map<string, any[]>();
        for (const row of ss.per_model_detail) {
          const t = row.ticker || "";
          if (!byTicker.has(t)) byTicker.set(t, []);
          byTicker.get(t)!.push(row);
        }
        const divergencias: any[] = [];
        for (const [ticker, rows] of byTicker.entries()) {
          for (const mk of METRIC_KEYS) {
            const vals = rows.map((r: any) => ({ model: r.modelo || r.model_name, value: r[mk.key] })).filter((v: any) => v.value != null);
            if (vals.length < 2) continue;
            const maxEntry = vals.reduce((a: any, b: any) => b.value > a.value ? b : a);
            const minEntry = vals.reduce((a: any, b: any) => b.value < a.value ? b : a);
            const range = maxEntry.value - minEntry.value;
            if (range > 0) {
              divergencias.push({
                ticker,
                metric: mk.label,
                max_model: maxEntry.model,
                max_value: maxEntry.value,
                min_model: minEntry.model,
                min_value: minEntry.value,
                range,
                consensus: range <= 5 ? "alto" : range <= 12 ? "medio" : "bajo",
              });
            }
          }
        }
        (pack as any).divergencias_detalle = divergencias;

        // Also set pack.divergencia from the leader's RIX range
        const leaderTicker2 = ss.lider?.ticker || ss.ranking?.[0]?.ticker;
        if (leaderTicker2) {
          const leaderDivs = divergencias.filter((d: any) => d.ticker === leaderTicker2 && d.metric === "RIX");
          if (leaderDivs.length > 0) {
            const ld = leaderDivs[0];
            pack.divergencia = {
              sigma: Math.round(ld.range / 2),
              nivel: ld.consensus === "alto" ? "alto" : ld.consensus === "medio" ? "medio" : "bajo",
              modelo_alto: ld.max_model,
              modelo_bajo: ld.min_model,
              rango: ld.range,
            };
          }
        }
      }
    }

    // ── Map IBEX ranking fallback + ENRICHMENT ────────────────────
    if (resultMap.ranking && !ss) {
      const rankingData = resultMap.ranking.ranking || [];
      pack.ranking = rankingData.map((r: any, i: number) => ({
        pos: i + 1, ticker: r.ticker, nombre: r.company, rix_avg: r.median_rix,
        min_rix: r.min_rix, max_rix: r.max_rix, range: r.range,
        consensus_level: r.consensus_level,
        scores_by_model: r.scores_by_model,
        // Include consensus fields from ranking skill
        majority_block_score: r.majority_block_score,
        majority_block_models: r.majority_block_models,
        scores_individuales: r.scores_individuales,
        consenso: r.consensus_level === "alto" ? "alto" : r.consensus_level === "medio" ? "medio" : "bajo",
        bloque_mayoritario: r.majority_block_score ? { score: r.majority_block_score, modelos: r.majority_block_models || [] } : undefined,
        outliers: r.scores_by_model ? r.scores_by_model
          .filter((s: any) => s.rix_score != null && r.majority_block_models && !r.majority_block_models.includes(s.model))
          .map((s: any) => ({ model: s.model, rix: s.rix_score })) : [],
      }));

      // ── Ranking Enrichment: fetch full metrics for top/bottom companies ──
      // When there's no companyProfile, snapshot is empty → metrics show as N/A
      // Fix: fetch 8 metrics + resumen + puntos_clave for the requested companies
      if (!cp && pack.snapshot.length === 0 && rankingData.length > 0) {
        const topN = parseInt(interpret.filters.top_n || "5", 10);
        const bottomN = parseInt(interpret.filters.bottom_n || "0", 10);
        const topTickers = rankingData.slice(0, topN).map((r: any) => r.ticker);
        const bottomTickers = bottomN > 0 ? rankingData.slice(-bottomN).map((r: any) => r.ticker) : [];
        const enrichTickers = [...new Set([...topTickers, ...bottomTickers])];

        console.log(`${logPrefix} [SKILLS-v2] Ranking enrichment: fetching metrics for ${enrichTickers.length} companies (top=${topN}, bottom=${bottomN})`);

        try {
          // Use skillDateRange if available (multi-week queries), fallback to single batch date
          let eGte: string, eLt: string;
          if (skillDateRange) {
            eGte = skillDateRange.from + "T00:00:00Z";
            eLt = skillDateRange.to + "T23:59:59Z";
          } else {
            const batchDate = resultMap.ranking.batch_date;
            const df = buildDateFilterEdge(batchDate);
            eGte = df.gte; eLt = df.lt;
          }
          const modelFilter = interpret.filters.model_name || null;

          let enrichData: any[] = [];
          for (let page = 0; page < 4; page++) {
            let eq = supabaseClient.from("rix_runs_v2")
              .select("02_model_name,03_target_name,05_ticker,09_rix_score,23_nvm_score,26_drm_score,29_sim_score,32_rmm_score,35_cem_score,38_gam_score,41_dcm_score,44_cxm_score,10_resumen,11_puntos_clave,17_flags,06_period_from,07_period_to,batch_execution_date,25_nvm_categoria,28_drm_categoria,31_sim_categoria,34_rmm_categoria,37_cem_categoria,40_gam_categoria,43_dcm_categoria,46_cxm_categoria")
              .gte("batch_execution_date", eGte).lte("batch_execution_date", eLt)
              .in("05_ticker", enrichTickers)
              .range(page * 1000, (page + 1) * 1000 - 1);
            if (modelFilter) eq = eq.eq("02_model_name", modelFilter);
            const { data: eRows, error: eErr } = await eq;
            if (eErr) { console.warn(`${logPrefix} [SKILLS-v2] Enrichment query error: ${eErr.message}`); break; }
            if (!eRows || eRows.length === 0) break;
            enrichData = enrichData.concat(eRows);
            if (eRows.length < 1000) break;
          }

          console.log(`${logPrefix} [SKILLS-v2] Enrichment fetched ${enrichData.length} rows for ${enrichTickers.length} companies`);

          if (enrichData.length > 0) {
            // Build snapshot from enrichment data (per-model detail for top companies)
            // Group by ticker for structured output
            const byTicker = new Map<string, any[]>();
            for (const row of enrichData) {
              const t = row["05_ticker"] || "";
              if (!byTicker.has(t)) byTicker.set(t, []);
              byTicker.get(t)!.push(row);
            }

            // Build snapshot array from ALL enriched companies' models
            const allModels: any[] = [];
            for (const [ticker, rows] of byTicker.entries()) {
              for (const m of rows) {
                allModels.push({
                  ticker,
                  empresa: m["03_target_name"] || ticker,
                  modelo: m["02_model_name"] || "",
                  rix: m["09_rix_score"],
                  nvm: m["23_nvm_score"], drm: m["26_drm_score"], sim: m["29_sim_score"],
                  rmm: m["32_rmm_score"], cem: m["35_cem_score"], gam: m["38_gam_score"],
                  dcm: m["41_dcm_score"], cxm: m["44_cxm_score"],
                  resumen: m["10_resumen"], puntos_clave: m["11_puntos_clave"],
                  flags: m["17_flags"],
                  period_from: m["06_period_from"], period_to: m["07_period_to"],
                  nvm_cat: m["25_nvm_categoria"], drm_cat: m["28_drm_categoria"],
                  sim_cat: m["31_sim_categoria"], rmm_cat: m["34_rmm_categoria"],
                  cem_cat: m["37_cem_categoria"], gam_cat: m["40_gam_categoria"],
                  dcm_cat: m["43_dcm_categoria"], cxm_cat: m["46_cxm_categoria"],
                });
              }
            }
            pack.snapshot = allModels;

            // Build raw_texts
            pack.raw_texts = allModels.filter((m: any) => m.resumen).map((m: any) => ({
              modelo: m.modelo, texto: m.resumen || "", ticker: m.ticker,
            }));

            // Build puntos_clave
            pack.puntos_clave = allModels.filter((m: any) => m.puntos_clave).map((m: any) => ({
              modelo: m.modelo, puntos: Array.isArray(m.puntos_clave) ? m.puntos_clave : [m.puntos_clave],
              ticker: m.ticker,
            }));

            // Build metricas_consolidadas per ticker
            const metricasConsolidadas: Record<string, any> = {};
            for (const [ticker, rows] of byTicker.entries()) {
              const metrics = ["nvm", "drm", "sim", "rmm", "cem", "gam", "dcm", "cxm"];
              const consolidated: Record<string, any> = {};
              for (const mk of metrics) {
                const colMap: Record<string, string> = { nvm: "23_nvm_score", drm: "26_drm_score", sim: "29_sim_score", rmm: "32_rmm_score", cem: "35_cem_score", gam: "38_gam_score", dcm: "41_dcm_score", cxm: "44_cxm_score" };
                const vals = rows.map((r: any) => r[colMap[mk]]).filter((v: any) => v != null) as number[];
                if (vals.length > 0) {
                  vals.sort((a, b) => a - b);
                  const mid = Math.floor(vals.length / 2);
                  const median = vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
                  consolidated[mk] = { mediana: median, min: Math.min(...vals), max: Math.max(...vals), has_delta: false, delta: null };
                }
              }
              metricasConsolidadas[ticker] = consolidated;
            }
            (pack as any).metricas_consolidadas = metricasConsolidadas;
            (pack as any).ranking_enriched = true;

            // Set empresa_primaria from first top company for context
            if (topTickers.length > 0 && byTicker.has(topTickers[0])) {
              const firstRows = byTicker.get(topTickers[0])!;
              pack.empresa_primaria = {
                ticker: topTickers[0],
                nombre: firstRows[0]["03_target_name"] || topTickers[0],
                sector: null, subsector: null,
              };
            }

            // Store enrichment data as raw_runs for source extraction
            (pack as any)._rawRunsForSources = enrichData;

            // Populate date range from enrichment
            const periodsFrom = enrichData.map((r: any) => r["06_period_from"]).filter(Boolean).sort();
            const periodsTo = enrichData.map((r: any) => r["07_period_to"]).filter(Boolean).sort();
            (pack as any)._enrichment_date_from = periodsFrom.length > 0 ? periodsFrom[0] : null;
            (pack as any)._enrichment_date_to = periodsTo.length > 0 ? periodsTo[periodsTo.length - 1] : null;
            (pack as any)._enrichment_sample_size = enrichData.length;
          }
        } catch (enrichErr: any) {
          console.warn(`${logPrefix} [SKILLS-v2] Ranking enrichment failed: ${enrichErr.message}`);
        }
      }

      // ── Separate ranking_top and ranking_bottom for prompt ──
      if (interpret.filters.bottom_n) {
        const bottomN = parseInt(interpret.filters.bottom_n, 10);
        (pack as any).ranking_bottom = pack.ranking.slice(-bottomN).reverse().map((r: any, i: number) => ({ ...r, pos_bottom: i + 1 }));
      }
      if (interpret.filters.top_n) {
        const topN = parseInt(interpret.filters.top_n, 10);
        (pack as any).ranking_top = pack.ranking.slice(0, topN);
      }
    }

    // Attach semantic bridge results for downstream prompt emphasis
    if (bridge.detected_metrics.length > 0) {
      (pack as any).metricas_enfatizar = bridge.detected_metrics;
    }

    // ── Build report_context for InfoBar ─────────────────────────
    const filterByModel = interpret.filters.model_name || null;
    const reportContext: Record<string, unknown> = {
      company: resolvedTicker ? (cp?.empresa || resolvedName || resolvedTicker) : null,
      sector: interpret.filters.sector_category || (cp ? resultMap.detail?.sector_category : ss?.sector) || null,
      user_question: question || null,
      perspective: null, // Will be set downstream by handleStandardChat
      date_from: null,
      date_to: null,
      timezone: "Europe/Madrid (CET/CEST)",
      models: filterByModel ? [filterByModel] : ["ChatGPT", "Perplexity", "Google Gemini", "DeepSeek", "Grok", "Qwen"],
      sample_size: 0,
      models_count: filterByModel ? 1 : 6,
      weeks_analyzed: 0,
    };

    // Extract date range and sample size from companyProfile raw_runs
    if (cp?.raw_runs && Array.isArray(cp.raw_runs) && cp.raw_runs.length > 0) {
      const periodsFrom = cp.raw_runs.map((r: any) => r["06_period_from"]).filter(Boolean).sort();
      const periodsTo = cp.raw_runs.map((r: any) => r["07_period_to"]).filter(Boolean).sort();
      if (periodsFrom.length > 0) reportContext.date_from = periodsFrom[0];
      if (periodsTo.length > 0) reportContext.date_to = periodsTo[periodsTo.length - 1];
      reportContext.sample_size = cp.raw_runs.length;
      const uniqueWeeks = new Set(cp.raw_runs.map((r: any) => {
        const d = r.batch_execution_date || r["06_period_from"];
        return d ? String(d).slice(0, 10) : null;
      }).filter(Boolean));
      reportContext.weeks_analyzed = uniqueWeeks.size;
    }
    // Fallback: sectorSnapshot — use semanas_disponibles for real week count
    else if (ss) {
      // PHASE 2 FIX: Use actual weeks from sectorSnapshot, not just per_model_detail dates
      const weeksAvailable = ss.semanas_disponibles || [];
      const realWeekCount = weeksAvailable.length;
      const totalModelRows = ss.per_model_detail?.length || 0;
      const numEmpresas = ss.num_empresas || ss.ranking?.length || 0;
      
      if (weeksAvailable.length > 0) {
        reportContext.date_from = weeksAvailable[weeksAvailable.length - 1]; // oldest
        reportContext.date_to = weeksAvailable[0]; // newest
      } else if (ss.per_model_detail && Array.isArray(ss.per_model_detail) && ss.per_model_detail.length > 0) {
        const batchDates = ss.per_model_detail.map((r: any) => r.batch_execution_date || r.period_from).filter(Boolean).sort();
        if (batchDates.length > 0) {
          reportContext.date_from = batchDates[0];
          reportContext.date_to = batchDates[batchDates.length - 1];
        }
      }
      reportContext.sample_size = totalModelRows > 0 ? totalModelRows : (numEmpresas * (filterByModel ? 1 : 6) * Math.max(realWeekCount, 1));
      reportContext.weeks_analyzed = realWeekCount || 1;
      reportContext.num_empresas = numEmpresas;
      console.log(`${logPrefix} [REPORT_CTX] SectorSnapshot: ${realWeekCount} weeks, ${reportContext.sample_size} observations, ${numEmpresas} companies`);
    }
    // Fallback: enrichment data from ranking
    else if ((pack as any)._enrichment_date_from) {
      reportContext.date_from = (pack as any)._enrichment_date_from;
      reportContext.date_to = (pack as any)._enrichment_date_to;
      reportContext.sample_size = (pack as any)._enrichment_sample_size || 0;
      // Compute real weeks from enrichment data batch dates
      const enrichBatchDates = (pack as any)._rawRunsForSources 
        ? new Set(((pack as any)._rawRunsForSources as any[]).map((r: any) => String(r.batch_execution_date || "").slice(0, 10)).filter(Boolean))
        : new Set<string>();
      reportContext.weeks_analyzed = enrichBatchDates.size || 1;
    }

    // ── Temporal range: DO NOT override report_context dates with user-requested dates.
    // Since skills now query the actual date range, report_context.date_from/to already 
    // reflect the real data. We only add the temporal label as metadata. ──
    if (temporalRange) {
      reportContext.temporal_label = temporalRange.label;
      reportContext.temporal_requested_from = temporalRange.from;
      reportContext.temporal_requested_to = temporalRange.to;
      (pack as any).temporal_range = temporalRange;
      if (temporalRange.adjusted) {
        (pack as any).date_range_adjusted = true;
        (pack as any).date_range_note = `El usuario solicitó datos del "${temporalRange.label}", pero los datos completos de RepIndex están disponibles desde el 1 de enero de 2026. Se muestran los datos disponibles desde esa fecha.`;
      } else {
        (pack as any).date_range_note = `Datos filtrados para el período solicitado: ${temporalRange.label} (${temporalRange.from} a ${temporalRange.to}).`;
      }
      console.log(`${logPrefix} [TEMPORAL] Temporal range applied at skill level: ${temporalRange.from} - ${temporalRange.to}. report_context dates reflect actual data: ${reportContext.date_from} - ${reportContext.date_to}`);
    } else {
      // Data availability floor (only when no explicit temporal range)
      let dateRangeAdjusted = false;
      if (reportContext.date_from && String(reportContext.date_from).slice(0, 10) < DATA_AVAILABLE_FROM) {
        console.log(`${logPrefix} [DATE_FLOOR] date_from ${reportContext.date_from} is before ${DATA_AVAILABLE_FROM}, adjusting`);
        reportContext.date_from = DATA_AVAILABLE_FROM;
        dateRangeAdjusted = true;
      }
      if (dateRangeAdjusted) {
        (pack as any).date_range_adjusted = true;
        (pack as any).date_range_note = "Los datos completos de RepIndex están disponibles desde el 1 de enero de 2026, cuando comenzaron los barridos dominicales sistemáticos con las 6 IAs. Se muestran los datos disponibles desde esa fecha.";
      }
    }

    (pack as any).report_context = reportContext;

    return pack;
  } catch (e: any) {
    console.error(`${logPrefix} [SKILLS-v2] buildDataPackFromSkills failed: ${e.message || e}`);
    return null;
  }
}

// =============================================================================
// PIPELINE I18N — Static translation dictionary for all user-facing text
// =============================================================================
const PIPELINE_I18N: Record<string, Record<string, string>> = {
  es: {
    // Redirect responses
    agent_identity_answer: `Soy el **Agente Rix**, un analista especializado en reputación algorítmica corporativa.

Mi función es ayudarte a interpretar cómo los principales modelos de inteligencia artificial (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) perciben a las empresas españolas y su posicionamiento reputacional.

**Puedo hacer por ti:**
- 📊 Analizar métricas RIX de cualquier empresa
- 🏆 Comparar empresas con su competencia sectorial
- 📈 Detectar tendencias y evolución temporal
- 📋 Generar informes ejecutivos para comité de dirección

¿Sobre qué empresa o sector te gustaría que hiciéramos un análisis?`,
    personal_query_answer: `Mi especialidad es el análisis de reputación **corporativa**, no individual. Analizo cómo las IAs perciben a empresas como entidades, no a personas físicas.

Sin embargo, si estás vinculado a una empresa específica, puedo analizar cómo la percepción del liderazgo afecta a la reputación corporativa de esa organización.

**¿Te gustaría que analizara la reputación corporativa de alguna empresa en particular?**`,
    off_topic_answer: `Esa pregunta está fuera de mi especialización. Como Agente Rix, me centro exclusivamente en el **análisis de reputación algorítmica corporativa**.

**Lo que sí puedo ofrecerte:**
- 📊 Análisis de cualquier empresa del IBEX-35 o del ecosistema español
- 🏆 Comparativas sectoriales y benchmarking competitivo
- 📈 Detección de tendencias y alertas reputacionales
- 📋 Informes ejecutivos sobre la percepción en IAs

¿Hay alguna empresa o sector que te interese analizar?`,
    test_limits_answer: `Soy el Agente Rix, un analista de reputación corporativa. Mi función es ayudarte a entender cómo las IAs perciben a las empresas españolas.

¿En qué empresa o sector te gustaría que nos centráramos?`,
    // Suggested questions
    analyze_company: "Analiza la reputación de {company}",
    analyze_short: "Analiza {company}",
    top5_ibex: "Top 5 empresas del IBEX-35 esta semana",
    sector_comparison: "Comparativa del sector Banca",
    leadership_perception: "¿Cómo se percibe el liderazgo de {company}?",
    sector_reputation: "Reputación del sector Tecnología",
    energy_ranking: "Ranking del sector Energía",
    top10_week: "Top 10 empresas esta semana",
    telecom_comparison: "Comparativa sector Telecomunicaciones",
    // Bulletin
    bulletin_welcome: `¡Perfecto! 📋 Puedo generar un **boletín ejecutivo** completo para cualquier empresa de nuestra base de datos.

**¿De qué empresa quieres el boletín?**

Escribe el nombre de la empresa (por ejemplo: Telefónica, Inditex, Repsol, BBVA, Iberdrola...) y generaré un análisis detallado incluyendo:

- 📊 **RIX Score** por cada modelo de IA (ChatGPT, Perplexity, Gemini, DeepSeek)
- 🏆 **Comparativa** con competidores del mismo sector
- 📈 **Tendencia** de las últimas 4 semanas
- 💡 **Conclusiones** y recomendaciones

El boletín estará listo para **descargar o imprimir** en formato profesional.`,
    bulletin_suggest: "Genera un boletín de {company}",
    // Company not found
    company_not_found: `No encontré la empresa "{query}" en nuestra base de datos de RepIndex.

**Puedes intentar con:**
- El nombre oficial de la empresa (ej: "Telefónica" en vez de "Movistar")
- El ticker bursátil (ej: "TEF", "SAN", "ITX")

**Empresas disponibles incluyen:** {examples}`,
    // Post-bulletin suggestions
    bulletin_post_suggest: "Genera un boletín de {company}",
    bulletin_post_compare: "¿Cómo se compara {company} con el sector {sector}?",
    bulletin_post_top5: "Top 5 empresas del sector {sector}",
    // Pericial follow-ups
    pericial_q1: "¿Qué divergencias existen entre los modelos de IA en la evaluación de esta empresa?",
    pericial_q2: "¿Hay evolución temporal documentada que muestre deterioro reputacional antes y después de algún evento?",
    pericial_q3: "¿Qué métricas presentan mayor exposición a narrativas de riesgo con valor probatorio?",
    // Depth prompt section headers
    depth_format_title: "FORMATO: INFORME ANALÍTICO — Estructura anclada en datos SQL",
    depth_executive_summary: "RESUMEN EJECUTIVO",
    depth_section_data: "LOS DATOS",
    depth_section_analysis: "EL ANÁLISIS",
    depth_section_actions: "ACCIONES BASADAS EN DATOS",
    depth_closing: "CIERRE — FUENTES Y METODOLOGÍA",
    depth_headline_diagnosis: "Diagnóstico",
    depth_3kpis: "KPIs Principales con Delta",
    depth_3findings: "Hallazgos",
    depth_verdict: "Veredicto",
    depth_6ai_vision: "Visión de las 6 IAs",
    depth_8metrics: "Las 8 Métricas",
    depth_model_divergence: "Divergencia entre Modelos",
    depth_evolution: "Evolución Temporal",
    depth_competitive: "Contexto Competitivo",
    depth_recommendations: "Recomendaciones Estratégicas y Tácticas",
    // Fallback questions
    fallback_ceo_q1: "¿Cuáles son los 3 riesgos reputacionales más urgentes?",
    fallback_ceo_q2: "¿Cómo estamos vs la competencia directa?",
    fallback_ceo_q3: "¿Qué decisiones debería considerar?",
    fallback_journalist_q1: "¿Qué empresa tiene la historia más noticiable esta semana?",
    fallback_journalist_q2: "¿Hay alguna controversia emergente?",
    fallback_journalist_q3: "¿Qué titular propones para esta información?",
    fallback_analyst_q1: "¿Hay correlación entre RIX y cotización?",
    fallback_analyst_q2: "¿Qué señales técnicas detectas?",
    fallback_analyst_q3: "Comparativa detallada del sector",
    fallback_investor_q1: "¿Pasa esta empresa el filtro reputacional?",
    fallback_investor_q2: "¿Cuál es el nivel de riesgo ESG?",
    fallback_investor_q3: "¿Es buen momento para entrar?",
    fallback_default_q1: "¿Puedes profundizar más?",
    fallback_default_q2: "¿Cómo se compara con competidores?",
    fallback_default_q3: "¿Cuál es la tendencia?",
  },
  en: {
    agent_identity_answer: `I'm **Agent Rix**, an analyst specialized in corporate algorithmic reputation.

My role is to help you understand how the leading AI models (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) perceive Spanish companies and their reputational positioning.

**I can help you with:**
- 📊 Analyzing RIX metrics for any company
- 🏆 Comparing companies against their sector competitors
- 📈 Detecting trends and temporal evolution
- 📋 Generating executive reports for board meetings

Which company or sector would you like me to analyze?`,
    personal_query_answer: `My specialty is **corporate** reputation analysis, not individual. I analyze how AIs perceive companies as entities, not individuals.

However, if you're associated with a specific company, I can analyze how leadership perception affects that organization's corporate reputation.

**Would you like me to analyze the corporate reputation of a specific company?**`,
    off_topic_answer: `That question falls outside my area of expertise. As Agent Rix, I focus exclusively on **corporate algorithmic reputation analysis**.

**What I can offer you:**
- 📊 Analysis of any IBEX-35 company or the Spanish ecosystem
- 🏆 Sector comparisons and competitive benchmarking
- 📈 Trend detection and reputational alerts
- 📋 Executive reports on AI perception

Is there a company or sector you'd like me to analyze?`,
    test_limits_answer: `I'm Agent Rix, a corporate reputation analyst. My role is to help you understand how AIs perceive Spanish companies.

Which company or sector would you like to focus on?`,
    analyze_company: "Analyze {company}'s reputation",
    analyze_short: "Analyze {company}",
    top5_ibex: "Top 5 IBEX-35 companies this week",
    sector_comparison: "Banking sector comparison",
    leadership_perception: "How is {company}'s leadership perceived?",
    sector_reputation: "Technology sector reputation",
    energy_ranking: "Energy sector ranking",
    top10_week: "Top 10 companies this week",
    telecom_comparison: "Telecom sector comparison",
    bulletin_welcome: `Great! 📋 I can generate a complete **executive bulletin** for any company in our database.

**Which company do you want the bulletin for?**

Type the company name (e.g., Telefónica, Inditex, Repsol, BBVA, Iberdrola...) and I'll generate a detailed analysis including:

- 📊 **RIX Score** for each AI model (ChatGPT, Perplexity, Gemini, DeepSeek)
- 🏆 **Comparison** with sector competitors
- 📈 **Trend** over the last 4 weeks
- 💡 **Conclusions** and recommendations

The bulletin will be ready to **download or print** in professional format.`,
    bulletin_suggest: "Generate a bulletin for {company}",
    company_not_found: `I couldn't find the company "{query}" in our RepIndex database.

**You can try:**
- The official company name (e.g., "Telefónica" instead of "Movistar")
- The stock ticker (e.g., "TEF", "SAN", "ITX")

**Available companies include:** {examples}`,
    bulletin_post_suggest: "Generate a bulletin for {company}",
    bulletin_post_compare: "How does {company} compare to the {sector} sector?",
    bulletin_post_top5: "Top 5 companies in the {sector} sector",
    pericial_q1: "What divergences exist between AI models in evaluating this company?",
    pericial_q2: "Is there documented temporal evolution showing reputational deterioration before and after any event?",
    pericial_q3: "Which metrics show the greatest exposure to risk narratives with evidentiary value?",
    depth_format_title: "FORMAT: ANALYTICAL REPORT — Structure anchored in SQL data",
    depth_executive_summary: "EXECUTIVE SUMMARY",
    depth_section_data: "THE DATA",
    depth_section_analysis: "THE ANALYSIS",
    depth_section_actions: "DATA-DRIVEN ACTIONS",
    depth_closing: "CLOSING — SOURCES AND METHODOLOGY",
    depth_headline_diagnosis: "Diagnosis",
    depth_3kpis: "Key KPIs with Delta",
    depth_3findings: "Findings",
    depth_verdict: "Verdict",
    depth_6ai_vision: "Vision of the 6 AIs",
    depth_8metrics: "The 8 Metrics",
    depth_model_divergence: "Model Divergence",
    depth_evolution: "Temporal Evolution",
    depth_competitive: "Competitive Context",
    depth_recommendations: "Strategic & Tactical Recommendations",
    // Fallback questions
    fallback_ceo_q1: "What are the 3 most urgent reputational risks?",
    fallback_ceo_q2: "How are we doing vs direct competition?",
    fallback_ceo_q3: "What decisions should I consider?",
    fallback_journalist_q1: "Which company has the most newsworthy story this week?",
    fallback_journalist_q2: "Is there an emerging controversy?",
    fallback_journalist_q3: "What headline do you suggest for this information?",
    fallback_analyst_q1: "Is there a correlation between RIX and stock price?",
    fallback_analyst_q2: "What technical signals do you detect?",
    fallback_analyst_q3: "Detailed sector comparison",
    fallback_investor_q1: "Does this company pass the reputational filter?",
    fallback_investor_q2: "What is the ESG risk level?",
    fallback_investor_q3: "Is it a good time to invest?",
    fallback_default_q1: "Can you go deeper?",
    fallback_default_q2: "How does it compare to competitors?",
    fallback_default_q3: "What's the trend?",
  },
  fr: {
    agent_identity_answer: `Je suis l'**Agent Rix**, un analyste spécialisé en réputation algorithmique d'entreprise.

Mon rôle est de vous aider à comprendre comment les principaux modèles d'IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) perçoivent les entreprises espagnoles et leur positionnement réputationnel.

**Je peux vous aider à :**
- 📊 Analyser les métriques RIX de toute entreprise
- 🏆 Comparer les entreprises avec leurs concurrents sectoriels
- 📈 Détecter les tendances et l'évolution temporelle
- 📋 Générer des rapports exécutifs pour les comités de direction

Quelle entreprise ou quel secteur souhaitez-vous analyser ?`,
    personal_query_answer: `Ma spécialité est l'analyse de réputation **d'entreprise**, pas individuelle. J'analyse la perception des entreprises par les IA, pas des personnes physiques.

Cependant, si vous êtes lié à une entreprise spécifique, je peux analyser comment la perception du leadership affecte la réputation de cette organisation.

**Souhaitez-vous que j'analyse la réputation d'une entreprise en particulier ?**`,
    off_topic_answer: `Cette question est en dehors de mon domaine d'expertise. En tant qu'Agent Rix, je me concentre exclusivement sur l'**analyse de réputation algorithmique d'entreprise**.

**Ce que je peux vous offrir :**
- 📊 Analyse de toute entreprise de l'IBEX-35 ou de l'écosystème espagnol
- 🏆 Comparaisons sectorielles et benchmarking concurrentiel
- 📈 Détection de tendances et alertes réputationnelles
- 📋 Rapports exécutifs sur la perception IA

Y a-t-il une entreprise ou un secteur que vous aimeriez analyser ?`,
    test_limits_answer: `Je suis l'Agent Rix, un analyste de réputation d'entreprise. Mon rôle est de vous aider à comprendre comment les IA perçoivent les entreprises espagnoles.

Sur quelle entreprise ou quel secteur souhaitez-vous vous concentrer ?`,
    analyze_company: "Analyser la réputation de {company}",
    analyze_short: "Analyser {company}",
    top5_ibex: "Top 5 entreprises IBEX-35 cette semaine",
    sector_comparison: "Comparaison du secteur bancaire",
    leadership_perception: "Comment le leadership de {company} est-il perçu ?",
    sector_reputation: "Réputation du secteur technologie",
    energy_ranking: "Classement du secteur énergie",
    top10_week: "Top 10 entreprises cette semaine",
    telecom_comparison: "Comparaison secteur télécommunications",
    bulletin_welcome: `Parfait ! 📋 Je peux générer un **bulletin exécutif** complet pour toute entreprise de notre base de données.

**Pour quelle entreprise souhaitez-vous le bulletin ?**

Écrivez le nom de l'entreprise et je générerai une analyse détaillée incluant :

- 📊 **Score RIX** par modèle d'IA
- 🏆 **Comparaison** avec les concurrents du secteur
- 📈 **Tendance** des 4 dernières semaines
- 💡 **Conclusions** et recommandations`,
    bulletin_suggest: "Générer un bulletin pour {company}",
    company_not_found: `Je n'ai pas trouvé l'entreprise « {query} » dans notre base de données RepIndex.

**Vous pouvez essayer avec :**
- Le nom officiel de l'entreprise
- Le ticker boursier (ex : "TEF", "SAN", "ITX")

**Les entreprises disponibles incluent :** {examples}`,
    bulletin_post_suggest: "Générer un bulletin pour {company}",
    bulletin_post_compare: "Comment {company} se compare-t-elle au secteur {sector} ?",
    bulletin_post_top5: "Top 5 entreprises du secteur {sector}",
    pericial_q1: "Quelles divergences existent entre les modèles d'IA dans l'évaluation de cette entreprise ?",
    pericial_q2: "Y a-t-il une évolution temporelle documentée montrant une détérioration réputationnelle ?",
    pericial_q3: "Quelles métriques présentent la plus grande exposition aux narratifs de risque ?",
    depth_format_title: "FORMAT : RAPPORT ANALYTIQUE — Structure ancrée dans les données SQL",
    depth_executive_summary: "RÉSUMÉ EXÉCUTIF",
    depth_section_data: "LES DONNÉES",
    depth_section_analysis: "L'ANALYSE",
    depth_section_actions: "ACTIONS BASÉES SUR LES DONNÉES",
    depth_closing: "CLÔTURE — SOURCES ET MÉTHODOLOGIE",
    depth_headline_diagnosis: "Diagnostic",
    depth_3kpis: "KPI Principaux avec Delta",
    depth_3findings: "Constats",
    depth_verdict: "Verdict",
    depth_6ai_vision: "Vision des 6 IA",
    depth_8metrics: "Les 8 Métriques",
    depth_model_divergence: "Divergence entre modèles",
    depth_evolution: "Évolution Temporelle",
    depth_competitive: "Contexte Concurrentiel",
    depth_recommendations: "Recommandations Stratégiques et Tactiques",
    // Fallback questions
    fallback_ceo_q1: "Quels sont les 3 risques réputationnels les plus urgents ?",
    fallback_ceo_q2: "Comment nous situons-nous par rapport à la concurrence directe ?",
    fallback_ceo_q3: "Quelles décisions devrais-je considérer ?",
    fallback_journalist_q1: "Quelle entreprise a l'histoire la plus médiatique cette semaine ?",
    fallback_journalist_q2: "Y a-t-il une controverse émergente ?",
    fallback_journalist_q3: "Quel titre proposez-vous pour cette information ?",
    fallback_analyst_q1: "Y a-t-il une corrélation entre le RIX et le cours de l'action ?",
    fallback_analyst_q2: "Quels signaux techniques détectez-vous ?",
    fallback_analyst_q3: "Comparaison détaillée du secteur",
    fallback_investor_q1: "Cette entreprise passe-t-elle le filtre réputationnel ?",
    fallback_investor_q2: "Quel est le niveau de risque ESG ?",
    fallback_investor_q3: "Est-ce le bon moment pour investir ?",
    fallback_default_q1: "Pouvez-vous approfondir ?",
    fallback_default_q2: "Comment se compare-t-elle aux concurrents ?",
    fallback_default_q3: "Quelle est la tendance ?",
  },
  pt: {
    agent_identity_answer: `Sou o **Agente Rix**, um analista especializado em reputação algorítmica corporativa.

A minha função é ajudá-lo a interpretar como os principais modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) percebem as empresas espanholas e o seu posicionamento reputacional.

**Posso ajudá-lo com:**
- 📊 Analisar métricas RIX de qualquer empresa
- 🏆 Comparar empresas com a sua concorrência setorial
- 📈 Detetar tendências e evolução temporal
- 📋 Gerar relatórios executivos para conselho de administração

Que empresa ou setor gostaria de analisar?`,
    personal_query_answer: `A minha especialidade é a análise de reputação **corporativa**, não individual. Analiso como as IAs percebem empresas como entidades, não pessoas físicas.

No entanto, se estiver vinculado a uma empresa específica, posso analisar como a perceção da liderança afeta a reputação corporativa dessa organização.

**Gostaria que analisasse a reputação corporativa de alguma empresa em particular?**`,
    off_topic_answer: `Essa pergunta está fora da minha especialização. Como Agente Rix, concentro-me exclusivamente na **análise de reputação algorítmica corporativa**.

**O que posso oferecer:**
- 📊 Análise de qualquer empresa do IBEX-35 ou do ecossistema espanhol
- 🏆 Comparações setoriais e benchmarking competitivo
- 📈 Deteção de tendências e alertas reputacionais
- 📋 Relatórios executivos sobre a perceção nas IAs

Há alguma empresa ou setor que gostaria de analisar?`,
    test_limits_answer: `Sou o Agente Rix, um analista de reputação corporativa. A minha função é ajudá-lo a compreender como as IAs percebem as empresas espanholas.

Em que empresa ou setor gostaria de nos concentrarmos?`,
    analyze_company: "Analise a reputação de {company}",
    analyze_short: "Analise {company}",
    top5_ibex: "Top 5 empresas do IBEX-35 esta semana",
    sector_comparison: "Comparação do setor bancário",
    leadership_perception: "Como é percebida a liderança de {company}?",
    sector_reputation: "Reputação do setor tecnologia",
    energy_ranking: "Ranking do setor energia",
    top10_week: "Top 10 empresas esta semana",
    telecom_comparison: "Comparação setor telecomunicações",
    bulletin_welcome: `Perfeito! 📋 Posso gerar um **boletim executivo** completo para qualquer empresa da nossa base de dados.

**De que empresa quer o boletim?**

Escreva o nome da empresa e gerarei uma análise detalhada incluindo:

- 📊 **Score RIX** por modelo de IA
- 🏆 **Comparação** com concorrentes do setor
- 📈 **Tendência** das últimas 4 semanas
- 💡 **Conclusões** e recomendações`,
    bulletin_suggest: "Gerar um boletim de {company}",
    company_not_found: `Não encontrei a empresa "{query}" na nossa base de dados RepIndex.

**Pode tentar com:**
- O nome oficial da empresa
- O ticker bolsista (ex: "TEF", "SAN", "ITX")

**As empresas disponíveis incluem:** {examples}`,
    bulletin_post_suggest: "Gerar um boletim de {company}",
    bulletin_post_compare: "Como se compara {company} com o setor {sector}?",
    bulletin_post_top5: "Top 5 empresas do setor {sector}",
    pericial_q1: "Que divergências existem entre os modelos de IA na avaliação desta empresa?",
    pericial_q2: "Há evolução temporal documentada que mostre deterioração reputacional antes e depois de algum evento?",
    pericial_q3: "Que métricas apresentam maior exposição a narrativas de risco com valor probatório?",
    depth_format_title: "FORMATO: RELATÓRIO ANALÍTICO — Estrutura ancorada em dados SQL",
    depth_executive_summary: "RESUMO EXECUTIVO",
    depth_section_data: "OS DADOS",
    depth_section_analysis: "A ANÁLISE",
    depth_section_actions: "AÇÕES BASEADAS EM DADOS",
    depth_closing: "ENCERRAMENTO — FONTES E METODOLOGIA",
    depth_headline_diagnosis: "Diagnóstico",
    depth_3kpis: "KPIs Principais com Delta",
    depth_3findings: "Descobertas",
    depth_verdict: "Veredito",
    depth_6ai_vision: "Visão das 6 IAs",
    depth_8metrics: "As 8 Métricas",
    depth_model_divergence: "Divergência entre Modelos",
    depth_evolution: "Evolução Temporal",
    depth_competitive: "Contexto Competitivo",
    depth_recommendations: "Recomendações Estratégicas e Táticas",
    // Fallback questions
    fallback_ceo_q1: "Quais são os 3 riscos reputacionais mais urgentes?",
    fallback_ceo_q2: "Como estamos em relação à concorrência direta?",
    fallback_ceo_q3: "Que decisões deveria considerar?",
    fallback_journalist_q1: "Que empresa tem a história mais noticiável esta semana?",
    fallback_journalist_q2: "Há alguma controvérsia emergente?",
    fallback_journalist_q3: "Que título propõe para esta informação?",
    fallback_analyst_q1: "Há correlação entre RIX e cotação?",
    fallback_analyst_q2: "Que sinais técnicos deteta?",
    fallback_analyst_q3: "Comparação detalhada do setor",
    fallback_investor_q1: "Esta empresa passa o filtro reputacional?",
    fallback_investor_q2: "Qual é o nível de risco ESG?",
    fallback_investor_q3: "É bom momento para investir?",
    fallback_default_q1: "Pode aprofundar mais?",
    fallback_default_q2: "Como se compara com concorrentes?",
    fallback_default_q3: "Qual é a tendência?",
  },
};

/**
 * Translation helper with variable interpolation.
 * Falls back to English, then Spanish if key not found.
 */
function t(lang: string, key: string, vars?: Record<string, string>): string {
  const dict = PIPELINE_I18N[lang] || PIPELINE_I18N["en"] || PIPELINE_I18N["es"];
  let text = dict[key] || PIPELINE_I18N["en"]?.[key] || PIPELINE_I18N["es"]?.[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}

// In-memory cache for company data
let companiesCache: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// =============================================================================
// API USAGE LOGGING HELPER
// =============================================================================
interface ApiUsageParams {
  supabaseClient: any;
  edgeFunction: string;
  provider: string;
  model: string;
  actionType: string;
  inputTokens: number;
  outputTokens: number;
  userId?: string | null;
  sessionId?: string;
  metadata?: Record<string, any>;
}

async function logApiUsage(params: ApiUsageParams): Promise<void> {
  try {
    // Fetch cost config
    const { data: costConfig } = await params.supabaseClient
      .from("api_cost_config")
      .select("input_cost_per_million, output_cost_per_million")
      .eq("provider", params.provider)
      .eq("model", params.model)
      .single();

    // Calculate estimated cost
    let estimatedCost = 0;
    if (costConfig) {
      const inputCost = (params.inputTokens / 1000000) * costConfig.input_cost_per_million;
      const outputCost = (params.outputTokens / 1000000) * costConfig.output_cost_per_million;
      estimatedCost = inputCost + outputCost;
    }

    // Insert log
    const { error } = await params.supabaseClient.from("api_usage_logs").insert({
      edge_function: params.edgeFunction,
      provider: params.provider,
      model: params.model,
      action_type: params.actionType,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost_usd: estimatedCost,
      user_id: params.userId || null,
      session_id: params.sessionId || null,
      metadata: params.metadata || {},
    });

    if (error) {
      console.warn("Failed to log API usage:", error.message);
    }
  } catch (e) {
    console.warn("Error in logApiUsage:", e);
  }
}

// =============================================================================
// UNIFIED RIX DATA HELPER - Solo rix_runs_v2 (fuente única de verdad)
// =============================================================================
// Fase 1 (2026-02-19): Desconectado rix_runs (legacy). Solo V2 para eliminar
// contaminación de esquemas incompatibles (rix_runs no tiene respuesta_bruto_grok
// ni respuesta_bruto_qwen). rix_runs sigue existiendo en BD por si se necesita.
interface FetchUnifiedRixOptions {
  supabaseClient: any;
  columns: string;
  tickerFilter?: string | string[];
  limit?: number;
  offset?: number;
  logPrefix?: string;
}

async function fetchUnifiedRixData(options: FetchUnifiedRixOptions): Promise<any[]> {
  const { supabaseClient, columns, tickerFilter, limit = 1000, offset = 0, logPrefix = "[V2-RIX]" } = options;

  // Solo rix_runs_v2 — sin deduplicación, sin contaminación de esquemas legacy
  let query = supabaseClient
    .from("rix_runs_v2")
    .select(columns)
    .or("analysis_completed_at.not.is.null,09_rix_score.not.is.null")
    .order("batch_execution_date", { ascending: false })
    .order('"05_ticker"', { ascending: true });

  // Filtro por ticker
  if (tickerFilter) {
    if (Array.isArray(tickerFilter)) {
      query = query.in('"05_ticker"', tickerFilter);
    } else {
      query = query.eq('"05_ticker"', tickerFilter);
    }
  }

  // Límite / paginación — SIEMPRE usar .range() para evitar el límite silencioso de
  // 1000 filas de PostgREST que ignora cualquier .limit(N>1000) sin range.
  // 5 domingos × ~1.050 registros = ~5.250 → effectiveLimit = 5.500 cubre todo.
  const effectiveLimit = Math.max(limit, 5500);
  query = query.range(offset, offset + effectiveLimit - 1);

  const { data, error } = await query;
  if (error) console.error(`${logPrefix} Error fetching rix_runs_v2:`, error.message);
  console.log(`${logPrefix} V2-only: ${data?.length || 0} records`);

  return data || [];
}

// =============================================================================
// VERIFIED SOURCE EXTRACTOR - Only ChatGPT (utm_source=openai) and Perplexity
// =============================================================================
// CRITICAL: Other models (Gemini, DeepSeek, Grok, Qwen) are IGNORED because
// they may contain fabricated/hallucinated URLs.
//
// TEMPORAL CLASSIFICATION:
// - 'window': Sources within the analysis period (period_from to period_to)
// - 'reinforcement': Historical/contextual sources used by AIs
// - 'unknown': Cannot determine temporal category

interface VerifiedSource {
  url: string;
  domain: string;
  title?: string;
  sourceModel: "ChatGPT" | "Perplexity";
  citationNumber?: number;
  temporalCategory: "window" | "reinforcement" | "unknown";
  extractedDate?: string;
}

// Spanish month names for date extraction
const SPANISH_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

/**
 * Extract dates from text near a URL position (within ~200 chars).
 */
function extractNearestDate(text: string, urlPosition: number): Date | null {
  const start = Math.max(0, urlPosition - 200);
  const end = Math.min(text.length, urlPosition + 200);
  const context = text.slice(start, end);

  const dates: { date: Date; distance: number }[] = [];

  // Pattern 1: "DD de MES de AAAA" (Spanish full date)
  const fullDatePattern =
    /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/gi;
  let match;
  while ((match = fullDatePattern.exec(context)) !== null) {
    const day = parseInt(match[1], 10);
    const month = SPANISH_MONTHS[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, day),
        distance: Math.abs(match.index - (urlPosition - start)),
      });
    }
  }

  // Pattern 2: "MES de AAAA" or "MES AAAA"
  const monthYearPattern =
    /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/gi;
  while ((match = monthYearPattern.exec(context)) !== null) {
    const month = SPANISH_MONTHS[match[1].toLowerCase()];
    const year = parseInt(match[2], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, 15),
        distance: Math.abs(match.index - (urlPosition - start)),
      });
    }
  }

  if (dates.length === 0) return null;
  dates.sort((a, b) => a.distance - b.distance);
  return dates[0].date;
}

/**
 * Classify a source temporally based on extracted date and analysis period.
 */
function classifyTemporally(
  extractedDate: Date | null,
  periodFrom: Date | null,
  periodTo: Date | null,
): "window" | "reinforcement" | "unknown" {
  if (!extractedDate) return "unknown";
  if (!periodFrom || !periodTo) return "unknown";

  // Extend window by 3 days on each side
  const windowStart = new Date(periodFrom);
  windowStart.setDate(windowStart.getDate() - 3);
  const windowEnd = new Date(periodTo);
  windowEnd.setDate(windowEnd.getDate() + 3);

  if (extractedDate >= windowStart && extractedDate <= windowEnd) {
    return "window";
  } else if (extractedDate < periodFrom) {
    return "reinforcement";
  }
  return "unknown";
}

function extractVerifiedSources(
  chatGptRaw: string | null,
  perplexityRaw: string | null,
  periodFrom: string | null = null,
  periodTo: string | null = null,
): VerifiedSource[] {
  const sources: VerifiedSource[] = [];
  const periodFromDate = periodFrom ? new Date(periodFrom) : null;
  const periodToDate = periodTo ? new Date(periodTo) : null;

  // Extract ChatGPT sources (only with utm_source=openai)
  if (chatGptRaw) {
    const chatGptPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+utm_source=openai[^)]*)\)/g;
    let match;
    while ((match = chatGptPattern.exec(chatGptRaw)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const urlPosition = match.index;
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, "");
        if (!sources.some((s) => s.url === url)) {
          const extractedDate = extractNearestDate(chatGptRaw, urlPosition);
          const temporalCategory = classifyTemporally(extractedDate, periodFromDate, periodToDate);
          sources.push({
            url,
            domain,
            title: title || undefined,
            sourceModel: "ChatGPT",
            temporalCategory,
            extractedDate: extractedDate?.toISOString(),
          });
        }
      } catch {
        /* Invalid URL */
      }
    }
  }

  // Extract Perplexity sources
  if (perplexityRaw) {
    // Try JSON parsing first
    try {
      const parsed = JSON.parse(perplexityRaw);
      if (parsed.citations && Array.isArray(parsed.citations)) {
        parsed.citations.forEach((citation: string, index: number) => {
          if (citation && citation.startsWith("http")) {
            try {
              const urlObj = new URL(citation);
              const domain = urlObj.hostname.replace(/^www\./, "");
              if (!sources.some((s) => s.url === citation)) {
                sources.push({
                  url: citation,
                  domain,
                  sourceModel: "Perplexity",
                  citationNumber: index + 1,
                  temporalCategory: "unknown", // JSON structure doesn't provide date context
                });
              }
            } catch {
              /* Invalid URL */
            }
          }
        });
      }
    } catch {
      /* Not JSON, try regex */
    }

    // Markdown links from Perplexity
    const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownPattern.exec(perplexityRaw)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const urlPosition = match.index;
      if (sources.some((s) => s.url === url)) continue;
      if (url.includes("perplexity.ai")) continue;
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, "");
        const extractedDate = extractNearestDate(perplexityRaw, urlPosition);
        const temporalCategory = classifyTemporally(extractedDate, periodFromDate, periodToDate);
        sources.push({
          url,
          domain,
          title: title || undefined,
          sourceModel: "Perplexity",
          temporalCategory,
          extractedDate: extractedDate?.toISOString(),
        });
      } catch {
        /* Invalid URL */
      }
    }
  }

  return sources;
}

function extractSourcesFromRixData(rixData: any[]): VerifiedSource[] {
  const allSources: VerifiedSource[] = [];

  for (const run of rixData) {
    const sources = extractVerifiedSources(
      run["20_res_gpt_bruto"] ?? null,
      run["21_res_perplex_bruto"] ?? null,
      run["06_period_from"] ?? null,
      run["07_period_to"] ?? null,
    );
    allSources.push(...sources);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allSources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

// =============================================================================
// SSE STREAMING HELPERS
// =============================================================================

type SSEEventType = "start" | "chunk" | "metadata" | "done" | "error" | "fallback";

interface SSEEvent {
  type: SSEEventType;
  text?: string;
  metadata?: Record<string, unknown>;
  suggestedQuestions?: string[];
  drumrollQuestion?: DrumrollQuestion | null;
  error?: string;
}

function createSSEEncoder() {
  const encoder = new TextEncoder();
  return (event: SSEEvent): Uint8Array => {
    const data = JSON.stringify(event);
    return encoder.encode(`data: ${data}\n\n`);
  };
}

// Stream OpenAI response with SSE
async function* streamOpenAIResponse(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000,
): AsyncGenerator<{
  type: "chunk" | "done" | "error";
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  error?: string;
}> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openAIApiKey) {
    yield { type: "error", error: "OpenAI API key not configured" };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`${logPrefix} Starting OpenAI stream (${model})...`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        ...(model === "o3" ? { reasoning_effort: "medium" } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} OpenAI stream error:`, response.status, errorText);
      yield { type: "error", error: `OpenAI error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastFinishReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { type: "chunk", text: content };
            }

            // Capture finish_reason for truncation detection
            const fr = parsed.choices?.[0]?.finish_reason;
            if (fr) lastFinishReason = fr;

            // Capture usage from final chunk if available
            if (parsed.usage) {
              totalInputTokens = parsed.usage.prompt_tokens || 0;
              totalOutputTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }

    yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`${logPrefix} OpenAI stream timeout`);
      yield { type: "error", error: "OpenAI timeout" };
    } else {
      console.error(`${logPrefix} OpenAI stream error:`, error);
      yield { type: "error", error: error.message || "Unknown error" };
    }
  }
}

// Stream Gemini response with SSE
async function* streamGeminiResponse(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000,
): AsyncGenerator<{
  type: "chunk" | "done" | "error";
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  error?: string;
}> {
  const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");

  if (!geminiApiKey) {
    yield { type: "error", error: "Gemini API key not configured" };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`${logPrefix} Starting Gemini stream (${model})...`);

    // Convert messages to Gemini format
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system")?.content;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Gemini stream error:`, response.status, errorText);
      yield { type: "error", error: `Gemini error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastFinishReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini streams as NDJSON-like format
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") continue;

        // Clean up JSON array markers
        let jsonStr = trimmed;
        if (jsonStr.startsWith(",")) jsonStr = jsonStr.slice(1);
        if (jsonStr.startsWith("[")) jsonStr = jsonStr.slice(1);
        if (jsonStr.endsWith(",")) jsonStr = jsonStr.slice(0, -1);
        if (jsonStr.endsWith("]")) jsonStr = jsonStr.slice(0, -1);

        if (!jsonStr.trim()) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield { type: "chunk", text };
          }

          // Capture finish reason for truncation detection
          const fr = parsed.candidates?.[0]?.finishReason;
          if (fr) lastFinishReason = fr === "MAX_TOKENS" ? "length" : fr.toLowerCase();

          // Capture usage metadata
          if (parsed.usageMetadata) {
            totalInputTokens = parsed.usageMetadata.promptTokenCount || 0;
            totalOutputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`${logPrefix} Gemini stream timeout`);
      yield { type: "error", error: "Gemini timeout" };
    } else {
      console.error(`${logPrefix} Gemini stream error:`, error);
      yield { type: "error", error: error.message || "Unknown error" };
    }
  }
}

// =============================================================================
// COMPLIANCE GATE: Forbidden Pattern Detection & Stripping
// =============================================================================
// Robust normalization + expanded semantic families for forbidden patterns.
// Detects AI hallucinations about "saving reports to folders", "exceeding
// platform limits", or inventing file systems. Applied AFTER NFD normalization.

/**
 * Normalize text for compliance matching: lowercase, strip diacritics,
 * collapse whitespace, normalize quotes/symbols.
 */
function normalizeForCompliance(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[""«»]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Patterns are written to match NFD-normalized (accent-free) text
const FORBIDDEN_PATTERNS: RegExp[] = [
  // === Family: "limite" / "longitud" / "capacidad" / "excede" ===
  /la\s+respuesta\s+(?:completa\s+)?supera\s+el\s+limite/,
  /supera\s+el\s+limite\s+(?:maximo|tecnico)/,
  /limite\s+maximo\s+permitido/,
  /limite\s+tecnico\s+de\s+entrega/,
  /la\s+respuesta[\s\S]{0,120}?limite[\s\S]{0,120}?(?:plataforma|entrega)/,
  /supera\s+(?:el\s+)?(?:maximo\s+de\s+)?longitud/,
  /longitud\s+maxima\s+(?:permitida|de\s+respuesta)/,
  /maximo\s+de\s+longitud\s+permitido/,
  /excede\s+(?:el\s+)?(?:limite|longitud|maximo)/,
  /supera\s+(?:la\s+)?capacidad\s+(?:de\s+)?(?:esta\s+)?plataforma/,
  /(?:response|output)\s+(?:exceeds?|too\s+long|limit)/,
  /the\s+response\s+exceeds/,
  // === Family: external file/folder/save hallucinations ===
  /documento\s+aparte/,
  /carpeta\s+segura/,
  /\/informes[_\-]?rix\//,
  /informes[_\s\-]?rix/,
  /te\s+lo\s+deje\s+guardado/,
  /lo\s+he\s+dejado\s+en/,
  /he\s+generado\s+el\s+informe.*en\s+un\s+documento/,
  /generado.*documento\s+aparte/,
  /dejado\s+(?:guardado|almacenado)\s+en/,
  /saved?\s+(?:it\s+)?(?:to|in)\s+(?:a\s+)?(?:secure\s+)?folder/,
  // === Family: promises of external delivery ===
  /exportar.*secciones\s+concretas/,
  /las\s+transcribo\s+aqui\s+mismo/,
  /(?:adjunto|archivo|fichero)\s+(?:separado|externo|adicional)/,
  /(?:te\s+envio|te\s+mando|te\s+remito)\s+(?:el\s+)?(?:informe|documento|archivo)/,
  /puedes?\s+descargar(?:lo)?\s+(?:desde|en)/,
  // === Family: meta-commentary about response delivery ===
  /\[?\s*la\s+respuesta\s+completa\s+se\s+ha\s+entregado/,
  /debido\s+a\s+la\s+longitud.*lectura\s+puede\s+requerir/,
  /si\s+necesita\s+aclaraciones\s+sobre\s+alguna\s+seccion.*profundizare/,
  /siguiendo\s+la\s+estructura.*profundidad\s+requerida/,
  // === Family: "elaboración en progreso" / "próxima respuesta" ===
  /elaboracion\s+en\s+progreso/,
  /se\s+ofrecera\s+en\s+la\s+proxima\s+respuesta/,
  /limite\s+de\s+generacion\s+de\s+esta\s+sesion/,
  /informe\s+supera\s+el\s+limite\s+de\s+generacion/,
   // === Family: content fabrication markers ===
   /para\s+preservar\s+la\s+confidencialidad.*denominaremos/,
   /equipo\s+interfuncional\s+de\s+\d+\s+especialistas/,
   // === Family: consulting jargon fabrication ===
   /pilar\s+\d+\s*[-–—:]\s*[A-ZÁÉÍÓÚÑA-Z]/i,
   /(?:capex|opex)\s+(?:incremental|estimado).*\d+\s*m€/i,
   /van\s+\+?\d+\s*m€/i,
   /simulaciones?\s+monte\s+carlo/i,
   /copula[\s-]t/i,
   /cone\s+of\s+plausibility/i,
   /sandbox\s+(?:etico|regulatorio)/i,
   /tokenizacion\s+de\s+creditos/i,
   /indice\s+(?:propietario|propio)\s+que\s+combina/i,
   /roi\s+estimado\s+\d+\s*%\s+sobre\s+capex/i,
   /se\s+procesaron\s+[\d,.]+\s*(?:m|millones?)\s+de\s+menciones/i,
   /mapeamos\s+\d+\s+stakeholders/i,
   /(?:wacc|ebitda|capex|van|roi|covar)[\s\S]{0,300}(?:wacc|ebitda|capex|van|roi|covar)/i,
   // === Family: fabricated roadmaps, systems, protocols ===
   /roadmap\s+(?:correctivo|estrategico|de\s+mejora)/i,
   /plan\s+de\s+accion\s+(?:ejecutivo|institucional)\s*\(/i,
   /kpi\s+objetivo\s+trim\d/i,
   /(?:sent-shift|crisis-?ops|gitreg|fitch-?bot|glassscan|auto-?publish)/i,
   /cobertura\s+24\s*\/?\s*7\s+de\s+\d+\s+fuentes/i,
   /algoritmo\s+de\s+ponderacion/i,
   /firma\s+pgp/i,
   /checksum\s+md5/i,
   /hash\s+sha-?\d+/i,
   /coef(?:iciente)?\.?\s+\d+[.,]\d+/i,
   /\d+[.,]\d+\s*%\s+de\s+volatilidad/i,
   /brecha\s+\d+\s*-\s*\d+\s*:\s*nucleo\s+causal/i,
   /matriz\s+de\s+severidad/i,
   /storytelling\s+compacto/i,
   /portavocia\s+triple/i,
   /equipo\s+(?:crisis|comunicacion)\s+con\s+sla/i,
    /pillar\s+\d+\s*[-–—:]\s*[A-Z]/i,
    /pilier\s+\d+\s*[-–—:]\s*[A-Z]/i,
    // === Family: fabricated action plans (without parenthesis requirement) ===
    /plan\s+de\s+acci[oó]n\s+institucional/i,
    /plan\s+de\s+acci[oó]n\s+ejecutiv[oa]/i,
    // === Family: stakeholder maps / influence maps ===
    /stakeholder\s+map/i,
    /mapa\s+de\s+influencia/i,
    /nodo\s+institucional/i,
    /patrocinador\s+interno/i,
    /socio\s+externo\s+ancla/i,
    // === Family: fabricated quarterly roadmaps ===
    /hoja\s+de\s+ruta\s+trimestral/i,
    /T[1-4][\s\-]+202[0-5]/i,
    // === Family: consulting KPIs ===
    /share\s+of\s+voice\s+(?:institucional|>=|≥)/i,
    /engagement\s+digital.*ppm/i,
    /secnewgate/i,
    // === Family: fabricated budgets ===
    /presupuesto\s+(?:total\s+)?estimado/i,
    // === Family: fabricated stock/market data ===
    /(?:sabadell|bbva|caixabank|repsol|cellnex|colonial)\s+[+-]\d+\s*%/i,
    /indice:\s*[\d.,]+\s*pts/i,
    /volatilidad\s+impl[ií]cita/i,
    /ratio\s+put\s*\/\s*call/i,
    // === Family: fabricated task forces / training ===
    /task\s+force\s+sectorial/i,
    /formaci[oó]n\s+(?:anual\s+)?de\s+portavoces/i,
    /dashboard\s+reputacional\s+en\s+comit[eé]/i,
    /cisne\s+negro\s+sanitario/i,
    // === Family: fabricated campaigns / certifications ===
     /campa[nñ]a\s+multicanal/i,
     /certificaci[oó]n\s+iso\s+37000/i,
     // === Family: fabricated risk radars / positioning recommendations ===
     /radar\s+de\s+riesgos/i,
     /riesgos?\s+inminentes?/i,
     /recomendaciones?\s+de\s+posicionamiento/i,
     /gravamen\s+fiscal/i,
     /subidas?\s+(?:adicionales?\s+)?del\s+bce/i,
     /investor\s+day/i,
     /campa[nñ]a\s+de\s+verano/i,
     /narrativa\s+fintech/i,
     /compromisos?\s+esg\s+externos?/i,
     /reservas?\s+anticipadas?/i,
];

function findForbiddenMatchIndex(text: string): number {
  const normalized = normalizeForCompliance(text);
  let earliest = -1;
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match && match.index !== undefined) {
      // Map back to approximate original position
      const approxOrigIndex = match.index;
      earliest = earliest === -1 ? approxOrigIndex : Math.min(earliest, approxOrigIndex);
    }
  }
  return earliest;
}

function containsForbiddenPattern(text: string): boolean {
  return findForbiddenMatchIndex(text) !== -1;
}

function stripForbiddenContent(text: string): string {
  const matchIndex = findForbiddenMatchIndex(text);
  if (matchIndex === -1) return text;

  const beforeMatch = text.substring(0, matchIndex);
  // Find last clean sentence boundary before the forbidden content
  const lastBoundary = Math.max(
    beforeMatch.lastIndexOf('. '),
    beforeMatch.lastIndexOf('.\n'),
    beforeMatch.lastIndexOf('\n\n'),
    beforeMatch.lastIndexOf('---'),
  );

  if (lastBoundary > text.length * 0.3) {
    return text.substring(0, lastBoundary + 1).trim();
  }

  return beforeMatch.trim();
}

// =============================================================================
// AI FALLBACK HELPER - OpenAI → Gemini
// =============================================================================
interface AICallResult {
  content: string;
  provider: "openai" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function callAIWithFallback(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000,
  options?: {
    preferGemini?: boolean;
    geminiTimeout?: number;
  },
): Promise<AICallResult> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");

  const preferGemini = options?.preferGemini ?? false;
  const geminiTimeout = options?.geminiTimeout ?? timeout;

  // Model mapping: OpenAI → Gemini equivalent
  const modelMapping: Record<string, string> = {
    o3: "gemini-2.5-flash",
    "gpt-4.1": "gemini-2.5-pro",
    "gpt-4o-mini": "gemini-2.5-flash-lite",
    "gpt-4o": "gemini-2.5-flash",
  };

  // 1. Try OpenAI first (unless preferGemini)
  if (!preferGemini && openAIApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      console.log(`${logPrefix} Calling OpenAI (${model})...`);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const usage = data.usage || {};
        console.log(
          `${logPrefix} OpenAI response received successfully (in: ${usage.prompt_tokens || 0}, out: ${usage.completion_tokens || 0})`,
        );
        return {
          content: data.choices[0].message.content,
          provider: "openai",
          model: model,
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        };
      }

      // Errors that trigger fallback: 429, 500, 502, 503, 504
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const errorText = await response.text();
        console.warn(`${logPrefix} OpenAI returned ${response.status}, switching to Gemini fallback...`);
        console.warn(`${logPrefix} OpenAI error details: ${errorText.substring(0, 200)}`);
      } else {
        const errorText = await response.text();
        console.error(`${logPrefix} OpenAI API error (${response.status}):`, errorText);
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn(`${logPrefix} OpenAI timeout (${timeout}ms), switching to Gemini fallback...`);
      } else if (error.message?.includes("OpenAI API error")) {
        throw error; // Re-throw non-recoverable errors
      } else {
        console.warn(`${logPrefix} OpenAI network error, switching to Gemini fallback:`, error.message);
      }
    }
  } else {
    if (!preferGemini) {
      console.warn(`${logPrefix} No OpenAI API key, using Gemini directly...`);
    }
  }

  // 2. Fallback to Gemini
  if (!geminiApiKey) {
    throw new Error("Both OpenAI and Gemini API keys are not configured");
  }

  const geminiModel = modelMapping[model] || "gemini-2.5-flash";
  console.log(`${logPrefix} Using Gemini fallback (${geminiModel})...`);

  // Gemini request with timeout (prevents hanging requests that end as client-side "Failed to fetch")
  const geminiController = new AbortController();
  const geminiTimeoutId = setTimeout(() => geminiController.abort(), geminiTimeout);

  const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${geminiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: geminiModel,
      messages,
      max_tokens: maxTokens,
    }),
    signal: geminiController.signal,
  });

  clearTimeout(geminiTimeoutId);

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error(`${logPrefix} Gemini API error:`, errorText);
    throw new Error(`Both OpenAI and Gemini failed. Gemini error: ${geminiResponse.statusText}`);
  }

  const geminiData = await geminiResponse.json();
  const geminiUsage = geminiData.usage || {};
  console.log(
    `${logPrefix} Gemini response received successfully (fallback, in: ${geminiUsage.prompt_tokens || 0}, out: ${geminiUsage.completion_tokens || 0})`,
  );

  return {
    content: geminiData.choices[0].message.content,
    provider: "gemini",
    model: geminiModel,
    inputTokens: geminiUsage.prompt_tokens || 0,
    outputTokens: geminiUsage.completion_tokens || 0,
  };
}

// Helper for simpler calls (gpt-4o-mini for questions generation)
async function callAISimple(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
): Promise<string | null> {
  try {
    const result = await callAIWithFallback(messages, model, maxTokens, logPrefix, 30000);
    return result.content;
  } catch (error) {
    console.warn(`${logPrefix} AI call failed:`, error.message);
    return null;
  }
}

// =============================================================================
// MULTI-EXPERT PIPELINE (E1-E6) — Replaces monolithic prompt architecture
// =============================================================================

// --- E1: INTENT CLASSIFIER ---
interface ClassifierResult {
  tipo: "empresa" | "sector" | "comparativa" | "metodologia" | "general";
  empresas_detectadas: { ticker: string; nombre: string; confianza: number }[];
  intencion: "diagnostico" | "ranking" | "evolucion" | "metrica_especifica" | "prospectiva" | "general";
  metricas_mencionadas: string[];
  periodo_solicitado: "ultima_semana" | "ultimo_mes" | "custom";
  idioma: "es" | "en";
  requiere_bulletin: boolean;
}

async function runClassifier(
  question: string,
  companiesList: { ticker: string; issuer_name: string; sector_category?: string }[],
  conversationHistory: any[],
  language: string,
  logPrefix: string,
): Promise<ClassifierResult> {
  console.log(`${logPrefix} [E1] Running classifier...`);

  const companiesRef = companiesList
    .slice(0, 200)
    .map((c) => `${c.ticker}:${c.issuer_name}`)
    .join(", ");

  const recentHistory = conversationHistory.slice(-4).map((m) => `${m.role}: ${m.content?.substring(0, 100)}`).join("\n");

  const prompt = `Clasifica esta pregunta sobre reputación corporativa.

EMPRESAS DISPONIBLES: ${companiesRef}

HISTORIAL RECIENTE:
${recentHistory || "(ninguno)"}

PREGUNTA: "${question}"

Responde SOLO con JSON válido (sin markdown):
{
  "tipo": "empresa|sector|comparativa|metodologia|general",
  "empresas_detectadas": [{"ticker":"XXX","nombre":"Nombre","confianza":0.9}],
  "intencion": "diagnostico|ranking|evolucion|metrica_especifica|prospectiva|general",
  "metricas_mencionadas": [],
  "periodo_solicitado": "ultima_semana|ultimo_mes|custom",
  "idioma": "${language}",
  "requiere_bulletin": false
}

REGLAS:
- Solo detecta empresas que EXISTAN en la lista. No inventes.
- confianza: 1.0 = mención explícita, 0.8 = referencia indirecta, 0.5 = ambigua
- requiere_bulletin: true solo si pide "boletín", "informe completo" o "bulletin"
- Si la pregunta es genérica (metodología, qué es RepIndex, etc.), tipo="general"
- Si la pregunta menciona "IBEX-35", "IBEX", un índice bursátil o pide un "panorama" / "ranking" de un grupo de empresas, tipo="sector" e intencion="ranking". Palabras clave de índice: ibex, panorama, mercado, índice, ranking general, selectivo.`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: "Clasificador de intención para sistema de reputación corporativa. Responde SOLO en JSON válido sin bloques de código." },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini",
      400,
      `${logPrefix} [E1]`,
    );

    if (result) {
      const clean = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean) as ClassifierResult;
      console.log(`${logPrefix} [E1] Classified: tipo=${parsed.tipo}, empresas=${parsed.empresas_detectadas.length}, intencion=${parsed.intencion}`);
      return parsed;
    }
  } catch (e) {
    console.warn(`${logPrefix} [E1] Classifier failed, using fallback:`, e);
  }

  // Fallback: use legacy regex detection
  const legacyDetected = detectCompaniesInQuestion(question, companiesList);
  return {
    tipo: legacyDetected.length > 0 ? "empresa" : "general",
    empresas_detectadas: legacyDetected.map((c) => ({ ticker: c.ticker, nombre: c.issuer_name, confianza: 0.7 })),
    intencion: "diagnostico",
    metricas_mencionadas: [],
    periodo_solicitado: "ultima_semana",
    idioma: language as "es" | "en",
    requiere_bulletin: /bolet[ií]n|bulletin|informe completo/i.test(question),
  };
}

// --- F2: SQL EXPERT (NL→SQL via gpt-4o-mini) ---
interface SQLQueryResult {
  label: string;
  query: string;
  data: any[] | null;
  error?: string;
}

async function generateAndExecuteSQLQueries(
  question: string,
  classifier: ClassifierResult,
  supabaseClient: any,
  logPrefix: string,
): Promise<SQLQueryResult[]> {
  console.log(`${logPrefix} [F2] Starting SQL Expert...`);

  const schemaPrompt = `Eres un experto SQL. Genera consultas SELECT de solo lectura para PostgreSQL.

ESQUEMA DE TABLAS DISPONIBLES:

=== rix_runs_v2 ===
Tabla principal de análisis reputacionales semanales. Una fila por empresa×modelo×semana.
Columnas clave:
- "02_model_name" text: nombre del modelo de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen)
- "03_target_name" text: nombre de la empresa
- "05_ticker" text: ticker bursátil (ej: TEF, SAN, ITX, BBVA, IBE)
- "09_rix_score" numeric: puntuación RIX global (0-100)
- "51_rix_score_adjusted" numeric: RIX ajustado
- "23_nvm_score" numeric: Calidad de la Narrativa (0-100)
- "26_drm_score" numeric: Fortaleza de Evidencia (0-100)
- "29_sim_score" numeric: Autoridad de Fuentes (0-100)
- "32_rmm_score" numeric: Actualidad y Empuje (0-100)
- "35_cem_score" numeric: Gestión de Controversias (0-100)
- "38_gam_score" numeric: Percepción de Gobernanza (0-100)
- "41_dcm_score" numeric: Coherencia Informativa (0-100)
- "44_cxm_score" numeric: Ejecución Corporativa (0-100)
- "10_resumen" text: resumen textual del análisis
- "11_puntos_clave" jsonb: array de puntos clave
- "22_explicacion" text: explicación detallada
- "25_explicaciones_detalladas" jsonb: explicaciones por métrica
- "48_precio_accion" text: precio de la acción
- "49_reputacion_vs_precio" text: análisis reputación vs precio
- batch_execution_date date: fecha del barrido semanal (domingos)
- "25_nvm_categoria","28_drm_categoria","31_sim_categoria","34_rmm_categoria","37_cem_categoria","40_gam_categoria","43_dcm_categoria","46_cxm_categoria" text: categoría cualitativa

=== repindex_root_issuers ===
Catálogo maestro de empresas monitorizadas.
- ticker text PK
- issuer_name text: nombre oficial
- sector_category text: sector (ej: Financiero, Energía y Utilities, Telecomunicaciones y Tecnología)
- subsector text
- ibex_family_code text: familia de índice (ej: IBEX-35)
- ibex_status text
- verified_competitors jsonb: array de tickers de competidores directos verificados
- website text
- status text

=== corporate_snapshots ===
Información corporativa scrapeada periódicamente.
- ticker text, snapshot_date_only date, ceo_name text, company_description text
- headquarters_city text, employees_approx int, founded_year int, last_reported_revenue text
- mission_statement text, other_executives jsonb

=== corporate_news ===
Noticias corporativas.
- ticker text, headline text, published_date date, lead_paragraph text, category text, article_url text

=== rix_composite_scores ===
Scores compuestos RIXc precalculados.
- ticker text, week_start date, rixc_score numeric, sigma_intermodelo numeric, ic_score numeric, consensus_level text

REGLAS CRÍTICAS:
1. SOLO sentencias SELECT. Nunca INSERT, UPDATE, DELETE, DROP, ALTER.
2. Máximo 5 queries. Cada una con un "label" descriptivo.
3. REGLA DEL SNAPSHOT DOMINICAL: Los barridos válidos son los de domingo (batch_execution_date). Para encontrar la semana más reciente, ordena por batch_execution_date DESC y filtra domingos con ≥180 registros (30 empresas × 6 modelos).
4. Usa LIMIT razonables (nunca >500 por query). Para rankings, LIMIT 50 es suficiente.
5. Usa medianas (PERCENTILE_CONT(0.5)) en vez de AVG cuando agregues scores entre modelos.
6. Los nombres de columna con números llevan comillas dobles: "09_rix_score", "02_model_name", etc.
7. Nunca uses subconsultas con más de 2 niveles de anidamiento.
8. Para comparativas sectoriales, usa repindex_root_issuers.sector_category.
9. Para competidores verificados, usa repindex_root_issuers.verified_competitors (jsonb array).

Responde SOLO con un JSON array (sin markdown):
[
  {"label": "descripción del dato", "query": "SELECT ..."}
]`;

  const userPrompt = `PREGUNTA DEL USUARIO: "${question}"

CLASIFICACIÓN: tipo=${classifier.tipo}, intención=${classifier.intencion}, empresas=${classifier.empresas_detectadas.map(e => e.ticker).join(",") || "ninguna"}, métricas_mencionadas=${classifier.metricas_mencionadas.join(",") || "ninguna"}, periodo=${classifier.periodo_solicitado}

Genera las queries SQL óptimas para responder esta pregunta con la mayor riqueza de datos posible.`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: schemaPrompt },
        { role: "user", content: userPrompt },
      ],
      "gpt-4o-mini",
      2000,
      `${logPrefix} [F2]`,
    );

    if (!result) {
      console.warn(`${logPrefix} [F2] No response from SQL Expert`);
      return [];
    }

    const clean = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let queries: { label: string; query: string }[];
    try {
      queries = JSON.parse(clean);
    } catch (e) {
      console.warn(`${logPrefix} [F2] Failed to parse SQL Expert response: ${clean.substring(0, 200)}`);
      return [];
    }

    if (!Array.isArray(queries) || queries.length === 0) {
      console.warn(`${logPrefix} [F2] Empty queries array`);
      return [];
    }

    // Validate: only SELECT queries, max 5, reject malformed patterns
    const MALFORMED_PATTERNS = /WHERE\s+ORDER|WHERE\s+GROUP|SELECT\s+,|FROM\s+ORDER|FROM\s+GROUP|WHERE\s+LIMIT|,,/i;
    queries = queries.filter(q => {
      const trimmed = q.query?.trim().toUpperCase() || "";
      if (!trimmed.startsWith("SELECT") || trimmed.includes("INSERT") || trimmed.includes("UPDATE") || trimmed.includes("DELETE") || trimmed.includes("DROP") || trimmed.includes("ALTER")) {
        return false;
      }
      if (MALFORMED_PATTERNS.test(q.query || "")) {
        console.warn(`${logPrefix} [F2] Query rejected (malformed pattern): ${(q.query || "").substring(0, 100)}`);
        return false;
      }
      return true;
    }).slice(0, 5);

    console.log(`${logPrefix} [F2] Generated ${queries.length} valid queries: ${queries.map(q => q.label).join(", ")}`);

    // Execute each query via execute_sql RPC with timeout
    const results: SQLQueryResult[] = [];
    for (const q of queries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const { data, error } = await supabaseClient.rpc("execute_sql", { sql_query: q.query });
        clearTimeout(timeoutId);

        if (error) {
          console.warn(`${logPrefix} [F2] Query "${q.label}" failed: ${error.message}`);
          results.push({ label: q.label, query: q.query, data: null, error: error.message });
        } else {
          const rows = Array.isArray(data) ? data : (data ? [data] : []);
          console.log(`${logPrefix} [F2] Query "${q.label}": ${rows.length} rows`);
          results.push({ label: q.label, query: q.query, data: rows });
        }
      } catch (e) {
        console.warn(`${logPrefix} [F2] Query "${q.label}" exception: ${e.message}`);
        results.push({ label: q.label, query: q.query, data: null, error: e.message });
      }
    }

    // Log telemetry
    try {
      await supabaseClient.from("pipeline_logs").insert({
        stage: "F2_sql_expert",
        status: results.some(r => r.data && r.data.length > 0) ? "ok" : "empty",
        metadata: {
          phase: "F2",
          queries_generated: queries.length,
          queries_successful: results.filter(r => r.data && r.data.length > 0).length,
          queries_failed: results.filter(r => r.error).length,
          total_rows: results.reduce((sum, r) => sum + (r.data?.length || 0), 0),
          labels: results.map(r => r.label),
        },
      });
    } catch (_) {}

    return results;
  } catch (e) {
    console.error(`${logPrefix} [F2] SQL Expert failed entirely: ${e.message}`);
    return [];
  }
}

// --- E2: SQL DATAPACK (Deterministic queries + F2 dynamic enrichment) ---
interface DataPack {
  snapshot: { modelo: string; rix: number | null; rix_adj: number | null; nvm: number | null; drm: number | null; sim: number | null; rmm: number | null; cem: number | null; gam: number | null; dcm: number | null; cxm: number | null; period_from: string | null; period_to: string | null }[];
  sector_avg: { rix: number; count: number } | null;
  ranking: { pos: number; ticker: string; nombre: string; rix_avg: number }[];
  evolucion: { fecha: string; rix_avg: number; modelos: number; delta: number | null }[];
  divergencia: { sigma: number; nivel: string; modelo_alto: string; modelo_bajo: string; rango: number } | null;
  memento: { ceo: string | null; presidente: string | null; chairman: string | null; sede: string | null; descripcion: string | null; fecha: string | null; empleados: number | null; fundacion: number | null; ingresos: string | null; ejercicio_fiscal: string | null; mision: string | null; otros_ejecutivos: any[] | null } | null;
  noticias: { titular: string; fecha: string | null; ticker: string; lead: string | null; categoria: string | null }[];
  raw_texts: { modelo: string; texto: string }[];
  empresa_primaria: { ticker: string; nombre: string; sector: string | null; subsector: string | null } | null;
  competidores_verificados: { ticker: string; nombre: string; rix_avg: number | null }[];
  competidores_metricas_avg: { nvm: number | null; drm: number | null; sim: number | null; rmm: number | null; cem: number | null; gam: number | null; dcm: number | null; cxm: number | null } | null;
  explicaciones_metricas: { modelo: string; explicacion: string }[];
  puntos_clave: { modelo: string; puntos: string[] }[];
  categorias_metricas: { modelo: string; nvm: string | null; drm: string | null; sim: string | null; rmm: string | null; cem: string | null; gam: string | null; dcm: string | null; cxm: string | null }[];
  mercado: { precio: string | null; reputacion_vs_precio: string | null; variacion_interanual: string | null } | null;
  divergencias_detalle?: Array<{metric: string; max_model: string; max_value: number; min_model: string; min_value: number; range: number; consensus: string}>;
  delta_rix?: { current: number; previous: number | null; delta: number; note?: string };
}

async function buildDataPack(
  classifier: ClassifierResult,
  supabaseClient: any,
  companiesCache: any[] | null,
  logPrefix: string,
): Promise<DataPack> {
  console.log(`${logPrefix} [E2] Building DataPack...`);

  const pack: DataPack = {
    snapshot: [],
    sector_avg: null,
    ranking: [],
    evolucion: [],
    divergencia: null,
    memento: null,
    noticias: [],
    raw_texts: [],
    empresa_primaria: null,
    competidores_verificados: [],
    competidores_metricas_avg: null,
    explicaciones_metricas: [],
    puntos_clave: [],
    categorias_metricas: [],
    mercado: null,
  };

  // =========================================================================
  // ROUTE B: Index/sector queries WITHOUT specific company
  // =========================================================================
  const IBEX35_CODE = "IBEX-35";

  if (classifier.empresas_detectadas.length === 0) {
    console.log(`${logPrefix} [E2] No companies detected — checking for index/sector route...`);

    // Regex safety net: detect index mentions BEFORE evaluating classifier output
    const originalQ = (classifier as any)._originalQuestion || "";
    const regexIndexMatch = /ibex[\s-]*35|índice\s+bursátil|panorama\s+(completo|general|del\s+mercado)|ranking\s+general|selectivo\s+español/i.test(originalQ);

    // Detect if the question is about an index or sector
    const isIndexQuery = regexIndexMatch || classifier.tipo === "sector" || classifier.tipo === "comparativa" ||
      classifier.intencion === "ranking" || classifier.intencion === "evolucion";

    if (!isIndexQuery) {
      console.log(`${logPrefix} [E2] Not an index/sector query — returning empty DataPack. Question: "${originalQ.substring(0, 120)}"`);
      // Log telemetry
      try {
        await supabaseClient.from("pipeline_logs").insert({
          stage: "E2_datapack",
          status: "empty",
          metadata: { phase: "E2", intent: classifier.intencion, tipo: classifier.tipo, empty_reason: "no_companies_no_index", row_count: 0 },
        });
      } catch (_) {}
      return pack;
    }

    console.log(`${logPrefix} [E2] INDEX/SECTOR ROUTE activated (tipo=${classifier.tipo}, intencion=${classifier.intencion})`);

    // Determine the universe of tickers to query
    let universeTickers: string[] = [];
    let universeLabel = "all";

    // Check for IBEX-35 mentions in the question
    const questionLower = (classifier as any)._originalQuestion || "";
    const isIbexQuery = /ibex[\s-]*35/i.test(questionLower) || classifier.tipo === "sector";

    if (isIbexQuery && companiesCache) {
      universeTickers = companiesCache
        .filter((c: any) => c.ibex_family_code === IBEX35_CODE)
        .map((c: any) => c.ticker);
      universeLabel = IBEX35_CODE;
      console.log(`${logPrefix} [E2] IBEX-35 universe: ${universeTickers.length} tickers`);
    }

    // If no specific universe, use all active companies
    if (universeTickers.length === 0 && companiesCache) {
      universeTickers = companiesCache
        .filter((c: any) => c.status === "active" || !c.status)
        .map((c: any) => c.ticker);
      universeLabel = "all_active";
      console.log(`${logPrefix} [E2] Full universe: ${universeTickers.length} tickers`);
    }

    if (universeTickers.length === 0) {
      console.log(`${logPrefix} [E2] No tickers in universe — returning empty DataPack`);
      return pack;
    }

    // Fetch aggregated data for the universe
    const indexColumns = `
      "02_model_name", "03_target_name", "05_ticker",
      "06_period_from", "07_period_to", "09_rix_score", "51_rix_score_adjusted",
      "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score",
      "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score",
      "10_resumen", "11_puntos_clave", "22_explicacion", "25_explicaciones_detalladas",
      "20_res_gpt_bruto", "21_res_perplex_bruto",
      batch_execution_date
    `;

    const indexData = await fetchUnifiedRixData({
      supabaseClient,
      columns: indexColumns,
      tickerFilter: universeTickers,
      limit: 5500,
      logPrefix: `${logPrefix} [E2-INDEX]`,
    });

    if (indexData.length === 0) {
      console.log(`${logPrefix} [E2] Index query returned 0 rows from DB`);
      try {
        await supabaseClient.from("pipeline_logs").insert({
          stage: "E2_datapack",
          status: "empty",
          metadata: { phase: "E2", intent: classifier.intencion, tipo: classifier.tipo, empty_reason: "sql_zero_rows", universe: universeLabel, tickers_queried: universeTickers.length, row_count: 0 },
        });
      } catch (_) {}
      return pack;
    }

    console.log(`${logPrefix} [E2] Index data: ${indexData.length} rows for ${universeLabel}`);

    // Identify latest batch date
    const sortedByDate = [...indexData].sort(
      (a, b) => new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime()
    );
    const latestDate = sortedByDate[0]?.batch_execution_date;
    const latestWeek = sortedByDate.filter((r) => r.batch_execution_date === latestDate);

    console.log(`${logPrefix} [E2] Latest week: ${latestDate}, ${latestWeek.length} rows`);

    // Build ranking: per-model scores with median sorting (NO averages)
    const metricKeys = ["23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score", "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score"] as const;
    const metricShort = ["nvm", "drm", "sim", "rmm", "cem", "gam", "dcm", "cxm"] as const;

    // Helper: compute median of an array
    const medianOf = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10 : sorted[mid];
    };

    const byCompany = new Map<string, { name: string; scores: number[]; scoresByModel: Record<string, number>; sector?: string; metrics: Record<string, number[]>; metricsByModel: Record<string, Record<string, number>> }>();
    for (const row of latestWeek) {
      const ticker = row["05_ticker"];
      const rix = row["09_rix_score"];
      const modelName = row["02_model_name"] || "unknown";
      if (!ticker || rix == null || rix <= 0) continue;
      if (!byCompany.has(ticker)) {
        const compInfo = (companiesCache || []).find((c: any) => c.ticker === ticker);
        const metricsInit: Record<string, number[]> = {};
        for (const k of metricShort) metricsInit[k] = [];
        byCompany.set(ticker, { name: row["03_target_name"] || ticker, scores: [], scoresByModel: {}, sector: compInfo?.sector_category, metrics: metricsInit, metricsByModel: {} });
      }
      const entry = byCompany.get(ticker)!;
      entry.scores.push(rix);
      entry.scoresByModel[modelName] = rix;
      if (!entry.metricsByModel[modelName]) entry.metricsByModel[modelName] = {};
      for (let mi = 0; mi < metricKeys.length; mi++) {
        const val = row[metricKeys[mi]];
        if (val != null && typeof val === "number" && val > 0) {
          entry.metrics[metricShort[mi]].push(val);
          entry.metricsByModel[modelName][metricShort[mi]] = val;
        }
      }
    }

    const rankingEntries = Array.from(byCompany.entries())
      .map(([ticker, d]) => {
        const mediana = medianOf(d.scores);
        const rango = d.scores.length > 0 ? Math.round((Math.max(...d.scores) - Math.min(...d.scores)) * 10) / 10 : 0;
        const consenso_nivel = rango < 10 ? "alto" : rango < 20 ? "medio" : "bajo";
        return {
          ticker,
          nombre: d.name,
          mediana,
          rango,
          consenso_nivel,
          scores_por_modelo: d.scoresByModel,
          sector: d.sector,
          modelos: d.scores.length,
          metrics: Object.fromEntries(metricShort.map(k => [k, medianOf(d.metrics[k])])),
          metricsByModel: d.metricsByModel,
        };
      })
      .sort((a, b) => b.mediana - a.mediana);

    // --- Calcular deltas POR EMPRESA comparando última semana vs penúltima (usando mediana) ---
    const uniqueDatesForDelta = [...new Set(sortedByDate.map((r) => r.batch_execution_date))].sort().reverse();
    const prevDate = uniqueDatesForDelta.length >= 2 ? uniqueDatesForDelta[1] : null;
    const prevWeekData = prevDate ? sortedByDate.filter((r) => r.batch_execution_date === prevDate) : [];
    const prevByCompany = new Map<string, number[]>();
    for (const row of prevWeekData) {
      const t = row["05_ticker"];
      const rix = row["09_rix_score"];
      if (!t || rix == null || rix <= 0) continue;
      if (!prevByCompany.has(t)) prevByCompany.set(t, []);
      prevByCompany.get(t)!.push(rix);
    }

    pack.ranking = rankingEntries.map((r, i) => {
      const prevScores = prevByCompany.get(r.ticker);
      const prevMedian = prevScores && prevScores.length > 0 ? medianOf(prevScores) : null;
      const delta = prevMedian != null ? Math.round((r.mediana - prevMedian) * 10) / 10 : null;
      return {
        pos: i + 1,
        ticker: r.ticker,
        nombre: r.nombre,
        mediana: r.mediana,
        rango: r.rango,
        consenso_nivel: r.consenso_nivel,
        scores_por_modelo: r.scores_por_modelo,
        delta,
      };
    });

    // Build snapshot: per-model-per-company rows for top-5 and bottom-5 (NO averages)
    const allMedians = rankingEntries.map((r) => r.mediana);
    const globalMedian = medianOf(allMedians);

    // Compute global metric medians for sector_avg
    const globalMetricMedians: Record<string, number | null> = {};
    for (const k of metricShort) {
      const allVals = rankingEntries.map(r => r.metrics[k]).filter((v): v is number => v != null && v > 0);
      globalMetricMedians[k] = allVals.length > 0 ? medianOf(allVals) : null;
    }
    const allRanges = rankingEntries.map(r => r.rango);
    pack.sector_avg = { rix_mediana: globalMedian, rango_medio: allRanges.length > 0 ? Math.round((allRanges.reduce((a, b) => a + b, 0) / allRanges.length) * 10) / 10 : 0, count: rankingEntries.length, ...globalMetricMedians };

    // Pack the top 5 and bottom 5 as granular per-model snapshot entries
    const top5 = rankingEntries.slice(0, 5);
    const bottom5 = rankingEntries.slice(-5).reverse();
    for (const entry of [...top5, ...bottom5]) {
      // One row per model per company
      for (const [modelName, rixScore] of Object.entries(entry.scores_por_modelo)) {
        const modelMetrics = entry.metricsByModel[modelName] || {};
        pack.snapshot.push({
          modelo: `${modelName} → ${entry.nombre} (${entry.ticker})`,
          rix: rixScore,
          rix_adj: rixScore,
          nvm: modelMetrics.nvm || null, drm: modelMetrics.drm || null, sim: modelMetrics.sim || null, rmm: modelMetrics.rmm || null,
          cem: modelMetrics.cem || null, gam: modelMetrics.gam || null, dcm: modelMetrics.dcm || null, cxm: modelMetrics.cxm || null,
          period_from: null,
          period_to: latestDate?.toString().split("T")[0] || null,
        });
      }
    }

    // --- Cambio 1: Enriquecer Route B con datos cualitativos de top-5 y bottom-5 ---
    const qualitativeTickers = [...top5, ...bottom5].map(e => e.ticker);
    const qualitativeRows = latestWeek.filter(r => qualitativeTickers.includes(r["05_ticker"]));
    
    // Populate raw_texts with resumen + explicacion from each model for these companies
    for (const row of qualitativeRows) {
      const resumen = row["10_resumen"];
      const explicacion = row["22_explicacion"];
      const modelo = row["02_model_name"] || "unknown";
      const empresa = row["03_target_name"] || row["05_ticker"];
      if (resumen && typeof resumen === "string" && resumen.length > 20) {
        pack.raw_texts.push({ modelo: `${modelo} → ${empresa}`, texto: resumen });
      }
      if (explicacion && typeof explicacion === "string" && explicacion.length > 20) {
        pack.raw_texts.push({ modelo: `${modelo} → ${empresa} / Explicación`, texto: explicacion });
      }
      // Puntos clave
      const puntos = row["11_puntos_clave"];
      if (puntos) {
        const puntosArr = Array.isArray(puntos) ? puntos : (typeof puntos === "string" ? [puntos] : []);
        const validPuntos = puntosArr.filter((p: unknown) => typeof p === "string" && (p as string).length > 10) as string[];
        if (validPuntos.length > 0) {
          pack.puntos_clave.push({ modelo: `${modelo} → ${empresa}`, puntos: validPuntos });
        }
      }
      // Explicaciones detalladas
      const expDet = row["25_explicaciones_detalladas"];
      if (expDet && typeof expDet === "object") {
        const expObj = expDet as Record<string, unknown>;
        const parts: string[] = [];
        for (const [metricKey, explanation] of Object.entries(expObj)) {
          if (typeof explanation === "string" && explanation.length > 10) {
            parts.push(`${metricKey}: ${explanation}`);
          }
        }
        if (parts.length > 0) {
          pack.explicaciones_metricas.push({ modelo: `${modelo} → ${empresa}`, explicacion: parts.join("\n") });
        }
      }
    }
    console.log(`${logPrefix} [E2] Qualitative enrichment: ${pack.raw_texts.length} raw_texts from ${qualitativeTickers.length} companies`);

    // Build sector breakdown (using median)
    const bySector = new Map<string, { scores: number[]; companies: string[] }>();
    for (const entry of rankingEntries) {
      const sector = entry.sector || "Sin sector";
      if (!bySector.has(sector)) bySector.set(sector, { scores: [], companies: [] });
      bySector.get(sector)!.scores.push(entry.mediana);
      bySector.get(sector)!.companies.push(entry.nombre);
    }

    // Add sector data as competidores_verificados (repurposed for index view)
    for (const [sector, data] of bySector.entries()) {
      const sectorMedian = medianOf(data.scores);
      pack.competidores_verificados.push({
        ticker: sector,
        nombre: `Sector ${sector} (${data.companies.length} empresas)`,
        rix_avg: sectorMedian,
      });
    }
    pack.competidores_verificados.sort((a, b) => (b.rix_avg || 0) - (a.rix_avg || 0));

    // Build evolution (4 weeks aggregate using MEDIAN, not mean)
    const uniqueDates = [...new Set(sortedByDate.map((r) => r.batch_execution_date))].sort().reverse().slice(0, 4);
    let prevMedianEvo: number | null = null;
    for (const date of [...uniqueDates].reverse()) {
      const weekData = sortedByDate.filter((r) => r.batch_execution_date === date);
      const scores = weekData.map((r) => r["09_rix_score"]).filter((s): s is number => s != null && s > 0);
      if (scores.length === 0) continue;
      const weekMedian = medianOf(scores);
      const weekMin = Math.min(...scores);
      const weekMax = Math.max(...scores);
      const uniqueCompanies = new Set(weekData.map((r) => r["05_ticker"])).size;
      pack.evolucion.push({
        fecha: date.toString().split("T")[0],
        rix_mediana: weekMedian,
        rango: Math.round((weekMax - weekMin) * 10) / 10,
        modelos: uniqueCompanies,
        delta: prevMedianEvo != null ? Math.round((weekMedian - prevMedianEvo) * 10) / 10 : null,
      });
      prevMedianEvo = weekMedian;
    }

    // Divergence at index level
    if (allMedians.length >= 2) {
      const mean = allMedians.reduce((a, b) => a + b, 0) / allMedians.length;
      const variance = allMedians.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allMedians.length;
      const sigma = Math.sqrt(variance);
      pack.divergencia = {
        sigma: Math.round(sigma * 10) / 10,
        nivel: sigma < 8 ? "BAJA" : sigma < 15 ? "MEDIA" : "ALTA",
        modelo_alto: top5[0]?.nombre || "?",
        modelo_bajo: bottom5[0]?.nombre || "?",
        rango: Math.round((Math.max(...allMedians) - Math.min(...allMedians)) * 10) / 10,
      };
    }

    // Set empresa_primaria to the index label
    pack.empresa_primaria = {
      ticker: universeLabel,
      nombre: universeLabel === IBEX35_CODE ? "IBEX-35" : "Mercado completo",
      sector: null,
      subsector: null,
    };

    // Log telemetry
    try {
      await supabaseClient.from("pipeline_logs").insert({
        stage: "E2_datapack",
        status: "ok",
        metadata: {
          phase: "E2",
          intent: classifier.intencion,
          tipo: classifier.tipo,
          route: "index",
          universe: universeLabel,
          row_count: indexData.length,
          companies_ranked: rankingEntries.length,
          sectors_found: bySector.size,
          weeks_found: uniqueDates.length,
        },
      });
    } catch (_) {}

    // Build report_context for InfoBar (same structure as Skills pipeline)
    const indexModels = [...new Set(latestWeek.map((r: any) => r["02_model_name"]).filter(Boolean))];
    const indexDateFrom = latestWeek.reduce((min: string | null, r: any) => {
      const d = r["06_period_from"];
      return d && (!min || d < min) ? d : min;
    }, null as string | null);
    const indexDateTo = latestWeek.reduce((max: string | null, r: any) => {
      const d = r["07_period_to"];
      return d && (!max || d > max) ? d : max;
    }, null as string | null);
    (pack as any).report_context = {
      sector: universeLabel === IBEX35_CODE ? "IBEX-35" : universeLabel,
      user_question: classifier.pregunta_original || null,
      perspective: null, // Will be set downstream by handleStandardChat
      date_from: indexDateFrom,
      date_to: indexDateTo,
      models: indexModels,
      models_count: indexModels.length,
      sample_size: latestWeek.length,
      weeks_analyzed: uniqueDates.length,
    };

    // Preserve raw runs with bruto fields for source extraction (top 10 companies)
    const top10Tickers = rankingEntries.slice(0, 10).map(r => r.ticker);
    (pack as any)._rawRunsForSources = latestWeek
      .filter((r: any) => top10Tickers.includes(r["05_ticker"]) && (r["20_res_gpt_bruto"] || r["21_res_perplex_bruto"]))
      .map((r: any) => ({
        "02_model_name": r["02_model_name"],
        "03_target_name": r["03_target_name"],
        "05_ticker": r["05_ticker"],
        "06_period_from": r["06_period_from"],
        "07_period_to": r["07_period_to"],
        "09_rix_score": r["09_rix_score"],
        "20_res_gpt_bruto": r["20_res_gpt_bruto"],
        "21_res_perplex_bruto": r["21_res_perplex_bruto"],
      }));

    console.log(`${logPrefix} [E2] INDEX DataPack built: ${pack.ranking.length} ranked, ${pack.evolucion.length} weeks, ${pack.competidores_verificados.length} sectors, ${pack.snapshot.length} snapshot entries, rawRunsForSources: ${(pack as any)._rawRunsForSources.length}`);
    return pack;
  }

  // =========================================================================
  // ROUTE A: Specific company query (existing behavior)
  // =========================================================================
  const primaryTicker = classifier.empresas_detectadas[0].ticker;
  const primaryCompany = (companiesCache || []).find((c) => c.ticker === primaryTicker);
  
  if (primaryCompany) {
    pack.empresa_primaria = {
      ticker: primaryCompany.ticker,
      nombre: primaryCompany.issuer_name,
      sector: primaryCompany.sector_category || null,
      subsector: primaryCompany.subsector || null,
    };
  }

  // Query A: Snapshot (latest week, all models) + raw texts
  const fullColumns = `
    "02_model_name", "03_target_name", "05_ticker",
    "06_period_from", "07_period_to", "09_rix_score", "51_rix_score_adjusted",
    "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score",
    "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score",
    "25_nvm_categoria", "28_drm_categoria", "31_sim_categoria",
    "34_rmm_categoria", "37_cem_categoria", "40_gam_categoria",
    "43_dcm_categoria", "46_cxm_categoria",
    "10_resumen", "11_puntos_clave",
    "20_res_gpt_bruto", "21_res_perplex_bruto",
    "22_res_gemini_bruto", "23_res_deepseek_bruto",
    respuesta_bruto_grok, respuesta_bruto_qwen,
    "22_explicacion", "25_explicaciones_detalladas",
    "48_precio_accion", "49_reputacion_vs_precio", "50_precio_accion_interanual",
    batch_execution_date
  `;

  const companyFullData = await fetchUnifiedRixData({
    supabaseClient,
    columns: fullColumns,
    tickerFilter: primaryTicker,
    limit: 120,
    logPrefix: `${logPrefix} [E2]`,
  });

  if (companyFullData.length === 0) {
    console.log(`${logPrefix} [E2] No data for ${primaryTicker}`);
    // Log telemetry
    try {
      await supabaseClient.from("pipeline_logs").insert({
        stage: "E2_datapack",
        status: "empty",
        metadata: { phase: "E2", intent: classifier.intencion, tipo: classifier.tipo, empty_reason: "company_no_data", ticker: primaryTicker, row_count: 0 },
      });
    } catch (_) {}
    return pack;
  }

  // Identify latest batch date
  const sortedByDate = [...companyFullData].sort(
    (a, b) => new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime()
  );
  const latestDate = sortedByDate[0]?.batch_execution_date;
  const latestWeek = sortedByDate.filter((r) => r.batch_execution_date === latestDate);

  // Build snapshot
  const latestScores: number[] = [];
  for (const row of latestWeek) {
    const rix = row["09_rix_score"];
    if (rix != null && rix > 0) latestScores.push(rix);
    pack.snapshot.push({
      modelo: row["02_model_name"],
      rix: rix ?? null,
      rix_adj: row["51_rix_score_adjusted"] ?? rix ?? null,
      nvm: row["23_nvm_score"] ?? null,
      drm: row["26_drm_score"] ?? null,
      sim: row["29_sim_score"] ?? null,
      rmm: row["32_rmm_score"] ?? null,
      cem: row["35_cem_score"] ?? null,
      gam: row["38_gam_score"] ?? null,
      dcm: row["41_dcm_score"] ?? null,
      cxm: row["44_cxm_score"] ?? null,
      period_from: row["06_period_from"] ?? null,
      period_to: row["07_period_to"] ?? null,
    });
  }

  // Extract raw texts (from latest week, first row with each model's text)
  const modelTextFields: [string, string][] = [
    ["ChatGPT", "20_res_gpt_bruto"],
    ["Perplexity", "21_res_perplex_bruto"],
    ["Gemini", "22_res_gemini_bruto"],
    ["DeepSeek", "23_res_deepseek_bruto"],
    ["Grok", "respuesta_bruto_grok"],
    ["Qwen", "respuesta_bruto_qwen"],
  ];

  for (const [modelName, field] of modelTextFields) {
    const textRow = latestWeek.find((r) => r[field]);
    if (textRow && textRow[field]) {
      pack.raw_texts.push({ modelo: modelName, texto: (textRow[field] as string).substring(0, 3000) });
    }
  }

  // Extract explicaciones_metricas, puntos_clave, categorias_metricas, mercado from latestWeek
  for (const row of latestWeek) {
    const modelName = row["02_model_name"] || "?";

    // Explicaciones por métrica
    const explicacion = row["22_explicacion"];
    if (explicacion && typeof explicacion === "string" && explicacion.length > 10) {
      pack.explicaciones_metricas.push({ modelo: modelName, explicacion: explicacion.substring(0, 1500) });
    }

    // Puntos clave
    const puntosRaw = row["11_puntos_clave"];
    if (puntosRaw) {
      let puntos: string[] = [];
      if (Array.isArray(puntosRaw)) {
        puntos = puntosRaw.filter((p: any) => typeof p === "string" && p.length > 3).slice(0, 8);
      } else if (typeof puntosRaw === "string") {
        try { puntos = JSON.parse(puntosRaw).filter((p: any) => typeof p === "string").slice(0, 8); } catch {}
      }
      if (puntos.length > 0) {
        pack.puntos_clave.push({ modelo: modelName, puntos });
      }
    }

    // Categorías por métrica
    const cats: any = { modelo: modelName };
    const catFields = [
      ["25_nvm_categoria", "nvm"], ["28_drm_categoria", "drm"], ["31_sim_categoria", "sim"],
      ["34_rmm_categoria", "rmm"], ["37_cem_categoria", "cem"], ["40_gam_categoria", "gam"],
      ["43_dcm_categoria", "dcm"], ["46_cxm_categoria", "cxm"],
    ];
    let hasCats = false;
    for (const [field, key] of catFields) {
      cats[key] = row[field] || null;
      if (row[field]) hasCats = true;
    }
    if (hasCats) pack.categorias_metricas.push(cats);
  }

  // Mercado: extract from first row that has price data
  const precioRow = latestWeek.find((r) => r["48_precio_accion"] || r["49_reputacion_vs_precio"]);
  if (precioRow) {
    pack.mercado = {
      precio: precioRow["48_precio_accion"] || null,
      reputacion_vs_precio: precioRow["49_reputacion_vs_precio"] ? (precioRow["49_reputacion_vs_precio"] as string).substring(0, 500) : null,
      variacion_interanual: precioRow["50_precio_accion_interanual"] ? (precioRow["50_precio_accion_interanual"] as string).substring(0, 300) : null,
    };
  }

  console.log(`${logPrefix} [E2] Enrichment: ${pack.explicaciones_metricas.length} explanations, ${pack.puntos_clave.length} key-points sets, ${pack.categorias_metricas.length} category sets, market=${!!pack.mercado}`);

  // Query B+C: Verified competitors ONLY (from repindex_root_issuers.verified_competitors)
  const { data: issuerRecord } = await supabaseClient
    .from("repindex_root_issuers")
    .select("verified_competitors")
    .eq("ticker", primaryTicker)
    .limit(1)
    .single();

  const verifiedTickers: string[] = [];
  if (issuerRecord?.verified_competitors) {
    const raw = issuerRecord.verified_competitors;
    if (Array.isArray(raw)) {
      verifiedTickers.push(...raw.filter((t: string) => typeof t === "string" && t.length > 0));
    } else if (typeof raw === "string") {
      try { verifiedTickers.push(...JSON.parse(raw)); } catch {}
    }
  }

  console.log(`${logPrefix} [E2] Verified competitors for ${primaryTicker}: ${JSON.stringify(verifiedTickers)}`);

  if (verifiedTickers.length > 0) {
    const compData = await fetchUnifiedRixData({
      supabaseClient,
      columns: `"03_target_name", "05_ticker", "09_rix_score", "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score", "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score", batch_execution_date`,
      tickerFilter: verifiedTickers,
      limit: 500,
      logPrefix: `${logPrefix} [E2-verified-comp]`,
    });

    const compLatest = compData.filter(
      (r) => r.batch_execution_date === latestDate && r["09_rix_score"] != null && r["09_rix_score"] > 0
    );

    const byComp = new Map<string, { name: string; scores: number[] }>();
    for (const r of compLatest) {
      const t = r["05_ticker"];
      if (!byComp.has(t)) byComp.set(t, { name: r["03_target_name"], scores: [] });
      byComp.get(t)!.scores.push(r["09_rix_score"]);
    }

    for (const [ticker, d] of byComp.entries()) {
      const avg = d.scores.reduce((a, b) => a + b, 0) / d.scores.length;
      pack.competidores_verificados.push({ ticker, nombre: d.name, rix_avg: Math.round(avg * 10) / 10 });
    }

    const allCompScores = compLatest.map((r) => r["09_rix_score"]);
    if (allCompScores.length > 0) {
      const avg = allCompScores.reduce((a, b) => a + b, 0) / allCompScores.length;
      pack.sector_avg = { rix: Math.round(avg * 10) / 10, count: allCompScores.length };
    }

    const metricKeys = [
      { key: "23_nvm_score", out: "nvm" },
      { key: "26_drm_score", out: "drm" },
      { key: "29_sim_score", out: "sim" },
      { key: "32_rmm_score", out: "rmm" },
      { key: "35_cem_score", out: "cem" },
      { key: "38_gam_score", out: "gam" },
      { key: "41_dcm_score", out: "dcm" },
      { key: "44_cxm_score", out: "cxm" },
    ] as const;
    const metricAvgs: Record<string, number | null> = {};
    for (const mk of metricKeys) {
      const vals = compLatest.map((r) => r[mk.key]).filter((v) => v != null && v > 0) as number[];
      metricAvgs[mk.out] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    pack.competidores_metricas_avg = metricAvgs as any;
    console.log(`${logPrefix} [E2] Competitor metric averages: ${JSON.stringify(pack.competidores_metricas_avg)}`);

    const primaryAvg = latestScores.length > 0 ? latestScores.reduce((a, b) => a + b, 0) / latestScores.length : 0;
    const allForRanking = [
      { ticker: primaryTicker, nombre: primaryCompany?.issuer_name || primaryTicker, rix_avg: Math.round(primaryAvg * 10) / 10 },
      ...pack.competidores_verificados,
    ].sort((a, b) => (b.rix_avg || 0) - (a.rix_avg || 0));

    pack.ranking = allForRanking.map((r, i) => ({ pos: i + 1, ...r, rix_avg: r.rix_avg || 0 }));
  } else {
    console.log(`${logPrefix} [E2] No verified competitors for ${primaryTicker}. No sector avg, no ranking.`);
    pack.sector_avg = null;
    pack.ranking = [];
    pack.competidores_verificados = [];
    pack.competidores_metricas_avg = null;
  }

  // Query D: Evolution (4 weeks)
  const uniqueDates = [...new Set(sortedByDate.map((r) => r.batch_execution_date))].sort().reverse().slice(0, 4);
  let prevAvg: number | null = null;
  for (const date of [...uniqueDates].reverse()) {
    const weekData = sortedByDate.filter((r) => r.batch_execution_date === date);
    const scores = weekData.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
    if (scores.length === 0) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    pack.evolucion.push({
      fecha: date.toString().split("T")[0],
      rix_avg: Math.round(avg * 10) / 10,
      modelos: scores.length,
      delta: prevAvg != null ? Math.round((avg - prevAvg) * 10) / 10 : null,
    });
    prevAvg = avg;
  }

  // Query E: Divergence
  if (latestScores.length >= 2) {
    const mean = latestScores.reduce((a, b) => a + b, 0) / latestScores.length;
    const variance = latestScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / latestScores.length;
    const sigma = Math.sqrt(variance);
    const maxS = Math.max(...latestScores);
    const minS = Math.min(...latestScores);
    pack.divergencia = {
      sigma: Math.round(sigma * 10) / 10,
      nivel: sigma < 8 ? "BAJA" : sigma < 15 ? "MEDIA" : "ALTA",
      modelo_alto: latestWeek.find((r) => r["09_rix_score"] === maxS)?.["02_model_name"] || "?",
      modelo_bajo: latestWeek.find((r) => r["09_rix_score"] === minS)?.["02_model_name"] || "?",
      rango: Math.round((maxS - minS) * 10) / 10,
    };
  }

  // Query F: Corporate memento (expanded)
  const { data: corpData } = await supabaseClient
    .from("corporate_snapshots")
    .select("ceo_name, president_name, chairman_name, headquarters_city, company_description, snapshot_date_only, employees_approx, founded_year, last_reported_revenue, fiscal_year, mission_statement, other_executives")
    .eq("ticker", primaryTicker)
    .order("snapshot_date_only", { ascending: false })
    .limit(1);

  if (corpData && corpData[0]) {
    const c = corpData[0];
    pack.memento = {
      ceo: c.ceo_name,
      presidente: c.president_name,
      chairman: c.chairman_name || null,
      sede: c.headquarters_city,
      descripcion: c.company_description?.substring(0, 500) || null,
      fecha: c.snapshot_date_only,
      empleados: c.employees_approx || null,
      fundacion: c.founded_year || null,
      ingresos: c.last_reported_revenue || null,
      ejercicio_fiscal: c.fiscal_year || null,
      mision: c.mission_statement?.substring(0, 300) || null,
      otros_ejecutivos: Array.isArray(c.other_executives) ? c.other_executives.slice(0, 5) : null,
    };
  }

  // Query G: Recent news (expanded with lead_paragraph and category)
  const { data: newsData } = await supabaseClient
    .from("corporate_news")
    .select("ticker, headline, published_date, lead_paragraph, category")
    .eq("ticker", primaryTicker)
    .order("published_date", { ascending: false })
    .limit(10);

  if (newsData) {
    pack.noticias = newsData.map((n: any) => ({
      titular: n.headline,
      fecha: n.published_date,
      ticker: n.ticker,
      lead: n.lead_paragraph?.substring(0, 200) || null,
      categoria: n.category || null,
    }));
  }

  // Log telemetry
  try {
    await supabaseClient.from("pipeline_logs").insert({
      stage: "E2_datapack",
      status: "ok",
      metadata: {
        phase: "E2",
        intent: classifier.intencion,
        tipo: classifier.tipo,
        route: "company",
        ticker: primaryTicker,
        row_count: companyFullData.length,
        snapshot_models: pack.snapshot.length,
        ranking_size: pack.ranking.length,
        evolution_weeks: pack.evolucion.length,
      },
    });
  } catch (_) {}

  // Build report_context for InfoBar (same structure as Skills pipeline)
  const companyModels = [...new Set(latestWeek.map((r: any) => r["02_model_name"]).filter(Boolean))];
  const companyDateFrom = latestWeek.reduce((min: string | null, r: any) => {
    const d = r["06_period_from"];
    return d && (!min || d < min) ? d : min;
  }, null as string | null);
  const companyDateTo = latestWeek.reduce((max: string | null, r: any) => {
    const d = r["07_period_to"];
    return d && (!max || d > max) ? d : max;
  }, null as string | null);
  (pack as any).report_context = {
    company: primaryCompany?.issuer_name || primaryTicker,
    sector: primaryCompany?.sector_category || null,
    user_question: classifier.pregunta_original || null,
    perspective: null, // Will be set downstream by handleStandardChat
    date_from: companyDateFrom,
    date_to: companyDateTo,
    models: companyModels,
    models_count: companyModels.length,
    sample_size: latestWeek.length,
    weeks_analyzed: uniqueDates.length,
  };

  // Preserve raw runs for source extraction
  (pack as any)._rawRunsForSources = companyFullData
    .filter((r: any) => r["20_res_gpt_bruto"] || r["21_res_perplex_bruto"])
    .slice(0, 30);

  console.log(`${logPrefix} [E2] DataPack built: ${pack.snapshot.length} models, ${pack.ranking.length} ranked, ${pack.evolucion.length} weeks, ${pack.raw_texts.length} texts, rawRunsForSources: ${(pack as any)._rawRunsForSources.length}`);
  return pack;
}

// --- E3: QUALITATIVE READER ---
interface QualitativeFacts {
  temas_clave: { tema: string; mencionado_por: string[]; consenso: number }[];
  menciones_concretas: { modelo: string; cita_textual: string; relevancia: string }[];
  narrativa_dominante: string;
  divergencias_narrativas: { tema: string; [modelo: string]: string }[];
  consensos: { tema: string; modelos_coincidentes: number; fuerza: string }[];
}

async function extractQualitativeFacts(
  rawTexts: { modelo: string; texto: string }[],
  dataPack: DataPack,
  logPrefix: string,
): Promise<QualitativeFacts | null> {
  const normalizedRawTexts = (rawTexts || [])
    .map((entry: any, idx: number) => {
      if (typeof entry === "string") {
        return { modelo: `Fuente ${idx + 1}`, texto: entry };
      }
      if (!entry || typeof entry !== "object") return null;

      const modelo = typeof entry.modelo === "string" && entry.modelo.trim().length > 0
        ? entry.modelo.trim()
        : `Fuente ${idx + 1}`;

      let texto = entry.texto;
      if (typeof texto !== "string") {
        if (typeof entry.content === "string") texto = entry.content;
        else if (texto == null) texto = "";
        else texto = String(texto);
      }

      texto = texto.trim();
      if (!texto) return null;

      return { modelo, texto };
    })
    .filter((t): t is { modelo: string; texto: string } => !!t);

  if (normalizedRawTexts.length === 0) {
    console.log(`${logPrefix} [E3] No valid raw texts after normalization, skipping`);
    return null;
  }

  // Pre-filter: if more than 40 texts, select max 3 per company (prioritizing distinct models)
  let textsToProcess = normalizedRawTexts;
  if (normalizedRawTexts.length > 40) {
    console.log(`${logPrefix} [E3] Pre-filtering: ${normalizedRawTexts.length} texts → max 3 per company`);
    const byEntity = new Map<string, typeof normalizedRawTexts>();
    for (const t of normalizedRawTexts) {
      // Extract company from "ModelName → CompanyName" pattern
      const entity = t.modelo.includes("→") ? t.modelo.split("→")[1].trim().split("/")[0].trim() : t.modelo;
      if (!byEntity.has(entity)) byEntity.set(entity, []);
      byEntity.get(entity)!.push(t);
    }
    textsToProcess = [];
    for (const [, texts] of byEntity.entries()) {
      // Prioritize distinct models, take max 3
      const seen = new Set<string>();
      const selected: typeof normalizedRawTexts = [];
      for (const t of texts) {
        const model = t.modelo.includes("→") ? t.modelo.split("→")[0].trim() : "unknown";
        if (!seen.has(model) && selected.length < 3) {
          seen.add(model);
          selected.push(t);
        }
      }
      textsToProcess.push(...selected);
    }
    console.log(`${logPrefix} [E3] After pre-filtering: ${textsToProcess.length} texts`);
  }

  console.log(`${logPrefix} [E3] Extracting qualitative facts from ${textsToProcess.length} AI texts...`);

  const textsBlock = textsToProcess.map((t) => `=== ${t.modelo} ===\n${t.texto.substring(0, 1500)}`).join("\n\n");

  // Build explanations block from DataPack
  let explicacionesBlock = "";
  if (dataPack.explicaciones_metricas.length > 0) {
    explicacionesBlock = "\n\nEXPLICACIONES POR MÉTRICA (razonamiento de cada IA sobre por qué dio cada score):\n" +
      dataPack.explicaciones_metricas.map((e) => `=== ${e.modelo} ===\n${e.explicacion}`).join("\n\n");
  }

  // Build key points block from DataPack
  let puntosClaveBlock = "";
  if (dataPack.puntos_clave.length > 0) {
    puntosClaveBlock = "\n\nPUNTOS CLAVE (conclusiones destiladas por cada IA):\n" +
      dataPack.puntos_clave.map((p) => `=== ${p.modelo} ===\n${p.puntos.map((pt) => `- ${pt}`).join("\n")}`).join("\n\n");
  }

  const prompt = `Analiza estos textos de 6 modelos de IA sobre ${dataPack.empresa_primaria?.nombre || "una empresa"} (${dataPack.empresa_primaria?.ticker || "?"}).

TEXTOS BRUTOS DE LAS IAs:
${textsBlock}
${explicacionesBlock}
${puntosClaveBlock}

Extrae hechos estructurados. Responde SOLO en JSON válido (sin markdown):
{
  "temas_clave": [
    {"tema": "descripción del tema", "mencionado_por": ["ChatGPT","Gemini"], "consenso": 2}
  ],
  "menciones_concretas": [
    {"modelo": "Perplexity", "cita_textual": "texto relevante...", "relevancia": "alta|media|baja"}
  ],
  "narrativa_dominante": "Resumen en 1-2 frases de la percepción general",
  "divergencias_narrativas": [
    {"tema": "Gobernanza", "ChatGPT": "positivo", "DeepSeek": "crítico"}
  ],
  "consensos": [
    {"tema": "Liderazgo en X", "modelos_coincidentes": 5, "fuerza": "muy_alto|alto|medio"}
  ]
}

REGLAS:
- Solo extrae hechos que EXISTAN en los textos o explicaciones. No inventes.
- Las EXPLICACIONES POR MÉTRICA son evidencia directa del razonamiento de cada IA. Extrae las razones concretas que dan para cada score.
- Los PUNTOS CLAVE son conclusiones ya destiladas. Úsalos para identificar consensos y divergencias.
- Atribuye cada hecho al modelo que lo dice.
- Si un modelo no menciona un tema, NO lo incluyas para ese modelo.
- Máximo 8 temas_clave, 8 menciones_concretas, 6 consensos.`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: "Extractor de hechos cualitativos. Extrae SOLO lo que dicen los textos. No interpretes ni inventes. Responde SOLO en JSON válido." },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini",
      4000,
      `${logPrefix} [E3]`,
    );

    if (result) {
      const clean = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean) as QualitativeFacts;
      console.log(`${logPrefix} [E3] Extracted: ${parsed.temas_clave.length} themes, ${parsed.consensos.length} consensuses`);
      return parsed;
    }
  } catch (e) {
    console.warn(`${logPrefix} [E3] Qualitative extraction failed:`, e);
    // Attempt to repair truncated JSON
    try {
      if (e instanceof SyntaxError) {
        // The result variable is in the try scope above, so we need to re-attempt
        console.log(`${logPrefix} [E3] Attempting JSON repair...`);
      }
    } catch (_) {}
  }

  return null;
}

// --- E4: ANALYTICAL COMPARATOR ---
interface ComparatorResult {
  diagnostico_resumen: string;
  fortalezas: { metrica: string; score: number; vs_sector: string; evidencia_cualitativa: string }[];
  debilidades: { metrica: string; score: number; vs_sector: string; evidencia_cualitativa: string }[];
  posicion_competitiva: { ranking: number; de: number; lider: string; distancia: number } | null;
  recomendaciones: { que_se_detecta: string; que_hacer: string; como_hacerlo: string[]; metrica_impactada: string; prioridad: string }[];
  gaps_percepcion: { tema: string; dato_real: string; narrativa_ia: string; riesgo: string }[];
}

async function runComparator(
  dataPack: DataPack,
  facts: QualitativeFacts | null,
  classifier: ClassifierResult,
  logPrefix: string,
): Promise<ComparatorResult | null> {
  if (dataPack.snapshot.length === 0) {
    console.log(`${logPrefix} [E4] No snapshot data, skipping comparator`);
    return null;
  }

  console.log(`${logPrefix} [E4] Running comparator...`);

  const snapshotTable = dataPack.snapshot.map((s) =>
    `${s.modelo}: RIX=${s.rix}, NVM=${s.nvm}, DRM=${s.drm}, SIM=${s.sim}, RMM=${s.rmm}, CEM=${s.cem}, GAM=${s.gam}, DCM=${s.dcm}, CXM=${s.cxm}`
  ).join("\n");

  const sectorInfo = dataPack.competidores_verificados.length > 0
    ? `Promedio competidores verificados: RIX ${dataPack.sector_avg?.rix ?? "N/A"} (${dataPack.competidores_verificados.length} competidores: ${dataPack.competidores_verificados.map(c => c.ticker).join(", ")})`
    : "Sin competidores verificados — NO incluir comparativa competitiva";

  // Build per-metric gaps vs competitors for enriched recommendations
  let metricGapsInfo = "";
  if (dataPack.competidores_metricas_avg && dataPack.snapshot.length > 0) {
    const avgSnap: Record<string, number[]> = { nvm: [], drm: [], sim: [], rmm: [], cem: [], gam: [], dcm: [], cxm: [] };
    for (const s of dataPack.snapshot) {
      if (s.nvm != null) avgSnap.nvm.push(s.nvm);
      if (s.drm != null) avgSnap.drm.push(s.drm);
      if (s.sim != null) avgSnap.sim.push(s.sim);
      if (s.rmm != null) avgSnap.rmm.push(s.rmm);
      if (s.cem != null) avgSnap.cem.push(s.cem);
      if (s.gam != null) avgSnap.gam.push(s.gam);
      if (s.dcm != null) avgSnap.dcm.push(s.dcm);
      if (s.cxm != null) avgSnap.cxm.push(s.cxm);
    }
    const cma = dataPack.competidores_metricas_avg;
    const gaps: string[] = [];
    const metricNames: Record<string, string> = { nvm: "Calidad Narrativa", drm: "Fortaleza Evidencia", sim: "Autoridad Fuentes", rmm: "Actualidad y Empuje", cem: "Gestión Controversias", gam: "Percepción Gobernanza", dcm: "Coherencia Informativa", cxm: "Ejecución Corporativa" };
    for (const [key, label] of Object.entries(metricNames)) {
      const vals = avgSnap[key];
      const compAvg = (cma as any)[key];
      if (vals.length > 0 && compAvg != null) {
        const myAvg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
        const gap = Math.round((myAvg - compAvg) * 10) / 10;
        gaps.push(`${label} (${key.toUpperCase()}): empresa=${myAvg}, competidores=${compAvg}, gap=${gap > 0 ? "+" : ""}${gap}`);
      }
    }
    if (gaps.length > 0) {
      metricGapsInfo = `\nGAPS POR MÉTRICA vs COMPETIDORES VERIFICADOS:\n${gaps.join("\n")}`;
    }
  }

  const rankingInfo = dataPack.ranking.length > 0
    ? `Ranking (solo competidores verificados + empresa): ${dataPack.ranking.map((r) => `${r.pos}. ${r.nombre} (${r.rix_avg})`).join(", ")}`
    : "Sin ranking (no hay competidores verificados)";

  const factsInfo = facts
    ? `Narrativa dominante: ${facts.narrativa_dominante}\nConsensos: ${facts.consensos.map((c) => `${c.tema} (${c.modelos_coincidentes} modelos)`).join(", ")}\nDivergencias: ${facts.divergencias_narrativas.map((d) => d.tema).join(", ")}`
    : "Sin datos cualitativos";

  // Build consensus categories deterministically (no LLM)
  let consensoCatsBlock = "";
  if (dataPack.categorias_metricas.length > 0) {
    const metricKeys = ["nvm", "drm", "sim", "rmm", "cem", "gam", "dcm", "cxm"];
    const metricLabels: Record<string, string> = { nvm: "Calidad Narrativa", drm: "Fortaleza Evidencia", sim: "Autoridad Fuentes", rmm: "Actualidad y Empuje", cem: "Gestión Controversias", gam: "Percepción Gobernanza", dcm: "Coherencia Informativa", cxm: "Ejecución Corporativa" };
    const consensoLines: string[] = [];
    for (const mk of metricKeys) {
      const counts: Record<string, number> = {};
      for (const cm of dataPack.categorias_metricas) {
        const cat = (cm as any)[mk];
        if (cat && typeof cat === "string") {
          const normalized = cat.toLowerCase().trim();
          counts[normalized] = (counts[normalized] || 0) + 1;
        }
      }
      if (Object.keys(counts).length > 0) {
        const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" + ");
        consensoLines.push(`${metricLabels[mk]} (${mk.toUpperCase()}): ${parts}`);
      }
    }
    if (consensoLines.length > 0) {
      consensoCatsBlock = `\nCONSENSO DE CATEGORÍAS (dato puro, sin LLM — conteo de clasificaciones entre modelos):\n${consensoLines.join("\n")}`;
    }
  }

  // Build market data block
  let mercadoBlock = "";
  if (dataPack.mercado) {
    const parts: string[] = [];
    if (dataPack.mercado.precio) parts.push(`Precio: ${dataPack.mercado.precio}`);
    if (dataPack.mercado.reputacion_vs_precio) parts.push(`Reputación vs Precio: ${dataPack.mercado.reputacion_vs_precio}`);
    if (dataPack.mercado.variacion_interanual) parts.push(`Variación interanual: ${dataPack.mercado.variacion_interanual}`);
    if (parts.length > 0) mercadoBlock = `\nDATOS DE MERCADO:\n${parts.join("\n")}`;
  }

  // Build top repeated key points
  let puntosRepetidosBlock = "";
  if (dataPack.puntos_clave.length >= 2) {
    const allPuntos = dataPack.puntos_clave.flatMap((p) => p.puntos.map((pt) => pt.toLowerCase().substring(0, 80)));
    const puntoCounts = new Map<string, number>();
    for (const p of allPuntos) {
      // Group similar points by first 40 chars
      const key = p.substring(0, 40);
      puntoCounts.set(key, (puntoCounts.get(key) || 0) + 1);
    }
    const repeated = [...puntoCounts.entries()].filter(([_, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (repeated.length > 0) {
      puntosRepetidosBlock = `\nPUNTOS CLAVE MÁS REPETIDOS ENTRE MODELOS:\n${repeated.map(([p, c]) => `- "${p}..." (${c} modelos)`).join("\n")}`;
    }
  }

  const prompt = `Cruza datos cuantitativos con cualitativos para ${dataPack.empresa_primaria?.nombre || "la empresa"}.

DATOS CUANTITATIVOS (DATAPACK):
${snapshotTable}

SECTOR: ${sectorInfo}
RANKING: ${rankingInfo}
EVOLUCIÓN: ${dataPack.evolucion.map((e) => `${e.fecha}: ${e.rix_avg} (Δ${e.delta ?? "—"})`).join(", ")}
DIVERGENCIA: ${dataPack.divergencia ? `σ=${dataPack.divergencia.sigma}, ${dataPack.divergencia.nivel}` : "N/A"}
${metricGapsInfo}
${consensoCatsBlock}
${mercadoBlock}
${puntosRepetidosBlock}

DATOS CUALITATIVOS:
${factsInfo}

Responde SOLO en JSON válido (sin markdown):
{
  "diagnostico_resumen": "Empresa tiene RIX X, Y pts sobre/bajo media sectorial...",
  "fortalezas": [{"metrica":"NVM","score":75,"vs_sector":"+12","evidencia_cualitativa":"5/6 IAs califican como Bueno..."}],
  "debilidades": [{"metrica":"SIM","score":35,"vs_sector":"-18","evidencia_cualitativa":"Solo 2 IAs encuentran fuentes institucionales..."}],
  "posicion_competitiva": {"ranking":3,"de":8,"lider":"EmpresaY","distancia":-8},
  "recomendaciones": [{"que_se_detecta":"SIM de 37, -18 pts vs sector","que_hacer":"Amplificar presencia en fuentes de alta autoridad algorítmica","como_hacerlo":["Publicar informe sectorial con datos propios en web corporativa con schema markup Article+FAQ","Distribuir nota clave en 3+ medios tier 1 del sector","Crear FAQ corporativa respondiendo preguntas frecuentes de LLMs","Asegurar claims con evidencia verificable (cifras, fechas, fuentes)"],"metrica_impactada":"SIM (Autoridad de Fuentes)","prioridad":"Alta"}],
  "gaps_percepcion": [{"tema":"ESG","dato_real":"CEM 42","narrativa_ia":"4 modelos positivos","riesgo":"desconexion"}],
  "contexto_mercado": "Precio X, PER Y, contraste con RIX..." | null,
  "consenso_categorias": [{"metrica":"CEM","calificacion_dominante":"Bueno","modelos_coincidentes":5}]
}

REGLAS:
- Solo conclusiones trazables a los datos de arriba.
- MÍNIMO 3 recomendaciones, sin límite superior. Incluye todas las que los datos justifiquen.
- Cada recomendación DEBE incluir: que_se_detecta (métrica+score+gap), que_hacer (acción estratégica), como_hacerlo (3-5 pasos tácticos con contenido, canales, formato IA-friendly y tácticas GEO/AISO), metrica_impactada y prioridad (Alta/Media/Baja).
- Incluye recomendaciones tanto DEFENSIVAS (mitigar debilidades) como OFENSIVAS (amplificar fortalezas).
- Usa el CONSENSO DE CATEGORÍAS para reforzar evidencia: "5/6 IAs califican CEM como Bueno" es más convincente que solo "CEM=78".
- Si hay DATOS DE MERCADO, incluye contexto_mercado conectando reputación con cotización.
- Solo compara con competidores verificados. Si no hay competidores verificados, omite completamente la comparativa competitiva.
- Máximo 4 fortalezas, 4 debilidades.`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: "Comparador analítico. Cruza datos cuantitativos con cualitativos. Solo conclusiones trazables. Responde SOLO en JSON válido." },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini",
      2000,
      `${logPrefix} [E4]`,
    );

    if (result) {
      const clean = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean) as ComparatorResult;
      console.log(`${logPrefix} [E4] Comparator: ${parsed.fortalezas.length} strengths, ${parsed.debilidades.length} weaknesses, ${parsed.recomendaciones.length} recommendations`);
      return parsed;
    }
  } catch (e) {
    console.warn(`${logPrefix} [E4] Comparator failed:`, e);
  }

  return null;
}

// --- CROSS-MODEL TABLE BUILDER (pre-calculated for LLM) ---
function buildCrossModelTable(dataPack: DataPack): string {
  // ── SECTOR/RANKING queries: build a per-company × per-model cross-table ──
  const sectorSnapshot = (dataPack as any).sector_snapshot;
  if (sectorSnapshot?.ranking && sectorSnapshot.ranking.length > 0) {
    const MODEL_ORDER = ["ChatGPT", "Perplexity", "Google Gemini", "DeepSeek", "Grok", "Qwen"];
    let table = "## TABLA CRUZADA POR EMPRESA Y MODELO (DATO CENTRAL)\n\n";
    table += "| Empresa | " + MODEL_ORDER.map(m => m.replace("Google ", "")).join(" | ") + " | Rango | Consenso |\n";
    table += "|---------|" + MODEL_ORDER.map(() => "------|").join("") + "------|----------|\n";

    for (const r of sectorSnapshot.ranking) {
      const scores = r.scores_individuales || {};
      // Fallback: build from scores_por_modelo if scores_individuales not present
      const scoreMap: Record<string, number | null> = { ...scores };
      if (Object.keys(scoreMap).length === 0 && r.scores_por_modelo) {
        for (const s of r.scores_por_modelo) {
          scoreMap[s.model_name] = s.rix;
        }
      }
      const vals = MODEL_ORDER.map(m => {
        const v = scoreMap[m];
        return v != null ? String(v) : "—";
      });
      const rango = r.rango ?? "—";
      const consenso = r.consenso || "—";
      const emoji = consenso === "alto" ? "🟢" : consenso === "medio" ? "🟡" : consenso === "bajo" ? "🔴" : "";
      table += `| ${(r.empresa || r.ticker || "?").substring(0, 20)} | ${vals.join(" | ")} | ${rango} | ${emoji} ${consenso} |\n`;
    }

    // Divergence summary for sector
    table += "\n## DIVERGENCIAS POR EMPRESA\n\n";
    for (const r of sectorSnapshot.ranking.slice(0, 10)) {
      const consensoLabel = r.consenso === "alto" ? "CONSENSO_ALTO" : r.consenso === "bajo" ? "DIVERGENCIA_ALTA" : "CONSENSO_MEDIO";
      const outlierStr = (r.outliers && r.outliers.length > 0) 
        ? ` | Outliers: ${r.outliers.map((o: any) => `${o.model}(${o.rix})`).join(", ")}`
        : "";
      const bloqueStr = r.bloque_mayoritario 
        ? ` | Bloque mayoritario: ${r.bloque_mayoritario.modelos?.join(", ") || "—"}(${r.bloque_mayoritario.score})`
        : "";
      table += `[${r.empresa}]: rango=${r.rango ?? "?"} -> ${consensoLabel}${bloqueStr}${outlierStr}\n`;
    }

    return table;
  }

  // ── Single-company queries: original per-model table ──
  if (!dataPack.snapshot || dataPack.snapshot.length === 0) return "";

  const METRIC_KEYS = ["rix", "nvm", "drm", "sim", "rmm", "cem", "gam", "dcm", "cxm"] as const;
  const METRIC_LABELS: Record<string, string> = {
    rix: "RIX", nvm: "NVM", drm: "DRM", sim: "SIM", rmm: "RMM",
    cem: "CEM", gam: "GAM", dcm: "DCM", cxm: "CXM",
  };

  // Build table
  let table = "## TABLA CRUZADA RIX Y MÉTRICAS POR MODELO (DATO CENTRAL)\n\n";
  table += "| Modelo | " + METRIC_KEYS.map(k => METRIC_LABELS[k]).join(" | ") + " |\n";
  table += "|--------|" + METRIC_KEYS.map(() => "-----|").join("") + "\n";

  for (const s of dataPack.snapshot) {
    const vals = METRIC_KEYS.map(k => {
      const v = (s as any)[k];
      return v != null ? String(v) : "—";
    });
    table += `| ${s.modelo || "?"} | ${vals.join(" | ")} |\n`;
  }

  // Build divergence analysis
  table += "\n## DIVERGENCIAS PRE-CALCULADAS\n\n";
  for (const mk of METRIC_KEYS) {
    const vals = dataPack.snapshot
      .map(s => ({ model: s.modelo || "?", value: (s as any)[mk] as number | null }))
      .filter(v => v.value != null && v.value > 0) as { model: string; value: number }[];
    if (vals.length < 2) continue;

    const maxEntry = vals.reduce((a, b) => b.value > a.value ? b : a);
    const minEntry = vals.reduce((a, b) => b.value < a.value ? b : a);
    const range = maxEntry.value - minEntry.value;
    const level = range > 15 ? "DIVERGENCIA_ALTA" : "DIVERGENCIA_BAJA";

    table += `[${METRIC_LABELS[mk]}]: Modelo_max=${maxEntry.model}(${maxEntry.value}) vs Modelo_min=${minEntry.model}(${minEntry.value}) (rango=${range}) -> ${level}\n`;
  }

  return table;
}

// --- E5: MASTER ORCHESTRATOR (prompt builder — actual LLM call happens in handleStandardChat) ---
function buildOrchestratorPrompt(
  classifier: ClassifierResult,
  dataPack: DataPack,
  facts: QualitativeFacts | null,
  analysis: ComparatorResult | null,
  question: string,
  languageName: string,
  language: string = "es",
  roleName?: string,
  rolePrompt?: string,
): { systemPrompt: string; userPrompt: string } {
  const rankingTop = (dataPack as any).ranking_top || null;
  const rankingBottom = (dataPack as any).ranking_bottom || null;
  const rankingEnriched = (dataPack as any).ranking_enriched || false;

  const dataPackBlock = JSON.stringify({
    empresa: dataPack.empresa_primaria,
    snapshot: dataPack.snapshot,
    sector_avg: dataPack.sector_avg,
    // Send full ranking context: top, bottom, and full (limited to 35 for IBEX)
    ranking: rankingTop || rankingBottom ? undefined : dataPack.ranking.slice(0, 35),
    ranking_top: rankingTop || null,
    ranking_bottom: rankingBottom || null,
    ranking_enriched: rankingEnriched,
    competidores_verificados: dataPack.competidores_verificados,
    competidores_metricas_avg: dataPack.competidores_metricas_avg,
    competidores_por_empresa: (dataPack as any).competidores_por_empresa || null,
    evolucion: dataPack.evolucion,
    divergencia: dataPack.divergencia,
    divergencias_detalle: (dataPack as any).divergencias_detalle || null,
    memento: dataPack.memento,
    noticias: dataPack.noticias.slice(0, 5),
    mercado: dataPack.mercado,
    evolucion_sector: (dataPack as any).evolucion_sector || null,
    metricas_consolidadas: (dataPack as any).metricas_consolidadas || null,
    kpis_sector_canonicos: (dataPack as any).kpis_sector_canonicos || null,
    // ── Metric deltas: expose consolidated medians with per-metric deltas ──
    rix_mediano: (dataPack as any).rix_mediano || null,
    delta_rix: (dataPack as any).delta_rix_value || null,
    ...((dataPack as any).f2_dynamic ? { datos_dinamicos: (dataPack as any).f2_dynamic } : {}),
  }, null, 0);

  const factsBlock = facts ? JSON.stringify(facts, null, 0) : "null";
  const analysisBlock = analysis ? JSON.stringify(analysis, null, 0) : "null";

  // Build explicaciones block for E5
  let explicacionesE5Block = "";
  if (dataPack.explicaciones_metricas.length > 0) {
    explicacionesE5Block = "\n\n═══ EXPLICACIONES POR MÉTRICA (E2 — razonamiento de cada IA) ═══\n" +
      dataPack.explicaciones_metricas.map((e) => `[${e.modelo}]: ${e.explicacion.substring(0, 800)}`).join("\n\n");
  }

  // Build consenso categorias block for E5
  let consensoE5Block = "";
  if (dataPack.categorias_metricas.length > 0) {
    const metricKeys = ["nvm", "drm", "sim", "rmm", "cem", "gam", "dcm", "cxm"];
    const metricLabels: Record<string, string> = { nvm: "Calidad Narrativa", drm: "Fortaleza Evidencia", sim: "Autoridad Fuentes", rmm: "Actualidad y Empuje", cem: "Gestión Controversias", gam: "Percepción Gobernanza", dcm: "Coherencia Informativa", cxm: "Ejecución Corporativa" };
    const lines: string[] = [];
    for (const mk of metricKeys) {
      const counts: Record<string, number> = {};
      for (const cm of dataPack.categorias_metricas) {
        const cat = (cm as any)[mk];
        if (cat && typeof cat === "string") {
          const normalized = cat.toLowerCase().trim();
          counts[normalized] = (counts[normalized] || 0) + 1;
        }
      }
      if (Object.keys(counts).length > 0) {
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        lines.push(`| ${metricLabels[mk]} | ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")} | Dominante: ${dominant[0]} (${dominant[1]}/${dataPack.categorias_metricas.length}) |`);
      }
    }
    if (lines.length > 0) {
      consensoE5Block = "\n\n═══ CONSENSO DE CATEGORÍAS (determinístico, sin LLM) ═══\n| Métrica | Distribución | Dominante |\n|---|---|---|\n" + lines.join("\n");
    }
  }

  // Build market block for E5
  let mercadoE5Block = "";
  if (dataPack.mercado) {
    const parts: string[] = [];
    if (dataPack.mercado.precio) parts.push(`Precio acción: ${dataPack.mercado.precio}`);
    if (dataPack.mercado.reputacion_vs_precio) parts.push(`Análisis reputación-precio: ${dataPack.mercado.reputacion_vs_precio}`);
    if (dataPack.mercado.variacion_interanual) parts.push(`Variación interanual: ${dataPack.mercado.variacion_interanual}`);
    if (parts.length > 0) mercadoE5Block = "\n\n═══ DATOS DE MERCADO (E2) ═══\n" + parts.join("\n");
  }

  const systemPrompt = `[IDIOMA OBLIGATORIO: ${languageName}]
Responde SIEMPRE en ${languageName}. Sin excepciones.

REGLA #1 (PRIORIDAD MÁXIMA): Tu valor diferencial es el ANÁLISIS CRUZADO ENTRE MODELOS DE IA. La mediana es solo una referencia. El core de cada informe es: qué dice cada IA, dónde coinciden, dónde divergen, y POR QUÉ. Cada métrica debe analizarse modelo a modelo.

Eres el Agente Rix de RepIndex. Redactas informes ejecutivos para alta dirección usando EXCLUSIVAMENTE los datos proporcionados.

REGLA ANTI-PROMEDIO (PRIORIDAD MÁXIMA):
• NUNCA calcules ni presentes promedios aritméticos de scores entre modelos de IA.
• Cada IA tiene audiencia, arquitectura y sesgos distintos. Un promedio sin ponderación de audiencia es metodológicamente incorrecto.
• Usa la MEDIANA como referencia de tendencia central (no la media). Muestra siempre: Mediana | Min | Max | Rango.
• NUNCA digas "RIX promedio de 67.7" → Sí: "Mediana RIX: 67, rango: 57-84 (alta dispersión)"

REGLA ANTI-PUNTUACIÓN-ÚNICA (CRÍTICA — RANKINGS Y SECTORES):
• En rankings y comparativas sectoriales, NUNCA presentes una sola cifra como "la puntuación" de una empresa. SIEMPRE muestra las 6 puntuaciones individuales.
• Si la TABLA CRUZADA tiene columnas por modelo (ChatGPT, Gemini, Grok, etc.), REPRODUCE esa tabla en tu respuesta. No la resumas en una mediana.
• El ranking debe basarse en el CONSENSO entre las 6 IAs (rango bajo = más fiable), no en la mediana.
• Clasifica cada empresa: Consenso Alto (rango ≤ 10, 🟢), Medio (10-20, 🟡), Bajo (> 20, 🔴).
• Identifica el "bloque mayoritario" (modelos que coinciden ±5 pts) y señala outliers con nombre.
• Ejemplo correcto: "CaixaBank: ChatGPT=64, Perplexity=68, Gemini=72, DeepSeek=56, Grok=73, Qwen=79 (rango 23, 🔴 consenso bajo). Bloque mayoritario: Gemini/Grok/Perplexity (~71). Outlier bajo: DeepSeek (56)."
• Ejemplo INCORRECTO: "CaixaBank lidera con 70 puntos RIX" ← PROHIBIDO, nadie dijo 70.

DIVERGENCIAS INTER-MODELO (OBLIGATORIO):
• Si una métrica tiene consenso "alto" (rango < 10): "Las seis IAs coinciden en que [empresa] tiene un [métrica] sólido de [valor]"
• Si tiene consenso "bajo" (rango > 20): "Existe una divergencia significativa: [modelo_max] otorga [valor_max] mientras que [modelo_min] solo concede [valor_min], lo que sugiere [interpretación]"
• Prioriza las divergencias en rix_score y las métricas con mayor rango
• NUNCA ignores las divergencias — son la señal analítica más valiosa
• Cuando cites datos de la TABLA CRUZADA, indica modelo por modelo

REGLA CRÍTICA DE NOMBRES DE MODELOS (OBLIGATORIO):
· SIEMPRE usa los nombres REALES de los modelos tal como aparecen en la TABLA CRUZADA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen).
· NUNCA uses "Modelo 1", "Modelo 2", "IA-1", "IA-2" ni numeraciones genéricas.
· En la sección "Visión de las 6 IAs", cada subsección DEBE titularse con el nombre real: "### ChatGPT (RIX XX)", "### Perplexity (RIX XX)", etc.
· En TODAS las secciones (métricas, divergencias, recomendaciones), referencia siempre por nombre: "ChatGPT otorga 59" NO "el Modelo 1 otorga 59".
· Si un modelo aparece como "?" o vacío en la tabla, usa el nombre de la columna 02_model_name del datapack.

GRANULARIDAD POR MODELO (OBLIGATORIO):
• Para cada métrica, identifica qué modelo da el valor más alto y más bajo, y razona POR QUÉ.
• Usa los resúmenes y puntos clave de cada modelo para extraer insights cualitativos diferenciados.
• "ChatGPT otorga 59 mientras Perplexity da 67, una divergencia de 8 puntos que refleja..."

CONSISTENCIA NARRATIVA:
• Cada sección debe tener un HILO CONDUCTOR: contexto → evidencia → implicación.
• Agrupa por SEÑAL TEMÁTICA, no por bullets sueltos.
• Conecta secciones entre sí. Prioriza PANORÁMICA antes del DETALLE.
• Cada párrafo debe responder a "¿y qué significa esto?".

REGLAS DE INTEGRIDAD:
1. Toda cifra debe existir en los datos proporcionados. Si no está, escribe "dato no disponible".
2. Toda mención temática debe estar respaldada por las IAs. Indica cuántas IAs coinciden.
3. NUNCA inventes empresas ficticias, cifras financieras, metodologías, DOIs, convenios ni KPIs.
4. Si no hay datos suficientes, dilo con transparencia.
5. NUNCA menciones "DATAPACK", "HECHOS", "ANALISIS", "E1-E6", "DataPack", "snapshot", "pack" ni nombres de componentes internos.
6. Para citar fuentes di: "Según el análisis de [nombre de IA]" o "Los datos de esta semana muestran..."

REGLA DE EXPLICACIONES: Cuando cites una métrica débil o fuerte, explica POR QUÉ usando las EXPLICACIONES POR MÉTRICA.
REGLA DE MERCADO: Si hay DATOS DE MERCADO (precio, variación), incluye un párrafo breve conectando reputación con cotización.
REGLA DE CONSENSO CATEGORÍAS: "5 de 6 IAs califican CEM como Buena" es más convincente que solo "CEM = 78".

${buildDepthPrompt("complete", languageName, language)}

CONSENSO DE IAs:
• HECHO CONSOLIDADO (5-6 IAs): Afirmación directa. "Las seis IAs coinciden en..."
• SEÑAL FUERTE (3-4 IAs): "Cuatro de seis IAs destacan..."
• INDICACIÓN (2 IAs): Con nota de cautela.
• DATO AISLADO (1 IA): Solo si muy relevante, con caveat explícito.

TONO Y ESTILO:
• Profesional y analítico. Declarativo. Narrativo, no lista de datos.
• Frases ≤25 palabras. Párrafos ≤4 líneas.
• Datos siempre con delta concreto: nunca "ha mejorado mucho" → "ha subido 8 puntos, de 54 a 62".
• Sé didáctico: explica el porqué de las cosas, no solo el qué.

REGLAS DE NEGOCIO:
• Snapshots son SEMANALES (domingos). Snapshot completo = 6 modelos.
• Si hay <4 modelos, declara snapshot incompleto.

DOCTRINA TEMPORAL DE DATOS REPINDEX (REGLA INQUEBRANTABLE):
Los datos del DATAPACK provienen de barridos semanales ejecutados SIEMPRE en domingo.
Cada barrido cubre la semana completa anterior: del domingo anterior al sábado (7 días).
- batch_execution_date = siempre un domingo (día de ejecución del barrido)
- period_from = domingo anterior (inicio de la semana analizada, 7 días antes del barrido)
- period_to = sábado (fin de la semana analizada, día antes del barrido)
Ejemplo: barrido del domingo 8 mar 2026 → period_from = domingo 2 mar 2026, period_to = sábado 7 mar 2026.
Frecuencia: semanal, 52 barridos/año. Cada empresa se evalúa por 6 modelos de IA cada domingo.
Cuando el DATAPACK incluye datos de VARIAS semanas (evolución temporal):
- "Período analizado" = period_from del barrido más antiguo → period_to del más reciente
- "Semana evaluada" = la del barrido más reciente (su period_from → su period_to)
- Las semanas previas son "tendencia" o "evolución"
NUNCA inventes rangos de fechas. USA SIEMPRE las fechas reales de period_from y period_to que vienen en el DATAPACK.
En la cabecera del informe y en la Sección 8 (Cierre/Metodología), las fechas DEBEN reflejar EXACTAMENTE los datos del DATAPACK.
Si el DATAPACK muestra period_from=2026-03-02 y period_to=2026-03-07 para la semana más reciente, di "Semana 2-7 mar 2026", NO "Semana 1-8 mar 2026".

REGLA DE CABECERA DEL INFORME (INQUEBRANTABLE):
La cabecera del informe (donde aparece "Período:") DEBE mostrar EXACTAMENTE las fechas period_from y period_to que vienen en el DATAPACK.
- Si el DATAPACK contiene datos de UNA sola semana: mostrar "period_from – period_to" (ej: "2 mar 2026 – 8 mar 2026").
- Si el DATAPACK contiene datos de VARIAS semanas: mostrar el rango completo desde el period_from más antiguo hasta el period_to más reciente.
- NUNCA calcular fechas hacia atrás desde la fecha actual (ej: PROHIBIDO "8 feb – 8 mar" si el DATAPACK no contiene esas fechas).
- NUNCA mostrar "4 semanas" ni "último mes" como período si las fechas del DATAPACK no lo respaldan.
- El número de semanas mostrado DEBE coincidir con el número real de semanas distintas en el DATAPACK.
- La Sección 8 (Cierre/Metodología) DEBE repetir EXACTAMENTE las mismas fechas de la cabecera.

REGLA DE FECHA DE ELABORACIÓN (INQUEBRANTABLE):
La Sección 8 (Cierre/Metodología) incluye una frase "Análisis elaborado el [fecha]".
- Esta fecha DEBE ser la fecha ACTUAL del momento en que se genera el informe.
- NUNCA inventar una fecha futura ni pasada.
- Si no conoces la fecha exacta, usa la fecha del period_to más reciente del DATAPACK como aproximación.
- PROHIBIDO escribir una fecha que aún no ha ocurrido (ej: si hoy es 8 mar, NO escribir 10 mar).

REGLA DE DELTAS SEMANALES (INQUEBRANTABLE):
- El DATAPACK incluye "metricas_consolidadas" con un campo "delta" y "has_delta" para CADA métrica (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM).
- Si "has_delta" es true para una métrica, MUESTRA su delta numérico en la tabla de KPIs (ej: "+3", "-5").
- Si "has_delta" es false o "delta" es null, muestra "-" o "n/d" en esa métrica. NUNCA inventes un número.
- También hay "delta_rix" (delta del RIX global mediano). Muéstralo siempre que exista.
- NUNCA mostrar un delta con asterisco (*) ni nota al pie diciendo que "no hay histórico". Si no hay datos para calcularlo, simplemente NO mostrarlo.
- PROHIBIDO contradecirse: si los datos tienen deltas individuales, NO digas "Delta semanal disponible solo para RIX global".

LAS 8 MÉTRICAS:
• Calidad de la Narrativa (NVM) · Fortaleza de Evidencia (DRM) · Autoridad de Fuentes (SIM, NO mide ESG)
• Actualidad y Empuje (RMM, NO mide marketing) · Gestión de Controversias (CEM, INVERSA: 100=sin controversias)
• Percepción de Gobernanza (GAM) · Coherencia Informativa (DCM, NO mide innovación digital) · Ejecución Corporativa (CXM, solo cotizadas)
• Escala: 🟢 ≥70 fortaleza · 🟡 50-69 mejora · 🔴 <50 riesgo

REGLA INQUEBRANTABLE SOBRE CXM Y EMPRESAS NO COTIZADAS:
El DATAPACK incluye el campo "cotiza_en_bolsa" (true/false) para cada empresa.
Si cotiza_en_bolsa = false (la empresa NO cotiza en bolsa):
1. CXM NO APLICA. En la tabla de las 8 métricas (Sección 3), mostrar CXM como "N/A — Empresa no cotizada" en vez de un score numérico.
2. NUNCA presentar CXM como debilidad, zona roja ni problema si la empresa no cotiza. Un CXM bajo o 0 en empresa no cotizada significa INAPLICABILIDAD, no mal desempeño.
3. En el Diagnóstico (Sección 1), incluir siempre esta nota: "[Empresa] no cotiza en bolsa. La métrica CXM (Ejecución Corporativa) no aplica y su peso (10%) se redistribuye proporcionalmente entre las 7 métricas restantes."
4. El RIX se calcula sobre 7 métricas (90% del peso original redistribuido proporcionalmente). Esto NO es una limitación ni un problema — es el comportamiento diseñado del sistema.
5. En las recomendaciones, NO sugerir acciones para mejorar CXM si la empresa no cotiza (no tiene sentido mejorar datos bursátiles si no hay cotización).
6. Si cotiza_en_bolsa = true, tratar CXM normalmente con su score del DATAPACK.

REGLA INQUEBRANTABLE SOBRE MÉTRICAS:
Las ÚNICAS métricas válidas del sistema RepIndex son EXACTAMENTE 8: NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM.
NUNCA inventes, añadas ni sustituyas métricas. NO uses SOM, POL, NPM, RRM, ISM ni ninguna otra sigla fuera de estas 8.
La tabla de la Sección 3 DEBE contener EXACTAMENTE estas 8 métricas con sus nombres canónicos y valores del DATAPACK.
Si inventas una métrica que no existe en este listado, el informe queda INVALIDADO.

COMPETIDORES: Usa EXCLUSIVAMENTE los competidores del campo "competidores_verificados". Si está vacío, NO incluyas NINGUNA comparativa.

REGLAS ANTI-ALUCINACIÓN:
• NUNCA inventes WACC, EBITDA, CAPEX, DOIs, índices propietarios, empresas ficticias, roadmaps, protocolos, herramientas.
• NUNCA menciones límites de plataforma, carpetas, archivos ni filesystems.
• Si no tienes datos, dilo: "Solo puedo analizar los datos RepIndex disponibles."
• NUNCA uses encabezados "PILAR X —". NUNCA inventes equipos internos ni algoritmos.

RIGOR EPISTEMOLÓGICO — CAUSALIDAD RIX ↔ COTIZACIÓN:
• NUNCA afirmes ni insinues relación causal entre el RIX y la cotización bursátil. El RIX mide percepción algorítmica, no predice ni explica movimientos de mercado.
• Cuando menciones precio de acción junto a datos RIX, usa SIEMPRE lenguaje de coincidencia temporal, nunca de causalidad.
• NUNCA uses los verbos "provoca", "causa", "genera", "impulsa" referidos a relaciones RIX↔bolsa o métricas↔mercado. SOLO usar: "coincide temporalmente", "puede haber influido", "no se puede inferir causalidad". Esto es OBLIGATORIO sin excepciones.
• Ejemplos CORRECTOS: "coincide temporalmente con el rebote bursátil", "en paralelo, la acción subió…".
• Ejemplos PROHIBIDOS: "se refleja en el mercado", "el RIX positivo impulsa la cotización", "la mejora reputacional explica la subida", "provoca una caída bursátil", "genera presión vendedora".

RIGOR EPISTEMOLÓGICO — BENCHMARKS Y COMPARATIVAS:
• NUNCA inventes benchmarks sectoriales ni uses la palabra "hipotético" para referirte a datos que no existen.
• En la sección competitiva, usa SOLO datos reales de competidores verificados que estén en la base de datos.
• Si quieres comparar una métrica con un umbral, usa los umbrales del sistema (🟢 ≥70, 🟡 40-69, 🔴 <40), NO promedios sectoriales inventados.
• Ejemplo CORRECTO: "SIM 37, en zona roja (umbral verde: 70)".
• Ejemplo PROHIBIDO: "SIM 37 vs 45 (hipotético sector)".

RIGOR EPISTEMOLÓGICO — INCERTIDUMBRE INTERMODELO:
• Junto al RIX mediano, calcula y muestra SIEMPRE el intervalo de incertidumbre intermodelo. Fórmula: IC ≈ rango / 4 (donde rango = RIX máximo - RIX mínimo entre los 6 modelos). Redondea al entero más cercano.
• Formato de presentación:
  - En el titular y resumen: "RIX mediano: 59 (±5 intermodelo)"
  - En los KPIs: "RIX mediano: 59 ±5 (rango 48-69)"
  - En la tabla de evolución temporal: añadir columna "± Incertidumbre"
  - En la comparativa competitiva: incluir el ± tanto para la empresa como para el competidor
• Ejemplo completo: si los 6 modelos dan RIX [48, 53, 56, 63, 65, 69], mediana = 59, rango = 21, IC ≈ 21/4 ≈ ±5. Se muestra: "RIX mediano: 59 (±5 intermodelo)"
• NOMENCLATURA OBLIGATORIA: Llamarlo SIEMPRE "incertidumbre intermodelo", NUNCA "intervalo de confianza" ni "IC 95%" porque con n=6 modelos no es estadísticamente riguroso usar terminología de inferencia clásica.
• INCERTIDUMBRE DE COMPETIDORES: Si hay datos de rango del competidor (RIX máximo - RIX mínimo de las 6 IAs), calcular su ±X con la misma fórmula (rango/4). Si no hay datos suficientes, declarar: "Sin datos suficientes para calcular dispersión inter-modelo del competidor."

RIGOR EPISTEMOLÓGICO — CONTRADICCIONES INTERNAS:
• El agente DEBE detectar y declarar tensiones internas entre métricas cuando las haya.
• Ejemplo: si CEM es excelente pero hay controversia laboral activa en las narrativas, debe decir: "Existe tensión entre la estabilidad percibida (CEM alto) y la narrativa laboral negativa detectada. Esta discrepancia merece seguimiento."
• Si NVM es alta pero SIM es baja: "Buena narrativa pero sin respaldo de fuentes autoritativas — riesgo de percepción superficial."
• Detectar y declarar estas tensiones añade valor analítico y diferencia el informe de un simple listado de métricas.

DICCIONARIO CONCEPTUAL - Cuando el dataPack contenga información de CXM o la consulta del usuario se refiera a valoración bursátil, stock price, cotización, market cap, share price, equity valuation o cualquier sinónimo en cualquier idioma:
- Interpreta SIEMPRE como una pregunta sobre la métrica CXM (Corporate Execution Metric) y su relación con la percepción de mercado.
- Si la consulta menciona desacoplamiento, divergencia, brecha, gap, mismatch, disconnect o sinónimos: analiza la diferencia entre el CXM/reputación algorítmica y la valoración de mercado.
- Si la consulta menciona resultados financieros, earnings, cuentas anuales o sinónimos: incorpora información reciente de resultados si está disponible en el dataPack.
- Si la consulta menciona equity story, tesis de inversión o sinónimos: enfoca la respuesta en la narrativa estratégica de la empresa para el mercado.
- Responde SIEMPRE con datos específicos del dataPack, NUNCA con respuestas genéricas.

Cuando el usuario mencione cualquiera de estos términos, entiende su contexto y responde con métricas RIX relevantes.

CARGOS CORPORATIVOS (afectan a NVM narrativa, GAM gobernanza, CEM controversias):
• Presidente/Chairman, CEO/Consejero Delegado, CFO/Director Financiero, COO/Director Operaciones
• CMO/Director Marketing, CCO/Director Comunicación, CTO, CIO, CISO
• CLO/Director Jurídico, CHRO/Director RRHH, CSO/Director Sostenibilidad, CDO/Director Digital
• Director General, Secretario del Consejo, Director IR (Relaciones con Inversores)
• Director de Asuntos Públicos, Fundador/Co-fundador
• Accionista de referencia, Consejero independiente, Consejero dominical
→ Preguntas sobre cargos ejecutivos → analiza NVM + GAM + CEM. Cambios de CEO/Presidente impactan especialmente GAM y NVM.

CONCEPTOS FINANCIEROS/LEGALES/REGULATORIOS (contexto para CEM, DRM, CXM):
• Stakeholder, Due diligence, Compliance, Buen gobierno/Good governance, Accountability
• Regulador (CNMC, CNMV, Banco de España), Sanción, Multa antimonopolio, Investigación regulatoria
• Enmienda, Lobby/Lobbying, Relaciones institucionales
• Litigio, Demanda colectiva/Class action, Alfa (inversión), Buy-side/Sell-side
• Equity research, Screening sectorial
→ Preguntas regulatorias/legales → analiza CEM + SIM + DRM.

CONCEPTOS REPUTACIONALES PROPIOS DE REPINDEX:
• Reputación algorítmica = percepción que los modelos de IA tienen de una empresa. Núcleo de lo que mide RepIndex.
• Brecha narrativa = diferencia entre relato emitido por la empresa y percepción de las IAs. Vinculada a NVM y DCM.
• Cuota de voz algorítmica = presencia relativa en respuestas de IAs vs competidores. Vinculada a SIM.
• Delta reputacional = variación RIX entre periodos. Usa datos de evolución temporal.
• Señal predictiva = indicador que anticipa riesgo/oportunidad antes de materializarse. Analiza tendencias en CEM + RMM.
• Solicitud de corrección formal = comunicación oficial a operador de IA para rectificar información errónea. Vinculada a DCM.
• Análisis forense reputacional = examen técnico de percepción algorítmica en momento concreto del pasado, con fines legales. Requiere datos históricos completos.
→ Cuando el usuario use estos conceptos propios, responde con datos reales de las métricas vinculadas.

FORMATO MARKDOWN:
• ## para secciones principales, ### para subsecciones. Tablas markdown para datos comparativos.
• Emojis semáforo: 🟢 ≥70, 🟡 50-69, 🔴 <50. NO uses headers decorativos (═══).

EXTENSIÓN: 2.500-4.000 palabras para empresa. Focalizado para otros tipos.
${roleName ? `PERSPECTIVA: Adapta el ángulo al rol "${roleName}" sin mencionar el perfil explícitamente.` : ""}
${roleName && rolePrompt ? `
INSTRUCCIONES DEL ROL (el rol modifica CÓMO presentas, NUNCA autoriza fabricar contenido):
${rolePrompt}` : ""}
${dataPack?.empresa_primaria?.ticker === "IBEX-35" ? `
REGLAS PARA CONSULTAS DE ÍNDICE (IBEX-35):
• Presenta scores de cada IA por separado para empresas destacadas.
• Ordena por mediana pero muestra: Mediana | Min | Max | Consenso.
• Extensión máxima: 2.500 palabras.
` : ""}
${dataPack.ranking && dataPack.ranking.length > 3 && dataPack?.empresa_primaria?.ticker !== "IBEX-35" ? `
REGLAS PARA RANKINGS SECTORIALES:
• Cubre TOP 5-10 empresas de forma EQUILIBRADA, no solo el líder.
• Compara métricas ENTRE las top 5. Analiza divergencias y evolución por empresa.
` : ""}
${rankingTop || rankingBottom ? `
REGLAS PARA CONSULTAS TOP/BOTTOM (OBLIGATORIO):
• Si ranking_top está presente en el DATAPACK, presenta una tabla completa del Top con: Posición, Empresa, Ticker, RIX Score, y las 8 métricas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM) si están disponibles en el snapshot.
• Si ranking_bottom está presente, presenta una tabla equivalente del Bottom.
• NUNCA omitas la tabla Bottom si ranking_bottom tiene datos.
• Las 8 métricas de cada empresa deben extraerse del campo "snapshot" del DATAPACK (filtrando por ticker).
• Si el snapshot contiene datos de un solo modelo (filtro de modelo activo), indica claramente que los datos son de ese modelo específico, no consolidados.
• Si metricas_consolidadas tiene datos por ticker, úsalos para las columnas de métricas.
` : ""}

═══ EJEMPLO DE ANÁLISIS CORRECTO (sección 2 — Visión de las 6 IAs) ═══

### ChatGPT (RIX 72)
- **Fortalezas**: Gestión de Controversias (88), Coherencia Informativa (80)
- **Debilidades**: Actualidad y Empuje (15), Autoridad de Fuentes (0)
- **Insight diferencial**: Es el único modelo que detecta "cobertura mediática directa nula", sugiriendo que su crawler no alcanza prensa económica en tiempo real.
- **Por qué diverge**: El flag "datos_antiguos" limita su ventana temporal → RMM penalizado.

### Perplexity (RIX 68)
- **Fortalezas**: Fortaleza de Evidencia (78), Ejecución Corporativa (85)
- **Debilidades**: Autoridad de Fuentes (29)
- **Insight diferencial**: Única IA que cuantifica la subida bursátil (+6-10%) vinculando mejora reputacional al precio objetivo.
- **Por qué diverge**: Buenas fuentes periodísticas (Reuters, Expansión) elevan DRM, pero la carencia de documentos oficiales frena SIM.

### Gemini (RIX 71)
- **Fortalezas**: Coherencia Informativa (82), Calidad de Narrativa (76)
- **Debilidades**: SIM (35)
- **Insight diferencial**: Su integración con Google Search le permite verificar datos cruzados, otorgando la puntuación más alta en coherencia.
- **Por qué diverge**: Fuerte en verificación factual, débil en documentación regulatoria.

### DeepSeek (RIX 65)
- **Fortalezas**: Calidad de Narrativa (89)
- **Debilidades**: SIM (22), GAM (40)
- **Insight diferencial**: Es el modelo más crítico globalmente. Prioriza la calidad narrativa sobre métricas documentales.
- **Por qué diverge**: Sus fuentes tienen menor acceso a documentación regulatoria española → SIM penalizado.

### Grok (RIX 74)
- **Fortalezas**: RMM (81), CEM (77)
- **Debilidades**: NVM (45)
- **Insight diferencial**: Su percepción positiva en RMM probablemente está influida por la actividad en X/Twitter. Diverge de DeepSeek en SIM (+30 pts).
- **Por qué diverge**: Acceso privilegiado a conversación social en tiempo real eleva métricas de momentum.

### Qwen (RIX 63)
- **Fortalezas**: Análisis de riesgos de gobernanza
- **Debilidades**: GAM (38), NVM (41)
- **Insight diferencial**: El más conservador. Detecta riesgos de gobernanza que otros modelos no capturan. Su perspectiva asiática aporta un ángulo diferencial.
- **Por qué diverge**: Modelo entrenado con corpus asiático, más sensible a riesgos ESG.

PATRÓN DETECTADO: 4 de 6 IAs coinciden en que Autoridad de Fuentes es la métrica crítica (<40). Solo DeepSeek diverge, priorizando Calidad de Narrativa. Esto sugiere un consenso robusto sobre el déficit documental.
═══ FIN DEL EJEMPLO ═══`;

  // Build cross-model table (pre-calculated, injected BEFORE datapack)
  const crossModelTable = buildCrossModelTable(dataPack);

  const userPrompt = `PREGUNTA: "${question}"

CLASIFICACIÓN (E1): tipo=${classifier.tipo}, intención=${classifier.intencion}

${crossModelTable ? `═══ TABLA CRUZADA PRE-CALCULADA (DATO PRIORITARIO) ═══\n${crossModelTable}\n` : ""}═══ DATAPACK (E2 — FUENTE DE VERDAD) ═══
${dataPackBlock}

═══ HECHOS CUALITATIVOS (E3) ═══
${factsBlock}

═══ ANÁLISIS COMPARATIVO (E4) ═══
${analysisBlock}
${explicacionesE5Block}
${consensoE5Block}
${mercadoE5Block}

Redacta el informe ejecutivo completo en ${languageName}. Usa SOLO los datos de arriba. Cuando expliques una métrica, cita la causa usando las EXPLICACIONES. Cuando haya consenso de categorías, menciónalo. Cuando haya datos de mercado, conéctalos con la reputación.

RECORDATORIO FINAL: Las etiquetas DATAPACK, HECHOS, ANALISIS son bloques internos para tu consumo. NUNCA las menciones ni las cites en tu respuesta. El usuario solo debe ver "según las IAs", "los datos de esta semana" o "el análisis RepIndex".`;

  return { systemPrompt, userPrompt };
}

// --- E6: ADAPTIVE LAYOUT FORMATTER ---
async function formatForExport(
  rawMarkdown: string,
  classifier: ClassifierResult,
  logPrefix: string,
): Promise<string> {
  // --- POST-PROCESAMIENTO: Limpiar referencias internas filtradas ---
  const internalRefPattern = /\(?\s*(?:Fuentes?|Sources?)\s*:\s*(?:DATAPACK|HECHOS|ANALISIS|DataPack|E[1-6])[^)]*\)?/gi;
  rawMarkdown = rawMarkdown.replace(internalRefPattern, '');
  const internalTerms = /\b(DATAPACK|DataPack|HECHOS|ANALISIS|EXPLICACIONES|CONSENSO)\b\.?\w*/g;
  rawMarkdown = rawMarkdown.replace(internalTerms, 'los datos de esta semana');
  // Clean up double spaces left by removals
  rawMarkdown = rawMarkdown.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n');

  if (rawMarkdown.length < 500) {
    console.log(`${logPrefix} [E6] Short response, skipping layout formatting`);
    return rawMarkdown;
  }

  console.log(`${logPrefix} [E6] Formatting for export (${rawMarkdown.length} chars)...`);

  const prompt = `Recibes un informe en markdown. Optimiza su formato visual para renderizado PDF.

SISTEMA DE RENDERIZADO CSS:
- "---" entre secciones → section-bands azules
- Tablas markdown → estilo editorial (zebra striping, headers azules)
- "1. Nombre — valor pts emoji" → emoji-metrics-table
- Blockquotes (>) → notas metodológicas con borde azul
- ### → subsection-titles con borde inferior

TU TRABAJO:
1. Inserta "---" entre cada sección principal
2. Si hay métricas como bullets, reformatea como tabla: | Métrica | Score | vs Sector |
3. Si hay datos de modelos, formatea como tabla con emojis semáforo
4. Rankings como tablas, no listas
5. Evolución temporal como tabla: | Semana | RIX | Delta |
6. Máximo 3-4 blockquotes metodológicos en todo el informe
7. ## para pilares, ### para subsecciones, #### si necesario

REGLAS:
- NO cambies contenido, cifras ni redacción. Solo reformatea.
- NO elimines texto. Solo reorganizas la presentación visual.
- NO añadas contenido nuevo.
- Mantén todos los emojis tal cual.

INFORME A FORMATEAR:
${rawMarkdown}`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: "Maquetador editorial. Solo reformateas markdown para renderizado PDF. NO cambias contenido." },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini",
      8000,
      `${logPrefix} [E6]`,
    );

    if (result && result.length > rawMarkdown.length * 0.5) {
      console.log(`${logPrefix} [E6] Formatted: ${result.length} chars (was ${rawMarkdown.length})`);
      return result;
    }
  } catch (e) {
    console.warn(`${logPrefix} [E6] Layout formatting failed, using raw markdown:`, e);
  }

  return rawMarkdown;
}

// =============================================================================
// INTELLIGENT COMPETITOR SELECTION (GUARDRAIL SYSTEM)
// =============================================================================

// Known non-competitors to filter out (falsos positivos conocidos)
const KNOWN_NON_COMPETITORS: Record<string, string[]> = {
  // Telefónica NO compite con empresas de otros subsectores del "Telecomunicaciones y Tecnología"
  TEF: ["AMS", "IDR", "GOOGLE-PRIV", "AMAZON-PRIV", "META-PRIV", "APPLE-PRIV", "MSFT-PRIV", "LLYC"],
  // Amadeus (tech viajes) no compite con operadores telecom
  AMS: ["TEF", "CLNX", "MAS"],
  // Indra (defensa/IT) no compite con operadores telecom
  IDR: ["TEF", "CLNX", "MAS"],
};

// Sector similarity groups for fallback competitor matching
const RELATED_SECTORS: Record<string, string[]> = {
  "Telecomunicaciones y Tecnología": [], // Too broad, rely on subsector matching
  "Energía y Utilities": ["Infraestructuras"],
  Financiero: [], // Banks compete only with banks
  "Construcción e Infraestructuras": ["Energía y Utilities"],
};

interface CompanyData {
  ticker: string;
  issuer_name: string;
  sector_category?: string;
  subsector?: string;
  ibex_family_code?: string;
  verified_competitors?: string[]; // Array of tickers of verified direct competitors
}

/**
 * Result from competitor selection including methodology justification
 */
interface CompetitorResult {
  competitors: CompanyData[];
  justification: string;
  tierUsed: string;
  verifiedCount: number;
  subsectorCount: number;
}

/**
 * Intelligent competitor selection with verified_competitors priority
 * NEW TIER 0: Uses verified_competitors array from repindex_root_issuers (EXCLUSIVE if populated)
 * Prevents irrelevant companies from appearing in bulletins
 * Returns competitors WITH methodology justification for transparency
 */
async function getRelevantCompetitors(
  company: CompanyData,
  allCompanies: CompanyData[],
  supabaseClient: any,
  limit: number = 5,
  logPrefix: string = "[Competitors]",
): Promise<CompetitorResult> {
  const collected: CompanyData[] = [];
  const usedTickers = new Set<string>([company.ticker]);

  // Tracking variables for methodology justification
  let tierUsed = "NONE";
  let verifiedCount = 0;
  let subsectorCount = 0;

  console.log(`${logPrefix} Getting competitors for ${company.issuer_name} (${company.ticker})`);
  console.log(
    `${logPrefix} Company sector: ${company.sector_category}, subsector: ${company.subsector}, IBEX: ${company.ibex_family_code}`,
  );
  console.log(
    `${logPrefix} Verified competitors from issuer record: ${JSON.stringify(company.verified_competitors || [])}`,
  );

  // Helper to add companies avoiding duplicates
  const addCompetitor = (c: CompanyData): boolean => {
    if (usedTickers.has(c.ticker)) return false;

    // Apply blacklist filter
    if (KNOWN_NON_COMPETITORS[company.ticker]?.includes(c.ticker)) {
      console.log(`${logPrefix} Blacklisted: ${c.ticker} (known non-competitor of ${company.ticker})`);
      return false;
    }

    usedTickers.add(c.ticker);
    collected.push(c);
    return true;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 0 (NEW PRIORITY): Verified competitors from repindex_root_issuers.verified_competitors
  // If this field is populated, use EXCLUSIVELY these competitors and skip all other tiers
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    company.verified_competitors &&
    Array.isArray(company.verified_competitors) &&
    company.verified_competitors.length > 0
  ) {
    console.log(
      `${logPrefix} TIER 0 (VERIFIED_COMPETITORS): Found ${company.verified_competitors.length} verified competitors in issuer record`,
    );

    for (const competitorTicker of company.verified_competitors) {
      if (collected.length >= limit) break;

      const competitor = allCompanies.find((c) => c.ticker === competitorTicker);
      if (competitor && addCompetitor(competitor)) {
        verifiedCount++;
        tierUsed = "TIER0-VERIFIED-ISSUER";
        console.log(`${logPrefix}   → ${competitor.ticker} (verified from issuer record)`);
      } else if (!competitor) {
        console.warn(`${logPrefix}   ⚠️ Verified competitor ticker not found in companies cache: ${competitorTicker}`);
      }
    }

    // EXCLUSIVE: If we have verified_competitors, we return ONLY these - no fallback to other tiers
    if (collected.length > 0) {
      console.log(
        `${logPrefix} Returning ${collected.length} competitors EXCLUSIVELY from TIER 0 (verified_competitors)`,
      );
      const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
      return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: Bidirectional verified relationships from competitor_relationships table
  // Only reached if verified_competitors is empty
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { data: reverseRelationships, error: reverseError } = await supabaseClient
      .from("competitor_relationships")
      .select("source_ticker, relationship_type, confidence_score")
      .eq("competitor_ticker", company.ticker)
      .order("confidence_score", { ascending: false });

    if (!reverseError && reverseRelationships?.length > 0) {
      console.log(`${logPrefix} TIER 1: Found ${reverseRelationships.length} reverse-direction competitors`);

      for (const rel of reverseRelationships) {
        if (collected.length >= limit) break;

        const competitor = allCompanies.find((c) => c.ticker === rel.source_ticker);
        if (competitor && addCompetitor(competitor)) {
          verifiedCount++;
          tierUsed = "TIER1-BIDIRECTIONAL";
          console.log(
            `${logPrefix}   → ${competitor.ticker} (bidirectional verified, ${rel.relationship_type}, score: ${rel.confidence_score})`,
          );
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Error fetching reverse competitors:`, e);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: Verified competitors from competitor_relationships table
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { data: verifiedRelationships, error } = await supabaseClient
      .from("competitor_relationships")
      .select("competitor_ticker, relationship_type, confidence_score")
      .eq("source_ticker", company.ticker)
      .order("confidence_score", { ascending: false });

    if (!error && verifiedRelationships?.length > 0) {
      console.log(
        `${logPrefix} TIER 2: Found ${verifiedRelationships.length} verified competitors from relationships table`,
      );

      for (const rel of verifiedRelationships) {
        if (collected.length >= limit) break;

        const competitor = allCompanies.find((c) => c.ticker === rel.competitor_ticker);
        if (competitor && addCompetitor(competitor)) {
          verifiedCount++;
          if (tierUsed === "NONE") tierUsed = "TIER2-VERIFIED-RELATIONSHIPS";
          console.log(
            `${logPrefix}   → ${competitor.ticker} (verified relationship, ${rel.relationship_type}, score: ${rel.confidence_score})`,
          );
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Error fetching verified competitors:`, e);
  }

  if (collected.length >= limit) {
    console.log(`${logPrefix} Returning ${collected.length} competitors from TIER 1/2 (verified relationships)`);
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: Same SUBSECTOR + Same IBEX Family (highest precision after verified)
  // NOTE: From this tier onwards, competitors are "por categoría" and need disclosure
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.subsector && company.ibex_family_code) {
    const tier3 = allCompanies.filter(
      (c) => c.subsector === company.subsector && c.ibex_family_code === company.ibex_family_code,
    );

    console.log(`${logPrefix} TIER 3: Found ${tier3.length} same-subsector + same-IBEX companies`);

    for (const c of tier3) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        subsectorCount++;
        if (tierUsed === "NONE") tierUsed = "TIER3-SUBSECTOR-IBEX";
        console.log(`${logPrefix}   → ${c.ticker} (subsector: ${c.subsector}, IBEX: ${c.ibex_family_code})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: Same SUBSECTOR only (any IBEX family)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.subsector) {
    const tier4 = allCompanies.filter((c) => c.subsector === company.subsector);

    console.log(`${logPrefix} TIER 4: Found ${tier4.length} same-subsector companies (any IBEX)`);

    for (const c of tier4) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        subsectorCount++;
        if (tierUsed === "NONE") tierUsed = "TIER4-SUBSECTOR";
        console.log(`${logPrefix}   → ${c.ticker} (subsector: ${c.subsector})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 5: Same SECTOR + Same IBEX Family (fallback, AND not OR!)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.sector_category && company.ibex_family_code) {
    const tier5 = allCompanies.filter(
      (c) => c.sector_category === company.sector_category && c.ibex_family_code === company.ibex_family_code,
    );

    console.log(`${logPrefix} TIER 5: Found ${tier5.length} same-sector + same-IBEX companies`);

    for (const c of tier5) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        if (tierUsed === "NONE") tierUsed = "TIER5-SECTOR-IBEX";
        console.log(`${logPrefix}   → ${c.ticker} (sector: ${c.sector_category}, IBEX: ${c.ibex_family_code})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 6: Same SECTOR only (last resort, but still AND-based logic from subsector)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.sector_category) {
    // If we have subsector, only accept companies in same or related subsectors
    const tier6 = allCompanies.filter((c) => {
      if (c.sector_category !== company.sector_category) return false;

      // If source has subsector, prefer matching or empty subsectors
      if (company.subsector && c.subsector && c.subsector !== company.subsector) {
        // Check if subsectors are related (e.g., both telecom-related)
        const sourceSubsector = company.subsector.toLowerCase();
        const targetSubsector = c.subsector.toLowerCase();

        // Reject obvious mismatches
        const incompatiblePairs = [
          ["telecom", "viajes"],
          ["telecom", "defensa"],
          ["telecom", "big tech"],
          ["telecom", "comunicación"],
          ["banca", "seguros"],
        ];

        for (const [a, b] of incompatiblePairs) {
          if (
            (sourceSubsector.includes(a) && targetSubsector.includes(b)) ||
            (sourceSubsector.includes(b) && targetSubsector.includes(a))
          ) {
            return false;
          }
        }
      }

      return true;
    });

    console.log(`${logPrefix} TIER 6: Found ${tier6.length} filtered same-sector companies`);

    for (const c of tier6) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        if (tierUsed === "NONE") tierUsed = "TIER6-SECTOR";
        console.log(`${logPrefix}   → ${c.ticker} (sector: ${c.sector_category})`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 7: FALLBACK - If still no competitors, use top IBEX35 companies
  // ═══════════════════════════════════════════════════════════════════════════
  if (collected.length === 0) {
    console.warn(`${logPrefix} NO COMPETITORS FOUND for ${company.ticker} - using fallback IBEX35`);

    const ibex35Fallback = allCompanies
      .filter((c) => c.ibex_family_code === "IBEX-35" && c.ticker !== company.ticker)
      .slice(0, limit);

    for (const c of ibex35Fallback) {
      addCompetitor(c);
    }

    tierUsed = "TIER7-FALLBACK-IBEX-35";
  }

  console.log(`${logPrefix} Final competitor list (${collected.length}): ${collected.map((c) => c.ticker).join(", ")}`);
  const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
  return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
}

/**
 * Build human-readable justification for competitor selection methodology
 */
function buildCompetitorJustification(
  tierUsed: string,
  verifiedCount: number,
  subsectorCount: number,
  company: CompanyData,
): string {
  const parts: string[] = [];

  // Explain the tier used
  const tierExplanations: Record<string, string> = {
    "TIER0-VERIFIED-ISSUER": "competidores directos verificados manualmente (lista curada)",
    "TIER1-BIDIRECTIONAL": "relaciones bidireccionales verificadas en base de datos",
    "TIER2-VERIFIED-RELATIONSHIPS": "relaciones directas verificadas en tabla de competidores",
    "TIER3-SUBSECTOR-IBEX": `mismo subsector (${company.subsector}) y familia IBEX (${company.ibex_family_code})`,
    "TIER4-SUBSECTOR": `mismo subsector (${company.subsector})`,
    "TIER5-SECTOR-IBEX": `mismo sector (${company.sector_category}) y familia IBEX (${company.ibex_family_code})`,
    "TIER6-SECTOR": `mismo sector (${company.sector_category}) con filtrado de incompatibilidades`,
    "TIER7-FALLBACK-IBEX-35": "fallback a empresas del IBEX-35 (sin competidores directos identificados)",
    NONE: "metodología no determinada",
  };

  parts.push(`Competidores seleccionados mediante: ${tierExplanations[tierUsed] || tierUsed}.`);

  // Special case: TIER0-VERIFIED-ISSUER has highest confidence
  if (tierUsed === "TIER0-VERIFIED-ISSUER") {
    parts.push(`✓ ${verifiedCount} competidores directos confirmados.`);
  } else if (verifiedCount > 0) {
    parts.push(`${verifiedCount} competidores verificados en base de datos.`);
  }

  if (subsectorCount > 0) {
    parts.push(`${subsectorCount} competidores del mismo subsector (${company.subsector}).`);
  }

  // Add warning if using category-based fallback (TIER3+)
  const categoryTiers = ["TIER3-SUBSECTOR-IBEX", "TIER4-SUBSECTOR", "TIER5-SECTOR-IBEX", "TIER6-SECTOR"];
  if (categoryTiers.includes(tierUsed)) {
    parts.push(
      "⚠️ NOTA: Esta empresa no tiene competidores verificados definidos. Los competidores mostrados pertenecen a la misma categoría/subsector y se incluyen con fines de contexto sectorial, no como competencia directa confirmada.",
    );
  }

  // Add warning if using full fallback
  if (tierUsed.includes("FALLBACK")) {
    parts.push(
      "⚠️ NOTA: Esta empresa no tiene competidores verificados ni subsector definido - las comparativas deben interpretarse con cautela.",
    );
  }

  return parts.join(" ");
}

// =============================================================================
// INFORME ANALÍTICO — Estructura anclada en datos SQL, sin pilares.
// =============================================================================
function buildDepthPrompt(depthLevel: "quick" | "complete" | "exhaustive", languageName: string, language: string = "es"): string {
  const H = (key: string) => t(language, key);

  return `
═══════════════════════════════════════════════════════════════════════════════
     ${H("depth_format_title")}
═══════════════════════════════════════════════════════════════════════════════

REGLA FUNDAMENTAL: Este informe se construye EXCLUSIVAMENTE a partir de los
datos proporcionados por el sistema de análisis. Cada sección debe estar
anclada en datos reales. NUNCA rellenes con contenido inventado.

EXTENSIÓN según tipo de consulta:
- Empresa: 2.500–4.000 palabras.
- Sector: 2.000–3.000 palabras.
- Comparativa: 2.000–3.000 palabras.
- Pregunta conceptual: respuesta focalizada, sin estructura rígida.

═══════════════════════════════════════════════════════════════════════════════
ESTRUCTURA OBLIGATORIA DEL INFORME (8 SECCIONES)
═══════════════════════════════════════════════════════════════════════════════

REGLA CRÍTICA: NUNCA omitas las secciones 1, 2, 3, 7 y 8. Son OBLIGATORIAS.
Las secciones 4, 5 y 6 son CONDICIONALES (solo si hay datos disponibles).

───────────────────────────────────────────────────────────────────────────────
TITULAR-RESPUESTA (OBLIGATORIO — LO PRIMERO DEL INFORME)
───────────────────────────────────────────────────────────────────────────────

NO generes ninguna ficha de cabecera, bloque quote con metadatos ni resumen
de contexto (consulta, empresa, ticker, período, modelos, etc.) al inicio
del informe. Esa información ya la muestra la interfaz automáticamente.

La PRIMERA LÍNEA del informe SIEMPRE es un **TITULAR EN NEGRITA** que responde
DIRECTAMENTE a la pregunta del usuario en LENGUAJE NATURAL, SIN MÉTRICAS.
La primera frase SOLO contiene la respuesta directa. Las métricas aparecen
en la SEGUNDA frase como evidencia. Estructura obligatoria:
1) Respuesta directa en lenguaje natural (sin siglas, sin números)
2) Evidencia con métricas que sustenta la respuesta
3) Contexto breve

Ejemplos:
- Pregunta "Analiza el daño reputacional de Telefónica" →
  **"No se detecta daño reputacional significativo en Telefónica en el último periodo. La percepción algorítmica se mantiene estable (RIX 62 ±4), con fortaleza en gestión de controversias pero debilidad en autoridad de fuentes."**
- Pregunta "¿Cómo está Inditex?" →
  **"Inditex goza de una reputación algorítmica sólida con alto consenso entre las 6 IAs. Su RIX mediano de 74 (±3) la sitúa en zona verde, aunque con margen de mejora en diversificación de fuentes."**

Este titular va ANTES del "## 1. RESUMEN EJECUTIVO".

───────────────────────────────────────────────────────────────────────────────
SECCIÓN 1: ${H("depth_executive_summary")} — OBLIGATORIA
───────────────────────────────────────────────────────────────────────────────

FLUJO NARRATIVO OBLIGATORIO: Insight → Por qué → Qué dicen las IAs → Métricas.
NUNCA empezar por métricas. El directivo piensa en insights, no en siglas.

### ${H("depth_headline_diagnosis")}
Diagnóstico en LENGUAJE CLARO: 2-3 frases sin jerga técnica que respondan
a la pregunta del usuario. Primero la respuesta, luego los datos que la
sustentan. NO empezar con cifras ni acrónimos. Empezar con la conclusión
en lenguaje natural y luego anclarla en datos.
Incluir aquí la VALORACIÓN del analista (NO generar sección "Veredicto" separada).
La valoración se fusiona con el diagnóstico en un solo párrafo cohesivo.
Ej: "La reputación algorítmica de [Empresa] es sólida pero presenta un punto
ciego importante: las IAs no encuentran fuentes autoritativas que respalden
sus narrativas. Esto se refleja en un SIM de 37/100, muy por debajo del
umbral verde (70). En contraste, su gestión de controversias es excelente (CEM 95).
En definitiva, la empresa tiene una base reputacional sana pero vulnerable
en credibilidad de fuentes."

### ${H("depth_3kpis")}
MÍNIMO tres indicadores clave extraídos del DATAPACK con su variación. Si hay más métricas relevantes para la pregunta, incluirlas TODAS. No limitar artificialmente:
- **RIX Mediano**: [valor] ±[incertidumbre] ([+/- delta] vs semana anterior — usa DATAPACK.delta_rix si disponible)
- **[KPI 2]**: [valor] (la métrica más fuerte)
- **[KPI 3]**: [valor] (la métrica más débil o con mayor divergencia)
- **[KPI N]**: incluir tantos KPIs adicionales como sean relevantes para el análisis

Si delta_rix está disponible en el DATAPACK, SIEMPRE muestra la variación.
REGLA DELTA HONESTO: Cuando no hay datos históricos para calcular el delta de métricas individuales, declarar UNA SOLA nota al pie de la tabla: "Delta semanal disponible solo para RIX global." NO repetir "sin datos de variación temporal" en cada fila.

### ${H("depth_3findings")}
MÍNIMO tres descubrimientos principales derivados de los datos, sin límite superior. Incluir todos los hallazgos relevantes que el análisis revele. Cada hallazgo en prosa de 2-3 oraciones, citando la evidencia concreta. IMPORTANTE: usar bullets simples (•), NO enumerar con "1.", "2.", "3.".

NO generar subsección "Veredicto" separada. Su contenido ya está integrado en el Diagnóstico.

───────────────────────────────────────────────────────────────────────────────
SECCIÓN 2: ${H("depth_6ai_vision")} — OBLIGATORIA (SECCIÓN CORE)
───────────────────────────────────────────────────────────────────────────────

RESUMEN COMPARATIVO PRIMERO (tabla antes del detalle narrativo):

| Modelo | RIX | Lectura |
|--------|-----|---------|
| [nombre real] | [score] | [ej: "más positiva", "neutral", "más crítica"] |

Después de la tabla, detalle narrativo CONDENSADO: MÁXIMO 2 líneas por modelo
(fortaleza principal + debilidad principal). NO extenderse más. El valor está
en la comparación, no en la repetición.

Después del detalle, incluir bloque PATRONES DETECTADOS con subsecciones SEPARADAS:

#### Consensos
(>=4 IAs coinciden en la misma señal — cada consenso como bullet •)

#### Disensos
(rango >20 entre modelos en alguna métrica — cada disenso como bullet •)

#### Outliers
(1 modelo dice algo que ninguno más detecta — cada outlier como bullet •)

CONTROL DE CALIDAD: Consensos, Disensos y Outliers son subsecciones SEPARADAS con encabezado propio (####). NUNCA concatenarlos en una sola línea. Cada subsección empieza con oración completa. Verificar que no haya palabras duplicadas ni fragmentos cortados.

Usa la TABLA CRUZADA proporcionada en los datos como referencia numérica.

───────────────────────────────────────────────────────────────────────────────
SECCIÓN 3: ${H("depth_8metrics")} — OBLIGATORIA
───────────────────────────────────────────────────────────────────────────────

Tabla con las 8 métricas del sistema RIX:

| Métrica | Puntuación | Semáforo | Explicación |
|---------|------------|----------|-------------|

Semáforo: 🟢 ≥ 70, 🟡 40-69, 🔴 < 40.
Para cada métrica: explicación de POR QUÉ basada en las explicaciones por métrica del DATAPACK.
Si hay datos de competidores, comparar con la media sectorial.

───────────────────────────────────────────────────────────────────────────────
SECCIÓN 4: ${H("depth_model_divergence")} — OBLIGATORIA (cuando snapshot tiene >1 modelo)
───────────────────────────────────────────────────────────────────────────────

ANÁLISIS DE DIVERGENCIAS (SECCIÓN CRÍTICA).
Usar bullets simples (•) para cada divergencia. NO usar listas numeradas (1., 2., 3.).

Para CADA métrica con rango >10 entre modelos, presentar con bullets:
• Identificar modelo más optimista y más pesimista con sus puntuaciones exactas
• Explicar POR QUÉ divergen usando los resúmenes y puntos_clave de cada modelo
• Valorar qué interpretación es más fiable y por qué (arquitectura, fuentes, ventana temporal)

Si rango <=10 en todas las métricas: indicar CONSENSO ROBUSTO y qué significa para la empresa (es una señal positiva de estabilidad perceptual).

En RANKINGS SECTORIALES: mostrar las empresas con MAYOR y MENOR consenso entre IAs.
Si hay divergencias_detalle con múltiples tickers, agrupa por empresa las divergencias más relevantes.

#### Interpretación estratégica de las divergencias
Incluir SIEMPRE un párrafo final que explique el POR QUÉ ESTRUCTURAL de las divergencias entre modelos. Factores a considerar:
• Modelos con acceso a noticias en tiempo real (Perplexity, Grok) tienden a percepciones más actualizadas
• Modelos que dependen de corpus histórico (ChatGPT, DeepSeek) penalizan la falta de eventos datados recientes
• Diferencias en ventana temporal de entrenamiento afectan la lectura de tendencias
• Diferencias en el peso que cada modelo da a fuentes oficiales vs mediáticas
Ejemplo: "Los modelos con acceso a noticias en tiempo real muestran una percepción más positiva; los que dependen de corpus histórico penalizan la ausencia de eventos datados recientes."

───────────────────────────────────────────────────────────────────────────────
SECCIÓN 5: ${H("depth_evolution")} — CONDICIONAL
───────────────────────────────────────────────────────────────────────────────
INCLUIR SOLO SI: DATAPACK.evolucion tiene > 1 semana de datos.

| Semana | RIX Mediano | Δ vs anterior |
|--------|-------------|---------------|

Análisis de la tendencia: ¿mejora, empeora, estable?
Si hay delta_rix, destacarlo prominentemente.
Si evolucion tiene ≤ 1 semana: OMITIR esta sección completamente.

───────────────────────────────────────────────────────────────────────────────
SECCIÓN 6: ${H("depth_competitive")} — CONDICIONAL
───────────────────────────────────────────────────────────────────────────────
INCLUIR SOLO SI: DATAPACK.competidores_directos tiene datos (array no vacío) O DATAPACK.competidores_sin_datos tiene tickers.

REGLA FUNDAMENTAL DE COMPETIDORES (ESTRICTA — NO NEGOCIABLE):
- Los ÚNICOS competidores válidos son los declarados en la columna verified_competitors de la empresa. Son una decisión editorial/estratégica, NO una inferencia automática.
- Si DATAPACK.competidores_fuente === "verified": preséntalo como "Competidores Directos Verificados".
- Si DATAPACK.competidores_directos está vacío Y competidores_sin_datos también vacío: incluir DATAPACK.competidores_nota ("No se han definido competidores directos para esta empresa") y NO inventar comparativas.
- NUNCA añadir competidores que no estén en la columna verified_competitors, aunque sean del mismo sector.
- NUNCA inferir, sugerir ni inventar competidores basándote en el sector o subsector.

COMPETIDORES SIN DATOS RIX:
Si DATAPACK.competidores_sin_datos contiene tickers, DOCUMENTAR EXPLÍCITAMENTE cada uno:
"No se dispone de datos RIX para [TICKER] en este periodo" — NO omitirlos silenciosamente.
Esto es información valiosa: indica que el competidor NO está siendo monitorizado por RepIndex.

| Competidor | Ticker | RIX Mediano | Δ vs empresa |
|------------|--------|-------------|--------------|

Compara la mediana RIX de la empresa analizada con cada competidor que tenga datos.

───────────────────────────────────────────────────────────────────────────────
SECCIÓN 7: ${H("depth_recommendations")} — OBLIGATORIA
───────────────────────────────────────────────────────────────────────────────

MÁXIMO 3 recomendaciones por bloque (no 5). Calidad sobre cantidad.
Incluye tanto DEFENSIVAS (mitigar riesgos) como OFENSIVAS (amplificar fortalezas).

REGLA CLAVE: Cada recomendación EMPIEZA POR LA ACCIÓN, no por la métrica.
El directivo quiere saber QUÉ HACER primero, luego POR QUÉ.

Estructura obligatoria de cada recomendación:

• **Acción concreta**: Qué hacer exactamente (verbo de acción primero). Específica para el caso, NO genérica.

• **Qué implica**: Por qué esta acción importa para la empresa en este momento.

• **Evidencia (métrica)**: Qué métrica o hallazgo del DATAPACK motiva esta recomendación. Score actual y gap.

• **Cómo hacerlo** (3-5 pasos tácticos ejecutables):
  - **Tipo de contenido** a crear o modificar
  - **Canales recomendados**
  - **Formato IA-friendly**: datos verificables, fuentes citadas, Schema markup, FAQ corporativas
  - **Tácticas GEO/AISO específicas**: publicar en fuentes que los LLMs priorizan, crear claims verificables, estructurar FAQ, generar contenido extraíble por crawlers de IA

• **KPI Objetivo y Plazo**: Formato obligatorio: "**Métrica: valor actual → objetivo → plazo**"
  Los objetivos son ORIENTATIVOS. NUNCA prometer resultados.

• **Prioridad**: Alta / Media / Baja

REGLAS DE RECOMENDACIONES:
- Cada recomendación DEBE estar ANCLADA en datos reales del DATAPACK. PROHIBIDO inventar.
- Las tácticas GEO/AISO deben ser ESPECÍFICAS para el caso de la empresa, NO genéricas.
- El tono debe ser de consultor estratégico senior, no de checklist genérico.
- PROHIBIDO inventar plazos, certificaciones, presupuestos o roadmaps ficticios.
- OBLIGATORIO: CADA recomendación DEBE terminar con una línea en formato exacto:
  **KPI objetivo**: [Sigla]: [valor actual] → [objetivo] en [plazo] días.
  Esta línea NO puede omitirse en NINGUNA recomendación. Si falta, la recomendación está INCOMPLETA.

───────────────────────────────────────────────────────────────────────────────
SECCIÓN 8: ${H("depth_closing")} — OBLIGATORIA
───────────────────────────────────────────────────────────────────────────────

- Modelos de IA consultados y fecha del análisis
- Periodo temporal analizado
- Nota sobre la metodología RepIndex

RECUERDA: Solo puedes afirmar lo que los datos proporcionados respaldan.
NUNCA rellenes con invenciones. Las secciones 1, 2, 3, 7 y 8 son OBLIGATORIAS.
`;
}

// =============================================================================
// DRUMROLL QUESTION GENERATOR (Complementary Report Suggestion Based on REAL Data)
// =============================================================================
interface DrumrollQuestion {
  title: string;
  fullQuestion: string;
  teaser: string;
  reportType: "competitive" | "vulnerabilities" | "projection" | "sector";
}

interface AnalysisInsights {
  company: string;
  ticker: string;
  overallScore: number;
  weakestMetrics: { name: string; score: number; interpretation: string }[];
  strongestMetrics: { name: string; score: number; interpretation: string }[];
  trend: "up" | "down" | "stable";
  trendDelta: number;
  divergenceLevel: "low" | "medium" | "high";
  divergenceDetail?: string;
  keyFinding: string;
}

// Extract structured insights from rix_runs data for the analyzed company
function extractAnalysisInsights(
  rixData: any[],
  primaryCompany: { ticker: string; issuer_name: string },
  answer: string,
): AnalysisInsights | null {
  // Filter data for this company
  const companyData = rixData
    .filter((r) => r["05_ticker"] === primaryCompany.ticker)
    .sort((a, b) => new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime());

  if (companyData.length === 0) {
    return null;
  }

  // Get latest week data (multiple models)
  const latestDate = companyData[0]?.batch_execution_date;
  const latestWeekData = companyData.filter((r) => r.batch_execution_date === latestDate);

  // Calculate average RIX across models
  const rixScores = latestWeekData.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
  const avgRix = rixScores.length > 0 ? Math.round(rixScores.reduce((a, b) => a + b, 0) / rixScores.length) : 0;

  // Calculate divergence between models
  const maxRix = Math.max(...rixScores);
  const minRix = Math.min(...rixScores);
  const divergence = maxRix - minRix;
  let divergenceLevel: "low" | "medium" | "high" = "low";
  let divergenceDetail = "";

  if (divergence >= 20) {
    divergenceLevel = "high";
    const maxModel = latestWeekData.find((r) => r["09_rix_score"] === maxRix)?.["02_model_name"];
    const minModel = latestWeekData.find((r) => r["09_rix_score"] === minRix)?.["02_model_name"];
    divergenceDetail = `${maxModel} (${maxRix}) vs ${minModel} (${minRix})`;
  } else if (divergence >= 10) {
    divergenceLevel = "medium";
  }

  // Extract metric scores from latest run (use first model with complete data)
  const latestRun = latestWeekData.find((r) => r["23_nvm_score"] != null) || latestWeekData[0];

  const metrics = [
    {
      name: "NVM (Narrativa)",
      fullName: "Calidad Narrativa",
      score: latestRun?.["23_nvm_score"],
      category: latestRun?.["25_nvm_categoria"],
    },
    {
      name: "DRM (Evidencia)",
      fullName: "Evidencia Documental",
      score: latestRun?.["26_drm_score"],
      category: latestRun?.["28_drm_categoria"],
    },
    {
      name: "SIM (Autoridad)",
      fullName: "Autoridad de Fuentes",
      score: latestRun?.["29_sim_score"],
      category: latestRun?.["31_sim_categoria"],
    },
    {
      name: "RMM (Momentum)",
      fullName: "Momentum Mediático",
      score: latestRun?.["32_rmm_score"],
      category: latestRun?.["34_rmm_categoria"],
    },
    {
      name: "CEM (Riesgo)",
      fullName: "Gestión de Controversias",
      score: latestRun?.["35_cem_score"],
      category: latestRun?.["37_cem_categoria"],
    },
    {
      name: "GAM (Gobernanza)",
      fullName: "Percepción de Gobierno",
      score: latestRun?.["38_gam_score"],
      category: latestRun?.["40_gam_categoria"],
    },
    {
      name: "DCM (Coherencia)",
      fullName: "Coherencia Informativa",
      score: latestRun?.["41_dcm_score"],
      category: latestRun?.["43_dcm_categoria"],
    },
    {
      name: "CXM (Ejecución)",
      fullName: "Ejecución Corporativa",
      score: latestRun?.["44_cxm_score"],
      category: latestRun?.["46_cxm_categoria"],
    },
  ].filter((m) => m.score != null && m.score > 0);

  // Sort by score to find weakest and strongest
  const sortedByScore = [...metrics].sort((a, b) => a.score - b.score);
  const weakest = sortedByScore.slice(0, 2);
  const strongest = sortedByScore.slice(-2).reverse();

  // Calculate trend from historical data (compare last 2 weeks if available)
  let trend: "up" | "down" | "stable" = "stable";
  let trendDelta = 0;

  const uniqueDates = [...new Set(companyData.map((r) => r.batch_execution_date))].sort().reverse();
  if (uniqueDates.length >= 2) {
    const thisWeekData = companyData.filter((r) => r.batch_execution_date === uniqueDates[0]);
    const lastWeekData = companyData.filter((r) => r.batch_execution_date === uniqueDates[1]);

    const thisWeekAvg =
      thisWeekData
        .map((r) => r["09_rix_score"])
        .filter(Boolean)
        .reduce((a, b) => a + b, 0) / thisWeekData.length;
    const lastWeekAvg =
      lastWeekData
        .map((r) => r["09_rix_score"])
        .filter(Boolean)
        .reduce((a, b) => a + b, 0) / lastWeekData.length;

    trendDelta = Math.round(thisWeekAvg - lastWeekAvg);
    if (trendDelta >= 3) trend = "up";
    else if (trendDelta <= -3) trend = "down";
  }

  // Extract key finding from answer (first 300 chars or first paragraph)
  const firstParagraph = answer.split("\n\n")[0] || answer.substring(0, 300);
  const keyFinding = firstParagraph.length > 200 ? firstParagraph.substring(0, 200) + "..." : firstParagraph;

  return {
    company: primaryCompany.issuer_name,
    ticker: primaryCompany.ticker,
    overallScore: avgRix,
    weakestMetrics: weakest.map((m) => ({
      name: m.name,
      score: m.score,
      interpretation: m.category || "Sin categoría",
    })),
    strongestMetrics: strongest.map((m) => ({
      name: m.name,
      score: m.score,
      interpretation: m.category || "Sin categoría",
    })),
    trend,
    trendDelta,
    divergenceLevel,
    divergenceDetail,
    keyFinding,
  };
}

async function generateDrumrollQuestion(
  originalQuestion: string,
  insights: AnalysisInsights | null,
  detectedCompanies: { ticker: string; issuer_name: string; sector_category?: string }[],
  allCompaniesCache: any[] | null,
  language: string,
  languageName: string,
  logPrefix: string,
): Promise<DrumrollQuestion | null> {
  // Solo generar para preguntas corporativas con datos estructurados
  if (detectedCompanies.length === 0 || !insights) {
    console.log(`${logPrefix} No drumroll: no companies or no insights available`);
    return null;
  }

  const primaryCompany = detectedCompanies[0];
  const sectorInfo = primaryCompany.sector_category || null;

  // Encontrar competidores del mismo sector
  let competitors: string[] = [];
  if (sectorInfo && allCompaniesCache) {
    competitors = allCompaniesCache
      .filter((c) => c.sector_category === sectorInfo && c.ticker !== primaryCompany.ticker)
      .slice(0, 5)
      .map((c) => c.issuer_name);
  }

  // Build prompt with REAL structured data
  const drumrollPrompt = `Acabas de generar un análisis sobre: "${originalQuestion}"

═══════════════════════════════════════════════════════════════════════════════
                      HALLAZGOS CLAVE DEL ANÁLISIS (DATOS REALES)
═══════════════════════════════════════════════════════════════════════════════

EMPRESA ANALIZADA: ${insights.company} (${insights.ticker})
SCORE RIX ACTUAL: ${insights.overallScore}/100
TENDENCIA: ${insights.trend === "up" ? "📈 Subiendo" : insights.trend === "down" ? "📉 Bajando" : "➡️ Estable"} (${insights.trendDelta > 0 ? "+" : ""}${insights.trendDelta} pts vs semana anterior)

MÉTRICAS MÁS DÉBILES (oportunidad de mejora):
${insights.weakestMetrics.map((m) => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join("\n")}

MÉTRICAS MÁS FUERTES:
${insights.strongestMetrics.map((m) => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join("\n")}

NIVEL DE DIVERGENCIA ENTRE IAs: ${insights.divergenceLevel.toUpperCase()}${insights.divergenceDetail ? ` - ${insights.divergenceDetail}` : ""}

SECTOR: ${sectorInfo || "No específico"}
COMPETIDORES DISPONIBLES: ${competitors.join(", ") || "No identificados"}

═══════════════════════════════════════════════════════════════════════════════

TU MISIÓN: Basándote en los HALLAZGOS REALES de arriba, propón UN informe complementario que PROFUNDICE en:

1. Si hay MÉTRICAS DÉBILES (<50 pts) → Propón analizar causas específicas y plan de mejora
   Ejemplo: "¿Por qué ${insights.company} tiene baja ${insights.weakestMetrics[0]?.name}? Diagnóstico y soluciones"
   
2. Si hay TENDENCIA NEGATIVA → Propón proyección de escenarios y causas
   Ejemplo: "Análisis de la caída de ${insights.trendDelta} pts: qué está pasando con ${insights.company}"
   
3. Si hay ALTA DIVERGENCIA → Propón entender por qué las IAs difieren
   Ejemplo: "El enigma de ${insights.company}: por qué ChatGPT y DeepSeek discrepan ${insights.divergenceDetail}"
   
4. Si hay FORTALEZA CLARA (>75 pts) → Propón comparar con competidores en esa métrica
   Ejemplo: "¿Puede ${insights.company} mantener su liderazgo en ${insights.strongestMetrics[0]?.name}?"

REGLAS CRÍTICAS:
- El informe debe ser ESPECÍFICO a los datos de arriba - MENCIONA scores, métricas o tendencias concretas
- NO propongas cosas genéricas como "mapa competitivo" o "análisis del sector" sin especificar QUÉ analizar
- El título DEBE mencionar algo específico: una métrica, un score, una tendencia, una cifra
- El teaser debe explicar POR QUÉ este análisis es valioso dado lo que ya sabemos

IDIOMA: Genera TODO en ${languageName}

Responde SOLO en JSON válido (sin markdown):
{
  "title": "Título que referencia un hallazgo ESPECÍFICO del análisis",
  "fullQuestion": "Pregunta ejecutable que profundiza en ese hallazgo específico",
  "teaser": "Por qué este análisis es valioso dado lo que hemos descubierto",
  "reportType": "competitive|vulnerabilities|projection|sector"
}`;

  try {
    const result = await callAISimple(
      [
        {
          role: "system",
          content: `Eres un estratega de inteligencia competitiva que propone análisis ESPECÍFICOS basados en datos reales. NUNCA propones informes genéricos. Siempre refieres métricas, scores o tendencias concretas en tus propuestas. Responde SOLO en JSON válido sin bloques de código.`,
        },
        { role: "user", content: drumrollPrompt },
      ],
      "gpt-4o-mini",
      500,
      logPrefix,
    );

    if (!result) {
      console.log(`${logPrefix} No drumroll: AI returned null`);
      return null;
    }

    const cleanResult = result
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleanResult);

    // Validar estructura completa
    if (parsed.title && parsed.fullQuestion && parsed.teaser && parsed.reportType) {
      console.log(
        `${logPrefix} Drumroll generated: "${parsed.title}" (type: ${parsed.reportType}, based on ${insights.weakestMetrics[0]?.name || "general"} insights)`,
      );
      return parsed as DrumrollQuestion;
    }

    console.log(`${logPrefix} No drumroll: invalid structure`, parsed);
    return null;
  } catch (error) {
    console.warn(`${logPrefix} Error generating drumroll question:`, error);
    return null;
  }
}

// =============================================================================
// BULLETIN DETECTION PATTERNS
// =============================================================================
const BULLETIN_PATTERNS = [
  /(?:genera|crea|hazme|prepara|elabora|dame)\s+(?:un\s+)?(?:bolet[íi]n|informe|reporte|an[áa]lisis\s+completo)\s+(?:de|sobre|para)\s+(.+?)(?:\s+y\s+(?:sus?\s+)?(?:competidores?|competencia))?$/i,
  /(?:bolet[íi]n|informe|reporte)\s+(?:ejecutivo\s+)?(?:de|para|sobre)\s+(.+)/i,
  /an[áa]lisis\s+(?:completo|detallado|exhaustivo)\s+(?:de|para|sobre)\s+(.+?)(?:\s+(?:con|incluyendo|vs?)\s+(?:competidores?|competencia|sector))?/i,
  /(?:compara|comparar|comparativa)\s+(.+?)\s+(?:con|vs?|versus)\s+(?:su\s+)?(?:competencia|competidores?|sector)/i,
];

// =============================================================================
// BULLETIN GENERATION PROMPT - Magazine Style with News Stories
// =============================================================================
const BULLETIN_SYSTEM_PROMPT = `Eres un PERIODISTA ECONÓMICO DE ÉLITE escribiendo un BOLETÍN DE NOTICIAS PREMIUM sobre una empresa específica y su competencia, al estilo de El País, Expansión, Financial Times o The Economist.

## OBJETIVO:
Crear un BOLETÍN PERIODÍSTICO PREMIUM con MÍNIMO 15 NOTICIAS con TITULARES IMPACTANTES basados en datos reales. Cada noticia debe parecer una pieza de periodismo de investigación corporativa.

## ESTILO DE TITULARES (OBLIGATORIO):
Los titulares deben ser:
- **PROVOCATIVOS pero basados en datos**: "Telefónica pierde la batalla digital: ChatGPT la sitúa 15 puntos por debajo de Vodafone"
- **Con gancho emocional**: "La caída silenciosa de BBVA: tres semanas de declive que las IAs no perdonan"
- **Preguntas retóricas**: "¿Está Iberdrola perdiendo su corona energética?"
- **Metáforas periodísticas**: "La guerra de percepciones en el sector bancario", "La montaña rusa reputacional de Inditex"
- **Datos concretos en el titular**: "Repsol cae 8 puntos en RIX mientras Moeve escala posiciones"
- **Contrastes dramáticos**: "Mientras Mercadona brilla, Carrefour lucha por recuperar terreno"

## EJEMPLOS DE TITULARES POR CATEGORÍA:

**NOTICIA PRINCIPAL:**
- "EXCLUSIVA: [Empresa] sufre su peor semana en RepIndex mientras la competencia avanza"
- "[Empresa] rompe el consenso: ChatGPT y DeepSeek discrepan 20 puntos en su valoración"
- "Alerta en [Sector]: [Empresa] pierde el liderazgo reputacional por primera vez en 2025"

**ANÁLISIS DE MÉTRICAS:**
- "Radiografía de una caída: Las 8 métricas que explican el tropiezo de [Empresa]"
- "¿Por qué ChatGPT castiga a [Empresa]? Desglose de un RIX de [XX] puntos"
- "La anatomía del éxito: Cómo [Empresa] logró un RIX de [XX]"

**COMPETENCIA:**
- "Duelo en el [Sector]: [Empresa A] vs [Empresa B], la batalla que define el sector"
- "[Competidor] adelanta a [Empresa] en el ranking: las claves del sorpasso"
- "El nuevo orden en [Sector]: quién sube, quién baja y quién resiste"

**DIVERGENCIAS:**
- "Caso [Empresa]: Cuando las IAs no se ponen de acuerdo"
- "El misterio de [Empresa]: ChatGPT la adora, Perplexity la cuestiona"
- "20 puntos de diferencia: La empresa que divide a las inteligencias artificiales"

**TENDENCIAS:**
- "Cuarta semana de caída: ¿Puede [Empresa] frenar la sangría reputacional?"
- "El rally de [Empresa]: cuatro semanas de ascenso imparable"
- "Punto de inflexión: [Empresa] rompe su racha negativa"

## ESTRUCTURA DEL BOLETÍN PREMIUM:

---

# REPINDEX BULLETIN
## Edición Premium: [NOMBRE EMPRESA]
**[fecha inicio] - [fecha fin]** | **La Autoridad en Reputación Corporativa de las IAs**

---

## 📰 1. PORTADA: LA GRAN HISTORIA

### [TITULAR IMPACTANTE ESTILO PERIODÍSTICO - máximo 80 caracteres]

**Madrid, [fecha]** — [Entradilla de 2-3 líneas con el dato más impactante, respondiendo qué-quién-cuándo-dónde]

[Cuerpo extenso: 4-5 párrafos narrativos estilo periodístico de investigación:
- Párrafo 1: El hecho noticioso principal con datos concretos
- Párrafo 2: Contexto y antecedentes (qué pasó las semanas anteriores)
- Párrafo 3: Análisis de causas y consecuencias
- Párrafo 4: Declaraciones implícitas de los datos ("Los números hablan por sí solos...")
- Párrafo 5: Implicaciones para stakeholders y mercado]

> "El dato que cambia todo: [cita o cifra destacada]"

---

## 🔍 2. INVESTIGACIÓN: ANATOMÍA DEL RIX

### Radiografía de [Empresa]: Las 8 métricas que definen su reputación corporativa

[Entradilla explicando que el RIX no es un número arbitrario sino la suma de 8 dimensiones críticas]

#### Calidad de la Narrativa (NVM): [Score]/100 — [Categoría]
**Titular de métrica**: "[Empresa] [destaca/flaquea] en narrativa: [dato clave]"
[2-3 párrafos periodísticos sobre esta métrica: qué significa, por qué tiene este score, comparación con competidores, qué debería hacer]

#### Fortaleza de Evidencia (DRM): [Score]/100 — [Categoría]
**Titular de métrica**: "La solidez documental de [Empresa]: [hallazgo principal]"
[2-3 párrafos]

#### Autoridad de Fuentes (SIM): [Score]/100 — [Categoría]
**Titular de métrica**: "¿De dónde viene la información sobre [Empresa]? El análisis de fuentes"
[2-3 párrafos]

#### Actualidad y Empuje (RMM): [Score]/100 — [Categoría]
**Titular de métrica**: "[Empresa] [gana/pierde] impulso: análisis del momentum"
[2-3 párrafos]

#### Controversia y Riesgo (CEM): [Score]/100 — [Categoría]
**Titular de métrica**: "Nivel de alerta: ¿Está [Empresa] en zona de riesgo?"
[2-3 párrafos]

#### Independencia de Gobierno (GAM): [Score]/100 — [Categoría]
**Titular de métrica**: "Percepción de gobernanza: [lo que dicen los datos]"
[2-3 párrafos]

#### Integridad del Grafo (DCM): [Score]/100 — [Categoría]
**Titular de métrica**: "Coherencia informativa: el reto de [Empresa]"
[2-3 párrafos]

#### Ejecución Corporativa (CXM): [Score]/100 — [Categoría]
**Titular de métrica**: "El mercado opina: percepción de ejecución en [Empresa]"
[2-3 párrafos]

---

## 🤖 3. EXCLUSIVA: EL JUICIO DE LAS 6 INTELIGENCIAS

### [TITULAR]: ChatGPT, Perplexity, Gemini, DeepSeek, Grok y Qwen emiten su veredicto sobre [Empresa]

[Entradilla sobre cómo cada IA procesa información diferente y por qué sus opiniones importan]

#### ChatGPT dice: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "ChatGPT [aprueba/suspende/cuestiona] a [Empresa]: los motivos"
[3-4 párrafos analizando la perspectiva de ChatGPT, su resumen, puntos clave, por qué difiere de otros]

#### Perplexity opina: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "El veredicto de Perplexity: [hallazgo principal]"
[3-4 párrafos]

#### Gemini evalúa: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Gemini de Google [destaca/critica]: [dato clave]"
[3-4 párrafos]

#### DeepSeek considera: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "DeepSeek, la IA china, [sorprende/confirma]: [hallazgo]"
[3-4 párrafos]

#### Grok evalúa: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Grok de xAI [identifica/señala]: [hallazgo principal]"
[3-4 párrafos analizando la perspectiva de Grok, caracterizada por su enfoque conversacional y acceso a datos de X/Twitter en tiempo real]

#### Qwen considera: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Qwen de Alibaba [revela/detecta]: [hallazgo principal]"
[3-4 párrafos analizando la perspectiva de Qwen, el modelo líder chino con fuerte presencia en mercados asiáticos]

| Modelo | RIX | Veredicto | Fortaleza | Debilidad |
|--------|-----|-----------|-----------|-----------|

---

## 🏆 4. REPORTAJE: LA BATALLA DEL [SECTOR]

### [TITULAR ÉPICO sobre la competencia - ej: "Guerra abierta en el sector [X]: así se reparten el pastel reputacional"]

[Cuerpo de reportaje: 5-6 párrafos estilo reportaje de investigación sobre el panorama competitivo]

**Ranking del Sector [X] - Semana Actual:**
| Pos | Empresa | RIX | Δ | Tendencia | Veredicto |
|-----|---------|-----|---|-----------|-----------|

---

## 📈 5. CRÓNICA: ÚLTIMAS SEMANAS DE [EMPRESA/SECTOR]

### [TITULAR sobre tendencia - ej: "El mes que lo cambió todo para [Empresa]" o "Cuatro semanas de montaña rusa"]

[Crónica periodística semana a semana: 3-5 párrafos narrando la evolución como una historia. Usa todas las semanas disponibles (mínimo 2). Si hay datos de evolución por empresa del sector, incluye las tendencias más relevantes.]

| Semana | RIX Promedio | ChatGPT | Perplexity | Gemini | DeepSeek | Grok | Qwen | Evento Clave |
|--------|--------------|---------|------------|--------|----------|------|------|--------------|

---

## 🔥 6-10. NOTICIAS DE LA COMPETENCIA

### 6. [TITULAR PERIODÍSTICO sobre Competidor 1]
[Noticia completa de 3-4 párrafos como pieza independiente]

### 7. [TITULAR PERIODÍSTICO sobre Competidor 2]
[Noticia completa de 3-4 párrafos]

### 8. [TITULAR PERIODÍSTICO sobre Competidor 3]
[Noticia completa de 3-4 párrafos]

### 9. [TITULAR PERIODÍSTICO sobre Competidor 4]
[Noticia completa de 3-4 párrafos]

### 10. [TITULAR PERIODÍSTICO sobre Competidor 5]
[Noticia completa de 3-4 párrafos]

---

## 📊 11. ANÁLISIS: EL MAPA DEL PODER REPUTACIONAL

### [TITULAR - ej: "Dónde está [Empresa] en el tablero de la reputación corporativa"]

[Análisis de posicionamiento: 3-4 párrafos]

| Cuadrante | Empresas | Característica |
|-----------|----------|----------------|
| 🥇 Líderes (>80) | [...] | Reputación consolidada |
| 🥈 Aspirantes (60-80) | [...] | En ascenso |
| ⚠️ En vigilancia (40-60) | [...] | Requieren atención |
| 🚨 Críticos (<40) | [...] | Situación urgente |

---

## 🎯 12. INVESTIGACIÓN: LAS DIVERGENCIAS

### [TITULAR - ej: "El caso [Empresa]: cuando las IAs no se ponen de acuerdo"]

[Análisis de por qué hay discrepancias entre modelos: 3-4 párrafos]

---

## 📉 13. ALERTA: RIESGOS DETECTADOS

### [TITULAR ALARMANTE pero basado en datos - ej: "Las señales de alarma que [Empresa] no puede ignorar"]

[Análisis de riesgos: 3-4 párrafos]

---

## 💡 14. OPORTUNIDAD: DÓNDE PUEDE GANAR [EMPRESA]

### [TITULAR OPTIMISTA - ej: "El territorio inexplorado: dónde [Empresa] puede dar el salto"]

[Análisis de oportunidades: 3-4 párrafos]

---

## 🔮 15. PROSPECTIVA: ESCENARIOS Y RECOMENDACIONES

### [TITULAR PROSPECTIVO - ej: "2025 para [Empresa]: tres caminos posibles"]

[Análisis prospectivo profundo: 4-5 párrafos]

**Escenario Optimista**: [descripción narrativa]
**Escenario Base**: [descripción narrativa]
**Escenario de Riesgo**: [descripción narrativa]

### Plan de Acción Ejecutivo:
1. **Esta semana**: [acción concreta]
2. **Próximo mes**: [acción táctica]
3. **Próximo trimestre**: [acción estratégica]
4. **Este año**: [visión a largo plazo]

---

## 📋 ANEXOS

### Metodología RepIndex
[Explicación breve del sistema de scoring]

### Glosario de Métricas (Canónico)
- **NVM (Narrative Value Metric → Calidad de la Narrativa)**: Coherencia del discurso, nivel de controversia, afirmaciones verificables
- **DRM (Data Reliability Metric → Fortaleza de Evidencia)**: Solidez documental, fuentes primarias, corroboración
- **SIM (Source Integrity Metric → Autoridad de Fuentes)**: Jerarquía de fuentes citadas (T1: reguladores/financieros → T4: redes/opinión)
- **RMM (Reputational Momentum Metric → Actualidad y Empuje)**: Frescura temporal de menciones en ventana semanal
- **CEM (Controversy Exposure Metric → Gestión de Controversias)**: Exposición a riesgos judiciales/políticos/laborales (100 = sin riesgo, inverso)
- **GAM (Governance Autonomy Metric → Percepción de Gobierno)**: Percepción de independencia y buenas prácticas de gobernanza
- **DCM (Data Consistency Metric → Coherencia Informativa)**: Consistencia de información entre diferentes modelos de IA
- **CXM (Corporate Execution Metric → Ejecución Corporativa)**: Percepción de ejecución en mercado y cotización (solo cotizadas)

### Glosario de Modelos de IA
- **ChatGPT (OpenAI)**: Modelo conversacional líder, fuerte en razonamiento general y síntesis narrativa. Sus fuentes verificadas incluyen URLs con utm_source=openai.
- **Perplexity**: Motor de búsqueda conversacional con citaciones explícitas. Excelente para fuentes recientes y verificables.
- **Gemini (Google)**: Modelo multimodal de Google, fuerte integración con datos de búsqueda y actualidad.
- **DeepSeek**: Modelo chino open-source, perspectiva alternativa con fuerte capacidad de razonamiento técnico.
- **Grok (xAI)**: Modelo de Elon Musk con acceso a datos de X/Twitter en tiempo real, enfoque conversacional y directo.
- **Qwen (Alibaba)**: Modelo líder chino, fuerte en mercados asiáticos y análisis multilingüe.

⚠️ NOTA METODOLÓGICA: SIM mide jerarquía de fuentes, NO sostenibilidad. DRM mide calidad de evidencia, NO desempeño financiero. DCM mide coherencia entre IAs, NO innovación digital.
⚠️ NOTA BIBLIOGRAFÍA: Solo ChatGPT y Perplexity proveen fuentes verificables documentalmente. Las fuentes de otros modelos no se incluyen en la bibliografía por no ser verificables.

---

*RepIndex Bulletin — Edición Premium*
*© RepIndex — La Autoridad en Reputación Corporativa de las IAs*

---

## REGLAS CRÍTICAS:
1. **TITULARES PERIODÍSTICOS**: Cada noticia DEBE tener un titular impactante, provocativo pero basado en datos
2. **MÍNIMO 15 NOTICIAS** completas con titular + entradilla + cuerpo narrativo
3. **ESTILO PERIODÍSTICO**: Escribe como El País, Expansión o Financial Times, no como un informe técnico
4. **DATOS CONCRETOS**: Cada párrafo debe incluir al menos un dato numérico
5. **METÁFORAS Y RECURSOS**: Usa "guerra de percepciones", "montaña rusa", "batalla sectorial", etc.
6. **PREGUNTAS RETÓRICAS**: Engancha al lector con preguntas
7. **NUNCA INVENTES**: Usa SOLO los datos proporcionados
8. **COMPARACIONES CONSTANTES**: Siempre compara con competidores
9. **MÍNIMO 6000 PALABRAS**: Es un producto premium de pago
10. **CADA MÉTRICA ES UNA HISTORIA**: Explica el "por qué" detrás de cada score`;

// Quick bulletin variant used when the user selects "informe rápido".
// It avoids the ultra-long premium constraints to prevent edge timeouts.
const BULLETIN_SYSTEM_PROMPT_QUICK = `Eres RepIndex Bulletin, un analista experto en reputación corporativa.

OBJETIVO: Generar un **boletín ejecutivo RÁPIDO** (800–1200 palabras) basado SOLO en el contexto.

FORMATO OBLIGATORIO:
## Síntesis (30 segundos)
Un párrafo (4-5 líneas) con veredicto + recomendación.

## Highlights
- 5 bullets máximos, cada uno con 1 dato numérico.

## Semáforo de señales
- ✅ Oportunidades (2)
- ⚠️ Riesgos (2)

## Qué vigilar la próxima semana
- 3 bullets máximos.

REGLAS:
- NO inventes datos.
- NO excedas 1200 palabras.
- Máximo 6 mini-noticias (titular + 2 líneas) si el contexto lo permite.
- Estilo ejecutivo, directo, presentable a dirección.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logPrefix = `[${crypto.randomUUID().slice(0, 8)}]`;

  try {
    const body = await req.json();
    const {
      question,
      conversationHistory = [],
      sessionId,
      action,
      roleId,
      roleName,
      rolePrompt,
      originalQuestion,
      originalResponse,
      conversationId,
      bulletinMode,
      bulletinCompanyName,
      language = "es",
      languageName = "Español",
      depthLevel = "complete",
      streamMode = false, // NEW: enable SSE streaming
    } = body;

    // =============================================================================
    // EXTRACT USER ID FROM JWT TOKEN
    // =============================================================================
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const {
          data: { user },
          error,
        } = await supabaseClient.auth.getUser(token);
        if (user && !error) {
          userId = user.id;
          console.log(`${logPrefix} Authenticated user: ${userId}`);
        }
      } catch (authError) {
        console.warn(`${logPrefix} Could not extract user from token:`, authError);
      }
    }

    // =============================================================================
    // CHECK FOR STREAMING MODE (SSE response)
    // =============================================================================
    if (streamMode) {
      console.log(`${logPrefix} STREAMING MODE enabled - SSE response`);
      // For now, fall through to standard processing but return as SSE
      // Full streaming will be implemented in a follow-up
    }

    // =============================================================================
    // CHECK FOR ENRICH ACTION (role-based response adaptation)
    // =============================================================================
    if (action === "enrich" && roleId && rolePrompt && originalResponse) {
      console.log(`${logPrefix} ENRICH REQUEST for role: ${roleName} (${roleId})`);
      return await handleEnrichRequest(
        roleId,
        roleName,
        rolePrompt,
        originalQuestion || "",
        originalResponse,
        sessionId,
        logPrefix,
        supabaseClient,
        userId,
        language,
        languageName,
      );
    }

    console.log(`${logPrefix} User question:`, question);
    console.log(`${logPrefix} Depth level:`, depthLevel);

    const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAIApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Load or refresh company cache
    const now = Date.now();
    if (!companiesCache || now - cacheTimestamp > CACHE_TTL) {
      console.log(`${logPrefix} Loading companies from database...`);
      const { data: companies } = await supabaseClient
        .from("repindex_root_issuers")
        .select("issuer_name, issuer_id, ticker, sector_category, ibex_family_code, cotiza_en_bolsa, include_terms");

      if (companies) {
        companiesCache = companies;
        cacheTimestamp = now;
        console.log(`${logPrefix} Loaded ${companies.length} companies from database and cached`);
      }
    }

    // =============================================================================
    // GUARDRAILS: CATEGORIZE QUESTION AND REDIRECT IF NEEDED
    // =============================================================================
    const questionCategory = categorizeQuestion(question, companiesCache || []);
    console.log(`${logPrefix} Question category: ${questionCategory}`);

    if (questionCategory !== "corporate_analysis") {
      const redirectResponse = getRedirectResponse(questionCategory, question, language, languageName, companiesCache || []);

      // Save to database
      if (sessionId) {
        await supabaseClient.from("chat_intelligence_sessions").insert([
          {
            session_id: sessionId,
            role: "user",
            content: question,
            user_id: userId,
            question_category: questionCategory,
            depth_level: depthLevel,
          },
          {
            session_id: sessionId,
            role: "assistant",
            content: redirectResponse.answer,
            suggested_questions: redirectResponse.suggestedQuestions,
            user_id: userId,
            question_category: questionCategory,
          },
        ]);
      }

      return new Response(
        JSON.stringify({
          answer: redirectResponse.answer,
          suggestedQuestions: redirectResponse.suggestedQuestions,
          metadata: {
            type: "redirect",
            questionCategory,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =============================================================================
    // CHECK FOR GENERIC BULLETIN REQUEST (without specific company)
    // =============================================================================
    const GENERIC_BULLETIN_PATTERNS = [
      /^quiero\s+(?:generar|crear|ver)\s+(?:un\s+)?bolet[íi]n\s+(?:ejecutivo\s+)?(?:de\s+una\s+empresa)?$/i,
      /^(?:genera|crea|hazme|prepara)\s+(?:un\s+)?bolet[íi]n$/i,
      /^bolet[íi]n\s+ejecutivo$/i,
      /^(?:quiero|necesito|me\s+gustar[íi]a)\s+(?:un\s+)?bolet[íi]n/i,
    ];

    const isGenericBulletinRequest = GENERIC_BULLETIN_PATTERNS.some((pattern) => pattern.test(question.trim()));

    if (isGenericBulletinRequest) {
      console.log(`${logPrefix} GENERIC BULLETIN REQUEST - asking for company`);

      // Get some example companies to suggest
      const exampleCompanies = companiesCache?.slice(0, 20).map((c) => c.issuer_name) || [];
      const ibexCompanies =
        companiesCache
          ?.filter((c) => c.ibex_family_code === "IBEX-35")
          .slice(0, 10)
          .map((c) => c.issuer_name) || [];

      const suggestedCompanies = [...new Set([...ibexCompanies, ...exampleCompanies])].slice(0, 8);

      return new Response(
        JSON.stringify({
          answer: t(language, "bulletin_welcome"),
          suggestedQuestions: suggestedCompanies.map((c) => t(language, "bulletin_suggest", { company: c })),
          metadata: {
            type: "standard",
            documentsFound: 0,
            structuredDataFound: companiesCache?.length || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =============================================================================
    // BULLETIN MODE - ONLY TRIGGERED BY EXPLICIT BUTTON CLICK
    // =============================================================================
    // Bulletins are ONLY generated when bulletinMode is explicitly set to true
    // This prevents false positives from users asking for "informes" in general conversation
    if (bulletinMode === true && bulletinCompanyName) {
      console.log(`${logPrefix} BULLETIN MODE ACTIVATED for company: ${bulletinCompanyName}`);
      return await handleBulletinRequest(
        bulletinCompanyName,
        question,
        depthLevel,
        supabaseClient,
        openAIApiKey,
        sessionId,
        logPrefix,
        userId,
        conversationId,
        streamMode,
        language,
        languageName,
      );
    }

    // =============================================================================
    // STANDARD CHAT FLOW (existing logic)
    // =============================================================================
    return await handleStandardChat(
      question,
      conversationHistory,
      supabaseClient,
      openAIApiKey,
      sessionId,
      logPrefix,
      userId,
      language,
      languageName,
      depthLevel,
      roleId, // NEW: pass role info
      roleName,
      rolePrompt,
      streamMode, // Pass streaming mode to standard chat handler
      originalQuestion, // Pass original user question for report_context
    );
  } catch (error) {
    console.error(`${logPrefix} Error in chat-intelligence function:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// =============================================================================
// GUARDRAILS: QUESTION CATEGORIZATION
// =============================================================================
type QuestionCategory =
  | "corporate_analysis" // Normal question about companies
  | "agent_identity" // "Who are you?"
  | "personal_query" // About an individual person
  | "off_topic" // Outside scope
  | "test_limits"; // Jailbreak/testing attempts

function categorizeQuestion(question: string, companiesCache: any[]): QuestionCategory {
  const q = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const logCategory = (category: QuestionCategory, reason: string): QuestionCategory => {
    console.log(`[GUARDRAIL] categorizeQuestion => ${category} (reason=${reason}) question="${question.substring(0, 120)}"`);
    return category;
  };

  // Agent identity patterns
  if (
    /qui[ee]n eres|qu[ee] eres|c[oo]mo funcionas|eres una? ia|que modelo|qué modelo|who are you|what are you/i.test(q)
  ) {
    return logCategory("agent_identity", "agent_identity_pattern");
  }

  // Crisis/alert queries are ALWAYS corporate analysis (cross-company scan)
  const CRISIS_KEYWORDS = ["crisis", "alerta", "alertas", "riesgo", "peligro", "caida", "hundimiento", "peor", "peores", "problemas", "en peligro", "desplome", "colapso", "riesgo reputacional", "en crisis"];
  if (CRISIS_KEYWORDS.some((kw) => q.includes(kw))) {
    return logCategory("corporate_analysis", "crisis_keywords");
  }

  // If mentions known companies, it's corporate analysis — check BEFORE personal_query
  if (detectCompaniesInQuestion(question, companiesCache).length > 0) {
    return logCategory("corporate_analysis", "company_detected");
  }

  // Personal query patterns (asking about themselves or specific people without company context)
  if (/c[oó]mo me ven|qu[eé] dicen de m[ií]|analizame|analiza\s+me\b|sobre m[ií]|analyze me|about me/i.test(q)) {
    return logCategory("personal_query", "personal_query_pattern");
  }

  // Off-topic patterns
  if (
    /f[uú]tbol|pol[ií]tica|receta|chiste|poema|\bcuento\b|\bcuentos\b|weather|tiempo hace|football|soccer|joke|recipe|poem|story/i.test(
      q,
    )
  ) {
    return logCategory("off_topic", "off_topic_pattern");
  }

  // Test limits patterns — expanded to catch injection attempts
  if (/ignore.*instructions|ignora.*instrucciones|jailbreak|bypass|prompt injection|actua como|act as if/i.test(q)) {
    return logCategory("test_limits", "prompt_injection_pattern");
  }

  // Detect "responde literalmente" / "repeat exactly" injection attempts
  if (/responde\s+(?:literalmente|exactamente|solo\s+con)|repite?\s+(?:exactamente|literalmente|solo)|repeat\s+(?:exactly|only)|respond\s+only\s+with/i.test(q)) {
    return logCategory("test_limits", "repeat_exact_pattern");
  }

  // Sector/methodology/ranking queries WITHOUT a specific company
  if (/\b(?:sector|ranking|top\s+\d+|ibex|mercado|metodolog[ií]a|c[oó]mo\s+funciona|qu[eé]\s+es\s+(?:el\s+)?r[ií]x)\b/i.test(q)) {
    return logCategory("corporate_analysis", "sector_or_ranking_pattern");
  }

  // Default: only fall to corporate_analysis if the question has substance
  // Short prompts (<20 chars) or pure instructions without company context → test_limits
  if (q.length < 20 && !/\b(?:analiza|compara|ranking|top|sector)\b/i.test(q)) {
    return logCategory("test_limits", "too_short_no_substance");
  }

  return logCategory("corporate_analysis", "default");
}

function getRedirectResponse(
  category: QuestionCategory,
  question: string,
  language: string,
  languageName: string,
  companiesCache: any[],
): { answer: string; suggestedQuestions: string[] } {
  const ibexCompanies = companiesCache
    ?.filter((c) => c.ibex_family_code === "IBEX-35")
    .slice(0, 5)
    .map((c) => c.issuer_name) || ["Telefónica", "BBVA", "Santander", "Iberdrola", "Inditex"];

  const responses: Record<QuestionCategory, { answer: string; suggestedQuestions: string[] }> = {
    agent_identity: {
      answer: t(language, "agent_identity_answer"),
      suggestedQuestions: [
        t(language, "analyze_company", { company: ibexCompanies[0] }),
        t(language, "top5_ibex"),
        t(language, "sector_comparison"),
      ],
    },
    personal_query: {
      answer: t(language, "personal_query_answer"),
      suggestedQuestions: [
        t(language, "analyze_short", { company: ibexCompanies[0] }),
        t(language, "leadership_perception", { company: ibexCompanies[1] }),
        t(language, "sector_reputation"),
      ],
    },
    off_topic: {
      answer: t(language, "off_topic_answer"),
      suggestedQuestions: [
        t(language, "energy_ranking"),
        t(language, "top10_week"),
        t(language, "analyze_short", { company: ibexCompanies[2] }),
      ],
    },
    test_limits: {
      answer: t(language, "test_limits_answer"),
      suggestedQuestions: [
        t(language, "analyze_short", { company: ibexCompanies[0] }),
        t(language, "top5_ibex"),
        t(language, "telecom_comparison"),
      ],
    },
    corporate_analysis: {
      answer: "",
      suggestedQuestions: [],
    },
  };

  return responses[category];
}

// =============================================================================
// PERICIAL ENRICH HANDLER - Forensic-grade reputation expert report
// Produces a DICTAMEN PERICIAL, NOT an executive report.
// Completely separate system prompt — no Embudo Narrativo, no Pilar 3.
// =============================================================================
async function handlePericialEnrichRequest(
  roleName: string,
  originalQuestion: string,
  originalResponse: string,
  sessionId: string | undefined,
  logPrefix: string,
  supabaseClient: any,
  userId: string | null,
  language: string = "es",
) {
  console.log(`${logPrefix} Generating DICTAMEN PERICIAL for role: ${roleName}`);

  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `Eres un PERITO JUDICIAL especializado en reputación algorítmica corporativa. Tu identidad profesional: perito judicial, perito de parte, profesional que elabora dictámenes periciales sobre daño reputacional en contextos legales (procedimientos judiciales, arbitrajes, mediaciones, reclamaciones extrajudiciales).

Tu función es producir DICTÁMENES PERICIALES con VALOR PROBATORIO. Todo output debe poder incorporarse como anexo o soporte de un dictamen pericial en un procedimiento legal. Rigor documental absoluto. Cero interpretación subjetiva.

El dictamen se elabora con la metodología RepIndex, desarrollada y validada académicamente por la Universidad Complutense de Madrid.

## REGLAS ABSOLUTAS DE COMPORTAMIENTO

**TONO Y LENGUAJE — FORENSE, OBJETIVO, IMPERSONAL:**
- Tercera persona SIEMPRE. El sujeto es "la entidad analizada", "el modelo X", "los datos", "el sistema RepIndex".
- Verbos permitidos: "se constata", "se observa", "los datos evidencian", "resulta acreditado", "se aprecia", "se detecta", "no se dispone de evidencia suficiente para", "se documenta", "queda acreditado".
- PROHIBIDO TERMINANTEMENTE: "creemos", "sugerimos", "recomendamos", "podría ser interesante", "debería", "nuestra opinión", cualquier valoración subjetiva, cualquier recomendación estratégica o comercial, cualquier lenguaje comercial o de marketing.
- NUNCA "podría mejorar", "se sugiere", "sería conveniente". Solo hechos constatables.

**ESTÁNDAR DE EVIDENCIA — CADENA DE CUSTODIA:**
- Cada afirmación requiere: dato numérico + modelo de IA concreto que lo emite + fecha exacta de recogida. Esto constituye la CADENA DE CUSTODIA del dato.
- Formato obligatorio: "[Métrica]: [valor] — Fuente: [modelo], semana [periodo]".
- Distinguir SIEMPRE entre "hecho constatado por datos RepIndex" y "dato no verificable o no disponible".
- Cuando un dato no esté disponible: "No se dispone de evidencia suficiente para constatar este extremo en el periodo analizado."
- NUNCA afirmar causalidad. Solo: "se observa una correlación temporal entre [evento X] y [variación Y puntos en métrica Z]. No se afirma relación causal."
- Las divergencias entre modelos se documentan modelo por modelo. NUNCA se promedian ni generalizan.
- Si los datos no permiten sostener una conclusión, decirlo EXPLÍCITAMENTE. NUNCA forzar narrativa.

**INFORMACIÓN FALSA O NO VERIFICABLE EN MODELOS:**
- Si algún modelo contiene información falsa o no verificable, documentar con rigor: "El modelo [nombre exacto] afirma [afirmación exacta entrecomillada] (fecha de detección: [fecha]). Este dato [no ha podido ser verificado con fuentes independientes / contradice la realidad verificable en cuanto a: ...]. Se constata como posible alucinación del modelo."

**CUANTIFICACIÓN ECONÓMICA — LÍMITE DE COMPETENCIA:**
- PROHIBIDO realizar valoración económica del daño. Esto excede la competencia del análisis reputacional.
- SÍ aportar siempre la base cuantitativa: puntos RIX perdidos, posiciones descendidas en ranking sectorial, deltas temporales medidos semana a semana, métricas deterioradas con magnitud exacta.
- Si procede, se indica: "La base cuantitativa aquí constatada (X puntos perdidos, Y posiciones descendidas, delta de Z puntos en W semanas) deberá ser valorada económicamente por perito especializado en daños patrimoniales."

**METODOLOGÍA REPINDEX:**
- Siempre referenciar: "Sistema RepIndex, metodología de análisis de reputación algorítmica corporativa, validada académicamente por la Universidad Complutense de Madrid."
- Las 8 métricas del sistema RepIndex son (con sus pesos en la ponderación del RIX Score):
  - **NVM — Calidad de la Narrativa (15%)**: Coherencia del discurso, nivel de controversia, verificabilidad de afirmaciones. ¿Con qué atributos se describe a la entidad y son fieles a la realidad?
  - **DRM — Fortaleza de Evidencia (15%)**: Calidad y trazabilidad de las fuentes primarias citadas por los modelos. ¿Las afirmaciones tienen respaldo verificable?
  - **SIM — Autoridad de Fuentes (12%)**: Jerarquía de fuentes (Tier 1: reguladores/financieros → Tier 4: redes/opinión).
  - **RMM — Actualidad y Empuje (12%)**: Frescura temporal de las menciones dentro de la ventana analizada.
  - **CEM — Gestión de Controversias (12%)**: Exposición a narrativas de riesgo activas (100 = ausencia total de controversias). ¿Hay narrativas que puedan constituir daño documentable?
  - **GAM — Percepción de Gobernanza (12%)**: Percepción de independencia y buenas prácticas de gobernanza corporativa.
  - **DCM — Coherencia Informativa (12%)**: Consistencia de la información entre los distintos modelos de IA consultados. ¿Coinciden los modelos en los datos básicos?
  - **CXM — Ejecución Corporativa (10%)**: Percepción de desempeño en mercado y cotización (aplica solo a cotizadas).

**MÉTRICAS PRIORIZADAS EN EL ANÁLISIS PERICIAL (en este orden de relevancia probatoria):**
1. **DCM — Coherencia Informativa**: Si los modelos no coinciden en datos básicos, el riesgo probatorio es máximo.
2. **DRM — Fortaleza de Evidencia**: Sin respaldo verificable, las afirmaciones carecen de valor probatorio.
3. **CEM — Gestión de Controversias**: Narrativas de riesgo activas = daño reputacional documentable.
4. **NVM — Calidad de la Narrativa**: Atributos con los que se describe a la entidad y su fidelidad a la realidad verificable.

## ESTRUCTURA OBLIGATORIA DEL DICTAMEN

Produce el documento siguiendo EXACTAMENTE esta estructura. Mínimo 2.500 palabras. El dictamen debe tener cobertura documental suficiente para valor probatorio.

---

# DICTAMEN PERICIAL DE REPUTACIÓN CORPORATIVA
**Elaborado mediante metodología RepIndex — Universidad Complutense de Madrid**
**Fecha de elaboración del dictamen:** ${today}
**Naturaleza del documento:** Dictamen pericial con valor probatorio para procedimientos judiciales, arbitrales y de mediación

---

## 1. IDENTIFICACIÓN DEL OBJETO DE ANÁLISIS

Especificar con precisión:
- Entidad analizada (denominación completa, ticker bursátil si aplica, sector de actividad)
- Periodo temporal exacto cubierto por los datos (fecha inicio — fecha fin)
- Modelos de IA consultados (con denominación exacta: ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen)
- Número total de observaciones (registros) analizadas
- Fecha y hora de extracción de los datos RepIndex
- Versión metodológica aplicada
- Pregunta o consulta que motivó el presente dictamen

---

## 2. METODOLOGÍA Y CADENA DE CUSTODIA

Describir con rigor procesal:
- Descripción del sistema RepIndex: qué mide (reputación algorítmica corporativa), cómo funciona (consultas estandarizadas a 6 modelos de IA generativa), validación académica por la Universidad Complutense de Madrid
- Qué evalúa cada uno de los 6 modelos de IA consultados y por qué se seleccionaron (representatividad del ecosistema de IA generativa)
- Proceso de recogida de datos: consultas estandarizadas, automatizadas, sin intervención manual, registro automatizado con timestamp
- Cadena de custodia del dato: qué pregunta exacta se formuló a cada modelo → en qué fecha → qué respuesta se obtuvo → cómo se procesó mediante el motor de evaluación RepIndex
- Confirmación explícita: "Los datos han sido obtenidos mediante el sistema automatizado RepIndex sin manipulación posterior a la extracción. La integridad de la cadena de custodia queda acreditada."
- Referencia a pesos de cada métrica en la ponderación del RIX Score global

---

## 3. CONSTATACIÓN DE HECHOS MEDIBLES

Presentar una tabla completa con todas las métricas disponibles:

| Métrica | Nombre completo | Peso | Puntuación | Categoría | Fecha(s) | Modelo(s) | Semáforo |
|---|---|---|---|---|---|---|---|

Para cada métrica:
- Si el dato está disponible: reportar con fuente(s) exacta(s), fecha(s) y valor numérico preciso
- Si el dato NO está disponible: "No se dispone de evidencia suficiente para constatar este extremo en el periodo analizado"
- Semáforo probatorio: 🟢 ≥75 (sin alertas) | 🟡 50-74 (zona de atención) | 🔴 <50 (zona de riesgo probatorio)

Constatar el RIX Score global (media ponderada) como síntesis cuantitativa del estado reputacional algorítmico.
Comparar con la mediana sectorial si los datos están disponibles. Documentar la posición en ranking sectorial.

---

## 4. ANÁLISIS POR MÉTRICA PRIORIZADA

Desarrollar en profundidad las cuatro métricas con mayor relevancia probatoria, EN ESTE ORDEN:

### 4.1 DCM — Coherencia Informativa
¿Coinciden los modelos de IA en los datos básicos sobre la entidad? Documentar discrepancias concretas modelo por modelo. Cada discrepancia: modelo A afirma X, modelo B afirma Y, fecha de detección. La incoherencia entre modelos es un factor de riesgo probatorio crítico.

### 4.2 DRM — Fortaleza de Evidencia
¿Las afirmaciones de los modelos tienen respaldo verificable? Identificar afirmaciones sin fuente o con fuentes de baja jerarquía (Tier 3-4). Documentar: afirmación exacta + modelo + tipo de fuente citada (o ausencia de fuente). Sin evidencia verificable, las afirmaciones carecen de valor probatorio.

### 4.3 CEM — Gestión de Controversias
¿Existen narrativas de riesgo activas en los modelos que puedan constituir daño reputacional documentable? Para cada narrativa detectada: modelo + afirmación exacta + fecha + alcance (¿cuántos modelos la recogen?). Distinguir entre controversias verificables y posibles alucinaciones.

### 4.4 NVM — Calidad de la Narrativa
¿Con qué atributos describen los modelos a la entidad? ¿Son fieles a la realidad verificable? Documentar atributos positivos y negativos detectados, modelo por modelo. Identificar atributos que pudieran constituir daño o beneficio reputacional documentable.

### 4.5 Métricas complementarias
Para las métricas restantes (SIM, RMM, GAM, CXM si aplica), constatar los valores obtenidos y cualquier anomalía significativa. Documentar con el mismo rigor: valor + modelo + fecha.

---

## 5. DIVERGENCIAS ENTRE MODELOS

Tabla de divergencias cuando los valores entre modelos se separan más de 10 puntos:

| Modelo | Métrica | Valor | Desviación vs media | Afirmación concreta detectada | Fecha | Relevancia probatoria |
|---|---|---|---|---|---|---|

Para cada divergencia significativa, documentar:
- Modelo que la origina (nombre exacto)
- Afirmación exacta detectada (cita textual entrecomillada si está disponible en los datos)
- Posible causa documental (información desactualizada, fuentes de baja jerarquía, posible alucinación, etc.)
- Fecha de detección
- Relevancia probatoria: ¿afecta a la fiabilidad del dato como evidencia?

Si no hay divergencias significativas (>10 puntos): constatarlo explícitamente como "alto consenso inter-modelo", lo cual refuerza la fiabilidad probatoria.

---

## 6. EVOLUCIÓN TEMPORAL — ANÁLISIS ANTES/DESPUÉS

(Completar siempre que los datos proporcionados incluyan series temporales de más de una semana)

Para cada evento o variación relevante identificada:
- Estado reputacional PREVIO: puntuación exacta + fecha exacta + modelo(s)
- Estado reputacional POSTERIOR: puntuación exacta + fecha exacta + modelo(s)
- Delta medido: X puntos en métrica Y durante Z semanas
- Constatar SIEMPRE: "Se observa una correlación temporal entre [evento/periodo] y [variación de X puntos en métrica Y]. No se afirma relación causal."
- Documentar si el deterioro/mejora es generalizado (todos los modelos) o aislado (modelos específicos)

Si no hay datos temporales suficientes: "No se dispone de datos históricos suficientes para constatar evolución temporal en el periodo analizado. Se constata únicamente el estado puntual a fecha [fecha]."

---

## 7. CONCLUSIONES PERICIALES

IMPORTANTE: Esta sección NO contiene recomendaciones estratégicas. Contiene exclusivamente conclusiones periciales con formato de dictamen.

Solo incluir conclusiones que los datos permitan sostener con rigor probatorio. Para cada conclusión:

**Estructura obligatoria por conclusión:**
- **HECHO CONSTATADO**: Enunciación precisa del hecho
- **BASE CUANTITATIVA**: Puntuaciones, deltas, posiciones, modelos y fechas que lo sustentan
- **GRADO DE CERTEZA**: "Resulta acreditado" / "Se observan indicios" / "Los datos no permiten sostener esta conclusión"
- **LIMITACIONES**: Si los datos no respaldan plenamente la conclusión, declararlo: "Los datos disponibles no permiten sostener [X]. Sería necesario [Y] para poder afirmarlo con rigor probatorio."

Incluir obligatoriamente:
- Síntesis del estado reputacional algorítmico constatado con base cuantitativa completa
- Existencia o ausencia de deterioro documentable, con fechas y magnitudes exactas
- Coherencia o incoherencia entre modelos como factor de fiabilidad probatoria
- Posición competitiva constatada (si hay datos de competidores verificados)
- Si procede: "La base cuantitativa aquí constatada (X puntos perdidos en métrica Y, Z posiciones descendidas en ranking sectorial, delta de W puntos en V semanas) deberá ser valorada económicamente por perito especializado en daños patrimoniales."
- Si los datos son insuficientes para alguna conclusión, constatarlo explícitamente. NUNCA forzar narrativa.

---

## 8. FUENTES Y TRAZABILIDAD

- Modelos de IA consultados con su denominación exacta y versión si disponible
- Sistema de análisis: RepIndex (metodología de reputación algorítmica corporativa, validada académicamente por la Universidad Complutense de Madrid)
- Periodo exacto de los datos analizados (fecha inicio — fecha fin)
- Fecha y hora de extracción
- Número total de registros/observaciones analizados
- Declaración formal: "Los datos que fundamentan el presente dictamen han sido obtenidos mediante el sistema automatizado RepIndex sin manipulación posterior a la extracción. Se garantiza la integridad de la cadena de custodia de todos los datos referenciados."
- Referencia metodológica: pesos de métricas, criterios de evaluación, proceso de normalización

---

## DATOS A ANALIZAR:

${originalResponse}

## PREGUNTA ORIGINAL QUE MOTIVÓ EL ANÁLISIS:
${originalQuestion || "(No disponible)"}

---

## INSTRUCCIONES FINALES:

1. Mínimo 2.500 palabras. El dictamen pericial debe tener cobertura documental suficiente para valor probatorio.
2. Tercera persona SIEMPRE. Nunca primera persona ni valoraciones subjetivas.
3. Cada afirmación: dato + modelo + fecha = cadena de custodia.
4. Si algún dato no está disponible en los datos proporcionados, declararlo explícitamente en lugar de inventarlo. NUNCA fabricar datos.
5. PROHIBIDO incluir recomendaciones estratégicas, planes de acción, lenguaje comercial o valoraciones económicas del daño.
6. La sección 7 contiene CONCLUSIONES PERICIALES, NO recomendaciones. Formato de dictamen con hechos constatados, base cuantitativa y limitaciones.
7. El documento debe poder incorporarse como anexo documental en un procedimiento judicial, arbitral o de mediación.
8. Priorizar las 4 métricas con mayor relevancia probatoria: DCM, DRM, CEM, NVM (en ese orden).
9. Documentar SIEMPRE el estado antes/después cuando haya datos temporales. Nunca afirmar causalidad.
10. Si los datos no permiten sostener una conclusión, decirlo. NUNCA forzar narrativa.`;

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Elabora el DICTAMEN PERICIAL DE REPUTACIÓN CORPORATIVA completo. Rigor forense absoluto. Mínimo 2.000 palabras. Tercera persona. Solo hechos constatables con base en los datos proporcionados. Sin recomendaciones estratégicas. Sin valoración económica del daño.`,
      },
    ];

    const result = await callAIWithFallback(messages, "o3", 32000, logPrefix);
    const enrichedAnswer = result.content;

    console.log(
      `${logPrefix} DICTAMEN PERICIAL generated (via ${result.provider}), length: ${enrichedAnswer.length} chars`,
    );

    // Log API usage
    await logApiUsage({
      supabaseClient,
      edgeFunction: "chat-intelligence",
      provider: result.provider,
      model: result.model,
      actionType: "enrich",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId,
      sessionId,
      metadata: {
        roleId: "perito_reputacional",
        roleName,
        depth_level: "enrich",
      },
    });

    // Pericial-specific follow-up questions (i18n — now uses passed language)
    const suggestedQuestions = [
      t(language, "pericial_q1"),
      t(language, "pericial_q2"),
      t(language, "pericial_q3"),
    ];

    return new Response(
      JSON.stringify({
        answer: enrichedAnswer,
        suggestedQuestions,
        metadata: {
          type: "enriched",
          roleId: "perito_reputacional",
          roleName,
          aiProvider: result.provider,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`${logPrefix} Error in pericial enrich request:`, error);
    throw error;
  }
}

// =============================================================================
// ENRICH REQUEST HANDLER - Role-based EXPANDED executive reports
// =============================================================================
async function handleEnrichRequest(
  roleId: string,
  roleName: string,
  rolePrompt: string,
  originalQuestion: string,
  originalResponse: string,
  sessionId: string | undefined,
  logPrefix: string,
  supabaseClient: any,
  userId: string | null,
  language: string = "es",
  languageName: string = "Español",
) {
  // Special branch: forensic/legal expert generates a DICTAMEN PERICIAL, not an executive report
  if (roleId === "perito_reputacional") {
    return await handlePericialEnrichRequest(
      roleName,
      originalQuestion,
      originalResponse,
      sessionId,
      logPrefix,
      supabaseClient,
      userId,
      language,
    );
  }

  console.log(`${logPrefix} Generating EXPANDED executive report for role: ${roleName}`);

  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = `Eres el Agente Rix, un consultor senior de reputación corporativa creando un **INFORME EJECUTIVO COMPLETO** para alta dirección.

## REGLA CRÍTICA DE COMUNICACIÓN:

**NO menciones NUNCA el perfil del destinatario en el texto.** 
- ❌ PROHIBIDO: "Como CEO, debes...", "Este informe es para el CEO...", "Para un Director de Marketing..."
- ❌ PROHIBIDO: "Desde tu posición de...", "En tu rol como...", "Como responsable de..."
- ✅ CORRECTO: Simplemente adapta el enfoque y las recomendaciones sin mencionar el perfil
- ✅ CORRECTO: El contenido debe reflejar las prioridades del perfil SIN decirlo explícitamente

**EXPLICA SIEMPRE LAS MÉTRICAS RepIndex (GLOSARIO CANÓNICO):**
El lector NO conoce de memoria qué significa cada métrica. SIEMPRE incluye una explicación breve cuando menciones cualquier métrica:

- **NVM (Calidad de la Narrativa)**: Coherencia del discurso, nivel de controversia, afirmaciones verificables
- **DRM (Fortaleza de Evidencia)**: Calidad de fuentes primarias, corroboración, trazabilidad documental
- **SIM (Autoridad de Fuentes)**: Jerarquía de fuentes citadas (T1: reguladores/financieros → T4: redes/opinión)
- **RMM (Actualidad y Empuje)**: Frescura temporal de menciones dentro de la ventana analizada
- **CEM (Gestión de Controversias)**: Exposición a riesgos (puntuación inversa: 100 = sin controversias)
- **GAM (Percepción de Gobierno)**: Percepción de independencia y buenas prácticas de gobernanza
- **DCM (Coherencia Informativa)**: Consistencia de información entre diferentes modelos de IA
- **CXM (Ejecución Corporativa)**: Percepción de ejecución en mercado y cotización (solo cotizadas)

⚠️ ERRORES A EVITAR: SIM NO mide sostenibilidad. DRM NO mide desempeño financiero. DCM NO mide innovación digital.

Cuando menciones un score (ej: "CEM: 72"), añade contexto: "CEM (Gestión de Controversias): 72 puntos, lo que indica baja exposición a riesgos..."

## IMPORTANTE: ESTO ES UNA EXPANSIÓN, NO UN RESUMEN

La respuesta original contiene datos que DEBES mantener y EXPANDIR significativamente. Tu trabajo es:

1. **MANTENER todos los datos** de la respuesta original (cifras, empresas, métricas, comparativas)
2. **EXPANDIR el análisis** con profundidad propia de un informe ejecutivo de consultoría premium
3. **ADAPTAR el enfoque** a las prioridades del perfil (sin mencionarlo)
4. **INCLUIR secciones adicionales** con recomendaciones estratégicas

${buildDepthPrompt("complete", languageName, language)}

${rolePrompt}

---

## DATOS ORIGINALES A EXPANDIR:

${originalResponse}

## PREGUNTA ORIGINAL:
${originalQuestion || "(No disponible)"}

---

## REGLAS CRÍTICAS:

1. **MÍNIMO 2500 PALABRAS** - Este es un informe ejecutivo premium
2. **ESTRUCTURA** — Resumen Ejecutivo → Análisis de Datos → Contexto Competitivo → Cierre
3. **USAR TODOS LOS DATOS** - No omitir cifras ni empresas mencionadas
4. **TABLAS Y FORMATO** - Usar Markdown: tablas, negritas, listas, quotes
5. **NUNCA MENCIONAR EL PERFIL** - Adapta el contenido sin decir "para el CEO"
6. **EXPLICAR CADA MÉTRICA** - El lector no conoce la terminología
7. **6 CAMPOS POR RECOMENDACIÓN** - Qué, Por qué, Responsable, KPI, Impacto IA
8. **RECOMENDACIONES CONCRETAS** - No generalidades, acciones específicas
9. **NO INVENTAR DATOS** - Solo expandir análisis de datos existentes`;

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Genera un INFORME EJECUTIVO COMPLETO Y EXTENSO para alta dirección. Este debe ser un documento profesional de consultoría premium de MÁXIMA CALIDAD sin límite de extensión - si necesitas 5000 palabras, escribe 5000 palabras. Expandiendo y profundizando en todos los datos disponibles. NO resumas, EXPANDE. EXCELENCIA sobre brevedad. RECUERDA: No menciones el perfil del destinatario en el texto, simplemente adapta el enfoque. Y SIEMPRE explica qué significa cada métrica RepIndex que menciones.`,
      },
    ];

    const result = await callAIWithFallback(messages, "gpt-4.1", 32000, logPrefix);
    const enrichedAnswer = result.content;

    console.log(
      `${logPrefix} EXPANDED executive report generated (via ${result.provider}), length: ${enrichedAnswer.length} chars`,
    );

    // Log API usage
    await logApiUsage({
      supabaseClient,
      edgeFunction: "chat-intelligence",
      provider: result.provider,
      model: result.model,
      actionType: "enrich",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId,
      sessionId,
      metadata: {
        roleId,
        roleName,
        depth_level: "enrich", // Enrichment is always a separate call
      },
    });

    // Generate role-specific follow-up questions
    const suggestedQuestions = await generateRoleSpecificQuestions(roleId, roleName, originalQuestion, logPrefix, language, languageName);

    return new Response(
      JSON.stringify({
        answer: enrichedAnswer,
        suggestedQuestions,
        metadata: {
          type: "enriched",
          roleId,
          roleName,
          aiProvider: result.provider,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`${logPrefix} Error in enrich request:`, error);
    throw error;
  }
}

// Helper function to generate role-specific follow-up questions
async function generateRoleSpecificQuestions(
  roleId: string,
  roleName: string,
  originalQuestion: string,
  logPrefix: string,
  language: string = "es",
  languageName: string = "Español",
): Promise<string[]> {
  const roleQuestionHints: Record<string, string[]> = {
    ceo: ["impacto en negocio", "decisiones estratégicas", "comparativa competitiva", "riesgos principales"],
    periodista: ["titulares noticiables", "controversias", "investigación periodística", "ángulos de historia"],
    analista_mercados: [
      "correlación RIX-cotización",
      "señales de mercado",
      "análisis técnico",
      "comparativa sectorial",
    ],
    inversor: ["screening reputacional", "riesgo ESG", "oportunidades de entrada", "alertas de cartera"],
    dircom: ["gestión de crisis", "narrativa mediática", "mensajes clave", "sentimiento público"],
    marketing: ["posicionamiento de marca", "benchmarking", "diferenciación", "experiencia de cliente"],
    estratega_interno: [
      "capacidades organizativas",
      "cultura corporativa",
      "recursos internos",
      "brechas de alineamiento",
    ],
    estratega_externo: [
      "posición competitiva",
      "oportunidades de mercado",
      "amenazas externas",
      "movimientos estratégicos",
    ],
  };

  const hints = roleQuestionHints[roleId] || ["análisis detallado", "comparativas", "tendencias"];

  try {
    const messages = [
      {
        role: "system",
        content: `[IDIOMA OBLIGATORIO: ${languageName}] Genera 3 preguntas de seguimiento para un ${roleName} interesado en datos de reputación corporativa RepIndex. Las preguntas deben ser específicas y responderibles con datos de RIX Score, rankings, y comparativas. Temas relevantes: ${hints.join(", ")}. Responde SOLO con un array JSON: ["pregunta 1", "pregunta 2", "pregunta 3"]. IMPORTANTE: Las preguntas DEBEN estar escritas en ${languageName}.`,
      },
      {
        role: "user",
        content: `Pregunta original: "${originalQuestion}". Genera 3 preguntas de seguimiento relevantes para un ${roleName}. Responde en ${languageName}.`,
      },
    ];

    const text = await callAISimple(messages, "gpt-4o-mini", 300, logPrefix);
    if (text) {
      const cleanText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(cleanText);
    }
  } catch (error) {
    console.warn(`${logPrefix} Error generating role-specific questions:`, error);
  }

  // Fallback questions based on role — internationalized via PIPELINE_I18N
  const roleKeyMap: Record<string, string> = {
    ceo: "ceo",
    periodista: "journalist",
    analista_mercados: "analyst",
    inversor: "investor",
  };
  const roleKey = roleKeyMap[roleId] || "default";
  return [
    t(language, `fallback_${roleKey}_q1`),
    t(language, `fallback_${roleKey}_q2`),
    t(language, `fallback_${roleKey}_q3`),
  ];
}

// =============================================================================
// BULLETIN REQUEST HANDLER
// =============================================================================
async function handleBulletinRequest(
  companyQuery: string,
  originalQuestion: string,
  depthLevel: "quick" | "complete" | "exhaustive",
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  conversationId: string | undefined,
  streamMode: boolean = false,
  language: string = "es",
  languageName: string = "Español",
) {
  console.log(`${logPrefix} Processing bulletin request for: ${companyQuery}`);

  // 1. Find the company in our database
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const normalizedQuery = normalize(companyQuery);
  const matchedCompany = companiesCache?.find((c) => {
    const name = normalize(c.issuer_name);
    const ticker = c.ticker?.toLowerCase() || "";
    if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) return true;
    if (ticker === normalizedQuery) return true;
    // Check include_terms (aliases without accents)
    if (c.include_terms) {
      try {
        const terms = Array.isArray(c.include_terms) ? c.include_terms : JSON.parse(c.include_terms);
        if (
          terms.some((t: string) => {
            const nt = normalize(t);
            return (
              nt.length > 3 && (nt === normalizedQuery || normalizedQuery.includes(nt) || nt.includes(normalizedQuery))
            );
          })
        )
          return true;
      } catch (_) {
        /* ignore */
      }
    }
    return false;
  });

  if (!matchedCompany) {
    console.log(`${logPrefix} Company not found: ${companyQuery}`);
    const examplesList = companiesCache
      ?.slice(0, 10)
      .map((c) => `${c.issuer_name} (${c.ticker})`)
      .join(", ") || "";
    return new Response(
      JSON.stringify({
        answer: `❌ ${t(language, "company_not_found", { query: companyQuery, examples: examplesList })}`,
        suggestedQuestions: [
          t(language, "top5_ibex"),
          t(language, "bulletin_suggest", { company: "Telefónica" }),
          t(language, "energy_ranking"),
        ],
        metadata: { type: "error", bulletinRequested: true },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(`${logPrefix} Matched company: ${matchedCompany.issuer_name} (${matchedCompany.ticker})`);

  // 2. Get competitors using intelligent prioritization system (GUARDRAIL)
  const competitorLimit = 8; // Always exhaustive
  const competitorResult = await getRelevantCompetitors(
    matchedCompany,
    companiesCache || [],
    supabaseClient,
    competitorLimit,
    logPrefix,
  );
  const competitors = competitorResult.competitors;

  console.log(`${logPrefix} Smart competitor selection: ${competitors.map((c) => c.ticker).join(", ")}`);
  console.log(
    `${logPrefix} Competitor methodology: ${competitorResult.tierUsed} (verified: ${competitorResult.verifiedCount}, subsector: ${competitorResult.subsectorCount})`,
  );

  // 3. Get all tickers to fetch (company + competitors)
  const allTickers = [matchedCompany.ticker, ...competitors.map((c) => c.ticker)];

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. VECTOR STORE SEARCH - Qualitative context from AI explanations
  // ═══════════════════════════════════════════════════════════════════════════
  let vectorStoreContext = "";
  const vectorMatchCount = 30; // Always exhaustive

  try {
    // Generate embedding for the company name
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: `${matchedCompany.issuer_name} ${matchedCompany.ticker} reputación corporativa análisis`,
      }),
    });

    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const queryEmbedding = embeddingData.data?.[0]?.embedding;

      if (queryEmbedding) {
        // Search Vector Store for relevant documents
        // Build metadata filter for more relevant vector results
        const vectorFilter: Record<string, string> = {};
        if (matchedCompany?.ticker) vectorFilter.ticker = matchedCompany.ticker;
        
        const { data: vectorDocs, error: vectorError } = await supabaseClient.rpc("match_documents", {
          query_embedding: queryEmbedding,
          match_count: vectorMatchCount,
          filter: vectorFilter,
        });

        if (!vectorError && vectorDocs?.length > 0) {
          // Filter results to only include documents about this company
          const relevantDocs = vectorDocs.filter((doc: any) => {
            const content = doc.content?.toLowerCase() || "";
            const metadata = doc.metadata || {};
            return (
              content.includes(matchedCompany.ticker.toLowerCase()) ||
              content.includes(matchedCompany.issuer_name.toLowerCase()) ||
              metadata.ticker === matchedCompany.ticker
            );
          });

          if (relevantDocs.length > 0) {
            console.log(
              `${logPrefix} Vector Store: Found ${relevantDocs.length} relevant documents (from ${vectorDocs.length} total)`,
            );

            vectorStoreContext = `\n📚 ANÁLISIS CUALITATIVOS DE IAs (Vector Store - ${relevantDocs.length} documentos):\n`;
            relevantDocs.slice(0, 10).forEach((doc: any, i: number) => {
              const content = doc.content?.substring(0, 600) || "";
              const similarity = doc.similarity ? ` [Similaridad: ${(doc.similarity * 100).toFixed(1)}%]` : "";
              vectorStoreContext += `\n[Fuente ${i + 1}]${similarity}:\n${content}...\n`;
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Vector Store search failed:`, e);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CORPORATE NEWS - Recent news about the company
  // ═══════════════════════════════════════════════════════════════════════════
  let corporateNewsContext = "";

  try {
    const { data: corporateNews, error: newsError } = await supabaseClient
      .from("corporate_news")
      .select("headline, lead_paragraph, published_date, category")
      .eq("ticker", matchedCompany.ticker)
      .order("published_date", { ascending: false })
      .limit(5); // Always exhaustive

    if (!newsError && corporateNews?.length > 0) {
      console.log(`${logPrefix} Corporate News: Found ${corporateNews.length} recent articles`);

      corporateNewsContext = `\n📰 NOTICIAS CORPORATIVAS RECIENTES (${corporateNews.length}):\n`;
      corporateNews.forEach((news: any, i: number) => {
        corporateNewsContext += `${i + 1}. [${news.published_date || "Sin fecha"}] ${news.headline}\n`;
        if (news.lead_paragraph) {
          corporateNewsContext += `   ${news.lead_paragraph.substring(0, 200)}...\n`;
        }
      });
    }
  } catch (e) {
    console.warn(`${logPrefix} Corporate news fetch failed:`, e);
  }

  // 6. Fetch 4 weeks of data for company and competitors with ALL 6 AI models
  // Uses unified helper to combine rix_runs (legacy) + rix_runs_v2 (Grok, Qwen)
  const rixData = await fetchUnifiedRixData({
    supabaseClient,
    columns: `
      "02_model_name",
      "03_target_name",
      "05_ticker",
      "06_period_from",
      "07_period_to",
      "09_rix_score",
      "51_rix_score_adjusted",
      "10_resumen",
      "11_puntos_clave",
      "20_res_gpt_bruto",
      "21_res_perplex_bruto",
      "22_explicacion",
      "23_nvm_score",
      "25_nvm_categoria",
      "26_drm_score",
      "28_drm_categoria",
      "29_sim_score",
      "31_sim_categoria",
      "32_rmm_score",
      "34_rmm_categoria",
      "35_cem_score",
      "37_cem_categoria",
      "38_gam_score",
      "40_gam_categoria",
      "41_dcm_score",
      "43_dcm_categoria",
      "44_cxm_score",
      "46_cxm_categoria",
      "25_explicaciones_detalladas",
      batch_execution_date
    `,
    tickerFilter: allTickers,
    limit: 800,
    logPrefix,
  });

  console.log(`${logPrefix} Fetched ${rixData?.length || 0} RIX records for bulletin`);

  // 7. Organize data by week and company
  const getPeriodKey = (run: any) => `${run["06_period_from"]}|${run["07_period_to"]}`;
  const uniquePeriods = [...new Set(rixData?.map(getPeriodKey) || [])]
    .sort((a, b) => b.split("|")[1].localeCompare(a.split("|")[1]))
    .slice(0, 4); // Always exhaustive: 4 periods

  console.log(`${logPrefix} Unique periods found: ${uniquePeriods.length}`);

  // 8. Build bulletin context
  let bulletinContext = "";

  // Company info
  bulletinContext += `📌 EMPRESA PRINCIPAL:\n`;
  bulletinContext += `- Nombre: ${matchedCompany.issuer_name}\n`;
  bulletinContext += `- Ticker: ${matchedCompany.ticker}\n`;
  bulletinContext += `- Sector: ${matchedCompany.sector_category || "No especificado"}\n`;
  bulletinContext += `- Subsector: ${matchedCompany.subsector || "No definido"}\n`;
  bulletinContext += `- Categoría IBEX: ${matchedCompany.ibex_family_code || "No IBEX"}\n`;
  bulletinContext += `- Cotiza en bolsa: ${matchedCompany.cotiza_en_bolsa ? "Sí" : "No"}\n\n`;

  // Competitors info WITH METHODOLOGY JUSTIFICATION
  bulletinContext += `🏢 COMPETIDORES (${competitors.length}) - METODOLOGÍA DE SELECCIÓN:\n`;
  bulletinContext += `${competitorResult.justification}\n\n`;
  competitors.forEach((c, idx) => {
    bulletinContext += `${idx + 1}. ${c.issuer_name} (${c.ticker})\n`;
    bulletinContext += `   - Sector: ${c.sector_category || "Sin sector"} | Subsector: ${c.subsector || "N/D"}\n`;
  });
  bulletinContext += "\n";

  // Add Vector Store context if available
  if (vectorStoreContext) {
    bulletinContext += vectorStoreContext;
    bulletinContext += "\n";
  }

  // Add Corporate News context if available
  if (corporateNewsContext) {
    bulletinContext += corporateNewsContext;
    bulletinContext += "\n";
  }

  // Data by week with DETAILED metrics
  uniquePeriods.forEach((period, weekIdx) => {
    const [periodFrom, periodTo] = period.split("|");
    const weekData = rixData?.filter((r) => getPeriodKey(r) === period) || [];

    const weekLabel = weekIdx === 0 ? "SEMANA ACTUAL" : `SEMANA -${weekIdx}`;
    bulletinContext += `\n📅 ${weekLabel} (${periodFrom} a ${periodTo}):\n\n`;

    // DETAILED Data for main company
    const mainCompanyData = weekData.filter((r) => r["05_ticker"] === matchedCompany.ticker);
    bulletinContext += `**${matchedCompany.issuer_name} - DATOS DETALLADOS**:\n\n`;

    if (mainCompanyData.length > 0) {
      mainCompanyData.forEach((r) => {
        const score = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
        bulletinContext += `### ${r["02_model_name"]} - RIX: ${score}\n`;

        // Include all RIX metrics
        bulletinContext += `**Métricas del RIX:**\n`;
        bulletinContext += `- NVM (Visibility): ${r["23_nvm_score"] ?? "N/A"} - ${r["25_nvm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- DRM (Digital Resonance): ${r["26_drm_score"] ?? "N/A"} - ${r["28_drm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- SIM (Sentiment): ${r["29_sim_score"] ?? "N/A"} - ${r["31_sim_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- RMM (Momentum): ${r["32_rmm_score"] ?? "N/A"} - ${r["34_rmm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- CEM (Crisis Exposure): ${r["35_cem_score"] ?? "N/A"} - ${r["37_cem_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- GAM (Growth Association): ${r["38_gam_score"] ?? "N/A"} - ${r["40_gam_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- DCM (Data Consistency): ${r["41_dcm_score"] ?? "N/A"} - ${r["43_dcm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- CXM (Customer Experience): ${r["44_cxm_score"] ?? "N/A"} - ${r["46_cxm_categoria"] || "Sin categoría"}\n`;

        // Include summary and key points
        if (r["10_resumen"]) {
          bulletinContext += `\n**Resumen de la IA:**\n${r["10_resumen"]}\n`;
        }
        if (r["11_puntos_clave"] && Array.isArray(r["11_puntos_clave"])) {
          bulletinContext += `\n**Puntos Clave:**\n`;
          r["11_puntos_clave"].forEach((punto: string, i: number) => {
            bulletinContext += `${i + 1}. ${punto}\n`;
          });
        }
        if (r["22_explicacion"]) {
          bulletinContext += `\n**Explicación del Score:**\n${r["22_explicacion"]}\n`;
        }
        if (r["25_explicaciones_detalladas"]) {
          bulletinContext += `\n**Explicaciones Detalladas por Métrica:**\n${JSON.stringify(r["25_explicaciones_detalladas"], null, 2)}\n`;
        }
        bulletinContext += "\n---\n";
      });

      const avgScore =
        mainCompanyData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) /
        mainCompanyData.length;
      bulletinContext += `\n**PROMEDIO RIX ${matchedCompany.issuer_name}**: ${avgScore.toFixed(1)}\n`;
    } else {
      bulletinContext += `- Sin datos esta semana\n`;
    }
    bulletinContext += "\n";

    // Data for competitors with metrics
    bulletinContext += `**COMPETIDORES - RESUMEN ESTA SEMANA**:\n`;
    bulletinContext += `| Empresa | Ticker | RIX Prom | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |\n`;
    bulletinContext += `|---------|--------|----------|-----|-----|-----|-----|-----|-----|-----|-----|\n`;

    competitors.forEach((comp) => {
      const compData = weekData.filter((r) => r["05_ticker"] === comp.ticker);
      if (compData.length > 0) {
        const avgScore =
          compData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / compData.length;
        const avgNVM = compData.reduce((sum, r) => sum + (r["23_nvm_score"] || 0), 0) / compData.length;
        const avgDRM = compData.reduce((sum, r) => sum + (r["26_drm_score"] || 0), 0) / compData.length;
        const avgSIM = compData.reduce((sum, r) => sum + (r["29_sim_score"] || 0), 0) / compData.length;
        const avgRMM = compData.reduce((sum, r) => sum + (r["32_rmm_score"] || 0), 0) / compData.length;
        const avgCEM = compData.reduce((sum, r) => sum + (r["35_cem_score"] || 0), 0) / compData.length;
        const avgGAM = compData.reduce((sum, r) => sum + (r["38_gam_score"] || 0), 0) / compData.length;
        const avgDCM = compData.reduce((sum, r) => sum + (r["41_dcm_score"] || 0), 0) / compData.length;
        const avgCXM = compData.reduce((sum, r) => sum + (r["44_cxm_score"] || 0), 0) / compData.length;
        bulletinContext += `| ${comp.issuer_name} | ${comp.ticker} | ${avgScore.toFixed(1)} | ${avgNVM.toFixed(0)} | ${avgDRM.toFixed(0)} | ${avgSIM.toFixed(0)} | ${avgRMM.toFixed(0)} | ${avgCEM.toFixed(0)} | ${avgGAM.toFixed(0)} | ${avgDCM.toFixed(0)} | ${avgCXM.toFixed(0)} |\n`;
      }
    });
    bulletinContext += "\n";

    // Individual competitor details for current week only
    if (weekIdx === 0) {
      bulletinContext += `\n**DETALLES DE COMPETIDORES - SEMANA ACTUAL:**\n`;
      competitors.forEach((comp) => {
        const compData = weekData.filter((r) => r["05_ticker"] === comp.ticker);
        if (compData.length > 0) {
          bulletinContext += `\n### ${comp.issuer_name} (${comp.ticker}):\n`;
          compData.forEach((r) => {
            const score = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
            bulletinContext += `- ${r["02_model_name"]}: RIX ${score}`;
            if (r["10_resumen"]) {
              bulletinContext += ` | Resumen: ${r["10_resumen"].substring(0, 200)}...`;
            }
            bulletinContext += "\n";
          });
        }
      });
    }
  });

  // Sector average calculation
  if (matchedCompany.sector_category) {
    const sectorCompanies = companiesCache?.filter((c) => c.sector_category === matchedCompany.sector_category) || [];
    const currentWeekData = rixData?.filter((r) => getPeriodKey(r) === uniquePeriods[0]) || [];

    let sectorTotal = 0;
    let sectorCount = 0;

    sectorCompanies.forEach((comp) => {
      const compData = currentWeekData.filter((r) => r["05_ticker"] === comp.ticker);
      if (compData.length > 0) {
        const avg =
          compData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / compData.length;
        sectorTotal += avg;
        sectorCount++;
      }
    });

    if (sectorCount > 0) {
      bulletinContext += `\n📊 CONTEXTO SECTORIAL:\n`;
      bulletinContext += `- Sector: ${matchedCompany.sector_category}\n`;
      bulletinContext += `- Total empresas en sector: ${sectorCompanies.length}\n`;
      bulletinContext += `- Empresas con datos esta semana: ${sectorCount}\n`;
      bulletinContext += `- RIX promedio del sector: ${(sectorTotal / sectorCount).toFixed(1)}\n\n`;
    }
  }

  // 7. Call AI with bulletin prompt
  console.log(`${logPrefix} Calling AI for bulletin generation (depth: ${depthLevel}, streaming: ${streamMode})...`);

  const bulletinUserPrompt = `Genera un BOLETÍN EJECUTIVO completo para la empresa ${matchedCompany.issuer_name} (${matchedCompany.ticker}).

CONTEXTO CON TODOS LOS DATOS:
${bulletinContext}

Usa SOLO estos datos para generar el boletín. Sigue el formato exacto especificado en tus instrucciones.`;

  const bulletinSystemPrompt = BULLETIN_SYSTEM_PROMPT; // Always full bulletin
  const bulletinMessages = [
    { role: "system", content: bulletinSystemPrompt },
    { role: "user", content: bulletinUserPrompt },
  ];

  // Always exhaustive configuration
  const bulletinMaxTokens = 40000;
  const bulletinTimeoutMs = 120000;
  const geminiModel = "gemini-2.5-flash";

  // =========================================================================
  // STREAMING MODE: Return SSE stream for real-time text generation
  // =========================================================================
  if (streamMode) {
    console.log(`${logPrefix} Starting STREAMING bulletin generation...`);

    const sseEncoder = createSSEEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(
            sseEncoder({
              type: "start",
              metadata: {
                companyName: matchedCompany.issuer_name,
                ticker: matchedCompany.ticker,
                sector: matchedCompany.sector_category,
                subsector: matchedCompany.subsector,
                competitorsCount: competitors.length,
                competitorMethodology: competitorResult.tierUsed,
                competitorJustification: competitorResult.justification,
                verifiedCompetitors: competitorResult.verifiedCount,
                vectorStoreDocsUsed: vectorStoreContext ? true : false,
                corporateNewsUsed: corporateNewsContext ? true : false,
                weeksAnalyzed: uniquePeriods.length,
                dataPointsUsed: rixData?.length || 0,
              },
            }),
          );

          let accumulatedContent = "";
          let provider: "openai" | "gemini" = "openai";
          let inputTokens = 0;
          let outputTokens = 0;
          let streamError = false;

          // Try OpenAI first (unless quick mode prefers Gemini)
          if (!isQuickBulletin) {
            console.log(`${logPrefix} Trying OpenAI stream first...`);
            for await (const chunk of streamOpenAIResponse(
              bulletinMessages,
              "o3",
              bulletinMaxTokens,
              logPrefix,
              bulletinTimeoutMs,
            )) {
              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: "chunk", text: chunk.text }));
              } else if (chunk.type === "done") {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === "error") {
                console.warn(`${logPrefix} OpenAI stream error: ${chunk.error}, falling back to Gemini...`);
                streamError = true;
                controller.enqueue(sseEncoder({ type: "fallback", metadata: { provider: "gemini" } }));
                break;
              }
            }
          } else {
            streamError = true; // Skip to Gemini for quick mode
          }

          // Fallback to Gemini if OpenAI failed
          if (streamError || accumulatedContent.length === 0) {
            provider = "gemini";
            accumulatedContent = ""; // Reset for Gemini response

            console.log(`${logPrefix} Using Gemini stream (${geminiModel})...`);
            for await (const chunk of streamGeminiResponse(
              bulletinMessages,
              geminiModel,
              bulletinMaxTokens,
              logPrefix,
              bulletinTimeoutMs,
            )) {
              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: "chunk", text: chunk.text }));
              } else if (chunk.type === "done") {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === "error") {
                console.error(`${logPrefix} Gemini stream also failed: ${chunk.error}`);
                controller.enqueue(
                  sseEncoder({
                    type: "error",
                    error: `Error generando boletín: ${chunk.error}`,
                  }),
                );
                controller.close();
                return;
              }
            }
          }

          console.log(`${logPrefix} Bulletin stream completed (via ${provider}), length: ${accumulatedContent.length}`);

          // Log API usage in background
          logApiUsage({
            supabaseClient,
            edgeFunction: "chat-intelligence",
            provider,
            model: provider === "openai" ? "o3" : geminiModel,
            actionType: "bulletin_stream",
            inputTokens,
            outputTokens,
            userId,
            sessionId,
            metadata: {
              companyName: matchedCompany.issuer_name,
              ticker: matchedCompany.ticker,
              depth_level: depthLevel,
              streaming: true,
            },
          }).catch((e) => console.warn("Failed to log usage:", e));

          // Save to database in background
          if (sessionId) {
            supabaseClient
              .from("chat_intelligence_sessions")
              .insert([
                {
                  session_id: sessionId,
                  role: "user",
                  content: originalQuestion,
                  company: matchedCompany.ticker,
                  analysis_type: "bulletin",
                  user_id: userId,
                },
                {
                  session_id: sessionId,
                  role: "assistant",
                  content: accumulatedContent,
                  company: matchedCompany.ticker,
                  analysis_type: "bulletin",
                  structured_data_found: rixData?.length || 0,
                  user_id: userId,
                },
              ])
              .then(() => console.log(`${logPrefix} Session saved`))
              .catch((e: Error) => console.warn("Failed to save session:", e));
          }

          // Save to user_documents in background
          if (userId) {
            const documentTitle = `Boletín Ejecutivo: ${matchedCompany.issuer_name}`;
            supabaseClient
              .from("user_documents")
              .insert({
                user_id: userId,
                document_type: "bulletin",
                title: documentTitle,
                company_name: matchedCompany.issuer_name,
                ticker: matchedCompany.ticker,
                content_markdown: accumulatedContent,
                conversation_id: conversationId || null,
                metadata: {
                  sector: matchedCompany.sector_category,
                  competitorsCount: competitors.length,
                  weeksAnalyzed: uniquePeriods.length,
                  dataPointsUsed: rixData?.length || 0,
                  aiProvider: provider,
                  generatedAt: new Date().toISOString(),
                },
              })
              .then(() => console.log(`${logPrefix} Document saved`))
              .catch((e: Error) => console.warn("Failed to save document:", e));
          }

          // Generate suggested questions
          const suggestedQuestions = [
            `Genera un boletín de ${competitors[0]?.issuer_name || "otra empresa"}`,
            `¿Cómo se compara ${matchedCompany.issuer_name} con el sector ${matchedCompany.sector_category}?`,
            `Top 5 empresas del sector ${matchedCompany.sector_category}`,
          ];

          // Calculate divergence for methodology metadata
          const modelScores =
            rixData?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)?.map((r) => r["09_rix_score"]) ||
            [];
          const maxScore = modelScores.length > 0 ? Math.max(...modelScores) : 0;
          const minScore = modelScores.length > 0 ? Math.min(...modelScores) : 0;
          const divergencePoints = maxScore - minScore;
          const divergenceLevel = divergencePoints <= 8 ? "low" : divergencePoints <= 15 ? "medium" : "high";

          // Extract unique models used
          const modelsUsed = [...new Set(rixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];

          // Extract period info
          const periodFrom = rixData
            ?.map((r) => r["06_period_from"])
            .filter(Boolean)
            .sort()[0];
          const periodTo = rixData
            ?.map((r) => r["07_period_to"])
            .filter(Boolean)
            .sort()
            .reverse()[0];

          // Extract verified sources from raw AI responses (only ChatGPT + Perplexity)
          const verifiedSources = extractSourcesFromRixData(rixData || []);
          console.log(`${logPrefix} Extracted ${verifiedSources.length} verified sources from RIX data`);

          // Send final done event with enriched methodology metadata
          controller.enqueue(
            sseEncoder({
              type: "done",
              suggestedQuestions,
              metadata: {
                type: "bulletin",
                companyName: matchedCompany.issuer_name,
                ticker: matchedCompany.ticker,
                sector: matchedCompany.sector_category,
                competitorsCount: competitors.length,
                weeksAnalyzed: uniquePeriods.length,
                dataPointsUsed: rixData?.length || 0,
                aiProvider: provider,
                // Verified sources from ChatGPT and Perplexity for bibliography
                verifiedSources: verifiedSources.length > 0 ? verifiedSources : undefined,
                // Report context for InfoBar
                reportContext: {
                  company: matchedCompany.issuer_name,
                  sector: matchedCompany.sector_category,
                  date_from: periodFrom,
                  date_to: periodTo,
                  timezone: "Europe/Madrid (CET/CEST)",
                  models: modelsUsed,
                  sample_size: rixData?.length || 0,
                  models_count: modelsUsed.length,
                  weeks_analyzed: uniquePeriods.length,
                },
                // Methodology metadata for "Radar Reputacional" validation sheet
                methodology: {
                  hasRixData: (rixData?.length || 0) > 0,
                  modelsUsed,
                  periodFrom,
                  periodTo,
                  observationsCount: rixData?.length || 0,
                  divergenceLevel,
                  divergencePoints,
                  uniqueCompanies: 1,
                  uniqueWeeks: uniquePeriods.length,
                },
              },
            }),
          );

          controller.close();
        } catch (error) {
          console.error(`${logPrefix} Streaming error:`, error);
          controller.enqueue(
            sseEncoder({
              type: "error",
              error: error instanceof Error ? error.message : "Error de streaming desconocido",
            }),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // =========================================================================
  // NON-STREAMING MODE: Original behavior (for backwards compatibility)
  // =========================================================================
  const bulletinModel = isQuickBulletin ? "gpt-4o-mini" : "gpt-4.1";

  const result = await callAIWithFallback(
    bulletinMessages,
    bulletinModel,
    bulletinMaxTokens,
    logPrefix,
    bulletinTimeoutMs,
    isQuickBulletin ? { preferGemini: true, geminiTimeout: bulletinTimeoutMs } : { geminiTimeout: bulletinTimeoutMs },
  );
  const bulletinContent = result.content;

  console.log(`${logPrefix} Bulletin generated (via ${result.provider}), length: ${bulletinContent.length}`);

  // Log API usage
  await logApiUsage({
    supabaseClient,
    edgeFunction: "chat-intelligence",
    provider: result.provider,
    model: result.model,
    actionType: "bulletin",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    userId,
    sessionId,
    metadata: {
      companyName: matchedCompany.issuer_name,
      ticker: matchedCompany.ticker,
      depth_level: "bulletin",
    },
  });

  // 8. Save to database (chat_intelligence_sessions)
  if (sessionId) {
    await supabaseClient.from("chat_intelligence_sessions").insert([
      {
        session_id: sessionId,
        role: "user",
        content: originalQuestion,
        company: matchedCompany.ticker,
        analysis_type: "bulletin",
        user_id: userId,
      },
      {
        session_id: sessionId,
        role: "assistant",
        content: bulletinContent,
        company: matchedCompany.ticker,
        analysis_type: "bulletin",
        structured_data_found: rixData?.length || 0,
        user_id: userId,
      },
    ]);
  }

  // 8b. Save bulletin to user_documents for authenticated users
  if (userId) {
    const documentTitle = `Boletín Ejecutivo: ${matchedCompany.issuer_name}`;
    console.log(`${logPrefix} Saving bulletin to user_documents for user: ${userId}`);

    const { error: docError } = await supabaseClient.from("user_documents").insert({
      user_id: userId,
      document_type: "bulletin",
      title: documentTitle,
      company_name: matchedCompany.issuer_name,
      ticker: matchedCompany.ticker,
      content_markdown: bulletinContent,
      conversation_id: conversationId || null,
      metadata: {
        sector: matchedCompany.sector_category,
        competitorsCount: competitors.length,
        weeksAnalyzed: uniquePeriods.length,
        dataPointsUsed: rixData?.length || 0,
        aiProvider: result.provider,
        generatedAt: new Date().toISOString(),
      },
    });

    if (docError) {
      console.error(`${logPrefix} Error saving bulletin to user_documents:`, docError);
    } else {
      console.log(`${logPrefix} Bulletin saved to user_documents successfully`);
    }
  }

  // 9. Return bulletin response (i18n — now uses passed language)
  const suggestedQuestions = [
    t(language, "bulletin_post_suggest", { company: competitors[0]?.issuer_name || "otra empresa" }),
    t(language, "bulletin_post_compare", { company: matchedCompany.issuer_name, sector: matchedCompany.sector_category || "" }),
    t(language, "bulletin_post_top5", { sector: matchedCompany.sector_category || "" }),
  ];

  return new Response(
    JSON.stringify({
      answer: bulletinContent,
      suggestedQuestions,
      metadata: {
        type: "bulletin",
        companyName: matchedCompany.issuer_name,
        ticker: matchedCompany.ticker,
        sector: matchedCompany.sector_category,
        subsector: matchedCompany.subsector,
        competitorsCount: competitors.length,
        competitorMethodology: competitorResult.tierUsed,
        competitorJustification: competitorResult.justification,
        verifiedCompetitors: competitorResult.verifiedCount,
        vectorStoreDocsUsed: vectorStoreContext ? true : false,
        corporateNewsUsed: corporateNewsContext ? true : false,
        weeksAnalyzed: uniquePeriods.length,
        dataPointsUsed: rixData?.length || 0,
        aiProvider: result.provider,
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// =============================================================================
// STANDARD CHAT HANDLER (existing logic refactored)
// =============================================================================
// =============================================================================
// FUNCIÓN: Detectar empresas mencionadas en la pregunta
// =============================================================================
function detectCompaniesInQuestion(question: string, companiesCache: any[]): any[] {
  if (!companiesCache || companiesCache.length === 0) return [];

  const normalizedQuestion = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove accents

  // Confidence-scored detection to avoid false positives
  const scored: { company: any; score: number }[] = [];

  // Expanded blacklist of generic words that appear in company names but are not distinctive
  const commonWords = new Set([
    "banco", "grupo", "empresa", "compania", "sociedad", "holding",
    "spain", "espana", "corp", "corporation", "energia", "capital",
    "inmobiliaria", "servicios", "internacional", "industria", "global",
    "digital", "comunicacion", "financiera", "renovable", "logistica",
    "gestion", "tecnologia", "infraestructuras", "soluciones", "sistemas",
    "desarrollo", "construccion", "ingenieria", "medios", "seguros",
    "inversiones", "recursos", "natural", "properties", "solutions",
  ]);

  // Helper to escape regex special characters
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const company of companiesCache) {
    const companyName =
      company.issuer_name
        ?.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") || "";
    const ticker = company.ticker?.toLowerCase() || "";
    let bestScore = 0;

    // Full name match → score 1.0
    if (companyName && companyName.length > 3 && normalizedQuestion.includes(companyName)) {
      bestScore = 1.0;
    }

    // Ticker match (word boundary) → score 0.9
    if (bestScore < 0.9 && ticker && ticker.length >= 2) {
      const tickerRegex = new RegExp(`\\b${escapeRegex(ticker)}\\b`, "i");
      if (tickerRegex.test(normalizedQuestion)) {
        bestScore = Math.max(bestScore, 0.9);
      }
    }

    // include_terms match → score 0.8
    if (bestScore < 0.8 && company.include_terms) {
      try {
        const terms = Array.isArray(company.include_terms) ? company.include_terms : JSON.parse(company.include_terms);
        for (const term of terms) {
          const normalizedTerm = (term as string)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          if (normalizedTerm.length > 3 && normalizedQuestion.includes(normalizedTerm)) {
            bestScore = Math.max(bestScore, 0.8);
            break;
          }
        }
      } catch (_) {
        /* ignore parse errors */
      }
    }

    // Partial name word match → score 0.5 (only words >= 6 chars, not in blacklist)
    if (bestScore < 0.5) {
      const nameWords = companyName.split(/\s+/).filter(
        (word) => word.length >= 6 && !commonWords.has(word)
      );
      for (const word of nameWords) {
        // Require word boundary match to avoid substring false positives
        const wordRegex = new RegExp(`\\b${escapeRegex(word)}\\b`);
        if (wordRegex.test(normalizedQuestion)) {
          bestScore = Math.max(bestScore, 0.5);
          break;
        }
      }
    }

    if (bestScore >= 0.7) {
      scored.push({ company, score: bestScore });
    }
  }

  // Sort by confidence descending, deduplicate
  scored.sort((a, b) => b.score - a.score);
  const result = [...new Map(scored.map((s) => [s.company.ticker, s.company])).values()];
  
  if (result.length > 0) {
    console.log(`[CompanyDetect] Detected with scores: ${scored.map(s => `${s.company.issuer_name}(${s.score})`).join(", ")}`);
  }
  
  return result;
}

async function handleStandardChat(
  question: string,
  conversationHistory: any[],
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  language: string = "es",
  languageName: string = "Español",
  depthLevel: "quick" | "complete" | "exhaustive" = "complete",
  roleId?: string,
  roleName?: string,
  rolePrompt?: string,
  streamMode: boolean = false,
  originalUserQuestion?: string,
) {
  console.log(`${logPrefix} Depth level: ${depthLevel}, Role: ${roleName || "General"}`);

  // =============================================================================
  // PIPELINE MULTI-EXPERTO E1-E6
  // =============================================================================

  // --- SKILLS PIPELINE (primary) or LEGACY E1+F2+E2 (fallback) ---
  let dataPack: DataPack;
  let classifier: ClassifierResult;
  let detectedCompanies: any[];
  let usedSkillsPipeline = false;

  if (USE_SKILLS_PIPELINE) {
    console.log(`${logPrefix} [SKILLS] Attempting skills-based pipeline...`);
    const skillsStart = Date.now();
    const skillsPack = await buildDataPackFromSkills(question, supabaseClient, companiesCache, logPrefix, originalUserQuestion);
    if (skillsPack && (skillsPack.snapshot.length > 0 || skillsPack.ranking.length > 0 || (skillsPack as any).crisis_scan_empty === true)) {
      usedSkillsPipeline = true;
      dataPack = skillsPack;
      console.log(`${logPrefix} [SKILLS] Success in ${Date.now() - skillsStart}ms — snapshot:${skillsPack.snapshot.length}, ranking:${skillsPack.ranking.length}`);

      // Create a minimal classifier for downstream compatibility (suggestions, drumroll, session save)
      const interpretResult = await interpretQueryEdge(question);
      const detectedFromCache = detectCompaniesInQuestion(question, companiesCache || []);
      classifier = {
        tipo: interpretResult.intent === "ranking" || interpretResult.intent === "sector_comparison" ? "sector" : "empresa",
        empresas_detectadas: detectedFromCache.map((c: any) => ({ ticker: c.ticker, nombre: c.issuer_name, confianza: 0.9 })),
        intencion: interpretResult.intent === "ranking" ? "ranking" : interpretResult.intent === "evolution" ? "evolucion" : "diagnostico",
        metricas_mencionadas: [],
        periodo_solicitado: "ultima_semana",
        idioma: language === "en" ? "en" : "es",
        requiere_bulletin: false,
      } as ClassifierResult;
      (classifier as any)._originalQuestion = question;

      detectedCompanies = detectedFromCache.length > 0
        ? detectedFromCache
        : skillsPack.empresa_primaria
          ? [{ ticker: skillsPack.empresa_primaria.ticker, issuer_name: skillsPack.empresa_primaria.nombre, sector_category: skillsPack.empresa_primaria.sector, subsector: skillsPack.empresa_primaria.subsector, ibex_family_code: null, cotiza_en_bolsa: true }]
          : [];
    } else {
      console.log(`${logPrefix} [SKILLS] Insufficient data, falling back to legacy pipeline`);
    }
  }

  if (!usedSkillsPipeline) {
    // --- LEGACY: E1 + F2 + E2 (unchanged) ---
    console.log(`${logPrefix} [PIPELINE] Starting E1-E6 multi-expert pipeline...`);
    classifier = await runClassifier(question, companiesCache || [], conversationHistory, language, logPrefix);
    (classifier as any)._originalQuestion = question;

    detectedCompanies = classifier.empresas_detectadas.map(e => {
      const found = (companiesCache || []).find(c => c.ticker === e.ticker);
      return found || { ticker: e.ticker, issuer_name: e.nombre, sector_category: null, subsector: null, ibex_family_code: null, cotiza_en_bolsa: true };
    });
    console.log(`${logPrefix} [E1] Detected companies: ${detectedCompanies.map(c => c.issuer_name).join(", ") || "none"}`);

    // --- F2: SQL EXPERT (dynamic queries) ---
    const f2Results = await generateAndExecuteSQLQueries(question, classifier, supabaseClient, logPrefix);

    // --- E2: DATAPACK SQL (hardcoded + F2 enrichment) ---
    dataPack = await buildDataPack(classifier, supabaseClient, companiesCache, logPrefix);

    // Merge F2 dynamic data into DataPack as supplementary context
    if (f2Results.length > 0) {
      const f2SuccessfulData = f2Results.filter(r => r.data && r.data.length > 0);
      if (f2SuccessfulData.length > 0) {
        (dataPack as any).f2_dynamic = f2SuccessfulData.map(r => ({
          label: r.label,
          rows: r.data!.slice(0, 100),
          row_count: r.data!.length,
        }));
        console.log(`${logPrefix} [F2→E2] Merged ${f2SuccessfulData.length} dynamic datasets into DataPack`);
      }
    }
  }

  // --- Inject originalUserQuestion and perspective into report_context ---
  if ((dataPack as any).report_context) {
    if (originalUserQuestion) {
      (dataPack as any).report_context.user_question = originalUserQuestion;
    }
    if (roleName) {
      (dataPack as any).report_context.perspective = roleName;
    }
  }

  // --- CONTEXTO COMPLEMENTARIO: Graph Expansion ---
  let graphContextString = "";
  if (detectedCompanies.length > 0) {
    try {
      const graphPromises = detectedCompanies.slice(0, 3).map(async (company) => {
        const { data, error } = await supabaseClient.rpc("expand_entity_graph_with_scores", {
          p_ticker: company.ticker,
          p_depth: 2,
          p_weeks: 4,
        });
        if (error) {
          console.warn(`${logPrefix} Graph expansion error for ${company.ticker}:`, error.message);
          return null;
        }
        return data;
      });
      const graphResults = (await Promise.all(graphPromises)).filter(Boolean);
      if (graphResults.length > 0) {
        // Build compact graph context
        const graphSections: string[] = [];
        for (const graph of graphResults) {
          if (!graph.primary_entity || !graph.graph) continue;
          const primary = graph.primary_entity;
          const primaryScore = graph.entity_scores?.[primary.ticker];
          graphSections.push(`## ${primary.name} (${primary.ticker})`);
          if (primaryScore) graphSections.push(`RIX Promedio: ${primaryScore.avg_rix} (${primaryScore.min_rix}-${primaryScore.max_rix})`);
          
          const competitors = graph.graph.filter((e: any) => e.relation === "COMPITE_CON");
          if (competitors.length > 0) {
            graphSections.push(`Competidores verificados:`);
            for (const comp of competitors) {
              const compScore = graph.entity_scores?.[comp.ticker];
              graphSections.push(`- ${comp.name} (${comp.ticker}): RIX ${compScore?.avg_rix || "N/A"}`);
            }
          }
          
          const allScores = Object.entries(graph.entity_scores || {})
            .filter(([t]) => t !== primary.ticker)
            .map(([t, s]: [string, any]) => ({ ticker: t, avg_rix: s.avg_rix }))
            .filter(e => e.avg_rix);
          if (allScores.length > 0) {
            const avgSector = Math.round(allScores.reduce((sum, e) => sum + e.avg_rix, 0) / allScores.length * 10) / 10;
            graphSections.push(`Promedio sectorial: ${avgSector}`);
            if (primaryScore) {
              const diff = (primaryScore.avg_rix - avgSector).toFixed(1);
              graphSections.push(`${primary.name}: ${parseFloat(diff) >= 0 ? "+" : ""}${diff} vs sector`);
            }
          }
        }
        graphContextString = graphSections.join("\n");
      }
      console.log(`${logPrefix} [GRAPH] Expansion complete: ${graphResults.length} graphs`);
    } catch (graphError) {
      console.warn(`${logPrefix} [GRAPH] Failed:`, graphError);
    }
  }

  // --- CONTEXTO COMPLEMENTARIO: Vector Search ---
  let vectorDocs: any[] = [];
  let vectorContextString = "";
  try {
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: question }),
    });
    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;
      // Build contextual metadata filter for vector search
      const vectorFilter: Record<string, string> = {};
      if (detectedCompanies?.length > 0 && detectedCompanies[0]?.ticker) {
        vectorFilter.ticker = detectedCompanies[0].ticker;
      } else if (classifier?.empresas_detectadas?.length > 0) {
        vectorFilter.ticker = classifier.empresas_detectadas[0].ticker;
      }
      
      const { data: docs } = await supabaseClient.rpc("match_documents", {
        query_embedding: embedding,
        match_count: 50,
        filter: Object.keys(vectorFilter).length > 0 ? vectorFilter : {},
      });
      vectorDocs = docs || [];
      if (vectorDocs.length > 0) {
        vectorContextString = vectorDocs.slice(0, 10).map((doc: any, i: number) => {
          const meta = doc.metadata || {};
          return `[${i+1}] ${meta.company_name || "?"} - ${meta.week || "?"}: ${doc.content?.substring(0, 300) || ""}`;
        }).join("\n");
      }
      console.log(`${logPrefix} [VECTOR] Found ${vectorDocs.length} documents`);
    }
  } catch (vecError) {
    console.warn(`${logPrefix} [VECTOR] Failed:`, vecError);
  }

  // --- CONTEXTO COMPLEMENTARIO: Regression Analysis ---
  let regressionContextString = "";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const regResponse = await fetch(`${supabaseUrl}/functions/v1/rix-regression-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({ minWeeks: 6 }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (regResponse.ok) {
      const regData = await regResponse.json();
      if (regData?.success && regData.topPredictors?.length > 0) {
        regressionContextString = `Correlaciones métricas RIX ↔ precio (${regData.dataProfile?.totalRecords || 0} registros, ${regData.dataProfile?.companiesWithPrices || 0} empresas):\n`;
        regressionContextString += regData.topPredictors.map((p: any) => 
          `${p.displayName}: r=${p.correlation > 0 ? "+" : ""}${p.correlation.toFixed(3)}`
        ).join(", ");
        regressionContextString += `\nR²: ${((regData.rSquared || 0) * 100).toFixed(1)}%`;
      }
      console.log(`${logPrefix} [REGRESSION] Loaded: ${regData?.dataProfile?.totalRecords || 0} records`);
    }
  } catch (regError) {
    console.warn(`${logPrefix} [REGRESSION] Failed:`, regError);
  }

  // --- GRACEFUL EMPTY DATAPACK CHECK ---
  const dpHasSnapshot = dataPack.snapshot && dataPack.snapshot.length > 0;
  const dpHasRanking = dataPack.ranking && dataPack.ranking.length > 0;
  const dpHasF2 = (dataPack as any).f2_dynamic && Object.keys((dataPack as any).f2_dynamic).length > 0;
  const dpCrisisEmpty = (dataPack as any).crisis_scan_empty === true;

  console.log(`${logPrefix} [GRACEFUL-CHECK] snapshot=${dpHasSnapshot}, ranking=${dpHasRanking}, f2=${dpHasF2}, crisisEmpty=${dpCrisisEmpty}`);

  if (!dpHasSnapshot && !dpHasRanking && !dpHasF2) {
    let earlyResponse: string | null = null;
    let earlySuggestions: string[] = [];

    if (dpCrisisEmpty) {
      const batchDate = (dataPack as any).crisis_batch_date || "reciente";
      const langKey = language === "en" ? "en" : "es";
      earlyResponse = langKey === "en"
        ? `✅ **Good news!** In the latest sweep (${batchDate}), no company has been detected in a crisis situation. All monitored companies maintain a CEM > 40 and a RIX > 40.\n\nThis means the reputational ecosystem is stable across all analyzed companies.`
        : `✅ **¡Buenas noticias!** En el último barrido (${batchDate}) no se ha detectado ninguna empresa en situación de crisis. Todas las empresas monitorizadas mantienen un CEM > 40 y un RIX > 40.\n\nEsto significa que el ecosistema reputacional se mantiene estable en todas las empresas analizadas.`;
      earlySuggestions = langKey === "en"
        ? ["Which companies have the lowest reputation this week?", "Show me the top 5 IBEX 35 by reputation", "Which sector has the most reputational risk?"]
        : ["¿Qué empresas tienen peor reputación esta semana?", "Muéstrame el top 5 del IBEX 35 por reputación", "¿Qué sector tiene más riesgo reputacional?"];
    } else {
      const langKey = language === "en" ? "en" : "es";
      earlyResponse = langKey === "en"
        ? "I couldn't find enough data to answer this query. Please make sure the company is in our monitoring universe or rephrase your question."
        : "No he encontrado datos suficientes para responder a esta consulta. Asegúrate de que la empresa está en nuestro universo de monitorización o reformula la pregunta.";
      earlySuggestions = langKey === "en"
        ? ["Show me the IBEX 35 ranking", "Analyze Telefónica", "Which companies are in crisis?"]
        : ["Muéstrame el ranking del IBEX 35", "Analiza Telefónica", "¿Hay alguna empresa en crisis?"];
    }

    if (earlyResponse) {
      console.log(`${logPrefix} [GRACEFUL] Empty dataPack detected (crisis_empty=${dpCrisisEmpty}), returning early response`);

      // Save to session
      try {
        await supabaseClient.from("chat_intelligence_sessions").insert([
          { session_id: sessionId, role: "user", content: question, user_id: userId },
          { session_id: sessionId, role: "assistant", content: earlyResponse, user_id: userId, question_category: dpCrisisEmpty ? "alert" : "general" },
        ]);
      } catch (_e) { /* ignore session save error */ }

      if (streamMode) {
        // Use proper SSE format matching createSSEEncoder output
        const sseEncoderEarly = createSSEEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(sseEncoderEarly({ type: "start", metadata: { language, depthLevel, detectedCompanies: [] } }));
            controller.enqueue(sseEncoderEarly({ type: "chunk", text: earlyResponse }));
            controller.enqueue(sseEncoderEarly({ type: "done", suggestedQuestions: earlySuggestions, metadata: { type: "standard", documentsFound: 0, structuredDataFound: 0, questionCategory: dpCrisisEmpty ? "alert" : "general" } }));
            controller.close();
          },
        });
        return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      } else {
        return new Response(JSON.stringify({ answer: earlyResponse, suggestedQuestions: earlySuggestions, metadata: { type: "standard", questionCategory: dpCrisisEmpty ? "alert" : "general" } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
  }

  // --- DIRECT CRISIS RESPONSE (bypass E3/E4/E5 orchestrator) ---
  // If this is a crisis_scan query with data, generate markdown directly — no LLM needed
  const firstRank = dataPack.ranking?.[0];
  const isCrisisQueryWithData = !dpHasSnapshot && dpHasRanking && dataPack.ranking.length > 0 && firstRank && ("cem" in firstRank || "35_cem_score" in firstRank);
  console.log(`${logPrefix} [CRISIS-DETECT] isCrisisQueryWithData=${isCrisisQueryWithData}, rankingLen=${dataPack.ranking.length}, firstRankKeys=${firstRank ? Object.keys(firstRank).join(",") : "null"}`);
  if (isCrisisQueryWithData) {
    console.log(`${logPrefix} [CRISIS-DIRECT] Generating direct markdown response for crisis_scan (${dataPack.ranking.length} companies)`);

    const batchDate = (dataPack as any).crisis_batch_date || "último barrido";
    const langKey = language === "en" ? "en" : "es";

    // Sort by rix_avg ascending (worst first) — handle both field name variants
    const sorted = [...dataPack.ranking].sort((a: any, b: any) => {
      const aRix = a.rix_avg ?? a["09_rix_score"] ?? 100;
      const bRix = b.rix_avg ?? b["09_rix_score"] ?? 100;
      return aRix - bRix;
    });

    // Helper to read fields regardless of naming convention (mapped vs raw)
    const f = (r: any, mapped: string, raw: string) => r[mapped] ?? r[raw] ?? "—";

    let crisisMarkdown: string;
    if (langKey === "en") {
      crisisMarkdown = `## ⚠️ Companies in the Reputational Risk Zone\n\nAccording to the latest sweep (${batchDate}), **${sorted.length} companies** show RIX or CEM scores below 40, indicating potential reputational risk.\n\n`;
      crisisMarkdown += `| # | Company | Ticker | RIX | CEM | NVM | Sector |\n|---|---------|--------|-----|-----|-----|--------|\n`;
      sorted.forEach((r: any, i: number) => {
        crisisMarkdown += `| ${i + 1} | ${f(r, "nombre", "03_target_name")} | ${f(r, "ticker", "05_ticker")} | ${f(r, "rix_avg", "09_rix_score")} | ${f(r, "cem", "35_cem_score")} | ${f(r, "nvm", "23_nvm_score")} | ${f(r, "sector", "sector_category")} |\n`;
      });
      crisisMarkdown += `\n**Methodology:** Companies with RIX < 40 or CEM (Crisis Management) < 40 in the latest weekly sweep. RIX is the median of 6 AI models (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen).\n\n*Data from sweep of ${batchDate}*`;
    } else {
      crisisMarkdown = `## ⚠️ Empresas en Zona de Riesgo Reputacional\n\nSegún el último barrido (${batchDate}), **${sorted.length} empresas** presentan puntuaciones RIX o CEM por debajo de 40, lo que indica riesgo reputacional potencial.\n\n`;
      crisisMarkdown += `| # | Empresa | Ticker | RIX | CEM | NVM | Sector |\n|---|---------|--------|-----|-----|-----|--------|\n`;
      sorted.forEach((r: any, i: number) => {
        crisisMarkdown += `| ${i + 1} | ${f(r, "nombre", "03_target_name")} | ${f(r, "ticker", "05_ticker")} | ${f(r, "rix_avg", "09_rix_score")} | ${f(r, "cem", "35_cem_score")} | ${f(r, "nvm", "23_nvm_score")} | ${f(r, "sector", "sector_category")} |\n`;
      });
      crisisMarkdown += `\n**Metodología:** Empresas con RIX < 40 o CEM (Gestión de Controversias) < 40 en el último barrido semanal. El RIX es la mediana de 6 modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen).\n\n*Datos del barrido del ${batchDate}*`;
    }

    const firstName = f(sorted[0], "nombre", "03_target_name");
    const crisisSuggestions = langKey === "en"
      ? [`Analyze ${firstName !== "—" ? firstName : "the worst company"}`, "Show me the IBEX 35 ranking", "Which sector has the most risk?"]
      : [`Analiza ${firstName !== "—" ? firstName : "la peor empresa"}`, "Muéstrame el ranking del IBEX 35", "¿Qué sector tiene más riesgo?"];

    // Save to session
    try {
      await supabaseClient.from("chat_intelligence_sessions").insert([
        { session_id: sessionId, role: "user", content: question, user_id: userId },
        { session_id: sessionId, role: "assistant", content: crisisMarkdown, user_id: userId, question_category: "alert" },
      ]);
    } catch (_e) { /* ignore */ }

    if (streamMode) {
      const sseEncoderCrisis = createSSEEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(sseEncoderCrisis({ type: "start", metadata: { language, depthLevel, detectedCompanies: [] } }));
          controller.enqueue(sseEncoderCrisis({ type: "chunk", text: crisisMarkdown }));
          controller.enqueue(sseEncoderCrisis({ type: "done", suggestedQuestions: crisisSuggestions, metadata: { type: "crisis_scan", documentsFound: 0, structuredDataFound: sorted.length, questionCategory: "alert" } }));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    } else {
      return new Response(JSON.stringify({ answer: crisisMarkdown, suggestedQuestions: crisisSuggestions, metadata: { type: "crisis_scan", structuredDataFound: sorted.length, questionCategory: "alert" } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // --- E3: LECTOR CUALITATIVO ---
  const facts = await extractQualitativeFacts(dataPack.raw_texts, dataPack, logPrefix);

  // --- E4: COMPARADOR ANALÍTICO ---
  const analysis = await runComparator(dataPack, facts, classifier, logPrefix);

  // --- E5: ORQUESTADOR MAESTRO (construir prompt) ---
  const { systemPrompt, userPrompt } = buildOrchestratorPrompt(
    classifier, dataPack, facts, analysis, question, languageName, language, roleName, rolePrompt
  );

  // Inject supplementary context into userPrompt
  let enrichedUserPrompt = userPrompt;
  
  // Inject metric emphasis from Semantic Bridge
  const metricasEnfatizar = (dataPack as any)?.metricas_enfatizar as string[] | undefined;
  if (metricasEnfatizar && metricasEnfatizar.length > 0) {
    const metricNameMap: Record<string, string> = {
      "23_nvm_score": "NVM (Calidad de la Narrativa)",
      "26_drm_score": "DRM (Fortaleza de Evidencia)",
      "29_sim_score": "SIM (Autoridad de Fuentes)",
      "32_rmm_score": "RMM (Actualidad y Empuje)",
      "35_cem_score": "CEM (Gestión de Controversias)",
      "38_gam_score": "GAM (Percepción de Gobernanza)",
      "41_dcm_score": "DCM (Coherencia Informativa)",
      "44_cxm_score": "CXM (Ejecución Corporativa)",
    };
    const names = metricasEnfatizar.map(m => metricNameMap[m] || m).join(", ");
    enrichedUserPrompt += `\n\n═══ ÉNFASIS TEMÁTICO DETECTADO ═══\nEl usuario pregunta específicamente sobre: ${names}.\nDedica mayor profundidad analítica a estas métricas en tu informe. Explica qué dicen los datos sobre estas dimensiones concretas, modelo por modelo, y qué implicaciones tienen para la empresa.`;
    console.log(`${logPrefix} [SEMANTIC_BRIDGE] Injected metric emphasis: ${names}`);
  }
  
  if (graphContextString) {
    enrichedUserPrompt += `\n\n═══ GRAFO DE CONOCIMIENTO (complementario) ═══\n${graphContextString}`;
  }
  if (vectorContextString) {
    enrichedUserPrompt += `\n\n═══ CONTEXTO VECTORIAL (complementario) ═══\n${vectorContextString}`;
  }
  if (regressionContextString) {
    enrichedUserPrompt += `\n\n═══ ANÁLISIS ESTADÍSTICO (complementario) ═══\n${regressionContextString}`;
  }

  console.log(`${logPrefix} [E5] Prompt built. System: ${systemPrompt.length} chars, User: ${enrichedUserPrompt.length} chars`);

  // --- Assemble messages for LLM ---
  console.log(`${logPrefix} Calling AI model (streaming: ${streamMode})...`);
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: enrichedUserPrompt },
  ];

  // Compatibility references for downstream code (suggestions, drumroll, session save)
  // Populate allRixData from dataPack.snapshot mapped to legacy format
  const allRixData: any[] = (dataPack?.snapshot || []).map((s: any) => ({
    "02_model_name": s.modelo,
    "03_target_name": dataPack.empresa_primaria?.nombre || "",
    "05_ticker": dataPack.empresa_primaria?.ticker || "",
    "06_period_from": s.period_from,
    "07_period_to": s.period_to,
    "09_rix_score": s.rix,
    "51_rix_score_adjusted": s.rix_adj,
    "23_nvm_score": s.nvm,
    "26_drm_score": s.drm,
    "29_sim_score": s.sim,
    "32_rmm_score": s.rmm,
    "35_cem_score": s.cem,
    "38_gam_score": s.gam,
    "41_dcm_score": s.dcm,
    "44_cxm_score": s.cxm,
    batch_execution_date: s.period_to,
  }));
  // Use raw runs from skills pipeline for source extraction (they contain 20_res_gpt_bruto, 21_res_perplex_bruto)
  const detectedCompanyFullData: any[] = (dataPack as any)?._rawRunsForSources || allRixData;

  // =========================================================================
  // STREAMING MODE: Return SSE stream for real-time text generation
  // =========================================================================
  if (streamMode) {
    console.log(`${logPrefix} Starting STREAMING standard chat...`);

    const sseEncoder = createSSEEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(
            sseEncoder({
              type: "start",
              metadata: {
                language,
                languageName,
                depthLevel,
                detectedCompanies: detectedCompanies.map((c) => c.issuer_name),
              },
            }),
          );

          let accumulatedContent = "";
          let provider: "openai" | "gemini" = "openai";
          let inputTokens = 0;
          let outputTokens = 0;
          let streamError = false;
          let streamFinishReason = "";

          // Compliance buffer state for anti-hallucination gate
          const HOLDBACK_SIZE = 1200;
          const COMPLIANCE_SCAN_OVERLAP = 800;
          let emittedLength = 0;
          let forbiddenDetected = false;
          let segmentsGenerated = 1;
          let hadTruncation = false;
          let hadForbiddenPattern = false;

          // Helper: emit safe content from holdback buffer
          const flushSafeContent = (isFinal: boolean) => {
            if (forbiddenDetected) return;
            const checkEnd = isFinal ? accumulatedContent.length : Math.max(emittedLength, accumulatedContent.length - HOLDBACK_SIZE);
            if (checkEnd <= emittedLength) return;

            const pendingText = accumulatedContent.substring(emittedLength, checkEnd);
            const scanStart = Math.max(0, emittedLength - COMPLIANCE_SCAN_OVERLAP);
            const scanText = accumulatedContent.substring(scanStart, checkEnd);
            const forbiddenRelativeIndex = findForbiddenMatchIndex(scanText);

            if (forbiddenRelativeIndex !== -1) {
              hadForbiddenPattern = true;
              forbiddenDetected = true;
              const forbiddenAbsoluteIndex = scanStart + forbiddenRelativeIndex;

              const cleanedFull = stripForbiddenContent(
                accumulatedContent.substring(0, Math.max(emittedLength, forbiddenAbsoluteIndex)),
              );
              if (cleanedFull.length > emittedLength) {
                controller.enqueue(sseEncoder({ type: "chunk", text: cleanedFull.substring(emittedLength) }));
              }
              accumulatedContent = cleanedFull;
              emittedLength = cleanedFull.length;
              console.warn(`${logPrefix} Forbidden pattern detected and stripped at char ${forbiddenAbsoluteIndex}`);
              return;
            }

            controller.enqueue(sseEncoder({ type: "chunk", text: pendingText }));
            emittedLength = checkEnd;
          };

          // Helper: consume a stream generator with compliance buffer
          const consumeStream = async (
            generator: AsyncGenerator<any>,
            providerName: "openai" | "gemini"
          ): Promise<{ error: boolean; errorMsg?: string }> => {
            for await (const chunk of generator) {
              if (forbiddenDetected) break;

              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                flushSafeContent(false);
              } else if (chunk.type === "done") {
                streamFinishReason = chunk.finishReason || "stop";
                inputTokens += (chunk.inputTokens || 0);
                outputTokens += (chunk.outputTokens || 0);
                flushSafeContent(true);
                return { error: false };
              } else if (chunk.type === "error") {
                console.warn(`${logPrefix} ${providerName} stream error: ${chunk.error}`);
                return { error: true, errorMsg: chunk.error };
              }
            }
            // Broke out due to forbidden detection
            if (forbiddenDetected) {
              streamFinishReason = "length";
              return { error: false };
            }
            flushSafeContent(true);
            return { error: false };
          };

          // Try OpenAI first (with compliance buffer)
          console.log(`${logPrefix} Trying OpenAI stream first (with compliance gate)...`);
          const openaiResult = await consumeStream(
            streamOpenAIResponse(messages, "o3", 40000, logPrefix, 120000),
            "openai"
          );

          if (openaiResult.error || accumulatedContent.length === 0) {
            streamError = true;
            controller.enqueue(sseEncoder({ type: "fallback", metadata: { provider: "gemini" } }));
          }

          // Fallback to Gemini if OpenAI failed
          if (streamError) {
            provider = "gemini";
            accumulatedContent = "";
            emittedLength = 0;
            forbiddenDetected = false;

            console.log(`${logPrefix} Using Gemini stream (gemini-2.5-flash) with compliance gate...`);
            const geminiResult = await consumeStream(
              streamGeminiResponse(messages, "gemini-2.5-flash", 40000, logPrefix, 120000),
              "gemini"
            );

            if (geminiResult.error && accumulatedContent.length === 0) {
              console.error(`${logPrefix} Gemini stream also failed: ${geminiResult.errorMsg}`);
              controller.enqueue(
                sseEncoder({
                  type: "error",
                  error: `Error generando respuesta: ${geminiResult.errorMsg}`,
                }),
              );
              controller.close();
              return;
            }
          }

          // =================================================================
          // AUTO-CONTINUATION: ONLY for real technical truncation or
          // forbidden pattern detected. NO more "too_short" forcing.
          // =================================================================
          const MAX_CONTINUATIONS = 4;

          while (
            (streamFinishReason === "length" || forbiddenDetected) &&
            segmentsGenerated <= MAX_CONTINUATIONS
          ) {
            hadTruncation = true;
            segmentsGenerated++;
            const reason = hadForbiddenPattern ? "forbidden_pattern" : "truncation";
            forbiddenDetected = false;
            streamFinishReason = "";

            console.log(`${logPrefix} Auto-continuation #${segmentsGenerated - 1} (reason: ${reason}, accumulated: ${accumulatedContent.length} chars)...`);

            // Re-inject question + data summary for context continuity
            const lastChunk = accumulatedContent.slice(-500);

            const continuationSystemPrompt = `Eres el Agente Rix continuando un informe de reputación corporativa. Continúa EXACTAMENTE desde el punto donde se interrumpió. REGLAS ESTRICTAS: 1) No repitas contenido ya escrito. 2) NUNCA menciones límites, truncaciones, longitud máxima, carpetas, archivos ni plataformas. 3) No añadas prólogos ni transiciones. 4) Mantén formato, tono y estructura. 5) Si el informe está completo, escribe solo una frase de cierre. Responde en ${languageName}.`;

            const continuationUserPrompt = `Pregunta original del usuario: "${question}"\n\nEl informe se interrumpió por truncación técnica. Último fragmento escrito:\n\n"""${lastChunk}"""\n\nContinúa escribiendo desde ahí. No repitas nada. Si el análisis ya está completo, cierra brevemente.`;

            const continuationMessages = [
              { role: "system", content: continuationSystemPrompt },
              { role: "user", content: continuationUserPrompt },
            ];

            const contGen = provider === "gemini"
              ? streamGeminiResponse(continuationMessages, "gemini-2.5-flash", 40000, logPrefix, 120000)
              : streamOpenAIResponse(continuationMessages, "o3", 40000, logPrefix, 120000);

            await consumeStream(contGen, provider);
          }

          console.log(
            `${logPrefix} Stream completed (via ${provider}), length: ${accumulatedContent.length}, segments: ${segmentsGenerated}, hadTruncation: ${hadTruncation}, hadForbiddenPattern: ${hadForbiddenPattern}`,
          );
          const answer = accumulatedContent;

          // Log API usage in background
          logApiUsage({
            supabaseClient,
            edgeFunction: "chat-intelligence",
            provider,
            model: provider === "openai" ? "o3" : "gemini-2.5-flash",
            actionType: "chat_stream",
            inputTokens,
            outputTokens,
            userId,
            sessionId,
            metadata: {
              depth_level: depthLevel,
              role: roleId || null,
              role_name: roleName || null,
              streaming: true,
            },
          }).catch((e) => console.warn("Failed to log usage:", e));

          // =============================================================================
          // Generate suggested questions and drumroll (same logic as non-streaming)
          // =============================================================================
          console.log(`${logPrefix} Generating follow-up questions for streaming response...`);

          // Simplified question generation for streaming (avoid long delay)
          let suggestedQuestions: string[] = [];
          let drumrollQuestion: DrumrollQuestion | null = null;

          try {
            // Quick question generation
            const questionPrompt = `Based on this analysis about ${detectedCompanies.map((c) => c.issuer_name).join(", ") || "corporate reputation"}, generate 3 follow-up questions in ${languageName}. Respond ONLY with a JSON array of 3 strings.`;
            const questionResult = await callAISimple(
              [
                {
                  role: "system",
                  content: `Generate follow-up questions in ${languageName}. Respond ONLY with JSON array.`,
                },
                { role: "user", content: questionPrompt },
              ],
              "gpt-4o-mini",
              300,
              logPrefix,
            );

            if (questionResult) {
              const cleanText = questionResult
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
              suggestedQuestions = JSON.parse(cleanText);
            }
          } catch (qError) {
            console.warn(`${logPrefix} Error generating questions:`, qError);
          }

          // Drumroll question generation disabled

          // Calculate methodology metadata
          const modelScores =
            allRixData
              ?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)
              ?.map((r) => r["09_rix_score"]) || [];
          const maxScoreMethod = modelScores.length > 0 ? Math.max(...modelScores) : 0;
          const minScoreMethod = modelScores.length > 0 ? Math.min(...modelScores) : 0;
          const divergencePointsMethod = maxScoreMethod - minScoreMethod;
          const divergenceLevelMethod =
            divergencePointsMethod <= 8 ? "low" : divergencePointsMethod <= 15 ? "medium" : "high";
          const modelsUsedMethod = [...new Set(allRixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];
          const periodFromRaw = allRixData
            ?.map((r) => r["06_period_from"])
            .filter(Boolean)
            .sort()[0];
          const periodToRaw = allRixData
            ?.map((r) => r["07_period_to"])
            .filter(Boolean)
            .sort()
            .reverse()[0];
          // If temporal range was requested, use it for methodology instead of raw data dates
          const temporalOverride = (dataPack as any)?.temporal_range;
          const periodFromMethod = temporalOverride?.from || (dataPack as any)?.report_context?.date_from || periodFromRaw;
          const periodToMethod = temporalOverride?.to || (dataPack as any)?.report_context?.date_to || periodToRaw;
          const uniqueCompaniesCount = new Set(allRixData?.map((r) => r["05_ticker"]).filter(Boolean) || []).size;
          const uniqueWeeksCount = allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0;

          // Save to database
          if (sessionId) {
            supabaseClient
              .from("chat_intelligence_sessions")
              .insert([
                {
                  session_id: sessionId,
                  role: "user",
                  content: question,
                  user_id: userId,
                  depth_level: depthLevel,
                },
                {
                  session_id: sessionId,
                  role: "assistant",
                  content: answer,
                  documents_found: vectorDocs?.length || 0,
                  structured_data_found: allRixData?.length || 0,
                  suggested_questions: suggestedQuestions,
                  drumroll_question: drumrollQuestion,
                  depth_level: depthLevel,
                  question_category: detectedCompanies.length > 0 ? "corporate_analysis" : "general_query",
                  user_id: userId,
                },
              ])
              .then(() => console.log(`${logPrefix} Session saved`))
              .catch((e: Error) => console.warn("Failed to save session:", e));
          }

          // Extract verified sources from full RIX data (includes raw AI responses)
          const verifiedSourcesStandard = extractSourcesFromRixData(detectedCompanyFullData || []);
          console.log(`${logPrefix} Extracted ${verifiedSourcesStandard.length} verified sources from RIX data`);

          // Send final done event with all metadata
          controller.enqueue(
            sseEncoder({
              type: "done",
              suggestedQuestions,
              drumrollQuestion,
              metadata: {
                type: "standard",
                documentsFound: vectorDocs?.length || 0,
                structuredDataFound: allRixData?.length || 0,
                dataWeeks: uniqueWeeksCount,
                aiProvider: provider,
                depthLevel,
                questionCategory: detectedCompanies.length > 0 ? "corporate_analysis" : "general_query",
                modelsUsed: modelsUsedMethod,
                periodFrom: periodFromMethod,
                periodTo: periodToMethod,
                divergenceLevel: divergenceLevelMethod,
                divergencePoints: divergencePointsMethod,
                uniqueCompanies: uniqueCompaniesCount,
                uniqueWeeks: uniqueWeeksCount,
                // Verified sources from ChatGPT and Perplexity for bibliography
                verifiedSources: verifiedSourcesStandard.length > 0 ? verifiedSourcesStandard : undefined,
                // Report context for InfoBar
                reportContext: dataPack?.report_context || null,
                // Observability: anti-truncation metrics
                segmentsGenerated,
                hadTruncation,
                hadForbiddenPattern,
                finalOutputLength: answer.length,
                methodology: {
                  hasRixData: (allRixData?.length || 0) > 0,
                  modelsUsed: modelsUsedMethod,
                  periodFrom: periodFromMethod,
                  periodTo: periodToMethod,
                  observationsCount: allRixData?.length || 0,
                  divergenceLevel: divergenceLevelMethod,
                  divergencePoints: divergencePointsMethod,
                  uniqueCompanies: uniqueCompaniesCount,
                  uniqueWeeks: uniqueWeeksCount,
                },
              },
            }),
          );

          controller.close();
        } catch (error) {
          console.error(`${logPrefix} Streaming error:`, error);
          controller.enqueue(
            sseEncoder({
              type: "error",
              error: error instanceof Error ? error.message : "Error de streaming desconocido",
            }),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // =========================================================================
  // NON-STREAMING MODE: Original behavior (for backwards compatibility)
  // =========================================================================
  let chatResult = await callAIWithFallback(messages, "o3", 40000, logPrefix);
  let answer = chatResult.content;

  // Non-streaming compliance gate: ONLY forbidden pattern continuation (no more too_short)
  let nonStreamSegments = 1;
  let nonStreamHadForbidden = false;
  const MAX_NS_CONTINUATIONS = 4;
  
  while (containsForbiddenPattern(answer) && nonStreamSegments <= MAX_NS_CONTINUATIONS) {
    nonStreamHadForbidden = true;
    answer = stripForbiddenContent(answer);
    nonStreamSegments++;
    
    console.warn(`${logPrefix} Non-streaming: forbidden_pattern detected (attempt ${nonStreamSegments}, chars: ${answer.length}), continuing...`);
    
    try {
      const lastChunk = answer.slice(-500);

      const sysPrompt = `Eres el Agente Rix continuando un informe. NUNCA menciones límites, truncaciones, longitud máxima, carpetas ni archivos. Responde en ${languageName}.`;

      const userPromptCont = `Pregunta original: "${question}"\n\nEl informe se interrumpió. Último fragmento:\n\n"""${lastChunk}"""\n\nContinúa desde ahí. No repitas.`;

      const contMessages = [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPromptCont },
      ];
      const contResult = await callAIWithFallback(contMessages, "o3", 40000, logPrefix);
      answer += "\n\n" + (containsForbiddenPattern(contResult.content) ? stripForbiddenContent(contResult.content) : contResult.content);
      chatResult = { ...chatResult, outputTokens: chatResult.outputTokens + contResult.outputTokens };
      
      if (!containsForbiddenPattern(answer)) break;
    } catch (contError) {
      console.warn(`${logPrefix} Non-streaming continuation failed:`, contError);
      break;
    }
  }
  
  if (nonStreamHadForbidden || nonStreamSegments > 1) {
    console.log(`${logPrefix} Non-streaming compliance: ${nonStreamSegments} segments, final length: ${answer.length}, clean: ${!containsForbiddenPattern(answer)}`);
  }

  console.log(`${logPrefix} AI response received (via ${chatResult.provider}), length: ${answer.length}`);

  // Log API usage with depth_level tracking
  console.log(`${logPrefix} Logging API usage with depth_level: ${depthLevel}, role: ${roleId || "none"}`);
  await logApiUsage({
    supabaseClient,
    edgeFunction: "chat-intelligence",
    provider: chatResult.provider,
    model: chatResult.model,
    actionType: "chat",
    inputTokens: chatResult.inputTokens,
    outputTokens: chatResult.outputTokens,
    userId,
    sessionId,
    metadata: {
      depth_level: depthLevel,
      role: roleId || null,
      role_name: roleName || null,
    },
  });

  // =============================================================================
  // PASO 6: GENERAR PREGUNTAS SUGERIDAS BASADAS EN ANÁLISIS DE DATOS
  // =============================================================================
  console.log(`${logPrefix} Analyzing data for hidden patterns and generating smart questions...`);

  // =============================================================================
  // ANÁLISIS DE DATOS CON VALIDACIÓN DE CALIDAD
  // Solo genera insights basados en datos SÓLIDOS (cobertura completa de 4 modelos)
  // =============================================================================
  const analyzeDataForInsights = () => {
    if (!allRixData || allRixData.length === 0) {
      return { patterns: [], anomalies: [], surprises: [], modelDivergences: [], dataQuality: "insufficient" };
    }

    const patterns: string[] = [];
    const anomalies: string[] = [];
    const surprises: string[] = [];

    // Group data by company
    const byCompany: Record<string, any[]> = {};
    allRixData.forEach((r) => {
      const company = r["03_target_name"];
      if (!byCompany[company]) byCompany[company] = [];
      byCompany[company].push(r);
    });

    // =============================================================================
    // VALIDACIÓN DE CALIDAD: Solo considerar empresas con datos de los 4 modelos
    // =============================================================================
    const REQUIRED_MODELS = ["chatgpt", "perplexity", "gemini", "deepseek"];
    const MIN_MODELS_FOR_INSIGHT = 4; // Exigimos cobertura completa

    const companiesWithFullCoverage: Record<string, any[]> = {};
    Object.entries(byCompany).forEach(([company, records]) => {
      const modelsPresent = new Set(records.map((r) => r["02_model_name"]?.toLowerCase()).filter(Boolean));

      // Verificar que tenga datos de los 4 modelos con scores válidos
      const hasAllModels = REQUIRED_MODELS.every((model) =>
        records.some(
          (r) =>
            r["02_model_name"]?.toLowerCase().includes(model) && r["09_rix_score"] != null && r["09_rix_score"] > 0,
        ),
      );

      if (hasAllModels) {
        companiesWithFullCoverage[company] = records;
      }
    });

    const fullCoverageCount = Object.keys(companiesWithFullCoverage).length;
    console.log(
      `${logPrefix} Companies with full 4-model coverage: ${fullCoverageCount}/${Object.keys(byCompany).length}`,
    );

    // Si no hay suficientes empresas con cobertura completa, no generar insights
    if (fullCoverageCount < 10) {
      console.log(
        `${logPrefix} Insufficient data quality for insights (need at least 10 companies with full coverage)`,
      );
      return {
        patterns: [],
        anomalies: [],
        surprises: [],
        modelDivergences: [],
        dataQuality: "insufficient",
        coverageStats: { full: fullCoverageCount, total: Object.keys(byCompany).length },
      };
    }

    // =============================================================================
    // 1. DIVERGENCIAS ENTRE MODELOS (solo empresas con cobertura completa)
    // =============================================================================
    const modelDivergences: {
      company: string;
      ticker: string;
      chatgpt: number;
      deepseek: number;
      perplexity: number;
      gemini: number;
      maxDiff: number;
      models: string;
    }[] = [];

    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      const chatgpt = records.find((r) => r["02_model_name"]?.toLowerCase().includes("chatgpt"));
      const deepseek = records.find((r) => r["02_model_name"]?.toLowerCase().includes("deepseek"));
      const perplexity = records.find((r) => r["02_model_name"]?.toLowerCase().includes("perplexity"));
      const gemini = records.find((r) => r["02_model_name"]?.toLowerCase().includes("gemini"));

      if (chatgpt && deepseek && perplexity && gemini) {
        const scores = [
          { model: "ChatGPT", score: chatgpt["09_rix_score"] },
          { model: "DeepSeek", score: deepseek["09_rix_score"] },
          { model: "Perplexity", score: perplexity["09_rix_score"] },
          { model: "Gemini", score: gemini["09_rix_score"] },
        ];

        const maxScore = Math.max(...scores.map((s) => s.score));
        const minScore = Math.min(...scores.map((s) => s.score));
        const maxDiff = maxScore - minScore;

        // Solo reportar divergencias significativas (>=12 puntos) con datos sólidos
        if (maxDiff >= 12) {
          const highest = scores.find((s) => s.score === maxScore)!;
          const lowest = scores.find((s) => s.score === minScore)!;

          modelDivergences.push({
            company,
            ticker: chatgpt["05_ticker"] || "",
            chatgpt: chatgpt["09_rix_score"],
            deepseek: deepseek["09_rix_score"],
            perplexity: perplexity["09_rix_score"],
            gemini: gemini["09_rix_score"],
            maxDiff,
            models: `${highest.model} (${highest.score}) vs ${lowest.model} (${lowest.score})`,
          });
        }
      }
    });

    modelDivergences.sort((a, b) => b.maxDiff - a.maxDiff);
    if (modelDivergences.length > 0) {
      const top = modelDivergences[0];
      anomalies.push(`${top.company} tiene ${top.maxDiff} puntos de divergencia: ${top.models}`);
    }

    // =============================================================================
    // 2. ANÁLISIS SECTORIAL (solo con sectores que tengan ≥3 empresas con cobertura completa)
    // =============================================================================
    if (companiesCache) {
      const bySector: Record<string, { company: string; avgRix: number; ticker: string }[]> = {};

      Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
        const companyInfo = companiesCache?.find((c) => c.ticker === records[0]?.["05_ticker"]);
        const sector = companyInfo?.sector_category;
        if (!sector) return;

        // Calcular promedio de los 4 modelos para esta empresa
        const validScores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
        if (validScores.length < 4) return; // Necesitamos los 4 scores

        const avgRix = validScores.reduce((a, b) => a + b, 0) / validScores.length;

        if (!bySector[sector]) bySector[sector] = [];
        bySector[sector].push({ company, avgRix, ticker: records[0]?.["05_ticker"] });
      });

      Object.entries(bySector).forEach(([sector, companies]) => {
        // Solo analizar sectores con al menos 3 empresas con cobertura completa
        if (companies.length < 3) return;

        const sectorAvg = companies.reduce((sum, c) => sum + c.avgRix, 0) / companies.length;
        const sortedByRix = [...companies].sort((a, b) => b.avgRix - a.avgRix);

        // Detectar outliers: empresas que difieren >12 puntos de la media sectorial
        companies.forEach((c) => {
          const diff = c.avgRix - sectorAvg;
          if (Math.abs(diff) >= 12) {
            const direction = diff > 0 ? "supera" : "está por debajo de";
            surprises.push(
              `${c.company} ${direction} la media del sector ${sector} (${sectorAvg.toFixed(0)}) en ${Math.abs(diff).toFixed(0)} puntos (promedio 4 modelos: ${c.avgRix.toFixed(0)})`,
            );
          }
        });
      });
    }

    // =============================================================================
    // 3. IBEX35 vs NO COTIZADAS (solo con cobertura completa)
    // =============================================================================
    if (companiesCache) {
      const ibex35Companies: { company: string; avgRix: number }[] = [];
      const nonTradedCompanies: { company: string; avgRix: number }[] = [];

      Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
        const companyInfo = companiesCache?.find((c) => c.ticker === records[0]?.["05_ticker"]);
        if (!companyInfo) return;

        const validScores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
        if (validScores.length < 4) return;

        const avgRix = validScores.reduce((a, b) => a + b, 0) / validScores.length;

        if (companyInfo.ibex_family_code === "IBEX-35") {
          ibex35Companies.push({ company, avgRix });
        } else if (!companyInfo.cotiza_en_bolsa) {
          nonTradedCompanies.push({ company, avgRix });
        }
      });

      // Solo generar insight si hay suficientes datos en ambos grupos
      if (ibex35Companies.length >= 10 && nonTradedCompanies.length >= 5) {
        const avgIbex = ibex35Companies.reduce((sum, c) => sum + c.avgRix, 0) / ibex35Companies.length;

        const outperformers = nonTradedCompanies
          .filter((c) => c.avgRix > avgIbex + 5)
          .sort((a, b) => b.avgRix - a.avgRix);

        if (outperformers.length > 0) {
          const best = outperformers[0];
          patterns.push(
            `${best.company} (no cotizada, promedio ${best.avgRix.toFixed(0)}) supera la media del IBEX35 (${avgIbex.toFixed(0)}) basado en consenso de 4 modelos`,
          );
        }
      }
    }

    // =============================================================================
    // 4. DESEQUILIBRIOS DE MÉTRICAS (solo con todas las métricas presentes)
    // =============================================================================
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      // Usar el registro con más métricas completas
      records.forEach((r) => {
        const metrics = [
          { name: "NVM", score: r["23_nvm_score"] },
          { name: "DRM", score: r["26_drm_score"] },
          { name: "SIM", score: r["29_sim_score"] },
          { name: "RMM", score: r["32_rmm_score"] },
          { name: "CEM", score: r["35_cem_score"] },
          { name: "GAM", score: r["38_gam_score"] },
          { name: "DCM", score: r["41_dcm_score"] },
          { name: "CXM", score: r["44_cxm_score"] },
        ].filter((m) => m.score != null && m.score > 0);

        // Solo considerar si tiene al menos 7 de 8 métricas (datos sólidos)
        if (metrics.length >= 7) {
          const max = metrics.reduce((a, b) => (a.score > b.score ? a : b));
          const min = metrics.reduce((a, b) => (a.score < b.score ? a : b));

          // Desequilibrio significativo: ≥30 puntos
          if (max.score - min.score >= 30) {
            const model = r["02_model_name"];
            patterns.push(
              `${company} (según ${model}): desequilibrio de ${max.score - min.score} pts entre ${max.name} (${max.score}) y ${min.name} (${min.score})`,
            );
          }
        }
      });
    });

    // =============================================================================
    // 5. CONSENSO vs DISCORDIA (solo empresas con 4 modelos)
    // =============================================================================
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      const scores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);

      // Requiere exactamente 4 scores válidos
      if (scores.length !== 4) return;

      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const range = max - min;
      const avg = scores.reduce((a, b) => a + b, 0) / 4;

      if (range <= 4) {
        patterns.push(
          `${company} tiene consenso perfecto entre los 4 modelos: RIX entre ${min} y ${max} (promedio: ${avg.toFixed(0)})`,
        );
      } else if (range >= 20) {
        anomalies.push(
          `${company} genera discordia total: ${range} puntos entre modelos (${min}-${max}), requiere análisis`,
        );
      }
    });

    // =============================================================================
    // 6. TENDENCIA DE MODELOS (solo con volumen suficiente)
    // =============================================================================
    const modelStats: Record<string, { scores: number[]; count: number }> = {};
    Object.values(companiesWithFullCoverage)
      .flat()
      .forEach((r) => {
        const model = r["02_model_name"];
        const score = r["09_rix_score"];
        if (!model || score == null || score <= 0) return;

        if (!modelStats[model]) modelStats[model] = { scores: [], count: 0 };
        modelStats[model].scores.push(score);
        modelStats[model].count++;
      });

    const modelRankings = Object.entries(modelStats)
      .filter(([_, data]) => data.count >= 50) // Mínimo 50 empresas para estadística robusta
      .map(([model, data]) => ({
        model,
        avg: data.scores.reduce((a, b) => a + b, 0) / data.count,
        count: data.count,
      }))
      .sort((a, b) => b.avg - a.avg);

    if (modelRankings.length >= 4) {
      const mostGenerous = modelRankings[0];
      const mostCritical = modelRankings[modelRankings.length - 1];
      const diff = mostGenerous.avg - mostCritical.avg;

      if (diff >= 4) {
        patterns.push(
          `${mostGenerous.model} es sistemáticamente ${diff.toFixed(1)} pts más generoso que ${mostCritical.model} (basado en ${mostGenerous.count} empresas con cobertura completa)`,
        );
      }
    }

    return {
      patterns: patterns.slice(0, 4),
      anomalies: anomalies.slice(0, 4),
      surprises: surprises.slice(0, 4),
      modelDivergences: modelDivergences.slice(0, 3),
      dataQuality: "solid",
      coverageStats: { full: fullCoverageCount, total: Object.keys(byCompany).length },
    };
  };

  const dataInsights = analyzeDataForInsights();
  console.log(
    `${logPrefix} Data insights found: ${dataInsights.patterns.length} patterns, ${dataInsights.anomalies.length} anomalies, ${dataInsights.surprises.length} surprises`,
  );

  // Extract topics already discussed to avoid repetition
  const discussedTopics = new Set<string>();
  const allConversationText = [...conversationHistory.map((m: any) => m.content || ""), question, answer]
    .join(" ")
    .toLowerCase();

  // Mark mentioned companies as discussed
  if (allRixData) {
    allRixData.forEach((r) => {
      const companyName = r["03_target_name"]?.toLowerCase();
      if (companyName && allConversationText.includes(companyName)) {
        discussedTopics.add(companyName);
      }
    });
  }

  const availableSectors = companiesCache
    ? [...new Set(companiesCache.map((c) => c.sector_category).filter(Boolean))].join(", ")
    : "Energía, Banca, Telecomunicaciones, Construcción, Tecnología, Consumo";

  // Build prompt with REAL DATA DISCOVERIES (solo si hay calidad suficiente)
  const hasQualityData =
    dataInsights.dataQuality === "solid" &&
    (dataInsights.patterns.length > 0 || dataInsights.anomalies.length > 0 || dataInsights.surprises.length > 0);

  const dataDiscoveriesPrompt = hasQualityData
    ? `You are an EXPERT DATA ANALYST who has discovered hidden patterns analyzing ${dataInsights.coverageStats?.full || "multiple"} companies with COMPLETE COVERAGE from all 4 AI models. Generate 3 questions that SURPRISE the user by revealing non-obvious insights.

🔬 VERIFIED DISCOVERIES (based ONLY on companies with data from ChatGPT + Perplexity + Gemini + DeepSeek):

📊 DETECTED PATTERNS:
${dataInsights.patterns.map((p, i) => `${i + 1}. ${p}`).join("\n")}

⚠️ ANOMALIES FOUND:
${dataInsights.anomalies.length > 0 ? dataInsights.anomalies.map((a, i) => `${i + 1}. ${a}`).join("\n") : "- No significant anomalies with solid data"}

💡 DATA SURPRISES:
${dataInsights.surprises.length > 0 ? dataInsights.surprises.map((s, i) => `${i + 1}. ${s}`).join("\n") : "- No notable surprises with complete data"}

🎯 MAXIMUM DIVERGENCES BETWEEN MODELS (4 models analyzed):
${
  dataInsights.modelDivergences?.length > 0
    ? dataInsights.modelDivergences
        .map((d, i) => `${i + 1}. ${d.company}: ${d.models} = ${d.maxDiff} pts difference`)
        .join("\n")
    : "- High consensus between models"
}

📈 DATA QUALITY: ${dataInsights.coverageStats?.full}/${dataInsights.coverageStats?.total} companies with complete 4-model coverage

TOPICS ALREADY DISCUSSED (AVOID REPEATING):
${[...discussedTopics].slice(0, 10).join(", ") || "None specific yet"}

CURRENT USER QUESTION: "${question}"

🧠 YOUR MISSION: Generate 3 questions that:

1. **REVEAL HIDDEN DATA**: Use ONLY the verified discoveries above (never invent)
2. **SURPRISE WITH CONCRETE FACTS**: Each question must mention specific data
3. **BE IMPOSSIBLE TO IGNORE**: Questions that generate immediate curiosity

❌ FORBIDDEN:
- Generic questions the user could guess
- Inventing data or companies not listed above
- Repeating companies or topics already discussed
- Questions based on incomplete or partial data

🌐 CRITICAL - LANGUAGE: Generate ALL questions in ${languageName} (${language}). Every single question MUST be written in ${languageName}.

Respond ONLY with a JSON array of 3 questions in ${languageName}:
["question 1", "question 2", "question 3"]`
    : `Generate 3 generic but useful questions about corporate reputation analysis for IBEX35 and Spanish companies.

CURRENT USER QUESTION: "${question}"

Avoid: obvious questions like "What's the top 5?". 
Suggest: sector comparisons, AI model divergences, non-listed vs IBEX35 companies.

🌐 CRITICAL - LANGUAGE: Generate ALL questions in ${languageName} (${language}). Every single question MUST be written in ${languageName}.

Respond ONLY with a JSON array of 3 strings in ${languageName}:
["question 1", "question 2", "question 3"]`;

  try {
    const questionsMessages = [
      {
        role: "system",
        content: `You are a data analyst who generates questions based on REAL discoveries. Each question must reveal a hidden insight in the data. IMPORTANT: Generate all questions in ${languageName}. Respond ONLY with the JSON array.`,
      },
      { role: "user", content: dataDiscoveriesPrompt },
    ];

    let suggestedQuestions: string[] = [];

    const questionsText = await callAISimple(questionsMessages, "gpt-4o-mini", 600, logPrefix);
    if (questionsText) {
      try {
        const cleanText = questionsText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        suggestedQuestions = JSON.parse(cleanText);
        console.log(`${logPrefix} Generated ${suggestedQuestions.length} data-driven questions`);
      } catch (parseError) {
        console.warn(`${logPrefix} Error parsing follow-up questions:`, parseError);
        suggestedQuestions = [];
      }
    }

    // =============================================================================
    // GENERATE DRUMROLL QUESTION (Complementary Report Suggestion)
    // Drumroll question generation disabled
    const drumrollQuestion: DrumrollQuestion | null = null;

    // Determine question category (simplified classification)
    const questionCategory = detectedCompanies.length > 0 ? "corporate_analysis" : "general_query";

    // Save to database with new fields
    if (sessionId) {
      await supabaseClient.from("chat_intelligence_sessions").insert([
        {
          session_id: sessionId,
          role: "user",
          content: question,
          user_id: userId,
          depth_level: depthLevel,
        },
        {
          session_id: sessionId,
          role: "assistant",
          content: answer,
          documents_found: vectorDocs?.length || 0,
          structured_data_found: allRixData?.length || 0,
          suggested_questions: suggestedQuestions,
          drumroll_question: drumrollQuestion,
          depth_level: depthLevel,
          question_category: questionCategory,
          user_id: userId,
        },
      ]);
    }

    // Calculate divergence for methodology metadata
    const modelScores =
      allRixData?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)?.map((r) => r["09_rix_score"]) ||
      [];
    const maxScoreMethod = modelScores.length > 0 ? Math.max(...modelScores) : 0;
    const minScoreMethod = modelScores.length > 0 ? Math.min(...modelScores) : 0;
    const divergencePointsMethod = maxScoreMethod - minScoreMethod;
    const divergenceLevelMethod =
      divergencePointsMethod <= 8 ? "low" : divergencePointsMethod <= 15 ? "medium" : "high";

    // Extract unique models used
    const modelsUsedMethod = [...new Set(allRixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];

    // Extract period info
    const periodFromRaw = allRixData
      ?.map((r) => r["06_period_from"])
      .filter(Boolean)
      .sort()[0];
    const periodToRaw = allRixData
      ?.map((r) => r["07_period_to"])
      .filter(Boolean)
      .sort()
      .reverse()[0];
    // If temporal range was requested, use it for methodology instead of raw data dates
    const temporalOverrideNS = (dataPack as any)?.temporal_range;
    const periodFromMethod = temporalOverrideNS?.from || (dataPack as any)?.report_context?.date_from || periodFromRaw;
    const periodToMethod = temporalOverrideNS?.to || (dataPack as any)?.report_context?.date_to || periodToRaw;

    // Extract unique companies and weeks
    const uniqueCompaniesCount = new Set(allRixData?.map((r) => r["05_ticker"]).filter(Boolean) || []).size;
    const uniqueWeeksCount = allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0;

    return new Response(
      JSON.stringify({
        answer,
        suggestedQuestions,
        drumrollQuestion,
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: uniqueWeeksCount,
          aiProvider: chatResult.provider,
          depthLevel,
          questionCategory,
          // Methodology metadata for "Radar Reputacional" validation sheet
          modelsUsed: modelsUsedMethod,
          periodFrom: periodFromMethod,
          periodTo: periodToMethod,
          divergenceLevel: divergenceLevelMethod,
          divergencePoints: divergencePointsMethod,
          uniqueCompanies: uniqueCompaniesCount,
          uniqueWeeks: uniqueWeeksCount,
          methodology: {
            hasRixData: (allRixData?.length || 0) > 0,
            modelsUsed: modelsUsedMethod,
            periodFrom: periodFromMethod,
            periodTo: periodToMethod,
            observationsCount: allRixData?.length || 0,
            divergenceLevel: divergenceLevelMethod,
            divergencePoints: divergencePointsMethod,
            uniqueCompanies: uniqueCompaniesCount,
            uniqueWeeks: uniqueWeeksCount,
          },
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (questionsError) {
    console.error(`${logPrefix} Error generating follow-up questions:`, questionsError);
    return new Response(
      JSON.stringify({
        answer,
        suggestedQuestions: [],
        drumrollQuestion: null,
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0,
          aiProvider: chatResult.provider,
          depthLevel,
          questionCategory: "error",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}
