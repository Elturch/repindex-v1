import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StoryCardProps {
  category: string;
  headline: string;
  body: string;
  dataHighlight: string;
  lead?: string;
  keywords?: string[];
}

const categoryConfig: Record<string, { label: string; emoji: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  divergencia: { label: 'Divergencia', emoji: '⚡', variant: 'destructive' },
  consenso: { label: 'Consenso', emoji: '🤝', variant: 'default' },
  sector: { label: 'Sector', emoji: '🏢', variant: 'secondary' },
  modelo_ia: { label: 'Modelo IA', emoji: '🤖', variant: 'outline' },
  privadas: { label: 'Privadas', emoji: '🔒', variant: 'secondary' },
  subidas: { label: 'Subidas', emoji: '🚀', variant: 'default' },
  bajadas: { label: 'Caídas', emoji: '📉', variant: 'destructive' },
  ibex: { label: 'IBEX-35', emoji: '📊', variant: 'outline' },
  headline: { label: 'Destacado', emoji: '🔥', variant: 'default' },
};

export function StoryCard({ category, headline, body, dataHighlight, lead, keywords }: StoryCardProps) {
  const config = categoryConfig[category.toLowerCase()] || { 
    label: category, 
    emoji: '📰', 
    variant: 'outline' as const 
  };

  return (
    <article className="h-full">
      <Card className="h-full hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <Badge variant={config.variant} className="w-fit mb-2">
            {config.emoji} {config.label}
          </Badge>
          <h3 className="text-lg font-semibold leading-tight">
            {headline}
          </h3>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Data Highlight */}
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <p className="font-medium">{dataHighlight}</p>
          </div>
          
          {/* Lead paragraph */}
          {lead && (
            <p className="text-sm font-medium text-foreground/90 leading-relaxed">
              {lead}
            </p>
          )}
          
          {/* Body text */}
          <div className="text-sm text-muted-foreground leading-relaxed">
            {body.split('\n\n').map((paragraph, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>

          {/* Keywords for SEO (hidden visually) */}
          {keywords && keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2 border-t">
              {keywords.slice(0, 3).map((kw, i) => (
                <span key={i} className="text-xs text-muted-foreground/60">
                  #{kw}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
