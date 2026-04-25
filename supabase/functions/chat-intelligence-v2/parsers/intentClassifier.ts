// chat-intelligence-v2 / parsers / intentClassifier.ts
// Deterministic intent classification (max 200 LOC, no prompts, no SQL).
// Maps a free-text question to one of the canonical Intent values.
import type { Intent } from "../types.ts";
import { hasSemanticGroupAlias } from "../../_shared/semanticHintCache.ts";

function norm(q: string): string {
  return (q || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ── Welcome / greetings → general_question ─────────────────────────
const WELCOME_RE = /^(hola|hi|hello|hey|buenos\s+d[ií]as|buenas(?:\s+(?:tardes|noches))?|test|prueba|que\s+puedes\s+hacer|como\s+funcionas|ayuda|help)\b[\s!?.]*$/i;

// ── Out of scope (weather, sports, recipes, generic chit-chat) ─────
const OUT_OF_SCOPE_RE = /\b(tiempo|clima|temperatura|lluvia|f[uú]tbol|baloncesto|tenis|liga|partido|receta|cocinar|cocina|chiste|broma|poema|cancion|canci[oó]n|pel[ií]cula|serie|netflix|videojuego)\b/i;

// ── Comparison: explicit comparators ───────────────────────────────
const COMPARISON_RE = /\b(compara(?:r|me|cion|ci[oó]n)?|versus|\bvs\.?\b|frente\s+a|contra|comparativa|enfrenta(?:r|miento)?)\b/i;

// ── Sector ranking: ranking/top/best/worst over a sector or index ──
const RANKING_RE = /\b(ranking|top\s*\d{1,2}|top\b|mejores?|peores?|m[aá]s\s+(?:reputad[oa]s?|valorad[oa]s?))\b/i;
// Cold-start safety net: covers the 21 canonical_keys of rix_semantic_groups
// so classification works even before warmSemanticHintCache() finishes.
// Single source of truth at runtime is the DB-backed hot-set; this regex is
// the fallback used until warm-up completes (and a permanent floor for the
// most common sector lexicon).
const SECTOR_HINT_RE = /\b(sector|ibex(?:[-\s]?\d+)?|bancos?|banca|el[eé]ctric[oa]s?|energ[ií]a|renovables?|verdes|solar|e[oó]licas?|fotovoltaicas?|farma|farmas?|farmac[eé]uticas?|pharma|biotech|biotecnol[oó]gicas?|telecos?|telecomunicaciones?|operadoras?|construc(?:cion|toras?)|retail|supermercados?|distribuci[oó]n\s+alimentaria|aerolineas?|aerol[ií]neas?|hospital(?:es|ario|arios)?|sanitari[oa]s?|salud|cl[ií]nicas?|seguros?|asegurador[oa]s?|alimentaci[oó]n|automoci[oó]n|automotriz|inmobiliari[oa]s?|socimis?|hoteler[oa]s?|turismo|tur[ií]stic[oa]s?|log[ií]stica|distribuci[oó]n|restauraci[oó]n|consultor[ií]a|siderurgia|sider[uú]rgicas?|acereras?|metal[uú]rgicas?|petroqu[ií]mica|petroleras?|hidrocarburos|industrial(?:es)?|qu[ií]mic[oa]s?|textil|moda|lujo|fashion|fragancias?|bodegas?|vin[ií]colas?|cerveceras?|defensa|armamento|big\s*tech|gafam|faang|big\s*four|big\s*4|auditoras?|medios|prensa|televisi[oó]n|televisiones|otas|promotoras?)\b/i;

// ── Model divergence: explicit comparison of AI models / consensus ─
const DIVERGENCE_RE = /\b(divergen(?:cia|tes?)|discrepan(?:cia|tes?)|consenso|disenso|en\s+qu[eé]\s+coinciden|en\s+qu[eé]\s+(?:no\s+)?se\s+ponen\s+de\s+acuerdo|diferencias?\s+entre\s+(?:ias?|modelos?|llms?))\b/i;

// ── Period evolution: temporal trend / history ─────────────────────
const EVOLUTION_RE = /\b(evoluci[oó]n|evoluciona|tendencia|trayectoria|historic[oa]|hist[oó]ric[oa]|ha\s+(?:subido|bajado|mejorado|empeorado)|c[oó]mo\s+(?:ha\s+)?cambiado|trimestre|semestre|[uú]ltim[oa]s?\s+(?:\d+\s+)?(?:semanas?|meses?)|primer\s+(?:trimestre|semestre)|segundo\s+(?:trimestre|semestre))\b/i;

// ── Explicit AI model names (used to demote false sector_ranking) ──
const MODEL_NAMES_RE = /\b(grok|perplexity|deepseek|deep\s*seek|chatgpt|chat\s*gpt|gpt[-\s]?\d?|gemini|qwen|claude|llama)\b/i;

// Crude entity counter: count of capitalised tokens that look like brands.
function approxEntityCount(question: string): number {
  const matches = question.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}\b|\b[A-Z]{3,}\b/g) || [];
  // Filter out common Spanish leading verbs / connectors / month names.
  const STOP = new Set([
    "Reputacion","Reputación","Compara","Comparar","Analisis","Análisis","Informe",
    "Ranking","Evolucion","Evolución","Dame","Dime","Quiero","Mostrar","Hazme",
    "Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    "IBEX","Q1","Q2","Q3","Q4",
  ]);
  const uniq = new Set<string>();
  for (const m of matches) if (!STOP.has(m)) uniq.add(m);
  return uniq.size;
}

