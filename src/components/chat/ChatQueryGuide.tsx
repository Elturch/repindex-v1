import { Lightbulb } from "lucide-react";
import { ChatLanguage } from "@/lib/chatLanguages";

interface ChatQueryGuideProps {
  language: ChatLanguage;
  onSelectExample: (text: string) => void;
}

type LangCode = 'es' | 'en' | 'fr' | 'de' | 'pt' | 'it' | 'ar' | 'zh' | 'ja' | 'ko';

const GUIDE_TRANSLATIONS: Record<string, Record<string, string>> = {
  title: {
    es: "¿Qué quieres saber?",
    en: "What do you want to know?",
    pt: "O que queres saber?",
    ca: "Què vols saber?",
    fr: "Que voulez-vous savoir ?",
    de: "Was möchten Sie wissen?",
    it: "Cosa vuoi sapere?",
  },
  subtitle: {
    es: "Escribe tu pregunta como quieras — el Agente Rix la interpretará automáticamente",
    en: "Write your question however you like — Agent Rix will interpret it automatically",
    pt: "Escreve a tua pergunta como quiseres — o Agente Rix interpretará automaticamente",
    ca: "Escriu la teva pregunta com vulguis — l'Agent Rix la interpretarà automàticament",
    fr: "Écrivez votre question comme vous voulez — l'Agent Rix l'interprétera automatiquement",
    de: "Schreiben Sie Ihre Frage wie Sie möchten — Agent Rix wird sie automatisch interpretieren",
    it: "Scrivi la tua domanda come vuoi — l'Agente Rix la interpreterà automaticamente",
  },
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

function t(key: string, lang: string): string {
  const map = GUIDE_TRANSLATIONS[key];
  if (!map) return "";
  return map[lang] || map["en"] || map["es"] || "";
}

export function ChatQueryGuide({ language, onSelectExample }: ChatQueryGuideProps) {
  const lang = language.code as LangCode;

  return (
    <div className="rounded-xl border border-border/40 bg-gradient-to-b from-muted/40 to-background p-5 space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2 justify-center">
        <Lightbulb className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">
          {t("title", lang)}
        </h3>
      </div>

      {/* Category pills — horizontal scroll on mobile, flex wrap on desktop */}
      <div className="flex gap-3 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible scrollbar-hide">
        {CATEGORIES.map((cat, i) => {
          const label = cat.labels[lang] || cat.labels["en"] || cat.labels["es"];
          const example = cat.examples[lang] || cat.examples["en"] || cat.examples["es"];

          return (
            <button
              key={i}
              onClick={() => onSelectExample(example)}
              className="flex-shrink-0 group flex flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-card px-4 py-3 min-w-[140px] sm:min-w-[150px] hover:border-primary/50 hover:shadow-soft transition-all duration-200 cursor-pointer"
            >
              <span className="text-2xl">{cat.icon}</span>
              <span className="text-xs font-semibold text-foreground">{label}</span>
              <span className="text-[11px] text-muted-foreground text-center leading-tight group-hover:text-primary transition-colors line-clamp-2">
                {example}
              </span>
            </button>
          );
        })}
      </div>

      {/* Subtle subtitle */}
      <p className="text-center text-xs text-muted-foreground/70">
        {t("subtitle", lang)}
      </p>
    </div>
  );
}
