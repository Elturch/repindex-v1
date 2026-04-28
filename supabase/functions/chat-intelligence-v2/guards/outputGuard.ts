// Agente Rix v2 — Output validator (P0-3)
// Pure function. NO side effects, NO mutations. Detects obviously broken
// skill outputs (empty, marker leak, missing canonical sections) and
// returns structured issues that the orchestrator logs. P0 = observability
// only; P1 will promote `error` issues to retry/auto-correction.
//
// Constraint: < 200 LOC, no I/O, no LLM calls.

export interface OutputValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface OutputValidationResult {
  ok: boolean; // true if no issues with level === "error"
  issues: OutputValidationIssue[];
  meta: {
    length: number;
    hasSection7: boolean;
    hasCitedSources: boolean;
    hasMarkerLeak: boolean;
  };
}

export interface OutputValidationOptions {
  /** Require canonical "## 7. Recomendaciones priorizadas" section. */
  requireSection7?: boolean;
  /** Require a "Fuentes citadas" / bibliografía heading or block. */
  requireCitedSources?: boolean;
  /** Minimum non-empty content length (chars). Default 200. */
  minLength?: number;
}

const SECTION_7_RE = /(^|\n)\s*##\s*7\.|Recomendaciones\s+priorizadas/i;
const CITED_SOURCES_RE = /Fuentes\s+citadas|Referencias\s+citadas|Bibliograf[íi]a|##\s*8\./i;
const MARKER_RE = /<!--\s*[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*CITED[\s_]*<?\/?(?:strong|em|b|i)?>?[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*SOURCES[\s_]*<?\/?(?:strong|em|b|i)?>?[*_\s]*<?\/?(?:strong|em|b|i)?>?\s*HERE\s*<?\/?(?:strong|em|b|i)?>?[*_\s]*-->/i;
const MARKER_LITERAL = "<!--CITEDSOURCESHERE-->";

// P1-C — Exported scrub helper used by the orchestrator as a defence-in-depth
// safety net AFTER the skill returns. Idempotent: returns the same string when
// no marker is present. Only matches inside HTML comment delimiters, so plain
// narrative text containing the words CITED/SOURCES is NEVER altered.
export const MARKER_RE_TOLERANT = MARKER_RE;
export function scrubCitedSourcesMarker(text: string | null | undefined): { text: string; scrubbed: boolean } {
  const safe = (text ?? "").toString();
  if (!safe.includes(MARKER_LITERAL) && !MARKER_RE.test(safe)) {
    return { text: safe, scrubbed: false };
  }
  const cleaned = safe.replace(new RegExp(MARKER_RE.source, "gi"), "").split(MARKER_LITERAL).join("");
  return { text: cleaned, scrubbed: cleaned !== safe };
}

export function validateSkillOutput(
  content: string | null | undefined,
  opts: OutputValidationOptions = {},
): OutputValidationResult {
  const minLength = opts.minLength ?? 200;
  const issues: OutputValidationIssue[] = [];
  const safe = (content ?? "").toString();
  const length = safe.length;

  const hasSection7 = SECTION_7_RE.test(safe);
  const hasCitedSources = CITED_SOURCES_RE.test(safe);
  const hasMarkerLeak = safe.includes(MARKER_LITERAL) || MARKER_RE.test(safe);

  if (length === 0) {
    issues.push({
      level: "error",
      code: "EMPTY_OUTPUT",
      message: "Skill returned empty content.",
    });
  } else if (length < minLength) {
    issues.push({
      level: "error",
      code: "TRUNCATED_OUTPUT",
      message: `Skill output suspiciously short (${length} chars < ${minLength}).`,
    });
  }

  if (hasMarkerLeak) {
    issues.push({
      level: "error",
      code: "MARKER_LEAK",
      message: "Cited-sources marker leaked to final output (replacement failed).",
    });
  }

  if (opts.requireSection7 && !hasSection7) {
    issues.push({
      level: "warning",
      code: "MISSING_SECTION_7",
      message: "Canonical Section 7 (Recomendaciones priorizadas) not detected.",
    });
  }

  if (opts.requireCitedSources && !hasCitedSources) {
    issues.push({
      level: "warning",
      code: "MISSING_CITED_SOURCES",
      message: "Cited-sources / bibliography heading not detected.",
    });
  }

  const ok = !issues.some((i) => i.level === "error");
  return {
    ok,
    issues,
    meta: { length, hasSection7, hasCitedSources, hasMarkerLeak },
  };
}

/** Compact one-line log helper used by the orchestrator. */
export function summarizeValidation(skillName: string, r: OutputValidationResult): string {
  if (r.issues.length === 0) {
    return `[outputGuard] ${skillName}: ok len=${r.meta.length} s7=${r.meta.hasSection7} src=${r.meta.hasCitedSources}`;
  }
  const codes = r.issues.map((i) => `${i.level[0].toUpperCase()}:${i.code}`).join(",");
  return `[outputGuard] ${skillName}: ok=${r.ok} len=${r.meta.length} issues=[${codes}]`;
}