import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CorporateData {
  ceo_name: string | null;
  president_name: string | null;
  chairman_name: string | null;
  other_executives: Array<{ name: string; position: string }>;
  headquarters_city: string | null;
  headquarters_country: string | null;
  employees_approx: number | null;
  founded_year: number | null;
  mission_statement: string | null;
  vision_statement: string | null;
  company_description: string | null;
  last_reported_revenue: string | null;
  fiscal_year: string | null;
}

interface ExtractionConfidence {
  ceo_name: 'high' | 'medium' | 'low' | null;
  president_name: 'high' | 'medium' | 'low' | null;
  headquarters: 'high' | 'medium' | 'low' | null;
  employees: 'high' | 'medium' | 'low' | null;
  mission: 'high' | 'medium' | 'low' | null;
}

interface NewsArticle {
  url: string;
  headline: string;
  lead_paragraph: string | null;
  body_excerpt: string | null;
  published_date: string | null;
  author: string | null;
  category: string | null;
  source_type: string;
  raw_markdown: string;
}

// Páginas típicas donde encontrar información corporativa
const CORPORATE_PAGE_PATTERNS = [
  '/quienes-somos',
  '/about',
  '/about-us',
  '/sobre-nosotros',
  '/empresa',
  '/company',
  '/corporativo',
  '/corporate',
  '/equipo-directivo',
  '/equipo-ejecutivo',  // Telefónica pattern
  '/comite-ejecutivo',
  '/management',
  '/leadership',
  '/governance',
  '/gobierno-corporativo',
  '/direccion',
  '/junta-directiva',
  '/board',
  '/consejo-administracion',
  '/nosotros',  // Common Spanish pattern
  '/principales-datos',  // Telefónica uses this
];

