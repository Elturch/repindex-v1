import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MiniPieChart, MiniLineChart, MiniRadarChart, MiniBarChart } from "./MiniCharts";

interface ChartData {
  type: 'pie' | 'line' | 'radar' | 'bar';
  data: any[];
}

interface StoryCardProps {
  category: string;
  headline: string;
  body: string;
  dataHighlight: string;
  lead?: string;
  keywords?: string[];
  chartData?: ChartData;
}

const categoryConfig: Record<string, { label: string; emoji: string; variant: "default" | "secondary" | "outline" | "destructive"; chartType: 'pie' | 'line' | 'radar' | 'bar' }> = {
  divergencia: { label: 'Divergencia', emoji: '⚡', variant: 'destructive', chartType: 'radar' },
  consenso: { label: 'Consenso', emoji: '🤝', variant: 'default', chartType: 'pie' },
  sector: { label: 'Sector', emoji: '🏢', variant: 'secondary', chartType: 'bar' },
  modelo_ia: { label: 'Modelo IA', emoji: '🤖', variant: 'outline', chartType: 'bar' },
  privadas: { label: 'Privadas', emoji: '🔒', variant: 'secondary', chartType: 'line' },
  subidas: { label: 'Subidas', emoji: '🚀', variant: 'default', chartType: 'line' },
  bajadas: { label: 'Caídas', emoji: '📉', variant: 'destructive', chartType: 'line' },
  ibex: { label: 'IBEX-35', emoji: '📊', variant: 'outline', chartType: 'bar' },
  headline: { label: 'Destacado', emoji: '🔥', variant: 'default', chartType: 'pie' },
};

export function StoryCard({ category, headline, body, dataHighlight, lead, keywords, chartData }: StoryCardProps) {
  const config = categoryConfig[category.toLowerCase()] || { 
    label: category, 
    emoji: '📰', 
    variant: 'outline' as const,
    chartType: 'line' as const
  };

  // Only show chart if chartData is provided from the AI
  const chart = chartData;

  return (
    <article className="h-full">
      <Card className="h-full hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-2">
            <Badge variant={config.variant} className="w-fit">
              {config.emoji} {config.label}
            </Badge>
            
            {/* Mini Chart - only show if AI provided specific data */}
            {chart && chart.data && chart.data.length > 0 && (
              <div className="flex-shrink-0">
                {chart.type === 'pie' && <MiniPieChart data={chart.data} size={70} />}
                {chart.type === 'line' && <MiniLineChart data={chart.data} width={80} height={35} showTrend />}
                {chart.type === 'radar' && <MiniRadarChart data={chart.data} size={80} />}
                {chart.type === 'bar' && <MiniBarChart data={chart.data} width={90} height={40} />}
              </div>
            )}
          </div>
          
          <h3 className="text-lg font-semibold leading-tight mt-2">
            {headline}
          </h3>
        </CardHeader>
        
        <CardContent className="pt-0 space-y-3">
          {/* Data Highlight */}
          <div className="bg-muted/50 rounded-md p-3 text-sm border-l-2 border-primary">
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

          {/* Keywords */}
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
