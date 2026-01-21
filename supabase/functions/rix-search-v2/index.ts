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

// Solo modelos con acceso real a Internet
interface SearchModelConfig {
  name: string;
  displayName: string;
  apiKeyEnv: string;
  endpoint: string;
  buildRequest: (prompt: string) => object;
  parseResponse: (data: any) => string;
}

const getSearchModelConfigs = (): SearchModelConfig[] => [
  {
    name: 'perplexity-sonar-pro',
    displayName: 'Perplexity Sonar Pro',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    buildRequest: (prompt: string) => ({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4000,
      search_recency_filter: 'week',
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  {
    name: 'grok-3',
    displayName: 'Grok 3 (xAI)',
    apiKeyEnv: 'XAI_API_KEY',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    buildRequest: (prompt: string) => ({
      model: 'grok-3',
      messages: [
        { role: 'system', content: 'You are a corporate reputation analyst with real-time access to X/Twitter and web sources. Always include URLs and dates in your analysis. Respond in Spanish.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  {
    name: 'deepseek-chat',
    displayName: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    endpoint: 'https://api.deepseek.com/chat/completions',
    buildRequest: (prompt: string) => ({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a corporate reputation analyst. Search the web thoroughly for recent mentions. Always include URLs and dates. Respond in Spanish.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
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
      return { success: false, error: `Missing ${config.apiKeyEnv}`, timeMs: Date.now() - startTime };
    }

    console.log(`[rix-search-v2] Calling ${config.displayName}...`);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config.buildRequest(prompt)),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[rix-search-v2] ${config.displayName} error:`, response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`, timeMs: Date.now() - startTime };
    }

    const data = await response.json();
    const content = config.parseResponse(data);
    
    if (!content) {
      return { success: false, error: 'Empty response', timeMs: Date.now() - startTime };
    }

    console.log(`[rix-search-v2] ${config.displayName} returned ${content.length} chars`);
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

    console.log(`[rix-search-v2] Starting search for ${issuer_name} (${ticker})`);
    const startTime = Date.now();

    // Calculate date range (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateFrom = weekAgo.toISOString().split('T')[0];
    const dateTo = now.toISOString().split('T')[0];

    // Build search prompt
    const searchPrompt = buildSearchPrompt(issuer_name, ticker, dateFrom, dateTo);

    // Get only search-capable models (3 models with internet access)
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

    // Prepare record for insertion - store raw responses from search models
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
      // Store raw responses from the 3 search models
      '21_res_perplex_bruto': modelResults['perplexity-sonar-pro']?.response || null,
      'respuesta_bruto_grok': modelResults['grok-3']?.response || null,
      '23_res_deepseek_bruto': modelResults['deepseek-chat']?.response || null,
      // Track errors
      'model_errors': Object.keys(modelErrors).length > 0 ? modelErrors : null,
    };

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
    const totalTime = Date.now() - startTime;

    console.log(`[rix-search-v2] Search completed: ${successCount}/3 models succeeded in ${totalTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        id: insertedRecord.id,
        record_id: insertedRecord.id,
        issuer_name,
        ticker,
        date_range: { from: dateFrom, to: dateTo },
        models_called: 3,
        models_succeeded: successCount,
        models_failed: 3 - successCount,
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
