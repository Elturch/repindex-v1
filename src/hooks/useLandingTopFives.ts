import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AIModelOption } from "@/contexts/LandingAIModelContext";

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

export function useLandingTopFives(selectedModel: AIModelOption = "ChatGPT") {
  return useQuery({
    queryKey: ["landing-top-fives", selectedModel],
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

      // Top 5 by each AI model (kept for backwards compatibility)
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

      // === FILTERED BY SELECTED MODEL ===
      
      // Top 5 IBEX 35 (filtered by model)
      const { data: topIbex } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: false })
        .limit(5);

      // Bottom 5 IBEX 35 (filtered by model)
      const { data: bottomIbex } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: true })
        .limit(5);

      // Top 5 traded companies (excluding IBEX 35, filtered by model)
      const { data: topTraded } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, is_traded, ibex_family_code")
        .eq("batch_week", latestWeek)
        .eq("is_traded", true)
        .neq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: false })
        .limit(5);

      // Top 5 untraded companies (filtered by model)
      const { data: topUntraded } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, is_traded")
        .eq("batch_week", latestWeek)
        .eq("is_traded", false)
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: false })
        .limit(5);

      // Top 5 overall (excluding IBEX 35, filtered by model)
      const { data: topOverall } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .neq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: false })
        .limit(5);

      // Bottom 5 overall (excluding IBEX 35, filtered by model)
      const { data: bottomOverall } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, ibex_family_code")
        .eq("batch_week", latestWeek)
        .neq("ibex_family_code", "IBEX-35")
        .eq("model_name", selectedModel)
        .order("rix_score", { ascending: true })
        .limit(5);

      // Top Movers UP and DOWN (filtered by selected model)
      let topMoversUp: TopCompany[] = [];
      let topMoversDown: TopCompany[] = [];
      let ibexMoversUp: TopCompany[] = [];
      let ibexMoversDown: TopCompany[] = [];

      if (previousWeek) {
        // Get current week data for selected model
        const { data: currentData } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name, ibex_family_code")
          .eq("batch_week", latestWeek)
          .eq("model_name", selectedModel);

        // Get previous week data for selected model
        const { data: previousData } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name, ibex_family_code")
          .eq("batch_week", previousWeek)
          .eq("model_name", selectedModel);

        if (currentData && previousData) {
          // Calculate changes per ticker (single model = no duplicates possible)
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
                change: curr.rix_score - prev.rix_score
              };
            })
            .filter(Boolean) as (TopCompany & { ibex_family_code: string | null; change: number })[];

          // Separate IBEX and non-IBEX
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
