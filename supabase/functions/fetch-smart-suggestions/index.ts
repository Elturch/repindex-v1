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

interface DimensionAnomaly {
  company_name: string;
  ticker: string;
  ai_model: string;
  high_dim: string;
  high_score: number;
  low_dim: string;
  low_score: number;
  delta: number;
}

interface Divergence {
  company_name: string;
  ticker: string;
  max_model: string;
  min_model: string;
  max_score: number;
  min_score: number;
  delta: number;
}

interface WeeklyMove {
  company_name: string;
  ticker: string;
  prev_avg: number;
  curr_avg: number;
  delta: number;
}

const DIM_LABELS_ES: Record<string, string> = {
  nvm: "Calidad Narrativa",
  drm: "Fortaleza de Evidencia",
  sim: "Autoridad de Fuentes",
  rmm: "Actualidad y Empuje",
  cem: "Gestión de Controversias",
  gam: "Percepción de Gobernanza",
  dcm: "Coherencia Informativa",
  cxm: "Ejecución Corporativa",
};

const DIM_LABELS_EN: Record<string, string> = {
  nvm: "Narrative Quality",
  drm: "Evidence Strength",
  sim: "Source Authority",
  rmm: "Momentum",
  cem: "Controversy Management",
  gam: "Governance Perception",
  dcm: "Information Coherence",
  cxm: "Corporate Execution",
};

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const dimLabels = lang === "en" ? DIM_LABELS_EN : DIM_LABELS_ES;

    // Run all queries in parallel - all use the documents table metadata
    const [
      anomaliesResult,
      divergencesResult,
      flagsResult,
      weeklyMovesResult,
      sectorResult,
      crossIndexResult,
    ] = await Promise.all([
      // Q1: Dimensional anomalies - companies with huge spread between dimensions
      supabase
        .from("documents")
        .select("metadata")
        .not("metadata->scores", "is", null)
        .not("metadata->ai_model", "is", null)
        .not("metadata->company_name", "is", null)
        .order("id", { ascending: false })
        .limit(500),

      // Q2: Same query pool used for divergences (different processing)
      supabase
        .from("documents")
        .select("metadata")
        .not("metadata->scores", "is", null)
        .not("metadata->ai_model", "is", null)
        .not("metadata->ticker", "is", null)
        .order("id", { ascending: false })
        .limit(500),

      // Q3: Flags - documents with interesting flags
      supabase
        .from("documents")
        .select("metadata")
        .not("metadata->flags", "is", null)
        .not("metadata->company_name", "is", null)
        .order("id", { ascending: false })
        .limit(300),

      // Q4: Weekly moves - need two different weeks
      supabase
        .from("documents")
        .select("metadata")
        .not("metadata->rix_score", "is", null)
        .not("metadata->week_start", "is", null)
        .not("metadata->ticker", "is", null)
        .order("id", { ascending: false })
        .limit(800),

      // Q5: Sector patterns
      supabase
        .from("documents")
        .select("metadata")
        .not("metadata->sector_category", "is", null)
        .not("metadata->rix_score", "is", null)
        .order("id", { ascending: false })
        .limit(500),

      // Q6: Cross-index (IBEX vs non-IBEX)
      supabase
        .from("documents")
        .select("metadata")
        .not("metadata->rix_score", "is", null)
        .not("metadata->ibex_family_code", "is", null)
        .order("id", { ascending: false })
        .limit(400),
    ]);

    const suggestions: Suggestion[] = [];

    // --- Process Q1: Dimensional anomalies ---
    if (anomaliesResult.data) {
      const anomalies: DimensionAnomaly[] = [];
      for (const doc of anomaliesResult.data) {
        const m = doc.metadata as any;
        if (!m?.scores || !m?.company_name) continue;
        const dims = ["nvm", "drm", "sim", "rmm", "cem", "gam", "dcm"];
        const entries = dims
          .filter((d) => m.scores[d] != null)
          .map((d) => ({ dim: d, score: m.scores[d] as number }));
        if (entries.length < 3) continue;
        const sorted = [...entries].sort((a, b) => b.score - a.score);
        const high = sorted[0];
        const low = sorted[sorted.length - 1];
        const delta = high.score - low.score;
        if (delta >= 45) {
          anomalies.push({
            company_name: m.company_name,
            ticker: m.ticker,
            ai_model: m.ai_model,
            high_dim: high.dim,
            high_score: high.score,
            low_dim: low.dim,
            low_score: low.score,
            delta,
          });
        }
      }
      // Deduplicate by company, keep highest delta
      const byCompany = new Map<string, DimensionAnomaly>();
      for (const a of anomalies) {
        const existing = byCompany.get(a.company_name);
        if (!existing || a.delta > existing.delta) byCompany.set(a.company_name, a);
      }
      const topAnomalies = [...byCompany.values()]
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);

      for (const a of topAnomalies) {
        const highLabel = dimLabels[a.high_dim] || a.high_dim;
        const lowLabel = dimLabels[a.low_dim] || a.low_dim;
        suggestions.push({
          text:
            lang === "en"
              ? `${a.company_name} scores ${a.high_score} in ${highLabel} but only ${a.low_score} in ${lowLabel} — why such a ${a.delta}-point gap?`
              : `${a.company_name} tiene ${a.high_score} en ${highLabel} pero solo ${a.low_score} en ${lowLabel} — ¿por qué esa brecha de ${a.delta} puntos?`,
          type: "vector_insight",
          icon: "🔬",
          source: "dimensional_anomaly",
        });
      }
    }

    // --- Process Q2: Divergences between AI models ---
    if (divergencesResult.data) {
      const byTickerWeek = new Map<
        string,
        { company_name: string; ticker: string; models: { model: string; score: number }[] }
      >();
      for (const doc of divergencesResult.data) {
        const m = doc.metadata as any;
        if (!m?.rix_score || !m?.ticker || !m?.ai_model) continue;
        const key = `${m.ticker}_${m.week_start || "latest"}`;
        if (!byTickerWeek.has(key)) {
          byTickerWeek.set(key, {
            company_name: m.company_name || m.ticker,
            ticker: m.ticker,
            models: [],
          });
        }
        byTickerWeek.get(key)!.models.push({ model: m.ai_model, score: m.rix_score });
      }

      const divergences: Divergence[] = [];
      for (const entry of byTickerWeek.values()) {
        if (entry.models.length < 2) continue;
        const sorted = [...entry.models].sort((a, b) => b.score - a.score);
        const delta = sorted[0].score - sorted[sorted.length - 1].score;
        if (delta >= 15) {
          divergences.push({
            company_name: entry.company_name,
            ticker: entry.ticker,
            max_model: sorted[0].model,
            min_model: sorted[sorted.length - 1].model,
            max_score: sorted[0].score,
            min_score: sorted[sorted.length - 1].score,
            delta,
          });
        }
      }
      divergences.sort((a, b) => b.delta - a.delta);
      for (const d of divergences.slice(0, 2)) {
        suggestions.push({
          text:
            lang === "en"
              ? `${d.max_model} rates ${d.company_name} at ${d.max_score} but ${d.min_model} only ${d.min_score} — who's right and why?`
              : `${d.max_model} da ${d.max_score} a ${d.company_name} pero ${d.min_model} solo ${d.min_score} — ¿quién tiene razón y por qué?`,
          type: "vector_insight",
          icon: "🤖",
          source: "model_divergence",
        });
      }
    }

    // --- Process Q3: Interesting flags ---
    if (flagsResult.data) {
      const flagCounts = new Map<string, Set<string>>();
      for (const doc of flagsResult.data) {
        const m = doc.metadata as any;
        if (!m?.flags || !Array.isArray(m.flags)) continue;
        for (const flag of m.flags) {
          if (!flagCounts.has(flag)) flagCounts.set(flag, new Set());
          flagCounts.get(flag)!.add(m.company_name || m.ticker || "unknown");
        }
      }
      const interestingFlags = ["inconsistencias", "sim_bajo", "drm_bajo", "confusion_alias", "datos_antiguos"];
      for (const flag of interestingFlags) {
        const companies = flagCounts.get(flag);
        if (companies && companies.size >= 2) {
          const flagLabel =
            lang === "en"
              ? flag.replace(/_/g, " ")
              : flag.replace(/_/g, " ");
          suggestions.push({
            text:
              lang === "en"
                ? `${companies.size} companies flagged with '${flagLabel}' this week — what's going on?`
                : `${companies.size} empresas con alerta de '${flagLabel}' esta semana — ¿qué está pasando?`,
            type: "vector_insight",
            icon: "⚠️",
            source: "flag_alert",
          });
          break; // Only one flag suggestion
        }
      }
    }

    // --- Process Q4: Weekly moves ---
    if (weeklyMovesResult.data) {
      const weeksByTicker = new Map<
        string,
        { company_name: string; weeks: Map<string, number[]> }
      >();
      for (const doc of weeklyMovesResult.data) {
        const m = doc.metadata as any;
        if (!m?.rix_score || !m?.week_start || !m?.ticker) continue;
        if (!weeksByTicker.has(m.ticker)) {
          weeksByTicker.set(m.ticker, {
            company_name: m.company_name || m.ticker,
            weeks: new Map(),
          });
        }
        const entry = weeksByTicker.get(m.ticker)!;
        if (!entry.weeks.has(m.week_start)) entry.weeks.set(m.week_start, []);
        entry.weeks.get(m.week_start)!.push(m.rix_score);
      }

      const moves: WeeklyMove[] = [];
      for (const entry of weeksByTicker.values()) {
        const weekKeys = [...entry.weeks.keys()].sort().reverse();
        if (weekKeys.length < 2) continue;
        const currScores = entry.weeks.get(weekKeys[0])!;
        const prevScores = entry.weeks.get(weekKeys[1])!;
        const currAvg = Math.round(currScores.reduce((a, b) => a + b, 0) / currScores.length);
        const prevAvg = Math.round(prevScores.reduce((a, b) => a + b, 0) / prevScores.length);
        const delta = currAvg - prevAvg;
        if (Math.abs(delta) >= 8) {
          moves.push({
            company_name: entry.company_name,
            ticker: weekKeys[0],
            prev_avg: prevAvg,
            curr_avg: currAvg,
            delta,
          });
        }
      }
      moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      for (const m of moves.slice(0, 2)) {
        const direction = m.delta > 0;
        suggestions.push({
          text: direction
            ? lang === "en"
              ? `${m.company_name} jumped from ${m.prev_avg} to ${m.curr_avg} (+${m.delta} pts) in one week — what happened?`
              : `${m.company_name} ha subido de ${m.prev_avg} a ${m.curr_avg} (+${m.delta} pts) en una semana — ¿qué ha pasado?`
            : lang === "en"
              ? `${m.company_name} dropped from ${m.prev_avg} to ${m.curr_avg} (${m.delta} pts) in one week — real problem or data glitch?`
              : `${m.company_name} ha caído de ${m.prev_avg} a ${m.curr_avg} (${m.delta} pts) en una semana — ¿problema real o fallo de datos?`,
          type: "vector_insight",
          icon: direction ? "📈" : "📉",
          source: "weekly_move",
        });
      }
    }

    // --- Process Q5: Sector patterns ---
    if (sectorResult.data) {
      const sectorScores = new Map<
        string,
        { companies: Map<string, number[]> }
      >();
      for (const doc of sectorResult.data) {
        const m = doc.metadata as any;
        if (!m?.sector_category || !m?.rix_score || !m?.company_name) continue;
        if (!sectorScores.has(m.sector_category)) {
          sectorScores.set(m.sector_category, { companies: new Map() });
        }
        const sector = sectorScores.get(m.sector_category)!;
        if (!sector.companies.has(m.company_name)) sector.companies.set(m.company_name, []);
        sector.companies.get(m.company_name)!.push(m.rix_score);
      }

      for (const [sector, data] of sectorScores) {
        if (data.companies.size < 3) continue;
        const avgs = [...data.companies.entries()].map(([name, scores]) => ({
          name,
          avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        }));
        avgs.sort((a, b) => b.avg - a.avg);
        const top = avgs[0];
        const bottom = avgs[avgs.length - 1];
        if (top.avg - bottom.avg >= 20) {
          suggestions.push({
            text:
              lang === "en"
                ? `In ${sector}, ${top.name} leads with ${top.avg} pts while ${bottom.name} trails at ${bottom.avg} — what explains the gap?`
                : `En ${sector}, ${top.name} lidera con ${top.avg} pts mientras ${bottom.name} queda en ${bottom.avg} — ¿qué explica la brecha?`,
            type: "vector_insight",
            icon: "📊",
            source: "sector_pattern",
          });
          break; // One sector suggestion
        }
      }
    }

    // --- Process Q6: Cross-index discoveries ---
    if (crossIndexResult.data) {
      const ibexScores: { name: string; score: number }[] = [];
      const nonIbexScores: { name: string; score: number; code: string }[] = [];
      const seen = new Set<string>();

      for (const doc of crossIndexResult.data) {
        const m = doc.metadata as any;
        if (!m?.rix_score || !m?.company_name || seen.has(m.company_name)) continue;
        seen.add(m.company_name);
        if (m.ibex_family_code === "IBEX-35") {
          ibexScores.push({ name: m.company_name, score: m.rix_score });
        } else {
          nonIbexScores.push({ name: m.company_name, score: m.rix_score, code: m.ibex_family_code });
        }
      }

      if (ibexScores.length > 0 && nonIbexScores.length > 0) {
        const ibexAvg = Math.round(ibexScores.reduce((a, b) => a + b.score, 0) / ibexScores.length);
        const beaters = nonIbexScores.filter((c) => c.score > ibexAvg);
        if (beaters.length >= 1 && beaters.length <= 5) {
          suggestions.push({
            text:
              lang === "en"
                ? `${beaters.length} companies outside the IBEX-35 beat its average score (${ibexAvg}) — which ones and why?`
                : `${beaters.length} empresas fuera del IBEX-35 superan su media (${ibexAvg} pts) — ¿cuáles son y por qué?`,
            type: "vector_insight",
            icon: "💎",
            source: "cross_index",
          });
        }
      }
    }

    // Shuffle and pick `count` suggestions
    const shuffled = suggestions.sort(() => Math.random() - 0.5).slice(0, count);

    return new Response(JSON.stringify({ suggestions: shuffled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in fetch-smart-suggestions:", error);
    return new Response(
      JSON.stringify({ suggestions: [], error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
