import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Suggestion {
  text: string;
  type: "vector_insight";
  icon: string;
  source: string;
}

// ── Dimension labels (human-readable) ───────────────────────────────
const DIM_LABELS_ES: Record<string, string> = {
  "23_nvm_score": "Calidad Narrativa",
  "26_drm_score": "Fortaleza de Evidencia",
  "29_sim_score": "Autoridad de Fuentes",
  "32_rmm_score": "Actualidad y Empuje",
  "35_cem_score": "Gestión de Controversias",
  "38_gam_score": "Percepción de Gobernanza",
  "41_dcm_score": "Coherencia Informativa",
  "44_cxm_score": "Ejecución Corporativa",
};

const DIM_LABELS_EN: Record<string, string> = {
  "23_nvm_score": "Narrative Quality",
  "26_drm_score": "Evidence Strength",
  "29_sim_score": "Source Authority",
  "32_rmm_score": "Momentum",
  "35_cem_score": "Controversy Management",
  "38_gam_score": "Governance Perception",
  "41_dcm_score": "Information Coherence",
  "44_cxm_score": "Corporate Execution",
};

const DIM_COLS = [
  "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score",
  "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score",
] as const;

const SELECT_COLS = [
  "02_model_name", "03_target_name", "05_ticker", "09_rix_score",
  "07_period_to", ...DIM_COLS,
].join(",");

// ── Row type from rix_runs_v2 ───────────────────────────────────────
interface RixRow {
  "02_model_name": string | null;
  "03_target_name": string | null;
  "05_ticker": string | null;
  "09_rix_score": number | null;
  "07_period_to": string | null;
  "23_nvm_score": number | null;
  "26_drm_score": number | null;
  "29_sim_score": number | null;
  "32_rmm_score": number | null;
  "35_cem_score": number | null;
  "38_gam_score": number | null;
  "41_dcm_score": number | null;
  "44_cxm_score": number | null;
}

// ── Company grouped data ────────────────────────────────────────────
interface CompanyData {
  ticker: string;
  name: string;
  models: Map<string, { rix: number; dims: Record<string, number> }>;
  weekScores: Map<string, number[]>; // week -> rix scores
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lang = url.searchParams.get("lang") || "es";
    const count = Math.min(parseInt(url.searchParams.get("count") || "4"), 8);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const dimLabels = lang === "en" ? DIM_LABELS_EN : DIM_LABELS_ES;

    // ── S1+S5: Get latest week from rix_runs_v2, then compute cutoff ──
    const { data: latestRows, error: latestErr } = await supabase
      .from("rix_runs_v2")
      .select("07_period_to")
      .not("07_period_to", "is", null)
      .order("07_period_to", { ascending: false })
      .limit(1);

