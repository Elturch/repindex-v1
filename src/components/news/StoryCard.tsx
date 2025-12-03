import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StoryCardProps {
  category: string;
  headline: string;
  body: string;
  dataHighlight: string;
}

const categoryConfig: Record<string, { label: string; emoji: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  divergencia: { label: 'Divergencia', emoji: '⚡', variant: 'destructive' },
  consenso: { label: 'Consenso', emoji: '🤝', variant: 'default' },
  sector: { label: 'Sector', emoji: '🏢', variant: 'secondary' },
  modelo: { label: 'Modelo IA', emoji: '🤖', variant: 'outline' },
  privadas: { label: 'Privadas', emoji: '🔒', variant: 'secondary' },
  subidas: { label: 'Subidas', emoji: '🚀', variant: 'default' },
  bajadas: { label: 'Caídas', emoji: '📉', variant: 'destructive' },
};

export function StoryCard({ category, headline, body, dataHighlight }: StoryCardProps) {
  const config = categoryConfig[category.toLowerCase()] || { 
    label: category, 
    emoji: '📰', 
    variant: 'outline' as const 
  };

  return (
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
        
        <div className="text-sm text-muted-foreground leading-relaxed">
          {body.split('\n\n').map((paragraph, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
