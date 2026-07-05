import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProfileDatapack } from "@/hooks/useProfileDatapack";
import type { ComparisonDatapack } from "@/hooks/useComparisonDatapack";

export type DeterministicKind = "profile" | "comparison";

export interface ReportExportPayload {
  kind: DeterministicKind;
  datapack: ProfileDatapack | ComparisonDatapack;
}

interface ReportExportContextValue {
  payload: ReportExportPayload | null;
  analysisMarkdown: string | null;
  setPayload: (p: ReportExportPayload | null) => void;
  setAnalysisMarkdown: (md: string | null) => void;
}

const Ctx = createContext<ReportExportContextValue | null>(null);

export function ReportExportProvider({ children }: { children: ReactNode }) {
  const [payload, setPayloadState] = useState<ReportExportPayload | null>(null);
  const [analysisMarkdown, setAnalysisMarkdownState] = useState<string | null>(null);

  // Use refs to compare, avoiding pointless re-renders when the same value
  // is written repeatedly by a child on every render.
  const payloadRef = useRef<ReportExportPayload | null>(null);
  const analysisRef = useRef<string | null>(null);

  const setPayload = useCallback((p: ReportExportPayload | null) => {
    if (p === payloadRef.current) return;
    payloadRef.current = p;
    setPayloadState(p);
  }, []);

  const setAnalysisMarkdown = useCallback((md: string | null) => {
    if (md === analysisRef.current) return;
    analysisRef.current = md;
    setAnalysisMarkdownState(md);
  }, []);

  const value = useMemo(
    () => ({ payload, analysisMarkdown, setPayload, setAnalysisMarkdown }),
    [payload, analysisMarkdown, setPayload, setAnalysisMarkdown],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReportExport(): ReportExportContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Safe no-op fallback when a report component is rendered outside the
    // provider (e.g. in isolated tests or storybook). Nothing publishes.
    return {
      payload: null,
      analysisMarkdown: null,
      setPayload: () => undefined,
      setAnalysisMarkdown: () => undefined,
    };
  }
  return v;
}