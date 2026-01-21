import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prompt genérico para la mayoría de modelos
const buildSearchPrompt = (issuerName: string, ticker: string, dateFrom: string, dateTo: string): string => `
Eres ANALISTA DE REPUTACIÓN CORPORATIVA. 
Objetivo: localizar TODAS las menciones que puedan impactar la reputación de ${issuerName} (${ticker}) en España durante la ventana: from ${dateFrom} to ${dateTo}.

INSTRUCCIONES ESTRICTAS:

Fuentes obligatorias:
• Prensa económica Tier-1 (Expansión, Cinco Días, El Economista, Reuters, Bloomberg, FT, WSJ)
• Reguladores (CNMV, BME, SEC si aplica)
• Redes sociales abiertas (X/Twitter, Instagram, LinkedIn, TikTok, Reddit, Forocoches, Rankia)
• Blogs sectoriales o foros especializados (Tier-3)

Requiere al menos 5 citas fechadas <7 días, incluyendo URL y hora.

Si no hallas menciones en prensa/regulador, intensifica búsqueda social (mín. 3 posts relevantes).

EXCLUYE citas anteriores a ${dateFrom} salvo que expliquen una tendencia actual (máx. 1 párrafo "Contexto").

Devuelve JSON con campos:
• "menciones": array de objetos {fecha, fuente, tier, titular, url, resumen_impacto, sentimiento(-1..+1)}
• "sinshallazgo": "No" | "Sí" (si ninguna mención <7 días)
• "nota_metodologica": aclaraciones sobre límites o incertidumbre.

Responde en Español. No añadas texto fuera del JSON.
`;

