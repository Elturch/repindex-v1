import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Clock, Calendar } from "lucide-react";
import { trackNewsClick } from "@/lib/gtmEvents";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface RelatedArticle {
  id: string;
  slug: string;
  headline: string;
  lead: string;
  category: string | null;
  reading_time_minutes: number;
  published_at: string | null;
}

interface RelatedNewsProps {
  currentSlug: string;
  category: string | null;
  companies: string[] | null;
}

const categoryLabels: Record<string, { label: string; emoji: string }> = {
  subidas: { label: "Subidas", emoji: "📈" },
  bajadas: { label: "Bajadas", emoji: "📉" },
  divergencia: { label: "Divergencia", emoji: "🔀" },
  consenso: { label: "Consenso", emoji: "🤝" },
  sector: { label: "Sector", emoji: "🏭" },
  modelo_ia: { label: "Modelo IA", emoji: "🤖" },
  ibex: { label: "IBEX-35", emoji: "🇪🇸" },
  privadas: { label: "Privadas", emoji: "🏢" },
  destacado: { label: "Destacado", emoji: "⭐" },
};

export function RelatedNews({ currentSlug, category, companies }: RelatedNewsProps) {
  const { data: relatedArticles, isLoading } = useQuery({
    queryKey: ["related-news", currentSlug, category, companies],
    queryFn: async (): Promise<RelatedArticle[]> => {
      // Strategy: Get articles by same category OR mentioning same companies
      // Prioritize by category match, then company overlap, then recency
      
      const { data, error } = await supabase
        .from("news_articles")
        .select("id, slug, headline, lead, category, reading_time_minutes, published_at, companies")
        .eq("status", "published")
        .neq("slug", currentSlug)
        .order("published_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      if (!data) return [];

      // Score and sort articles by relevance
      const scored = data.map(article => {
        let score = 0;
        
        // Same category: +10 points
        if (category && article.category === category) {
          score += 10;
        }
        
        // Company overlap: +5 points per matching company
        if (companies && companies.length > 0 && article.companies) {
          const articleCompanies = article.companies as string[];
          const overlap = companies.filter(c => articleCompanies.includes(c)).length;
          score += overlap * 5;
        }
        
        // Main story bonus: +2 points
        if (article.category === 'destacado') {
          score += 2;
        }
        
        return { ...article, score };
      });

      // Sort by score descending, take top 4
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(({ score, companies, ...article }) => article);
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section className="mt-12 pt-8 border-t">
        <h2 className="text-xl font-serif font-semibold mb-6">Noticias Relacionadas</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!relatedArticles || relatedArticles.length === 0) {
    return null;
  }

  return (
    <section className="mt-12 pt-8 border-t" aria-labelledby="related-news-heading">
      <h2 id="related-news-heading" className="text-xl font-serif font-semibold mb-6 flex items-center gap-2">
        <span>Noticias Relacionadas</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </h2>
      
      <div className="grid sm:grid-cols-2 gap-6">
        {relatedArticles.map((article) => {
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
              {/* Category + Date */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px] font-medium">
                  {catConfig?.emoji} {catConfig?.label || article.category}
                </Badge>
                {article.published_at && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(article.published_at), "d MMM yyyy", { locale: es })}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {article.reading_time_minutes} min
                </span>
              </div>
              
              {/* Headline */}
              <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2 mb-1">
                {article.headline}
              </h3>
              
              {/* Lead excerpt */}
              <p className="text-xs text-muted-foreground line-clamp-2">
                {article.lead}
              </p>
            </Link>
          );
        })}
      </div>
      
      {/* SEO: Link to all news */}
      <div className="mt-6 text-center">
        <Link
          to="/noticias"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          Ver todas las noticias
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}
