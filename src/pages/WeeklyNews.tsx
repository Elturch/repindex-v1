import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { useWeeklyNews } from "@/hooks/useWeeklyNews";
import { supabase } from "@/integrations/supabase/client";
import { NewsHero } from "@/components/news/NewsHero";
import { StoryCard } from "@/components/news/StoryCard";
import { DataTable } from "@/components/news/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NewsStory {
  category: string;
  headline: string;
  body: string;
  dataHighlight: string;
}

interface GeneratedNews {
  weekLabel: string;
  mainStory: {
    headline: string;
    lead: string;
    body: string;
    dataHighlight: string;
  };
  stories: NewsStory[];
}

export default function WeeklyNews() {
  const { data: weekData, isLoading: isLoadingData, error: dataError } = useWeeklyNews();
  const [generatedNews, setGeneratedNews] = useState<GeneratedNews | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const { toast } = useToast();

  // Check cache and generate news
  useEffect(() => {
    if (weekData && !generatedNews && !isGenerating) {
      const cacheKey = `repindex_news_${weekData.weekStart}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          setGeneratedNews(JSON.parse(cached));
          return;
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      }
      
      generateNews();
    }
  }, [weekData]);

  const generateNews = async () => {
    if (!weekData) return;
    
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-news-story', {
        body: { weekData }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const news = data.news as GeneratedNews;
      setGeneratedNews(news);
      
      // Cache the result
      const cacheKey = `repindex_news_${weekData.weekStart}`;
      localStorage.setItem(cacheKey, JSON.stringify(news));

      toast({
        title: "Noticias generadas",
        description: "El análisis periodístico está listo",
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
    if (weekData) {
      const cacheKey = `repindex_news_${weekData.weekStart}`;
      localStorage.removeItem(cacheKey);
      setGeneratedNews(null);
      generateNews();
    }
  };

  if (isLoadingData) {
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

  return (
    <Layout>
      <div className="container max-w-5xl py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">📰 Noticias RepIndex</h1>
            <p className="text-muted-foreground mt-1">
              {weekData?.weekLabel || 'Cargando...'}
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
        </div>

        {/* Loading state for generation */}
        {isGenerating && (
          <div className="bg-muted/50 rounded-lg p-8 text-center">
            <RefreshCw className="h-8 w-8 mx-auto animate-spin text-primary mb-4" />
            <p className="font-medium">Generando análisis periodístico...</p>
            <p className="text-sm text-muted-foreground mt-1">
              La IA está buscando las historias detrás de los datos
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

            {/* Secondary Stories Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {generatedNews.stories.map((story, index) => (
                <StoryCard
                  key={index}
                  category={story.category}
                  headline={story.headline}
                  body={story.body}
                  dataHighlight={story.dataHighlight}
                />
              ))}
            </div>
          </>
        )}

        {/* Data Tables Section */}
        {weekData && (
          <div className="space-y-8 pt-8 border-t">
            <h2 className="text-2xl font-bold">📊 Datos de la Semana</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Risers */}
              <DataTable
                title="🚀 Top Subidas"
                data={weekData.topRisers.slice(0, 5)}
                columns={[
                  { key: 'company_name', label: 'Empresa' },
                  { key: 'model_name', label: 'Modelo' },
                  { key: 'change', label: 'Cambio', format: (v) => `+${v}` }
                ]}
                highlightPositive
              />

              {/* Top Fallers */}
              <DataTable
                title="📉 Top Caídas"
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
              {/* Divergences */}
              <DataTable
                title="⚡ Máxima Divergencia"
                data={weekData.divergences}
                columns={[
                  { key: 'company_name', label: 'Empresa' },
                  { key: 'std_dev', label: 'Desviación', format: (v) => v.toFixed(1) },
                  { key: 'avg_score', label: 'Media', format: (v) => v.toFixed(0) }
                ]}
              />

              {/* Consensuses */}
              <DataTable
                title="🤝 Máximo Consenso"
                data={weekData.consensuses}
                columns={[
                  { key: 'company_name', label: 'Empresa' },
                  { key: 'std_dev', label: 'Desviación', format: (v) => v.toFixed(1) },
                  { key: 'avg_score', label: 'Media', format: (v) => v.toFixed(0) }
                ]}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Model Stats */}
              <DataTable
                title="🤖 Modelos de IA"
                data={weekData.modelStats}
                columns={[
                  { key: 'model_name', label: 'Modelo' },
                  { key: 'avg_score', label: 'Promedio', format: (v) => v.toFixed(1) },
                  { key: 'company_count', label: 'Empresas' }
                ]}
              />

              {/* Sector Stats */}
              <DataTable
                title="🏢 Sectores"
                data={weekData.sectorStats.slice(0, 5)}
                columns={[
                  { key: 'sector', label: 'Sector' },
                  { key: 'avg_score', label: 'Promedio', format: (v) => v.toFixed(1) },
                  { key: 'company_count', label: 'Empresas' }
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
