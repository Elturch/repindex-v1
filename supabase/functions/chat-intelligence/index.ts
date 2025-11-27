import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, conversationHistory, sessionId } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const logPrefix = sessionId ? `[${sessionId.slice(0, 8)}]` : '[no-session]';
    console.log(`${logPrefix} User question:`, question);

    // Generate embedding for the question to search vector store
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
      const errorText = await embeddingResponse.text();
      console.error(`${logPrefix} Embedding API error:`, errorText);
      throw new Error(`Failed to generate embedding: ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Search vector store for relevant documents
    const { data: documents, error: searchError } = await supabaseClient
      .rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_count: 50, // Increased from 15 to get more context
      });

    if (searchError) {
      console.error(`${logPrefix} Vector search error:`, searchError);
      throw searchError;
    }

    console.log(`${logPrefix} Documents found:`, documents?.length || 0);

    // Get ALL RIX data - no limits, no filters
    // This ensures we have complete data for all 153 companies x 4 AI models x all weeks
    const { data: allRixData, error: rixError } = await supabaseClient
      .from('rix_runs')
      .select(`
        "03_target_name",
        "02_model_name",
        "09_rix_score",
        "06_period_from",
        "07_period_to",
        batch_execution_date,
        "10_resumen",
        repindex_root_issuers (
          issuer_name,
          ticker,
          sector_category,
          ibex_family_code
        )
      `)
      .order('batch_execution_date', { ascending: false })
      .order('"03_target_name"', { ascending: true })
      .order('"02_model_name"', { ascending: true });

    if (rixError) {
      console.error(`${logPrefix} Error fetching rix_runs:`, rixError);
    }

    console.log(`${logPrefix} Total RIX evaluations loaded:`, allRixData?.length || 0);
    
    // Log breakdown by model
    if (allRixData && allRixData.length > 0) {
      const byModel = allRixData.reduce((acc: any, run: any) => {
        const model = run["02_model_name"];
        acc[model] = (acc[model] || 0) + 1;
        return acc;
      }, {});
      console.log(`${logPrefix} Breakdown by model:`, byModel);
    }

    // Build comprehensive context
    let context = '';
    
    if (documents && documents.length > 0) {
      context += '=== DOCUMENTOS VECTORIZADOS RELEVANTES ===\n\n';
      documents.slice(0, 20).forEach((doc: any, idx: number) => {
        context += `Documento ${idx + 1}:\n`;
        context += `Empresa: ${doc.metadata.company_name}\n`;
        context += `Modelo IA: ${doc.metadata.ai_model}\n`;
        context += `RIX Score: ${doc.metadata.rix_score}\n`;
        context += `Semana: ${doc.metadata.week_start} - ${doc.metadata.week_end}\n`;
        context += `Contenido: ${doc.content.substring(0, 400)}...\n\n`;
      });
    }

    if (allRixData && allRixData.length > 0) {
      context += '\n=== BASE DE DATOS COMPLETA (TODAS LAS EVALUACIONES RIX) ===\n\n';
      context += `IMPORTANTE: Esta base de datos contiene ${allRixData.length} evaluaciones.\n`;
      context += `Cada empresa es evaluada por 4 modelos de IA: ChatGPT, Google Gemini, Perplexity y Deepseek.\n`;
      context += `Total de empresas únicas: aproximadamente ${Math.floor(allRixData.length / 4 / 4)} empresas.\n\n`;
      
      // Group by company and week for complete view
      const byCompanyWeek = allRixData.reduce((acc: any, run: any) => {
        const company = run["03_target_name"];
        const week = run["06_period_from"];
        const key = `${company}|${week}`;
        if (!acc[key]) {
          acc[key] = {
            company,
            week,
            ticker: run.repindex_root_issuers?.ticker,
            sector: run.repindex_root_issuers?.sector_category,
            ibex_family: run.repindex_root_issuers?.ibex_family_code,
            models: []
          };
        }
        acc[key].models.push({
          model: run["02_model_name"],
          rix: run["09_rix_score"],
          summary: run["10_resumen"]
        });
        return acc;
      }, {});

      // Show data organized by company and week
      const entries = Object.values(byCompanyWeek);
      context += `Datos organizados por empresa y semana (${entries.length} combinaciones únicas):\n\n`;
      
      entries.forEach((entry: any) => {
        context += `Empresa: ${entry.company}\n`;
        context += `Ticker: ${entry.ticker || 'N/A'} | Sector: ${entry.sector || 'N/A'} | IBEX: ${entry.ibex_family || 'N/A'}\n`;
        context += `Semana: ${entry.week}\n`;
        context += 'Evaluaciones:\n';
        entry.models.forEach((m: any) => {
          context += `  • ${m.model}: RIX ${m.rix}\n`;
          if (m.summary) {
            context += `    Resumen: ${m.summary.substring(0, 150)}...\n`;
          }
        });
        context += '\n';
      });
    }

    if (!documents?.length && !allRixData?.length) {
      context += '⚠️ ADVERTENCIA: No se encontraron datos relevantes para esta consulta.\n';
      context += 'INSTRUCCIONES PARA LA IA: Informa al usuario que no hay datos disponibles para responder esta pregunta específica.\n';
    }

    console.log(`${logPrefix} Context length:`, context.length);

    // System prompt for the AI
    const systemPrompt = `Eres un analista experto en reputación corporativa que trabaja con RepIndex.ai.

DATOS DISPONIBLES:
- Base de datos completa con evaluaciones de 153 empresas
- Cada empresa es analizada SEMANALMENTE por 4 modelos de IA: ChatGPT, Google Gemini, Perplexity y Deepseek
- Tienes acceso a TODAS las evaluaciones históricas sin límites

REGLA CRÍTICA: SOLO puedes analizar y responder con datos que estén EXPLÍCITAMENTE en el contexto proporcionado. 
Si no hay datos disponibles, indica claramente que no puedes responder esa pregunta con los datos actuales.
NUNCA inventes, asumas o generes datos que no estén en el contexto.

IMPORTANTE: Cuando menciones que "solo hay X documentos de ChatGPT", revisa bien los datos estructurados completos.
La base de datos contiene TODAS las evaluaciones de todos los modelos para todas las empresas cada semana.

Cuando respondas:
1. Sé claro y conciso
2. Usa datos específicos (números, nombres, fechas)
3. Compara entre los 4 modelos de IA cuando sea relevante (ChatGPT, Gemini, Perplexity, Deepseek)
4. Identifica tendencias y patrones
5. Siempre indica la fuente de tus datos (qué modelo de IA, qué semana)
6. Si necesitas datos de un modelo específico, búscalos en la sección de datos estructurados completos

Responde en español de forma profesional pero accesible.`;

    const userPrompt = `Pregunta del usuario: ${question}

Datos disponibles para responder:

${context}

Responde la pregunta basándote ÚNICAMENTE en los datos proporcionados arriba.`;

    // Call OpenAI API for analysis
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: userPrompt },
    ];

    console.log(`${logPrefix} Calling OpenAI (o4-mini)...`);
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'o4-mini-2025-04-16',
        messages,
        max_completion_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`${logPrefix} OpenAI API error:`, errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices[0].message.content;
    console.log(`${logPrefix} AI response received, length:`, responseContent?.length || 0);

    // Generate suggested follow-up questions
    console.log(`${logPrefix} Generating follow-up questions...`);
    const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Genera exactamente 3 preguntas de seguimiento relevantes y específicas basadas en la conversación. Responde SOLO con un array JSON de strings, sin texto adicional.',
          },
          {
            role: 'user',
            content: `Pregunta original: ${question}\n\nRespuesta dada: ${responseContent}\n\nGenera 3 preguntas de seguimiento específicas y relevantes.`,
          },
        ],
        max_tokens: 200,
      }),
    });

    let suggestedQuestions = [];
    
    if (followUpResponse.ok) {
      try {
        const followUpData = await followUpResponse.json();
        const questionsText = followUpData.choices[0].message.content;
        suggestedQuestions = JSON.parse(questionsText);
        console.log(`${logPrefix} Follow-up questions generated:`, suggestedQuestions.length);
      } catch (e) {
        console.warn(`${logPrefix} Error parsing follow-up questions:`, e);
        suggestedQuestions = [
          '¿Qué otras empresas destacan en este sector?',
          '¿Cómo ha evolucionado esto en las últimas semanas?',
          '¿Qué modelos de IA coinciden más en este análisis?',
        ];
      }
    } else {
      console.warn(`${logPrefix} Follow-up questions generation failed`);
      suggestedQuestions = [
        '¿Qué otras empresas destacan en este sector?',
        '¿Cómo ha evolucionado esto en las últimas semanas?',
        '¿Qué modelos de IA coinciden más en este análisis?',
      ];
    }

    return new Response(
      JSON.stringify({
        response: responseContent,
        suggestedQuestions,
        documentsFound: documents?.length || 0,
        structuredDataFound: allRixData?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in chat-intelligence:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
