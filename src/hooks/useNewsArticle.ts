import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NewsArticleSummary {
  id: string;
  slug: string;
  headline: string;
  lead: string;
  category: string | null;
  is_main_story: boolean;
  published_at: string | null;
  reading_time_minutes: number;
  data_highlight: string | null;
  companies: string[] | null;
  chart_data: {
    type: 'pie' | 'line' | 'radar' | 'bar';
    data: { name: string; value: number }[];
  } | null;
}

export function useLatestNewsArticles(limit: number = 20) {
  return useQuery({
    queryKey: ["latest-news-articles", limit],
    queryFn: async (): Promise<NewsArticleSummary[]> => {
      const { data, error } = await supabase
        .from("news_articles")
        .select("id, slug, headline, lead, category, is_main_story, published_at, reading_time_minutes, data_highlight, companies, chart_data")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as NewsArticleSummary[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useNewsArticlesByWeek(weekStart: string) {
  return useQuery({
    queryKey: ["news-articles-week", weekStart],
    queryFn: async (): Promise<NewsArticleSummary[]> => {
      const { data, error } = await supabase
        .from("news_articles")
        .select("id, slug, headline, lead, category, is_main_story, published_at, reading_time_minutes, data_highlight, companies, chart_data")
        .eq("status", "published")
        .gte("published_at", weekStart)
        .order("is_main_story", { ascending: false })
        .order("published_at", { ascending: false });

      if (error) throw error;
      return (data || []) as NewsArticleSummary[];
    },
    enabled: !!weekStart,
    staleTime: 5 * 60 * 1000,
  });
}
