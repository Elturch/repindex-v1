import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AIModelOption } from "@/contexts/LandingAIModelContext";
import { getLatestRixTrendWeeks } from "@/lib/getLatestRixTrendWeeks";

// FASE 1 — V2-only. Reads from `rix_runs_v2` (Sunday-anchored). Legacy
// `rix_trends` retired. If V2 has fewer than 2 weeks of history, the
// movers blocks degrade gracefully (empty arrays, no error).

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
    let majorityScores = sorted;
    if (sorted.length >= 4) majorityScores = sorted.slice(1, -1);
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

// Fetch all V2 rows for one batch (Sunday-anchored execution date), join repindex.
async function fetchV2WeekEnriched(
  batchDateISO: string,
  issuersMap: Map<string, { name: string; ibexCode: string | null; isTraded: boolean }>,
): Promise<Array<{
  company_name: string;
  ticker: string;
  rix_score: number;
  model_name: string;
  ibex_family_code: string | null;
  is_traded: boolean;
}>> {
  // batchDateISO is YYYY-MM-DD. Match the full Sunday day window.
  const dayStart = `${batchDateISO}T00:00:00Z`;
  const nextDay = new Date(batchDateISO);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dayEnd = nextDay.toISOString();

  const all: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(`"05_ticker","02_model_name","09_rix_score","51_rix_score_adjusted","52_cxm_excluded","03_target_name",batch_execution_date`)
      .gte("batch_execution_date", dayStart)
      .lt("batch_execution_date", dayEnd)
      .or('analysis_completed_at.not.is.null,09_rix_score.not.is.null')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all
    .map((r: any) => {
      const ticker = r["05_ticker"];
      const meta = issuersMap.get(ticker);
      if (!meta) return null;
      const score = r["52_cxm_excluded"] ? r["51_rix_score_adjusted"] : r["09_rix_score"];
      if (score === null || score === undefined) return null;
      return {
        company_name: r["03_target_name"] || meta.name,
        ticker,
        rix_score: score,
        model_name: r["02_model_name"],
        ibex_family_code: meta.ibexCode,
        is_traded: meta.isTraded,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function useLandingTopFives(
  selectedModel: AIModelOption = "ChatGPT",
  mode: RankingMode = "score"
) {
  return useQuery({
    queryKey: ["landing-top-fives-v2only", selectedModel, mode],
    queryFn: async () => {
      const latestWeeks = await getLatestRixTrendWeeks({ desired: 2 });

      const empty: TopByAI = { chatgpt: [], deepseek: [], gemini: [], perplexity: [] };
      const emptyResult = {
        latestWeek: null as string | null,
        selectedModel,
        mode,
        topByAI: empty,
        topIbex: [] as TopCompany[],
        bottomIbex: [] as TopCompany[],
        ibexMoversUp: [] as TopCompany[],
        ibexMoversDown: [] as TopCompany[],
        topTraded: [] as TopCompany[],
        topUntraded: [] as TopCompany[],
        topOverall: [] as TopCompany[],
        bottomOverall: [] as TopCompany[],
        topMoversUp: [] as TopCompany[],
        topMoversDown: [] as TopCompany[],
      };

      if (!latestWeeks || latestWeeks.length === 0) return emptyResult;

      const latestWeek = latestWeeks[0];
      const previousWeek = latestWeeks.length > 1 ? latestWeeks[1] : null;

      // Pre-load issuers master once
      const { data: issuersData } = await supabase
        .from("repindex_root_issuers")
        .select("ticker, issuer_name, ibex_family_code, cotiza_en_bolsa");
      const issuersMap = new Map<string, { name: string; ibexCode: string | null; isTraded: boolean }>();
      (issuersData || []).forEach(i => {
        issuersMap.set(i.ticker, {
          name: i.issuer_name ?? i.ticker,
          ibexCode: i.ibex_family_code ?? null,
          isTraded: !!i.cotiza_en_bolsa,
        });
      });

      const currentRows = await fetchV2WeekEnriched(latestWeek, issuersMap);
      if (currentRows.length === 0) return { ...emptyResult, latestWeek };

      const topByAI: TopByAI = { chatgpt: [], deepseek: [], gemini: [], perplexity: [] };

      // Top 5 by each of the 4 legacy-named buckets (kept for backwards compat)
      for (const model of ["ChatGPT", "Deepseek", "Google Gemini", "Perplexity"]) {
        const filtered = currentRows
          .filter(r => r.model_name === model)
          .sort((a, b) => b.rix_score - a.rix_score)
          .slice(0, 5);
        let key: keyof TopByAI;
        const norm = model.toLowerCase().replace(" ", "");
        if (norm === "googlegemini") key = "gemini";
        else if (norm === "chatgpt") key = "chatgpt";
        else if (norm === "deepseek") key = "deepseek";
        else key = "perplexity";
        topByAI[key] = filtered.map(d => ({
          empresa: d.company_name,
          ticker: d.ticker,
          rix: d.rix_score,
          ai: d.model_name,
        }));
      }

      // ============== CONSENSUS MODE ==============
      if (mode === "consensus") {
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

        let topMoversUp: TopCompany[] = [];
        let topMoversDown: TopCompany[] = [];
        let ibexMoversUp: TopCompany[] = [];
        let ibexMoversDown: TopCompany[] = [];

        if (previousWeek) {
          const previousRows = await fetchV2WeekEnriched(previousWeek, issuersMap);
          if (previousRows.length > 0) {
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

      // ============== SCORE MODE ==============
      const byModel = currentRows.filter(r => r.model_name === selectedModel);

      const topIbex = byModel
        .filter(r => r.ibex_family_code === "IBEX-35")
        .sort((a, b) => b.rix_score - a.rix_score).slice(0, 5);
      const bottomIbex = byModel
        .filter(r => r.ibex_family_code === "IBEX-35")
        .sort((a, b) => a.rix_score - b.rix_score).slice(0, 5);
      const topTraded = byModel
        .filter(r => r.is_traded === true && r.ibex_family_code !== "IBEX-35")
        .sort((a, b) => b.rix_score - a.rix_score).slice(0, 5);
      const topUntraded = byModel
        .filter(r => r.is_traded === false)
        .sort((a, b) => b.rix_score - a.rix_score).slice(0, 5);
      const topOverall = byModel
        .filter(r => r.ibex_family_code !== "IBEX-35")
        .sort((a, b) => b.rix_score - a.rix_score).slice(0, 5);
      const bottomOverall = byModel
        .filter(r => r.ibex_family_code !== "IBEX-35")
        .sort((a, b) => a.rix_score - b.rix_score).slice(0, 5);

      let topMoversUp: TopCompany[] = [];
      let topMoversDown: TopCompany[] = [];
      let ibexMoversUp: TopCompany[] = [];
      let ibexMoversDown: TopCompany[] = [];

      if (previousWeek) {
        const previousRows = await fetchV2WeekEnriched(previousWeek, issuersMap);
        const prevByModel = previousRows.filter(r => r.model_name === selectedModel);
        if (prevByModel.length > 0) {
          const changes = byModel
            .map(curr => {
              const prev = prevByModel.find(p => p.ticker === curr.ticker);
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

      const toTC = (rows: typeof byModel): TopCompany[] =>
        rows.map(d => ({ empresa: d.company_name, ticker: d.ticker, rix: d.rix_score, ai: d.model_name }));

      return {
        latestWeek,
        selectedModel,
        mode,
        topByAI,
        topIbex: toTC(topIbex),
        bottomIbex: toTC(bottomIbex),
        ibexMoversUp,
        ibexMoversDown,
        topTraded: toTC(topTraded),
        topUntraded: toTC(topUntraded),
        topOverall: toTC(topOverall),
        bottomOverall: toTC(bottomOverall),
        topMoversUp,
        topMoversDown,
      };
    },
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });
}
