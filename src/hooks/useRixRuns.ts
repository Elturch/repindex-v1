// FASE 1 — DEPRECATED. La tabla `rix_runs` (Make.com legacy, 4 IAs) ha sido
// retirada. Use `useUnifiedRixRuns` en su lugar (ya solo lee rix_runs_v2).
// Este wrapper se mantiene como vía muerta inactiva para no romper imports
// que aún puedan existir en código no eliminado. Devuelve siempre lista
// vacía y nunca consulta la DB.
import { useQuery } from "@tanstack/react-query";

export interface RixRun {
  id: string;
  [key: string]: unknown;
  isDataInvalid?: boolean;
  dataInvalidReason?: string;
  displayRixScore?: number;
  batchNumber?: number;
  batchLabel?: string;
  trend?: 'up' | 'down' | 'stable';
  previousRixScore?: number;
  metricTrends?: Record<string, 'up' | 'down' | 'stable'>;
  repindex_root_issuers?: { ticker?: string; ibex_family_code?: string; sector_category?: string } | null;
}

export function useRixRuns(
  _searchQuery?: string,
  _modelFilter?: string,
  _companyFilter?: string,
  _sectorFilter?: string,
  _ibexFamilyFilter?: string,
  _weeksToLoad: number = 4
) {
  return useQuery<RixRun[]>({
    queryKey: ["rix-runs-DEPRECATED-noop"],
    queryFn: async () => {
      console.warn("[useRixRuns] DEPRECATED: rix_runs legacy retired. Returning []. Use useUnifiedRixRuns.");
      return [];
    },
    staleTime: Infinity,
  });
}
