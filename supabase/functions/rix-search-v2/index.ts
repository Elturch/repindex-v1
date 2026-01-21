import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prompt de búsqueda completo según especificaciones
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

// 7 modelos con acceso real a Internet
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
    displayName: 'Perplexity Sonar Pro',
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
    displayName: 'Grok 3 (xAI)',
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
    displayName: 'DeepSeek',
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
  // 4. GPT-4o Search Preview (OpenAI)
  {
    name: 'gpt-4o-search',
    displayName: 'GPT-4o Search',
    apiKeyEnv: 'OPENAI_API_KEY',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    dbColumn: '20_res_gpt_bruto',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'gpt-4o-search-preview',
        web_search_options: {},
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
  // 5. Gemini 2.0 Flash (Google) - Con Google Search grounding
  {
    name: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    apiKeyEnv: 'GOOGLE_GEMINI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
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
          maxOutputTokens: 4000,
        },
      },
    }),
    parseResponse: (data: any) => {
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
  // 6. Claude 3.7 Sonnet (Anthropic) - Con web search beta
  {
    name: 'claude-sonnet',
    displayName: 'Claude Sonnet',
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        }],
        messages: [{ role: 'user', content: prompt }],
      },
    }),
    parseResponse: (data: any) => {
      // Claude devuelve array de content blocks
      if (!data.content) return '';
      return data.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');
    },
  },
  // 7. Qwen Max (Alibaba DashScope) - Con enable_search
  {
    name: 'qwen-max',
    displayName: 'Qwen Max',
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

    console.log(`[rix-search-v2] Starting search for ${issuer_name} (${ticker}) with 7 models`);
    const startTime = Date.now();

    // Calculate date range (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateFrom = weekAgo.toISOString().split('T')[0];
    const dateTo = now.toISOString().split('T')[0];

    // Build search prompt
    const searchPrompt = buildSearchPrompt(issuer_name, ticker, dateFrom, dateTo);

    // Get all 7 search-capable models
    const modelConfigs = getSearchModelConfigs();

    // Call all search models in parallel
    const results = await Promise.allSettled(
      modelConfigs.map(config => callSearchModel(config, searchPrompt))
    );

    // Process results
    const modelResults: Record<string, { success: boolean; response?: string; error?: string; timeMs: number }> = {};
    const modelErrors: Record<string, string> = {};
    
    results.forEach((result, index) => {
      const config = modelConfigs[index];
      if (result.status === 'fulfilled') {
        modelResults[config.name] = result.value;
        if (!result.value.success && result.value.error) {
          modelErrors[config.name] = result.value.error;
        }
      } else {
        modelResults[config.name] = { 
          success: false, 
          error: result.reason?.message || 'Unknown error',
          timeMs: 0 
        };
        modelErrors[config.name] = result.reason?.message || 'Unknown error';
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

    // Prepare record for insertion - store raw responses from all 7 search models
    const insertData: Record<string, any> = {
      '02_model_name': 'consolidado_v2',
      '03_target_name': issuer_name,
      '04_target_type': 'company',
      '05_ticker': ticker,
      '06_period_from': dateFrom,
      '07_period_to': dateTo,
      '08_tz': 'Europe/Madrid',
      'batch_execution_date': sunday.toISOString(),
      'source_pipeline': 'lovable_v2',
      'execution_time_ms': Date.now() - startTime,
      'search_completed_at': new Date().toISOString(),
      // Track errors
      'model_errors': Object.keys(modelErrors).length > 0 ? modelErrors : null,
    };

    // Map each model's response to its database column
    modelConfigs.forEach(config => {
      const result = modelResults[config.name];
      insertData[config.dbColumn] = result?.response || null;
    });

    // Insert record
    const { data: insertedRecord, error: insertError } = await supabase
      .from('rix_runs_v2')
      .insert(insertData)
      .select('id')
      .single();

    if (insertError) {
      console.error('[rix-search-v2] Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save search results', details: insertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const successCount = Object.values(modelResults).filter(r => r.success).length;
    const totalModels = modelConfigs.length;
    const totalTime = Date.now() - startTime;

    console.log(`[rix-search-v2] Search completed: ${successCount}/${totalModels} models succeeded in ${totalTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        id: insertedRecord.id,
        record_id: insertedRecord.id,
        issuer_name,
        ticker,
        date_range: { from: dateFrom, to: dateTo },
        models_called: totalModels,
        models_succeeded: successCount,
        models_failed: totalModels - successCount,
        total_time_ms: totalTime,
        model_results: Object.fromEntries(
          Object.entries(modelResults).map(([name, r]) => [
            name,
            {
              success: r.success,
              response_length: r.response?.length || 0,
              time_ms: r.timeMs,
              error: r.error,
            }
          ])
        ),
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
