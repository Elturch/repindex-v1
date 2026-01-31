/**
 * RIX Metrics Glossary - Canonical Single Source of Truth
 * 
 * CRITICAL: This is the ONLY place where RIX metrics are defined.
 * All UI components, edge functions, and reports MUST import from here.
 * 
 * DO NOT create alternative definitions elsewhere in the codebase.
 */

import {
  MessageSquare,
  FileCheck,
  Shield,
  Clock,
  AlertTriangle,
  Building2,
  Database,
  TrendingUp,
  type LucideIcon
} from "lucide-react";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface MetricDefinition {
  /** 3-letter acronym (e.g., "NVM") */
  acronym: string;
  
  /** Technical name in English (e.g., "Narrative Value Metric") */
  technicalName: string;
  
  /** Technical formula/methodology (for annexes) */
  technicalDescription: string;
  
  /** Executive name in Spanish for reports (e.g., "Calidad de la Narrativa") */
  executiveName: string;
  
  /** Executive description for business users */
  executiveDescription: string;
  
  /** Justification for the technical→executive mapping */
  mappingJustification: string;
  
  /** Lucide icon name for UI */
  iconName: string;
  
  /** Weight in the RIX formula (0.10 = 10%) */
  weight: number;
  
  /** Whether this metric uses inverse scoring (higher = less risk) */
  inverseScoring: boolean;
  
  /** Color class for UI theming */
  colorClass: string;
}

// =============================================================================
// CANONICAL METRICS GLOSSARY
// =============================================================================

