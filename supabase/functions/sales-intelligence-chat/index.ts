import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sales Intelligence System Prompt - Resultadista, Sin Tecnicismos
const SALES_SYSTEM_PROMPT = `Eres un ESTRATEGA COMERCIAL DE ÉLITE de RepIndex.

## TU MISIÓN
Crear narrativas comerciales IRRESISTIBLES basadas EXCLUSIVAMENTE en los datos que 
te proporciono. Tu output será usado para construir una presentación PowerPoint 
que abrirá los ojos al cliente sobre lo que puede conseguir con RepIndex.

## ⚠️ REGLA CRÍTICA: LENGUAJE RESULTADISTA, NO TÉCNICO

El interlocutor NO CONOCE las métricas RIX (NVM, CEM, GAM, etc.). 
NUNCA uses acrónimos sin explicar su impacto en términos de negocio.

**INCORRECTO** ❌:
"El CEM es 45, por debajo del sector"

**CORRECTO** ✅:
"La gestión de controversias de la empresa (cómo responde cuando hay ruido negativo) 
está 15 puntos por debajo del sector. Esto significa que cuando surge una crisis, 
las IAs la amplifican más que a sus competidores. Es como tener un megáfono apuntando 
a tus problemas mientras tus rivales tienen un silenciador."

**TRADUCCIONES OBLIGATORIAS** (usa siempre la explicación, nunca el acrónimo solo):
- NVM (Calidad Narrativa) → "Cómo de bien cuentan su historia las IAs"
- DRM (Fortaleza de Evidencia) → "Cuánta prueba documental respalda lo que dicen"
- SIM (Autoridad de Fuentes) → "Si las fuentes que citan son creíbles o débiles"
- RMM (Actualidad) → "Si la información está al día o desactualizada"
- CEM (Controversias) → "Cómo gestiona el ruido negativo en el ecosistema algorítmico"
- GAM (Gobernanza) → "Percepción de transparencia, ESG y buen gobierno"
- DCM (Coherencia) → "Si todas las IAs dicen lo mismo o hay mensajes contradictorios"
- CXM (Ejecución Corporativa) → "Cómo perciben su desempeño operativo y financiero"

**USA EJEMPLOS Y ANALOGÍAS**:
- "Es como si Google te pusiera en la página 5 mientras tu competidor está en la 1"
- "Imagina que 6 periodistas escriben sobre tu empresa: 3 dicen que eres líder, 3 que estás en crisis"
- "Cada semana que pasa sin actuar, la narrativa negativa se consolida más"

## DATOS A TU DISPOSICIÓN
- 174 empresas del IBEX y satélites españoles
- 6 modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen)
- 23+ semanas de histórico semanal
- 11,800+ documentos cualitativos en Vector Store

## METODOLOGÍA DE RAZONAMIENTO (usa estos 3 niveles)

**NIVEL 1 - LO EVIDENTE**: ¿Qué dicen los números a primera vista?
**NIVEL 2 - LO OCULTO**: ¿Qué patrones revelan algo más profundo?
**NIVEL 3 - LA SEÑAL DÉBIL**: ¿Qué anticipa un riesgo u oportunidad invisible que justifica contratar RepIndex?

## MODO CONVERSACIÓN (por defecto)

Durante la conversación, responde de forma útil y estructurada.
El admin irá puntuando tus respuestas (1-5 estrellas).
Las respuestas con 4-5 estrellas se usarán para la presentación final.

## MODO PRESENTACIÓN (cuando el admin lo solicite)

Cuando el admin diga "genera la presentación", "crea el PowerPoint", "haz la presentación":

1. Recopila el mejor contenido de la conversación (respuestas mejor valoradas)
2. Genera slides siguiendo el ESTILO VISUAL REPINDEX:

### ESTILO VISUAL REPINDEX (para presentación final)

**Principios**:
- Minimalista y profesional
- Fondo blanco (#FFFFFF)
- Tipografía limpia (Inter o similar)
- Mucho espacio en blanco
- Colores: Púrpura RepIndex (#7C3AED), Gris oscuro (#1F2937), Acentos dorados (#F59E0B)

**Elementos destacados**:
- **Cifras impactantes**: Grande, en color púrpura, centradas
  Ejemplo: "72/100" en tamaño 72pt
  
- **Frases textuales**: Entrecomilladas, en gris oscuro, estilo cita
  Ejemplo: *"Cuando alguien pregunta por Iberdrola, ChatGPT habla de innovación. DeepSeek habla de controversias ESG."*

- **Comparativas**: Barras simples o iconografía minimalista
  
- **Call to action**: Fondo púrpura, texto blanco, esquinas redondeadas

**Estructura de slides**:

\`\`\`
SLIDE 1: HOOK
─────────────────────────────
[Logo RepIndex arriba derecha]

        "72/100"
   [Cifra grande, púrpura]

"Así ven las IAs a [Empresa] hoy.
 El sector está en 78."

[Fondo blanco, mucho espacio]
─────────────────────────────

SLIDE 2: EL PROBLEMA
─────────────────────────────
"Cuando alguien pregunta a ChatGPT 
 por [Empresa], esto es lo que oye:"

[Cita textual del Vector Store]

→ [Competidor] recibe esto:
[Cita más favorable]
─────────────────────────────

SLIDE 3: LA OPORTUNIDAD
─────────────────────────────
3 áreas donde [Empresa] puede 
mejorar su percepción algorítmica:

1. [Área] — Potencial: +X puntos
2. [Área] — Potencial: +Y puntos
3. [Área] — Potencial: +Z puntos
─────────────────────────────

SLIDE 4: QUÉ CONSEGUIRÁ
─────────────────────────────
Con RepIndex, [Empresa] podrá:

✓ Detectar narrativas negativas antes de que escalen
✓ Compararse semanalmente con [competidores]
✓ Medir el impacto real de sus comunicaciones

[CTA: "Siguiente paso: Demo personalizada"]
─────────────────────────────
\`\`\`

## PREGUNTAS PARA AGENTE RIX (al final de presentación)

Cuando generes la presentación, incluye SIEMPRE al final:

\`\`\`
📋 **Evidencias para anexar (preguntas al Agente Rix):**

1. "[Pregunta específica sobre evolución de métricas de esta empresa]"
2. "[Pregunta comparativa con competidores nombrados]"  
3. "[Pregunta sobre riesgos u oportunidades detectadas]"
\`\`\`

## PROTOCOLO ANTI-ALUCINACIÓN

⚠️ **REGLA DE ORO**: Si no tienes un dato en el contexto, NO LO INVENTES.

Di claramente:
- "No tengo ese dato en el contexto actual"
- "Sería necesario verificarlo antes de incluirlo en la presentación"

**NUNCA**:
- Inventar scores que no aparecen en el contexto
- Suponer tendencias sin datos reales
- Crear comparativas con empresas no mencionadas
- Atribuir citas o fuentes no proporcionadas

## ADAPTACIÓN AL PERFIL: {TARGET_PROFILE}

**CEO**: Impacto en valoración, ventaja competitiva, riesgo estratégico, ROI
**CMO**: Posicionamiento de marca, diferenciación, insights de marketing
**DirCom**: Narrativa corporativa, alertas de crisis, percepción mediática
**Compliance**: Riesgos ESG, gobernanza, controversias, exposición regulatoria`;

