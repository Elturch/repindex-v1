// chat-intelligence-v2 / parsers / intentClassifier.ts
// Deterministic intent classification (max 200 LOC, no prompts, no SQL).
// Maps a free-text question to one of the canonical Intent values.
import type { Intent } from "../types.ts";

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
const SECTOR_HINT_RE = /\b(sector|ibex(?:[-\s]?\d+)?|bancos?|el[eé]ctric[oa]s?|energ[ií]a|farma|farmac[eé]uticas?|telecos?|telecomunicaciones?|construc(?:cion|toras?)|retail|supermercados?|aerolineas?|aerol[ií]neas?)\b/i;

// ── Model divergence: explicit comparison of AI models / consensus ─
const DIVERGENCE_RE = /\b(divergen(?:cia|tes?)|discrepan(?:cia|tes?)|consenso|disenso|en\s+qu[eé]\s+coinciden|en\s+qu[eé]\s+(?:no\s+)?se\s+ponen\s+de\s+acuerdo|diferencias?\s+entre\s+(?:ias?|modelos?|llms?))\b/i;

// ── Period evolution: temporal trend / history ─────────────────────
const EVOLUTION_RE = /\b(evoluci[oó]n|evoluciona|tendencia|trayectoria|historic[oa]|hist[oó]ric[oa]|ha\s+(?:subido|bajado|mejorado|empeorado)|c[oó]mo\s+(?:ha\s+)?cambiado|trimestre|semestre|[uú]ltim[oa]s?\s+\d+\s+(?:semanas?|meses?)|primer\s+(?:trimestre|semestre)|segundo\s+(?:trimestre|semestre))\b/i;

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

  if (COMPARISON_RE.test(raw) && approxEntityCount(raw) >= 2) return "comparison";

  if (RANKING_RE.test(raw) && (SECTOR_HINT_RE.test(raw) || /\bibex/i.test(raw))) {
    return "sector_ranking";
  }
  // "ranking" alone (without explicit sector) still defaults to sector_ranking
  if (RANKING_RE.test(raw)) return "sector_ranking";

  if (DIVERGENCE_RE.test(lower)) return "model_divergence";

  if (EVOLUTION_RE.test(lower)) return "period_evolution";

  return "company_analysis";
}

export const __test__ = { norm, approxEntityCount };