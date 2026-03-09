import { useState, useRef, useEffect } from "react";
import { ChatLanguage } from "@/lib/chatLanguages";

interface ChatQueryGuideProps {
  language: ChatLanguage;
  onSelectExample: (text: string) => void;
}

const LABEL: Record<string, string> = {
  es: "💡 Prueba:",
  en: "💡 Try:",
  pt: "💡 Tenta:",
  ca: "💡 Prova:",
  fr: "💡 Essayez :",
  de: "💡 Probiere:",
  it: "💡 Prova:",
};

interface GuideCategory {
  icon: string;
  label: Record<string, string>;
  examples: string[];
}

const CATEGORIES: GuideCategory[] = [
  {
    icon: "📊",
    label: { es: "Análisis", en: "Analysis", pt: "Análise", ca: "Anàlisi", fr: "Analyse", de: "Analyse", it: "Analisi" },
    examples: [
      "Analiza la reputación de Telefónica",
      "Diagnóstico reputacional completo de Repsol",
      "¿Cuáles son las debilidades de Inditex?",
      "Análisis de fortalezas reputacionales de BBVA",
      "Análisis de riesgos reputacionales de Iberdrola",
      "¿Qué dice la IA sobre Grifols?",
      "Análisis de la presencia mediática de Banco Santander",
      "Diagnóstico rápido de Puig",
    ],
  },
  {
    icon: "⚔️",
    label: { es: "Comparar", en: "Compare", pt: "Comparar", ca: "Compara", fr: "Comparer", de: "Vergleichen", it: "Confronta" },
    examples: [
      "Compara BBVA con Banco Santander",
      "¿Quién tiene mejor reputación, Iberdrola o Endesa?",
      "Compara las fortalezas de Repsol vs Naturgy",
      "¿En qué métricas gana CaixaBank a Banco Sabadell?",
      "Compara Inditex con Adolfo Domínguez",
      "Comparativa entre Ferrovial y ACS",
    ],
  },
  {
    icon: "🏆",
    label: { es: "Rankings", en: "Rankings", pt: "Rankings", ca: "Rankings", fr: "Classements", de: "Rankings", it: "Classifiche" },
    examples: [
      "Top 5 del IBEX 35 por reputación",
      "Peores empresas del IBEX 35 esta semana",
      "Ranking de empresas por gestión de controversias (CEM)",
      "¿Qué empresas han subido más esta semana?",
      "¿Qué empresas han caído más esta semana?",
      "Top empresas del BME Growth",
      "Ranking del sector Banca y Servicios Financieros",
      "Empresas con mejor gobernanza (GAM)",
    ],
  },
  {
    icon: "📈",
    label: { es: "Evolución", en: "Trends", pt: "Evolução", ca: "Evolució", fr: "Évolution", de: "Entwicklung", it: "Evoluzione" },
    examples: [
      "Evolución de Repsol en el último mes",
      "¿Cómo ha cambiado la reputación de Inditex?",
      "Tendencia del sector Energía y Gas",
      "¿Qué empresas están mejorando su reputación?",
      "¿Qué empresas están empeorando?",
      "Evolución de Telefónica las últimas 4 semanas",
    ],
  },
  {
    icon: "🔍",
    label: { es: "Divergencia", en: "Divergence", pt: "Divergência", ca: "Divergència", fr: "Divergence", de: "Divergenz", it: "Divergenza" },
    examples: [
      "¿Por qué las IAs divergen sobre Banco Santander?",
      "¿Qué modelo de IA es más crítico con Repsol?",
      "Divergencia entre ChatGPT y Gemini sobre Iberdrola",
      "¿Qué empresa tiene más consenso entre las IAs?",
      "¿Dónde discrepan más los modelos de IA?",
    ],
  },
  {
    icon: "🎯",
    label: { es: "Métricas", en: "Metrics", pt: "Métricas", ca: "Mètriques", fr: "Métriques", de: "Metriken", it: "Metriche" },
    examples: [
      "¿Qué empresa tiene mejor CEM del IBEX 35?",
      "Análisis profundo del NVM de Telefónica",
      "Ranking por DRM (riesgo mediático)",
      "Mejor GAM (gobernanza) del sector Banca",
      "Desglose de métricas de Iberdrola",
    ],
  },
  {
    icon: "📄",
    label: { es: "Sector", en: "Sector", pt: "Setor", ca: "Sector", fr: "Secteur", de: "Sektor", it: "Settore" },
    examples: [
      "Análisis del sector Banca y Servicios Financieros",
      "¿Qué sector tiene mejor reputación?",
      "Comparativa entre sector Energía y Gas vs Telecomunicaciones",
      "Ranking sectorial completo",
      "Sector Salud y Farmacéutico: fortalezas y debilidades",
    ],
  },
  {
    icon: "🚨",
    label: { es: "Alertas", en: "Alerts", pt: "Alertas", ca: "Alertes", fr: "Alertes", de: "Warnungen", it: "Avvisi" },
    examples: [
      "¿Hay alguna empresa en crisis?",
      "¿Qué empresa tiene más riesgo reputacional?",
      "Alertas de reputación esta semana",
      "Empresas en zona de peligro",
      "¿Qué empresas necesitan atención urgente?",
    ],
  },
  {
    icon: "🌐",
    label: { es: "Contexto", en: "Context", pt: "Contexto", ca: "Context", fr: "Contexte", de: "Kontext", it: "Contesto" },
    examples: [
      "Resumen del panorama reputacional esta semana",
      "¿Qué ha pasado en reputación corporativa esta semana?",
      "Visión general del IBEX 35",
      "Estado del mercado reputacional",
      "Novedades relevantes de la semana",
    ],
  },
];
export function ChatQueryGuide({ language, onSelectExample }: ChatQueryGuideProps) {
  const lang = language.code;
  const prompt = LABEL[lang] || LABEL["en"] || LABEL["es"];
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openIndex]);

  const handlePillClick = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  const handleSelect = (example: string) => {
    onSelectExample(example);
    setOpenIndex(null);
  };

  return (
    <div ref={containerRef} className="relative space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{prompt}</span>
        {CATEGORIES.map((cat, i) => {
          const catLabel = cat.label[lang] || cat.label["en"] || cat.label["es"];
          const isOpen = openIndex === i;

          return (
            <button
              key={i}
              onClick={() => handlePillClick(i)}
              className={`shrink-0 cursor-pointer inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                isOpen
                  ? "bg-primary/15 border-primary/50 text-foreground"
                  : "bg-secondary/60 border-border/50 text-foreground hover:bg-primary/10 hover:border-primary/40"
              }`}
            >
              <span className="text-sm leading-none">{cat.icon}</span>
              <span>{catLabel}</span>
            </button>
          );
        })}
      </div>

      {openIndex !== null && (
        <div className="absolute bottom-full mb-1 left-0 right-0 z-50 rounded-lg border border-border bg-popover shadow-medium max-h-[200px] overflow-y-auto scrollbar-thin animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
          {CATEGORIES[openIndex].examples.map((ex, j) => (
            <button
              key={j}
              onClick={() => handleSelect(ex)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-popover-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <span className="line-clamp-1">{ex}</span>
              <span className="text-muted-foreground shrink-0">➤</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