// Prompt optimizado para Perplexity - diseñado para obtener más menciones
const buildPerplexityPrompt = (issuerName: string, ticker: string): string => `Actúa como ANALISTA DE REPUTACIÓN CORPORATIVA especializado en monitorizar marcas en Internet.

OBJETIVO: localizar el máximo número posible de menciones relevantes sobre la reputación de ${issuerName} (${ticker}) en España durante los ÚLTIMOS 7 DÍAS, contados hacia atrás desde la fecha de esta consulta.

INSTRUCCIONES CLAVE:
- Da prioridad absoluta al CRITERIO TEMPORAL: solo debes incluir menciones ocurridas en aproximadamente los últimos 7 días. Si no estás seguro de la fecha exacta, incluye solo aquellas que parezcan claramente recientes (últimos días) y explícalo en "nota_metodologica".
- Considera cualquier tipo de fuente pública donde un usuario razonable pudiera hablar sobre la marca: prensa, blogs, foros, redes sociales, reseñas, noticias breves, hilos de discusión, etc. No te limites solo a medios Tier-1 o reguladores si eso reduce mucho el número de resultados.
- Usa como fuentes recomendadas (cuando tengas contexto suficiente):
  - Prensa económica y general (por ejemplo: Expansión, Cinco Días, El Economista, Reuters, Bloomberg, FT, WSJ, prensa nacional y regional española).
  - Reguladores (CNMV, BME, SEC, u otros cuando sean relevantes para la marca).
  - Redes sociales abiertas (X/Twitter, Instagram, LinkedIn, TikTok, Reddit, Forocoches, Rankia, foros similares).
  - Blogs sectoriales, portales especializados, foros de usuarios, reseñas de clientes, comparadores, etc.
- Debes intentar recoger TODAS las menciones relevantes que puedas dentro del límite de espacio de la respuesta, priorizando:
  1) Impacto reputacional claro (críticas, quejas, escándalos, investigaciones, fallos de servicio, campañas polémicas, etc.).
  2) Noticias de negocio que puedan influir en la percepción (resultados, operaciones corporativas, cambios en precios, sanciones, litigios, reconocimientos, premios, innovaciones destacadas, etc.).
  3) Opiniones de usuarios o comunidades con tono muy negativo o muy positivo.
- Procura llegar hasta 15–20 menciones si el espacio lo permite. Si no hay tantas, devuelve todas las que encuentres, aunque solo sean pocas. Si hay más de las que caben, selecciona las que tengan mayor impacto reputacional (positivo o negativo) y explica la limitación en "nota_metodologica".

VENTANA TEMPORAL:
- Limítate a aproximadamente los últimos 7 días. No incluyas menciones claramente anteriores, salvo que sean necesarias para explicar un contexto de tendencia que sigue activo ahora (en ese caso, marca ese contexto en un único objeto adicional o coméntalo en "nota_metodologica").

SALIDA (MUY IMPORTANTE):
- Devuelve SIEMPRE un JSON VÁLIDO con esta estructura exacta y sin ningún texto adicional antes o después:

{
  "menciones": [
    {
      "fecha": "YYYY-MM-DDThh:mm:ssZ (si no sabes la hora exacta, pon solo una hora aproximada)",
      "fuente": "Nombre corto de la fuente o plataforma (por ejemplo: Expansión, Reddit, X/Twitter, CNMV, Trustpilot, etc.)",
      "tier": "Describe de forma simple el tipo de fuente (por ejemplo: 'Prensa económica', 'Prensa general', 'Regulador', 'Red social', 'Foro especializado', 'Blog', 'Reseñas de clientes', etc.)",
      "titular": "Título breve o descripción corta de la mención",
      "url": "URL o identificador más cercano posible (si no dispones de una URL concreta, indícalo claramente)",
      "resumen_impacto": "2–3 frases explicando qué se dice sobre la marca y por qué puede afectar a su reputación (positiva o negativamente)",
      "sentimiento": "Número entre -1 y +1 que refleje el tono global de la mención: muy negativo ≈ -1, neutro ≈ 0, muy positivo ≈ +1"
    }
  ],
  "sinshallazgo": "\"No\" si has encontrado al menos una mención mínimamente relevante en los últimos 7 días; en caso contrario \"Sí\"",
  "nota_metodologica": "Explica brevemente las limitaciones de la búsqueda: si la fecha es aproximada, si las URLs son genéricas, si sólo has podido aportar ejemplos representativos en vez de una lista exhaustiva, etc."
}

REGLAS ADICIONALES:
- No inventes hechos concretos sobre la marca que no sean razonablemente plausibles dentro del marco de los últimos 7 días.
- Si no estás seguro de algún dato (fecha exacta, hora, URL concreta), utiliza valores aproximados y descríbelo en "nota_metodologica".
- Si encuentras al menos 1 mención, establece siempre "sinshallazgo":"No" y céntrate en explicar las limitaciones de cobertura en vez de devolver un array vacío.
- Escribe siempre en Español de España.`;

// 7 modelos con acceso real a Internet - ahora con display name para guardar en 02_model_name
interface SearchModelConfig {
  name: string;
  displayName: string;
  apiKeyEnv: string;
  endpoint: string;
  buildRequest: (prompt: string, apiKey: string) => { headers: Record<string, string>; body: object };
  parseResponse: (data: any) => string;
  dbColumn: string;
}

