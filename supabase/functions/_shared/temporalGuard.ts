/**
 * PHASE 1.14 — Temporal Window Guard (zero-hardcode, live reconciliation).
 *
 * Reconciles the *requested* user window against the *actual* snapshots
 * available in `rix_runs_v2` for a given company (or globally when no
 * ticker is provided). Produces:
 *
 *   - parseTemporalIntent(): structured parse of the user's temporal
 *     phrase, including detection of comparative patterns (YoY / vs /
 *     "frente a" / "compara X con Y"). NO floor is applied here — the
 *     floor is a DB property, not a calendar property.
 *
 *   - reconcileWindow(): SELECT MIN/MAX/COUNT against rix_runs_v2 to
 *     compute the real window for the requested ticker. When ticker is
 *     null, the lookup is global (used for sector / ranking queries).
 *
 *   - buildTemporalDisclaimer(): produces the human-readable notice
 *     injected into the system prompt, ReportInfoBar metadata and
 *     methodology footer. Returns an empty string when ventana_real ==
 *     ventana_teorica AND n_real >= n_expected (no gap to disclose).
 *
 *   - blockIfImpossibleComparison(): when the user requested a YoY /
 *     comparative analysis and one of the two windows has zero real
 *     snapshots, returns a structured block payload so the pipeline
 *     short-circuits with a clarification (no LLM call).
 *
 *   - nextExpectedSundaySnapshot(): pure date arithmetic that returns
 *     the next Sunday >= today() in UTC. Used by the disclaimer to
 *     advertise when the next data point will land.
 *
 * Invariants (Phase 1.14):
 *   1. NO hardcoded dates anywhere in this file. `today` is always
 *      `new Date()` and the floor is whatever `MIN(batch_execution_date)`
 *      returns from the DB at call time.
 *   2. Per-company `first_available_snapshot` (companies onboarded late
 *      have their own floor — disclaimer reflects that).
 *   3. As soon as a backfill widens the window, the disclaimer
 *      automatically disappears with no code change.
 *
 * Tests live in `chat-intelligence/__tests__/phase114.test.ts`.
 */

// ── Types ──────────────────────────────────────────────────────────
export interface TheoreticalWindow {
  /** ISO date YYYY-MM-DD, inclusive. */
  start_t: string;
  /** ISO date YYYY-MM-DD, inclusive. */
  end_t: string;
  /** Human label, e.g. "Q1 de 2026", "YTD", "últimos 30 días". */
  label: string;
  /** Granularity hint used to pick `expected_n` (weekly = Sundays in [start_t,end_t]). */
  granularity: "weekly" | "monthly" | "ytd" | "rolling_days" | "year" | "open_ended";
  /** Raw kind tag for downstream logic. */
  kind: string;
}

export interface ParsedTemporalIntent {
  /** Primary requested window (always present when something temporal was detected). */
  primary: TheoreticalWindow | null;
  /** Second window when the user asked for a comparative analysis (YoY / vs / etc). */
  secondary: TheoreticalWindow | null;
  /** True when the user explicitly asked for a comparison between two windows. */
  isComparison: boolean;
  /** True when the user used an open-ended marker like "YTD" / "lo que va de año" / "hasta hoy". */
  isOpenEnded: boolean;
  /** True when the primary window starts in the future relative to today. */
  primaryIsFuture: boolean;
}

export interface ReconciledWindow {
  requested: TheoreticalWindow;
  /** First real snapshot date inside the requested window for the given ticker. Null if zero. */
  start_r: string | null;
  /** Last real snapshot date inside the requested window. Null if zero. */
  end_r: string | null;
  /** Distinct snapshot dates inside the window (each Sunday counts once). */
  n_real: number;
  /** Expected weekly Sundays inside the window (after clamping to first_available_snapshot). */
  n_expected: number;
  /** Per-company floor: the earliest snapshot ever recorded for this ticker (null when global). */
  first_available_snapshot: string | null;
  /** Per-company ceiling: the latest snapshot recorded for this ticker. */
  last_available_snapshot: string | null;
  /** Days missing at the start of the requested window (ventana_real.start - ventana_teorica.start). */
  gap_days_start: number;
  /** Days missing at the end of the requested window (ventana_teorica.end - ventana_real.end). */
  gap_days_end: number;
  /** True when the window fits perfectly: n_real == n_expected and no gaps. */
  isComplete: boolean;
}

