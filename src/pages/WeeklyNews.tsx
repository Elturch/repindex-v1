import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { useWeeklyNews, type WeeklyNewsData } from "@/hooks/useWeeklyNews";
import { supabase } from "@/integrations/supabase/client";
import { MagazineHeader } from "@/components/news/MagazineHeader";
import { FeaturedStory } from "@/components/news/FeaturedStory";
import { EditorialGrid } from "@/components/news/EditorialGrid";
import { DataTable } from "@/components/news/DataTable";
import { BriefNewsSection, type BriefNewsItem } from "@/components/news/BriefNewsSection";
import { DataQualityReport } from "@/components/news/DataQualityReport";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Newspaper } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface ChartData {
  type: 'pie' | 'line' | 'radar' | 'bar';
  data: any[];
}

interface NewsStory {
  category: string;
  slug: string;
  headline: string;
  metaDescription: string;
  lead: string;
  body: string;
  dataHighlight: string;
  keywords: string[];
  companies?: string[];
  chartData?: ChartData;
}

interface GeneratedNews {
  weekLabel: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  mainStory: {
    slug: string;
    headline: string;
    metaDescription: string;
    lead: string;
    body: string;
    dataHighlight: string;
    keywords: string[];
    companies?: string[];
    chartData?: ChartData;
  };
  stories: NewsStory[];
  briefNews?: BriefNewsItem[];
  dataQualityReport?: {
    headline: string;
    summary: string;
    totalCompanies: number;
    modelCoverage: {
      model: string;
      companies: number;
      status: 'ok' | 'warning' | 'error';
      note?: string;
    }[];
    issues?: string[];
    recommendations?: string[];
  };
}

interface StoredNews {
  id: string;
  week_start: string;
  week_end: string;
  week_label: string;
  main_headline: string;
  main_story: GeneratedNews["mainStory"];
  stories: NewsStory[];
  brief_news?: BriefNewsItem[];
  data_quality_report?: GeneratedNews["dataQualityReport"];
  meta_title: string;
  meta_description: string;
  keywords: string[];
  published_at: string;
}

