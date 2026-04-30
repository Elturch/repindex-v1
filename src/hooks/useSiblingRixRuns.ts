// FASE 1 — DEPRECATED. Use `useUnifiedSiblingRuns` (V2-only).
import { useQuery } from "@tanstack/react-query";

interface SiblingRixRun {
  id: string;
  model_name: string;
  rix_score: number;
  target_name: string;
  ticker: string;
}

export function useSiblingRixRuns(
  _ticker?: string | null,
  _periodFrom?: string | null,
  _periodTo?: string | null,
  _currentModelName?: string | null
) {
  return useQuery<SiblingRixRun[]>({
    queryKey: ["sibling-rix-runs-DEPRECATED-noop"],
    queryFn: async () => {
      console.warn("[useSiblingRixRuns] DEPRECATED: rix_runs legacy retired. Use useUnifiedSiblingRuns.");
      return [];
    },
    staleTime: Infinity,
  });
}
