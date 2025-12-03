import { MiniBarChart, MiniLineChart, MiniPieChart, MiniRadarChart } from "./MiniCharts";

interface ChartData {
  type: 'pie' | 'line' | 'radar' | 'bar';
  data: any[];
}

interface Story {
  category: string;
  headline: string;
  lead?: string;
  body: string;
  dataHighlight: string;
  chartData?: ChartData;
}

interface EditorialGridProps {
  stories: Story[];
}

const categoryLabels: Record<string, string> = {
  divergencia: 'DIVERGENCIA',
  consenso: 'CONSENSO',
  sector: 'SECTORES',
  modelo_ia: 'MODELOS IA',
  privadas: 'PRIVADAS',
  subidas: 'SUBIDAS',
  bajadas: 'CAÍDAS',
  ibex: 'IBEX-35',
  headline: 'DESTACADO',
};

export function EditorialGrid({ stories }: EditorialGridProps) {
  // Split stories for different sections
  const primaryStories = stories.slice(0, 2);
  const secondaryStories = stories.slice(2, 6);
  const tertiaryStories = stories.slice(6);

  return (
    <div className="space-y-8">
      {/* Primary row: 2 large stories */}
      <div className="grid md:grid-cols-2 gap-8 pb-8 border-b">
        {primaryStories.map((story, i) => (
          <PrimaryStoryCard key={i} story={story} />
        ))}
      </div>

      {/* Secondary row: 4 medium stories */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b">
        {secondaryStories.map((story, i) => (
          <SecondaryStoryCard key={i} story={story} />
        ))}
      </div>

      {/* Tertiary: compact list */}
      {tertiaryStories.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tertiaryStories.map((story, i) => (
            <TertiaryStoryCard key={i} story={story} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrimaryStoryCard({ story }: { story: Story }) {
  const categoryLabel = categoryLabels[story.category?.toLowerCase()] || story.category?.toUpperCase();

  return (
    <article className="space-y-3">
      <span className="text-xs font-semibold uppercase tracking-widest text-primary">
        {categoryLabel}
      </span>
      
      <h3 className="text-2xl font-serif font-bold leading-tight">
        {story.headline}
      </h3>
      
      {story.lead && (
        <p className="text-muted-foreground leading-relaxed">
          {story.lead}
        </p>
      )}

      {/* Chart */}
      {story.chartData && story.chartData.data && story.chartData.data.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-4 border">
          <div className="flex justify-center">
            {story.chartData.type === 'pie' && <MiniPieChart data={story.chartData.data} size={120} />}
            {story.chartData.type === 'line' && <MiniLineChart data={story.chartData.data} width={160} height={70} showTrend />}
            {story.chartData.type === 'radar' && <MiniRadarChart data={story.chartData.data} size={130} />}
            {story.chartData.type === 'bar' && <MiniBarChart data={story.chartData.data} width={160} height={80} showLabels />}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-2">
            {story.dataHighlight}
          </p>
        </div>
      )}

      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        4 min de lectura
      </p>
    </article>
  );
}

function SecondaryStoryCard({ story }: { story: Story }) {
  const categoryLabel = categoryLabels[story.category?.toLowerCase()] || story.category?.toUpperCase();

  return (
    <article className="space-y-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {categoryLabel}
      </span>
      
      <h4 className="text-base font-serif font-semibold leading-tight">
        {story.headline}
      </h4>

      {/* Mini chart */}
      {story.chartData && story.chartData.data && story.chartData.data.length > 0 && (
        <div className="flex justify-center py-2">
          {story.chartData.type === 'pie' && <MiniPieChart data={story.chartData.data} size={80} />}
          {story.chartData.type === 'line' && <MiniLineChart data={story.chartData.data} width={100} height={40} />}
          {story.chartData.type === 'radar' && <MiniRadarChart data={story.chartData.data} size={90} />}
          {story.chartData.type === 'bar' && <MiniBarChart data={story.chartData.data} width={100} height={50} />}
        </div>
      )}

      <p className="text-xs text-muted-foreground line-clamp-2">
        {story.dataHighlight}
      </p>
    </article>
  );
}

function TertiaryStoryCard({ story }: { story: Story }) {
  const categoryLabel = categoryLabels[story.category?.toLowerCase()] || story.category?.toUpperCase();

  return (
    <article className="flex gap-3 py-3 border-b last:border-b-0">
      {/* Mini chart on left */}
      {story.chartData && story.chartData.data && story.chartData.data.length > 0 && (
        <div className="flex-shrink-0">
          {story.chartData.type === 'pie' && <MiniPieChart data={story.chartData.data} size={50} />}
          {story.chartData.type === 'line' && <MiniLineChart data={story.chartData.data} width={60} height={30} />}
          {story.chartData.type === 'radar' && <MiniRadarChart data={story.chartData.data} size={55} />}
          {story.chartData.type === 'bar' && <MiniBarChart data={story.chartData.data} width={60} height={30} />}
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {categoryLabel}
        </span>
        <h5 className="text-sm font-semibold leading-tight line-clamp-2">
          {story.headline}
        </h5>
      </div>
    </article>
  );
}