const getSearchModelConfigs = (): SearchModelConfig[] => [
  // 1. Perplexity Sonar Pro - Funciona ✅
  {
    name: 'perplexity-sonar-pro',
    displayName: 'Perplexity',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    dbColumn: '21_res_perplex_bruto',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4000,
        search_recency_filter: 'week',
        return_citations: true,
      },
    }),
    parseResponse: (data: any) => {
      const content = data.choices?.[0]?.message?.content || '';
      const citations = data.citations?.join('\n') || '';
      return content + (citations ? '\n\nFuentes:\n' + citations : '');
    },
  },
  // 2. Grok 3 (xAI) - Funciona ✅
  {
    name: 'grok-3',
    displayName: 'Grok',
    apiKeyEnv: 'XAI_API_KEY',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    dbColumn: 'respuesta_bruto_grok',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'grok-3',
        messages: [
          { role: 'system', content: 'Eres analista de reputación corporativa con acceso a X/Twitter y web. Incluye siempre URLs y fechas. Responde en español.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      },
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  // 3. DeepSeek - Funciona ✅
  {
    name: 'deepseek-chat',
    displayName: 'Deepseek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    endpoint: 'https://api.deepseek.com/chat/completions',
    dbColumn: '23_res_deepseek_bruto',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Eres analista de reputación corporativa. Busca exhaustivamente en web. Incluye URLs y fechas. Responde en español.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      },
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  // 4. GPT-4.1 mini (OpenAI) - Con web search
  {
    name: 'gpt-4.1-mini',
    displayName: 'ChatGPT',
    apiKeyEnv: 'OPENAI_API_KEY',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    dbColumn: '20_res_gpt_bruto',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: 'Eres analista de reputación corporativa. Busca en Internet y proporciona URLs y fechas. Responde en español.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      },
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  // 5. Gemini 2.5 Pro (Google) - Con Google Search grounding
  {
    name: 'gemini-2.5-pro',
    displayName: 'Google Gemini',
    apiKeyEnv: 'GOOGLE_GEMINI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    dbColumn: '22_res_gemini_bruto',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8000,
        },
      },
    }),
    parseResponse: (data: any) => {
      // Detectar bloqueos de seguridad
      if (data.promptFeedback?.blockReason) {
        console.error(`[Gemini] Prompt bloqueado: ${data.promptFeedback.blockReason}`);
        return `[ERROR: Prompt bloqueado - ${data.promptFeedback.blockReason}]`;
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
      let sources = '';
      if (groundingMetadata?.groundingChunks) {
        sources = '\n\nFuentes:\n' + groundingMetadata.groundingChunks
          .filter((c: any) => c.web?.uri)
          .map((c: any) => `- ${c.web.title || 'Fuente'}: ${c.web.uri}`)
          .join('\n');
      }
      return text + sources;
    },
  },
  // 6. Claude Opus 4.1 (Anthropic) - Con web search beta
  {
    name: 'claude-opus',
    displayName: 'Claude',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    endpoint: 'https://api.anthropic.com/v1/messages',
    dbColumn: 'respuesta_bruto_claude',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'Content-Type': 'application/json',
      },
      body: {
        model: 'claude-opus-4-20250514',
        max_tokens: 8192,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 10,
        }],
        messages: [{ role: 'user', content: prompt }],
      },
    }),
    parseResponse: (data: any) => {
      if (!data.content) return '';
      
      let textContent = '';
      const sources: string[] = [];
      
      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text + '\n';
          // Extraer citas inline del bloque de texto
          if (block.citations && Array.isArray(block.citations)) {
            for (const citation of block.citations) {
              if (citation.url) {
                sources.push(`- ${citation.title || 'Fuente'}: ${citation.url}`);
              }
            }
          }
        }
      }
      
      // Añadir fuentes únicas al final
      const uniqueSources = [...new Set(sources)];
      if (uniqueSources.length > 0) {
        textContent += '\n\nFuentes encontradas:\n' + uniqueSources.join('\n');
      }
      
      return textContent.trim();
    },
  },
  // 7. Qwen Max (Alibaba DashScope) - Con enable_search
  {
    name: 'qwen-max',
    displayName: 'Qwen',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    endpoint: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    dbColumn: 'respuesta_bruto_qwen',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'qwen-max',
        input: {
          messages: [
            { role: 'system', content: 'Eres analista de reputación corporativa. Busca en Internet y proporciona URLs y fechas. Responde en español.' },
            { role: 'user', content: prompt }
          ],
        },
        parameters: {
          enable_search: true,
          result_format: 'message',
        },
      },
    }),
    parseResponse: (data: any) => {
      const content = data.output?.choices?.[0]?.message?.content || '';
      const searchResults = data.output?.search_info?.search_results;
      let sources = '';
      if (searchResults?.length) {
        sources = '\n\nFuentes:\n' + searchResults
          .map((s: any) => `[${s.index}]: ${s.title}`)
          .join('\n');
      }
      return content + sources;
    },
  },
];

