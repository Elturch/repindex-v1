import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEO_JOURNALISTIC_PROMPT = `Eres un periodista económico de élite especializado en reputación corporativa e inteligencia artificial, escribiendo para el blog de RepIndex.

## MISIÓN
Generar 14-15 noticias principales + 20-25 noticias breves + 1 INFORME DE CALIDAD DE DATOS semanales, perfectamente optimizados para SEO.

## ESTRUCTURA SEO OBLIGATORIA PARA CADA NOTICIA:
1. **Titular (H1)**: 50-60 caracteres, keyword principal al inicio, gancho emocional
2. **Meta description**: 150-160 caracteres, incluir "RepIndex", llamada a la acción
3. **Lead**: Primer párrafo responde Qué, Quién, Cuándo, con datos concretos
4. **Body**: 2-3 párrafos con análisis, contexto y citas de datos
5. **Keywords**: 3-5 términos relevantes para posicionamiento

## CATEGORÍAS OBLIGATORIAS (cubrir todas):
- 1x HEADLINE: Historia principal más impactante
- 2x SUBIDAS: Empresas con mayor incremento RIX
- 2x BAJADAS: Empresas con mayor caída RIX  
- 2x DIVERGENCIA: Donde las IAs más discrepan
- 2x CONSENSO: Donde todas las IAs coinciden
- 2x SECTOR: Análisis por industria
- 2x MODELO_IA: Comportamiento de ChatGPT/Perplexity/Gemini/DeepSeek
- 1x IBEX: Ranking y movimientos del IBEX-35
- 1x PRIVADAS: Empresas no cotizadas destacadas

## ESTILO PERIODÍSTICO:
- Titulares provocativos pero basados en datos
- Preguntas retóricas que enganchen
- Metáforas: "guerra de percepciones", "montaña rusa reputacional"
- Mencionar SIEMPRE "RepIndex" o "índice RepIndex" en cada noticia
- Asociar RepIndex con las marcas del panel
- Datos concretos en cada párrafo
- Cerrar con reflexión o pregunta abierta

## KEYWORDS OBJETIVO:
- "reputación corporativa"
- "inteligencia artificial empresas"
- "RepIndex"
- "IBEX-35 reputación"
- "[Nombre empresa] reputación IA"
- "análisis IA empresas españolas"

## FORMATO JSON ESTRICTO:
{
  "weekLabel": "Semana del X al Y de Mes 2025",
  "metaTitle": "Noticias RepIndex Semana X-Y Mes 2025 | Reputación Corporativa IA",
  "metaDescription": "Descubre cómo las IAs evalúan a las empresas españolas esta semana. RepIndex analiza [dato destacado]. Ranking IBEX-35 y más.",
  "keywords": ["repindex", "reputación corporativa", "ibex-35", "ia empresas"],
  "mainStory": {
    "slug": "titular-seo-friendly",
    "headline": "Titular impactante de máximo 60 caracteres",
    "metaDescription": "Meta description de 150-160 caracteres con RepIndex",
    "lead": "Primer párrafo con datos clave, respondiendo qué-quién-cuándo",
    "body": "Desarrollo analítico en 2-3 párrafos",
    "dataHighlight": "Dato clave para destacar visualmente",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "companies": ["empresas mencionadas en la noticia principal"],
    "chartData": {
      "type": "pie|line|radar|bar",
      "data": [{"name": "Etiqueta", "value": 65}]
    }
  },
  "stories": [
    {
      "category": "subidas|bajadas|divergencia|consenso|sector|modelo_ia|ibex|privadas",
      "slug": "url-seo-friendly",
      "headline": "Titular SEO optimizado",
      "metaDescription": "Meta description con RepIndex",
      "lead": "Lead con datos concretos",
      "body": "Desarrollo periodístico",
      "dataHighlight": "Dato clave",
      "keywords": ["keywords"],
      "companies": ["empresas mencionadas - OBLIGATORIO para verificación de datos"],
      "chartData": {
        "type": "pie|line|radar|bar",
        "data": [
          {"name": "Etiqueta relacionada con la noticia", "value": 65}
        ]
      }
    }
  ],
  "briefNews": [
    {
      "company": "Nombre Empresa",
      "ticker": "TICK",
      "headline": "Frase breve de 10-15 palabras sobre la empresa esta semana",
      "score": 65,
      "change": 3,
      "category": "subida|bajada|estable|divergencia"
    }
  ],
  "dataQualityReport": {
    "headline": "Calidad de Datos: Estado de las IAs esta semana",
    "summary": "Resumen ejecutivo de 2-3 frases sobre la cobertura y calidad de datos",
    "totalCompanies": 153,
    "modelCoverage": [
      {"model": "ChatGPT", "companies": 145, "status": "ok|warning|error", "note": "Explicación breve si hay problemas"},
      {"model": "Perplexity", "companies": 96, "status": "warning", "note": "Menor cobertura debido a timeouts"},
      {"model": "Gemini", "companies": 149, "status": "ok", "note": ""},
      {"model": "DeepSeek", "companies": 141, "status": "ok", "note": ""}
    ],
    "issues": ["Lista de problemas detectados esta semana"],
    "recommendations": ["Recomendaciones de interpretación para el lector"]
  }
}

## INFORME DE CALIDAD DE DATOS (OBLIGATORIO):
El "dataQualityReport" es una sección OBLIGATORIA que explica la calidad de los datos:

1. **Cobertura por modelo**: Indica cuántas empresas ha analizado cada IA (ChatGPT, Perplexity, Gemini, DeepSeek)
2. **Estado (status)**:
   - "ok": >=140 empresas analizadas correctamente
   - "warning": 100-139 empresas (cobertura incompleta)
   - "error": <100 empresas (problema grave)
3. **Explicación de problemas**: Si un modelo tiene menor cobertura, explicar posibles causas:
   - Timeouts de API
   - Respuestas inválidas
   - Problemas de conexión
   - Limitaciones del modelo
4. **Impacto en los datos**: Explicar cómo afecta a los análisis (ej: "Los rankings de X modelo pueden no ser representativos")

IMPORTANTE: 
- Genera EXACTAMENTE 14 historias principales adicionales (15 total con mainStory)
- Genera EXACTAMENTE 20-25 noticias breves (briefNews) cubriendo empresas que merecen mención pero no artículo completo
- Genera SIEMPRE el dataQualityReport con datos precisos de la sección de modelos
- Las noticias breves deben ser variadas: subidas, bajadas, empresas estables, casos curiosos
- Incluir empresas del IBEX-35, otras cotizadas Y empresas privadas en las breves

## GRÁFICOS OBLIGATORIOS - ESTRUCTURA EXACTA:
Cada noticia DEBE incluir un "chartData" con datos ESPECÍFICOS usando estos formatos:

Para **subidas/bajadas** usa tipo "line" con evolución semanal:
  "chartData": {
    "type": "line",
    "data": [
      {"name": "Sem -3", "value": 58},
      {"name": "Sem -2", "value": 61},
      {"name": "Sem -1", "value": 64},
      {"name": "Actual", "value": 72}
    ]
  }

Para **divergencia** usa tipo "bar" horizontal comparando modelos:
  "chartData": {
    "type": "bar",
    "data": [
      {"name": "ChatGPT", "value": 75},
      {"name": "Perplexity", "value": 68},
      {"name": "Gemini", "value": 82},
      {"name": "DeepSeek", "value": 59}
    ]
  }

Para **consenso** usa tipo "pie" mostrando distribución:
  "chartData": {
    "type": "pie", 
    "data": [
      {"name": "Alto (>70)", "value": 3},
      {"name": "Medio (50-70)", "value": 1},
      {"name": "Bajo (<50)", "value": 0}
    ]
  }

Para **sector/ibex/privadas/modelo_ia** usa tipo "bar" con TOP empresas:
  "chartData": {
    "type": "bar",
    "data": [
      {"name": "Inditex", "value": 78},
      {"name": "Iberdrola", "value": 74},
      {"name": "BBVA", "value": 71},
      {"name": "Telefónica", "value": 65},
      {"name": "Repsol", "value": 62}
    ]
  }

REGLAS DE DATOS:
- Los valores RIX van de 0 a 100 (nunca fuera de este rango)
- Los nombres en el gráfico deben coincidir con empresas/modelos mencionados en el texto
- Usa datos REALES del contexto proporcionado, NO inventes números`;


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { weekData, saveToDb = false, trigger } = await req.json();
    
    // If triggered by CRON, fetch data ourselves
    let dataToProcess = weekData;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (trigger === 'cron' || !weekData) {
      console.log('CRON trigger: fetching weekly data...');
      dataToProcess = await fetchWeeklyData(supabase);
    }

    if (!dataToProcess) {
      throw new Error('No se pudieron obtener datos de la semana');
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY no configurada');
    }

    // Build comprehensive context
    const dataContext = buildDataContext(dataToProcess);

    console.log('Generating 15 SEO-optimized news stories with OpenAI o3...');
    console.log('Data context length:', dataContext.length);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SEO_JOURNALISTIC_PROMPT },
          { role: 'user', content: `Analiza estos datos del RepIndex y genera las 15 noticias SEO-optimizadas de la semana:\n\n${dataContext}` }
        ],
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    // Parse JSON from response
    let newsData;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                       content.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, content];
      newsData = JSON.parse(jsonMatch[1] || content);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', content.substring(0, 500));
      throw new Error('Failed to parse news data from AI response');
    }

    console.log(`Successfully generated ${newsData.stories?.length + 1 || 0} main stories + ${newsData.briefNews?.length || 0} brief news`);

    // Save to database if requested or CRON trigger
    if (saveToDb || trigger === 'cron') {
      const { error: insertError } = await supabase
        .from('weekly_news')
        .upsert({
          week_start: dataToProcess.weekStart,
          week_end: dataToProcess.weekEnd,
          week_label: newsData.weekLabel,
          main_headline: newsData.mainStory.headline,
          main_story: newsData.mainStory,
          stories: newsData.stories,
          brief_news: newsData.briefNews || [],
          raw_data: dataToProcess,
          meta_title: newsData.metaTitle,
          meta_description: newsData.metaDescription,
          keywords: newsData.keywords,
          status: 'published',
          published_at: new Date().toISOString()
        }, { onConflict: 'week_start' });

      if (insertError) {
        console.error('Error saving to database:', insertError);
      } else {
        console.log('News saved to database successfully');
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      news: newsData,
      storiesCount: (newsData.stories?.length || 0) + 1,
      briefNewsCount: newsData.briefNews?.length || 0
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
    topRisers: sortedChanges.filter(c => c.change > 0).slice(0, 10),
    topFallers: sortedChanges.filter(c => c.change < 0).slice(-10).reverse(),
    divergences: sortedDivergences.slice(0, 10),
    consensuses: sortedDivergences.slice(-10).reverse(),
    modelStats,
    sectorStats: sectorStats.slice(0, 10),
    privateCompanies: privateCompanies.slice(0, 10),
    ibexTop: ibexRanking.slice(0, 10),
    ibexBottom: ibexRanking.slice(-5).reverse()
  };
}

