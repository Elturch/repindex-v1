import { useState } from "react";
import { ChatLanguage } from "@/lib/chatLanguages";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      "Analiza la reputación de Inditex",
      "Analiza la reputación de Repsol",
      "Analiza la reputación de BBVA",
      "Analiza la reputación de Iberdrola",
      "Analiza la reputación de Santander",
      "Analiza la reputación de CaixaBank",
      "Analiza la reputación de Puig",
    ],
  },
  {
    icon: "⚔️",
    label: { es: "Comparar", en: "Compare", pt: "Comparar", ca: "Compara", fr: "Comparer", de: "Vergleichen", it: "Confronta" },
    examples: [
      "Compara Inditex con Mango",
      "Compara Telefónica con Vodafone",
      "Compara BBVA con Santander",
      "Compara Repsol con Cepsa",
      "Compara Iberdrola con Endesa",
      "Compara CaixaBank con Sabadell",
    ],
  },
  {
    icon: "🏆",
    label: { es: "Rankings", en: "Rankings", pt: "Rankings", ca: "Rankings", fr: "Classements", de: "Rankings", it: "Classifiche" },
    examples: [
      "Top 5 del IBEX por reputación",
      "Top 10 empresas mejor valoradas",
      "Ranking del sector Banca",
      "Peores empresas del IBEX esta semana",
      "Ranking del sector Energía",
      "Top empresas del BME Growth",
    ],
  },
  {
    icon: "📈",
    label: { es: "Evolución", en: "Trends", pt: "Evolução", ca: "Evolució", fr: "Évolution", de: "Entwicklung", it: "Evoluzione" },
    examples: [
      "Evolución de Repsol",
      "Evolución de Telefónica",
      "¿Cómo ha cambiado la reputación de Inditex?",
      "Tendencia de Santander en las últimas semanas",
      "Evolución del sector Construcción",
    ],
  },
  {
    icon: "🔍",
    label: { es: "Divergencia", en: "Divergence", pt: "Divergência", ca: "Divergència", fr: "Divergence", de: "Divergenz", it: "Divergenza" },
    examples: [
      "¿Por qué las IAs divergen sobre Santander?",
      "¿Por qué las IAs divergen sobre Telefónica?",
      "¿Qué empresa tiene más divergencia entre IAs?",
      "Divergencias en el sector Telecomunicaciones",
      "Analiza la divergencia de BBVA",
    ],
  },
  {
    icon: "🎯",
    label: { es: "Métricas", en: "Metrics", pt: "Métricas", ca: "Mètriques", fr: "Métriques", de: "Metriken", it: "Metriche" },
    examples: [
      "Analiza el CEM de Repsol",
      "¿Por qué el SIM de Telefónica es bajo?",
      "Analiza el NVM de Inditex",
      "¿Qué empresas tienen mejor CEM?",
      "Analiza el DCM de Santander",
    ],
  },
  {
    icon: "📄",
    label: { es: "Sector", en: "Sector", pt: "Setor", ca: "Sector", fr: "Secteur", de: "Sektor", it: "Settore" },
    examples: [
      "Análisis del sector Banca",
      "Análisis del sector Energía",
      "¿Cómo va el sector Telecomunicaciones?",
      "Resumen del sector Construcción",
    ],
  },
];

export function ChatQueryGuide({ language, onSelectExample }: ChatQueryGuideProps) {
  const lang = language.code;
  const prompt = LABEL[lang] || LABEL["en"] || LABEL["es"];
  const [indices, setIndices] = useState<Record<number, number>>({});

  const handleClick = (catIndex: number) => {
    const current = indices[catIndex] ?? 0;
    const pool = CATEGORIES[catIndex].examples;
    onSelectExample(pool[current]);
    setIndices((prev) => ({ ...prev, [catIndex]: (current + 1) % pool.length }));
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{prompt}</span>
      <TooltipProvider delayDuration={200}>
        {CATEGORIES.map((cat, i) => {
          const catLabel = cat.label[lang] || cat.label["en"] || cat.label["es"];
          const currentExample = cat.examples[indices[i] ?? 0];

          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleClick(i)}
                  className="shrink-0 cursor-pointer inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/60 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors"
                >
                  <span className="text-sm leading-none">{cat.icon}</span>
                  <span>{catLabel}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] text-center">
                <p className="text-xs">{currentExample}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}
