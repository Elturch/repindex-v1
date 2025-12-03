import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MiniLineChart, ComparisonGauge } from "./MiniCharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface BriefNewsItem {
  company: string;
  ticker: string;
  headline: string;
  score: number;
  change?: number;
  trend?: number[];
  category?: string;
}

interface BriefNewsSectionProps {
  items: BriefNewsItem[];
  title?: string;
}

export function BriefNewsSection({ items, title = "Noticias Breves" }: BriefNewsSectionProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-4" aria-label={title}>
      <h2 className="text-xl font-bold flex items-center gap-2">
        📋 {title}
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item, index) => (
          <BriefNewsCard key={index} item={item} />
        ))}
      </div>
    </section>
  );
}

function BriefNewsCard({ item }: { item: BriefNewsItem }) {
  const TrendIcon = item.change && item.change > 0 
    ? TrendingUp 
    : item.change && item.change < 0 
    ? TrendingDown 
    : Minus;
  
  const trendColor = item.change && item.change > 0 
    ? "text-green-600" 
    : item.change && item.change < 0 
    ? "text-red-600" 
    : "text-muted-foreground";

  // Generate mini trend data
  const trendData = item.trend 
    ? item.trend.map(v => ({ value: v }))
    : [
        { value: item.score - (item.change || 0) - Math.random() * 5 },
        { value: item.score - (item.change || 0) },
        { value: item.score }
      ];

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Company header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-sm truncate">{item.company}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {item.ticker}
              </Badge>
            </div>
            
            {/* Headline */}
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {item.headline}
            </p>
          </div>

          {/* Mini chart and score */}
          <div className="flex flex-col items-end gap-1">
            <MiniLineChart 
              data={trendData} 
              width={60} 
              height={25} 
              showTrend={false}
            />
            <div className="flex items-center gap-1">
              <TrendIcon className={`h-3 w-3 ${trendColor}`} />
              <span className={`text-xs font-semibold ${trendColor}`}>
                {item.change && item.change > 0 ? '+' : ''}{item.change || 0}
              </span>
            </div>
          </div>
        </div>
        
        {/* Score gauge */}
        <div className="mt-3">
          <ComparisonGauge value={item.score} label="RIX" />
        </div>
      </CardContent>
    </Card>
  );
}
