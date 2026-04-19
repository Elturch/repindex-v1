import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AIModelOption } from "@/contexts/LandingAIModelContext";
import { getLatestRixTrendWeeks } from "@/lib/getLatestRixTrendWeeks";

export type RankingMode = "score" | "consensus";

interface TopCompany {
  empresa: string;
  ticker: string;
  rix: number;
  ai: string;
  consensusLevel?: "alto" | "medio" | "bajo";
  range?: number;
}

interface TopByAI {
  chatgpt: TopCompany[];
  deepseek: TopCompany[];
  gemini: TopCompany[];
  perplexity: TopCompany[];
}

// === CONSENSUS HELPERS ===
interface ConsensusRow {
  ticker: string;
  company_name: string;
  ibex_family_code: string | null;
  is_traded: boolean | null;
  majorityScore: number;
  consensusLevel: "alto" | "medio" | "bajo";
  range: number;
  modelsCount: number;
}

function classifyConsensus(range: number): "alto" | "medio" | "bajo" {
  if (range <= 10) return "alto";
  if (range <= 20) return "medio";
  return "bajo";
}

function buildConsensusRows(
  rows: Array<{
    company_name: string;
    ticker: string;
    rix_score: number;
    model_name: string;
    ibex_family_code?: string | null;
    is_traded?: boolean | null;
  }>
): ConsensusRow[] {
  // Group by ticker
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!grouped.has(r.ticker)) grouped.set(r.ticker, []);
    grouped.get(r.ticker)!.push(r);
  }

  const result: ConsensusRow[] = [];
  for (const [ticker, items] of grouped) {
    const scores = items.map(i => i.rix_score).filter(s => typeof s === "number");
    if (scores.length === 0) continue;
    const sorted = [...scores].sort((a, b) => a - b);
    const range = sorted[sorted.length - 1] - sorted[0];
    // Majority block: drop top and bottom outliers when 4+ models, then average
    let majorityScores = sorted;
    if (sorted.length >= 4) {
      majorityScores = sorted.slice(1, -1);
    }
    const majorityScore = majorityScores.reduce((a, b) => a + b, 0) / majorityScores.length;
    result.push({
      ticker,
      company_name: items[0].company_name,
      ibex_family_code: items[0].ibex_family_code ?? null,
      is_traded: items[0].is_traded ?? null,
      majorityScore,
      consensusLevel: classifyConsensus(range),
      range,
      modelsCount: scores.length,
    });
  }
  return result;
}

function sortByConsensus(rows: ConsensusRow[], asc = false): ConsensusRow[] {
  const order = { alto: 0, medio: 1, bajo: 2 } as const;
  return [...rows].sort((a, b) => {
    const cDiff = order[a.consensusLevel] - order[b.consensusLevel];
    if (cDiff !== 0) return cDiff;
    return asc ? a.majorityScore - b.majorityScore : b.majorityScore - a.majorityScore;
  });
}

function consensusToTopCompany(r: ConsensusRow): TopCompany {
  return {
    empresa: r.company_name,
    ticker: r.ticker,
    rix: r.majorityScore,
    ai: "Consenso 6 IAs",
    consensusLevel: r.consensusLevel,
    range: r.range,
  };
}

