import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, Clock, Eye, Share2, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MiniBarChart, MiniLineChart, MiniPieChart, MiniRadarChart } from "@/components/news/MiniCharts";
import { DataVerificationModal } from "@/components/news/DataVerificationModal";
import { RelatedNews } from "@/components/news/RelatedNews";
import { useState, useEffect } from "react";
import { Json } from "@/integrations/supabase/types";
import { trackArticleView } from "@/lib/gtmEvents";

interface ChartDataType {
  type: 'pie' | 'line' | 'radar' | 'bar';
  data: { name: string; value: number }[];
}

interface NewsArticle {
  id: string;
  slug: string;
  headline: string;
  meta_description: string | null;
  lead: string;
  body: string;
  data_highlight: string | null;
  keywords: string[] | null;
  companies: string[] | null;
  chart_data: ChartDataType | null;
  category: string | null;
  is_main_story: boolean;
  reading_time_minutes: number;
  created_at: string;
  published_at: string | null;
  view_count: number;
  canonical_url: string | null;
}

function parseChartData(data: Json | null): ChartDataType | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (!obj.type || !obj.data || !Array.isArray(obj.data)) return null;
  if (!['pie', 'line', 'radar', 'bar'].includes(obj.type as string)) return null;
  return {
    type: obj.type as 'pie' | 'line' | 'radar' | 'bar',
    data: obj.data as { name: string; value: number }[]
  };
}

