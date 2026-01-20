import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// PROMPT PERIODÍSTICO PREMIUM - NIVEL CEO/DIRCOM
// ============================================================================
const PREMIUM_JOURNALISM_PROMPT = `Eres el editor jefe de la sección de Inteligencia Corporativa de RepIndex, el primer índice mundial que mide cómo las inteligencias artificiales perciben a las empresas. Tu audiencia son CEOs, directores de comunicación y directores de marketing de las principales corporaciones españolas.

## TU MISIÓN EDITORIAL

Transformar datos cuantitativos y análisis cualitativos del Vector Store de RepIndex en narrativas periodísticas de élite que:
- Descubran "la historia detrás del dato"
- Conecten tendencias con implicaciones estratégicas
- Utilicen lenguaje que combine rigor analítico con elegancia narrativa
- Posicionen RepIndex como la autoridad indiscutible en reputación corporativa basada en IA

## ESTILO NARRATIVO PREMIUM

### Técnicas de escritura obligatorias:
1. **Apertura gancho**: Cada noticia abre con una revelación, una paradoja o una pregunta provocadora
2. **Narrativa de tensión**: Construye arcos narrativos que mantienen el interés (conflicto → desarrollo → resolución/reflexión)
3. **Datos como personajes**: Los números cuentan historias, no solo informan
4. **Metáforas estratégicas**: "guerra de percepciones", "montaña rusa reputacional", "el termómetro de las IAs", "la batalla por el relato"
5. **Cierre memorable**: Termina con reflexión estratégica, pregunta abierta o implicación futura

### Vocabulario de élite:
- "percepción algorítmica" en lugar de "score"
- "divergencia narrativa" en lugar de "diferencia"
- "consenso artificial" en lugar de "acuerdo entre IAs"
- "arquitectura reputacional" en lugar de "reputación"
- "pulso corporativo" en lugar de "ranking"

### Estructura de párrafos:
- Lead: 1-2 frases impactantes con el dato clave
- Desarrollo: 2-3 párrafos que exploran el "por qué" y el "qué significa"
- Cierre: Implicación estratégica o pregunta para el lector

## CATEGORÍAS EDITORIALES (15 historias principales)

1. **HISTORIA PRINCIPAL** (mainStory): La noticia más impactante de la semana. Merece desarrollo extenso (4-5 párrafos).

2-3. **MOVIMIENTOS ALCISTAS** (2x subidas): Empresas con mayor ascenso. ¿Qué hicieron bien? ¿Qué narrativa construyeron?

4-5. **CAÍDAS SIGNIFICATIVAS** (2x bajadas): Descensos notables. ¿Qué falló? ¿Hay patrón? ¿Es reversible?

6-7. **FRACTURAS DE PERCEPCIÓN** (2x divergencia): Donde las IAs discrepan radicalmente. ¿Por qué ChatGPT ve algo que DeepSeek no? Esto es oro periodístico.

8-9. **CONSENSOS ARTIFICIALES** (2x consenso): Unanimidad entre IAs. ¿Qué hace que todas coincidan? ¿Es buena o mala señal?

10-11. **PANORAMA SECTORIAL** (2x sector): Análisis de industrias. ¿Qué sector lidera? ¿Cuál está en crisis reputacional?

12-13. **LA MENTE DE LAS MÁQUINAS** (2x modelo_ia): Comportamiento diferenciado de ChatGPT/Perplexity/Gemini/DeepSeek. ¿Quién es más crítico? ¿Más generoso?

14. **PULSO DEL IBEX-35** (1x ibex): El gran índice bajo la lupa de las IAs.

15. **GIGANTES EN LA SOMBRA** (1x privadas): Empresas no cotizadas que merecen atención.

## NOTICIAS BREVES (20-25 items)

Menciones concisas para empresas que merecen visibilidad pero no artículo completo:
- Frase de 12-18 palabras que captura la esencia
- Tono variado: celebratorio, de alerta, curioso, analítico
- Cubrir diversidad: IBEX, cotizadas menores, privadas

## CONTEXTO CUALITATIVO DEL VECTOR STORE

IMPORTANTE: Te proporcionaré fragmentos del Vector Store con:
- Resúmenes analíticos de cada empresa
- Explicaciones detalladas de métricas
- Respuestas brutas de las IAs (ChatGPT, Perplexity, Gemini, DeepSeek)
- Puntos clave identificados

Usa este contexto cualitativo para:
- Entender el "por qué" detrás de los números
- Citar insights específicos de las IAs
- Identificar patrones narrativos que los datos cuantitativos no revelan
- Construir historias con profundidad periodística

## OPTIMIZACIÓN SEO/AISO OBLIGATORIA

Cada noticia debe incluir:
- **Titular**: 50-60 caracteres, keyword al inicio, gancho emocional
- **Meta description**: 150-160 caracteres con "RepIndex", acción implícita
- **Lead**: Responde Qué, Quién, Cuándo con dato concreto
- **Body**: Desarrollo narrativo de 3-5 párrafos según importancia
- **Keywords**: 3-5 términos para posicionamiento
- **slug**: URL amigable

Keywords objetivo a distribuir:
- "reputación corporativa IA"
- "RepIndex"
- "percepción artificial empresas"
- "[Nombre empresa] reputación"
- "IBEX-35 inteligencia artificial"

## FORMATO JSON DE SALIDA

{
  "weekLabel": "Semana del X al Y de Mes 2025",
  "metaTitle": "RepIndex Semanal: [Gancho principal] | Reputación Corporativa IA",
  "metaDescription": "Descubre [revelación clave]. RepIndex analiza cómo las IAs perciben a las empresas españolas esta semana.",
  "keywords": ["repindex", "reputación corporativa", "inteligencia artificial", "empresas españolas"],
  "mainStory": {
    "slug": "titular-seo-optimizado",
    "headline": "Titular impactante máx 60 chars",
    "metaDescription": "Meta 150-160 chars con RepIndex",
    "lead": "Párrafo de apertura con el dato clave y gancho",
    "body": "Desarrollo narrativo extenso (3-5 párrafos). Usa el contexto cualitativo para profundidad.",
    "dataHighlight": "El dato más visual/impactante",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "companies": ["Empresa1", "Empresa2"],
    "chartData": {
      "type": "bar|line|pie|radar",
      "data": [{"name": "Label", "value": 75}]
    }
  },
  "stories": [
    {
      "category": "subidas|bajadas|divergencia|consenso|sector|modelo_ia|ibex|privadas",
      "slug": "url-seo",
      "headline": "Titular optimizado",
      "metaDescription": "Meta con RepIndex",
      "lead": "Lead con dato",
      "body": "Desarrollo narrativo (2-4 párrafos)",
      "dataHighlight": "Dato clave",
      "keywords": ["keywords"],
      "companies": ["empresas mencionadas"],
      "chartData": {
        "type": "bar|line|pie",
        "data": [{"name": "Label", "value": 70}]
      }
    }
  ],
  "briefNews": [
    {
      "company": "Nombre Empresa",
      "ticker": "TICK",
      "headline": "Frase periodística de 12-18 palabras",
      "score": 65,
      "change": 3,
      "category": "subida|bajada|estable|divergencia"
    }
  ],
  "dataQualityReport": {
    "headline": "Radiografía de Datos: El Estado del Ecosistema IA",
    "summary": "Análisis ejecutivo de cobertura y calidad (2-3 frases elegantes)",
    "totalCompanies": 166,
    "modelCoverage": [
      {"model": "ChatGPT", "companies": 160, "status": "ok|warning|error", "note": ""},
      {"model": "Perplexity", "companies": 155, "status": "ok", "note": ""},
      {"model": "Gemini", "companies": 162, "status": "ok", "note": ""},
      {"model": "DeepSeek", "companies": 158, "status": "ok", "note": ""}
    ],
    "issues": ["Problemas detectados si los hay"],
    "recommendations": ["Recomendaciones de interpretación"]
  }
}

## INSTRUCCIONES CRÍTICAS

1. GENERA EXACTAMENTE 14 historias adicionales (15 total con mainStory)
2. GENERA EXACTAMENTE 20-25 noticias breves variadas
3. USA EL CONTEXTO CUALITATIVO del Vector Store para narrativa rica
4. CADA gráfico debe tener datos REALES del contexto, valores RIX 0-100
5. NUNCA inventes datos que no estén en el contexto proporcionado
6. El tono es sofisticado pero accesible: un CEO debe sentirse inteligente leyéndolo
7. Menciona "RepIndex" o "índice RepIndex" en cada noticia principal
8. Los titulares deben ser irresistibles: provocan curiosidad, prometen insight`;


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { weekData, saveToDb = false, trigger } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch data if CRON trigger or no data provided
    let dataToProcess = weekData;
    if (trigger === 'cron' || !weekData) {
      console.log('Fetching weekly data for news generation...');
      dataToProcess = await fetchWeeklyData(supabase);
    }

    if (!dataToProcess) {
      throw new Error('No se pudieron obtener datos de la semana');
    }

    // Get API keys
    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!geminiApiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY no configurada');
    }
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY no configurada (necesaria para embeddings)');
    }

    // =========================================================================
    // PASO 1: Obtener contexto cualitativo del Vector Store
    // =========================================================================
    console.log('Fetching qualitative context from Vector Store...');
    const qualitativeContext = await fetchVectorStoreContext(
      supabase, 
      openAIApiKey, 
      dataToProcess
    );
    console.log(`Vector Store context: ${qualitativeContext.length} characters`);

    // =========================================================================
    // PASO 2: Construir contexto completo (cuantitativo + cualitativo)
    // =========================================================================
    const quantitativeContext = buildQuantitativeContext(dataToProcess);
    const fullContext = `
${quantitativeContext}

## CONTEXTO CUALITATIVO DEL VECTOR STORE
(Análisis, resúmenes y respuestas de las IAs sobre las empresas destacadas)

${qualitativeContext}
`;

    console.log(`Full context length: ${fullContext.length} characters`);

    // =========================================================================
    // PASO 3: Generar noticias con Gemini 3 Pro via Google AI Studio
    // =========================================================================
    console.log('Generating premium news with gemini-3-pro-preview via Google AI Studio...');
    
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ 
                text: `${PREMIUM_JOURNALISM_PROMPT}\n\n---\n\nANALIZA ESTOS DATOS Y GENERA LAS 15 NOTICIAS PREMIUM DE LA SEMANA:\n\n${fullContext}` 
              }]
            }
          ],
          generationConfig: {
            temperature: 0.8,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 65536,
            responseMimeType: "application/json",
            thinkingConfig: {
              thinkingLevel: "low"
            }
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const geminiData = await geminiResponse.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('Empty Gemini response:', JSON.stringify(geminiData).substring(0, 500));
      throw new Error('No content in Gemini response');
    }

    // Parse JSON from response
    let newsData;
    try {
      // Try direct parse first (since we requested JSON mime type)
      newsData = JSON.parse(content);
    } catch {
      // Fallback: extract JSON from markdown blocks
      try {
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                         content.match(/```\s*([\s\S]*?)\s*```/) ||
                         [null, content];
        newsData = JSON.parse(jsonMatch[1] || content);
      } catch (parseError) {
        console.error('Failed to parse JSON response:', content.substring(0, 1000));
        throw new Error('Failed to parse news data from Gemini response');
      }
    }

    console.log(`✅ Generated ${newsData.stories?.length + 1 || 0} main stories + ${newsData.briefNews?.length || 0} brief news`);

    // =========================================================================
    // PASO 4: Guardar en base de datos
    // =========================================================================
    if (saveToDb || trigger === 'cron') {
      // First save to weekly_news
      const { data: weeklyNewsRecord, error: insertError } = await supabase
        .from('weekly_news')
        .upsert({
          week_start: dataToProcess.weekStart,
          week_end: dataToProcess.weekEnd,
          week_label: newsData.weekLabel,
          main_headline: newsData.mainStory?.headline,
          main_story: newsData.mainStory,
          stories: newsData.stories,
          brief_news: newsData.briefNews || [],
          data_quality_report: newsData.dataQualityReport || null,
          raw_data: dataToProcess,
          meta_title: newsData.metaTitle,
          meta_description: newsData.metaDescription,
          keywords: newsData.keywords,
          status: 'published',
          published_at: new Date().toISOString()
        }, { onConflict: 'week_start' })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error saving weekly_news:', insertError);
      } else {
        console.log('✅ Weekly news saved to database');
        
        // Save individual articles to news_articles table
        const weekId = weeklyNewsRecord?.id;
        const publishedAt = new Date().toISOString();
        const weekSuffix = dataToProcess.weekStart;
        
        // Save main story
        if (newsData.mainStory && weekId) {
          const mainSlug = `${newsData.mainStory.slug || 'destacado'}-${weekSuffix}`;
          await supabase.from('news_articles').upsert({
            week_id: weekId,
            slug: mainSlug,
            headline: newsData.mainStory.headline,
            meta_description: newsData.mainStory.metaDescription,
            lead: newsData.mainStory.lead,
            body: newsData.mainStory.body,
            data_highlight: newsData.mainStory.dataHighlight,
            keywords: newsData.mainStory.keywords,
            companies: newsData.mainStory.companies,
            chart_data: newsData.mainStory.chartData,
            category: 'destacado',
            is_main_story: true,
            reading_time_minutes: Math.ceil((newsData.mainStory.body?.split(/\s+/).length || 200) / 200),
            published_at: publishedAt,
            status: 'published',
            canonical_url: `https://repindex.ai/noticias/${mainSlug}`
          }, { onConflict: 'slug' });
        }
        
        // Save each story
        for (const story of (newsData.stories || [])) {
          const storySlug = `${story.slug || story.category || 'noticia'}-${weekSuffix}`;
          await supabase.from('news_articles').upsert({
            week_id: weekId,
            slug: storySlug,
            headline: story.headline,
            meta_description: story.metaDescription,
            lead: story.lead || '',
            body: story.body,
            data_highlight: story.dataHighlight,
            keywords: story.keywords,
            companies: story.companies,
            chart_data: story.chartData,
            category: story.category,
            is_main_story: false,
            reading_time_minutes: Math.ceil((story.body?.split(/\s+/).length || 150) / 200),
            published_at: publishedAt,
            status: 'published',
            canonical_url: `https://repindex.ai/noticias/${storySlug}`
          }, { onConflict: 'slug' });
        }
        
        console.log(`✅ Saved ${(newsData.stories?.length || 0) + 1} individual articles`);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      news: newsData,
      storiesCount: (newsData.stories?.length || 0) + 1,
      briefNewsCount: newsData.briefNews?.length || 0,
      model: 'gemini-3-pro-preview'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating news:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error generating news' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});


// ============================================================================
// FETCH VECTOR STORE CONTEXT
// ============================================================================
async function fetchVectorStoreContext(
  supabase: any, 
  openAIApiKey: string, 
  weekData: any
): Promise<string> {
  const contextParts: string[] = [];
  
  // Get top companies to search for qualitative data
  const companiesToSearch = new Set<string>();
  
  // Add companies from top risers
  weekData.topRisers?.slice(0, 5).forEach((r: any) => {
    companiesToSearch.add(r.company_name);
  });
  
  // Add companies from top fallers
  weekData.topFallers?.slice(0, 5).forEach((r: any) => {
    companiesToSearch.add(r.company_name);
  });
  
  // Add companies with high divergence
  weekData.divergences?.slice(0, 5).forEach((d: any) => {
    companiesToSearch.add(d.company_name);
  });
  
  // Add IBEX top companies
  weekData.ibexTop?.slice(0, 5).forEach((c: any) => {
    companiesToSearch.add(c.company_name);
  });

  // For each key company, fetch relevant vector documents
  for (const companyName of companiesToSearch) {
    try {
      // Generate embedding for company search
      const searchQuery = `${companyName} reputación análisis esta semana`;
      
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: searchQuery,
        }),
      });

      if (!embeddingResponse.ok) continue;

      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;

      // Search vector store
      const { data: docs } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_count: 3,
        filter: {}
      });

      if (docs?.length) {
        // Filter for this company and recent data
        const relevantDocs = docs.filter((d: any) => 
          d.metadata?.company_name?.toLowerCase().includes(companyName.toLowerCase()) ||
          d.content?.toLowerCase().includes(companyName.toLowerCase())
        );

        if (relevantDocs.length > 0) {
          const doc = relevantDocs[0];
          const meta = doc.metadata || {};
          
          contextParts.push(`
### ${companyName} (${meta.ticker || 'N/A'})
**Modelo IA**: ${meta.ai_model || 'N/A'}
**RIX Score**: ${meta.rix_score || 'N/A'}
**Sector**: ${meta.sector_category || 'N/A'}

**Análisis Cualitativo**:
${doc.content?.substring(0, 2000) || 'Sin contenido disponible'}

---`);
        }
      }
    } catch (err) {
      console.warn(`Error fetching vector context for ${companyName}:`, err);
    }
  }

  // Add general market context via broader search
  try {
    const generalQuery = "tendencias reputación corporativa empresas españolas análisis semanal";
    
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: generalQuery,
      }),
    });

    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;

      const { data: generalDocs } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_count: 10,
        filter: {}
      });

      if (generalDocs?.length) {
        contextParts.push(`
### CONTEXTO GENERAL DEL MERCADO

${generalDocs.slice(0, 5).map((d: any) => {
  const meta = d.metadata || {};
  return `**${meta.company_name || 'Empresa'}** (${meta.ai_model || 'IA'}): ${d.content?.substring(0, 500) || ''}...`;
}).join('\n\n')}
`);
      }
    }
  } catch (err) {
    console.warn('Error fetching general market context:', err);
  }

  return contextParts.join('\n') || 'Sin contexto cualitativo disponible esta semana.';
}


