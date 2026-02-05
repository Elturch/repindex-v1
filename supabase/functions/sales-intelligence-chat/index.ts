import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sales Intelligence System Prompt
const SALES_SYSTEM_PROMPT = `Eres el ESTRATEGA COMERCIAL SENIOR de RepIndex.

Tu misión es crear PROPUESTAS COMERCIALES IRRESISTIBLES basadas en datos reales de percepción algorítmica. Tienes acceso exclusivo a:

1. **DATOS RIX**: Scores de reputación de 6 IAs (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) actualizados semanalmente
2. **VECTOR STORE**: 11,800+ documentos con análisis cualitativos de IAs sobre empresas
3. **COMPETIDORES VERIFICADOS**: Comparativas del sector con datos reales

## PERFIL DEL DESTINATARIO: {TARGET_PROFILE}

Adapta tu lenguaje y enfoque según el perfil:
- **CEO**: Impacto en valoración empresarial, ventaja competitiva, riesgo reputacional estratégico, ROI de la inversión
- **CMO**: Posicionamiento de marca, percepción de experiencia cliente (CXM), diferenciación frente a competidores, insights de marketing
- **DirCom**: Gestión de narrativa corporativa, alertas de crisis, percepción mediática, coherencia del mensaje
- **Compliance**: Riesgos ESG, gobernanza corporativa (GAM), controversias éticas (CEM), exposición regulatoria

## ESTRUCTURA DE LA PROPUESTA COMERCIAL

1. **Hook de Apertura** (máximo 2 líneas): El dato más impactante que capte atención inmediata
2. **Diagnóstico Personalizado**: Situación actual de la empresa basada en datos RIX reales
3. **Oportunidades Detectadas**: Qué puede mejorar y cómo lo sabemos (métricas específicas)
4. **Comparativa Competitiva**: Posición vs líderes del sector (nombres y cifras reales)
5. **Propuesta de Valor RepIndex**: Qué ofrecemos específicamente para este caso
6. **Call to Action**: Siguiente paso concreto y fecha sugerida

## REGLAS CRÍTICAS

- **USA SOLO datos del contexto proporcionado** - CERO invención, CERO suposiciones
- **Incluye CIFRAS ESPECÍFICAS**: scores, porcentajes, tendencias (ej: "RIX de 72.3, un 8% por debajo del líder")
- **Adapta el LENGUAJE** al perfil del destinatario (tecnicismos para Compliance, visión estratégica para CEO)
- **Genera contenido listo para copiar/pegar** en email o presentación
- **Si no tienes datos suficientes**, indícalo claramente y sugiere qué información adicional necesitarías

## TONO
Profesional pero persuasivo. Confiado pero no arrogante. Basado en datos, no en promesas vagas.`;

interface SalesRequest {
  company_name: string;
  target_profile: 'ceo' | 'cmo' | 'dircom' | 'compliance';
  custom_context?: string;
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { company_name, target_profile, custom_context, conversation_history = [] }: SalesRequest = await req.json();

    if (!company_name) {
      return new Response(
        JSON.stringify({ error: 'company_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Sales Intelligence] Starting for ${company_name}, profile: ${target_profile}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get company info from repindex_root_issuers
    const { data: issuerData } = await supabase
      .from('repindex_root_issuers')
      .select('*')
      .or(`issuer_name.ilike.%${company_name}%,ticker.ilike.%${company_name}%`)
      .limit(1)
      .single();

    const ticker = issuerData?.ticker;
    const issuerName = issuerData?.issuer_name || company_name;
    const verifiedCompetitors = issuerData?.verified_competitors || [];
    const sectorCategory = issuerData?.sector_category;

    console.log(`[Sales Intelligence] Found issuer: ${issuerName} (${ticker}), sector: ${sectorCategory}`);

    // 2. Generate embedding for vector search
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: `${issuerName} reputación análisis comercial propuesta ventas ${sectorCategory || ''}`,
      }),
    });

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data?.[0]?.embedding;