const categoryLabels: Record<string, { label: string; emoji: string; color: string }> = {
  subidas: { label: "Subidas", emoji: "📈", color: "bg-green-500/10 text-green-700 border-green-500/20" },
  bajadas: { label: "Bajadas", emoji: "📉", color: "bg-red-500/10 text-red-700 border-red-500/20" },
  divergencia: { label: "Divergencia", emoji: "🔀", color: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
  consenso: { label: "Consenso", emoji: "🤝", color: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  sector: { label: "Sector", emoji: "🏭", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  modelo_ia: { label: "Modelo IA", emoji: "🤖", color: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20" },
  ibex: { label: "IBEX-35", emoji: "🇪🇸", color: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
  privadas: { label: "Privadas", emoji: "🏢", color: "bg-slate-500/10 text-slate-700 border-slate-500/20" },
  destacado: { label: "Destacado", emoji: "⭐", color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
};

export default function NewsArticleDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [showVerification, setShowVerification] = useState(false);

  // Fetch article by slug
  const { data: article, isLoading, error } = useQuery({
    queryKey: ["news-article", slug],
    queryFn: async (): Promise<NewsArticle | null> => {
      if (!slug) return null;
      
      const { data, error } = await supabase
        .from("news_articles")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      
      // Parse chart_data from Json to proper type
      return {
        ...data,
        chart_data: parseChartData(data.chart_data)
      } as NewsArticle;
    },
    enabled: !!slug,
  });

  // Increment view count and track GTM event on mount
  useEffect(() => {
    if (slug) {
      supabase.rpc("increment_article_views", { article_slug: slug });
    }
  }, [slug]);

  // Track article view in GTM when article loads
  useEffect(() => {
    if (article) {
      trackArticleView(article.slug, article.headline, article.reading_time_minutes);
    }
  }, [article]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-6 w-48 mb-8" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !article) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Artículo no encontrado</h1>
          <p className="text-muted-foreground mb-6">
            El artículo que buscas no existe o ha sido eliminado.
          </p>
          <Button asChild>
            <Link to="/noticias">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Noticias
            </Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const categoryConfig = article.category 
    ? categoryLabels[article.category] || categoryLabels.destacado 
    : categoryLabels.destacado;

  const publishedDate = article.published_at 
    ? format(new Date(article.published_at), "d 'de' MMMM 'de' yyyy", { locale: es })
    : format(new Date(article.created_at), "d 'de' MMMM 'de' yyyy", { locale: es });

  const canonicalUrl = `https://repindex.ai/noticias/${article.slug}`;

  // Split body into paragraphs
  const paragraphs = article.body.split('\n\n').filter(p => p.trim());

  // Schema.org NewsArticle
  const newsArticleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.headline,
    "description": article.meta_description || article.lead,
    "datePublished": article.published_at || article.created_at,
    "dateModified": article.published_at || article.created_at,
    "author": {
      "@type": "Organization",
      "name": "RepIndex",
      "url": "https://repindex.ai"
    },
    "publisher": {
      "@type": "Organization",
      "name": "RepIndex",
      "logo": {
        "@type": "ImageObject",
        "url": "https://repindex.ai/favicon.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl
    },
    "keywords": article.keywords?.join(", ") || "reputación corporativa, inteligencia artificial",
    "articleSection": categoryConfig.label,
    "wordCount": article.body.split(/\s+/).length
  };

  return (
    <Layout>
      <Helmet>
        <title>{article.headline} | RepIndex Noticias</title>
        <meta name="description" content={article.meta_description || article.lead} />
        <meta name="keywords" content={article.keywords?.join(", ") || "reputación corporativa, repindex"} />
        <link rel="canonical" href={canonicalUrl} />
        
        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={article.headline} />
        <meta property="og:description" content={article.meta_description || article.lead} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="RepIndex" />
        <meta property="article:published_time" content={article.published_at || article.created_at} />
        <meta property="article:section" content={categoryConfig.label} />
        {article.keywords?.map((kw, i) => (
          <meta key={i} property="article:tag" content={kw} />
        ))}
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.headline} />
        <meta name="twitter:description" content={article.meta_description || article.lead} />
        
        {/* Schema.org */}
        <script type="application/ld+json">
          {JSON.stringify(newsArticleSchema)}
        </script>
      </Helmet>

      <article className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2">
            <Link to="/noticias">
              <ArrowLeft className="h-4 w-4" />
              Todas las noticias
            </Link>
          </Button>
        </nav>

        {/* Header */}
        <header className="mb-8">
          {/* Category Badge */}
          <Badge variant="outline" className={`mb-4 ${categoryConfig.color}`}>
            <span className="mr-1">{categoryConfig.emoji}</span>
            {categoryConfig.label}
          </Badge>

          {/* Headline */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold leading-tight tracking-tight mb-4">
            {article.headline}
          </h1>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {publishedDate}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {article.reading_time_minutes} min de lectura
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              {article.view_count} lecturas
            </span>
          </div>
        </header>

        {/* Lead paragraph */}
        <div className="mb-8">
          <p className="text-xl md:text-2xl text-foreground/90 leading-relaxed font-serif">
            {article.lead}
          </p>
        </div>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Article body - 2 cols */}
          <div className="lg:col-span-2 space-y-6">
            {paragraphs.map((paragraph, i) => (
              <p key={i} className="text-foreground/80 leading-relaxed text-lg">
                {paragraph}
              </p>
            ))}

            {/* Keywords */}
            {article.keywords && article.keywords.length > 0 && (
              <div className="pt-6 border-t">
                <p className="text-sm text-muted-foreground mb-2">Palabras clave:</p>
                <div className="flex flex-wrap gap-2">
                  {article.keywords.map((keyword, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 pt-6 border-t">
              {article.companies && article.companies.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVerification(true)}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Verificar datos en el dashboard
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.share?.({
                    title: article.headline,
                    url: canonicalUrl
                  }).catch(() => {
                    navigator.clipboard.writeText(canonicalUrl);
                  });
                }}
                className="gap-2"
              >
                <Share2 className="h-4 w-4" />
                Compartir
              </Button>
            </div>
          </div>

          {/* Sidebar - 1 col */}
          <aside className="lg:col-span-1">
            <div className="bg-muted/30 rounded-xl p-6 border sticky top-24">
              {/* Data highlight */}
              {article.data_highlight && (
                <div className="text-center mb-6">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                    Dato Destacado
                  </span>
                  <p className="text-lg font-semibold text-foreground leading-relaxed mt-2">
                    {article.data_highlight}
                  </p>
                </div>
              )}

              {/* Chart */}
              {article.chart_data && article.chart_data.data && article.chart_data.data.length > 0 && (
                <div className="flex justify-center mb-4">
                  {article.chart_data.type === 'pie' && <MiniPieChart data={article.chart_data.data} size={200} />}
                  {article.chart_data.type === 'line' && <MiniLineChart data={article.chart_data.data} width={240} height={140} showTrend />}
                  {article.chart_data.type === 'radar' && <MiniRadarChart data={article.chart_data.data.map(d => ({ subject: d.name, value: d.value }))} size={220} />}
                  {article.chart_data.type === 'bar' && <MiniBarChart data={article.chart_data.data} width={240} height={160} showLabels />}
                </div>
              )}

              {/* Companies mentioned */}
              {article.companies && article.companies.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                    Empresas mencionadas
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {article.companies.map((company, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {company}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-center text-muted-foreground mt-4">
                Fuente: RepIndex · {publishedDate}
              </p>
            </div>
          </aside>
        </div>

        {/* Related News Section - SEO Internal Linking */}
        <RelatedNews 
          currentSlug={article.slug}
          category={article.category}
          companies={article.companies}
        />
      </article>

      {/* Data Verification Modal */}
      {article.companies && article.companies.length > 0 && (
        <DataVerificationModal
          isOpen={showVerification}
          onClose={() => setShowVerification(false)}
          companies={article.companies}
          headline={article.headline}
          category={categoryConfig.label}
        />
      )}
    </Layout>
  );
}