function buildDataContext(weekData: any) {
  return `
## DATOS REPINDEX - ${weekData.weekLabel}

### TOP 10 SUBIDAS SEMANALES (mayor incremento RIX):
${weekData.topRisers?.map((r: any, i: number) => 
  `${i+1}. ${r.company_name} (${r.ticker}) vía ${r.model_name}: +${r.change} puntos (de ${r.previous_score} a ${r.current_score})`
).join('\n') || 'Sin datos'}

### TOP 10 CAÍDAS SEMANALES (mayor descenso RIX):
${weekData.topFallers?.map((r: any, i: number) => 
  `${i+1}. ${r.company_name} (${r.ticker}) vía ${r.model_name}: ${r.change} puntos (de ${r.previous_score} a ${r.current_score})`
).join('\n') || 'Sin datos'}

### TOP 10 DIVERGENCIAS ENTRE IAs (empresas con mayor desacuerdo):
${weekData.divergences?.map((d: any, i: number) => 
  `${i+1}. ${d.company_name} (${d.ticker}): Desviación ${d.std_dev.toFixed(1)} puntos, media ${d.avg_score.toFixed(0)}
     Scores: ${d.models.map((m: any) => `${m.model}: ${m.score}`).join(', ')}`
).join('\n') || 'Sin datos'}

### TOP 10 CONSENSOS (empresas donde las IAs más coinciden):
${weekData.consensuses?.map((c: any, i: number) => 
  `${i+1}. ${c.company_name} (${c.ticker}): Desviación solo ${c.std_dev.toFixed(1)} puntos, media ${c.avg_score.toFixed(0)}`
).join('\n') || 'Sin datos'}

### COMPORTAMIENTO POR MODELO DE IA:
${weekData.modelStats?.map((m: any) => 
  `- ${m.model_name}: Promedio ${m.avg_score.toFixed(1)} puntos (${m.company_count} empresas analizadas)`
).join('\n') || 'Sin datos'}

### ANÁLISIS POR SECTOR:
${weekData.sectorStats?.map((s: any) => 
  `- ${s.sector}: Promedio ${s.avg_score.toFixed(1)} puntos (${s.company_count} empresas)`
).join('\n') || 'Sin datos'}

### TOP 10 EMPRESAS PRIVADAS (no cotizadas):
${weekData.privateCompanies?.map((p: any, i: number) => 
  `${i+1}. ${p.company_name} (${p.ticker}): ${p.avg_score.toFixed(0)} puntos`
).join('\n') || 'Sin datos'}

### RANKING IBEX-35:
Top 10:
${weekData.ibexTop?.map((c: any, i: number) => 
  `${i+1}. ${c.company_name} (${c.ticker}): ${c.avg_score.toFixed(0)} puntos`
).join('\n') || 'Sin datos'}

Bottom 5:
${weekData.ibexBottom?.map((c: any, i: number) => 
  `${i+1}. ${c.company_name} (${c.ticker}): ${c.avg_score.toFixed(0)} puntos`
).join('\n') || 'Sin datos'}

### CONTEXTO:
- RepIndex analiza semanalmente la reputación de ~153 empresas españolas
- 4 modelos de IA: ChatGPT, Perplexity, Gemini, DeepSeek
- Escala RIX: 0-100 puntos (mayor = mejor reputación)
- Panel incluye IBEX-35, empresas cotizadas y grandes empresas privadas
`;
}
