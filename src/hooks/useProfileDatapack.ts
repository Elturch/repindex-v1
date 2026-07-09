import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileEntity {
  ticker: string;
  name: string;
  sector: string | null;
  subsector: string | null;
  ibex_family_category: string | null;
}

export interface ProfileSnapshot {
  rixc: number;
  rixc_prev: number | null;
  rixc_first: number | null;
  rixc_last: number | null;
  rix_min: number;
  rix_max: number;
  num_citas: number | null;
  nvm: number | null;
  drm: number | null;
  sim: number | null;
  rmm: number | null;
  cem: number | null;
  gam: number | null;
  dcm: number | null;
  cxm: number | null;
}

export interface ProfileSector {
  name: string | null;
  size: number;
  rank: number;
  avg_rixc: number | null;
  avg_nvm: number | null;
  avg_drm: number | null;
  avg_sim: number | null;
  avg_rmm: number | null;
  avg_cem: number | null;
  avg_gam: number | null;
  avg_dcm: number | null;
  avg_cxm: number | null;
}

export interface ProfilePerModelRow {
  model: string;
  rix: number;
}

export interface ProfileEvolutionRow {
  week: string;
  rixc: number;
}

export interface ProfileCitationItem {
  url: string;
  domain: string;
  models_count: number;
  models: string[];
}

export interface ProfileCitations {
  total_sources: number;
  items: ProfileCitationItem[];
}

export interface ProfileDatapack {
  latest_week: string;
  prev_week: string;
  mode: "snapshot" | "period";
  period_from: string;
  period_to: string;
  weeks_count: number;
  entity: ProfileEntity;
  snapshot: ProfileSnapshot;
  sector: ProfileSector;
  permodel: ProfilePerModelRow[];
  evolution: ProfileEvolutionRow[];
  citations: ProfileCitations;
}

export function useProfileDatapack(ticker: string, from?: string | null, to?: string | null) {
  const t = (ticker ?? "").trim();
  const fromKey = from ?? null;
  const toKey = to ?? null;
  return useQuery<ProfileDatapack>({
    queryKey: ["rix_profile_datapack", t, fromKey, toKey],
    enabled: t.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("rix_profile_datapack", {
        p_ticker: t,
        p_from: fromKey,
        p_to: toKey,
      });
      if (error) throw error;
      return data as ProfileDatapack;
    },
  });
}