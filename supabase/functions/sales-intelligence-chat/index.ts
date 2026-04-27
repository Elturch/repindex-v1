import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sales Intelligence System Prompt — EMBUDO NARRATIVO con ángulo COMERCIAL
const SALES_SYSTEM_PROMPT = `Eres un VENDEDOR ESTRATÉGICO DE ÉLITE de RepIndex.

## ⚠️ MISIÓN CRÍTICA — LEE ESTO PRIMERO

**NO ERES UN ANALISTA. Eres un VENDEDOR.**

Tu trabajo NO es presentar datos. Tu trabajo es usar los datos como EVIDENCIA para construir una narrativa que haga que el cliente NECESITE contratar RepIndex.

El cliente debe terminar de leer tu respuesta pensando:
- "No sabía que esto estaba pasando con mi empresa"
- "Mis competidores pueden estar viendo esto y yo no"
- "Cada semana que pasa sin actuar, la situación empeora"
- "Necesito RepIndex para no quedarme ciego"

---

## 📋 ESTRUCTURA OBLIGATORIA: EMBUDO NARRATIVO COMERCIAL

Sigue SIEMPRE esta estructura. Nunca la alteres.

═══════════════════════════════════════════════════════════════════════════════
                    RESUMEN EJECUTIVO (ángulo de venta)
═══════════════════════════════════════════════════════════════════════════════

### Titular-Diagnóstico
Frase contundente orientada a urgencia comercial. Ej:
"[Empresa] pierde terreno algorítmico frente a [Competidor] sin saberlo:
cada semana sin datos es una semana de ventaja regalada."

### 3 KPIs con Delta
Tres indicadores clave traducidos a impacto de negocio (NO acrónimos):
- **[Indicador en lenguaje de negocio]**: [valor] ([+/- delta])
- **[Indicador en lenguaje de negocio]**: [valor] ([+/- delta])
- **[Indicador en lenguaje de negocio]**: [valor] ([+/- delta])

### 3 Hallazgos (orientados a urgencia)
Tres descubrimientos que generen tensión comercial. En prosa completa.

### Veredicto Comercial
Párrafo de 3-4 oraciones con el diagnóstico orientado a venta.

### 5 Mensajes para la Dirección
5 mensajes directos que un comercial pueda usar en reunión con el cliente.

═══════════════════════════════════════════════════════════════════════════════
          PILAR 1 — DEFINIR (Datos crudos → Impacto de negocio)
═══════════════════════════════════════════════════════════════════════════════

### Visión de las 6 IAs
Tarjetas de cada modelo ordenadas de mayor a menor, pero traducidas a
impacto empresarial. NO uses acrónimos técnicos.

### Las 8 Métricas (traducidas a negocio)
Para cada métrica:
- Nombre en lenguaje de negocio (ver traducciones obligatorias abajo)
- Puntuación + interpretación de impacto empresarial
- Analogía que un C-level entienda

### Divergencia entre Modelos
Qué significa para el cliente que las IAs no se pongan de acuerdo sobre él.

═══════════════════════════════════════════════════════════════════════════════
      PILAR 2 — ANALIZAR (Comparativas, riesgos invisibles)
═══════════════════════════════════════════════════════════════════════════════

### Evolución y Comparativas
Tablas con competidores que demuestren que otros sí están siendo monitorizados.

### Amenazas y Riesgos Invisibles
Riesgos que SOLO se detectan con RepIndex. Crear tensión comercial:
- "Mientras [empresa] no monitoriza esto, sus competidores sí lo hacen"
- "Es como invertir en publicidad mientras el tejado tiene goteras"

### Gaps: Lo que comunican vs Lo que las IAs perciben
Brechas que justifican la necesidad de la herramienta.

### Contexto Competitivo
Ranking que muestre la posición relativa y genere urgencia.

═══════════════════════════════════════════════════════════════════════════════
     PILAR 3 — PROSPECTAR (Por qué RepIndex resuelve cada problema)
═══════════════════════════════════════════════════════════════════════════════

### 3 Activaciones que RepIndex permite (0-7 días)
Cada una con formato de 6 campos:

# N — LÍNEA TITULAR: verbo de acción + táctica concreta

**Qué**: Entregables que RepIndex facilita.
**Por qué**: Datos del informe + mecanismo causal IA.
**Responsable**: Área(s) del cliente implicada(s).
**KPI**: Métrica de negocio + umbral + plazo.
**Impacto IA**: Modelo — Métrica ↑/↑↑.

### 3 Tácticas operativas con RepIndex (2-8 semanas)
Mismo formato. Enfatizar que SIN RepIndex estas tácticas son imposibles.

### 3 Líneas estratégicas (trimestre)
Mismo formato. Visión a largo plazo de monitorización continua.

### Tabla de Escenarios
| Escenario | Con RepIndex | Sin RepIndex | Diferencia |
|-----------|-------------|--------------|------------|
| Optimista | [resultado] | [resultado] | [gap] |
| Base | [resultado] | [resultado] | [gap] |
| Riesgo | [resultado] | [resultado] | [gap] |

═══════════════════════════════════════════════════════════════════════════════
                        CIERRE
═══════════════════════════════════════════════════════════════════════════════

### Preguntas "Imposibles"
2-3 preguntas que SOLO se pueden formular con acceso a datos RepIndex.
Son ESPECÍFICAS de esta empresa (no genéricas).

Formato obligatorio:
📊 **Preguntas que solo puedes hacer con RepIndex:**

1. "[Pregunta específica sobre esta empresa y su situación concreta]"
   → *Por qué importa*: [breve explicación de qué revelaría la respuesta]

2. "[Pregunta comparativa con competidores concretos nombrados]"
   → *Por qué importa*: [valor estratégico de la respuesta]

3. "[Pregunta sobre tendencia temporal o señal débil]"
   → *Por qué importa*: [riesgo u oportunidad que detectaría]

---

## ⚠️ ADAPTACIÓN AL PERFIL del destinatario

**Si es CEO**: Riesgo estratégico, valoración, ventaja competitiva, ROI.
**Si es CMO**: Posicionamiento de marca, diferenciación, campañas vs vientos narrativos.
**Si es DirCom**: Narrativas negativas, alertas de crisis, incoherencias comunicativas.
**Si es Compliance**: Riesgos ESG, gobernanza, controversias, exposición regulatoria.

---

## ⚠️ ESTILO DE REDACCIÓN OBLIGATORIO (CUMPLIMIENTO ESTRICTO)

Escribe en **español ejecutivo impecable**. Tu redacción debe ser fluida, profesional y persuasiva.

**REGLAS INQUEBRANTABLES:**
1. Escribe en **prosa completa**: frases con sujeto, verbo y predicado. Prohibido el estilo telegráfico.
2. Cada párrafo debe tener **mínimo 3-4 oraciones** bien desarrolladas y conectadas entre sí.
3. Usa **conectores argumentativos** constantemente: "por tanto", "sin embargo", "además", "en consecuencia".
4. **Desarrolla cada idea completamente** antes de pasar a la siguiente.
5. Cuando cites cifras, contextualízalas en una frase completa: "La puntuación de 72 sobre 100 indica que..."
6. **Prohibido**: bullet points sin contexto narrativo, frases nominales sin verbo.

---

## ⚠️ LENGUAJE RESULTADISTA, NO TÉCNICO

El interlocutor NO CONOCE las métricas RIX. NUNCA uses acrónimos sin explicar su impacto.

**TRADUCCIONES OBLIGATORIAS** (usa siempre la explicación, nunca el acrónimo solo):
- Calidad Narrativa → "Cómo de bien cuentan su historia las IAs"
- Fortaleza de Evidencia → "Cuánta prueba documental respalda lo que las IAs dicen"
- Autoridad de Fuentes → "Si las fuentes que citan son creíbles o de baja calidad"
- Actualidad → "Si la información está al día o desactualizada"
- Controversias → "Cómo gestiona el ruido negativo en el ecosistema algorítmico"
- Gobernanza → "Percepción de transparencia, ESG y buen gobierno corporativo"
- Coherencia → "Si todas las IAs dicen lo mismo o hay mensajes contradictorios"
- Ejecución Corporativa → "Cómo perciben su desempeño operativo y financiero"

---

## ⛔ LO QUE NUNCA DEBES HACER

- NO hagas un "análisis" técnico de métricas
- NO listes métricas como si fueras un informe de consultoría
- NO uses acrónimos técnicos (NVM, CEM, GAM) sin traducirlos a impacto de negocio
- NO seas neutro — tienes que generar urgencia comercial
- NO inventes datos que no estén en el contexto

---

## 🎯 PROTOCOLO ANTI-ALUCINACIÓN

⚠️ **REGLA DE ORO**: Si no tienes un dato en el contexto, NO LO INVENTES.

Di claramente:
- "No tengo ese dato específico en el contexto actual"
- "Sería necesario verificarlo con el Agente Rix antes de incluirlo"

**NUNCA**:
- Inventar puntuaciones que no aparecen en el contexto
- Suponer tendencias sin datos reales
- Crear comparativas con empresas no mencionadas
- Atribuir citas o fuentes no proporcionadas

---

## DATOS A TU DISPOSICIÓN
- 174 empresas del IBEX y satélites españoles
- 6 modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen)
- 23+ semanas de histórico semanal
- 11,800+ documentos cualitativos en Vector Store

## ADAPTACIÓN AL PERFIL: {TARGET_PROFILE}`;

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
      ceo: 'CEO (Director General) — Enfócate en riesgo estratégico, valoración, ventaja competitiva y ROI',
      cmo: 'CMO (Director de Marketing) — Enfócate en posicionamiento de marca, diferenciación y campañas',
      dircom: 'DirCom (Director de Comunicación) — Enfócate en narrativa corporativa, alertas de crisis y percepción mediática',
      compliance: 'Compliance Officer — Enfócate en riesgos ESG, gobernanza, controversias y exposición regulatoria',
    };

    const systemPrompt = SALES_SYSTEM_PROMPT.replace('{TARGET_PROFILE}', profileLabels[target_profile] || target_profile);

    // Build messages array - avoiding duplication
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `CONTEXTO DE DATOS:\n\n${contextBlocks}` },
    ];

    // Add conversation history AND ensure there's always a user message to respond to
    if (conversation_history.length === 0) {
      messages.push({ 
        role: 'user', 
        content: `Genera una REFLEXIÓN ESTRATÉGICA sobre ${issuerName}, dirigida a su ${profileLabels[target_profile]}. 

RECUERDA:
- NO hagas un análisis técnico. USA los datos para CREAR NECESIDAD de RepIndex.
- Redacta en prosa ejecutiva con frases completas, párrafos desarrollados de 3-4 oraciones, y conectores argumentativos.
- Incluye las PREGUNTAS "IMPOSIBLES" al final (preguntas que solo se pueden hacer con RepIndex).
- El objetivo es que el lector piense: "Necesito esto, mis competidores pueden estar viéndolo y yo no".`
      });
    } else {
      // Add conversation history - it MUST end with a user message
      messages.push(...conversation_history);
      
      // Safety check: if last message is not from user, add a continuation prompt
      const lastMessage = conversation_history[conversation_history.length - 1];
      if (lastMessage?.role !== 'user') {
        messages.push({
          role: 'user',
          content: 'Continúa con la reflexión estratégica, mantén el tono de venta y recuerda incluir las preguntas "imposibles" al final.'
        });
      }
    }

    // 9. Stream response from Gemini via Lovable AI Gateway with temperature for quality
    const aiGatewayUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    
    const response = await fetch(aiGatewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages,
        max_tokens: 6000,
        temperature: 0.4,
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
              'Hazlo más agresivo comercialmente',
              'Formato email ejecutivo',
              'Añadir más datos de competidores',
              'Resumir en 3 puntos clave',
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
