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
const EVOLUTION_PATTERNS = /\b(evoluci[oó]n|tendencia|trend|hist[oó]ric|temporal|semanas?|weeks?|últim[oa]s?|progres|evolution|history|trajectory|evolução|evolucao|evolució|evolucio|trayectoria|serie\s+temporal|time\s+series)\b/i;
const RANKING_PATTERNS = /\b(ranking|clasificaci[oó]n|top|bottom|botom|mejor|peor|peores|l[ií]der|rezagad|posici[oó]n|puesto|colistas?|cola|últimos|los\s+m[aá]s\s+bajos|worst|best|leaders?|laggards?|leaderboard|classificação|classificacao|classificació|classificacio|best\s+performing|top\s+rated|highest|lowest)\b/i;
const SECTOR_PATTERNS = /\b(sector|sectorial|comparar sectores?|banc[a-z]*|energ[ií\u00e9][a-z]*|tecnol[oó\u00f3]g[a-z]*|telecomunicaci[a-z]*|utilities|construcci[oó]n|constructora[s]?|inmobiliaria[s]?|alimentaci[oó]n|alimentaria[s]?|seguros?|aseguradora[s]?|turismo|tur[ií]stic[a-z]*|textil|pharma|salud|farmac[eé]utic[a-z]*|industry|indústria|industria)\b/i;
const DIVERGENCE_PATTERNS = /\b(divergencia|consenso|discrepancia|acuerdo|desacuerdo|modelos? difieren|spread|dispersi[oó]n|desacoplamiento|brecha|desfase|desconexi[oó]n|descorrelaci[oó]n|desalineaci[oó]n|asimetr[ií]a|desajuste|desequilibrio|disociaci[oó]n|desvinculaci[oó]n|decoupling|disconnect|misalignment|gap|mismatch|asymmetry|deviation|disparity|imbalance|delinking|divergence|divergência|desacoplamento|desconexão|desconexao|desalinhamento|desacoblament|desconnexió|desconnexio|bretxa)\b/i;
const COMPANY_QUESTION_PATTERNS = /\b(c[oó]mo est[aá]|qu[eé] tal|an[aá]lisis|diagn[oó]stico|situaci[oó]n|reputaci[oó]n|score|puntuaci[oó]n|nota|analyze|analyse|evaluate|how is|status of|assessment|analisa|avalia|analitza)\b/i;
const CXM_PATTERNS = /\b(cotizaci[oó]n|precio de mercado|capitalizaci[oó]n burs[aá]til|valor en bolsa|precio de la acci[oó]n|valoraci[oó]n burs[aá]til|precio burs[aá]til|valor burs[aá]til|stock price|market valuation|market cap|share price|equity valuation|market price|trading price|cotação|cotacao|preço de mercado|preco de mercado|capitalização bolsista|capitalizacao bolsista|valor em bolsa|cotització|cotitzacio|preu de mercat|capitalitzaci[oó] bors[aà]ria|per|múltiplo|multiplo|precio objetivo|target price)\b/i;
// Financial terms that should trigger company_analysis
const FINANCIAL_PATTERNS = /\b(beneficio|ingresos|facturaci[oó]n|ebitda|margen|rentabilidad|resultados\s+(?:trimestral|anual)|earnings|revenue|profit|dividendo|payout|deuda|apalancamiento|leverage|endeudamiento)\b/i;
// Corporate events
const CORPORATE_EVENT_PATTERNS = /\b(opa|fusi[oó]n|adquisici[oó]n|m&a|spin[\s-]?off|ipo|opv|takeover|merger|acquisition|ampliaci[oó]n\s+de\s+capital)\b/i;
// ESG / Governance
const ESG_PATTERNS = /\b(esg|sostenibilidad|gobernanza|gobierno\s+corporativo|sustainability|governance|responsabilidad\s+social)\b/i;