// Patrones para encontrar blogs/noticias corporativas
const NEWS_PAGE_PATTERNS = [
  '/blog',
  '/news',
  '/noticias',
  '/actualidad',
  '/sala-de-prensa',
  '/press',
  '/press-room',
  '/newsroom',
  '/comunicados',
  '/novedades',
  '/investor-relations',
  '/relacion-inversores',
  '/accionistas',
];

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<{ success: boolean; markdown?: string; error?: string }> {
  try {
    console.log(`[Firecrawl] Scraping: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Firecrawl] Error scraping ${url}:`, data);
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    const markdown = data.data?.markdown || data.markdown || '';
    console.log(`[Firecrawl] Scraped ${url}: ${markdown.length} chars`);
    
    return { success: true, markdown };
  } catch (error) {
    console.error(`[Firecrawl] Exception scraping ${url}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function mapWebsite(url: string, apiKey: string): Promise<string[]> {
  try {
    console.log(`[Firecrawl] Mapping website: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        limit: 200,
        includeSubdomains: false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Firecrawl] Error mapping ${url}:`, data);
      return [];
    }

    const links = data.links || [];
    console.log(`[Firecrawl] Found ${links.length} URLs on ${url}`);
    
    return links;
  } catch (error) {
    console.error(`[Firecrawl] Exception mapping ${url}:`, error);
    return [];
  }
}

function findRelevantPages(allUrls: string[], baseUrl: string): { corporate: string[]; news: string[]; newsRoot: string | null } {
  const corporateUrls: string[] = [];
  const newsUrls: string[] = [];
  let newsRootUrl: string | null = null;
  
  for (const url of allUrls) {
    const urlLower = url.toLowerCase();
    
    // Check for corporate pages
    for (const pattern of CORPORATE_PAGE_PATTERNS) {
      if (urlLower.includes(pattern)) {
        corporateUrls.push(url);
        break;
      }
    }
    
    // Check for news/blog pages
    for (const pattern of NEWS_PAGE_PATTERNS) {
      if (urlLower.includes(pattern)) {
        // Identify root news page (shortest URL with the pattern)
        if (!newsRootUrl || url.length < newsRootUrl.length) {
          newsRootUrl = url;
        }
        // Collect individual news articles (longer URLs with pattern)
        if (url.length > baseUrl.length + 20) {
          newsUrls.push(url);
        }
        break;
      }
    }
  }
  
  // Always include the homepage for corporate
  if (!corporateUrls.includes(baseUrl)) {
    corporateUrls.unshift(baseUrl);
  }
  
  return {
    corporate: corporateUrls.slice(0, 5), // Max 5 corporate pages
    news: newsUrls.slice(0, 10), // Max 10 news articles
    newsRoot: newsRootUrl,
  };
}

async function extractCorporateData(
  markdown: string, 
  companyName: string,
  openaiApiKey: string
): Promise<{ data: CorporateData; confidence: ExtractionConfidence }> {
  const systemPrompt = `Eres un experto en análisis de información corporativa. Tu tarea es extraer datos estructurados de texto de páginas web corporativas.

IMPORTANTE:
- Solo extrae información que esté EXPLÍCITAMENTE mencionada en el texto
- NO inventes ni asumas información
- Si no encuentras un dato, devuelve null
- Para cargos ejecutivos, busca títulos como: CEO, Presidente, Chairman, Consejero Delegado, Director General, etc.
- Los nombres deben incluir nombre y apellidos cuando estén disponibles

Responde SOLO con un JSON válido con esta estructura exacta:
{
  "ceo_name": "string o null",
  "president_name": "string o null", 
  "chairman_name": "string o null",
  "other_executives": [{"name": "string", "position": "string"}],
  "headquarters_city": "string o null",
  "headquarters_country": "string o null",
  "employees_approx": "number o null",
  "founded_year": "number o null",
  "mission_statement": "string o null",
  "vision_statement": "string o null",
  "company_description": "string o null (máx 500 caracteres)",
  "last_reported_revenue": "string o null",
  "fiscal_year": "string o null",
  "confidence": {
    "ceo_name": "high|medium|low|null",
    "president_name": "high|medium|low|null",
    "headquarters": "high|medium|low|null",
    "employees": "high|medium|low|null",
    "mission": "high|medium|low|null"
  }
}`;

  const userPrompt = `Analiza el siguiente texto de la web corporativa de "${companyName}" y extrae la información solicitada:

---
${markdown.substring(0, 15000)}
---

Recuerda: Solo extrae datos que estén EXPLÍCITAMENTE en el texto. Responde SOLO con JSON válido.`;

  try {
    console.log(`[OpenAI] Extracting corporate data for ${companyName}`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[OpenAI] API error:', data);
      throw new Error(data.error?.message || 'OpenAI API error');
    }

    const content = data.choices?.[0]?.message?.content || '{}';
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    const parsed = JSON.parse(jsonStr.trim());
    
    const corporateData: CorporateData = {
      ceo_name: parsed.ceo_name || null,
      president_name: parsed.president_name || null,
      chairman_name: parsed.chairman_name || null,
      other_executives: parsed.other_executives || [],
      headquarters_city: parsed.headquarters_city || null,
      headquarters_country: parsed.headquarters_country || null,
      employees_approx: parsed.employees_approx || null,
      founded_year: parsed.founded_year || null,
      mission_statement: parsed.mission_statement || null,
      vision_statement: parsed.vision_statement || null,
      company_description: parsed.company_description || null,
      last_reported_revenue: parsed.last_reported_revenue || null,
      fiscal_year: parsed.fiscal_year || null,
    };

    const confidence: ExtractionConfidence = parsed.confidence || {
      ceo_name: null,
      president_name: null,
      headquarters: null,
      employees: null,
      mission: null,
    };

    console.log(`[OpenAI] Extracted data for ${companyName}:`, {
      ceo: corporateData.ceo_name,
      president: corporateData.president_name,
      headquarters: `${corporateData.headquarters_city}, ${corporateData.headquarters_country}`,
    });

    return { data: corporateData, confidence };
  } catch (error) {
    console.error('[OpenAI] Exception:', error);
    return {
      data: {
        ceo_name: null,
        president_name: null,
        chairman_name: null,
        other_executives: [],
        headquarters_city: null,
        headquarters_country: null,
        employees_approx: null,
        founded_year: null,
        mission_statement: null,
        vision_statement: null,
        company_description: null,
        last_reported_revenue: null,
        fiscal_year: null,
      },
      confidence: {
        ceo_name: null,
        president_name: null,
        headquarters: null,
        employees: null,
        mission: null,
      },
    };
  }
}

async function extractNewsArticle(
  markdown: string,
  articleUrl: string,
  companyName: string,
  openaiApiKey: string
): Promise<NewsArticle | null> {
  const systemPrompt = `Eres un experto en análisis de contenido de noticias corporativas. Extrae la información estructurada de un artículo de blog o nota de prensa.

Responde SOLO con JSON válido:
{
  "headline": "Titular del artículo (obligatorio)",
  "lead_paragraph": "Entradilla o primer párrafo (resumen inicial)",
  "body_excerpt": "Extracto del cuerpo (~500 caracteres con la información más relevante)",
  "published_date": "YYYY-MM-DD o null si no se encuentra",
  "author": "Nombre del autor o null",
  "category": "Categoría o sección del artículo o null",
  "source_type": "corporate_blog|press_release|investor_news"
}

Si no es un artículo de noticias real (es un listado, página de navegación, etc.), devuelve: {"skip": true}`;

  const userPrompt = `Analiza este contenido del blog/sala de prensa de "${companyName}" y extrae los datos del artículo:

URL: ${articleUrl}

Contenido:
${markdown.substring(0, 8000)}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[OpenAI] News extraction error:', data);
      return null;
    }

    const content = data.choices?.[0]?.message?.content || '{}';
    
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    const parsed = JSON.parse(jsonStr.trim());
    
    if (parsed.skip || !parsed.headline) {
      return null;
    }

    return {
      url: articleUrl,
      headline: parsed.headline,
      lead_paragraph: parsed.lead_paragraph || null,
      body_excerpt: parsed.body_excerpt || null,
      published_date: parsed.published_date || null,
      author: parsed.author || null,
      category: parsed.category || null,
      source_type: parsed.source_type || 'corporate_blog',
      raw_markdown: markdown.substring(0, 20000),
    };
  } catch (error) {
    console.error('[OpenAI] News extraction exception:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, website, issuer_name } = await req.json();

    if (!ticker || !website) {
      return new Response(
        JSON.stringify({ success: false, error: 'ticker and website are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API keys
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[Corporate Scrape] Starting for ${ticker} (${issuer_name}) at ${website}`);

    // Format URL
    let formattedUrl = website.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Step 1: Map the website to find relevant pages
    const allUrls = await mapWebsite(formattedUrl, firecrawlApiKey);
    const { corporate: corporateUrls, news: newsUrls, newsRoot } = findRelevantPages(allUrls, formattedUrl);
    
    console.log(`[Corporate Scrape] Found ${corporateUrls.length} corporate pages, ${newsUrls.length} news articles for ${ticker}`);

    // Step 2: Scrape corporate pages
    const allMarkdown: string[] = [];
    const scrapedUrls: string[] = [];

    for (const url of corporateUrls) {
      const result = await scrapeWithFirecrawl(url, firecrawlApiKey);
      if (result.success && result.markdown) {
        allMarkdown.push(`\n\n--- SOURCE: ${url} ---\n\n${result.markdown}`);
        scrapedUrls.push(url);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (allMarkdown.length === 0) {
      console.error(`[Corporate Scrape] No content scraped for ${ticker}`);
      
      await supabase.from('corporate_snapshots').insert({
        ticker,
        snapshot_date_only: new Date().toISOString().split('T')[0],
        scrape_status: 'failed',
        error_message: 'No content could be scraped from website',
        source_urls: [formattedUrl],
        pages_scraped: 0,
      });

      return new Response(
        JSON.stringify({ success: false, error: 'No content scraped from website' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const combinedMarkdown = allMarkdown.join('\n');
    console.log(`[Corporate Scrape] Combined ${allMarkdown.length} pages, total ${combinedMarkdown.length} chars`);

    // Step 3: Extract structured corporate data using AI
    const { data: extractedData, confidence } = await extractCorporateData(
      combinedMarkdown,
      issuer_name || ticker,
      openaiApiKey
    );

    // Step 4: Scrape and extract news articles (limit to 5 to save costs)
    const newsArticles: NewsArticle[] = [];
    const newsToScrape = newsUrls.slice(0, 5);
    
    for (const newsUrl of newsToScrape) {
      const result = await scrapeWithFirecrawl(newsUrl, firecrawlApiKey);
      if (result.success && result.markdown && result.markdown.length > 200) {
        const article = await extractNewsArticle(
          result.markdown,
          newsUrl,
          issuer_name || ticker,
          openaiApiKey
        );
        if (article) {
          newsArticles.push(article);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[Corporate Scrape] Extracted ${newsArticles.length} news articles for ${ticker}`);

    // Step 5: Save corporate snapshot
    const snapshotData = {
      ticker,
      snapshot_date_only: new Date().toISOString().split('T')[0],
      ceo_name: extractedData.ceo_name,
      president_name: extractedData.president_name,
      chairman_name: extractedData.chairman_name,
      other_executives: extractedData.other_executives,
      headquarters_city: extractedData.headquarters_city,
      headquarters_country: extractedData.headquarters_country,
      employees_approx: extractedData.employees_approx,
      founded_year: extractedData.founded_year,
      mission_statement: extractedData.mission_statement,
      vision_statement: extractedData.vision_statement,
      company_description: extractedData.company_description,
      last_reported_revenue: extractedData.last_reported_revenue,
      fiscal_year: extractedData.fiscal_year,
      raw_markdown: combinedMarkdown.substring(0, 50000),
      source_urls: scrapedUrls,
      pages_scraped: scrapedUrls.length,
      scrape_status: 'success',
      extraction_confidence: confidence,
      blog_url: newsRoot,
      news_articles_count: newsArticles.length,
    };

    const { data: insertedSnapshot, error: insertError } = await supabase
      .from('corporate_snapshots')
      .upsert(snapshotData, { onConflict: 'ticker,snapshot_date_only' })
      .select()
      .single();

    if (insertError) {
      console.error(`[Corporate Scrape] Error saving snapshot for ${ticker}:`, insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 6: Save news articles
    if (newsArticles.length > 0) {
      const newsToInsert = newsArticles.map(article => ({
        ticker,
        snapshot_date: new Date().toISOString().split('T')[0],
        article_url: article.url,
        headline: article.headline,
        lead_paragraph: article.lead_paragraph,
        body_excerpt: article.body_excerpt,
        published_date: article.published_date,
        author: article.author,
        category: article.category,
        source_type: article.source_type,
        raw_markdown: article.raw_markdown,
      }));

      const { error: newsError } = await supabase
        .from('corporate_news')
        .upsert(newsToInsert, { onConflict: 'ticker,article_url' });

      if (newsError) {
        console.error(`[Corporate Scrape] Error saving news for ${ticker}:`, newsError);
      } else {
        console.log(`[Corporate Scrape] Saved ${newsArticles.length} news articles for ${ticker}`);
      }
    }

    console.log(`[Corporate Scrape] Successfully saved snapshot for ${ticker}`);

    return new Response(
      JSON.stringify({
        success: true,
        ticker,
        pages_scraped: scrapedUrls.length,
        news_articles: newsArticles.length,
        data_extracted: {
          ceo_name: extractedData.ceo_name,
          president_name: extractedData.president_name,
          headquarters: `${extractedData.headquarters_city || ''}, ${extractedData.headquarters_country || ''}`.trim(),
          employees: extractedData.employees_approx,
        },
        confidence,
        snapshot_id: insertedSnapshot?.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Corporate Scrape] Exception:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
