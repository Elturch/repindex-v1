import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { useWeeklyNews, type WeeklyNewsData } from "@/hooks/useWeeklyNews";
import { supabase } from "@/integrations/supabase/client";
import { NewsHero } from "@/components/news/NewsHero";
import { StoryCard } from "@/components/news/StoryCard";
import { DataTable } from "@/components/news/DataTable";
import { BriefNewsSection, type BriefNewsItem } from "@/components/news/BriefNewsSection";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const { toast } = useToast();

  // Try to load pre-generated news from database
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
        stories: storedNews.stories
      });
    }
  }, [storedNews]);

  // Fallback: generate on-demand if no stored news
  useEffect(() => {
    if (!isLoadingStored && !storedNews && weekData && !generatedNews && !isGenerating) {
      generateNews();
    }
  }, [isLoadingStored, storedNews, weekData]);

  const generateNews = async () => {
    if (!weekData) return;
    
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-news-story', {
        body: { weekData, saveToDb: true }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setGeneratedNews(data.news as GeneratedNews);

      toast({
        title: "Noticias generadas",
        description: `${data.storiesCount} historias listas para publicar`,
      });
    } catch (err: any) {
      console.error('Error generating news:', err);
      setGenerationError(err.message || 'Error al generar las noticias');
      toast({
        title: "Error",
        description: "No se pudieron generar las noticias",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    setGeneratedNews(null);
    generateNews();
  };

  const isLoading = isLoadingData || isLoadingStored;

  if (isLoading) {
    return (
      <Layout>
        <div className="container max-w-5xl py-8 space-y-8">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-64 w-full" />
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
        <div className="container max-w-5xl py-8">
          <div className="text-center py-16">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error al cargar datos</h2>
            <p className="text-muted-foreground">{dataError.message}</p>
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
        
        {/* Structured Data for News Article */}
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
            "blogPost": generatedNews?.stories?.map((story, i) => ({
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
        <article className="container max-w-5xl py-8 space-y-8">
          {/* Header */}
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Noticias RepIndex
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {generatedNews?.weekLabel || weekData?.weekLabel || 'Cargando...'}
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRegenerate}
              disabled={isGenerating}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
              Regenerar
            </Button>
          </header>

          {/* Loading state */}
          {isGenerating && (
            <div className="bg-muted/50 rounded-lg p-8 text-center">
              <RefreshCw className="h-8 w-8 mx-auto animate-spin text-primary mb-4" />
              <p className="font-medium">Generando análisis periodístico...</p>
              <p className="text-sm text-muted-foreground mt-1">
                15 noticias SEO-optimizadas en preparación
              </p>
            </div>
          )}

          {/* Generation error */}
          {generationError && !isGenerating && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Error al generar noticias</p>
                  <p className="text-sm text-muted-foreground mt-1">{generationError}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={generateNews}
                  >
                    Reintentar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Main Story */}
          {generatedNews && (
            <>
              <NewsHero 
                headline={generatedNews.mainStory.headline}
                lead={generatedNews.mainStory.lead}
                body={generatedNews.mainStory.body}
                dataHighlight={generatedNews.mainStory.dataHighlight}
              />

              {/* Stories Grid - 14 additional stories */}
              <section aria-label="Noticias de la semana">
                <h2 className="sr-only">Todas las noticias de la semana</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {generatedNews.stories.map((story, index) => (
                    <StoryCard
                      key={index}
                      category={story.category}
                      headline={story.headline}
                      body={story.body}
                      dataHighlight={story.dataHighlight}
                      lead={story.lead}
                      keywords={story.keywords}
                    />
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Data Tables Section */}
          {weekData && (
            <section className="space-y-8 pt-8 border-t" aria-label="Datos de la semana">
              <h2 className="text-2xl font-bold">Datos de la Semana</h2>
              
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
        </article>
      </Layout>
    </>
  );
}
