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
      // Identificar semana más reciente
      const latestWeek = allRixData[0]?.batch_execution_date;
      const currentWeekData = allRixData.filter(run => run.batch_execution_date === latestWeek);
      
      // Identificar segunda semana más reciente para comparaciones
      const uniqueWeeks = [...new Set(allRixData.map(r => r.batch_execution_date))];
      const previousWeek = uniqueWeeks[1];
      const previousWeekData = previousWeek ? allRixData.filter(run => run.batch_execution_date === previousWeek) : [];

      console.log(`${logPrefix} Current week: ${latestWeek} (${currentWeekData.length} records)`);
      console.log(`${logPrefix} Previous week: ${previousWeek || 'N/A'} (${previousWeekData.length} records)`);

      // Calcular ranking por empresa (promedio de todos los modelos)
      const companyScores = new Map<string, { scores: number[], ticker: string, models: string[] }>();
      
      currentWeekData.forEach(run => {
        const companyName = run["03_target_name"];
        const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
        const model = run["02_model_name"];
        
        if (!companyName || score == null) return;
        
        if (!companyScores.has(companyName)) {
          companyScores.set(companyName, {
            scores: [],
            ticker: run["05_ticker"] || '',
            models: []
          });
        }
        
        const entry = companyScores.get(companyName)!;
        entry.scores.push(score);
        entry.models.push(model || '');
      });

      const rankedCompanies = Array.from(companyScores.entries())
        .map(([company, data]) => ({
          company,
          ticker: data.ticker,
          avgRix: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
          models: data.models.join(', '),
          modelCount: data.models.length
        }))
        .sort((a, b) => b.avgRix - a.avgRix);

      // Calcular tendencias (comparar con semana anterior)
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

        rankedCompanies.forEach(curr => {
          const prevData = prevScores.get(curr.company);
          if (prevData && prevData.length > 0) {
            const prevAvg = prevData.reduce((a, b) => a + b, 0) / prevData.length;
            trends.set(curr.company, curr.avgRix - prevAvg);
          }
        });
      }

      // GENERAR CONTEXTO: Ranking completo
      const periodFrom = currentWeekData[0]?.["06_period_from"];
      const periodTo = currentWeekData[0]?.["07_period_to"];
      
      context += `\n📊 RANKING COMPLETO SEMANA ACTUAL (${periodFrom} a ${periodTo}):\n`;
      context += `Total de empresas evaluadas: ${rankedCompanies.length}\n`;
      context += `Total de evaluaciones: ${currentWeekData.length}\n\n`;
      context += `| # | Empresa | Ticker | RIX Promedio | Modelos | Tendencia |\n`;
      context += `|---|---------|--------|--------------|---------|----------|\n`;
      
      rankedCompanies.forEach((company, idx) => {
        const trend = trends.get(company.company);
        const trendStr = trend !== undefined 
          ? (trend > 0 ? `↗ +${trend.toFixed(1)}` : trend < 0 ? `↘ ${trend.toFixed(1)}` : '→ 0.0')
          : 'N/A';
        
        context += `| ${idx + 1} | ${company.company} | ${company.ticker} | ${company.avgRix} | ${company.modelCount} | ${trendStr} |\n`;
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

      // GENERAR CONTEXTO: Top movers (mayores cambios positivos/negativos)
      if (trends.size > 0) {
        const sortedByTrend = Array.from(trends.entries())
          .map(([company, trend]) => {
            const companyData = rankedCompanies.find(c => c.company === company);
            return { company, trend, ticker: companyData?.ticker || '', rix: companyData?.avgRix || 0 };
          })
          .sort((a, b) => b.trend - a.trend);

        const topGainers = sortedByTrend.slice(0, 5);
        const topLosers = sortedByTrend.slice(-5).reverse();

        context += `\n📈 TOP 5 GANADORES (mayor mejora vs semana anterior):\n`;
        topGainers.forEach((item, idx) => {
          context += `${idx + 1}. ${item.company} (${item.ticker}): RIX ${item.rix}, cambio +${item.trend.toFixed(1)}\n`;
        });

        context += `\n📉 TOP 5 PERDEDORES (mayor caída vs semana anterior):\n`;
        topLosers.forEach((item, idx) => {
          context += `${idx + 1}. ${item.company} (${item.ticker}): RIX ${item.rix}, cambio ${item.trend.toFixed(1)}\n`;
        });

        context += `\n`;
      }

      // GENERAR CONTEXTO: Datos detallados de semana anterior (para comparaciones)
      if (previousWeekData.length > 0) {
        const prevPeriodFrom = previousWeekData[0]?.["06_period_from"];
        const prevPeriodTo = previousWeekData[0]?.["07_period_to"];
        
        context += `\n📅 DATOS SEMANA ANTERIOR (${prevPeriodFrom} a ${prevPeriodTo}):\n`;
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
- **Ranking completo**: Todas las empresas evaluadas esta semana con sus RIX promedio
- **Análisis por modelo IA**: Estadísticas de ChatGPT, Perplexity, Gemini y DeepSeek
- **Tendencias semanales**: Comparación con la semana anterior
- **Documentos cualitativos**: Contexto adicional de análisis previos

🔍 CÓMO RESPONDER:
1. **Lee la pregunta cuidadosamente** - Identifica qué información pide el usuario
2. **Busca en los datos proporcionados** - Los datos YA contienen toda la información disponible
3. **Responde con precisión** - Si piden top 5, busca las 5 primeras del ranking
4. **Cita datos específicos** - Menciona cifras, tickers, y detalles concretos
5. **Compara cuando sea relevante** - Usa las tendencias para mostrar evolución

⚠️ REGLAS CRÍTICAS:
- SOLO usa información que aparezca explícitamente en el contexto
- Si ves un ranking con 150+ empresas, significa que TODAS están disponibles
- NUNCA digas "solo tengo datos de X empresa" si el ranking muestra muchas
- Si NO encuentras información, di claramente "No hay datos disponibles para..."
- JAMÁS inventes, supongas o generes datos que no estén en el contexto

💬 ESTILO DE RESPUESTA:
- Directo y profesional
- Usa emojis moderadamente (📊 📈 📉 ⚠️)
- Formato en markdown cuando ayude a la claridad
- Respuestas concisas pero completas

RECUERDA: Los datos que recibes son completos y actualizados. Confía en ellos.`;

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
