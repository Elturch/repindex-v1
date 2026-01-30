import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Collapsible, 
  CollapsibleTrigger, 
  CollapsibleContent 
} from "@/components/ui/collapsible";
import { ChevronDown, ExternalLink, Clock, BookOpen } from "lucide-react";
import { VerifiedSource } from "@/lib/verifiedSourceExtractor";

export interface SegmentedSources {
  window: VerifiedSource[];
  reinforcement: VerifiedSource[];
  periodLabel?: string;
}

interface SegmentedSourcesFooterProps {
  segmentedSources?: SegmentedSources;
  compact?: boolean;
  languageCode?: string;
}

export function SegmentedSourcesFooter({ 
  segmentedSources,
  compact = false,
  languageCode = 'es',
}: SegmentedSourcesFooterProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!segmentedSources) return null;
  
  const { window: windowSources, reinforcement: reinforcementSources, periodLabel } = segmentedSources;
  const totalSources = (windowSources?.length || 0) + (reinforcementSources?.length || 0);
  
  if (totalSources === 0) return null;

  const translations = {
    es: {
      viewSources: 'Ver fuentes citadas',
      windowLabel: 'Menciones en ventana',
      reinforcementLabel: 'Menciones de refuerzo',
      windowTooltip: 'Fuentes citadas dentro del período de análisis',
      reinforcementTooltip: 'Fuentes históricas que refuerzan el análisis',
      verifiedBy: 'Verificado por',
    },
    en: {
      viewSources: 'View cited sources',
      windowLabel: 'Window mentions',
      reinforcementLabel: 'Reinforcement mentions',
      windowTooltip: 'Sources cited within the analysis period',
      reinforcementTooltip: 'Historical sources reinforcing the analysis',
      verifiedBy: 'Verified by',
    }
  };
  
  const tr = translations[languageCode as keyof typeof translations] || translations.es;

  return (
    <div className={`${compact ? 'mt-2 pt-2' : 'mt-4 pt-3'} border-t border-border/50`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full justify-between ${compact ? 'h-7 text-[10px]' : 'h-8 text-xs'} text-muted-foreground hover:text-foreground`}
          >
            <span className="flex items-center gap-2">
              <BookOpen className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
              {tr.viewSources} ({totalSources})
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-2 space-y-3">
          {/* Window Sources - Within Analysis Period */}
          {windowSources && windowSources.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="default" 
                  className={`${compact ? 'text-[9px] px-1.5' : 'text-[10px] px-2'} bg-primary/10 text-primary hover:bg-primary/20`}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  {tr.windowLabel}
                  {periodLabel && ` (${periodLabel})`}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {windowSources.length}
                </span>
              </div>
              
              <ul className={`space-y-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                {windowSources.slice(0, compact ? 3 : 5).map((source, i) => (
                  <SourceItem key={i} source={source} compact={compact} tr={tr} />
                ))}
                {windowSources.length > (compact ? 3 : 5) && (
                  <li className="text-muted-foreground italic">
                    +{windowSources.length - (compact ? 3 : 5)} más...
                  </li>
                )}
              </ul>
            </div>
          )}
          
          {/* Reinforcement Sources - Historical/Contextual */}
          {reinforcementSources && reinforcementSources.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={`${compact ? 'text-[9px] px-1.5' : 'text-[10px] px-2'}`}
                >
                  <BookOpen className="h-3 w-3 mr-1" />
                  {tr.reinforcementLabel}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {reinforcementSources.length}
                </span>
              </div>
              
              <ul className={`space-y-1.5 ${compact ? 'text-[10px]' : 'text-xs'} opacity-80`}>
                {reinforcementSources.slice(0, compact ? 2 : 4).map((source, i) => (
                  <SourceItem key={i} source={source} compact={compact} tr={tr} />
                ))}
                {reinforcementSources.length > (compact ? 2 : 4) && (
                  <li className="text-muted-foreground italic">
                    +{reinforcementSources.length - (compact ? 2 : 4)} más...
                  </li>
                )}
              </ul>
            </div>
          )}
          
          {/* Methodology note */}
          <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-muted-foreground italic border-t border-border/30 pt-2`}>
            Solo fuentes verificables de ChatGPT (utm_source=openai) y Perplexity.
            Las IAs sin búsqueda web activa no se incluyen.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SourceItem({ source, compact, tr }: { 
  source: VerifiedSource; 
  compact: boolean;
  tr: { verifiedBy: string };
}) {
  const modelBadgeColor = source.sourceModel === 'ChatGPT' 
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
    : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';

  return (
    <li className="flex items-start gap-2 group">
      <span className={`${modelBadgeColor} text-[9px] px-1 py-0.5 rounded shrink-0`}>
        {source.sourceModel === 'ChatGPT' ? 'GPT' : 'PPX'}
      </span>
      <div className="flex-1 min-w-0">
        <a 
          href={source.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline flex items-center gap-1 group-hover:text-primary/80"
        >
          <span className="font-medium truncate">{source.domain}</span>
          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </a>
        {source.title && !compact && (
          <p className="text-muted-foreground truncate">{source.title}</p>
        )}
      </div>
    </li>
  );
}
