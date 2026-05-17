// SYNC WITH: src/lib/skills/sundayResolver.ts — drift entre estas dos
// implementaciones = bug. Si modificas una, modifica la otra y actualiza
// los tests del Diff 5 (supabase/functions/_shared/sundayResolver_test.ts
// y src/lib/skills/__tests__/sundayResolver.test.ts).

const MIN_ROWS_PER_SWEEP = 180;          // 30 issuers × 6 models floor
const SWEEP_HOUR_UTC = 9;                // 11:00 CEST = 09:00 UTC — sólo hint para el label

export interface ResolvedSunday {
  sundayISO: string;
  sweepInProgress: boolean;
  rowsAvailable: number;
  source: "db_max" | "fallback_calendar";
}

/**
 * Pure, DB-less calendar logic. Devuelve SIEMPRE el último domingo de
 * calendario (incluyendo hoy si hoy es domingo). El flag
 * `sweepInProgress` es sólo una pista por reloj — la decisión real de
 * si el barrido está cerrado se toma empíricamente en
 * `resolveLastClosedSunday` mirando filas reales en BD.
 */
export function computeLastClosedSundayPure(now: Date): { sundayISO: string; sweepInProgress: boolean } {
  const dow = now.getUTCDay();
  const hourUTC = now.getUTCHours();
  const sweepInProgressHint = dow === 0 && hourUTC < SWEEP_HOUR_UTC;
  const baseDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = dow; // 0 si es domingo → hoy; 1..6 si no
  const sun = new Date(baseDay);
  sun.setUTCDate(sun.getUTCDate() - back);
  return { sundayISO: sun.toISOString().slice(0, 10), sweepInProgress: sweepInProgressHint };
}

/**
 * Decisión empírica: si el domingo de hoy ya tiene ≥180 filas en
 * `rix_runs_v2`, ese es el barrido cerrado, independientemente del reloj.
 * Si no, retrocede al domingo anterior con ≥180. Nunca descarta un
 * barrido cerrado en BD por la hora.
 */
export async function resolveLastClosedSunday(supabase: any, now: Date = new Date()): Promise<ResolvedSunday> {
  const { sundayISO: calendarSunday, sweepInProgress: hint } = computeLastClosedSundayPure(now);
  try {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select("07_period_to")
      .lte("07_period_to", calendarSunday)
      .order("07_period_to", { ascending: false })
      .limit(2000);
    if (!error && Array.isArray(data) && data.length > 0) {
      const counts = new Map<string, number>();
      for (const r of data) {
        const d = String(r["07_period_to"] ?? "").slice(0, 10);
        if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      const sorted = Array.from(counts.entries()).sort((a, b) => b[0].localeCompare(a[0]));
      for (const [day, n] of sorted) {
        if (n >= MIN_ROWS_PER_SWEEP) {
          // Empírico: si el día elegido es el domingo de hoy y tiene
          // ≥180 filas, el barrido está cerrado aunque el reloj sugiera
          // lo contrario.
          const sweepInProgress = day === calendarSunday ? false : hint;
          return { sundayISO: day, sweepInProgress, rowsAvailable: n, source: "db_max" };
        }
      }
    }
  } catch (_e) { /* fall through to calendar fallback */ }
  return { sundayISO: calendarSunday, sweepInProgress: hint, rowsAvailable: 0, source: "fallback_calendar" };
}

export function formatSundayLabel(sundayISO: string, sweepInProgress = false): string {
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const d = new Date(`${sundayISO}T00:00:00Z`);
  const label = `Semana del ${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return sweepInProgress ? `${label} (barrido en curso)` : label;
}