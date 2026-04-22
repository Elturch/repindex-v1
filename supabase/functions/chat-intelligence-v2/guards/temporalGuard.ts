// chat-intelligence-v2 / guards / temporalGuard.ts
// Validates the resolved temporal window. Pure function. Max 150 LOC.
import type { ResolvedTemporal } from "../types.ts";

export interface TemporalResult {
  pass: boolean;
  reply?: string;
  warnings?: string[];
}

const COVERAGE_WARNING_THRESHOLD = 0.85;

// Predictive / speculative intent: the user asks about the FUTURE,
// regardless of whether the resolved window happens to overlap with past data.
// Example: "¿Cómo será la reputación de Iberdrola en 2026?" — even if 2026 has
// past weeks, the question itself is forecast-oriented and must be rejected.
const PREDICTIVE_PATTERNS: RegExp[] = [
  // Spanish future tense — restricted to common reputation/forecast verbs to
  // avoid false positives on past-tense or unrelated words.
  /\b(ser[áa]n?|tendr[áa]n?|evolucionar[áa]n?|comportar[áa]n?|reaccionar[áa]n?|cambiar[áa]n?|mejorar[áa]n?|empeorar[áa]n?|subir[áa]n?|bajar[áa]n?|crecer[áa]n?|caer[áa]n?|terminar[áa]n?|acabar[áa]n?|pasar[áa]n?|ocurrir[áa]n?|suceder[áa]n?|llegar[áa]n?|alcanzar[áa]n?|superar[áa]n?)\b/i,
  // Explicit forecasting vocabulary
  /\b(predicci[óo]n|predice|predecir|pron[óo]stico|pronostic[ao]r?|forecast|proyecci[óo]n|proyect[ao]r?)\b/i,
  /\b(futuro|en el futuro|a futuro|de cara al futuro)\b/i,
  /\b(pr[óo]xim[oa]s? (a[ñn]o|trimestre|semestre|mes|semana|d[íi]a))\b/i,
  /\b(el a[ñn]o que viene|el pr[óo]ximo a[ñn]o|de aqu[íi] a)\b/i,
  /\b(c[óo]mo (ser[áa]|evolucionar[áa]|terminar[áa]|acabar[áa]))\b/i,
  /\b(qu[ée] (pasar[áa]|ocurrir[áa]|suceder[áa]))\b/i,
  // English equivalents (queries can come in EN/PT/CA)
  /\b(will be|forecast|prediction|predict|future)\b/i,
];

const PREDICTIVE_REPLY =
  "No puedo predecir el futuro. RepIndex solo analiza datos ya recogidos por barridos semanales (domingos). " +
  "Reformula tu pregunta hacia datos hist\u00f3ricos o el periodo m\u00e1s reciente disponible. " +
  "Por ejemplo: \u201creputaci\u00f3n actual de Iberdrola\u201d, \u201cevoluci\u00f3n de Iberdrola en el \u00faltimo trimestre\u201d.";

function looksPredictive(question: string): boolean {
  const q = (question ?? "").trim();
  if (!q) return false;
  // Explicit far-future year mention (>= currentYear + 1) is always predictive.
  const yearMatch = q.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    const currentYear = new Date().getUTCFullYear();
    if (y > currentYear) return true;
  }
  for (const re of PREDICTIVE_PATTERNS) {
    if (re.test(q)) return true;
  }
  return false;
}

/**
 * Rules:
 *   0. If the question itself is predictive/forecast → reject.
 *   1. If the requested window starts strictly in the future → reject.
 *   2. If snapshots_available === 0 → reject (no data at all).
 *   3. If coverage_ratio < 0.85 → pass but emit a warning that the
 *      synthesis layer must surface to the user.
 *   4. Else → pass clean.
 */
export function checkTemporal(temporal: ResolvedTemporal, question?: string): TemporalResult {
  // (0) Predictive intent triage — independent of resolved window.
  if (question && looksPredictive(question)) {
    return { pass: false, reply: PREDICTIVE_REPLY };
  }

  if (!temporal) {
    return {
      pass: false,
      reply:
        "No he podido determinar el periodo de tu pregunta. " +
        "\u00bfPuedes indicar una fecha, semana, trimestre o un rango concreto?",
    };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const from = parseIsoDate(temporal.from);
  const to = parseIsoDate(temporal.to);

  // (1) Future window: even the START is after today.
  if (from && from.getTime() > today.getTime()) {
    return {
      pass: false,
      reply:
        "No dispongo de datos futuros. RepIndex solo cubre semanas ya barridas. " +
        `Tu petici\u00f3n apunta a ${formatHuman(from)}, posterior a hoy.`,
    };
  }

  // (2) No snapshots at all in the requested window.
  if ((temporal.snapshots_available ?? 0) <= 0) {
    return {
      pass: false,
      reply:
        `No hay datos disponibles para el periodo solicitado` +
        (temporal.requested_label ? ` (${temporal.requested_label})` : "") +
        ". RepIndex realiza barridos semanales los domingos; quiz\u00e1s la ventana cae fuera de las semanas con datos. " +
        "Prueba con un periodo posterior a enero de 2026.",
    };
  }

  // (3) Partial coverage warning.
  const warnings: string[] = [];
  const ratio = clamp01(temporal.coverage_ratio ?? 1);
  if (ratio < COVERAGE_WARNING_THRESHOLD) {
    const pct = Math.round(ratio * 100);
    warnings.push(
      `Cobertura parcial: solo el ${pct}% del periodo solicitado tiene datos ` +
        `(${temporal.snapshots_available} de ${temporal.snapshots_expected} semanas). ` +
        `Ventana efectiva analizada: ${temporal.from} \u2192 ${temporal.to}.`,
    );
  }

  // Sanity: if the upper bound is also in the future, push it back to today
  // is the temporalParser's job — here we only flag it.
  if (to && to.getTime() > today.getTime()) {
    warnings.push(
      "El l\u00edmite superior solicitado supera la fecha actual; los datos se truncan a la \u00faltima semana barrida.",
    );
  }

  return warnings.length > 0 ? { pass: true, warnings } : { pass: true };
}

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatHuman(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const __test__ = { COVERAGE_WARNING_THRESHOLD, looksPredictive, PREDICTIVE_PATTERNS };