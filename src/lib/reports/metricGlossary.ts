/**
 * Canonical single source of truth for the 8 RIX metrics.
 * MUST be imported by every place that names, describes, weights or acts on a metric.
 *
 * Rules:
 *  - All 8 metrics are on a 0–100 scale where HIGHER = BETTER (no exceptions).
 *  - CXM = N/A for non-listed entities.
 */

export type MetricKey =
  | "nvm"
  | "drm"
  | "sim"
  | "rmm"
  | "cem"
  | "gam"
  | "dcm"
  | "cxm";

export interface MetricDef {
  key: MetricKey;
  code: string;
  name: string;
  what: string;
  weight: number;
  action: string;
}

export const METRIC_GLOSSARY: MetricDef[] = [
  {
    key: "nvm",
    code: "NVM",
    name: "Calidad de la narrativa",
    what: "Coherencia del discurso, nivel de controversia y afirmaciones verificables",
    weight: 15,
    action:
      "Reforzar la coherencia del discurso y respaldar cada afirmación con datos verificables.",
  },
  {
    key: "drm",
    code: "DRM",
    name: "Fortaleza de la evidencia",
    what: "Calidad de fuentes primarias, corroboración y trazabilidad documental",
    weight: 15,
    action:
      "Aportar fuentes primarias trazables: hechos relevantes, informes oficiales y datos regulatorios.",
  },
  {
    key: "sim",
    code: "SIM",
    name: "Autoridad de las fuentes",
    what: "Jerarquía de las fuentes que citan a la entidad (Tier-1 reguladores/financieros a Tier-4 opinión/redes)",
    weight: 12,
    action:
      "Buscar cobertura de fuentes de mayor autoridad (Tier-1: reguladores, financieros y medios de referencia).",
  },
  {
    key: "rmm",
    code: "RMM",
    name: "Actualidad y empuje",
    what: "Frescura temporal de las menciones en la ventana analizada",
    weight: 12,
    action:
      "Generar actualidad reciente: hitos y noticias dentro de la ventana semanal.",
  },
  {
    key: "cem",
    code: "CEM",
    name: "Gestión de controversias",
    what: "Baja exposición a riesgos y controversias (100 = sin controversias)",
    weight: 12,
    action: "Reducir y gestionar la exposición a controversias y riesgos.",
  },
  {
    key: "gam",
    code: "GAM",
    name: "Percepción de gobierno",
    what: "Señales de independencia y buenas prácticas de gobernanza",
    weight: 12,
    action:
      "Comunicar independencia y buenas prácticas de gobierno corporativo.",
  },
  {
    key: "dcm",
    code: "DCM",
    name: "Coherencia informativa",
    what: "Consistencia de la información entre los 6 modelos de IA",
    weight: 12,
    action:
      "Homogeneizar los mensajes clave para que los 6 modelos coincidan.",
  },
  {
    key: "cxm",
    code: "CXM",
    name: "Ejecución corporativa",
    what: "Percepción de ejecución en el mercado y cotización bursátil (solo cotizadas)",
    weight: 10,
    action: "Reforzar la percepción de ejecución en el mercado.",
  },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = METRIC_GLOSSARY.reduce(
  (acc, m) => {
    acc[m.key] = m;
    return acc;
  },
  {} as Record<MetricKey, MetricDef>,
);