import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AnalysisType = "profile" | "comparison";

function cacheKey(type: AnalysisType, tickers: string[], week: string) {
  const sorted = [...tickers].sort().join("-");
  return `repindex.analysis.${type}.${sorted}.${week}`;
}

export function useReportAnalysis(
  type: AnalysisType,
  tickers: string[],
  week: string,
) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = week && tickers.length > 0 ? cacheKey(type, tickers, week) : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    setIsError(false);

    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        setAnalysis(cached);
        setIsLoading(false);
        return;
      }
    } catch {
      /* ignore storage errors */
    }

    setAnalysis(null);
    setIsLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "report-analysis",
          { body: { type, tickers } },
        );
        if (cancelled) return;
        if (error) throw error;
        const md: string | undefined = (data as any)?.analysis;
        if (!md) throw new Error("empty analysis");
        try {
          localStorage.setItem(key, md);
        } catch {
          /* ignore quota */
        }
        setAnalysis(md);
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

  return { analysis, isLoading, isError, retry };
}