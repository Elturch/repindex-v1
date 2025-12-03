import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface NewsHeroProps {
  headline: string;
  lead: string;
  body: string;
  dataHighlight: string;
}

export function NewsHero({ headline, lead, body, dataHighlight }: NewsHeroProps) {
  return (
    <Card className="bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/20">
      <CardContent className="p-8">
        <Badge variant="outline" className="mb-4 text-primary border-primary/30">
          🔥 HISTORIA PRINCIPAL
        </Badge>
        
        <h2 className="text-2xl md:text-3xl font-bold leading-tight mb-4">
          {headline}
        </h2>
        
        <p className="text-lg text-muted-foreground leading-relaxed mb-6">
          {lead}
        </p>
        
        {/* Data Highlight Box */}
        <div className="bg-primary/10 rounded-lg p-4 mb-6 border-l-4 border-primary">
          <p className="font-semibold text-primary">{dataHighlight}</p>
        </div>
        
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {body.split('\n\n').map((paragraph, i) => (
            <p key={i} className="text-muted-foreground leading-relaxed mb-4 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
