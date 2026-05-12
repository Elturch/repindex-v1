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
    hasLiteralMarkerLeak: boolean;
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
// P1-A — LLM hallucinated disclaimer that bypasses our cited-sources block.
const FAKE_SOURCES_RE = /dato\s+no\s+disponible[^.\n]{0,40}URLs?/i;
// Sprint 1 Fix 1 + Sprint 2 — Anti-mediana detector (Core rule violation).
// Captures: "RIX medio del índice/grupo/sector/conjunto/consenso",
// "promedio/media del consenso/índice/IBEX-35",
// "mediana del RIX", "RIX mediano", "media inter-modelo".
const ANTI_MEDIANA_RE = /\bRIX\s+medio\s+del\s+(?:[ií]ndice|grupo|sector|conjunto|consenso)\b|\b(?:promedio|media)\s+(?:del\s+)?(?:consenso|[ií]ndice|IBEX(?:[-\s]?35)?)\b|\bmediana\s+(?:del\s+)?RIX\b|\bRIX\s+median[oa]\b|\bmedia\s+inter[-\s]?modelo\b/i;

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

// ── Stress-Matrix-driven anti-fabrication scrubber ──────────────────
// Defence-in-depth post-stream sanitizer. Replaces banned tokens with
// neutral equivalents so the audit pipeline (stress-matrix-runner) and
// the persisted markdown stay clean. Returns the scrubbed text + a list
// of rules that fired (for `response_meta.scrub_log`).
//
// IMPORTANT: this does NOT touch the live SSE stream — that is mitigated
// by the prompt-level rules in antiHallucination.ts and rankingMode.ts.
// This sanitizer is the safety net for storage / audit / regression.

export interface ScrubResult { text: string; rules_fired: string[] }

// Fase 1 — Congelacion de inyectores cosmeticos.
// Lectura perezosa de FREEZE_COSMETIC_INJECTORS (default=true). Se evalua
// en cada llamada para permitir toggle en caliente sin redeploy.
function _isCosmeticInjectorsFrozen(): boolean {
  try {
    const raw = (Deno.env.get("FREEZE_COSMETIC_INJECTORS") ?? "").trim().toLowerCase();
    if (raw === "") return true;
    return !(raw === "false" || raw === "0" || raw === "off" || raw === "no");
  } catch {
    return true;
  }
}

const MEDIANA_RE = /\bmediana\b/gi;
const RIX_MEDIO_RE = /\bRIX\s+medio\b/gi;
// Variantes adicionales que se cuelan en informes single-model y rankings.
const RIX_PROMEDIO_RE = /\bRIX\s+promedio\b/gi;
const MEDIA_GRUPO_RE = /\b(?:media|promedio)\s+(?:del|de\s+los?)\s+(?:grupo|ranking|sector|subsector|conjunto|índice|indice)\b/gi;
const NOTA_PRENSA_SINGULAR_RE = /\bnota\s+de\s+prensa\b/gi;
const PROMEDIO_IA_RE = /\b(promedio|media)\s+entre\s+IAs?\b/gi;
const PROMEDIO_CONSENSO_RE = /\b(promedio|media)\s+(?:del\s+)?consenso\b/gi;
const MEDIA_SEMANAL_RE = /\bmedia\s+semanal\b/gi;
const WHITE_PAPER_RE = /\bwhite[-\s]?paper(s)?\b/gi;
const LIBRO_BLANCO_RE = /\blibros?\s+blancos?\b/gi;
const DATA_ROOM_RE = /\bdata[-\s]?room(s)?\b/gi;
const ROADSHOW_RE = /\broadshow(s)?\b/gi;
const AGM_RE = /\bAGM\b/gi;
const PROTOCOLO_RE = /\bprotocolo(s)?\b/gi;
const WEBINAR_RE = /\bwebinar(s)?\b/gi;
const BRIEFING_RE = /\bbriefing(s)?\b/gi;
const NOTA_PRENSA_RE = /\bnota(s)?\s+de\s+prensa\b/gi;
const MESA_REDONDA_RE = /\bmesa(s)?\s+redonda(s)?\b/gi;
const TARGET_NUM_RE = /\btarget\s+[0-9]+(?:[\.,][0-9]+)?\b/gi;
const TARGET_LABEL_RE = /\btarget\b/gi;
const PLUS_PTS_RE = /\+\d+[\.,]\d+\s*pts?\b/gi;
const FUTURE_QUARTER_RE = /\bQ[1-4][-\s]?20\d\d\b/gi;
const FY_RE = /\bFY[-\s]?20\d\d\b/gi;

// Single-model leaks (only applied when modelFilter is set).
const SM_ENTRE_MODELOS_RE = /\bentre\s+modelos\b/gi;
const SM_CONSENSO_MULTI_RE = /\bconsenso\s+multi(?:[-\s]?modelo)?\b/gi;
const SM_LOS_DEMAS_RE = /\blos\s+dem[aá]s\s+modelos\b/gi;