export default function WeeklyNews() {
  const { data: weekData, isLoading: isLoadingData, error: dataError } = useWeeklyNews();
  const [generatedNews, setGeneratedNews] = useState<GeneratedNews | null>(null);

  // Load pre-generated news from database
  const { data: storedNews, isLoading: isLoadingStored } = useQuery({
    queryKey: ["stored-news"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_news")
        .select("*")
        .eq("status", "published")
        .order("week_start", { ascending: false })
        .limit(1);
      
      if (error) throw error;
      return data?.[0] as unknown as StoredNews | undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Convert stored news to GeneratedNews format
  useEffect(() => {
    if (storedNews && !generatedNews) {
      setGeneratedNews({
        weekLabel: storedNews.week_label,
        metaTitle: storedNews.meta_title,
        metaDescription: storedNews.meta_description,
        keywords: storedNews.keywords || [],
        mainStory: storedNews.main_story,
        stories: storedNews.stories,
        briefNews: storedNews.brief_news || [],
        dataQualityReport: storedNews.data_quality_report
      });
    }
  }, [storedNews]);

  const isLoading = isLoadingData || isLoadingStored;

  if (isLoading) {
    return (
      <Layout>
        <div className="container max-w-6xl py-8 space-y-8">
          <Skeleton className="h-32 w-full" />
          <div className="grid lg:grid-cols-5 gap-8">
            <Skeleton className="lg:col-span-3 h-64" />
            <Skeleton className="lg:col-span-2 h-64" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </Layout>
    );
  }

  if (dataError) {
    return (
      <Layout>
        <div className="container max-w-6xl py-8">
          <div className="text-center py-16">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error al cargar datos</h2>
            <p className="text-muted-foreground">{dataError.message}</p>
          </div>
        </div>
      </Layout>
    );
  }

  // No news available yet
  if (!generatedNews) {
    return (
      <Layout>
        <div className="container max-w-6xl py-8">
          <div className="text-center py-16 space-y-4">
            <Newspaper className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <h2 className="text-2xl font-serif font-bold">Próxima Edición en Preparación</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              El boletín semanal de RepIndex se publica cada lunes a las 6:00 AM. 
              Vuelve pronto para leer el análisis de reputación corporativa de la semana.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  const seoTitle = generatedNews?.metaTitle || "Noticias RepIndex | Reputación Corporativa IA";
  const seoDescription = generatedNews?.metaDescription || "Análisis semanal de la reputación corporativa según las principales IAs. RepIndex monitoriza cómo ChatGPT, Perplexity, Gemini y DeepSeek evalúan a las empresas españolas.";
  const seoKeywords = generatedNews?.keywords?.join(", ") || "repindex, reputación corporativa, ibex-35, inteligencia artificial empresas";

  // Extract headlines for table of contents
  const tocItems = [
    { title: generatedNews.mainStory.headline, section: "Noticia Principal" },
    ...generatedNews.stories.map((story, idx) => ({
      title: story.headline,
      section: story.category
    }))
  ];

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <meta name="keywords" content={seoKeywords} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDescription} />
        <link rel="canonical" href="https://repindex.ai/noticias" />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            "name": "Noticias RepIndex",
            "description": "Análisis semanal de reputación corporativa basado en inteligencia artificial",
            "publisher": {
              "@type": "Organization",
              "name": "RepIndex",
              "url": "https://repindex.ai"
            },
            "blogPost": generatedNews?.stories?.map((story) => ({
              "@type": "BlogPosting",
              "headline": story.headline,
              "description": story.metaDescription || story.lead,
              "keywords": story.keywords?.join(", "),
              "datePublished": storedNews?.published_at,
              "author": {
                "@type": "Organization",
                "name": "RepIndex"
              }
            }))
          })}
        </script>

        {/* Print-specific styles for cover and TOC */}
        <style>{`
          @media print {
            .print-cover-page {
              display: flex !important;
              width: 210mm;
              height: 297mm;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%) !important;
              color: white !important;
              text-align: center;
              page-break-after: always;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-cover-logo {
              font-size: 4rem;
              font-weight: 900;
              letter-spacing: -2px;
              margin-bottom: 10px;
            }
            .print-cover-logo span {
              color: #e94560;
            }
            .print-cover-tagline {
              font-size: 0.9rem;
              text-transform: uppercase;
              letter-spacing: 4px;
              opacity: 0.8;
              margin-bottom: 50px;
            }
            .print-cover-divider {
              width: 120px;
              height: 3px;
              background: linear-gradient(90deg, transparent, #e94560, transparent);
              margin: 30px 0;
            }
            .print-cover-edition {
              font-size: 0.85rem;
              text-transform: uppercase;
              letter-spacing: 3px;
              opacity: 0.7;
              margin-bottom: 15px;
            }
            .print-cover-week {
              font-size: 2rem;
              font-weight: 700;
              margin-bottom: 20px;
              padding: 15px 40px;
              border: 2px solid rgba(255,255,255,0.3);
              background: rgba(255,255,255,0.05);
            }
            .print-cover-date {
              font-size: 1rem;
              opacity: 0.9;
              margin-top: 20px;
            }
            .print-cover-footer {
              position: absolute;
              bottom: 40px;
              font-size: 0.75rem;
              opacity: 0.6;
              letter-spacing: 1px;
            }
            
            .print-toc-page {
              display: block !important;
              padding: 40px 50px;
              min-height: 297mm;
              page-break-after: always;
            }
            .print-toc-title {
              font-size: 2rem;
              font-weight: 800;
              margin-bottom: 30px;
              padding-bottom: 15px;
              border-bottom: 3px solid #1a1a1a;
              font-family: Georgia, serif;
            }
            .print-toc-list {
              list-style: none;
              padding: 0;
              margin: 0;
            }
            .print-toc-item {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              padding: 10px 0;
              border-bottom: 1px dotted #ccc;
              font-size: 0.95rem;
              font-family: Georgia, serif;
            }
            .print-toc-number {
              font-weight: 700;
              color: #e94560;
              margin-right: 12px;
              min-width: 25px;
            }
            .print-toc-text {
              flex: 1;
              padding-right: 10px;
            }
            .print-toc-category {
              font-size: 0.75rem;
              color: #666;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .print-toc-about {
              margin-top: 40px;
              padding: 20px;
              background: #f9f9f9;
              border-left: 4px solid #e94560;
            }
            .print-toc-about h3 {
              margin-bottom: 10px;
              font-size: 1rem;
            }
            .print-toc-about p {
              font-size: 0.9rem;
              line-height: 1.5;
              text-align: left;
              margin: 0;
            }
          }
          
          @media screen {
            .print-cover-page,
            .print-toc-page {
              display: none !important;
            }
          }
        `}</style>
      </Helmet>

      <Layout>
        {/* Print-only Cover Page */}
        <div className="print-cover-page hidden">
          <div className="print-cover-logo">Rep<span>Index</span></div>
          <p className="print-cover-tagline">La Autoridad en Reputación Corporativa de las IAs</p>
          
          <div className="print-cover-divider"></div>
          
          <p className="print-cover-edition">Boletín Semanal</p>
          <div className="print-cover-week">{generatedNews.weekLabel}</div>
          
          <p className="print-cover-date">
            {storedNews?.published_at 
              ? new Date(storedNews.published_at).toLocaleDateString("es-ES", { 
                  weekday: "long", 
                  year: "numeric", 
                  month: "long", 
                  day: "numeric" 
                })
              : new Date().toLocaleDateString("es-ES", { 
                  weekday: "long", 
                  year: "numeric", 
                  month: "long", 
                  day: "numeric" 
                })
            }
          </p>
          
          <p className="print-cover-footer">
            Análisis basado en ChatGPT • Perplexity • Gemini • DeepSeek
          </p>
        </div>

        {/* Print-only Table of Contents */}
        <div className="print-toc-page hidden">
          <h1 className="print-toc-title">Índice de Contenidos</h1>
          
          <ul className="print-toc-list">
            {tocItems.slice(0, 16).map((item, idx) => (
              <li key={idx} className="print-toc-item">
                <span className="print-toc-number">{idx + 1}.</span>
                <span className="print-toc-text">{item.title}</span>
                <span className="print-toc-category">{item.section}</span>
              </li>
            ))}
          </ul>
          
          <div className="print-toc-about">
            <h3>Sobre este informe</h3>
            <p>
              Este boletín semanal presenta el análisis de reputación corporativa de las principales 
              empresas españolas según la percepción de cuatro modelos de inteligencia artificial 
              líderes: ChatGPT, Perplexity, Gemini y DeepSeek. Los datos se recopilan cada domingo 
              y el informe se publica automáticamente cada lunes a las 6:00 AM CET.
            </p>
          </div>
        </div>

        <article className="container max-w-6xl py-8 print:max-w-none print:py-0 print:px-0">
          {/* Magazine Header */}
          <MagazineHeader 
            weekLabel={generatedNews.weekLabel} 
            publishedAt={storedNews?.published_at}
          />

          {/* Featured Story */}
          <FeaturedStory
            headline={generatedNews.mainStory.headline}
            lead={generatedNews.mainStory.lead}
            body={generatedNews.mainStory.body}
            dataHighlight={generatedNews.mainStory.dataHighlight}
            chartData={generatedNews.mainStory.chartData}
            companies={generatedNews.mainStory.companies}
          />

          {/* Editorial Grid */}
          <section className="py-8" aria-label="Noticias de la semana">
            <EditorialGrid stories={generatedNews.stories} />
          </section>

          {/* Brief News Section */}
          {generatedNews.briefNews && generatedNews.briefNews.length > 0 && (
            <BriefNewsSection items={generatedNews.briefNews} />
          )}

          {/* Data Tables Section */}
          {weekData && (
            <section className="space-y-8 pt-8 border-t" aria-label="Datos de la semana">
              <div className="text-center">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  Anexo de Datos
                </span>
                <h2 className="text-2xl font-serif font-bold mt-1">Métricas de la Semana</h2>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <DataTable
                  title="Top Subidas"
                  data={weekData.topRisers.slice(0, 5)}
                  columns={[
                    { key: 'company_name', label: 'Empresa' },
                    { key: 'model_name', label: 'Modelo' },
                    { key: 'change', label: 'Cambio', format: (v) => `+${v}` }
                  ]}
                  highlightPositive
                />

                <DataTable
                  title="Top Caídas"
                  data={weekData.topFallers.slice(0, 5)}
                  columns={[
                    { key: 'company_name', label: 'Empresa' },
                    { key: 'model_name', label: 'Modelo' },
                    { key: 'change', label: 'Cambio' }
                  ]}
                  highlightNegative
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <DataTable
                  title="Máxima Divergencia"
                  data={weekData.divergences}
                  columns={[
                    { key: 'company_name', label: 'Empresa' },
                    { key: 'std_dev', label: 'Desviación', format: (v) => v.toFixed(1) },
                    { key: 'avg_score', label: 'Media', format: (v) => v.toFixed(0) }
                  ]}
                />

                <DataTable
                  title="Máximo Consenso"
                  data={weekData.consensuses}
                  columns={[
                    { key: 'company_name', label: 'Empresa' },
                    { key: 'std_dev', label: 'Desviación', format: (v) => v.toFixed(1) },
                    { key: 'avg_score', label: 'Media', format: (v) => v.toFixed(0) }
                  ]}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <DataTable
                  title="Modelos de IA"
                  data={weekData.modelStats}
                  columns={[
                    { key: 'model_name', label: 'Modelo' },
                    { key: 'avg_score', label: 'Promedio', format: (v) => v.toFixed(1) },
                    { key: 'company_count', label: 'Empresas' }
                  ]}
                />

                <DataTable
                  title="Sectores"
                  data={weekData.sectorStats.slice(0, 5)}
                  columns={[
                    { key: 'sector', label: 'Sector' },
                    { key: 'avg_score', label: 'Promedio', format: (v) => v.toFixed(1) },
                    { key: 'company_count', label: 'Empresas' }
                  ]}
                />
              </div>

              {/* Data Quality Report - alongside data tables */}
              {generatedNews?.dataQualityReport && (
                <div className="mt-8">
                  <DataQualityReport report={generatedNews.dataQualityReport} />
                </div>
              )}
            </section>
          )}

          {/* Footer */}
          <footer className="text-center py-8 border-t mt-8">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} RepIndex — La Autoridad en Reputación Corporativa de las IAs
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Generado automáticamente cada lunes a las 6:00 AM CET
            </p>
          </footer>
        </article>
      </Layout>
    </>
  );
}