export function classifyIntent(question: string): Intent {
  if (!question || !question.trim()) return "general_question";
  const raw = question.trim();
  const lower = norm(raw);

  if (WELCOME_RE.test(raw)) return "general_question";
  if (OUT_OF_SCOPE_RE.test(lower)) return "out_of_scope";

  // Comparison detection: explicit comparator + ≥2 brand-shaped tokens OR
  // a canonical-group alias ("compárame las renovables" → comparison/sector).
  // We treat a canonical-group hit as worth ≥2 entities for this branch so
  // that "compárame los X" routes into the comparison/sector lane instead of
  // collapsing to company_analysis on a single fuzzy hit.
  const groupHinted =
    hasSemanticGroupAlias(raw) || SECTOR_HINT_RE.test(raw) || SECTOR_HINT_RE.test(lower);
  if (COMPARISON_RE.test(raw) && (approxEntityCount(raw) >= 2 || groupHinted)) {
    // "compárame las renovables" → sector_ranking is the right lane (group, not 2 entities).
    if (approxEntityCount(raw) < 2 && groupHinted) return "sector_ranking";
    return "comparison";
  }

  // ── Ranking branch ────────────────────────────────────────────────
  // If "ranking" appears WITH explicit AI-model names (Grok, Perplexity…)
  // AND a company/sector hint, it is actually a model-divergence query
  // ("which model rates X higher?"), NOT a sector ranking. Demote.
  if (RANKING_RE.test(raw)) {
    const mentionsModels = MODEL_NAMES_RE.test(raw);
    const hasCompanyOrGroup = approxEntityCount(raw) >= 1 || SECTOR_HINT_RE.test(raw) || hasSemanticGroupAlias(raw);
    if (mentionsModels && hasCompanyOrGroup) return "model_divergence";
    if (SECTOR_HINT_RE.test(raw) || /\bibex/i.test(raw) || hasSemanticGroupAlias(raw)) return "sector_ranking";
    // "ranking" alone (no sector, no company) → default sector ranking.
    return "sector_ranking";
  }

  // Sector hint without explicit ranking keyword → still sector_ranking.
  // Must be checked BEFORE divergence/evolution so that queries like
  // "dame los datos de la última semana de los grupos hospitalarios"
  // are not mis-classified as period_evolution (which then gets promoted
  // to company_analysis once a stray fuzzy entity is resolved).
  if (SECTOR_HINT_RE.test(raw) || SECTOR_HINT_RE.test(lower) || hasSemanticGroupAlias(raw)) return "sector_ranking";

  if (DIVERGENCE_RE.test(lower)) return "model_divergence";

  if (EVOLUTION_RE.test(lower)) return "period_evolution";

  return "company_analysis";
}

export const __test__ = { norm, approxEntityCount };