    if (latestErr || !latestRows?.length) {
      console.error("Could not determine latest week:", latestErr);
      return new Response(
        JSON.stringify({ suggestions: [], error: "No recent data found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const latestWeek = latestRows[0]["07_period_to"] as string;
    const cutoffDate = new Date(latestWeek);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 14);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    // ── S1: Single bulk query to rix_runs_v2 with temporal filter ────
    // Paginate to get all rows (default PostgREST limit is 1000)
    const allRows: RixRow[] = [];
    let from = 0;
    const PAGE = 1500;
    for (let page = 0; page < 5; page++) {
      const { data, error } = await supabase
        .from("rix_runs_v2")
        .select(SELECT_COLS)
        .gte("07_period_to", cutoffStr)
        .not("09_rix_score", "is", null)
        .not("05_ticker", "is", null)
        .order("07_period_to", { ascending: false })
        .range(from, from + PAGE - 1);

      if (error) { console.error("Query error:", error); break; }
      if (!data || data.length === 0) break;
      allRows.push(...(data as unknown as RixRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (allRows.length === 0) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Group rows by ticker ────────────────────────────────────────
    const companies = new Map<string, CompanyData>();

    for (const row of allRows) {
      const ticker = row["05_ticker"];
      const model = row["02_model_name"];
      const rix = row["09_rix_score"];
      const name = row["03_target_name"];
      const week = row["07_period_to"];
      if (!ticker || !model || rix == null || !name) continue;

      if (!companies.has(ticker)) {
        companies.set(ticker, {
          ticker, name,
          models: new Map(),
          weekScores: new Map(),
        });
      }
      const co = companies.get(ticker)!;

      // Store latest model entry (dedup by model, keep most recent)
      if (!co.models.has(model)) {
        const dims: Record<string, number> = {};
        for (const d of DIM_COLS) {
          const v = row[d];
          if (v != null && typeof v === "number") dims[d] = v;
        }
        co.models.set(model, { rix, dims });
      }

      // Weekly scores for move detection
      if (week) {
        const wk = String(week).split("T")[0];
        if (!co.weekScores.has(wk)) co.weekScores.set(wk, []);
        co.weekScores.get(wk)!.push(rix);
      }
    }

    // ── S7: Filter to companies with >= 4 models ────────────────────
    const validCompanies = [...companies.values()].filter(
      (c) => c.models.size >= 4,
    );

    // ── Fetch sector/ibex metadata from repindex_root_issuers ───────
    const tickerSet = new Set(validCompanies.map((c) => c.ticker));
    const { data: issuerRows } = await supabase
      .from("repindex_root_issuers")
      .select("ticker, sector_category, ibex_family_code")
      .in("ticker", [...tickerSet]);

    const issuerMap = new Map<string, { sector: string | null; ibex: string | null }>();
    for (const r of issuerRows || []) {
      issuerMap.set(r.ticker, {
        sector: r.sector_category,
        ibex: r.ibex_family_code,
      });
    }

    const suggestions: Suggestion[] = [];

    // ── S2+S4: Dimensional anomalies ────────────────────────────────
    const anomalies: { name: string; highDim: string; lowDim: string; highScore: number; lowScore: number; delta: number }[] = [];

    for (const co of validCompanies) {
      // Aggregate dimension scores across all models (median-like: average)
      const dimAgg = new Map<string, number[]>();
      for (const m of co.models.values()) {
        for (const [d, v] of Object.entries(m.dims)) {
          if (v > 0) {
            if (!dimAgg.has(d)) dimAgg.set(d, []);
            dimAgg.get(d)!.push(v);
          }
        }
      }

      const dimAvgs = [...dimAgg.entries()]
        .filter(([_, vals]) => vals.length >= 2) // Need data from multiple models
        .map(([d, vals]) => ({
          dim: d,
          avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        }))
        .filter((e) => e.avg > 0); // S2: exclude zeros

      if (dimAvgs.length < 3) continue;

      const sorted = [...dimAvgs].sort((a, b) => b.avg - a.avg);
      const high = sorted[0];
      const low = sorted[sorted.length - 1];
      const delta = high.avg - low.avg;

      if (delta >= 30 && high.avg > 0 && low.avg > 0) { // S2: both > 0
        anomalies.push({
          name: co.name,
          highDim: high.dim,
          lowDim: low.dim,
          highScore: high.avg,
          lowScore: low.avg,
          delta,
        });
      }
    }

    anomalies.sort((a, b) => b.delta - a.delta);
    for (const a of anomalies.slice(0, 3)) {
      const highLabel = dimLabels[a.highDim] || a.highDim;
      const lowLabel = dimLabels[a.lowDim] || a.lowDim;
      suggestions.push({
        text: lang === "en"
          ? `Analyze the reputation of ${a.name} — breakdown by dimensions`
          : `Analiza la reputación de ${a.name} — desglose por dimensiones`,
        type: "vector_insight",
        icon: "🔬",
        source: "dimensional_anomaly",
      });
    }

    // ── S3: Model divergences ───────────────────────────────────────
    const divergences: { name: string; ticker: string; range: number }[] = [];

    for (const co of validCompanies) {
      const rixScores = [...co.models.values()].map((m) => m.rix);
      if (rixScores.length < 4) continue;
      const range = Math.max(...rixScores) - Math.min(...rixScores);
      if (range >= 15) {
        divergences.push({ name: co.name, ticker: co.ticker, range });
      }
    }

    divergences.sort((a, b) => b.range - a.range);
    for (const d of divergences.slice(0, 2)) {
      suggestions.push({
        text: lang === "en"
          ? `Analyze the AI divergence on ${d.name} (${d.range}-point range)`
          : `Analiza la divergencia entre IAs sobre ${d.name} (rango de ${d.range} puntos)`,
        type: "vector_insight",
        icon: "🤖",
        source: "model_divergence",
      });
    }

    // ── Weekly moves (compare 2 most recent weeks) ──────────────────
    const moves: { name: string; ticker: string; prevAvg: number; currAvg: number; delta: number }[] = [];

    for (const co of validCompanies) {
      const weekKeys = [...co.weekScores.keys()].sort().reverse();
      if (weekKeys.length < 2) continue;

      const currScores = co.weekScores.get(weekKeys[0])!;
      const prevScores = co.weekScores.get(weekKeys[1])!;
      if (currScores.length < 3 || prevScores.length < 3) continue;

      const currAvg = Math.round(currScores.reduce((a, b) => a + b, 0) / currScores.length);
      const prevAvg = Math.round(prevScores.reduce((a, b) => a + b, 0) / prevScores.length);
      const delta = currAvg - prevAvg;

      if (Math.abs(delta) >= 8) {
        moves.push({ name: co.name, ticker: co.ticker, prevAvg, currAvg, delta });
      }
    }

    moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    for (const m of moves.slice(0, 2)) {
      const up = m.delta > 0;
      suggestions.push({
        text: lang === "en"
          ? `Evolution of ${m.name} over the last 2 weeks`
          : `Evolución de ${m.name} en las últimas 2 semanas`,
        type: "vector_insight",
        icon: up ? "📈" : "📉",
        source: "weekly_move",
      });
    }

    // ── Sector patterns (using issuer metadata) ─────────────────────
    const sectorGroups = new Map<string, { name: string; avgRix: number }[]>();
    for (const co of validCompanies) {
      const meta = issuerMap.get(co.ticker);
      if (!meta?.sector) continue;
      const rixScores = [...co.models.values()].map((m) => m.rix);
      const avg = Math.round(rixScores.reduce((a, b) => a + b, 0) / rixScores.length);
      if (!sectorGroups.has(meta.sector)) sectorGroups.set(meta.sector, []);
      sectorGroups.get(meta.sector)!.push({ name: co.name, avgRix: avg });
    }

    for (const [sector, members] of sectorGroups) {
      if (members.length < 3) continue;
      members.sort((a, b) => b.avgRix - a.avgRix);
      const top = members[0];
      const bottom = members[members.length - 1];
      if (top.avgRix - bottom.avgRix >= 20) {
        suggestions.push({
          text: lang === "en"
            ? `Compare ${top.name} with ${bottom.name} in the ${sector} sector`
            : `Compara ${top.name} con ${bottom.name} en el sector ${sector}`,
          type: "vector_insight",
          icon: "📊",
          source: "sector_pattern",
        });
        break;
      }
    }

    // ── Cross-index (IBEX-35 vs others) ─────────────────────────────
    const ibexScores: number[] = [];
    const nonIbexBeaters: string[] = [];

    for (const co of validCompanies) {
      const meta = issuerMap.get(co.ticker);
      if (!meta?.ibex) continue;
      const rixScores = [...co.models.values()].map((m) => m.rix);
      const avg = Math.round(rixScores.reduce((a, b) => a + b, 0) / rixScores.length);
      if (meta.ibex === "IBEX-35") {
        ibexScores.push(avg);
      }
    }

    if (ibexScores.length > 5) {
      const ibexAvg = Math.round(ibexScores.reduce((a, b) => a + b, 0) / ibexScores.length);
      for (const co of validCompanies) {
        const meta = issuerMap.get(co.ticker);
        if (!meta?.ibex || meta.ibex === "IBEX-35") continue;
        const rixScores = [...co.models.values()].map((m) => m.rix);
        const avg = Math.round(rixScores.reduce((a, b) => a + b, 0) / rixScores.length);
        if (avg > ibexAvg) nonIbexBeaters.push(co.name);
      }
      if (nonIbexBeaters.length >= 1 && nonIbexBeaters.length <= 8) {
        suggestions.push({
          text: lang === "en"
            ? `Ranking of companies outside the IBEX-35 by reputation`
            : `Ranking de empresas fuera del IBEX-35 por reputación`,
          type: "vector_insight",
          icon: "💎",
          source: "cross_index",
        });
      }
    }

    // ── S6: "Full analysis" suggestions for interesting companies ───
    const fullAnalysisCandidates = new Set<string>();

    // Companies with high divergence or big weekly moves
    for (const d of divergences.slice(0, 5)) fullAnalysisCandidates.add(d.name);
    for (const m of moves.slice(0, 5)) fullAnalysisCandidates.add(m.name);

    // Avoid duplicating companies already in other suggestions
    const alreadySuggested = new Set(suggestions.map((s) => {
      // Extract company name from text (rough heuristic)
      const match = s.text.match(/(?:de |of |on |In .+?, )([A-ZÁ-Ú][\w\s.&-]+?)(?:\s(?:—|ha |jumped|dropped|leads|divergen|stands|beat))/);
      return match?.[1]?.trim();
    }).filter(Boolean));

    const fullAnalysisNames = [...fullAnalysisCandidates]
      .filter((n) => !alreadySuggested.has(n))
      .slice(0, 3);

    for (const name of fullAnalysisNames) {
      suggestions.push({
        text: lang === "en"
          ? `Analyze the reputation of ${name}`
          : `Analiza la reputación de ${name}`,
        type: "vector_insight",
        icon: "🔍",
        source: "full_analysis",
      });
    }

    // ── Shuffle and pick `count` suggestions ────────────────────────
    const shuffled = suggestions.sort(() => Math.random() - 0.5).slice(0, count);

    return new Response(JSON.stringify({ suggestions: shuffled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in fetch-smart-suggestions:", error);
    return new Response(
      JSON.stringify({ suggestions: [], error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
