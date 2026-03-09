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

type LangCode = 'es' | 'en' | 'fr' | 'de' | 'pt' | 'it' | 'ar' | 'zh' | 'ja' | 'ko';

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
  labels: Record<string, string>;
  examples: Record<string, string>;
}

const CATEGORIES: GuideCategory[] = [
  {
    icon: "📊",
    labels: { es: "Análisis", en: "Analysis", pt: "Análise", ca: "Anàlisi", fr: "Analyse", de: "Analyse", it: "Analisi" },
    examples: {
      es: "Analiza la reputación de Telefónica",
      en: "Analyze Telefónica's reputation",
      pt: "Analisa a reputação da Telefónica",
      ca: "Analitza la reputació de Telefónica",
      fr: "Analyse la réputation de Telefónica",
      de: "Analysiere den Ruf von Telefónica",
      it: "Analizza la reputazione di Telefónica",
    },
  },
  {
    icon: "⚔️",
    labels: { es: "Comparar", en: "Compare", pt: "Comparar", ca: "Compara", fr: "Comparer", de: "Vergleichen", it: "Confronta" },
    examples: {
      es: "Compara Inditex con Mango",
      en: "Compare Inditex with Mango",
      pt: "Compara Inditex com Mango",
      ca: "Compara Inditex amb Mango",
      fr: "Compare Inditex avec Mango",
      de: "Vergleiche Inditex mit Mango",
      it: "Confronta Inditex con Mango",
    },
  },
  {
    icon: "🏆",
    labels: { es: "Rankings", en: "Rankings", pt: "Rankings", ca: "Rankings", fr: "Classements", de: "Rankings", it: "Classifiche" },
    examples: {
      es: "Top 5 del IBEX por reputación",
      en: "Top 5 IBEX by reputation",
      pt: "Top 5 do IBEX por reputação",
      ca: "Top 5 de l'IBEX per reputació",
      fr: "Top 5 de l'IBEX par réputation",
      de: "Top 5 IBEX nach Reputation",
      it: "Top 5 IBEX per reputazione",
    },
  },
  {
    icon: "📈",
    labels: { es: "Evolución", en: "Trends", pt: "Evolução", ca: "Evolució", fr: "Évolution", de: "Entwicklung", it: "Evoluzione" },
    examples: {
      es: "Evolución de Repsol",
      en: "Repsol's evolution",
      pt: "Evolução da Repsol",
      ca: "Evolució de Repsol",
      fr: "Évolution de Repsol",
      de: "Entwicklung von Repsol",
      it: "Evoluzione di Repsol",
    },
  },
  {
    icon: "🔍",
    labels: { es: "Divergencia", en: "Divergence", pt: "Divergência", ca: "Divergència", fr: "Divergence", de: "Divergenz", it: "Divergenza" },
    examples: {
      es: "¿Por qué las IAs divergen sobre Santander?",
      en: "Why do AIs diverge on Santander?",
      pt: "Por que as IAs divergem sobre Santander?",
      ca: "Per què les IAs divergeixen sobre Santander?",
      fr: "Pourquoi les IAs divergent-elles sur Santander ?",
      de: "Warum weichen die KIs bei Santander ab?",
      it: "Perché le IA divergono su Santander?",
    },
  },
];

export function ChatQueryGuide({ language, onSelectExample }: ChatQueryGuideProps) {
  const lang = language.code as LangCode;
  const label = LABEL[lang] || LABEL["en"] || LABEL["es"];

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{label}</span>
      <TooltipProvider delayDuration={200}>
        {CATEGORIES.map((cat, i) => {
          const catLabel = cat.labels[lang] || cat.labels["en"] || cat.labels["es"];
          const example = cat.examples[lang] || cat.examples["en"] || cat.examples["es"];

          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSelectExample(example)}
                  className="shrink-0 cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/60 px-3 py-1 text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors"
                >
                  <span className="text-sm leading-none">{cat.icon}</span>
                  <span>{catLabel}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-center">
                <p className="text-xs">{example}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}
