// Single source of truth for the "cobertura parcial" banner.
// Replaces the 4 inline copies in skills/{sectorRanking,comparison,modelDivergence,periodEvolution}.ts
//
// AJUSTE 5(c): semantic discriminator for snapshot vs período is `from === to`.
//   - from === to  → unit = "modelos" (a punctual Sunday snapshot has 6
//                    AI models expected, NOT 6 weeks). Fixes the bug
//                    "17% de 6 semanas" reported on snapshot puntual.
//   - from <  to   → unit = "snapshots semanales" (multi-week period).
//
// Honest reporting:
//   - Returns "" when coverage is full (>=0.9 and !is_partial).
//   - Reports X/6 models for snapshots; X/N weeks for periods.
//   - Never claims a percentage of "weeks" for a single Sunday.

export interface CoverageBannerInput {
  from: string;
  to: string;
  coverage_ratio: number;
  is_partial: boolean;
  snapshots_available: number;
  snapshots_expected: number;
}

export function buildCoverageBanner(t: CoverageBannerInput): string {
  if (!t.is_partial && (t.coverage_ratio ?? 1) >= 0.9) return "";
  const isSnapshot = t.from === t.to;
  if (isSnapshot) {
    return [
      "IMPORTANTE — COBERTURA PARCIAL DEL SNAPSHOT (PRIORIDAD MÁXIMA):",
      `• Snapshot del ${t.from}: ${t.snapshots_available}/${t.snapshots_expected} modelos respondieron.`,
      "• ABRE el informe declarando esta cobertura parcial de modelos en el primer párrafo.",
      `• PROHIBIDO afirmar consenso completo: solo ${t.snapshots_available} de ${t.snapshots_expected} IAs aportan dato en este snapshot.`,
    ].join("\n");
  }
  const pct = Math.round((t.coverage_ratio ?? 0) * 100);
  return [
    "IMPORTANTE — COBERTURA PARCIAL (PRIORIDAD MÁXIMA):",
    `• El período solicitado (${t.from} → ${t.to}) cuenta con ${t.snapshots_available}/${t.snapshots_expected} snapshots semanales (~${pct}% del período pedido).`,
    "• ABRE el informe declarando esta cobertura parcial en el primer párrafo.",
    "• PROHIBIDO extrapolar tendencias a las semanas no cubiertas.",
  ].join("\n");
}

// Re-export under the legacy parameter shape for in-place call-site swap.
export const __test__ = { buildCoverageBanner };

/**
 * C — Fallback COUNT(*) probe. Before any skill returns "Sin datos…"
 * we ask rix_runs_v2 how many rows actually exist for the window and
 * (optional) ticker / sector. If count > 0 the skill almost certainly
 * dropped rows during scope/intent resolution → we surface that to
 * the operator log AND embed the figure in the user-facing fallback
 * so the answer is honest ("hay N filas crudas pero ninguna casa con
 * el alcance pedido"). Returns -1 on probe error.
 */
export interface ProbeFilters {
  fromISO: string; // YYYY-MM-DD inclusive
  toISO: string;   // YYYY-MM-DD inclusive
  ticker?: string | null;
  tickers?: string[] | null;
}

export async function probeRowsCount(supabase: any, f: ProbeFilters): Promise<number> {
  try {
    let q = supabase
      .from("rix_runs_v2")
      .select("05_ticker", { count: "exact", head: true })
      .gte("07_period_to", `${f.fromISO}T00:00:00Z`)
      .lte("07_period_to", `${f.toISO}T23:59:59Z`);
    if (f.ticker) q = q.eq("05_ticker", f.ticker);
    if (f.tickers && f.tickers.length) q = q.in("05_ticker", f.tickers);
    const { count, error } = await q;
    if (error) return -1;
    return typeof count === "number" ? count : 0;
  } catch (_e) {
    return -1;
  }
}