async function callSearchModel(
  config: SearchModelConfig, 
  prompt: string
): Promise<{ success: boolean; response?: string; error?: string; timeMs: number }> {
  const startTime = Date.now();
  
  try {
    const apiKey = Deno.env.get(config.apiKeyEnv);
    if (!apiKey) {
      console.log(`[rix-search-v2] Missing ${config.apiKeyEnv} for ${config.displayName}`);
      return { success: false, error: `Missing ${config.apiKeyEnv}`, timeMs: Date.now() - startTime };
    }

    console.log(`[rix-search-v2] Calling ${config.displayName}...`);

    const { headers, body } = config.buildRequest(prompt, apiKey);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[rix-search-v2] ${config.displayName} error:`, response.status, errorText.substring(0, 500));
      return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`, timeMs: Date.now() - startTime };
    }

    const data = await response.json();
    const content = config.parseResponse(data);
    
    if (!content) {
      console.log(`[rix-search-v2] ${config.displayName} returned empty response`);
      return { success: false, error: 'Empty response', timeMs: Date.now() - startTime };
    }

    console.log(`[rix-search-v2] ${config.displayName} returned ${content.length} chars in ${Date.now() - startTime}ms`);
    return { success: true, response: content, timeMs: Date.now() - startTime };

  } catch (error) {
    console.error(`[rix-search-v2] ${config.displayName} exception:`, error);
    return { success: false, error: error.message, timeMs: Date.now() - startTime };
  }
}

