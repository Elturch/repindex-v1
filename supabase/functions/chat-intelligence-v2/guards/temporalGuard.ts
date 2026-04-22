// chat-intelligence-v2 / guards / temporalGuard.ts
// Validates the resolved temporal window. Pure function. Max 150 LOC.
import type { ResolvedTemporal } from "../types.ts";

export interface TemporalResult {
  pass: boolean;
  reply?: string;
  warnings?: string[];
}

const COVERAGE_WARNING_THRESHOLD = 0.85;

/**
 * Rules:
 *   1. If the requested window starts strictly in the future → reject.
 *   2. If snapshots_available === 0 → reject (no data at all).
 *   3. If coverage_ratio < 0.85 → pass but emit a warning that the
 *      synthesis layer must surface to the user.
 *   4. Else → pass clean.
 */
export function checkTemporal(temporal: ResolvedTemporal): TemporalResult {
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

export const __test__ = { COVERAGE_WARNING_THRESHOLD };