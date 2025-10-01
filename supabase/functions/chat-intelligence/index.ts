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
    const { company, week, analysisType, conversationHistory } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Build search query based on context
    let searchQuery = `${company}`;
    if (week) searchQuery += ` semana ${week}`;

    console.log('Search query:', searchQuery);
    console.log('Company filter:', company);
    console.log('Week filter:', week);

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

    // Further filter by week if specified
    if (week && filteredDocuments.length > 0) {
      filteredDocuments = filteredDocuments.filter((doc: any) => 
        doc.metadata?.week_start === week
      );
      console.log('Documents after week filter:', filteredDocuments.length);
    }

    // Limit to top 10 most relevant
    filteredDocuments = filteredDocuments.slice(0, 10);

    // Get structured data for the company
    let structuredData = null;
    if (company && week) {
      const { data: pariRuns } = await supabaseClient
        .from('pari_runs')
        .select(`
          *,
          repindex_root_issuers (
            issuer_name,
            ticker,
            sector_category
          )
        `)
        .eq('03_target_name', company)
        .gte('06_period_from', week)
        .lte('07_period_to', week);

      structuredData = pariRuns;
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
        context += `PARI Score: ${doc.metadata.pari_score}\n`;
        context += `Semana: ${doc.metadata.week_start}\n`;
        context += `Contenido: ${doc.content.substring(0, 500)}...\n\n`;
      });
    } else {
      console.warn('No documents found for company:', company);
      context += `ADVERTENCIA: No se encontraron documentos en el vector store para ${company}.\n\n`;
    }

    if (structuredData && structuredData.length > 0) {
      context += '\nDatos estructurados disponibles:\n';
      structuredData.forEach((run: any) => {
        context += `- ${run['02_model_name']}: PARI ${run['09_pari_score']}\n`;
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
        systemPrompt = 'Eres un analista experto en comparación entre modelos de IA. Analiza los datos y encuentra consensos entre los diferentes modelos de IA (ChatGPT, Gemini, Perplexity, Deepseek).';
        userPrompt = `Basándote en los datos siguientes, identifica los puntos de CONSENSO entre los modelos de IA sobre ${company}:\n\n${context}`;
        break;

      case 'discrepancias':
        systemPrompt = 'Eres un analista experto en comparación entre modelos de IA. Analiza los datos y encuentra discrepancias significativas entre los diferentes modelos.';
        userPrompt = `Basándote en los datos siguientes, identifica las DISCREPANCIAS más importantes entre los modelos de IA sobre ${company}:\n\n${context}`;
        break;

      case 'fortalezas':
        systemPrompt = 'Eres un analista experto en reputación corporativa. Identifica fortalezas basándote en lo que dicen los modelos de IA.';
        userPrompt = `Basándote en los datos siguientes, identifica las FORTALEZAS de ${company} según los diferentes modelos de IA:\n\n${context}`;
        break;

      case 'debilidades':
        systemPrompt = 'Eres un analista experto en reputación corporativa. Identifica debilidades y áreas de mejora basándote en lo que dicen los modelos de IA.';
        userPrompt = `Basándote en los datos siguientes, identifica las DEBILIDADES de ${company} según los diferentes modelos de IA:\n\n${context}`;
        break;

      case 'metricas':
        systemPrompt = 'Eres un analista experto en métricas de reputación. Analiza las métricas LNS, ES, SAM, RM, CLR, GIP, KGI, MPI.';
        userPrompt = `Basándote en los datos siguientes, analiza las MÉTRICAS de reputación de ${company} y compara cómo las evalúan los diferentes modelos de IA:\n\n${context}`;
        break;

      default:
        systemPrompt = 'Eres un asistente experto en análisis de reputación corporativa y comparación entre modelos de IA.';
        userPrompt = `Analiza los siguientes datos sobre ${company}:\n\n${context}`;
    }

    // Call OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: userPrompt },
    ];

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const aiData = await openAIResponse.json();
    const aiResponse = aiData.choices[0].message.content;

    // Generate suggested follow-up questions
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
            content: `Análisis previo: ${aiResponse}\n\nGenera 3 preguntas de seguimiento relevantes.`,
          },
        ],
        temperature: 0.8,
        max_tokens: 200,
      }),
    });

    const followUpData = await followUpResponse.json();
    let suggestedQuestions = [];
    
    try {
      const questionsText = followUpData.choices[0].message.content;
      suggestedQuestions = JSON.parse(questionsText);
    } catch (e) {
      // Fallback questions
      suggestedQuestions = [
        '¿Qué modelo es más optimista?',
        '¿Dónde hay más consenso?',
        '¿Qué métricas destacan?',
      ];
    }

    return new Response(
      JSON.stringify({
        response: aiResponse,
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
