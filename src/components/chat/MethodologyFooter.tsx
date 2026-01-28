import { Badge } from "@/components/ui/badge";

export interface MethodologyMetadata {
  hasRixData?: boolean;
  modelsUsed?: string[];
  periodFrom?: string;
  periodTo?: string;
  observationsCount?: number;
  divergenceLevel?: 'low' | 'medium' | 'high' | 'unknown';
  divergencePoints?: number;
  uniqueCompanies?: number;
  uniqueWeeks?: number;
  // Statistical anchoring
  rSquared?: number;
  pValue?: number;
  hasRegressionData?: boolean;
}

interface MethodologyFooterProps {
  metadata: MethodologyMetadata;
  languageCode?: string;
}

// Model name to display name mapping
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'chatgpt': 'ChatGPT',
  'perplexity': 'Perplexity',
  'gemini': 'Gemini',
  'deepseek': 'DeepSeek',
  'grok': 'Grok',
  'qwen': 'Qwen',
};

// Format models list for display
function formatModels(models: string[]): string {
  if (!models || models.length === 0) return 'N/A';
  
  const formatted = models.map(m => {
    const key = m.toLowerCase();
    return MODEL_DISPLAY_NAMES[key] || m;
  });
  
  // Remove duplicates and sort alphabetically
  const unique = [...new Set(formatted)].sort();
  return unique.join(', ');
}

// Get divergence label with sigma notation
function getDivergenceLabel(level: string, points: number, langCode: string): { text: string; color: string } {
  const isSpanish = langCode === 'es';
  
  switch (level) {
    case 'low':
      return { 
        text: isSpanish ? `σ=${points} → Consenso robusto` : `σ=${points} → Robust consensus`,
        color: 'text-green-600 dark:text-green-400'
      };
    case 'medium':
      return { 
        text: isSpanish ? `σ=${points} → Narrativa estable` : `σ=${points} → Stable narrative`,
        color: 'text-amber-600 dark:text-amber-400'
      };
    case 'high':
      return { 
        text: isSpanish ? `σ=${points} → Alta incertidumbre` : `σ=${points} → High uncertainty`,
        color: 'text-red-600 dark:text-red-400'
      };
    default:
      return { 
        text: isSpanish ? 'N/A' : 'N/A',
        color: 'text-muted-foreground'
      };
  }
}

// Format date period
function formatPeriod(from?: string, to?: string): string {
  if (!from && !to) return 'N/A';
  if (from === to) return from || 'N/A';
  return `${from || '?'} → ${to || '?'}`;
}

export function MethodologyFooter({ metadata, languageCode = 'es' }: MethodologyFooterProps) {
  // Only render if there's RIX data
  if (!metadata.hasRixData) return null;
  
  const divergence = getDivergenceLabel(
    metadata.divergenceLevel || 'unknown', 
    metadata.divergencePoints || 0,
    languageCode
  );
  
  const isSpanish = languageCode === 'es';

  return (
    <div className="mt-6 pt-4 border-t border-border/30 space-y-3 select-none">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          📊 {isSpanish ? 'Ficha de Validación Metodológica' : 'Methodological Validation Sheet'}
        </span>
        <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 text-muted-foreground/60">
          RepIndex v2.0
        </Badge>
      </div>
      
      {/* Data Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-[9px] text-muted-foreground/70">
        <div>
          <span className="font-medium text-muted-foreground/90">
            {isSpanish ? 'Modelos:' : 'Models:'}
          </span>{' '}
          <span>{formatModels(metadata.modelsUsed || [])}</span>
        </div>
        
        <div>
          <span className="font-medium text-muted-foreground/90">
            {isSpanish ? 'Período:' : 'Period:'}
          </span>{' '}
          <span>{formatPeriod(metadata.periodFrom, metadata.periodTo)}</span>
        </div>
        
        <div>
          <span className="font-medium text-muted-foreground/90">
            {isSpanish ? 'Observaciones:' : 'Observations:'}
          </span>{' '}
          <span>{metadata.observationsCount || 0} registros</span>
        </div>
        
        <div>
          <span className="font-medium text-muted-foreground/90">
            {isSpanish ? 'Divergencia:' : 'Divergence:'}
          </span>{' '}
          <span className={divergence.color}>{divergence.text}</span>
        </div>
      </div>
      
      {/* Statistical Anchoring (only show if regression data available) */}
      {metadata.hasRegressionData && metadata.rSquared !== undefined && (
        <div className="text-[8px] text-muted-foreground/60 mt-2">
          <span className="font-medium">
            {isSpanish ? '📈 Anclaje estadístico:' : '📈 Statistical anchoring:'}
          </span>{' '}
          <span>
            R² = {(metadata.rSquared * 100).toFixed(1)}%
            {metadata.pValue !== undefined && metadata.pValue < 0.05 && (
              <span className="text-green-600 dark:text-green-400 ml-1">(p&lt;0.05)</span>
            )}
          </span>
        </div>
      )}
      
      {/* Methodology Note */}
      <p className="text-[8px] italic text-muted-foreground/50 leading-relaxed max-w-3xl">
        {isSpanish 
          ? 'El RIX mide la percepción algorítmica: la probabilidad de que una narrativa gane tracción en el ecosistema informativo de IA. Ejecución sistemática vía API (machine-to-machine) con prompts invariables. No sustituye estudios tradicionales; los complementa con una capa que nadie más está midiendo.'
          : 'The RIX measures algorithmic perception: the probability that a narrative gains traction in the AI information ecosystem. Systematic API execution (machine-to-machine) with invariable prompts. It does not replace traditional studies; it complements them with a layer no one else is measuring.'
        }
      </p>
      
      {/* Disclaimer */}
      <p className="text-[7px] text-muted-foreground/40 leading-snug">
        {isSpanish
          ? '⚠️ RepIndex no pregunta qué opinan las personas; pregunta qué dirían las IAs si alguien consultara ahora mismo sobre esta empresa. Este informe detecta señales narrativas emergentes, no verdades absolutas.'
          : '⚠️ RepIndex does not ask what people think; it asks what AIs would say if someone inquired about this company right now. This report detects emerging narrative signals, not absolute truths.'
        }
      </p>
    </div>
  );
}
