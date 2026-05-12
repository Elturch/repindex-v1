// chat-intelligence-v2 / guards / execNarrativeValidator.ts
// Fase 2 — Eje C. Validador PURO del relato ejecutivo. Sin I/O.
// Comprueba dos dimensiones:
//   (S) estructura: headline ≤ HEADLINE_MAX_WORDS, exactamente
//       BULLETS_REQUIRED bullets en TL;DR, bloque "Lectura:" ≤
//       LECTURA_MAX_WORDS.
//   (T) trazabilidad numérica: cada cifra del prefacio ejecutivo
//       (headline + TL;DR + Lectura) debe aparecer en el dataset
//       (raw_rows / pre_rendered_tables / coverage_report) o en una
//       lista explícita de números permitidos. Tolerancia: comparación
//       textual normalizada (coma/punto decimal y separadores de miles).
//
// Devuelve { ok, structure, traceability, violations[] } y NUNCA
// reescribe el contenido. La decisión de reintentar la toma el
// orchestrator (E3: máximo 2 reintentos = 3 intentos totales).

import {
  EXEC_NARRATIVE_HEADLINE_MAX_WORDS_V1 as HEADLINE_MAX,
  EXEC_NARRATIVE_BULLETS_REQUIRED_V1 as BULLETS_REQUIRED,
  EXEC_NARRATIVE_LECTURA_MAX_WORDS_V1 as LECTURA_MAX,
  EXEC_NARRATIVE_POLICY_VERSION,
} from "../scope/policies/execNarrativeLimits.ts";

export interface ExecNarrativeValidationResult {
  ok: boolean;
  structure_ok: boolean;
  traceability_ok: boolean;
  violations: string[];
  numbers_total: number;
  numbers_unmatched: string[];
  policy_version: number;
}

function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function normalizeNumber(n: string): string {
  // "1.234,56" → "1234.56"; "1,234.56" → "1234.56"; "12,3" → "12.3"
  let s = n.replace(/\s+/g, "");
  // Detect formats heuristically.
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Last separator is decimal.
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Treat comma as decimal if exactly one and ≤3 digits after.
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 3) s = parts.join(".");
    else s = s.replace(/,/g, "");
  }
  // Strip a trailing % if present (handled by caller looking up both).
  return s;
}

function extractNumbers(text: string): string[] {
  // Capture integers, decimals, % and signed deltas. Skip pure year tokens
  // 2026/2027 to reduce false positives — those are scope-floor strings.
  const re = /[-+]?\d+(?:[.,]\d+)?%?/g;
  const out: string[] = [];
  const m = text.match(re) || [];
  for (const tok of m) {
    const stripped = tok.replace(/[+%]/g, "").replace(/^-/, "");
    if (/^20\d\d$/.test(stripped)) continue; // year-like
    out.push(tok);
  }
  return out;
}

/** Slice the executive prelude (headline + TL;DR + Lectura) from markdown. */
function sliceExecPrelude(md: string): { headline: string; bullets: string[]; lectura: string; raw: string } {
  const lines = md.split(/\r?\n/);
  // headline = first non-empty, non-heading line.
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  let headline = "";
  if (i < lines.length) {
    headline = lines[i].replace(/^#+\s*/, "").trim();
    i++;
  }
  // Collect everything up to the next H1/H2 heading.
  const preludeLines: string[] = [];
  for (; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    preludeLines.push(lines[i]);
  }
  const block = preludeLines.join("\n");
  const bullets = (block.match(/^-\s+.+$/gm) || []).map((b) => b.replace(/^-\s+/, "").trim());
  const lecturaMatch = block.match(/(?:^|\n)\s*Lectura:\s*([\s\S]*?)(?:\n\s*\n|$)/i);
  const lectura = lecturaMatch ? lecturaMatch[1].trim() : "";
  const raw = `${headline}\n${bullets.join("\n")}\n${lectura}`;
  return { headline, bullets, lectura, raw };
}

export interface ExecNarrativeDatasetSnapshot {
  /** Free-text concatenation where citable numbers may appear (raw rows
   *  serialized, pre-rendered tables, coverage report values). */
  numeric_corpus: string;
}

export function validateExecNarrative(
  markdown: string,
  dataset: ExecNarrativeDatasetSnapshot,
): ExecNarrativeValidationResult {
  const violations: string[] = [];
  const { headline, bullets, lectura, raw } = sliceExecPrelude(markdown);

  // --- Structure ---
  let structure_ok = true;
  if (!headline) {
    structure_ok = false;
    violations.push("missing_headline");
  } else if (countWords(headline) > HEADLINE_MAX) {
    structure_ok = false;
    violations.push(`headline_too_long(${countWords(headline)}>${HEADLINE_MAX})`);
  }
  if (bullets.length !== BULLETS_REQUIRED) {
    structure_ok = false;
    violations.push(`bullets_count(${bullets.length}!=${BULLETS_REQUIRED})`);
  }
  if (!lectura) {
    structure_ok = false;
    violations.push("missing_lectura_block");
  } else if (countWords(lectura) > LECTURA_MAX) {
    structure_ok = false;
    violations.push(`lectura_too_long(${countWords(lectura)}>${LECTURA_MAX})`);
  }

  // --- Traceability ---
  const nums = extractNumbers(raw);
  const corpus = dataset.numeric_corpus || "";
  const corpusNumbers = new Set(extractNumbers(corpus).map(normalizeNumber));
  const unmatched: string[] = [];
  for (const n of nums) {
    const norm = normalizeNumber(n);
    if (!corpusNumbers.has(norm)) unmatched.push(n);
  }
  const traceability_ok = unmatched.length === 0;
  if (!traceability_ok) {
    violations.push(`untraceable_numbers(${unmatched.slice(0, 5).join(",")})`);
  }

  return {
    ok: structure_ok && traceability_ok,
    structure_ok,
    traceability_ok,
    violations,
    numbers_total: nums.length,
    numbers_unmatched: unmatched,
    policy_version: EXEC_NARRATIVE_POLICY_VERSION,
  };
}

/** Helper to assemble a numeric corpus from a DataPack-like shape without
 *  forcing a hard dependency on the DataPack type. */
export function buildNumericCorpus(parts: Array<unknown>): string {
  const out: string[] = [];
  for (const p of parts) {
    if (p == null) continue;
    try { out.push(typeof p === "string" ? p : JSON.stringify(p)); } catch { /* ignore */ }
  }
  return out.join("\n");
}