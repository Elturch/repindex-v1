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
      // Get latest and previous batch weeks
      const { data: latestBatches } = await supabase
        .from("rix_trends")
        .select("batch_week")
        .order("batch_week", { ascending: false })
        .limit(2);

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

      // Top 5 traded companies
      const { data: topTraded } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name, is_traded")
        .eq("batch_week", latestWeek)
        .eq("is_traded", true)
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

      // Top 5 overall
      const { data: topOverall } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name")
        .eq("batch_week", latestWeek)
        .order("rix_score", { ascending: false })
        .limit(5);

      // Bottom 5 overall
      const { data: bottomOverall } = await supabase
        .from("rix_trends")
        .select("company_name, ticker, rix_score, model_name")
        .eq("batch_week", latestWeek)
        .order("rix_score", { ascending: true })
        .limit(5);

      // Top Movers UP and DOWN (if previous week exists)
      let topMoversUp: TopCompany[] = [];
      let topMoversDown: TopCompany[] = [];

      if (previousWeek) {
        // Get current week data
        const { data: currentData } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name")
          .eq("batch_week", latestWeek);

        // Get previous week data
        const { data: previousData } = await supabase
          .from("rix_trends")
          .select("company_name, ticker, rix_score, model_name")
          .eq("batch_week", previousWeek);

        if (currentData && previousData) {
          // Calculate changes
          const changes = currentData
            .map(curr => {
              const prev = previousData.find(
                p => p.ticker === curr.ticker && p.model_name === curr.model_name
              );
              if (!prev) return null;
              
              return {
                empresa: curr.company_name,
                ticker: curr.ticker,
                rix: curr.rix_score,
                ai: curr.model_name,
                change: curr.rix_score - prev.rix_score
              };
            })
            .filter(Boolean) as (TopCompany & { change: number })[];

          // Top 5 movers up
          topMoversUp = changes
            .sort((a, b) => b.change - a.change)
            .slice(0, 5);

          // Top 5 movers down
          topMoversDown = changes
            .sort((a, b) => a.change - b.change)
            .slice(0, 5);
        }
      }

      return {
        latestWeek,
        topByAI,
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
