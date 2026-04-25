// Sticky entity override + comparison expansion helpers.
//
// Used by ChatContext.tsx before composing the previousContext payload sent
// to chat-intelligence-v2.
//
// (1) detectsExplicitNewEntity:
//     When the new question explicitly introduces a DIFFERENT brand than
//     the sticky one, we force isFollowup=false + previousContext=null so
//     the BE resolves the new query from scratch (no sticky inheritance).
//
// (2) expandComparisonFollowup:
//     When the new question is a short comparison follow-up
//     ("y comparado con SAN?", "versus Iberdrola"), we rewrite it into a
//     self-contained query ("compara <sticky> vs <new>") so the BE
//     classifier recognises it as `comparison` with two entities.

const ENTITY_INTRO_RE =
  /\b(?:reputaci[oó]n|an[aá]lisis|informe|datos|comparaci[oó]n|c[oó]mo\s+(?:est[aá]|va|le\s+va))\s+(?:de\s+|sobre\s+|para\s+|en\s+)?([A-ZÁÉÍÓÚÑ][\wáéíóúñ\s.&-]{2,40})/i;
const STANDALONE_BRAND_RE =
  /^[¿\s]*([A-ZÁÉÍÓÚÑ][\wáéíóúñ.&-]{2,40})\s*[?¿.!]*\s*$/;

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectsExplicitNewEntity(
  question: string,
  prevCompany: string | null,
): { override: boolean; candidate: string | null } {
  if (!question || !question.trim()) return { override: false, candidate: null };
  const m = question.match(ENTITY_INTRO_RE) ?? question.match(STANDALONE_BRAND_RE);
  if (!m) return { override: false, candidate: null };
  const raw = (m[1] ?? "").trim();
  if (!raw) return { override: false, candidate: null };
  const candidate = normalizeName(raw);
  if (candidate.length < 3) return { override: false, candidate: null };
  if (!prevCompany) return { override: true, candidate };
  const prev = normalizeName(prevCompany);
  // Same brand or substring overlap → keep sticky (e.g. "BBVA?" tras "BBVA")
  if (candidate === prev) return { override: false, candidate };
  if (prev && (candidate.includes(prev) || prev.includes(candidate))) {
    return { override: false, candidate };
  }
  return { override: true, candidate };
}

// BUG C fix — expand short comparison follow-ups into a self-contained
// query the BE classifier can recognise as `comparison`.
//
// Examples:
//   "y comparado con SAN?"     + sticky=BBVA → "compara BBVA vs SAN"
//   "versus Iberdrola"          + sticky=BBVA → "compara BBVA vs Iberdrola"
//   "frente a Telefónica"       + sticky=BBVA → "compara BBVA vs Telefónica"
//
// Returns the rewritten query, or null if no expansion applies.
const COMPARISON_FOLLOWUP_RE =
  /^[¿¡\s]*(?:y\s+)?(?:comparad[oa]s?\s+(?:con|contra|frente\s+a)|compara(?:r|me)?\s+con|versus|vs\.?|frente\s+a|contra)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ\s.&-]{1,40}?)\s*[?¿.!]*\s*$/i;

export function expandComparisonFollowup(
  question: string,
  prevCompany: string | null,
): string | null {
  if (!question || !prevCompany) return null;
  const m = question.match(COMPARISON_FOLLOWUP_RE);
  if (!m) return null;
  const newEntity = (m[1] ?? "").trim();
  if (!newEntity) return null;
  return `compara ${prevCompany} vs ${newEntity}`;
}