export const RIX_METRICS_GLOSSARY: MetricDefinition[] = [
  {
    acronym: "NVM",
    technicalName: "Narrative Value Metric",
    technicalDescription: "NVM = clip(50*(s̄+1) - 20*c̄ - 30*h̄). Donde s̄ = sentimiento medio normalizado [-1,1], c̄ = ratio de controversia detectada, h̄ = ratio de afirmaciones sin soporte verificable.",
    executiveName: "Calidad de la Narrativa",
    executiveDescription: "Evalúa la coherencia y calidad del discurso público de la empresa según las IAs. Un NVM alto indica narrativa clara, bajo nivel de controversia y afirmaciones verificables. Mide 'cómo de bien cuenta su historia la empresa'.",
    mappingJustification: "El nombre ejecutivo 'Calidad de la Narrativa' refleja que esta métrica mide la coherencia del discurso corporativo, NO visibilidad mediática ni cobertura de prensa.",
    iconName: "MessageSquare",
    weight: 0.15,
    inverseScoring: false,
    colorClass: "text-blue-500",
  },
  {
    acronym: "DRM",
    technicalName: "Data Reliability Metric",
    technicalDescription: "DRM = w₁·fuentes_primarias + w₂·corroboración_múltiple + w₃·trazabilidad_documental. Evalúa calidad de evidencia citada por las IAs.",
    executiveName: "Fortaleza de Evidencia",
    executiveDescription: "Mide la solidez y verificabilidad de las afirmaciones citadas por las IAs sobre la empresa. Un DRM alto indica fuentes primarias verificables, corroboración múltiple y trazabilidad documental.",
    mappingJustification: "El nombre ejecutivo 'Fortaleza de Evidencia' refleja que esta métrica mide calidad de documentación, NO desempeño financiero ni resultados empresariales.",
    iconName: "FileCheck",
    weight: 0.15,
    inverseScoring: false,
    colorClass: "text-green-500",
  },
  {
    acronym: "SIM",
    technicalName: "Source Integrity Metric",
    technicalDescription: "SIM = Σ(tier_weight × mention_count). Jerarquía: T1 (45%): CNMV, SEC, Reuters, Bloomberg, FT, casas de análisis. T2 (30%): Generalistas (El País, El Mundo). T3 (15%): Especializados. T4 (10%): Opinión, redes.",
    executiveName: "Autoridad de Fuentes",
    executiveDescription: "Evalúa la calidad de las fuentes que mencionan a la empresa. Un SIM alto indica presencia en fuentes Tier-1 (reguladores, prensa financiera de referencia) vs Tier-4 (redes sociales, foros).",
    mappingJustification: "El nombre ejecutivo 'Autoridad de Fuentes' refleja que esta métrica mide jerarquía de fuentes citadas, NO sostenibilidad, ESG ni impacto ambiental.",
    iconName: "Shield",
    weight: 0.12,
    inverseScoring: false,
    colorClass: "text-emerald-500",
  },
  {
    acronym: "RMM",
    technicalName: "Reputational Momentum Metric",
    technicalDescription: "RMM = (hechos_en_ventana_7d / total_hechos) × 100. Penalización: si <50% en ventana → RMM máximo = 69.",
    executiveName: "Actualidad y Empuje",
    executiveDescription: "Mide la frescura temporal de las menciones sobre la empresa. Un RMM alto indica que la información citada por las IAs es reciente y relevante a la ventana semanal analizada.",
    mappingJustification: "El nombre ejecutivo 'Actualidad y Empuje' refleja que esta métrica mide recencia de información, NO reputación de marca ni marketing.",
    iconName: "Clock",
    weight: 0.12,
    inverseScoring: false,
    colorClass: "text-purple-500",
  },
  {
    acronym: "CEM",
    technicalName: "Controversy Exposure Metric",
    technicalDescription: "CEM = 100 - (w_judicial×riesgos_judiciales + w_político×riesgos_políticos + w_laboral×riesgos_laborales). Puntuación INVERSA: 100 = sin controversias.",
    executiveName: "Gestión de Controversias",
    executiveDescription: "Evalúa la exposición a controversias y riesgos reputacionales. Un CEM alto (cercano a 100) indica baja exposición a riesgos judiciales, políticos o laborales. Puntuación inversa: más alto = menos riesgo.",
    mappingJustification: "El nombre ejecutivo 'Gestión de Controversias' refleja que esta métrica mide exposición a riesgos, NO comportamiento ético general ni gobernanza.",
    iconName: "AlertTriangle",
    weight: 0.12,
    inverseScoring: true,
    colorClass: "text-amber-500",
  },
  {
    acronym: "GAM",
    technicalName: "Governance Autonomy Metric",
    technicalDescription: "GAM = percepción de independencia de gobierno corporativo. Factores: policies declaradas, conflictos de interés, transparencia de junta directiva.",
    executiveName: "Percepción de Gobernanza Corporativa",
    executiveDescription: "Mide cómo las IAs perciben la autonomía e independencia del gobierno corporativo de la empresa. Un GAM alto indica percepción de buenas prácticas de gobernanza y baja interferencia externa.",
    mappingJustification: "El nombre ejecutivo 'Percepción de Gobierno' refleja que esta métrica mide independencia percibida, NO gestión de talento ni employer branding.",
    iconName: "Building2",
    weight: 0.12,
    inverseScoring: false,
    colorClass: "text-pink-500",
  },
  {
    acronym: "DCM",
    technicalName: "Data Consistency Metric",
    technicalDescription: "DCM = 1 - (σ_intermodelo / μ_intermodelo). Evalúa coherencia de datos estructurales (actividad principal, liderazgo ejecutivo, estructura accionarial, relaciones corporativas) entre los 6 modelos. Factores: coincidencia en CEO/presidente, sector declarado, fechas de fundación, cifras de empleados, principales accionistas.",
    executiveName: "Coherencia Informativa",
    executiveDescription: "Mide la coherencia de los datos estructurales clave de la empresa (actividad, liderazgo, estructura corporativa, relaciones) entre los 6 modelos de IA analizados (ChatGPT, Gemini, Perplexity, DeepSeek, Grok, Qwen). Un DCM alto indica que los modelos coinciden en los hechos fundamentales. La inconsistencia en estos datos erosiona la credibilidad y debilita el resto del edificio reputacional algorítmico.",
    mappingJustification: "El nombre ejecutivo 'Coherencia Informativa' refleja que esta métrica mide estabilidad de datos estructurales clave entre modelos de IA. La inconsistencia en información fundamental (liderazgo, actividad, estructura) erosiona la credibilidad y debilita las demás métricas reputacionales. NO mide capacidad digital ni innovación tecnológica.",
    iconName: "Database",
    weight: 0.12,
    inverseScoring: false,
    colorClass: "text-cyan-500",
  },
  {
    acronym: "CXM",
    technicalName: "Corporate Execution Metric",
    technicalDescription: "CXM = f(cotización_bursátil, ratings_ESG_verificables, percepciones_ejecución). Solo aplica a empresas cotizadas; si no cotiza, se redistribuyen pesos.",
    executiveName: "Ejecución Corporativa",
    executiveDescription: "Mide la percepción de ejecución corporativa y su reflejo en indicadores de mercado. Solo aplica a empresas cotizadas; para no cotizadas, esta métrica no se evalúa y su peso (10%) se redistribuye proporcionalmente al resto. Un CXM = 0 indica inaplicabilidad, no mal desempeño.",
    mappingJustification: "El nombre ejecutivo 'Ejecución Corporativa' refleja que esta métrica mide impacto en mercado, NO experiencia del cliente ni satisfacción.",
    iconName: "TrendingUp",
    weight: 0.10,
    inverseScoring: false,
    colorClass: "text-red-500",
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Get a metric definition by its acronym */
export function getMetricByAcronym(acronym: string): MetricDefinition | undefined {
  return RIX_METRICS_GLOSSARY.find(m => m.acronym === acronym);
}

/** Get all metric acronyms */
export function getMetricAcronyms(): string[] {
  return RIX_METRICS_GLOSSARY.map(m => m.acronym);
}

/** Get icon component for a metric */
export function getMetricIcon(acronym: string): LucideIcon {
  const iconMap: Record<string, LucideIcon> = {
    MessageSquare,
    FileCheck,
    Shield,
    Clock,
    AlertTriangle,
    Building2,
    Database,
    TrendingUp,
  };
  
  const metric = getMetricByAcronym(acronym);
  return iconMap[metric?.iconName || "MessageSquare"] || MessageSquare;
}

/** Generate the canonical glossary prompt for LLM injection */
export function getMetricsGlossaryPrompt(): string {
  const tableRows = RIX_METRICS_GLOSSARY.map(m => 
    `| ${m.acronym} | ${m.technicalName} | ${m.executiveName} | ${m.inverseScoring ? 'Inverso (100=sin riesgo)' : 'Directo (100=óptimo)'} |`
  ).join('\n');

  return `
## GLOSARIO CANÓNICO DE MÉTRICAS RIX (OBLIGATORIO)

IMPORTANTE: Usa EXACTAMENTE estos nombres técnicos y ejecutivos. NO inventes interpretaciones alternativas.

| Sigla | Nombre Técnico | Nombre Ejecutivo | Tipo |
|-------|----------------|------------------|------|
${tableRows}

### Definiciones Técnicas:
${RIX_METRICS_GLOSSARY.map(m => `- **${m.acronym}** (${m.technicalName}): ${m.executiveDescription}`).join('\n')}

### ⚠️ ERRORES COMUNES A EVITAR:
- **SIM** NO mide sostenibilidad/ESG. Mide JERARQUÍA DE FUENTES (Tier 1-4).
- **DRM** NO mide desempeño financiero. Mide CALIDAD DE EVIDENCIA documental.
- **DCM** NO mide innovación digital. Mide COHERENCIA DE DATOS ESTRUCTURALES (actividad, liderazgo, estructura, relaciones) entre los 6 modelos de IA. La inconsistencia erosiona credibilidad.
- **GAM** NO mide gestión de talento. Mide PERCEPCIÓN DE GOBIERNO corporativo.
- **RMM** NO mide marketing. Mide FRESCURA TEMPORAL de menciones.
- **CEM** NO mide ética general. Mide EXPOSICIÓN A CONTROVERSIAS (puntuación inversa).
- **CXM** NO mide experiencia cliente. Mide EJECUCIÓN CORPORATIVA en mercado.
- **NVM** NO mide visibilidad mediática. Mide CALIDAD DE LA NARRATIVA.
`;
}

/** Generate the metric mapping table for reports (exhaustive level) */
export function getMetricMappingTableMarkdown(): string {
  return `
## Correspondencia de Métricas RIX

| Sigla | Nombre Técnico | Interpretación Ejecutiva | Peso |
|-------|----------------|--------------------------|------|
${RIX_METRICS_GLOSSARY.map(m => `| ${m.acronym} | ${m.technicalName} | ${m.executiveName} | ${Math.round(m.weight * 100)}% |`).join('\n')}

*Nota: CEM usa puntuación inversa (100 = sin controversias). CXM solo aplica a cotizadas.*
`;
}

/** Generate technical annex HTML for PDF exports */
export function getMetricDefinitionsForAnnex(): string {
  return RIX_METRICS_GLOSSARY.map(m => `
    <tr>
      <td><strong>${m.acronym}</strong></td>
      <td>${Math.round(m.weight * 100)}%</td>
      <td>${m.technicalName}: ${m.technicalDescription}</td>
    </tr>
  `).join('');
}

// =============================================================================
// LEGACY MAPPING (for backward compatibility during migration)
// Maps old incorrect names to correct technical names
// =============================================================================
export const LEGACY_NAME_CORRECTIONS: Record<string, { correct: string; warning: string }> = {
  "Narrativa y Visibilidad Mediática": { 
    correct: "Narrative Value Metric (Calidad de la Narrativa)", 
    warning: "NVM mide calidad de narrativa, no visibilidad mediática" 
  },
  "Desempeño y Resultados Empresariales": { 
    correct: "Data Reliability Metric (Fortaleza de Evidencia)", 
    warning: "DRM mide calidad de evidencia, no desempeño financiero" 
  },
  "Sostenibilidad e Impacto Ambiental": { 
    correct: "Source Integrity Metric (Autoridad de Fuentes)", 
    warning: "SIM mide jerarquía de fuentes, no sostenibilidad ESG" 
  },
  "Reputación de Marca y Marketing": { 
    correct: "Reputational Momentum Metric (Actualidad y Empuje)", 
    warning: "RMM mide frescura temporal, no marketing" 
  },
  "Comportamiento Ético y Gobierno": { 
    correct: "Controversy Exposure Metric (Gestión de Controversias)", 
    warning: "CEM mide exposición a controversias, no ética general" 
  },
  "Gestión y Atracción del Talento": { 
    correct: "Governance Autonomy Metric (Percepción de Gobierno)", 
    warning: "GAM mide percepción de gobierno, no gestión de talento" 
  },
  "Digital y Capacidad de Innovación": { 
    correct: "Data Consistency Metric (Coherencia Informativa)", 
    warning: "DCM mide coherencia entre IAs, no innovación digital" 
  },
  "Experiencia del Cliente": { 
    correct: "Corporate Execution Metric (Ejecución Corporativa)", 
    warning: "CXM mide ejecución corporativa, no experiencia cliente" 
  },
};
