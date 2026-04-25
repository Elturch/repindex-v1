import { useState, useEffect } from "react";
import { ChatLanguage } from "@/lib/chatLanguages";
import { useRixUniverse } from "@/hooks/useRixUniverse";
import { validateSuggestion } from "@/lib/chat/suggestionWhitelist";

interface ChatQueryGuideProps {
  language: ChatLanguage;
  /** Fills the input with the example so the user can edit before sending. */
  onSelectExample: (text: string) => void;
  /** Phase 4 — UX: when provided, clicking the chip sends the example directly. */
  onSendExample?: (text: string) => void;
  /** Disables the chip while a request is in flight. */
  disabled?: boolean;
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
      "Analiza la reputación de Repsol",
      "Analiza la reputación de BBVA",
      "Desglose de métricas de Inditex",
      "Desglose de métricas de Iberdrola",
    ],
  },
  {
    icon: "⚔️",
    label: { es: "Comparar", en: "Compare", pt: "Comparar", ca: "Compara", fr: "Comparer", de: "Vergleichen", it: "Confronta" },
    examples: [
      "Compara BBVA con Banco Santander",
      "Compara Iberdrola con Endesa",
      "Compara Repsol con Naturgy",
      "Compara sector Energía y Gas vs Telecomunicaciones",
      // Same-sector (Moda y Distribución), both verified in RIX universe.
      "Compara Inditex con Adolfo Domínguez",
    ],
  },
  {
    icon: "🏆",
    label: { es: "Rankings", en: "Rankings", pt: "Rankings", ca: "Rankings", fr: "Classements", de: "Rankings", it: "Classifiche" },
    examples: [
      "Top 5 del IBEX 35 por reputación esta semana",
      "Ranking del sector Banca y Servicios Financieros",
      "Top empresas del BME Growth esta semana",
      "Ranking de las 5 peores empresas del IBEX 35",
      "Top 10 empresas por reputación esta semana",
    ],
  },
  {
    icon: "📈",
    label: { es: "Evolución", en: "Trends", pt: "Evolução", ca: "Evolució", fr: "Évolution", de: "Entwicklung", it: "Evoluzione" },
    examples: [
      "Evolución de Repsol en las últimas 4 semanas",
      "Evolución de Telefónica las últimas 4 semanas",
      "Evolución del sector banca últimas 6 semanas",
      "Evolución de Inditex en el último mes",
    ],
  },
  {
    icon: "🤖",
    label: { es: "Divergencia IA", en: "AI Divergence", pt: "Divergência IA", ca: "Divergència IA", fr: "Divergence IA", de: "KI-Divergenz", it: "Divergenza IA" },
    examples: [
      "Analiza la divergencia entre IAs sobre Iberdrola",
      "Analiza la divergencia entre IAs sobre Banco Santander",
      "Analiza la divergencia entre IAs sobre Repsol",
    ],
  },
  {
    icon: "📄",
    label: { es: "Sector", en: "Sector", pt: "Setor", ca: "Sector", fr: "Secteur", de: "Sektor", it: "Settore" },
    examples: [
      "Ranking del sector Banca y Servicios Financieros",
      "Ranking del sector Energía y Gas",
      "Compara sector Salud y Farmacéutico vs Alimentación",
    ],
  },
];

// Flatten all examples with their category icon
const ALL_EXAMPLES = CATEGORIES.flatMap((cat) =>
  cat.examples.map((text) => ({ icon: cat.icon, text }))
);

export function ChatQueryGuide({ language, onSelectExample, onSendExample, disabled }: ChatQueryGuideProps) {
  const lang = language.code;
  const prompt = LABEL[lang] || LABEL["en"] || LABEL["es"];
  const { data: universe } = useRixUniverse();

  // Whitelist filter: only keep examples whose company mentions are all
  // present in the live RIX universe. Sector-only / index-only examples
  // (no company mentions) always pass.
  const examples = (() => {
    const filtered = ALL_EXAMPLES
      .map((ex) => {
        const v = validateSuggestion(ex.text, universe);
        return v.valid ? { icon: ex.icon, text: v.text } : null;
      })
      .filter((x): x is { icon: string; text: string } => x !== null);
    return filtered.length > 0 ? filtered : ALL_EXAMPLES;
  })();

  const [index, setIndex] = useState(() => Math.floor(Math.random() * examples.length));
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % examples.length);
        setFade(true);
      }, 200);
    }, 6000);
    return () => clearInterval(interval);
  }, [examples.length]);

  const current = examples[index % examples.length];

  return (
    <div className="flex items-center gap-1.5 min-w-0 w-full">
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{prompt}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          // Phase 4 — UX: prefer direct send when the parent supports it; fall
          // back to filling the input so users can still edit the example.
          if (onSendExample) onSendExample(current.text);
          else onSelectExample(current.text);
        }}
        className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/60 px-3 py-1 text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-w-0 flex-1 max-w-full overflow-hidden ${
          fade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
        }`}
        title={onSendExample ? "Enviar ejemplo" : "Rellenar input"}
      >
        <span className="text-sm leading-none shrink-0">{current.icon}</span>
        <span className="line-clamp-1 min-w-0 truncate">{current.text}</span>
        <span className="text-muted-foreground shrink-0 ml-1">➤</span>
      </button>
    </div>
  );
}
