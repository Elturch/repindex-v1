import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TopCompany {
  empresa: string;
  ticker: string;
  rix: number;
  ai: string;
}

interface TopByAI {
  chatgpt: TopCompany[];
  deepseek: TopCompany[];
  gemini: TopCompany[];
  perplexity: TopCompany[];
}

export function useLandingTopFives() {
  return useQuery({
    queryKey: ["landing-top-fives"],
    queryFn: async () => {
      // Get latest and previous batch weeks (DISTINCT to avoid duplicates)
      const { data: allWeeks } = await supabase
        .from("rix_trends")
        .select("batch_week")
        .order("batch_week", { ascending: false });
      
      // Extract unique weeks
      const uniqueWeeks = [...new Set(allWeeks?.map(w => w.batch_week) || [])];
      const latestBatches = uniqueWeeks.slice(0, 2).map(w => ({ batch_week: w }));

      if (!latestBatches || latestBatches.length === 0) throw new Error("No data available");

      const latestWeek = latestBatches[0].batch_week;
      const previousWeek = latestBatches.length > 1 ? latestBatches[1].batch_week : null;

      // Top 5 by each AI model
      const topByAI: TopByAI = {
        chatgpt: [],
        deepseek: [],
        gemini: [],
        perplexity: []
      };

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
          
          if (normalizedModel === "googlegemini") {
            key = "gemini";
          } else if (normalizedModel === "chatgpt") {
            key = "chatgpt";
          } else if (normalizedModel === "deepseek") {
            key = "deepseek";
          } else {
            key = "perplexity";
          }
          
          topByAI[key] = data.map(d => ({
            empresa: d.company_name,
            ticker: d.ticker,
            rix: d.rix_score,
            ai: d.model_name
          }));
        }
      }

      // === IBEX 35 RANKINGS ===
      // Top 5 IBEX 35
      const { data: topIbex } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("ibex_family_code", "IBEX-35")
        .order("rix_score", { ascending: false })
        .limit(5);

      // Bottom 5 IBEX 35
      const { data: bottomIbex } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("ibex_family_code", "IBEX-35")
        .order("rix_score", { ascending: true })
        .limit(5);

      // === NON-IBEX RANKINGS ===
      // Top 5 traded companies (excluding IBEX 35)
      const { data: topTraded } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, is_traded, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("is_traded", true)
        .neq("ibex_family_code", "IBEX-35")
        .order("rix_score", { ascending: false })
        .limit(5);

      // Top 5 untraded companies
      const { data: topUntraded } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, is_traded")
        .eq("batch_week", latestWeek)
        .eq("is_traded", false)
        .order("rix_score", { ascending: false })
        .limit(5);

      // Top 5 overall (excluding IBEX 35)
      const { data: topOverall } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .neq("ibex_family_code", "IBEX-35")
        .order("rix_score", { ascending: false })
        .limit(5);

      // Bottom 5 overall (excluding IBEX 35)
      const { data: bottomOverall } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .neq("ibex_family_code", "IBEX-35")
        .order("rix_score", { ascending: true })
        .limit(5);

      // Top Movers UP and DOWN (if previous week exists)
      let topMoversUp: TopCompany[] = [];
      let topMoversDown: TopCompany[] = [];
      let ibexMoversUp: TopCompany[] = [];
      let ibexMoversDown: TopCompany[] = [];

      if (previousWeek) {
        // Get current week data
        const { data: currentData } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name, ibex_family_code")
          .eq("batch_week", latestWeek);

        // Get previous week data
        const { data: previousData } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name, ibex_family_code")
          .eq("batch_week", previousWeek);

        if (currentData && previousData) {
          // 1. Calculate raw changes per ticker+model
          const rawChanges = currentData
            .map(curr => {
              const prev = previousData.find(
                p => p.ticker === curr.ticker && p.model_name === curr.model_name
              );
              if (!prev) return null;
              return {
                ticker: curr.ticker,
                empresa: curr.company_name,
                ibex_family_code: curr.ibex_family_code,
                change: curr.rix_score - prev.rix_score,
                currentScore: curr.rix_score
              };
            })
            .filter(Boolean) as { ticker: string; empresa: string; ibex_family_code: string | null; change: number; currentScore: number }[];

          // 2. Aggregate by ticker (average changes across all models)
          const tickerMap = new Map<string, { ticker: string; empresa: string; ibex_family_code: string | null; changes: number[]; scores: number[] }>();
          rawChanges.forEach(item => {
            if (!tickerMap.has(item.ticker)) {
              tickerMap.set(item.ticker, {
                ticker: item.ticker,
                empresa: item.empresa,
                ibex_family_code: item.ibex_family_code,
                changes: [],
                scores: []
              });
            }
            tickerMap.get(item.ticker)!.changes.push(item.change);
            tickerMap.get(item.ticker)!.scores.push(item.currentScore);
          });

          // 3. Calculate averages and create final list
          const aggregatedChanges = Array.from(tickerMap.values()).map(item => ({
            empresa: item.empresa,
            ticker: item.ticker,
            rix: Math.round(item.scores.reduce((a, b) => a + b, 0) / item.scores.length),
            ai: "Promedio",
            ibex_family_code: item.ibex_family_code,
            change: item.changes.reduce((a, b) => a + b, 0) / item.changes.length
          }));

          // 4. Separate IBEX and non-IBEX, sort by change
          const ibexAggregated = aggregatedChanges.filter(c => c.ibex_family_code === "IBEX-35");
          ibexMoversUp = [...ibexAggregated].sort((a, b) => b.change - a.change).slice(0, 5);
          ibexMoversDown = [...ibexAggregated].sort((a, b) => a.change - b.change).slice(0, 5);

          const nonIbexAggregated = aggregatedChanges.filter(c => c.ibex_family_code !== "IBEX-35");
          topMoversUp = [...nonIbexAggregated].sort((a, b) => b.change - a.change).slice(0, 5);
          topMoversDown = [...nonIbexAggregated].sort((a, b) => a.change - b.change).slice(0, 5);
        }
      }

      return {
        latestWeek,
        topByAI,
        // IBEX 35 section
        topIbex: topIbex?.map(d => ({
          empresa: d.company_name,
          ticker: d.ticker,
          rix: d.rix_score,
          ai: d.model_name
        })) || [],
        bottomIbex: bottomIbex?.map(d => ({
          empresa: d.company_name,
          ticker: d.ticker,
          rix: d.rix_score,
          ai: d.model_name
        })) || [],
        ibexMoversUp,
        ibexMoversDown,
        // Non-IBEX section
        topTraded: topTraded?.map(d => ({
          empresa: d.company_name,
          ticker: d.ticker,
          rix: d.rix_score,
          ai: d.model_name
        })) || [],
        topUntraded: topUntraded?.map(d => ({
          empresa: d.company_name,
          ticker: d.ticker,
          rix: d.rix_score,
          ai: d.model_name
        })) || [],
        topOverall: topOverall?.map(d => ({
          empresa: d.company_name,
          ticker: d.ticker,
          rix: d.rix_score,
          ai: d.model_name
        })) || [],
        bottomOverall: bottomOverall?.map(d => ({
          empresa: d.company_name,
          ticker: d.ticker,
          rix: d.rix_score,
          ai: d.model_name
        })) || [],
        topMoversUp,
        topMoversDown
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: true
  });
}