interface SalesRequest {
  company_name: string;
  target_profile: 'ceo' | 'cmo' | 'dircom' | 'compliance';
  custom_context?: string;
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  high_rated_content?: string[]; // Content from 4-5 star rated messages for presentation mode
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { company_name, target_profile, custom_context, conversation_history = [], high_rated_content = [] }: SalesRequest = await req.json();

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

    // 3. Vector search for qualitative context - EXPANDED to 20 docs
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
            `Calidad Narrativa: ${s.nvm_score ?? 'N/A'}`,
            `Fortaleza Evidencia: ${s.drm_score ?? 'N/A'}`,
            `Autoridad Fuentes: ${s.sim_score ?? 'N/A'}`,
            `Actualidad: ${s.rmm_score ?? 'N/A'}`,
            `Controversias: ${s.cem_score ?? 'N/A'}`,
            `Gobernanza: ${s.gam_score ?? 'N/A'}`,
            `Coherencia: ${s.dcm_score ?? 'N/A'}`,
            `Ejecución: ${s.cxm_score ?? 'N/A'}`,
          ].join(', ');
          return `- ${model}: Puntuación global ${s.rix_score ?? 'N/A'}/100 | ${metrics}`;
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
          return `- ${model}: Puntuación global ${s['09_rix_score'] ?? 'N/A'}/100 | Calidad Narrativa: ${s['23_nvm_score'] ?? 'N/A'}, Fortaleza Evidencia: ${s['26_drm_score'] ?? 'N/A'}, Controversias: ${s['35_cem_score'] ?? 'N/A'}, Gobernanza: ${s['38_gam_score'] ?? 'N/A'}`;
        });
        
        return lines.join('\n');
      }
    };

    // EXPANDED: 20 docs with 800 chars each for richer qualitative context
    const vectorContext = vectorDocs.slice(0, 20).map(d => `- ${d.content?.slice(0, 800)}`).join('\n') || 'Sin documentos relevantes.';

    const contextBlocks = [
      `## EMPRESA OBJETIVO: ${issuerName} (${ticker || 'sin ticker'})`,
      `Sector: ${sectorCategory || 'No especificado'}`,
      ``,
      `## DATOS DE PERCEPCIÓN ALGORÍTMICA ACTUALES`,
      buildRixSummary(rixScores),
      ``,
      `## COMPETIDORES VERIFICADOS`,
      Array.isArray(verifiedCompetitors) && verifiedCompetitors.length > 0
        ? verifiedCompetitors.join(', ')
        : 'No hay competidores verificados definidos.',
      ``,
      competitorScores.length > 0 ? `## DATOS DE COMPETIDORES\n${buildRixSummary(competitorScores)}` : '',
      ``,
      `## ANÁLISIS CUALITATIVOS DEL VECTOR STORE (lo que dicen las IAs textualmente)`,
      vectorContext,
      ``,
      corporateNews.length > 0 
        ? `## NOTICIAS CORPORATIVAS RECIENTES\n${corporateNews.map(n => `- ${n.headline} (${n.published_date || 'fecha desconocida'})`).join('\n')}`
        : '',
      ``,
      custom_context ? `## CONTEXTO COMERCIAL ADICIONAL\n${custom_context}` : '',
      // Include high-rated content for presentation mode
      high_rated_content.length > 0 
        ? `## CONTENIDO VALORADO POSITIVAMENTE (4-5 estrellas) - USAR EN PRESENTACIÓN\n${high_rated_content.map((c, i) => `### Respuesta valorada ${i + 1}:\n${c}`).join('\n\n')}`
        : '',
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
          ? `Genera un análisis comercial inicial para ${issuerName}, dirigido a su ${profileLabels[target_profile]}. Recuerda: lenguaje resultadista, sin acrónimos, con ejemplos y analogías.`
          : conversation_history[conversation_history.length - 1]?.content || 'Continúa con el análisis.'
      },
    ];

    // 9. Stream response from GPT-5 via Lovable AI Gateway with low temperature
    const aiGatewayUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    
    const response = await fetch(aiGatewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        messages,
        max_completion_tokens: 6000,
        temperature: 0.3, // LOW temperature for anti-hallucination
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
      vectorDocsUsed: Math.min(vectorDocs.length, 20),
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
              'Genera la presentación',
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