export function useLandingTopFives(
  selectedModel: AIModelOption = "ChatGPT",
  mode: RankingMode = "score"
) {
  return useQuery({
    queryKey: ["landing-top-fives", selectedModel, mode],
    queryFn: async () => {
      const latestWeeks = await getLatestRixTrendWeeks({ desired: 2 });
      if (!latestWeeks || latestWeeks.length === 0) throw new Error("No data available");

      const latestWeek = latestWeeks[0];
      const previousWeek = latestWeeks.length > 1 ? latestWeeks[1] : null;

      const topByAI: TopByAI = { chatgpt: [], deepseek: [], gemini: [], perplexity: [] };

      // Top 5 by each AI model (kept for backwards compatibility)
      for (const model of ["ChatGPT", "Deepseek", "Google Gemini", "Perplexity"]) {
        const { data } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name")
          .eq("batch_week", latestWeek)
          .eq("model_name", model)
          .order("rix_score", { ascending: false })
          .limit(5);

        if (data) {
          let key: keyof TopByAI;
          const normalizedModel = model.toLowerCase().replace(" ", "");
          if (normalizedModel === "googlegemini") key = "gemini";
          else if (normalizedModel === "chatgpt") key = "chatgpt";
          else if (normalizedModel === "deepseek") key = "deepseek";
          else key = "perplexity";
          topByAI[key] = data.map(d => ({
            empresa: d.company_name,
            ticker: d.ticker,
            rix: d.rix_score,
            ai: d.model_name,
          }));
        }
      }

      // ===========================================================
      // CONSENSUS MODE — fetch ALL models for the week, group, sort
      // ===========================================================
      if (mode === "consensus") {
        // Fetch all rows for latest week (paginated to bypass 1000 row default)
        const fetchAllForWeek = async (week: string) => {
          const all: any[] = [];
          let from = 0;
          const PAGE = 1000;
          while (true) {
            const { data, error } = await supabase
              .from("rix_trends")
              .select("company_name, ticker, rix_score, model_name, ibex_family_code, is_traded")
              .eq("batch_week", week)
              .range(from, from + PAGE - 1);
            if (error || !data || data.length === 0) break;
            all.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
          }
          return all;
        };

        const currentRows = await fetchAllForWeek(latestWeek);
        const consensus = buildConsensusRows(currentRows);

        const ibexRows = consensus.filter(r => r.ibex_family_code === "IBEX-35");
        const nonIbexRows = consensus.filter(r => r.ibex_family_code !== "IBEX-35");
        const tradedNonIbex = nonIbexRows.filter(r => r.is_traded === true);
        const untradedRows = consensus.filter(r => r.is_traded === false);

        const topIbex = sortByConsensus(ibexRows).slice(0, 5).map(consensusToTopCompany);
        const bottomIbex = sortByConsensus(ibexRows, true).slice(0, 5).map(consensusToTopCompany);
        const topOverall = sortByConsensus(nonIbexRows).slice(0, 5).map(consensusToTopCompany);
        const bottomOverall = sortByConsensus(nonIbexRows, true).slice(0, 5).map(consensusToTopCompany);
        const topTraded = sortByConsensus(tradedNonIbex).slice(0, 5).map(consensusToTopCompany);
        const topUntraded = sortByConsensus(untradedRows).slice(0, 5).map(consensusToTopCompany);

        // Movers — compare consensus majority scores week-over-week
        let topMoversUp: TopCompany[] = [];
        let topMoversDown: TopCompany[] = [];
        let ibexMoversUp: TopCompany[] = [];
        let ibexMoversDown: TopCompany[] = [];

        if (previousWeek) {
          const previousRows = await fetchAllForWeek(previousWeek);
          const prevConsensus = buildConsensusRows(previousRows);
          const prevMap = new Map(prevConsensus.map(r => [r.ticker, r]));

          const changes = consensus
            .map(curr => {
              const prev = prevMap.get(curr.ticker);
              if (!prev) return null;
              return {
                ...consensusToTopCompany(curr),
                ibex_family_code: curr.ibex_family_code,
                change: curr.majorityScore - prev.majorityScore,
              };
            })
            .filter(Boolean) as (TopCompany & { ibex_family_code: string | null; change: number })[];

          const ibexChanges = changes.filter(c => c.ibex_family_code === "IBEX-35");
          ibexMoversUp = [...ibexChanges].sort((a, b) => b.change - a.change).slice(0, 5);
          ibexMoversDown = [...ibexChanges].sort((a, b) => a.change - b.change).slice(0, 5);
          const nonIbexChanges = changes.filter(c => c.ibex_family_code !== "IBEX-35");
          topMoversUp = [...nonIbexChanges].sort((a, b) => b.change - a.change).slice(0, 5);
          topMoversDown = [...nonIbexChanges].sort((a, b) => a.change - b.change).slice(0, 5);
        }

        return {
          latestWeek,
          selectedModel,
          mode,
          topByAI,
          topIbex,
          bottomIbex,
          ibexMoversUp,
          ibexMoversDown,
          topTraded,
          topUntraded,
          topOverall,
          bottomOverall,
          topMoversUp,
          topMoversDown,
        };
      }

      // ===========================================================
      // SCORE MODE (default) — original behaviour, filtered by model
      // ===========================================================
      const { data: topIbex } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: false })
        .limit(5);

      const { data: bottomIbex } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: true })
        .limit(5);

      const { data: topTraded } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, is_traded, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("is_traded", true)
        .neq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: false })
        .limit(5);

      const { data: topUntraded } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, is_traded")
        .eq("batch_week", latestWeek)
        .eq("is_traded", false)
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: false })
        .limit(5);

      const { data: topOverall } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .neq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: false })
        .limit(5);

      const { data: bottomOverall } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .neq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: true })
        .limit(5);

      let topMoversUp: TopCompany[] = [];
      let topMoversDown: TopCompany[] = [];
      let ibexMoversUp: TopCompany[] = [];
      let ibexMoversDown: TopCompany[] = [];

      if (previousWeek) {
        const { data: currentData } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name, ibex_family_code")
          .eq("batch_week", latestWeek)
          .eq("model_name", selectedModel);

        const { data: previousData } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name, ibex_family_code")
          .eq("batch_week", previousWeek)
          .eq("model_name", selectedModel);

        if (currentData && previousData) {
          const changes = currentData
            .map(curr => {
              const prev = previousData.find(p => p.ticker === curr.ticker);
              if (!prev) return null;
              return {
                empresa: curr.company_name,
                ticker: curr.ticker,
                rix: curr.rix_score,
                ai: curr.model_name,
                ibex_family_code: curr.ibex_family_code,
                change: curr.rix_score - prev.rix_score,
              };
            })
            .filter(Boolean) as (TopCompany & { ibex_family_code: string | null; change: number })[];

          const ibexChanges = changes.filter(c => c.ibex_family_code === "IBEX-35");
          ibexMoversUp = [...ibexChanges].sort((a, b) => b.change - a.change).slice(0, 5);
          ibexMoversDown = [...ibexChanges].sort((a, b) => a.change - b.change).slice(0, 5);
          const nonIbexChanges = changes.filter(c => c.ibex_family_code !== "IBEX-35" || !c.ibex_family_code);
          topMoversUp = [...nonIbexChanges].sort((a, b) => b.change - a.change).slice(0, 5);
          topMoversDown = [...nonIbexChanges].sort((a, b) => a.change - b.change).slice(0, 5);
        }
      }

      return {
        latestWeek,
        selectedModel,
        mode,
        topByAI,
        topIbex: topIbex?.map(d => ({ empresa: d.company_name, ticker: d.ticker, rix: d.rix_score, ai: d.model_name })) || [],
        bottomIbex: bottomIbex?.map(d => ({ empresa: d.company_name, ticker: d.ticker, rix: d.rix_score, ai: d.model_name })) || [],
        ibexMoversUp,
        ibexMoversDown,
        topTraded: topTraded?.map(d => ({ empresa: d.company_name, ticker: d.ticker, rix: d.rix_score, ai: d.model_name })) || [],
        topUntraded: topUntraded?.map(d => ({ empresa: d.company_name, ticker: d.ticker, rix: d.rix_score, ai: d.model_name })) || [],
        topOverall: topOverall?.map(d => ({ empresa: d.company_name, ticker: d.ticker, rix: d.rix_score, ai: d.model_name })) || [],
        bottomOverall: bottomOverall?.map(d => ({ empresa: d.company_name, ticker: d.ticker, rix: d.rix_score, ai: d.model_name })) || [],
        topMoversUp,
        topMoversDown,
      };
    },
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });
}
