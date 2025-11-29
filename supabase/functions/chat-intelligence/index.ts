import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache for company data
let companiesCache: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logPrefix = `[${crypto.randomUUID().slice(0, 8)}]`;

  try {
    const { question, conversationHistory = [], sessionId } = await req.json();
    console.log(`${logPrefix} User question:`, question);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Load or refresh company cache
    const now = Date.now();
    if (!companiesCache || (now - cacheTimestamp) > CACHE_TTL) {
      console.log(`${logPrefix} Loading companies from database...`);
      const { data: companies } = await supabaseClient
        .from('repindex_root_issuers')
        .select('issuer_name, ticker, sector_category, ibex_family_code');
      
      if (companies) {
        companiesCache = companies;
        cacheTimestamp = now;
        console.log(`${logPrefix} Loaded ${companies.length} companies from database and cached`);
      }
    }

    // =============================================================================
    // PASO 1: GENERAR EMBEDDING DE LA PREGUNTA (para vector search)
    // =============================================================================
    console.log(`${logPrefix} Generating embedding for question...`);
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: question,
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error(`Embedding API error: ${embeddingResponse.statusText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;

    // =============================================================================
    // PASO 2: BÚSQUEDA VECTORIAL (para enriquecimiento cualitativo)
    // =============================================================================
    // Vector search sin filtros de metadata - solo para contexto cualitativo
    console.log(`${logPrefix} Performing vector search for qualitative enrichment...`);
    const { data: vectorDocs } = await supabaseClient.rpc('match_documents', {
      query_embedding: embedding,
      match_count: 5,
      filter: {}
    });

    console.log(`${logPrefix} Vector documents found: ${vectorDocs?.length || 0}`);

    // =============================================================================
    // PASO 3: CARGAR DATOS ESTRUCTURADOS COMPLETOS (últimas 2 semanas)
    // =============================================================================
    console.log(`${logPrefix} Loading complete RIX data (last 2 weeks)...`);
    
    const { data: allRixData, error: rixError } = await supabaseClient
      .from('rix_runs')
      .select(`
        "01_run_id",
        "02_model_name",
        "03_target_name",
        "05_ticker",
        "06_period_from",
        "07_period_to",
        "09_rix_score",
        "51_rix_score_adjusted",
        "32_rmm_score",
        "10_resumen",
        "11_puntos_clave",
        batch_execution_date
      `)
      .order('batch_execution_date', { ascending: false })
      .limit(1200);

    if (rixError) {
      console.error(`${logPrefix} Error loading RIX data:`, rixError);
      throw rixError;
    }

    console.log(`${logPrefix} Total RIX records loaded: ${allRixData?.length || 0}`);

    // =============================================================================
    // PASO 4: CONSTRUIR CONTEXTO ESTRUCTURADO COMPLETO
    // =============================================================================
    let context = '';

    // 4.1 Añadir documentos vectoriales (enriquecimiento cualitativo)
    if (vectorDocs && vectorDocs.length > 0) {
      context += `📚 DOCUMENTOS RELACIONADOS (contexto cualitativo):\n\n`;
      vectorDocs.forEach((doc: any, idx: number) => {
        const metadata = doc.metadata || {};
        context += `[${idx + 1}] ${metadata.company_name || 'Sin empresa'} - ${metadata.week || 'Sin fecha'}\n`;
        context += `${doc.content?.substring(0, 500) || 'Sin contenido'}...\n\n`;
      });
      context += '\n';
    }

    // 4.2 Construir ranking completo de la semana actual
    if (allRixData && allRixData.length > 0) {
      // Crear clave de período para agrupar (period_from + period_to son consistentes)
      const getPeriodKey = (run: any) => `${run["06_period_from"]}|${run["07_period_to"]}`;

      // Identificar todos los períodos únicos y ordenarlos por fecha descendente
      const uniquePeriods = [...new Set(allRixData.map(getPeriodKey))]
        .sort((a, b) => {
          const dateA = a.split('|')[1]; // period_to
          const dateB = b.split('|')[1];
          return dateB.localeCompare(dateA); // Más reciente primero
        });

      // Semana actual (período más reciente)
      const currentPeriod = uniquePeriods[0];
      const currentWeekData = allRixData.filter(run => getPeriodKey(run) === currentPeriod);

      // Semana anterior (segundo período más reciente)
      const previousPeriod = uniquePeriods[1];
      const previousWeekData = previousPeriod 
        ? allRixData.filter(run => getPeriodKey(run) === previousPeriod) 
        : [];

      // Parsear fechas para logs y contexto
      const [currentFrom, currentTo] = currentPeriod ? currentPeriod.split('|') : [null, null];
      const [prevFrom, prevTo] = previousPeriod ? previousPeriod.split('|') : [null, null];

      console.log(`${logPrefix} Current period: ${currentFrom} to ${currentTo} (${currentWeekData.length} records)`);
      console.log(`${logPrefix} Previous period: ${prevFrom || 'N/A'} to ${prevTo || 'N/A'} (${previousWeekData.length} records)`);

      // RANKING DETERMINISTA: Lista de registros individuales (empresa × modelo)
      // Ordenados por RIX descendente (igual que el dashboard)
      const rankedRecords = currentWeekData
        .filter(run => run["32_rmm_score"] !== 0) // Excluir registros inválidos
        .map(run => ({
          company: run["03_target_name"],
          ticker: run["05_ticker"],
          model: run["02_model_name"],
          rixScore: run["51_rix_score_adjusted"] ?? run["09_rix_score"],
          periodFrom: run["06_period_from"],
          periodTo: run["07_period_to"]
        }))
        .filter(r => r.company && r.rixScore != null)
        .sort((a, b) => (b.rixScore || 0) - (a.rixScore || 0));

      // PROMEDIOS POR EMPRESA (solo para consultas que lo requieran explícitamente)
      const companyAverages = new Map<string, { scores: number[], ticker: string }>();
      
      currentWeekData.forEach(run => {
        const companyName = run["03_target_name"];
        const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
        
        if (!companyName || score == null) return;
        
        if (!companyAverages.has(companyName)) {
          companyAverages.set(companyName, {
            scores: [],
            ticker: run["05_ticker"] || ''
          });
        }
        
        companyAverages.get(companyName)!.scores.push(score);
      });

      const rankedByAverage = Array.from(companyAverages.entries())
        .map(([company, data]) => ({
          company,
          ticker: data.ticker,
          avgRix: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
          modelCount: data.scores.length
        }))
        .sort((a, b) => b.avgRix - a.avgRix);

      // Calcular tendencias (comparar promedios con semana anterior)
      const trends = new Map<string, number>();
      if (previousWeekData.length > 0) {
        const prevScores = new Map<string, number[]>();
        previousWeekData.forEach(run => {
          const companyName = run["03_target_name"];
          const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
          if (!companyName || score == null) return;
          
          if (!prevScores.has(companyName)) prevScores.set(companyName, []);
          prevScores.get(companyName)!.push(score);
        });

        rankedByAverage.forEach(curr => {
          const prevData = prevScores.get(curr.company);
          if (prevData && prevData.length > 0) {
            const prevAvg = prevData.reduce((a, b) => a + b, 0) / prevData.length;
            trends.set(curr.company, curr.avgRix - prevAvg);
          }
        });
      }

      // GENERAR CONTEXTO: Ranking individual (como en el dashboard)
      const periodFrom = rankedRecords[0]?.periodFrom;
      const periodTo = rankedRecords[0]?.periodTo;
      
      context += `\n📊 RANKING INDIVIDUAL SEMANA ACTUAL (${periodFrom} a ${periodTo}):\n`;
      context += `Este es el ranking tal como aparece en el dashboard principal.\n`;
      context += `Cada fila es una evaluación individual: Empresa + Modelo IA + RIX Score.\n\n`;
      context += `| # | Empresa | Ticker | RIX | Modelo IA |\n`;
      context += `|---|---------|--------|-----|----------|\n`;
      
      rankedRecords.slice(0, 50).forEach((record, idx) => {
        context += `| ${idx + 1} | ${record.company} | ${record.ticker} | ${record.rixScore} | ${record.model} |\n`;
      });

      context += `\n`;

      // GENERAR CONTEXTO: Promedios por empresa (datos secundarios)
      context += `\n📊 PROMEDIOS POR EMPRESA (solo usar si el usuario pregunta explícitamente):\n`;
      context += `Esta tabla muestra el promedio de los 4 modelos de IA para cada empresa.\n\n`;
      context += `| # | Empresa | Ticker | RIX Promedio | Tendencia vs Semana Anterior |\n`;
      context += `|---|---------|--------|--------------|------------------------------|\n`;
      
      rankedByAverage.slice(0, 20).forEach((company, idx) => {
        const trend = trends.get(company.company);
        const trendStr = trend !== undefined 
          ? (trend > 0 ? `↗ +${trend.toFixed(1)}` : trend < 0 ? `↘ ${trend.toFixed(1)}` : '→ 0.0')
          : 'N/A';
        
        context += `| ${idx + 1} | ${company.company} | ${company.ticker} | ${company.avgRix} | ${trendStr} |\n`;
      });

      context += `\n`;

      // GENERAR CONTEXTO: Análisis por modelo de IA
      const modelBreakdown = new Map<string, { count: number, avgScore: number, companies: Set<string> }>();
      
      currentWeekData.forEach(run => {
        const model = run["02_model_name"];
        const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
        const company = run["03_target_name"];
        
        if (!model || score == null) return;
        
        if (!modelBreakdown.has(model)) {
          modelBreakdown.set(model, { count: 0, avgScore: 0, companies: new Set() });
        }
        
        const entry = modelBreakdown.get(model)!;
        entry.count++;
        entry.avgScore += score;
        entry.companies.add(company);
      });

      context += `\n🤖 ANÁLISIS POR MODELO DE IA:\n\n`;
      Array.from(modelBreakdown.entries())
        .sort((a, b) => b[1].avgScore / b[1].count - a[1].avgScore / a[1].count)
        .forEach(([model, data]) => {
          const avg = Math.round((data.avgScore / data.count) * 10) / 10;
          context += `**${model}**: ${data.count} evaluaciones, ${data.companies.size} empresas, promedio ${avg}\n`;
        });

      context += `\n`;

      // GENERAR CONTEXTO: Top movers (basado en promedios)
      if (trends.size > 0) {
        const sortedByTrend = Array.from(trends.entries())
          .map(([company, trend]) => {
            const companyData = rankedByAverage.find(c => c.company === company);
            return { company, trend, ticker: companyData?.ticker || '', rix: companyData?.avgRix || 0 };
          })
          .sort((a, b) => b.trend - a.trend);

        const topGainers = sortedByTrend.slice(0, 5);
        const topLosers = sortedByTrend.slice(-5).reverse();

        context += `\n📈 TOP 5 GANADORES (mayor mejora promedio vs semana anterior):\n`;
        topGainers.forEach((item, idx) => {
          context += `${idx + 1}. ${item.company} (${item.ticker}): RIX promedio ${item.rix}, cambio +${item.trend.toFixed(1)}\n`;
        });

        context += `\n📉 TOP 5 PERDEDORES (mayor caída promedio vs semana anterior):\n`;
        topLosers.forEach((item, idx) => {
          context += `${idx + 1}. ${item.company} (${item.ticker}): RIX promedio ${item.rix}, cambio ${item.trend.toFixed(1)}\n`;
        });

        context += `\n`;
      }

      // GENERAR CONTEXTO: Datos detallados de semana anterior (para comparaciones)
      if (previousWeekData.length > 0) {
        // Usar las variables ya parseadas
        context += `\n📅 DATOS SEMANA ANTERIOR (${prevFrom} a ${prevTo}):\n`;
        context += `Total de evaluaciones: ${previousWeekData.length}\n\n`;
      }
    } else {
      context += '\n⚠️ No hay datos estructurados de RIX disponibles.\n\n';
    }

    console.log(`${logPrefix} Context length: ${context.length} characters`);

    // =============================================================================
    // PASO 5: LLAMAR A LA IA CON CONTEXTO COMPLETO
    // =============================================================================
    const systemPrompt = `Eres un analista experto en reputación corporativa que trabaja con el sistema RepIndex.

🎯 TU MISIÓN:
Interpretar preguntas en lenguaje natural y responder usando SOLO los datos proporcionados.

📊 DATOS QUE RECIBES:
- **RANKING INDIVIDUAL**: Lista de evaluaciones individuales (Empresa + Modelo IA + RIX Score) ordenada por RIX descendente
  - Este es el MISMO formato que muestra el dashboard principal
  - Cada fila es una evaluación independiente
  - Una empresa puede aparecer varias veces con diferentes modelos
- **PROMEDIOS POR EMPRESA**: Promedio de los 4 modelos de IA para cada empresa (solo usar si se pregunta explícitamente)
- **ANÁLISIS POR MODELO IA**: Estadísticas de ChatGPT, Perplexity, Gemini y DeepSeek
- **TENDENCIAS SEMANALES**: Comparación con la semana anterior
- **DOCUMENTOS CUALITATIVOS**: Contexto adicional de análisis previos

🔍 CÓMO RESPONDER (COMPORTAMIENTO DETERMINISTA):

**POR DEFECTO - USA EL RANKING INDIVIDUAL:**
Cuando pregunten:
- "Top 5 empresas" / "Mejores empresas" / "Ranking" / "Empresas con mejor RIX"
  → Usa el RANKING INDIVIDUAL (las primeras 5 filas tal cual)
  → Puedes incluir varias evaluaciones de la misma empresa si es lo que muestra el ranking
  → Ejemplo: "1. Secuoya (82 - Perplexity), 2. Tubacex (82 - Perplexity)..."

- "¿Cómo está X empresa?"
  → Muestra las 4 evaluaciones de esa empresa (una por cada modelo)
  → Indica cuál modelo le dio la mejor/peor valoración

**SOLO SI PREGUNTAN EXPLÍCITAMENTE - USA PROMEDIOS:**
- "Promedio de X" / "Media de X" / "Consenso entre modelos" / "Score consolidado"
  → Usa la tabla de PROMEDIOS POR EMPRESA
  → Calcula el promedio de los 4 modelos

⚠️ REGLAS CRÍTICAS:
- COMPORTAMIENTO DETERMINISTA: Por defecto, usa siempre el ranking individual
- El ranking individual puede tener la misma empresa varias veces (eso es CORRECTO)
- SOLO usa información que aparezca explícitamente en el contexto
- Si ves un ranking con 50+ evaluaciones, significa que TODOS los datos están disponibles
- NUNCA digas "solo tengo datos de X empresa" si el ranking muestra muchas
- Si NO encuentras información, di claramente "No hay datos disponibles para..."
- JAMÁS inventes, supongas o generes datos que no estén en el contexto

💬 ESTILO DE RESPUESTA:
- Directo y profesional
- Usa emojis moderadamente (📊 📈 📉 ⚠️)
- Formato en markdown cuando ayude a la claridad
- Respuestas concisas pero completas
- Cuando uses ranking individual, menciona el modelo IA de cada evaluación

RECUERDA: Los datos que recibes son completos, actualizados y deterministas. El ranking individual coincide EXACTAMENTE con el dashboard.`;

    const userPrompt = `Pregunta del usuario: "${question}"

CONTEXTO CON TODOS LOS DATOS DISPONIBLES:
${context}

Por favor, responde a la pregunta usando SOLO la información del contexto anterior.`;

    console.log(`${logPrefix} Calling OpenAI (o4-mini)...`);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userPrompt }
    ];

    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'o4-mini',
        messages: messages,
        max_completion_tokens: 2000,
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      console.error(`${logPrefix} OpenAI API error:`, errorText);
      throw new Error(`OpenAI API error: ${chatResponse.statusText}`);
    }

    const chatData = await chatResponse.json();
    const answer = chatData.choices[0].message.content;

    console.log(`${logPrefix} AI response received, length: ${answer.length}`);

    // =============================================================================
    // PASO 6: GENERAR PREGUNTAS SUGERIDAS
    // =============================================================================
    console.log(`${logPrefix} Generating follow-up questions...`);
    
    const suggestedQuestionsPrompt = `Basándote en la pregunta "${question}" y la respuesta proporcionada, genera exactamente 3 preguntas de seguimiento que el usuario podría hacer para profundizar en el análisis.

Las preguntas deben:
- Ser específicas y relevantes al contexto
- Explorar diferentes ángulos (comparaciones, tendencias, análisis por modelo)
- Ser progresivas (fácil → media → avanzada)

Responde SOLO con un array JSON de 3 strings, sin explicación adicional:
["pregunta 1", "pregunta 2", "pregunta 3"]`;

    try {
      const questionsResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Eres un asistente que genera preguntas de seguimiento. Responde SOLO con el array JSON.' },
            { role: 'user', content: suggestedQuestionsPrompt }
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      let suggestedQuestions: string[] = [];
      
      if (questionsResponse.ok) {
        const questionsData = await questionsResponse.json();
        const questionsText = questionsData.choices[0].message.content.trim();
        
        try {
          // Remove code blocks if present
          const cleanText = questionsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          suggestedQuestions = JSON.parse(cleanText);
        } catch (parseError) {
          console.warn(`${logPrefix} Error parsing follow-up questions:`, parseError);
          suggestedQuestions = [];
        }
      }

      // =============================================================================
      // PASO 7: GUARDAR EN BASE DE DATOS
      // =============================================================================
      if (sessionId) {
        await supabaseClient.from('chat_intelligence_sessions').insert([
          {
            session_id: sessionId,
            role: 'user',
            content: question,
          },
          {
            session_id: sessionId,
            role: 'assistant',
            content: answer,
            documents_found: vectorDocs?.length || 0,
            structured_data_found: allRixData?.length || 0,
            suggested_questions: suggestedQuestions,
          }
        ]);
      }

      // =============================================================================
      // RESPUESTA FINAL
      // =============================================================================
      return new Response(
        JSON.stringify({
          answer,
          suggestedQuestions,
          metadata: {
            documentsFound: vectorDocs?.length || 0,
            structuredDataFound: allRixData?.length || 0,
            dataWeeks: allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );

    } catch (questionsError) {
      console.error(`${logPrefix} Error generating follow-up questions:`, questionsError);
      // Continue without suggested questions
      return new Response(
        JSON.stringify({
          answer,
          suggestedQuestions: [],
          metadata: {
            documentsFound: vectorDocs?.length || 0,
            structuredDataFound: allRixData?.length || 0,
            dataWeeks: allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error(`${logPrefix} Error in chat-intelligence function:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
