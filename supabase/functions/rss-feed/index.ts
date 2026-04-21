import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/rss+xml; charset=utf-8',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch latest 50 published articles
    const { data: articles, error } = await supabase
      .from('news_articles')
      .select('slug, headline, lead, meta_description, category, published_at, reading_time_minutes')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching articles:', error);
      throw error;
    }

    const now = new Date().toUTCString();
    const siteUrl = 'https://repindex.ai';

    // Category labels for display
    const categoryLabels: Record<string, string> = {
      subidas: 'Subidas',
      bajadas: 'Bajadas',
      divergencia: 'Divergencia',
      consenso: 'Consenso',
      sector: 'Sectores',
      modelo_ia: 'Modelos IA',
      ibex: 'IBEX-35',
      privadas: 'Privadas',
      destacado: 'Destacado',
    };

    // Build RSS XML
    let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>RepIndex Noticias - Reputación Corporativa IA</title>
    <link>${siteUrl}/noticias</link>
    <description>Análisis semanal de cómo ChatGPT, Perplexity, Gemini y DeepSeek perciben la reputación de las principales empresas españolas. El primer índice de reputación corporativa basado en inteligencia artificial.</description>
    <language>es-ES</language>
    <lastBuildDate>${now}</lastBuildDate>
    <pubDate>${now}</pubDate>
    <ttl>60</ttl>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/favicon.png</url>
      <title>RepIndex</title>
      <link>${siteUrl}</link>
    </image>
    <copyright>© ${new Date().getFullYear()} RepIndex. Todos los derechos reservados.</copyright>
    <managingEditor>info@repindex.ai (RepIndex)</managingEditor>
    <webMaster>info@repindex.ai (RepIndex)</webMaster>
    <category>Business</category>
    <category>Technology</category>
    <category>Artificial Intelligence</category>
`;

    // Add each article as an item
    for (const article of articles || []) {
      const pubDate = article.published_at 
        ? new Date(article.published_at).toUTCString()
        : now;
      
      const categoryLabel = article.category 
        ? categoryLabels[article.category] || article.category
        : 'Noticias';
      
      const description = article.meta_description || article.lead || '';
      
      // Escape XML special characters
      const escapeXml = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      rss += `
    <item>
      <title>${escapeXml(article.headline)}</title>
      <link>${siteUrl}/noticias/${article.slug}</link>
      <guid isPermaLink="true">${siteUrl}/noticias/${article.slug}</guid>
      <description><![CDATA[${description}]]></description>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(categoryLabel)}</category>
      <dc:creator>RepIndex</dc:creator>
    </item>`;
    }

    rss += `
  </channel>
</rss>`;

    console.log(`Generated RSS feed with ${(articles || []).length} articles`);

    return new Response(rss, {
      headers: corsHeaders,
    });

  } catch (error) {
    console.error('Error generating RSS feed:', error);
    
    // Return a minimal valid RSS feed on error
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RepIndex Noticias</title>
    <link>https://repindex.ai/noticias</link>
    <description>Error generando el feed. Por favor, inténtelo más tarde.</description>
  </channel>
</rss>`, {
      headers: corsHeaders,
      status: 500,
    });
  }
});