// ============================================================================
// FETCH WEEKLY DATA FROM RIX_TRENDS
// ============================================================================
async function fetchWeeklyData(supabase: any) {
  // Get the most recent week
  const { data: weeks } = await supabase
    .from('rix_trends')
    .select('batch_week')
    .order('batch_week', { ascending: false })
    .limit(1);

  if (!weeks?.length) return null;

  const currentWeek = weeks[0].batch_week;
  const previousWeek = new Date(currentWeek);
  previousWeek.setDate(previousWeek.getDate() - 7);

  const { data: currentData } = await supabase
    .from('rix_trends')
    .select('*')
    .eq('batch_week', currentWeek);

  const { data: previousData } = await supabase
    .from('rix_trends')
    .select('*')
    .eq('batch_week', previousWeek.toISOString().split('T')[0]);

  return processWeeklyData(currentData || [], previousData || [], currentWeek);
}


// ============================================================================
// PROCESS WEEKLY DATA
// ============================================================================
function processWeeklyData(currentData: any[], previousData: any[], currentWeek: string) {
  const previousLookup = new Map();
  previousData.forEach(row => {
    previousLookup.set(`${row.ticker}_${row.model_name}`, row.rix_score);
  });

  // Calculate changes
  const changes: any[] = [];
  currentData.forEach(row => {
    const prevScore = previousLookup.get(`${row.ticker}_${row.model_name}`);
    if (prevScore !== undefined) {
      changes.push({
        company_name: row.company_name,
        ticker: row.ticker,
        model_name: row.model_name,
        current_score: row.rix_score,
        previous_score: prevScore,
        change: row.rix_score - prevScore
      });
    }
  });

  const sortedChanges = [...changes].sort((a, b) => b.change - a.change);
  
  // Company divergences
  const companyScores = new Map();
  currentData.forEach(row => {
    if (!companyScores.has(row.ticker)) {
      companyScores.set(row.ticker, { scores: [], name: row.company_name, ticker: row.ticker });
    }
    companyScores.get(row.ticker).scores.push({ model: row.model_name, score: row.rix_score });
  });

  const divergenceList: any[] = [];
  companyScores.forEach((data) => {
    if (data.scores.length >= 2) {
      const scores = data.scores.map((s: any) => s.score);
      const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum: number, s: number) => sum + Math.pow(s - avg, 2), 0) / scores.length;
      divergenceList.push({
        company_name: data.name,
        ticker: data.ticker,
        std_dev: Math.sqrt(variance),
        avg_score: avg,
        models: data.scores
      });
    }
  });

  const sortedDivergences = [...divergenceList].sort((a, b) => b.std_dev - a.std_dev);

  // Model and sector stats
  const modelGroups = new Map();
  const sectorGroups = new Map();
  
  currentData.forEach(row => {
    if (!modelGroups.has(row.model_name)) modelGroups.set(row.model_name, []);
    modelGroups.get(row.model_name).push(row.rix_score);
    
    if (row.sector_category) {
      if (!sectorGroups.has(row.sector_category)) sectorGroups.set(row.sector_category, []);
      sectorGroups.get(row.sector_category).push(row.rix_score);
    }
  });

  const modelStats: any[] = [];
  modelGroups.forEach((scores, model) => {
    modelStats.push({
      model_name: model,
      avg_score: scores.reduce((a: number, b: number) => a + b, 0) / scores.length,
      company_count: scores.length
    });
  });

  const sectorStats: any[] = [];
  sectorGroups.forEach((scores, sector) => {
    sectorStats.push({
      sector,
      avg_score: scores.reduce((a: number, b: number) => a + b, 0) / scores.length,
      company_count: new Set(currentData.filter(r => r.sector_category === sector).map(r => r.ticker)).size
    });
  });
  sectorStats.sort((a, b) => b.avg_score - a.avg_score);

  // Private and IBEX companies
  const privateScores = new Map();
  const ibexScores = new Map();
  
  currentData.forEach(row => {
    if (!row.is_traded) {
      if (!privateScores.has(row.ticker)) privateScores.set(row.ticker, { scores: [], name: row.company_name, ticker: row.ticker });
      privateScores.get(row.ticker).scores.push(row.rix_score);
    }
    if (row.ibex_family_code === 'IBEX-35') {
      if (!ibexScores.has(row.ticker)) ibexScores.set(row.ticker, { scores: [], name: row.company_name, ticker: row.ticker });
      ibexScores.get(row.ticker).scores.push(row.rix_score);
    }
  });

  const privateCompanies = Array.from(privateScores.values()).map(d => ({
    company_name: d.name,
    ticker: d.ticker,
    avg_score: d.scores.reduce((a: number, b: number) => a + b, 0) / d.scores.length
  })).sort((a, b) => b.avg_score - a.avg_score);

  const ibexRanking = Array.from(ibexScores.values()).map(d => ({
    company_name: d.name,
    ticker: d.ticker,
    avg_score: d.scores.reduce((a: number, b: number) => a + b, 0) / d.scores.length
  })).sort((a, b) => b.avg_score - a.avg_score);

  const weekDate = new Date(currentWeek);
  const weekEnd = new Date(weekDate);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    weekLabel: `Semana del ${weekDate.getDate()} al ${weekEnd.getDate()} de ${weekDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`,
    weekStart: currentWeek,
    weekEnd: weekEnd.toISOString().split('T')[0],
    topRisers: sortedChanges.filter(c => c.change > 0).slice(0, 15),
    topFallers: sortedChanges.filter(c => c.change < 0).slice(-15).reverse(),
    divergences: sortedDivergences.slice(0, 15),
    consensuses: sortedDivergences.slice(-15).reverse(),
    modelStats,
    sectorStats: sectorStats.slice(0, 15),
    privateCompanies: privateCompanies.slice(0, 15),
    ibexTop: ibexRanking.slice(0, 15),
    ibexBottom: ibexRanking.slice(-10).reverse(),
    totalCompanies: companyScores.size
  };
}