export function sanitizeFinalMarkdown(
  text: string | null | undefined,
  opts: { modelFilter?: string | null } = {},
): ScrubResult {
  const fired: string[] = [];
  let out = (text ?? "").toString();
  if (!out) return { text: out, rules_fired: fired };

  // Fase 1 — Cosmetic injector frozen: devolver el texto tal cual lo emitio
  // el LLM. Las reglas anti-mediana / anti-fabricacion / single-model leaks
  // quedan inactivas pero VISIBLES en el repo para rollback inmediato.
  if (_isCosmeticInjectorsFrozen()) {
    return { text: out, rules_fired: ["__frozen_phase1__"] };
  }

  const apply = (re: RegExp, repl: string, ruleId: string) => {
    const next = out.replace(re, repl);
    if (next !== out) { fired.push(ruleId); out = next; }
  };

  // Anti-mediana (Core memory rule).
  apply(MEDIANA_RE, "referencia", "anti_mediana");
  apply(RIX_MEDIO_RE, "RIX de referencia", "rix_medio");
  apply(RIX_PROMEDIO_RE, "RIX de referencia", "rix_promedio");
  apply(MEDIA_GRUPO_RE, "referencia del grupo", "media_grupo");
  apply(PROMEDIO_IA_RE, "rango entre IAs", "promedio_ias");
  apply(PROMEDIO_CONSENSO_RE, "rango del consenso", "promedio_consenso");
  apply(MEDIA_SEMANAL_RE, "referencia semanal", "media_semanal");

  // Anti-fabrication entregables.
  apply(WHITE_PAPER_RE, "documento técnico", "white_paper");
  apply(LIBRO_BLANCO_RE, "documento técnico", "libro_blanco");
  apply(DATA_ROOM_RE, "dossier informativo", "data_room");
  apply(ROADSHOW_RE, "ronda de presentaciones", "roadshow");
  apply(AGM_RE, "junta", "agm");
  apply(PROTOCOLO_RE, "marco de actuación", "protocolo");
  apply(WEBINAR_RE, "sesión informativa", "webinar");
  apply(BRIEFING_RE, "sesión informativa", "briefing");
  apply(NOTA_PRENSA_RE, "comunicación corporativa", "nota_prensa");
  apply(NOTA_PRENSA_SINGULAR_RE, "comunicación corporativa", "nota_prensa_sg");
  apply(MESA_REDONDA_RE, "encuentro sectorial", "mesa_redonda");
  apply(TARGET_NUM_RE, "objetivo operativo", "target_num");
  apply(TARGET_LABEL_RE, "objetivo", "target_label");
  apply(PLUS_PTS_RE, "mejora cuantificada", "plus_pts");
  apply(FUTURE_QUARTER_RE, "período futuro", "future_quarter");
  apply(FY_RE, "ejercicio futuro", "fy_future");

  // Single-model: comparativo cross-model leaks.
  if (opts.modelFilter) {
    apply(SM_ENTRE_MODELOS_RE, "en este modelo", "sm_entre_modelos");
    apply(SM_CONSENSO_MULTI_RE, "lectura del modelo", "sm_consenso_multi");
    apply(SM_LOS_DEMAS_RE, "el resto de IAs (no incluidas en esta vista)", "sm_los_demas");
  }

  return { text: out, rules_fired: fired };
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
  // P1-A.2 — Split marker detection into two signals:
  //   • hasLiteralMarkerLeak  → exact "<!--CITEDSOURCESHERE-->" survived
  //     (substitution code did not run).  ERROR: MARKER_NOT_STRIPPED.
  //   • hasMarkerLeak         → tolerant regex catches typo'd / formatted
  //     variants (e.g. wrapped in <strong>).  ERROR: MARKER_LEAK.
  const hasLiteralMarkerLeak = safe.includes(MARKER_LITERAL);
  const hasMarkerLeak = hasLiteralMarkerLeak || MARKER_RE.test(safe);

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

  if (hasLiteralMarkerLeak) {
    issues.push({
      level: "error",
      code: "MARKER_NOT_STRIPPED",
      message: "Literal cited-sources marker '<!--CITEDSOURCESHERE-->' present in final output (substitution skipped).",
    });
  } else if (hasMarkerLeak) {
    issues.push({
      level: "error",
      code: "MARKER_LEAK",
      message: "Cited-sources marker variant leaked to final output (tolerant regex match).",
    });
  }

  if (FAKE_SOURCES_RE.test(safe)) {
    issues.push({
      level: "error",
      code: "FAKE_SOURCES_DISCLAIMER",
      message: "Skill output contains hallucinated 'dato no disponible URLs' disclaimer instead of the cited-sources block.",
    });
  }

  if (ANTI_MEDIANA_RE.test(safe)) {
    issues.push({
      level: "warning",
      code: "CONSOLIDATED_AVERAGE",
      message: "Output uses a consolidated average — violates the Anti-Mediana Core rule. Use 'RIX de referencia' + range (max-min) instead.",
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
    meta: { length, hasSection7, hasCitedSources, hasMarkerLeak, hasLiteralMarkerLeak },
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