export interface ImpossibleComparisonBlock {
  blocked: boolean;
  /** "primary" or "secondary" or "both" — which side of the comparison has no data. */
  empty_side: "primary" | "secondary" | "both" | null;
  /** Human message ready to send back to the user (Spanish — pipeline localises if needed). */
  message: string;
}

// ── Pure date helpers (no I/O) ──────────────────────────────────────
function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

export function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function parseISODate(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}

function lastDayOfMonth(year: number, month1: number): number {
  // month1 is 1-12. Date(year, month1, 0) returns last day of previous month → that's the trick.
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function diffDays(a: string, b: string): number {
  const da = parseISODate(a).getTime();
  const db = parseISODate(b).getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * Returns the next Sunday >= `today` (UTC). If `today` already is a
 * Sunday this returns the same date. The caller decides whether the
 * cron has already run for that Sunday.
 */
export function nextExpectedSundaySnapshot(today: Date): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  if (dow !== 0) d.setUTCDate(d.getUTCDate() + (7 - dow));
  return toISODate(d);
}

/** Counts Sundays in inclusive range [from, to]. */
function countSundaysInRange(from: string, to: string): number {
  if (from > to) return 0;
  const start = parseISODate(from);
  const end = parseISODate(to);
  // Advance start to next Sunday inclusive
  const startDow = start.getUTCDay();
  const firstSunday = new Date(start);
  if (startDow !== 0) firstSunday.setUTCDate(firstSunday.getUTCDate() + (7 - startDow));
  if (firstSunday.getTime() > end.getTime()) return 0;
  const days = Math.round((end.getTime() - firstSunday.getTime()) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

// ── Temporal phrase parser ─────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const QUARTER_RE = /\b(primer|segundo|tercer|cuarto|1er|2do|3er|4to|q1|q2|q3|q4)\s*trimestre(?:\s+(?:de\s+)?(\d{4}))?/i;
const QUARTER_SHORT_RE = /\bq([1-4])(?:[\s\-/]+(\d{4}|\d{2}))?\b/i;
const SEMESTER_RE = /\b(primer|segundo|1er|2do)\s*semestre(?:\s+(?:de\s+)?(\d{4}))?/i;
const MONTH_RE = /\b(?:en\s+|mes\s+de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?/i;
const RELATIVE_DAYS_RE = /\b[uú]ltim[oa]s?\s+(\d+)\s+(d[ií]as?|days?)\b/i;
const RELATIVE_WEEKS_RE = /\b[uú]ltim[oa]s?\s+(\d+)\s+(semanas?|weeks?)\b/i;
const RELATIVE_MONTHS_RE = /\b[uú]ltim[oa]s?\s+(\d+)\s+(meses?|months?)\b/i;
const HACE_MONTHS_RE = /\bhace\s+(\d+)\s+meses?\b/i;
const YEAR_RE = /\b(?:en\s+|a[nñ]o\s+)?(20\d{2})\b/;
const YTD_RE = /\b(ytd|lo que va de a[nñ]o|lo que llevamos de(?:\s+\d{4})?|este a[nñ]o(?:\s+hasta\s+hoy)?|year\s+to\s+date|hasta\s+hoy)\b/i;
const COMPARISON_RE = /\b(vs\.?|versus|frente a|compara(?:r|ndo)?|comparativa|interanual|year[\s\-]?over[\s\-]?year|yoy|a[nñ]o anterior|mismo per[ií]odo|mismo periodo)\b/i;

function quarterToWindow(qNum: number, year: number): TheoreticalWindow {
  const startMonth = (qNum - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = lastDayOfMonth(year, endMonth);
  return {
    start_t: `${year}-${pad2(startMonth)}-01`,
    end_t: `${year}-${pad2(endMonth)}-${pad2(lastDay)}`,
    label: `Q${qNum} ${year}`,
    granularity: "weekly",
    kind: "quarter",
  };
}

function semesterToWindow(half: 1 | 2, year: number): TheoreticalWindow {
  return half === 1
    ? { start_t: `${year}-01-01`, end_t: `${year}-06-30`, label: `H1 ${year}`, granularity: "weekly", kind: "semester" }
    : { start_t: `${year}-07-01`, end_t: `${year}-12-31`, label: `H2 ${year}`, granularity: "weekly", kind: "semester" };
}

function monthToWindow(monthNum: number, year: number): TheoreticalWindow {
  const lastDay = lastDayOfMonth(year, monthNum);
  const monthName = Object.keys(MONTH_MAP).find((k) => MONTH_MAP[k] === monthNum) ?? `${monthNum}`;
  return {
    start_t: `${year}-${pad2(monthNum)}-01`,
    end_t: `${year}-${pad2(monthNum)}-${pad2(lastDay)}`,
    label: `${monthName} de ${year}`,
    granularity: "weekly",
    kind: "month",
  };
}

function yearToWindow(year: number): TheoreticalWindow {
  return { start_t: `${year}-01-01`, end_t: `${year}-12-31`, label: `año ${year}`, granularity: "year", kind: "year" };
}

function parseSinglePhrase(phrase: string, today: Date): TheoreticalWindow | null {
  const q = phrase.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const currentYear = today.getUTCFullYear();

  // Quarter (long form: "primer trimestre 2026")
  const m1 = q.match(QUARTER_RE);
  if (m1) {
    const ordMap: Record<string, number> = { primer: 1, "1er": 1, q1: 1, segundo: 2, "2do": 2, q2: 2, tercer: 3, "3er": 3, q3: 3, cuarto: 4, "4to": 4, q4: 4 };
    const qNum = ordMap[m1[1].toLowerCase()] ?? 1;
    const year = m1[2] ? parseInt(m1[2], 10) : currentYear;
    return quarterToWindow(qNum, year);
  }
  // Quarter (short form: "Q1 2026", "Q1-2025", "Q1/26")
  const m1b = q.match(QUARTER_SHORT_RE);
  if (m1b) {
    const qNum = parseInt(m1b[1], 10);
    let yr = currentYear;
    if (m1b[2]) {
      const raw = parseInt(m1b[2], 10);
      yr = raw < 100 ? 2000 + raw : raw;
    }
    return quarterToWindow(qNum, yr);
  }
  // Semester
  const m2 = q.match(SEMESTER_RE);
  if (m2) {
    const half: 1 | 2 = (m2[1] === "primer" || m2[1] === "1er") ? 1 : 2;
    const year = m2[2] ? parseInt(m2[2], 10) : currentYear;
    return semesterToWindow(half, year);
  }
  // YTD / "lo que va de año"
  if (YTD_RE.test(q)) {
    return {
      start_t: `${currentYear}-01-01`,
      end_t: toISODate(today),
      label: `YTD ${currentYear}`,
      granularity: "ytd",
      kind: "ytd",
    };
  }
  // Relative days
  const mRd = q.match(RELATIVE_DAYS_RE);
  if (mRd) {
    const n = parseInt(mRd[1], 10);
    const end = new Date(today); const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - n);
    return {
      start_t: toISODate(start), end_t: toISODate(end),
      label: `últimos ${n} días`, granularity: "rolling_days", kind: "rolling_days",
    };
  }
  // Relative weeks
  const mRw = q.match(RELATIVE_WEEKS_RE);
  if (mRw) {
    const n = parseInt(mRw[1], 10);
    const end = new Date(today); const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - n * 7);
    return {
      start_t: toISODate(start), end_t: toISODate(end),
      label: `últimas ${n} semanas`, granularity: "weekly", kind: "rolling_weeks",
    };
  }
  // Relative months / "hace N meses"
  const mRm = q.match(RELATIVE_MONTHS_RE) || q.match(HACE_MONTHS_RE);
  if (mRm) {
    const n = parseInt(mRm[1], 10);
    const end = new Date(today); const start = new Date(today);
    start.setUTCMonth(start.getUTCMonth() - n);
    return {
      start_t: toISODate(start), end_t: toISODate(end),
      label: `últimos ${n} meses`, granularity: "monthly", kind: "rolling_months",
    };
  }
  // Month name
  const m3 = q.match(MONTH_RE);
  if (m3) {
    const monthNum = MONTH_MAP[m3[1]];
    const year = m3[2] ? parseInt(m3[2], 10) : currentYear;
    return monthToWindow(monthNum, year);
  }
  // Bare year
  const m4 = q.match(YEAR_RE);
  if (m4) {
    return yearToWindow(parseInt(m4[1], 10));
  }
  return null;
}

/**
 * Extract two windows from a comparative phrase. Supports:
 *   - "Q1 2026 vs Q1 2025"
 *   - "compara Q1 de 2026 con Q1 de 2025"
 *   - "Q1 2026 frente a Q1 2025"
 *   - "interanual" / "YoY" → second = primary - 1 year
 */
function parseComparison(question: string, today: Date): { primary: TheoreticalWindow | null; secondary: TheoreticalWindow | null } {
  // First, try to split by an explicit comparator
  const splitRe = /\s+(?:vs\.?|versus|frente a|comparad[oa] con|comparada? con|compara(?:do|da)?\s+con|con(?:tra)?)\s+/i;
  const parts = question.split(splitRe);
  if (parts.length >= 2) {
    const left = parseSinglePhrase(parts[0], today);
    const right = parseSinglePhrase(parts.slice(1).join(" "), today);
    if (left && right) return { primary: left, secondary: right };
    if (left) {
      // Try to interpret right side as just a bare year if windowed parse failed
      const yr = parts.slice(1).join(" ").match(YEAR_RE);
      if (yr) return { primary: left, secondary: yearToWindow(parseInt(yr[1], 10)) };
    }
  }
  // YoY / interanual / "año anterior" / "mismo periodo del año anterior" without explicit second window
  if (/\b(yoy|year[\s\-]?over[\s\-]?year|interanual|a[nñ]o anterior|mismo per[ií]odo|mismo periodo)\b/i.test(question)) {
    const primary = parseSinglePhrase(question, today);
    if (primary) {
      const sStart = parseISODate(primary.start_t);
      const sEnd = parseISODate(primary.end_t);
      sStart.setUTCFullYear(sStart.getUTCFullYear() - 1);
      sEnd.setUTCFullYear(sEnd.getUTCFullYear() - 1);
      return {
        primary,
        secondary: {
          start_t: toISODate(sStart),
          end_t: toISODate(sEnd),
          label: `${primary.label} (año anterior)`,
          granularity: primary.granularity,
          kind: `${primary.kind}_yoy`,
        },
      };
    }
  }
  return { primary: null, secondary: null };
}

export function parseTemporalIntent(question: string | null | undefined, today: Date = new Date()): ParsedTemporalIntent {
  const empty: ParsedTemporalIntent = { primary: null, secondary: null, isComparison: false, isOpenEnded: false, primaryIsFuture: false };
  if (!question) return empty;
  const isComparison = COMPARISON_RE.test(question);
  const isOpenEnded = YTD_RE.test(question);

  if (isComparison) {
    const { primary, secondary } = parseComparison(question, today);
    if (primary) {
      const todayISO = toISODate(today);
      return {
        primary,
        secondary,
        isComparison: !!secondary,
        isOpenEnded,
        primaryIsFuture: primary.start_t > todayISO,
      };
    }
  }

  const primary = parseSinglePhrase(question, today);
  if (!primary) return empty;
  const todayISO = toISODate(today);
  return { primary, secondary: null, isComparison: false, isOpenEnded, primaryIsFuture: primary.start_t > todayISO };
}

// ── DB reconciliation ──────────────────────────────────────────────
/**
 * The `supabase` client is typed `any` to avoid coupling this shared
 * module with the SDK types (it is also imported by Deno tests which
 * use a hand-rolled mock).
 *
 * Reconciliation strategy:
 *   1. Pull MIN/MAX/COUNT for the ticker globally (per-company floor).
 *   2. Pull MIN/MAX and the set of distinct snapshot dates that fall
 *      inside the requested window.
 *   3. Compute expected_n = Sundays in [max(start_t, first_avail), end_t].
 *
 * When `ticker` is null we use the global rix_runs_v2 floor instead
 * (used for sector / ranking queries). The query uses the same column
 * `batch_execution_date` everywhere — no schema branching.
 */
export async function reconcileWindow(
  supabase: any,
  ticker: string | null,
  requested: TheoreticalWindow,
): Promise<ReconciledWindow> {
  const TABLE = "rix_runs_v2";
  const COL = "batch_execution_date";
  // ── 1. Per-company (or global) MIN/MAX ─────────────────────────
  let firstAvail: string | null = null;
  let lastAvail: string | null = null;
  try {
    let qMin = supabase.from(TABLE).select(COL).order(COL, { ascending: true }).limit(1);
    let qMax = supabase.from(TABLE).select(COL).order(COL, { ascending: false }).limit(1);
    if (ticker) {
      qMin = qMin.eq("05_ticker", ticker);
      qMax = qMax.eq("05_ticker", ticker);
    }
    const [resMin, resMax] = await Promise.all([qMin, qMax]);
    if (resMin?.data?.[0]?.[COL]) firstAvail = String(resMin.data[0][COL]).slice(0, 10);
    if (resMax?.data?.[0]?.[COL]) lastAvail = String(resMax.data[0][COL]).slice(0, 10);
  } catch (_e) {
    // Treat DB failure as "no data known" — disclaimer will warn.
  }

  // ── 2. Snapshots inside the window ─────────────────────────────
  const fromIso = `${requested.start_t}T00:00:00Z`;
  const toIso = `${requested.end_t}T23:59:59Z`;
  const distinctDates = new Set<string>();
  let startR: string | null = null;
  let endR: string | null = null;
  try {
    let qWin = supabase.from(TABLE).select(COL).gte(COL, fromIso).lte(COL, toIso).order(COL, { ascending: true }).limit(2000);
    if (ticker) qWin = qWin.eq("05_ticker", ticker);
    const { data } = await qWin;
    if (Array.isArray(data)) {
      for (const row of data) {
        const raw = row?.[COL];
        if (!raw) continue;
        distinctDates.add(String(raw).slice(0, 10));
      }
      if (distinctDates.size > 0) {
        const sorted = Array.from(distinctDates).sort();
        startR = sorted[0];
        endR = sorted[sorted.length - 1];
      }
    }
  } catch (_e) {
    // ditto — leave window as zero
  }

  // ── 3. expected_n = Sundays in [max(start_t, first_avail), end_t] ─
  const effectiveStart = firstAvail && firstAvail > requested.start_t ? firstAvail : requested.start_t;
  const expectedN = countSundaysInRange(effectiveStart, requested.end_t);

  const gapStart = startR ? Math.max(0, diffDays(requested.start_t, startR)) : diffDays(requested.start_t, requested.end_t) + 1;
  const gapEnd = endR ? Math.max(0, diffDays(endR, requested.end_t)) : diffDays(requested.start_t, requested.end_t) + 1;
  // "Complete" means: (1) we got every weekly snapshot expected after
  // clamping to the per-company floor AND (2) the per-company floor
  // does NOT itself fall inside the requested window. The latter is
  // critical: when a company is onboarded mid-Q1, the user still needs
  // a disclaimer even though we delivered every snapshot the company
  // ever had. A gap measured in *days* between requested.start_t and
  // the first real Sunday (e.g. Q1 starts Thu 1-ene, first Sunday
  // 4-ene) is NOT a defect on its own.
  const floorInsideWindow = !!firstAvail && firstAvail > requested.start_t && firstAvail <= requested.end_t;
  const isComplete = !!startR && !!endR && distinctDates.size >= expectedN && !floorInsideWindow;

  return {
    requested,
    start_r: startR,
    end_r: endR,
    n_real: distinctDates.size,
    n_expected: expectedN,
    first_available_snapshot: firstAvail,
    last_available_snapshot: lastAvail,
    gap_days_start: gapStart,
    gap_days_end: gapEnd,
    isComplete,
  };
}

// ── Disclaimer & block helpers ─────────────────────────────────────
/**
 * Produces a human-readable disclaimer for the system prompt + InfoBar
 * + methodology footer. Returns an empty string when there is nothing
 * worth disclosing (window matches reality and no data missing).
 *
 * The `today` argument is injected so callers can stamp the message
 * with the next expected snapshot deterministically.
 */
export function buildTemporalDisclaimer(
  reconciled: ReconciledWindow,
  today: Date = new Date(),
): string {
  const r = reconciled;
  // No data at all in the window
  if (!r.start_r || !r.end_r || r.n_real === 0) {
    const nextSnap = nextExpectedSundaySnapshot(today);
    if (r.first_available_snapshot && r.first_available_snapshot > r.requested.end_t) {
      return `No existen datos RepIndex para ${r.requested.label} (${r.requested.start_t} → ${r.requested.end_t}): el primer snapshot disponible para esta empresa es del ${r.first_available_snapshot}. Próximo snapshot programado: ${nextSnap}.`;
    }
    return `No existen datos RepIndex en la ventana solicitada (${r.requested.start_t} → ${r.requested.end_t}). Próximo snapshot programado: ${nextSnap}.`;
  }
  // Complete: no disclaimer needed
  if (r.isComplete) return "";

  const parts: string[] = [];
  parts.push(`Ventana solicitada: ${r.requested.label} (${r.requested.start_t} → ${r.requested.end_t}).`);
  parts.push(`Ventana con datos: ${r.start_r} → ${r.end_r}, ${r.n_real} snapshot${r.n_real === 1 ? "" : "s"} (esperados: ${r.n_expected}).`);
  // Only disclose a "no prior data" gap when the company-specific floor
  // genuinely falls inside the requested window (i.e., not just because
  // the first Sunday of the window happens to be a few days into it).
  if (r.first_available_snapshot && r.first_available_snapshot > r.requested.start_t) {
    parts.push(`No existe dato RIX anterior al ${r.first_available_snapshot} para esta empresa.`);
  }
  if (r.gap_days_end > 0) {
    const nextSnap = nextExpectedSundaySnapshot(today);
    parts.push(`Último snapshot publicado: ${r.end_r}. Próximo snapshot programado: ${nextSnap}.`);
  }
  return parts.join(" ");
}

/**
 * If a comparison was requested and one side has zero data, return a
 * structured block so the pipeline can short-circuit with a friendly
 * clarification instead of emitting a silently partial answer.
 */
export function blockIfImpossibleComparison(
  primary: ReconciledWindow,
  secondary: ReconciledWindow,
): ImpossibleComparisonBlock {
  const pEmpty = primary.n_real === 0;
  const sEmpty = secondary.n_real === 0;
  if (!pEmpty && !sEmpty) return { blocked: false, empty_side: null, message: "" };
  let empty_side: "primary" | "secondary" | "both" = "both";
  if (pEmpty && !sEmpty) empty_side = "primary";
  else if (!pEmpty && sEmpty) empty_side = "secondary";
  const missing = empty_side === "primary" ? primary.requested : secondary.requested;
  const present = empty_side === "primary" ? secondary : primary;
  const floor = primary.first_available_snapshot ?? secondary.first_available_snapshot;
  const floorMsg = floor ? ` El primer snapshot disponible para esta empresa es del ${floor}.` : "";
  const altMsg = empty_side === "both"
    ? ""
    : ` ¿Quieres que analice solo ${present.requested.label} (${present.requested.start_t} → ${present.requested.end_t}, ${present.n_real} snapshot${present.n_real === 1 ? "" : "s"}), o prefieres una ventana alternativa con datos disponibles?`;
  const message = `No dispongo de datos RepIndex para ${missing.label} (${missing.start_t} → ${missing.end_t}).${floorMsg}${altMsg}`;
  return { blocked: true, empty_side, message };
}

/**
 * Helper used by the n-mismatch normaliser: returns the disclaimer
 * line to attach when both windows have data but their snapshot
 * counts differ. Returns empty string when counts are equal.
 */
export function buildNormalisationNote(primary: ReconciledWindow, secondary: ReconciledWindow): string {
  if (primary.n_real === secondary.n_real) return "";
  return `${primary.requested.label}: ${primary.n_real} snapshot${primary.n_real === 1 ? "" : "s"}. ${secondary.requested.label}: ${secondary.n_real} snapshot${secondary.n_real === 1 ? "" : "s"}. Medias normalizadas por número de observaciones; deltas calculados sobre medias, no sumas.`;
}