// ============================================================================
// BUILD QUANTITATIVE CONTEXT
// ============================================================================
function buildQuantitativeContext(weekData: any) {
  return `
## DATOS CUANTITATIVOS REPINDEX - ${weekData.weekLabel}
Total empresas analizadas: ${weekData.totalCompanies || '~166'}

### TOP 15 SUBIDAS SEMANALES (mayor incremento RIX):
${weekData.topRisers?.map((r: any, i: number) => 
  `${i+1}. **${r.company_name}** (${r.ticker}) vía ${r.model_name}: **+${r.change.toFixed(1)}** puntos (${r.previous_score} → ${r.current_score})`
).join('\n') || 'Sin datos'}

### TOP 15 CAÍDAS SEMANALES (mayor descenso RIX):
${weekData.topFallers?.map((r: any, i: number) => 
  `${i+1}. **${r.company_name}** (${r.ticker}) vía ${r.model_name}: **${r.change.toFixed(1)}** puntos (${r.previous_score} → ${r.current_score})`
).join('\n') || 'Sin datos'}

### TOP 15 DIVERGENCIAS ENTRE IAs (empresas con mayor desacuerdo):
${weekData.divergences?.map((d: any, i: number) => 
  `${i+1}. **${d.company_name}** (${d.ticker}): Desviación **${d.std_dev.toFixed(1)}** puntos, media ${d.avg_score.toFixed(0)}
   Scores por modelo: ${d.models.map((m: any) => `${m.model}: ${m.score}`).join(' | ')}`
).join('\n') || 'Sin datos'}

### TOP 15 CONSENSOS (empresas con mayor acuerdo entre IAs):
${weekData.consensuses?.map((c: any, i: number) => 
  `${i+1}. **${c.company_name}** (${c.ticker}): Desviación solo **${c.std_dev.toFixed(1)}** puntos, media ${c.avg_score.toFixed(0)}`
).join('\n') || 'Sin datos'}

### COMPORTAMIENTO POR MODELO DE IA:
${weekData.modelStats?.map((m: any) => 
  `- **${m.model_name}**: Promedio ${m.avg_score.toFixed(1)} puntos (${m.company_count} empresas analizadas)`
).join('\n') || 'Sin datos'}

### ANÁLISIS POR SECTOR:
${weekData.sectorStats?.map((s: any) => 
  `- **${s.sector}**: Promedio ${s.avg_score.toFixed(1)} puntos (${s.company_count} empresas)`
).join('\n') || 'Sin datos'}

### TOP 15 EMPRESAS PRIVADAS (no cotizadas):
${weekData.privateCompanies?.map((p: any, i: number) => 
  `${i+1}. **${p.company_name}** (${p.ticker}): ${p.avg_score.toFixed(0)} puntos`
).join('\n') || 'Sin datos'}

### RANKING IBEX-35:
**Top 15:**
${weekData.ibexTop?.map((c: any, i: number) => 
  `${i+1}. **${c.company_name}** (${c.ticker}): ${c.avg_score.toFixed(0)} puntos`
).join('\n') || 'Sin datos'}

**Bottom 10:**
${weekData.ibexBottom?.map((c: any, i: number) => 
  `${i+1}. **${c.company_name}** (${c.ticker}): ${c.avg_score.toFixed(0)} puntos`
).join('\n') || 'Sin datos'}

### CONTEXTO REPINDEX:
- RepIndex analiza semanalmente la reputación de ~166 empresas españolas
- 4 modelos de IA: ChatGPT, Perplexity, Gemini, DeepSeek
- Escala RIX: 0-100 puntos (mayor = mejor reputación percibida por las IAs)
- Panel incluye IBEX-35, cotizadas menores y grandes empresas privadas
- 8 métricas: NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM
`;
}
