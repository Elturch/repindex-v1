import { MiniBarChart, MiniLineChart, MiniPieChart, MiniRadarChart } from "./MiniCharts";

interface ChartData {
  type: 'pie' | 'line' | 'radar' | 'bar';
  data: any[];
}

interface FeaturedStoryProps {
  headline: string;
  lead: string;
  body: string;
  dataHighlight: string;
  chartData?: ChartData;
}

export function FeaturedStory({ headline, lead, body, dataHighlight, chartData }: FeaturedStoryProps) {
  return (
    <article className="grid lg:grid-cols-5 gap-8 pb-8 border-b">
      {/* Main content - 3 cols */}
      <div className="lg:col-span-3 space-y-4">
        <h2 className="text-3xl md:text-4xl font-serif font-bold leading-tight tracking-tight">
          {headline}
        </h2>
        
        <p className="text-xl text-muted-foreground leading-relaxed font-serif">
          {lead}
        </p>
        
        <div className="prose prose-lg dark:prose-invert max-w-none">
          {body.split('\n\n').slice(0, 2).map((paragraph, i) => (
            <p key={i} className="text-foreground/80 leading-relaxed mb-4 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>

        <p className="text-xs uppercase tracking-widest text-muted-foreground pt-2">
          5 min de lectura
        </p>
      </div>

      {/* Visual element - 2 cols */}
      <div className="lg:col-span-2 flex flex-col items-center justify-center">
        {/* Large professional chart or data visualization */}
        <div className="w-full bg-muted/30 rounded-xl p-6 border">
          <div className="text-center mb-4">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Dato Destacado
            </span>
          </div>
          
          {/* Data highlight as large number if it contains a number */}
          {dataHighlight && (
            <div className="text-center mb-6">
              <p className="text-lg font-medium text-foreground/90 leading-relaxed">
                {dataHighlight}
              </p>
            </div>
          )}

          {/* Chart visualization */}
          {chartData && chartData.data && chartData.data.length > 0 && (
            <div className="flex justify-center">
              {chartData.type === 'pie' && <MiniPieChart data={chartData.data} size={160} />}
              {chartData.type === 'line' && <MiniLineChart data={chartData.data} width={200} height={100} showTrend />}
              {chartData.type === 'radar' && <MiniRadarChart data={chartData.data} size={180} />}
              {chartData.type === 'bar' && <MiniBarChart data={chartData.data} width={200} height={120} showLabels />}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