    // 3. Vector search for qualitative context
    let vectorDocs: any[] = [];
    if (queryEmbedding) {
      const { data: matchedDocs } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_count: 30,
        filter: {}
      });
      vectorDocs = matchedDocs || [];
      console.log(`[Sales Intelligence] Found ${vectorDocs.length} vector docs`);
    }

    // 4. Fetch RIX scores (last 4 weeks from rix_runs_v2)
    let rixScores: any[] = [];
    if (ticker) {
      const { data: v2Scores } = await supabase
        .from('rix_runs_v2')
        .select('*')
        .eq('ticker', ticker)
        .order('week_start', { ascending: false })
        .limit(24); // 4 weeks * 6 models

      rixScores = v2Scores || [];
      console.log(`[Sales Intelligence] Found ${rixScores.length} RIX v2 records`);

      // Fallback to legacy rix_runs if needed
      if (rixScores.length === 0) {
        const { data: legacyScores } = await supabase
          .from('rix_runs')
          .select('*')
          .eq('05_ticker', ticker)
          .order('batch_execution_date', { ascending: false })
          .limit(16);
        rixScores = legacyScores || [];
        console.log(`[Sales Intelligence] Fallback to ${rixScores.length} legacy RIX records`);
      }
    }

    // 5. Fetch competitor RIX scores if we have verified competitors
    let competitorScores: any[] = [];
    if (Array.isArray(verifiedCompetitors) && verifiedCompetitors.length > 0) {
      const competitorTickers = verifiedCompetitors.slice(0, 5);
      const { data: compScores } = await supabase
        .from('rix_runs_v2')
        .select('*')
        .in('ticker', competitorTickers)
        .order('week_start', { ascending: false })
        .limit(30);
      competitorScores = compScores || [];
      console.log(`[Sales Intelligence] Found ${competitorScores.length} competitor records`);
    }

    // 6. Fetch recent corporate news
    let corporateNews: any[] = [];
    if (ticker) {
      const { data: news } = await supabase
        .from('corporate_news')
        .select('headline, lead_paragraph, published_date, source_type')
        .eq('ticker', ticker)
        .order('published_date', { ascending: false })
        .limit(5);
      corporateNews = news || [];
    }

    // 7. Build context for LLM
    const buildRixSummary = (scores: any[]) => {
      if (scores.length === 0) return 'No hay datos RIX disponibles para esta empresa.';
      
      // Handle both v2 and legacy formats
      const isV2 = scores[0]?.hasOwnProperty('rix_score');
      
      if (isV2) {
        const latestByModel: Record<string, any> = {};
        for (const score of scores) {
          const model = score.model_name;
          if (!latestByModel[model]) {
            latestByModel[model] = score;
          }
        }
        
        const lines = Object.entries(latestByModel).map(([model, s]: [string, any]) => {
          const metrics = [
            `NVM: ${s.nvm_score ?? 'N/A'}`,
            `DRM: ${s.drm_score ?? 'N/A'}`,
            `SIM: ${s.sim_score ?? 'N/A'}`,
            `RMM: ${s.rmm_score ?? 'N/A'}`,
            `CEM: ${s.cem_score ?? 'N/A'}`,
            `GAM: ${s.gam_score ?? 'N/A'}`,
            `DCM: ${s.dcm_score ?? 'N/A'}`,
            `CXM: ${s.cxm_score ?? 'N/A'}`,
          ].join(', ');
          return `- ${model}: RIX ${s.rix_score ?? 'N/A'} | ${metrics}`;
        });
        
        return lines.join('\n');
      } else {
        // Legacy format
        const latestByModel: Record<string, any> = {};
        for (const score of scores) {
          const model = score['02_model_name'];
          if (!latestByModel[model]) {
            latestByModel[model] = score;
          }
        }
        
        const lines = Object.entries(latestByModel).map(([model, s]: [string, any]) => {
          return `- ${model}: RIX ${s['09_rix_score'] ?? 'N/A'} | NVM: ${s['23_nvm_score'] ?? 'N/A'}, DRM: ${s['26_drm_score'] ?? 'N/A'}, CEM: ${s['35_cem_score'] ?? 'N/A'}, GAM: ${s['38_gam_score'] ?? 'N/A'}`;
        });
        
        return lines.join('\n');
      }
    };

    const contextBlocks = [
      `## EMPRESA OBJETIVO: ${issuerName} (${ticker || 'sin ticker'})`,
      `Sector: ${sectorCategory || 'No especificado'}`,
      ``,
      `## DATOS RIX ACTUALES`,
      buildRixSummary(rixScores),
      ``,
      `## COMPETIDORES VERIFICADOS`,
      Array.isArray(verifiedCompetitors) && verifiedCompetitors.length > 0
        ? verifiedCompetitors.join(', ')
        : 'No hay competidores verificados definidos.',
      ``,
      competitorScores.length > 0 ? `## SCORES DE COMPETIDORES\n${buildRixSummary(competitorScores)}` : '',
      ``,
      `## DOCUMENTOS DEL VECTOR STORE (contexto cualitativo)`,
      vectorDocs.slice(0, 10).map(d => `- ${d.content?.slice(0, 300)}...`).join('\n') || 'Sin documentos relevantes.',
      ``,
      corporateNews.length > 0 
        ? `## NOTICIAS CORPORATIVAS RECIENTES\n${corporateNews.map(n => `- ${n.headline} (${n.published_date || 'fecha desconocida'})`).join('\n')}`
        : '',
      ``,
      custom_context ? `## CONTEXTO COMERCIAL ADICIONAL\n${custom_context}` : '',
    ].filter(Boolean).join('\n');

    // 8. Prepare messages for LLM
    const profileLabels: Record<string, string> = {
      ceo: 'CEO (Director General)',
      cmo: 'CMO (Director de Marketing)',
      dircom: 'DirCom (Director de Comunicación)',
      compliance: 'Compliance Officer',
    };

    const systemPrompt = SALES_SYSTEM_PROMPT.replace('{TARGET_PROFILE}', profileLabels[target_profile] || target_profile);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `CONTEXTO DE DATOS:\n\n${contextBlocks}` },
      ...conversation_history,
      { 
        role: 'user', 
        content: conversation_history.length === 0 
          ? `Genera una propuesta comercial completa para ${issuerName}, dirigida a su ${profileLabels[target_profile]}.`
          : conversation_history[conversation_history.length - 1]?.content || 'Continúa con la propuesta.'
      },
    ];

    // 9. Stream response from Gemini via Lovable AI Gateway
    const aiGatewayUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    
    const response = await fetch(aiGatewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro-preview-06-05',
        messages,
        max_tokens: 4000,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Sales Intelligence] AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    // 10. Return SSE stream
    const metadata = {
      company: issuerName,
      ticker,
      vectorDocsUsed: vectorDocs.length,
      rixRecordsUsed: rixScores.length,
      competitorsFound: verifiedCompetitors,
      sectorCategory,
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send metadata first
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', metadata })}\n\n`));

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  const content = data.choices?.[0]?.delta?.content;
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: content })}\n\n`));
                  }
                } catch (e) {
                  // Skip malformed JSON
                }
              }
            }
          }

          // Send done event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'done', 
            suggestedActions: [
              'Refinar tono comercial',
              'Formato email ejecutivo',
              'Añadir más datos de competidores',
              'Versión resumida (3 párrafos)',
            ]
          })}\n\n`));
          
          controller.close();
        } catch (error) {
          console.error('[Sales Intelligence] Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[Sales Intelligence] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
