import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * useRixUniverse — Source of truth for the "currently covered" RIX universe.
 *
 * Returns the canonical company names that appear in the latest weekly
 * snapshot of rix_runs_v2 with at least 4 of the 6 AI models present.
 * This is the same universe powering the public ranking.
 *
 * Used by suggestion modules (ChatQueryGuide, useSmartSuggestions) to
 * guarantee that every company name shown to the user as a suggestion
 * actually has data behind it. Anything not in this set is dropped to
 * prevent empty/hallucinated responses.
 */

const MIN_MODELS_REQUIRED = 4;
const SNAPSHOT_LOOKBACK_DAYS = 8;

interface UniverseRow {
  "03_target_name": string | null;
  "05_ticker": string | null;
  "02_model_name": string | null;
}

export interface RixUniverseEntry {
  name: string;
  ticker: string;
}

export interface RixUniverse {
  /** Canonical names, lowercased for matching. */
  nameSet: Set<string>;
  /** Canonical names, original casing. */
  names: string[];
  /** Full entries with ticker. */
  entries: RixUniverseEntry[];
  /** Latest batch_execution_date covered. */
  latestDate: string | null;
}

const EMPTY_UNIVERSE: RixUniverse = {
  nameSet: new Set(),
  names: [],
  entries: [],
  latestDate: null,
};

export function useRixUniverse() {
  return useQuery<RixUniverse>({
    queryKey: ["rix-universe-vigente"],
    staleTime: 10 * 60 * 1000, // 10 min — universe only changes weekly
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      // 1. Find latest batch_execution_date.
      const { data: latest, error: e1 } = await supabase
        .from("rix_runs_v2")
        .select("batch_execution_date")
        .order("batch_execution_date", { ascending: false })
        .limit(1);
      if (e1 || !latest?.[0]?.batch_execution_date) return EMPTY_UNIVERSE;

      const latestDate = new Date(latest[0].batch_execution_date);
      const sinceDate = new Date(latestDate);
      sinceDate.setUTCDate(sinceDate.getUTCDate() - SNAPSHOT_LOOKBACK_DAYS);

      // 2. Fetch rows in the snapshot window.
      const { data, error } = await supabase
        .from("rix_runs_v2")
        .select("03_target_name,05_ticker,02_model_name")
        .gte("batch_execution_date", sinceDate.toISOString())
        .limit(10000);

      if (error || !data) return EMPTY_UNIVERSE;

      // 3. Group by name → count distinct models. Keep ones with >= MIN_MODELS_REQUIRED.
      const byName = new Map<string, { ticker: string; models: Set<string> }>();
      for (const row of data as UniverseRow[]) {
        const name = row["03_target_name"]?.trim();
        const ticker = row["05_ticker"]?.trim() ?? "";
        const model = row["02_model_name"]?.trim();
        if (!name || !model) continue;
        if (!byName.has(name)) byName.set(name, { ticker, models: new Set() });
        byName.get(name)!.models.add(model);
      }

      const entries: RixUniverseEntry[] = [];
      for (const [name, info] of byName) {
        if (info.models.size >= MIN_MODELS_REQUIRED) {
          entries.push({ name, ticker: info.ticker });
        }
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));

      return {
        entries,
        names: entries.map((e) => e.name),
        nameSet: new Set(entries.map((e) => e.name.toLowerCase())),
        latestDate: latest[0].batch_execution_date as string,
      };
    },
  });
}
