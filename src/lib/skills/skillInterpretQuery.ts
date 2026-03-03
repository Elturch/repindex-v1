import type { SkillResult } from "./shared";

// ── Intent types ────────────────────────────────────────────────────
export type QueryIntent =
  | "company_analysis"
  | "ranking"
  | "evolution"
  | "sector_comparison"
  | "divergence"
  | "general_question"
  | "off_topic";

export interface InterpretedQuery {
  intent: QueryIntent;
  entities: string[];
  time_range?: string;
  filters: Record<string, string>;
  recommended_skills: string[];
  confidence: number;
}

export interface InterpretQueryInput {
  question: string;
  context?: {
    previous_company?: string;
    previous_ticker?: string;
  };
}

// ── Known patterns ──────────────────────────────────────────────────
const IBEX_PATTERNS = /\b(ibex[- ]?35|ibex|índice|indice)\b/i;
const EVOLUTION_PATTERNS = /\b(evoluci[oó]n|tendencia|trend|hist[oó]ric|temporal|semanas?|weeks?|últim[oa]s?|progres)/i;
const RANKING_PATTERNS = /\b(ranking|clasificaci[oó]n|top|mejor|peor|l[ií]der|rezagad|posici[oó]n|puesto)/i;
const SECTOR_PATTERNS = /\b(sector|sectorial|comparar sectores?|banca|energ[ií]a|tecnolog[ií]a|telecomunicacion|utilities|construcci[oó]n|inmobiliaria|alimentaci[oó]n|seguros?|turismo|textil|pharma|salud)/i;
const DIVERGENCE_PATTERNS = /\b(divergencia|consenso|discrepancia|acuerdo|desacuerdo|modelos? difieren|spread|dispersi[oó]n)/i;
const COMPANY_QUESTION_PATTERNS = /\b(c[oó]mo est[aá]|qu[eé] tal|an[aá]lisis|diagn[oó]stico|situaci[oó]n|reputaci[oó]n|score|puntuaci[oó]n|nota)\b/i;

// Common sector names → sector_category values
const SECTOR_MAP: Record<string, string> = {
  banca: "Banca",
  banco: "Banca",
  bancos: "Banca",
  energía: "Energía",
  energia: "Energía",
  tecnología: "Tecnología",
  tecnologia: "Tecnología",
  telecomunicaciones: "Telecomunicaciones",
  telecom: "Telecomunicaciones",
  construcción: "Construcción",
  construccion: "Construcción",
  inmobiliaria: "Inmobiliaria",
  alimentación: "Alimentación",
  alimentacion: "Alimentación",
  seguros: "Seguros",
  turismo: "Turismo y Ocio",
  textil: "Textil y Moda",
  pharma: "Pharma y Salud",
  salud: "Pharma y Salud",
  utilities: "Utilities",
};

// ── Main classifier ─────────────────────────────────────────────────
export function skillInterpretQuery(
  params: InterpretQueryInput
): SkillResult<InterpretedQuery> {
  try {
    const q = params.question.trim();
    if (!q) {
      return { success: false, error: "Empty question" };
    }

    const lower = q.toLowerCase();
    const entities: string[] = [];
    const filters: Record<string, string> = {};
    let intent: QueryIntent = "general_question";
    const recommended_skills: string[] = [];
    let confidence = 0.6;

    // ── Detect sector ───────────────────────────────────────────
    const sectorMatch = lower.match(SECTOR_PATTERNS);
    if (sectorMatch) {
      const key = sectorMatch[0].toLowerCase();
      if (SECTOR_MAP[key]) {
        filters.sector_category = SECTOR_MAP[key];
        entities.push(SECTOR_MAP[key]);
      }
    }

    // ── Detect intent by pattern priority ────────────────────────
    if (EVOLUTION_PATTERNS.test(lower)) {
      intent = "evolution";
      recommended_skills.push("skillGetCompanyEvolution", "skillGetCompanyScores");
      confidence = 0.85;
    } else if (DIVERGENCE_PATTERNS.test(lower)) {
      intent = "divergence";
      recommended_skills.push("skillGetDivergenceAnalysis", "skillGetCompanyScores");
      confidence = 0.85;
    } else if (RANKING_PATTERNS.test(lower)) {
      intent = "ranking";
      recommended_skills.push("skillGetCompanyRanking");
      if (filters.sector_category) {
        recommended_skills.push("skillGetSectorComparison");
      }
      confidence = 0.85;
    } else if (SECTOR_PATTERNS.test(lower) && filters.sector_category) {
      intent = "sector_comparison";
      recommended_skills.push("skillGetSectorComparison", "skillGetCompanyRanking");
      confidence = 0.8;
    } else if (IBEX_PATTERNS.test(lower)) {
      intent = "ranking";
      filters.ibex_family_code = "IBEX35";
      recommended_skills.push("skillGetCompanyRanking");
      confidence = 0.9;
    } else if (COMPANY_QUESTION_PATTERNS.test(lower)) {
      intent = "company_analysis";
      recommended_skills.push("skillGetCompanyScores", "skillGetCompanyDetail", "skillGetDivergenceAnalysis");
      confidence = 0.75;
    }

    // If no clear intent but there's a context company, assume company analysis
    if (intent === "general_question" && (params.context?.previous_ticker || params.context?.previous_company)) {
      intent = "company_analysis";
      recommended_skills.push("skillGetCompanyScores", "skillGetCompanyDetail");
      confidence = 0.5;
    }

    // Always add company detail for company-level intents
    if (
      ["company_analysis", "evolution", "divergence"].includes(intent) &&
      !recommended_skills.includes("skillGetCompanyDetail")
    ) {
      recommended_skills.push("skillGetCompanyDetail");
    }

    // If still general, add raw texts as fallback
    if (intent === "general_question") {
      recommended_skills.push("skillGetCompanyDetail");
      confidence = 0.3;
    }

    return {
      success: true,
      data: {
        intent,
        entities,
        filters,
        recommended_skills,
        confidence,
      },
    };
  } catch (e: unknown) {
    return { success: false, error: `skillInterpretQuery exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}
