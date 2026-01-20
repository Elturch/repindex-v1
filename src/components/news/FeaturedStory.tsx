import { useState } from "react";
import { Link } from "react-router-dom";
import { MiniBarChart, MiniLineChart, MiniPieChart, MiniRadarChart } from "./MiniCharts";
import { DataVerificationModal } from "./DataVerificationModal";
import { Button } from "@/components/ui/button";
import { CheckCircle, Calendar, Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  companies?: string[];
  slug?: string;
  publishedAt?: string;
}

export function FeaturedStory({ headline, lead, body, dataHighlight, chartData, companies = [], slug, publishedAt }: FeaturedStoryProps) {
  const [showVerification, setShowVerification] = useState(false);
  
  const formattedDate = publishedAt 
    ? format(new Date(publishedAt), "d 'de' MMMM 'de' yyyy", { locale: es })
    : null;
  
  // Calculate reading time from full body for display
  const readingTime = Math.ceil(body.split(/\s+/).length / 200);
  
  return (
    <>
      <article className="pb-10 border-b-2 border-foreground/20 print:pb-6 print:border-b">
        {/* Date and reading time */}
        {(formattedDate || slug) && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 print:mb-2">
            {formattedDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formattedDate}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {readingTime} min de lectura
            </span>
          </div>
        )}
        
        {/* Main headline */}
        {slug ? (
          <Link to={`/noticias/${slug}`} className="group">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-serif font-bold leading-[1.1] tracking-tight mb-6 print:text-2xl print:mb-4 group-hover:text-primary transition-colors">
              {headline}
            </h1>
          </Link>
        ) : (
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-serif font-bold leading-[1.1] tracking-tight mb-6 print:text-2xl print:mb-4">
            {headline}
          </h1>
        )}
        
        <div className="grid lg:grid-cols-3 gap-8 print:gap-4">
          {/* Main content - 2 cols */}
          <div className="lg:col-span-2 space-y-4">
            {/* Lead paragraph */}
            <p className="text-xl md:text-2xl text-foreground/90 leading-relaxed font-serif print:text-base">
              {lead}
            </p>
            
            {/* First paragraph preview from body */}
            {body && (
              <p className="text-base text-foreground/70 leading-relaxed print:text-sm">
                {body.split('\n\n')[0]}
              </p>
            )}

            {/* CTA to read full article */}
            <div className="flex items-center gap-4 pt-4 print:pt-2">
              {slug && (
                <Button
                  asChild
                  size="lg"
                  className="gap-2"
                >
                  <Link to={`/noticias/${slug}`}>
                    Leer artículo completo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              {companies.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVerification(true)}
                  className="gap-2 print:hidden"
                >
                  <CheckCircle className="h-4 w-4" />
                  Verificar datos
                </Button>
              )}
            </div>
          </div>
          <aside className="lg:col-span-1 print:break-inside-avoid">
            <div className="bg-muted/30 rounded-xl p-6 border sticky top-24 print:static print:p-4 print:rounded-lg">
              <div className="text-center mb-4">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Dato Destacado
                </span>
              </div>
              
              {/* Data highlight */}
              {dataHighlight && (
                <div className="text-center mb-6 print:mb-4">
                  <p className="text-lg font-semibold text-foreground leading-relaxed print:text-base">
                    {dataHighlight}
                  </p>
                </div>
              )}

              {/* Chart visualization */}
              {chartData && chartData.data && chartData.data.length > 0 && (
                <div className="flex justify-center print:scale-90">
                  {chartData.type === 'pie' && <MiniPieChart data={chartData.data} size={180} />}
                  {chartData.type === 'line' && <MiniLineChart data={chartData.data} width={220} height={120} showTrend />}
                  {chartData.type === 'radar' && <MiniRadarChart data={chartData.data} size={200} />}
                  {chartData.type === 'bar' && <MiniBarChart data={chartData.data} width={220} height={140} showLabels />}
                </div>
              )}

              <p className="text-[10px] text-center text-muted-foreground mt-4 print:mt-2">
                Fuente: RepIndex · Datos de la semana en curso
              </p>
            </div>
          </aside>
        </div>
      </article>

      {companies.length > 0 && (
        <DataVerificationModal
          isOpen={showVerification}
          onClose={() => setShowVerification(false)}
          companies={companies}
          headline={headline}
          category="DESTACADO"
        />
      )}
    </>
  );
}
