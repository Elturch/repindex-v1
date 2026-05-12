// chat-intelligence-v2 / data / scopedQuery.ts
// Fase 1 — Acceso unico a `rix_runs_v2` desde el agente.
// Cualquier otra ruta de lectura queda PROHIBIDA. Las skills deben pasar
// por aqui. Si llega algo que no es un ScopeContract valido, se lanza.
// Aplica SIEMPRE los tres filtros del contrato:
//   - "05_ticker"             = ANY(scope.tickers)
//   - "02_model_name"         = ANY(scope.models)
//   - batch_execution_date    BETWEEN scope.window.from AND scope.window.to
// Devuelve un coverage_report con estructura fija (ver tipo).

import { isScopeContract, type ScopeContract } from "../scope/scopeContract.ts";

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export interface CoverageReport {
  tickers_requested: string[];
  tickers_returned: string[];
  models_requested: string[];
  models_returned: string[];
  weeks_requested: string[];   // best-effort: semanas observadas; dataset puede tener huecos.
  weeks_returned: string[];
  missing_cells: Array<{ ticker: string; model: string; week: string }>;
}

export interface ScopedQueryResult<T = Record<string, unknown>> {
  rows: T[];
  coverage_report: CoverageReport;
  scope: ScopeContract;
}

export interface ScopedQueryOptions {
  /** Columnas a seleccionar de rix_runs_v2. Si se omite usa el default minimo. */
  columns?: string;
}

const DEFAULT_COLUMNS =
  '"05_ticker","03_target_name","02_model_name","09_rix_score","51_rix_score_adjusted",' +
  '"23_nvm_score","26_drm_score","29_sim_score","32_rmm_score","35_cem_score",' +
  '"38_gam_score","41_dcm_score","44_cxm_score","48_precio_accion",batch_execution_date';

function isoDay(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

export class ScopedQueryError extends Error {
  details: Record<string, unknown>;
  constructor(msg: string, details: Record<string, unknown> = {}) {
    super(msg);
    this.name = "ScopedQueryError";
    this.details = details;
  }
}

/**
 * Unica via de acceso a rix_runs_v2 desde el agente. Aborta si el scope no
 * es un ScopeContract congelado. Pagina hasta MAX_PAGES * PAGE_SIZE filas.
 */
export async function runScopedQuery<T = Record<string, unknown>>(
  scope: unknown,
  supabase: any,
  opts: ScopedQueryOptions = {},
): Promise<ScopedQueryResult<T>> {
  if (!isScopeContract(scope)) {
    throw new ScopedQueryError(
      "scopedQuery exige un ScopeContract construido por buildScopeContract.",
      { received: typeof scope },
    );
  }
  const c = scope as ScopeContract;
  if (!c.tickers.length || !c.models.length) {
    throw new ScopedQueryError("ScopeContract sin tickers o sin modelos.", {
      tickers: c.tickers.length,
      models: c.models.length,
    });
  }

  const tickers = c.tickers.slice() as string[];
  const models = c.models.slice() as string[];
  const fromIso = c.window.from;
  const toIso = c.window.to;

  const columns = opts.columns ?? DEFAULT_COLUMNS;

  const allRows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const fromIdx = page * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(columns)
      .in("05_ticker", tickers)
      .in("02_model_name", models)
      .gte("batch_execution_date", fromIso)
      .lte("batch_execution_date", toIso)
      .range(fromIdx, toIdx);
    if (error) {
      throw new ScopedQueryError("Fallo leyendo rix_runs_v2", { error: error.message, page });
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }

  // Coverage report
  const tickersReturnedSet = new Set<string>();
  const modelsReturnedSet = new Set<string>();
  const weeksReturnedSet = new Set<string>();
  const cellSet = new Set<string>(); // ticker|model|week

  for (const row of allRows as any[]) {
    const t = String(row["05_ticker"] ?? "").toUpperCase();
    const m = String(row["02_model_name"] ?? "");
    const wRaw = row.batch_execution_date;
    if (!t || !m || !wRaw) continue;
    const w = isoDay(wRaw);
    tickersReturnedSet.add(t);
    modelsReturnedSet.add(m);
    weeksReturnedSet.add(w);
    cellSet.add(`${t}|${m}|${w}`);
  }

  const weeksReturned = Array.from(weeksReturnedSet).sort();
  // weeks_requested = mismas weeks observadas (no inventamos calendario);
  // si no hay ninguna, queda vacio y los asserts lo flaggean.
  const weeksRequested = weeksReturned.slice();

  const missing_cells: Array<{ ticker: string; model: string; week: string }> = [];
  for (const t of tickers) {
    for (const m of models) {
      for (const w of weeksRequested) {
        if (!cellSet.has(`${t}|${m}|${w}`)) {
          missing_cells.push({ ticker: t, model: m, week: w });
        }
      }
    }
  }

  const coverage_report: CoverageReport = {
    tickers_requested: tickers,
    tickers_returned: Array.from(tickersReturnedSet).sort(),
    models_requested: models,
    models_returned: Array.from(modelsReturnedSet).sort(),
    weeks_requested: weeksRequested,
    weeks_returned: weeksReturned,
    missing_cells,
  };

  return { rows: allRows, coverage_report, scope: c };
}
