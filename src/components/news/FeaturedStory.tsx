import { useState } from "react";
import { MiniBarChart, MiniLineChart, MiniPieChart, MiniRadarChart } from "./MiniCharts";
import { DataVerificationModal } from "./DataVerificationModal";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

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
}

export function FeaturedStory({ headline, lead, body, dataHighlight, chartData, companies = [] }: FeaturedStoryProps) {
  const [showVerification, setShowVerification] = useState(false);
  const paragraphs = body.split('\n\n');
  
  return (
    <>
      <article className="pb-10 border-b-2 border-foreground/20 print:pb-6 print:border-b">
        {/* Main headline */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold leading-[1.1] tracking-tight mb-6 print:text-3xl print:mb-4">
          {headline}
        </h1>
        
        <div className="grid lg:grid-cols-3 gap-8 print:gap-4">
          {/* Main content - 2 cols */}
          <div className="lg:col-span-2 space-y-4">
            {/* Lead paragraph - larger, bold */}
            <p className="text-xl md:text-2xl text-foreground/90 leading-relaxed font-serif print:text-base">
              {lead}
            </p>
            
            {/* Full body narrative */}
            <div className="prose prose-lg dark:prose-invert max-w-none print:prose-sm">
              {paragraphs.map((paragraph, i) => (
                <p key={i} className="text-foreground/80 leading-relaxed mb-4 last:mb-0 text-base print:text-sm print:mb-2">
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 print:pt-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                5 min de lectura · Análisis RepIndex
              </p>
              {companies.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVerification(true)}
                  className="gap-2 print:hidden"
                >
                  <CheckCircle className="h-4 w-4" />
                  Verificar datos en el dashboard
                </Button>
              )}
            </div>
          </div>

          {/* Data visualization sidebar - 1 col */}
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