// Helper function to trigger Phase 2 analysis after insert (fire-and-forget)
async function triggerAnalysis(recordId: string, supabaseUrl: string, serviceKey: string): Promise<void> {
  try {
    console.log(`[rix-search-v2] Triggering Phase 2 analysis for record: ${recordId}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/rix-analyze-v2`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ record_id: recordId }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[rix-search-v2] Phase 2 failed for ${recordId}:`, errorText.substring(0, 200));
    } else {
      const result = await response.json();
      console.log(`[rix-search-v2] Phase 2 completed for ${recordId}: RIX=${result.rix_score || 'N/A'}`);
    }
  } catch (error: any) {
    console.error(`[rix-search-v2] Phase 2 error for ${recordId}:`, error.message);
  }
}

// Declare EdgeRuntime for background tasks (Deno edge runtime)
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, issuer_name } = await req.json();

    if (!ticker || !issuer_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: ticker, issuer_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rix-search-v2] Starting search for ${issuer_name} (${ticker}) with 7 models - 1 row per model architecture`);
    const startTime = Date.now();

    // Calculate date range (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateFrom = weekAgo.toISOString().split('T')[0];
    const dateTo = now.toISOString().split('T')[0];

    // Build prompts - Perplexity uses optimized prompt, others use generic
    const genericPrompt = buildSearchPrompt(issuer_name, ticker, dateFrom, dateTo);
    const perplexityPrompt = buildPerplexityPrompt(issuer_name, ticker);

    // Get all 7 search-capable models
    const modelConfigs = getSearchModelConfigs();

    // Call all search models in parallel - use appropriate prompt per model
    const results = await Promise.allSettled(
      modelConfigs.map(config => {
        const prompt = config.name === 'perplexity-sonar-pro' ? perplexityPrompt : genericPrompt;
        return callSearchModel(config, prompt);
      })
    );

    // Process results
    const modelResults: Record<string, { success: boolean; response?: string; error?: string; timeMs: number; config: SearchModelConfig }> = {};
    
    results.forEach((result, index) => {
      const config = modelConfigs[index];
      if (result.status === 'fulfilled') {
        modelResults[config.name] = { ...result.value, config };
      } else {
        modelResults[config.name] = { 
          success: false, 
          error: result.reason?.message || 'Unknown error',
          timeMs: 0,
          config,
        };
      }
    });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate batch date (Sunday of current week)
    const dayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    // NEW ARCHITECTURE: Create 7 independent rows, one per model
    const insertedRecords: { id: string; model_name: string; success: boolean; error?: string }[] = [];
    const modelErrors: Record<string, string> = {};

    for (const [modelName, result] of Object.entries(modelResults)) {
      const config = result.config;
      
      // Only create row if we have a response (success or not, we track errors)
      const hasResponse = result.success && result.response;
      
      if (!hasResponse && result.error) {
        modelErrors[modelName] = result.error;
      }

      // Prepare row data - each row has only ONE response column populated
      const insertData: Record<string, any> = {
        '02_model_name': config.displayName,  // Use displayName for compatibility with rix_runs
        '03_target_name': issuer_name,
        '04_target_type': 'company',
        '05_ticker': ticker,
        '06_period_from': dateFrom,
        '07_period_to': dateTo,
        '08_tz': 'Europe/Madrid',
        'batch_execution_date': sunday.toISOString(),
        'source_pipeline': 'lovable_v2',
        'execution_time_ms': result.timeMs,
        'search_completed_at': new Date().toISOString(),
        // Only this model's column gets populated
        [config.dbColumn]: result.response || null,
        // Track individual model error if any
        'model_errors': result.error ? { [modelName]: result.error } : null,
      };

      try {
        const { data: insertedRecord, error: insertError } = await supabase
          .from('rix_runs_v2')
          .insert(insertData)
          .select('id')
          .single();

        if (insertError) {
          console.error(`[rix-search-v2] Insert error for ${config.displayName}:`, insertError);
          insertedRecords.push({
            id: '',
            model_name: config.displayName,
            success: false,
            error: insertError.message,
          });
        } else {
          console.log(`[rix-search-v2] Created row for ${config.displayName}: ${insertedRecord.id}`);
          insertedRecords.push({
            id: insertedRecord.id,
            model_name: config.displayName,
            success: true,
          });
          
          // PHASE 2 AUTOMATION: Trigger analysis immediately after successful insert
          // Using fire-and-forget pattern with EdgeRuntime.waitUntil for background execution
          if (hasResponse && insertedRecord.id) {
            try {
              EdgeRuntime.waitUntil(
                triggerAnalysis(insertedRecord.id, supabaseUrl, supabaseServiceKey)
              );
              console.log(`[rix-search-v2] Phase 2 queued for ${config.displayName}`);
            } catch (waitUntilError) {
              // Fallback: if EdgeRuntime.waitUntil is not available, fire without waiting
              console.log(`[rix-search-v2] EdgeRuntime.waitUntil not available, using fallback for ${config.displayName}`);
              triggerAnalysis(insertedRecord.id, supabaseUrl, supabaseServiceKey);
            }
          }
        }
      } catch (err: any) {
        console.error(`[rix-search-v2] Exception inserting ${config.displayName}:`, err);
        insertedRecords.push({
          id: '',
          model_name: config.displayName,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = Object.values(modelResults).filter(r => r.success).length;
    const totalModels = modelConfigs.length;
    const totalTime = Date.now() - startTime;
    const insertedIds = insertedRecords.filter(r => r.success && r.id).map(r => r.id);

    console.log(`[rix-search-v2] Search completed: ${successCount}/${totalModels} models succeeded, ${insertedIds.length} rows created in ${totalTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        // Return array of IDs for Phase 2 batch analysis
        record_ids: insertedIds,
        records_created: insertedIds.length,
        // Summary
        issuer_name,
        ticker,
        date_range: { from: dateFrom, to: dateTo },
        models_called: totalModels,
        models_succeeded: successCount,
        models_failed: totalModels - successCount,
        total_time_ms: totalTime,
        // Detailed results per model
        model_results: Object.fromEntries(
          Object.entries(modelResults).map(([name, r]) => [
            name,
            {
              success: r.success,
              response_length: r.response?.length || 0,
              time_ms: r.timeMs,
              error: r.error,
              record_id: insertedRecords.find(rec => rec.model_name === r.config.displayName)?.id || null,
            }
          ])
        ),
        // All inserted records with their IDs
        inserted_records: insertedRecords,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[rix-search-v2] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
