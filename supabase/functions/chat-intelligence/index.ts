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
    const { company, week, analysisType, conversationHistory, sessionId } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const logPrefix = sessionId ? `[${sessionId.slice(0, 8)}]` : '[no-session]';
    console.log(`${logPrefix} Processing request for company: ${company}, week: ${week}, type: ${analysisType}`);

    // Build search query based on context
    let searchQuery = `${company}`;
    if (week) searchQuery += ` semana ${week}`;

    console.log(`${logPrefix} Search query:`, searchQuery);

    // Generate embedding for search query
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

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('Embedding API error:', errorText);
      throw new Error(`Failed to generate embedding: ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    console.log('Generated embedding, length:', queryEmbedding.length);

    // Search vector store (without filter, we'll filter in JS)
    const { data: documents, error: searchError } = await supabaseClient
      .rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_count: 20, // Get more results to filter client-side
      });

    if (searchError) {
      console.error('Vector search error:', searchError);
      throw searchError;
    }

    console.log('Documents found before filtering:', documents?.length || 0);
    if (documents && documents.length > 0) {
      console.log('First document metadata:', JSON.stringify(documents[0].metadata, null, 2));
    }

    // Filter documents by company name (case-insensitive)
    let filteredDocuments = documents || [];
    if (company && filteredDocuments.length > 0) {
      filteredDocuments = filteredDocuments.filter((doc: any) => 
        doc.metadata?.company_name?.toLowerCase() === company.toLowerCase()
      );
      console.log('Documents after company filter:', filteredDocuments.length);
    }

    // Further filter by week if specified (flexible: accepts dates within same week)
    if (week && filteredDocuments.length > 0) {
      const searchDate = new Date(week);
      const beforeFilter = filteredDocuments.length;
      
      filteredDocuments = filteredDocuments.filter((doc: any) => {
        if (!doc.metadata?.week_start) return false;
        const docDate = new Date(doc.metadata.week_start);
        // Accept if within 6 days (same week)
        const diffInDays = Math.abs((docDate.getTime() - searchDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffInDays <= 6;
      });
      
      console.log(`Documents after week filter (flexible): ${filteredDocuments.length} (from ${beforeFilter})`);
      
      // Log available weeks if no matches found
      if (filteredDocuments.length === 0 && beforeFilter > 0) {
        const availableWeeks = [...new Set(
          documents
            .filter((d: any) => d.metadata?.company_name?.toLowerCase() === company.toLowerCase())
            .map((d: any) => d.metadata.week_start)
        )].sort().reverse();
        console.warn(`No data found for week ${week}. Available weeks for ${company}:`, availableWeeks);
      }
    }

    // Limit to top 10 most relevant
    filteredDocuments = filteredDocuments.slice(0, 10);

    // Get structured data for the company
    let structuredData = null;
    if (company && week) {
      const { data: rixRuns, error: rixError } = await supabaseClient
        .from('rix_runs')
        .select(`
          *,
          repindex_root_issuers (
            issuer_name,
            ticker,
            sector_category
          )
        `)
        .eq('03_target_name', company)
        .lte('06_period_from', week)
        .gte('07_period_to', week);

      if (rixError) {
        console.error('Error fetching rix_runs:', rixError);
      } else {
        structuredData = rixRuns;
        console.log('Structured data found:', structuredData?.length || 0, 'runs');
      }
    }

    // Build context for AI
    let context = '';
    
    console.log('Building context with', filteredDocuments.length, 'documents');
    
    if (filteredDocuments && filteredDocuments.length > 0) {
      context += 'Documentos vectorizados relevantes:\n\n';
      filteredDocuments.forEach((doc: any, idx: number) => {
        context += `Documento ${idx + 1}:\n`;
        context += `Empresa: ${doc.metadata.company_name}\n`;
        context += `Modelo IA: ${doc.metadata.ai_model}\n`;
        context += `RIX Score: ${doc.metadata.rix_score}\n`;
        context += `Semana: ${doc.metadata.week_start} - ${doc.metadata.week_end}\n`;
        context += `Contenido: ${doc.content.substring(0, 500)}...\n\n`;
      });
    } else {
      console.warn('No documents found for company:', company, 'week:', week);
      
      // Enhanced warning message with explicit instructions
      const weekInfo = week ? ` para la semana ${week}` : '';
      context += `⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n`;
      context += `No se encontraron documentos en el vector store para ${company}${weekInfo}.\n\n`;
      context += `INSTRUCCIONES PARA LA IA:\n`;
      context += `1. NO inventes datos ni análisis que no estén en el contexto proporcionado\n`;
      context += `2. Informa claramente al usuario que no hay datos disponibles para esta consulta\n`;
      context += `3. Si hay semanas alternativas con datos, sugiere al usuario revisar esas semanas\n`;
      context += `4. Explica que el análisis NO puede realizarse sin datos del vector store\n\n`;
    }

    if (structuredData && structuredData.length > 0) {
      context += '\nDatos estructurados disponibles:\n';
      structuredData.forEach((run: any) => {
        context += `- ${run['02_model_name']}: RIX ${run['09_rix_score']}\n`;
      });
    } else {
      console.warn('No structured data found for company:', company, 'week:', week);
    }

    console.log('Final context length:', context.length);
    console.log('Context preview:', context.substring(0, 200));

    // Generate AI response based on analysis type
    let systemPrompt = '';
    let userPrompt = '';

    switch (analysisType) {
      case 'consenso':
        systemPrompt = 'Eres un analista experto en comparación entre modelos de IA. REGLA CRÍTICA DE SEGURIDAD: SOLO analiza datos que estén EXPLÍCITAMENTE en el contexto proporcionado. Si no hay documentos en el vector store, responde ÚNICAMENTE: "No tengo datos disponibles para [empresa] en [semana]. Por favor, selecciona otra semana o verifica que la empresa tenga datos en el sistema." NUNCA inventes, asumas o generes análisis sin datos del vector store. Analiza paso a paso los datos y encuentra patrones de consenso entre los diferentes modelos de IA (ChatGPT, Gemini, Perplexity, Deepseek). Utiliza razonamiento estructurado para identificar coincidencias significativas.';
        userPrompt = `Basándote en los datos siguientes, identifica los puntos de CONSENSO entre los modelos de IA sobre ${company}. Analiza sistemáticamente cada modelo y sus evaluaciones:\n\n${context}`;
        break;

      case 'discrepancias':
        systemPrompt = 'Eres un analista experto en comparación entre modelos de IA. IMPORTANTE: Solo analiza datos que estén EXPLÍCITAMENTE en el contexto proporcionado. Si no hay documentos disponibles, informa al usuario claramente. NUNCA inventes datos. Analiza paso a paso los datos y encuentra discrepancias significativas entre los diferentes modelos. Usa razonamiento multi-paso para identificar las diferencias más relevantes y sus posibles causas.';
        userPrompt = `Basándote en los datos siguientes, identifica las DISCREPANCIAS más importantes entre los modelos de IA sobre ${company}. Analiza las razones potenciales de cada discrepancia:\n\n${context}`;
        break;

      case 'fortalezas':
        systemPrompt = 'Eres un analista experto en reputación corporativa. IMPORTANTE: Solo analiza datos que estén EXPLÍCITAMENTE en el contexto proporcionado. Si no hay documentos disponibles, informa al usuario claramente. NUNCA inventes datos. Identifica fortalezas mediante análisis estructurado de lo que dicen los modelos de IA. Evalúa la consistencia y evidencia de cada fortaleza identificada.';
        userPrompt = `Basándote en los datos siguientes, identifica las FORTALEZAS de ${company} según los diferentes modelos de IA. Analiza el respaldo que cada modelo proporciona:\n\n${context}`;
        break;

      case 'debilidades':
        systemPrompt = 'Eres un analista experto en reputación corporativa. IMPORTANTE: Solo analiza datos que estén EXPLÍCITAMENTE en el contexto proporcionado. Si no hay documentos disponibles, informa al usuario claramente. NUNCA inventes datos. Identifica debilidades y áreas de mejora mediante análisis crítico y estructurado de lo que dicen los modelos de IA. Evalúa la gravedad y consistencia de cada debilidad.';
        userPrompt = `Basándote en los datos siguientes, identifica las DEBILIDADES de ${company} según los diferentes modelos de IA. Analiza la frecuencia y severidad de cada problema:\n\n${context}`;
        break;

      case 'metricas':
        systemPrompt = 'Eres un analista experto en métricas de reputación. IMPORTANTE: Solo analiza datos que estén EXPLÍCITAMENTE en el contexto proporcionado. Si no hay documentos disponibles, informa al usuario claramente. NUNCA inventes datos. Analiza paso a paso las métricas NVM (Noticias y Volumen Mediático), DRM (Diversidad y Reputación de Medios), SIM (Sentimiento e Impacto Mediático), RMM (Reconocimiento y Métricas de Marca), CEM (Comunicación y Engagement), GAM (Gobierno y Accountability), DCM (Desempeño y Competitividad), CXM (Cumplimiento y eXcelencia operativa). Compara sistemáticamente cómo cada modelo evalúa cada métrica y razona sobre las diferencias encontradas.';
        userPrompt = `Basándote en los datos siguientes, analiza las MÉTRICAS de reputación RIX de ${company} y compara cómo las evalúan los diferentes modelos de IA. Proporciona análisis detallado métrica por métrica:\n\n${context}`;
        break;

      case 'profundo':
        systemPrompt = 'Eres un analista experto con capacidades de razonamiento avanzado multi-paso. IMPORTANTE: Solo analiza datos que estén EXPLÍCITAMENTE en el contexto proporcionado. Si no hay documentos disponibles, informa al usuario claramente que no puedes realizar el análisis. NUNCA inventes o asumas datos que no estén presentes. Utiliza cadenas de pensamiento explícitas para analizar profundamente los datos disponibles. Examina sistemáticamente cada aspecto, considera múltiples perspectivas, evalúa evidencia contradictoria, y proporciona conclusiones bien fundamentadas con razonamiento detallado.';
        userPrompt = `Realiza un ANÁLISIS PROFUNDO Y EXHAUSTIVO de ${company}. Utiliza razonamiento multi-paso para:
1. Analizar detalladamente cada modelo de IA y sus evaluaciones
2. Identificar patrones subyacentes y relaciones causa-efecto
3. Evaluar la calidad y consistencia de la evidencia
4. Considerar implicaciones estratégicas a corto y largo plazo
5. Proporcionar recomendaciones fundamentadas

Datos disponibles:\n\n${context}`;
        break;

      default:
        systemPrompt = 'Eres un asistente experto en análisis de reputación corporativa y comparación entre modelos de IA. IMPORTANTE: Solo analiza datos que estén EXPLÍCITAMENTE en el contexto proporcionado. Si no hay documentos disponibles, informa al usuario claramente. NUNCA inventes datos. Utiliza razonamiento estructurado y análisis multi-paso para proporcionar insights profundos basados únicamente en los datos disponibles.';
        userPrompt = `Analiza de forma sistemática los siguientes datos sobre ${company}:\n\n${context}`;
    }

    // Determine model and tokens based on analysis type
    const isDeepAnalysis = analysisType === 'profundo';
    const modelToUse = isDeepAnalysis ? 'o3-2025-04-16' : 'o4-mini-2025-04-16';
    const maxTokens = isDeepAnalysis ? 8000 : 4000;

    console.log(`Using model: ${modelToUse} (deep analysis: ${isDeepAnalysis}, tokens: ${maxTokens})`);

    // Call OpenAI API
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: userPrompt },
    ];

    console.log(`Calling OpenAI API with ${modelToUse}...`);
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelToUse,
        messages,
        max_completion_tokens: maxTokens,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices[0].message.content;
    console.log('AI response received, length:', responseContent?.length || 0);

    // Generate suggested follow-up questions
    console.log('Generating follow-up questions (gpt-4o-mini)...');
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
            content: 'Genera exactamente 3 preguntas de seguimiento relevantes basadas en el análisis previo. Responde SOLO con un array JSON de strings, sin texto adicional.',
          },
          {
            role: 'user',
            content: `Análisis previo: ${responseContent}\n\nGenera 3 preguntas de seguimiento relevantes.`,
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
        console.log('Follow-up questions generated:', suggestedQuestions.length);
      } catch (e) {
        console.warn('Error parsing follow-up questions:', e);
        // Fallback questions
        suggestedQuestions = [
          '¿Qué modelo es más optimista?',
          '¿Dónde hay más consenso?',
          '¿Qué métricas destacan?',
        ];
      }
    } else {
      console.warn('Follow-up questions generation failed, using fallback');
      suggestedQuestions = [
        '¿Qué modelo es más optimista?',
        '¿Dónde hay más consenso?',
        '¿Qué métricas destacan?',
      ];
    }

    return new Response(
      JSON.stringify({
        response: responseContent,
        suggestedQuestions,
        documentsFound: filteredDocuments?.length || 0,
        structuredDataFound: structuredData?.length || 0,
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
