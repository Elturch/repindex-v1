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
      // Get latest batch week
      const { data: latestBatch } = await supabase
        .from("rix_trends")
        .select("batch_week")
        .order("batch_week", { ascending: false })
        .limit(1)
        .single();

      if (!latestBatch) throw new Error("No data available");

      const latestWeek = latestBatch.batch_week;

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

      // Top 5 with obsolete data (companies with "datos_antiguos" flag)
      const { data: runsWithFlags } = await supabase
        .from("rix_runs")
        .select("03_target_name, 05_ticker, 09_rix_score, 02_model_name, 17_flags")
        .eq("batch_execution_date", latestWeek)
        .not("17_flags", "is", null)
        .order("09_rix_score", { ascending: false })
        .limit(20);

      const topObsolete = runsWithFlags
        ?.filter(run => {
          const flags = run["17_flags"] as string[] | null;
          return flags && flags.includes("datos_antiguos");
        })
        .slice(0, 5)
        .map(run => ({
          empresa: run["03_target_name"] || "",
          ticker: run["05_ticker"] || "",
          rix: run["09_rix_score"] || 0,
          ai: run["02_model_name"] || ""
        })) || [];

      return {
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
        topObsolete
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: true
  });
}
