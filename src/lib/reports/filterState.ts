/**
 * Informes RIX — Filter state model
 *
 * Each filter has a tri-state value:
 *  - free      → unset, available for derivation
 *  - user-set  → explicitly chosen by the user (highest priority, never auto-overwritten)
 *  - derived   → auto-filled by the coherence engine from another filter
 *
 * The 12 filters (filter 0 = intent + 11 data filters) are bidirectional:
 * descendente (Universo → Sector → Subsector → Empresa) and ascendente
 * (Empresa → infiere Subsector/Sector/Universo).
 */

export type FilterOrigin = "free" | "user-set" | "derived";

export interface FilterValue<T> {
  value: T;
  origin: FilterOrigin;
  /** Origin filter id if this was derived. */
  derivedFrom?: FilterId;
}

export type IntentType =
  | "vision_general"
  | "ranking"
  | "comparativa"
  | "evolucion"
  | "divergencia"
  | "perfil";

export type Universe = "IBEX-35" | "IBEX-MC" | "IBEX-SC" | "BME-GROWTH" | "MC-OTHER" | "ALL";

export type ModelName =
  | "ChatGPT"
  | "Perplexity"
  | "Gemini"
  | "DeepSeek"
  | "Grok"
  | "Qwen";

export type Granularity = "snapshot" | "weekly" | "monthly" | "quarterly";

export type AxisMetric = "RIXc" | "NVM" | "DRM" | "SIM" | "RMM" | "CEM" | "GAM" | "DCM" | "CXM";

export type SortOrder = "desc" | "asc" | "divergence";

export type SourceTier = "all" | "regulatory" | "media" | "owned";

export type FilterId =
  | "intent"
  | "universe"
  | "sector"
  | "subsector"
  | "tickers"
  | "models"
  | "window"
  | "granularity"
  | "axisMetric"
  | "topN"
  | "order"
  | "sourceTier";

export interface TimeWindow {
  preset: "last_week" | "last_month" | "last_quarter" | "ytd" | "custom";
  from: string; // ISO date
  to: string;
}

export interface FilterState {
  intent: FilterValue<IntentType>;
  universe: FilterValue<Universe[]>;
  sector: FilterValue<string[]>;
  subsector: FilterValue<string[]>;
  tickers: FilterValue<string[]>;
  models: FilterValue<ModelName[]>;
  window: FilterValue<TimeWindow>;
  granularity: FilterValue<Granularity>;
  axisMetrics: FilterValue<AxisMetric[]>;
  topN: FilterValue<number>;
  order: FilterValue<SortOrder>;
  sourceTier: FilterValue<SourceTier>;
}

export const ALL_MODELS: ModelName[] = [
  "ChatGPT",
  "Perplexity",
  "Gemini",
  "DeepSeek",
  "Grok",
  "Qwen",
];

export const ALL_METRICS: AxisMetric[] = [
  "RIXc",
  "NVM",
  "DRM",
  "SIM",
  "RMM",
  "CEM",
  "GAM",
  "DCM",
  "CXM",
];

function defaultWindow(): TimeWindow {
  // Default to last 4 weeks ending today
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 28);
  return {
    preset: "last_month",
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function createInitialFilterState(): FilterState {
  const free = <T,>(value: T): FilterValue<T> => ({ value, origin: "free" });
  return {
    intent: free<IntentType>("vision_general"),
    universe: free<Universe[]>([]),
    sector: free<string[]>([]),
    subsector: free<string[]>([]),
    tickers: free<string[]>([]),
    models: free<ModelName[]>([...ALL_MODELS]),
    window: free<TimeWindow>(defaultWindow()),
    granularity: free<Granularity>("weekly"),
    axisMetrics: free<AxisMetric[]>(["RIXc"]),
    topN: free<number>(10),
    order: free<SortOrder>("desc"),
    sourceTier: free<SourceTier>("all"),
  };
}

export function setFilter<K extends FilterId>(
  state: FilterState,
  id: K,
  value: FilterState[K]["value"],
  origin: FilterOrigin = "user-set",
  derivedFrom?: FilterId,
): FilterState {
  return {
    ...state,
    [id]: { value, origin, derivedFrom } as FilterState[K],
  };
}

export function unlockDerived<K extends FilterId>(
  state: FilterState,
  id: K,
  emptyValue: FilterState[K]["value"],
): FilterState {
  return setFilter(state, id, emptyValue, "free");
}