// Common sector names → sector_category values
const SECTOR_MAP: Record<string, string> = {
  banca: "Banca y Servicios Financieros", banco: "Banca y Servicios Financieros", bancos: "Banca y Servicios Financieros", bancario: "Banca y Servicios Financieros", bancaria: "Banca y Servicios Financieros", bancarias: "Banca y Servicios Financieros", bancarios: "Banca y Servicios Financieros", financiero: "Banca y Servicios Financieros", financiera: "Banca y Servicios Financieros",
  energía: "Energía y Gas", energia: "Energía y Gas", energética: "Energía y Gas", energetica: "Energía y Gas", energéticas: "Energía y Gas", energeticas: "Energía y Gas", energético: "Energía y Gas", energetico: "Energía y Gas", energéticos: "Energía y Gas", energeticos: "Energía y Gas", utilities: "Energía y Gas", gas: "Energía y Gas",
  tecnología: "Telecomunicaciones y Tecnología", tecnologia: "Telecomunicaciones y Tecnología", tecnológica: "Telecomunicaciones y Tecnología", tecnologica: "Telecomunicaciones y Tecnología", tecnológicas: "Telecomunicaciones y Tecnología", tecnologicas: "Telecomunicaciones y Tecnología", tecnológico: "Telecomunicaciones y Tecnología", tecnologico: "Telecomunicaciones y Tecnología",
  telecomunicaciones: "Telecomunicaciones y Tecnología", telecom: "Telecomunicaciones y Tecnología", telecomunicación: "Telecomunicaciones y Tecnología", telecomunicacion: "Telecomunicaciones y Tecnología",
  construcción: "Construcción e Infraestructuras", construccion: "Construcción e Infraestructuras", constructora: "Construcción e Infraestructuras", constructoras: "Construcción e Infraestructuras", infraestructura: "Construcción e Infraestructuras", infraestructuras: "Construcción e Infraestructuras",
  inmobiliaria: "Construcción e Infraestructuras", inmobiliarias: "Construcción e Infraestructuras", inmobiliario: "Construcción e Infraestructuras",
  alimentación: "Alimentación", alimentacion: "Alimentación", alimentaria: "Alimentación", alimentarias: "Alimentación", alimentario: "Alimentación",
  seguros: "Seguros", aseguradora: "Seguros", aseguradoras: "Seguros", asegurador: "Seguros",
  turismo: "Hoteles y Turismo", turística: "Hoteles y Turismo", turistica: "Hoteles y Turismo", turísticas: "Hoteles y Turismo", turisticas: "Hoteles y Turismo", turístico: "Hoteles y Turismo", turistico: "Hoteles y Turismo", hoteles: "Hoteles y Turismo", hotel: "Hoteles y Turismo", hotelera: "Hoteles y Turismo", hotelero: "Hoteles y Turismo",
  textil: "Moda y Distribución", moda: "Moda y Distribución",
  pharma: "Salud y Farmacéutico", salud: "Salud y Farmacéutico", farmacéutica: "Salud y Farmacéutico", farmaceutica: "Salud y Farmacéutico", farmacéuticas: "Salud y Farmacéutico", farmaceuticas: "Salud y Farmacéutico", farmacéutico: "Salud y Farmacéutico", farmaceutico: "Salud y Farmacéutico",
  petróleo: "Petróleo y Energía", petroleo: "Petróleo y Energía", petrolera: "Petróleo y Energía", petroleras: "Petróleo y Energía",
  siderurgia: "Materias Primas y Siderurgia", acero: "Materias Primas y Siderurgia",
  automoción: "Automoción", automocion: "Automoción", automotriz: "Automoción",
  transporte: "Transporte", transportes: "Transporte",
  logística: "Logística", logistica: "Logística",
  industria: "Industria", industrial: "Industria", industriales: "Industria",
  consultoría: "Consultoría y Auditoría", consultoria: "Consultoría y Auditoría",
  restauración: "Restauración", restauracion: "Restauración",
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

    // ── Detect CXM / stock price queries first (high priority) ─────
    if (CXM_PATTERNS.test(lower)) {
      intent = "company_analysis";
      recommended_skills.push("skillGetCompanyScores", "skillGetCompanyDetail", "skillGetDivergenceAnalysis");
      filters.metric_focus = "CXM";
      confidence = 0.9;
    }
    // ── Detect intent by pattern priority ────────────────────────
    else if (EVOLUTION_PATTERNS.test(lower)) {
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
      if (IBEX_PATTERNS.test(lower)) filters.ibex_family_code = "IBEX-35";
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
      filters.ibex_family_code = "IBEX-35";
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
