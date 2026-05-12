// Stress matrix runner — Fase 1 SQL bit-by-bit validator.
// Re-queries rix_runs_v2 by exact tuple (ticker, model, batch_execution_date)
// for N=5 random rows from the scoped dataset and asserts field-level equality
// on RIX/sub-metric columns. Persisted into stress_results.scope_validation.

const NUMERIC_FIELDS: string[] = [
  "09_rix_score",
  "51_rix_score_adjusted",
  "23_nvm_score",
  "26_drm_score",
  "29_sim_score",
  "32_rmm_score",
  "35_cem_score",
  "38_gam_score",
  "41_dcm_score",
  "44_cxm_score",
];

const SAMPLE_FIELDS = `05_ticker,02_model_name,batch_execution_date,${NUMERIC_FIELDS.join(",")}`;

function isoDay(d: any): string {
  return new Date(d).toISOString().slice(0, 10);
}

function eqNum(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  const na = typeof a === "number" ? a : parseFloat(String(a));
  const nb = typeof b === "number" ? b : parseFloat(String(b));
  if (!Number.isFinite(na) && !Number.isFinite(nb)) return true;
  return Math.abs(na - nb) < 1e-9;
}

export interface ScopeValidationDiff {
  ticker: string;
  model: string;
  week: string;
  field: string;
  expected: unknown;
  got: unknown;
}

export interface ScopeValidationReport {
  ok: boolean;
  sampled: number;
  rechecked: number;
  diffs: ScopeValidationDiff[];
  reason?: string;
}

export async function validateScopeIntegrity(
  supabase: any,
  scope: { tickers: string[]; models: string[]; window: { from: string; to: string } } | null,
  sampleN = 5,
): Promise<ScopeValidationReport> {
  if (!scope || !Array.isArray(scope.tickers) || !Array.isArray(scope.models) || !scope.window) {
    return { ok: false, sampled: 0, rechecked: 0, diffs: [], reason: "scope_contract ausente o invalido" };
  }
  // 1) Pull dataset entregado al LLM (mismos filtros que runScopedQuery).
  const { data: dataset, error: derr } = await supabase
    .from("rix_runs_v2")
    .select(SAMPLE_FIELDS)
    .in("05_ticker", scope.tickers)
    .in("02_model_name", scope.models)
    .gte("batch_execution_date", scope.window.from)
    .lte("batch_execution_date", scope.window.to)
    .limit(2000);
  if (derr) {
    return { ok: false, sampled: 0, rechecked: 0, diffs: [], reason: `dataset query failed: ${derr.message}` };
  }
  const rows = (dataset ?? []) as any[];
  if (rows.length === 0) {
    return { ok: true, sampled: 0, rechecked: 0, diffs: [], reason: "dataset vacio (sin filas que validar)" };
  }
  // 2) Sample N=5 random rows.
  const shuffled = rows.slice().sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, Math.min(sampleN, shuffled.length));
  const diffs: ScopeValidationDiff[] = [];
  let rechecked = 0;
  // 3) Re-query each by exact tuple and compare.
  for (const row of sample) {
    const ticker = String(row["05_ticker"] ?? "").toUpperCase();
    const model = String(row["02_model_name"] ?? "");
    const weekIso = isoDay(row.batch_execution_date);
    const { data: refData, error: rerr } = await supabase
      .from("rix_runs_v2")
      .select(SAMPLE_FIELDS)
      .eq("05_ticker", ticker)
      .eq("02_model_name", model)
      .gte("batch_execution_date", weekIso)
      .lt("batch_execution_date", new Date(new Date(weekIso).getTime() + 86400000).toISOString().slice(0, 10))
      .limit(1)
      .maybeSingle();
    if (rerr) {
      diffs.push({ ticker, model, week: weekIso, field: "__lookup__", expected: "row", got: rerr.message });
      continue;
    }
    if (!refData) {
      diffs.push({ ticker, model, week: weekIso, field: "__lookup__", expected: "row", got: null });
      continue;
    }
    rechecked++;
    for (const f of NUMERIC_FIELDS) {
      if (!eqNum((row as any)[f], (refData as any)[f])) {
        diffs.push({ ticker, model, week: weekIso, field: f, expected: (refData as any)[f], got: (row as any)[f] });
      }
    }
  }
  return { ok: diffs.length === 0, sampled: sample.length, rechecked, diffs };
}
