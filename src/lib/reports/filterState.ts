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

export type AxisMetric = "RIX" | "NVM" | "DRM" | "SIM" | "RMM" | "CEM" | "GAM" | "DCM" | "CXM";

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
  | "axisMetrics"
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

/**
 * Mapeo UI -> nombres canónicos almacenados en rix_runs_v2."02_model_name".
 * La BD guarda "Google Gemini" y "Deepseek" mientras la UI muestra labels limpias.
 */
export const MODEL_DB_NAMES: Record<ModelName, string> = {
  ChatGPT: "ChatGPT",
  Perplexity: "Perplexity",
  Gemini: "Google Gemini",
  DeepSeek: "Deepseek",
  Grok: "Grok",
  Qwen: "Qwen",
};

export function toDbModelNames(models: ModelName[]): string[] {
  return models.map((m) => MODEL_DB_NAMES[m] ?? m);
}

export const ALL_METRICS: AxisMetric[] = [
  "RIX",
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
  const todayIso = todayISO();
  return {
    preset: "last_month",
    from: subDaysISO(todayIso, 29),
    to: todayIso,
  };
}

/** Suelo histórico: no hay datos antes de esta fecha. */
export const DATA_FLOOR = "2026-01-01";

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
    axisMetrics: free<AxisMetric[]>(["RIX"]),
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

/**
 * UTC-safe helpers operating on `YYYY-MM-DD` strings. The previous
 * implementation used `new Date('YYYY-MM-DDT00:00:00')` (local time) +
 * `toISOString().slice(0,10)` (UTC), which silently subtracted 1 day in
 * any timezone east of UTC (e.g. CEST). That made the report window end
 * the day before the actual last sweep, excluding the newest data.
 */
function parseIsoUTC(iso: string): Date {
  // `YYYY-MM-DD` parses as UTC midnight by spec — explicit for clarity.
  return new Date(`${iso}T00:00:00Z`);
}
function isoFromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function todayISO(): string {
  return isoFromUTC(new Date());
}
export function subDaysISO(iso: string, n: number): string {
  const d = parseIsoUTC(iso);
  d.setUTCDate(d.getUTCDate() - n);
  return isoFromUTC(d);
}
export function startOfYearISO(iso: string): string {
  const d = parseIsoUTC(iso);
  return `${d.getUTCFullYear()}-01-01`;
}

/**
 * Re-ancla una ventana temporal con preset relativo al último barrido
 * canónico disponible (`lastBatchDate`, YYYY-MM-DD). Si el preset es
 * `custom`, devuelve la ventana sin cambios — las fechas explícitas del
 * usuario nunca se sobrescriben.
 */
export function reanchorWindow(
  window: TimeWindow,
  lastBatchDate: string,
): TimeWindow {
  if (window.preset === "custom") return window;
  let from = lastBatchDate;
  if (window.preset === "last_week") from = subDaysISO(lastBatchDate, 6);
  else if (window.preset === "last_month") from = subDaysISO(lastBatchDate, 29);
  else if (window.preset === "last_quarter") from = subDaysISO(lastBatchDate, 89);
  else if (window.preset === "ytd") from = startOfYearISO(lastBatchDate);
  return { preset: window.preset, from, to: lastBatchDate };
}

/** ¿La ventana actual está desfasada respecto al último barrido? */
export function windowNeedsReanchor(
  window: TimeWindow,
  lastBatchDate: string | null | undefined,
): boolean {
  if (!lastBatchDate) return false;
  if (window.preset === "custom") return false;
  return window.to !== lastBatchDate;
}