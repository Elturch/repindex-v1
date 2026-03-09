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
      "Haz un análisis profundo de las debilidades de Inditex",
      "Análisis pericial de daño reputacional de Repsol",
      "¿Cuáles son las fortalezas reputacionales de BBVA?",
      "Análisis de riesgos reputacionales de Iberdrola",
      "Diagnóstico rápido de CaixaBank",
      "¿Qué dice la IA sobre Puig?",
      "Análisis de la presencia mediática de Santander",
    ],
  },
  {
    icon: "⚔️",
    label: { es: "Comparar", en: "Compare", pt: "Comparar", ca: "Compara", fr: "Comparer", de: "Vergleichen", it: "Confronta" },
    examples: [
      "Compara Inditex con Mango",
      "¿Quién tiene mejor reputación, BBVA o Santander?",
      "Compara las fortalezas y debilidades de Telefónica vs Vodafone",
      "¿En qué métricas gana Iberdrola a Endesa?",
      "Comparativa de gobernanza entre Repsol y Cepsa",
      "Compara la evolución de CaixaBank y Sabadell",
    ],
  },
  {
    icon: "🏆",
    label: { es: "Rankings", en: "Rankings", pt: "Rankings", ca: "Rankings", fr: "Classements", de: "Rankings", it: "Classifiche" },
    examples: [
      "Top 5 del IBEX por reputación",
      "Peores empresas del IBEX esta semana",
      "Ranking de empresas por gestión de controversias (CEM)",
      "¿Qué empresas han subido más esta semana?",
      "¿Qué empresas han caído más esta semana?",
      "Top empresas del BME Growth",
      "Ranking del sector Banca",
      "Empresas con mejor gobernanza (GAM)",
    ],
  },
  {
    icon: "📈",
    label: { es: "Evolución", en: "Trends", pt: "Evolução", ca: "Evolució", fr: "Évolution", de: "Entwicklung", it: "Evoluzione" },
    examples: [
      "Evolución de Repsol",
      "¿Cómo ha cambiado la reputación de Inditex en el último mes?",
      "Tendencia del sector Energía",
      "¿Qué empresas están mejorando su reputación?",
      "¿Qué empresas están empeorando?",
      "Evolución del IBEX en reputación",
    ],
  },
  {
    icon: "🔍",
    label: { es: "Divergencia", en: "Divergence", pt: "Divergência", ca: "Divergència", fr: "Divergence", de: "Divergenz", it: "Divergenza" },
    examples: [
      "¿Por qué las IAs divergen sobre Santander?",
      "¿Qué empresa tiene más divergencia entre IAs?",
      "¿En qué métrica hay más desacuerdo sobre Telefónica?",
      "¿Qué modelo de IA es más crítico con Repsol?",
      "Consensos y disensos sobre Iberdrola",
    ],
  },
  {
    icon: "🎯",
    label: { es: "Métricas", en: "Metrics", pt: "Métricas", ca: "Mètriques", fr: "Métriques", de: "Metriken", it: "Metriche" },
    examples: [
      "Analiza el CEM de Repsol",
      "¿Por qué el SIM de Telefónica es bajo?",
      "¿Qué empresas tienen mejor CEM?",
      "Desglose de las 8 métricas de Inditex",
      "¿Qué métrica es la más débil de BBVA?",
      "Analiza la gobernanza (GAM) de Santander",
    ],
  },
  {
    icon: "📄",
    label: { es: "Sector", en: "Sector", pt: "Setor", ca: "Sector", fr: "Secteur", de: "Sektor", it: "Settore" },
    examples: [
      "Análisis del sector Banca",
      "¿Cómo va el sector Energía?",
      "Compara los sectores Banca y Energía",
      "¿Qué sector tiene mejor reputación?",
      "Resumen del sector Telecomunicaciones",
      "Tendencias del sector Construcción",
    ],
  },
  {
    icon: "⚠️",
    label: { es: "Alertas", en: "Alerts", pt: "Alertas", ca: "Alertes", fr: "Alertes", de: "Warnungen", it: "Avvisi" },
    examples: [
      "¿Qué empresa tiene más riesgo reputacional esta semana?",
      "¿Hay alguna empresa en crisis?",
      "Empresas con mayor caída de RIX",
      "¿Qué empresa tiene el CEM más bajo?",
      "Alertas del IBEX esta semana",
    ],
  },
  {
    icon: "🧩",
    label: { es: "Contexto", en: "Context", pt: "Contexto", ca: "Context", fr: "Contexte", de: "Kontext", it: "Contesto" },
    examples: [
      "¿Cómo afecta la regulación al sector Energía?",
      "Resume las noticias clave de Telefónica",
      "¿Qué empresa del IBEX tiene mejor gobernanza?",
      "¿Cuál es la empresa más estable del sistema?",
      "¿Qué sectores están mejorando su reputación?",
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
