import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, ArrowLeft, ChevronDown, Eye } from "lucide-react";
import { format, parseISO, startOfWeek, startOfMonth, getYear, getMonth } from "date-fns";
import { es } from "date-fns/locale";
import { trackNewsClick } from "@/lib/gtmEvents";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ArchivedArticle {
  id: string;
  slug: string;
  headline: string;
  lead: string;
  category: string | null;
  published_at: string | null;
  reading_time_minutes: number;
  view_count: number;
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

type ViewMode = "week" | "month";

export default function NewsArchive() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Fetch all published articles
  const { data: articles, isLoading } = useQuery({
    queryKey: ["news-archive"],
    queryFn: async (): Promise<ArchivedArticle[]> => {
      const { data, error } = await supabase
        .from("news_articles")
        .select("id, slug, headline, lead, category, published_at, reading_time_minutes, view_count")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Get unique categories from articles
  const categories = useMemo(() => {
    if (!articles) return [];
    const cats = new Set(articles.map(a => a.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [articles]);

  // Filter by category
  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    if (selectedCategory === "all") return articles;
    return articles.filter(a => a.category === selectedCategory);
  }, [articles, selectedCategory]);

  // Group articles by week or month
  const groupedArticles = useMemo(() => {
    if (!filteredArticles.length) return new Map<string, ArchivedArticle[]>();

    const groups = new Map<string, ArchivedArticle[]>();

    filteredArticles.forEach(article => {
      if (!article.published_at) return;
      
      const date = parseISO(article.published_at);
      let key: string;
      
      if (viewMode === "week") {
        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
        key = format(weekStart, "yyyy-MM-dd");
      } else {
        const monthStart = startOfMonth(date);
        key = format(monthStart, "yyyy-MM");
      }
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(article);
    });

    return groups;
  }, [filteredArticles, viewMode]);

  // Format group header
  const formatGroupHeader = (key: string): string => {
    if (viewMode === "week") {
      const date = parseISO(key);
      const weekEnd = new Date(date);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `Semana del ${format(date, "d", { locale: es })} al ${format(weekEnd, "d 'de' MMMM yyyy", { locale: es })}`;
    } else {
      const [year, month] = key.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return format(date, "MMMM yyyy", { locale: es }).replace(/^\w/, c => c.toUpperCase());
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Archivo de Noticias | RepIndex</title>
        <meta name="description" content="Explora el archivo completo de noticias de reputación corporativa de RepIndex. Análisis semanal de cómo las IAs perciben a las empresas españolas." />
        <link rel="canonical" href="https://repindex.ai/noticias/archivo" />
      </Helmet>

      <div className="container max-w-5xl py-8">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-4">
            <Link to="/noticias">
              <ArrowLeft className="h-4 w-4" />
              Volver a Noticias
            </Link>
          </Button>
          
          <h1 className="text-3xl md:text-4xl font-serif font-bold mb-2">
            Archivo de Noticias
          </h1>
          <p className="text-muted-foreground">
            Explora todas las noticias de reputación corporativa publicadas por RepIndex
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Agrupar por:</span>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Categoría:</span>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map(cat => {
                  const config = categoryLabels[cat] || { label: cat, emoji: "📰" };
                  return (
                    <SelectItem key={cat} value={cat}>
                      {config.emoji} {config.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {articles && (
            <div className="ml-auto text-sm text-muted-foreground">
              {filteredArticles.length} artículo{filteredArticles.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grouped Articles */}
        {!isLoading && (
          <div className="space-y-10">
            {Array.from(groupedArticles.entries()).map(([key, groupArticles]) => (
              <section key={key}>
                {/* Group Header */}
                <div className="flex items-center gap-3 mb-4 pb-2 border-b">
                  <Calendar className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">
                    {formatGroupHeader(key)}
                  </h2>
                  <Badge variant="secondary" className="ml-auto">
                    {groupArticles.length} artículo{groupArticles.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                {/* Articles Grid */}
                <div className="grid gap-4">
                  {groupArticles.map(article => {
                    const catConfig = article.category 
                      ? categoryLabels[article.category] 
                      : categoryLabels.destacado;
                    
                    return (
                      <Link
                        key={article.id}
                        to={`/noticias/${article.slug}`}
                        className="group block p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        onClick={() => trackNewsClick(article.slug, article.headline, article.category || 'unknown')}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Meta */}
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <Badge variant="outline" className={`text-[10px] ${catConfig?.color || ''}`}>
                                {catConfig?.emoji} {catConfig?.label}
                              </Badge>
                              {article.published_at && (
                                <span className="text-xs text-muted-foreground">
                                  {format(parseISO(article.published_at), "d MMM yyyy", { locale: es })}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {article.reading_time_minutes} min
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {article.view_count}
                              </span>
                            </div>
                            
                            {/* Headline */}
                            <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors mb-1">
                              {article.headline}
                            </h3>
                            
                            {/* Lead */}
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {article.lead}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}

            {groupedArticles.size === 0 && !isLoading && (
              <div className="text-center py-16">
                <p className="text-muted-foreground">No se encontraron artículos</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
