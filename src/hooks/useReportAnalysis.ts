import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AnalysisJson } from "@/components/reports/ExpertAnalysisView";

type AnalysisType = "profile" | "comparison";

function cacheKey(
  type: AnalysisType,
  tickers: string[],
  week: string,
  from?: string | null,
  to?: string | null,
) {
  const sorted = [...tickers].sort().join("-");
  return `repindex.analysis.${type}.${sorted}.${week}.${from ?? "_"}.${to ?? "_"}.v2`;
}

export function useReportAnalysis(
  type: AnalysisType,
  tickers: string[],
  week: string,
  from?: string | null,
  to?: string | null,
) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisJson, setAnalysisJson] = useState<AnalysisJson | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key =
    week && tickers.length > 0 ? cacheKey(type, tickers, week, from, to) : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    setIsError(false);

    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === "object" && "titular" in parsed) {
            setAnalysisJson(parsed as AnalysisJson);
            setAnalysis(null);
          } else {
            setAnalysis(cached);
            setAnalysisJson(null);
          }
        } catch {
          setAnalysis(cached);
          setAnalysisJson(null);
        }
        setIsLoading(false);
        return;
      }
    } catch {
      /* ignore storage errors */
    }

    setAnalysis(null);
    setAnalysisJson(null);
    setIsLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "report-analysis",
          { body: { type, tickers, from: from ?? null, to: to ?? null } },
        );
        if (cancelled) return;
        if (error) throw error;
        const aj: AnalysisJson | undefined = (data as any)?.analysis_json;
        const md: string | undefined = (data as any)?.analysis;
        if (aj && typeof aj === "object") {
          try {
            localStorage.setItem(key, JSON.stringify(aj));
          } catch {
            /* ignore quota */
          }
          setAnalysisJson(aj);
          setAnalysis(null);
        } else if (md) {
          try {
            localStorage.setItem(key, md);
          } catch {
            /* ignore quota */
          }
          setAnalysis(md);
          setAnalysisJson(null);
        } else {
          throw new Error("empty analysis");
        }
        setIsLoading(false);
      } catch (_err) {
        if (cancelled) return;
        setIsError(true);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => {
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    setAttempt((n) => n + 1);
  }, [key]);

  return { analysis, analysisJson, isLoading, isError, retry };
}