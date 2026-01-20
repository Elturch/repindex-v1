import { useState } from "react";
import { Link } from "react-router-dom";
import { MiniBarChart, MiniLineChart, MiniPieChart, MiniRadarChart } from "./MiniCharts";
import { DataVerificationModal } from "./DataVerificationModal";
import { CheckCircle, Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { trackNewsClick } from "@/lib/gtmEvents";
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
  companies?: string[];
  slug?: string;
  publishedAt?: string;
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
  const primaryStories = stories.slice(0, 3);
  const secondaryStories = stories.slice(3, 8);
  const tertiaryStories = stories.slice(8);

  return (
    <div className="space-y-10 print:space-y-6">
      {/* Section header */}
      <div className="text-center border-b pb-4 print:pb-2">
        <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Noticias de la Semana
        </span>
      </div>

      {/* Primary stories: Full narrative with charts */}
      <div className="space-y-8 print:space-y-4">
        {primaryStories.map((story, i) => (
          <PrimaryStoryCard key={i} story={story} index={i} />
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 print:gap-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Más Noticias</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Secondary stories: Medium format with narrative */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 print:gap-4">
        {secondaryStories.map((story, i) => (
          <SecondaryStoryCard key={i} story={story} />
        ))}
      </div>

      {/* Tertiary: Compact but still readable */}
      {tertiaryStories.length > 0 && (
        <>
          <div className="flex items-center gap-4 print:gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Breves</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 print:gap-3">
            {tertiaryStories.map((story, i) => (
              <TertiaryStoryCard key={i} story={story} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PrimaryStoryCard({ story, index }: { story: Story; index: number }) {
  const [showVerification, setShowVerification] = useState(false);
  const categoryLabel = categoryLabels[story.category?.toLowerCase()] || story.category?.toUpperCase();
  const paragraphs = story.body.split('\n\n');
  const isEven = index % 2 === 0;
  const companies = story.companies || [];

  return (
    <>
      <article className={`grid lg:grid-cols-3 gap-6 pb-8 border-b print:pb-4 print:break-inside-avoid ${isEven ? '' : 'lg:grid-flow-dense'}`}>
        {/* Content */}
        <div className={`lg:col-span-2 space-y-3 ${isEven ? '' : 'lg:col-start-2'}`}>
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            {categoryLabel}
          </span>
          
          {story.slug ? (
            <Link 
              to={`/noticias/${story.slug}`} 
              className="block group"
              onClick={() => trackNewsClick(story.slug!, story.headline, story.category || 'unknown', true)}
            >
              <h2 className="text-2xl md:text-3xl font-serif font-bold leading-tight print:text-xl group-hover:text-primary transition-colors">
                {story.headline}
              </h2>
            </Link>
          ) : (
            <h2 className="text-2xl md:text-3xl font-serif font-bold leading-tight print:text-xl">
              {story.headline}
            </h2>
          )}
          
          {story.lead && (
            <p className="text-lg text-muted-foreground leading-relaxed font-serif print:text-base">
              {story.lead}
            </p>
          )}

          {/* Full narrative body */}
          <div className="prose dark:prose-invert max-w-none">
            {paragraphs.map((paragraph, i) => (
              <p key={i} className="text-foreground/80 leading-relaxed mb-3 last:mb-0 print:text-sm print:mb-2">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            {story.slug && (
              <Button
                variant="link"
                asChild
                size="sm"
                className="gap-1 px-0 text-xs print:hidden"
              >
                <Link 
                  to={`/noticias/${story.slug}`}
                  onClick={() => trackNewsClick(story.slug!, story.headline, story.category || 'unknown', true)}
                >
                  Leer artículo completo
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            {companies.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVerification(true)}
                className="gap-1.5 text-xs text-primary hover:text-primary print:hidden"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Verificar datos
              </Button>
            )}
          </div>
        </div>

        {/* Chart sidebar */}
        <div className={`lg:col-span-1 ${isEven ? '' : 'lg:col-start-1 lg:row-start-1'}`}>
          {story.chartData && story.chartData.data && story.chartData.data.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-5 border print:p-3">
              <div className="flex justify-center mb-3">
                {story.chartData.type === 'pie' && <MiniPieChart data={story.chartData.data} size={180} />}
                {story.chartData.type === 'line' && <MiniLineChart data={story.chartData.data} width={220} height={120} showTrend />}
                {story.chartData.type === 'radar' && <MiniRadarChart data={story.chartData.data} size={220} />}
                {story.chartData.type === 'bar' && <MiniBarChart data={story.chartData.data} width={220} height={140} showLabels />}
              </div>
              <p className="text-xs text-center text-muted-foreground font-medium">
                {story.dataHighlight}
              </p>
            </div>
          )}
        </div>
      </article>

      {companies.length > 0 && (
        <DataVerificationModal
          isOpen={showVerification}
          onClose={() => setShowVerification(false)}
          companies={companies}
          headline={story.headline}
          category={categoryLabel}
        />
      )}
    </>
  );
}

function SecondaryStoryCard({ story }: { story: Story }) {
  const [showVerification, setShowVerification] = useState(false);
  const categoryLabel = categoryLabels[story.category?.toLowerCase()] || story.category?.toUpperCase();
  const paragraphs = story.body.split('\n\n').slice(0, 2);
  const companies = story.companies || [];

  return (
    <>
      <article className="space-y-3 pb-6 border-b print:pb-3 print:break-inside-avoid">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          {/* Mini chart */}
          {story.chartData && story.chartData.data && story.chartData.data.length > 0 && (
            <div className="flex-shrink-0 flex justify-center sm:justify-start">
              {story.chartData.type === 'pie' && <MiniPieChart data={story.chartData.data} size={120} />}
              {story.chartData.type === 'line' && <MiniLineChart data={story.chartData.data} width={140} height={80} />}
              {story.chartData.type === 'radar' && <MiniRadarChart data={story.chartData.data} size={140} />}
              {story.chartData.type === 'bar' && <MiniBarChart data={story.chartData.data} width={140} height={90} horizontal />}
            </div>
          )}
          
          <div className="flex-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {categoryLabel}
            </span>
            
            {story.slug ? (
              <Link 
                to={`/noticias/${story.slug}`} 
                className="block group"
                onClick={() => trackNewsClick(story.slug!, story.headline, story.category || 'unknown')}
              >
                <h3 className="text-lg font-serif font-semibold leading-tight mt-1 print:text-base group-hover:text-primary transition-colors">
                  {story.headline}
                </h3>
              </Link>
            ) : (
              <h3 className="text-lg font-serif font-semibold leading-tight mt-1 print:text-base">
                {story.headline}
              </h3>
            )}
          </div>
        </div>

        {/* Lead */}
        {story.lead && (
          <p className="text-sm text-muted-foreground leading-relaxed print:text-xs">
            {story.lead}
          </p>
        )}

        {/* Abbreviated body */}
        <div className="text-sm text-foreground/70 leading-relaxed print:text-xs">
          {paragraphs.map((paragraph, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Data highlight + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="bg-muted/50 rounded px-3 py-2 text-xs border-l-2 border-primary flex-1">
            <p className="font-medium">{story.dataHighlight}</p>
          </div>
          <div className="flex items-center gap-1">
            {story.slug && (
              <Button
                variant="link"
                asChild
                size="sm"
                className="gap-0.5 text-[10px] px-0 print:hidden"
              >
                <Link 
                  to={`/noticias/${story.slug}`}
                  onClick={() => trackNewsClick(story.slug!, story.headline, story.category || 'unknown')}
                >
                  Leer más
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            )}
            {companies.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVerification(true)}
                className="gap-1 text-[10px] text-muted-foreground hover:text-primary print:hidden"
              >
                <CheckCircle className="h-3 w-3" />
                Verificar
              </Button>
            )}
          </div>
        </div>
      </article>

      {companies.length > 0 && (
        <DataVerificationModal
          isOpen={showVerification}
          onClose={() => setShowVerification(false)}
          companies={companies}
          headline={story.headline}
          category={categoryLabel}
        />
      )}
    </>
  );
}

function TertiaryStoryCard({ story }: { story: Story }) {
  const categoryLabel = categoryLabels[story.category?.toLowerCase()] || story.category?.toUpperCase();
  const firstParagraph = story.body.split('\n\n')[0];

  return (
    <article className="space-y-2 pb-4 border-b print:pb-2 print:break-inside-avoid">
      <div className="flex items-start gap-3">
        {/* Mini chart */}
        {story.chartData && story.chartData.data && story.chartData.data.length > 0 && (
          <div className="flex-shrink-0">
            {story.chartData.type === 'pie' && <MiniPieChart data={story.chartData.data} size={80} />}
            {story.chartData.type === 'line' && <MiniLineChart data={story.chartData.data} width={80} height={50} />}
            {story.chartData.type === 'radar' && <MiniRadarChart data={story.chartData.data} size={100} />}
            {story.chartData.type === 'bar' && <MiniBarChart data={story.chartData.data} width={80} height={50} horizontal />}
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            {categoryLabel}
          </span>
          {story.slug ? (
            <Link 
              to={`/noticias/${story.slug}`} 
              className="block group"
              onClick={() => trackNewsClick(story.slug!, story.headline, story.category || 'unknown')}
            >
              <h4 className="text-sm font-semibold leading-tight print:text-xs group-hover:text-primary transition-colors">
                {story.headline}
              </h4>
            </Link>
          ) : (
            <h4 className="text-sm font-semibold leading-tight print:text-xs">
              {story.headline}
            </h4>
          )}
        </div>
      </div>
      
      {/* Brief narrative */}
      <p className="text-xs text-foreground/70 leading-relaxed line-clamp-3 print:line-clamp-2">
        {firstParagraph}
      </p>
      
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground font-medium">
          {story.dataHighlight}
        </p>
        {story.slug && (
          <Link 
            to={`/noticias/${story.slug}`} 
            className="text-[10px] text-primary hover:underline print:hidden"
            onClick={() => trackNewsClick(story.slug!, story.headline, story.category || 'unknown')}
          >
            Leer más →
          </Link>
        )}
      </div>
    </article>
  );
}
