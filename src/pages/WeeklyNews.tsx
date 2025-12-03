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
    chartData?: ChartData;
  };
  stories: NewsStory[];
  briefNews?: BriefNewsItem[];
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
        briefNews: storedNews.brief_news || []
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
      </Helmet>

      <Layout>
        <article className="container max-w-6xl py-8">
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
