import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Search prompt template - based on the original PARI prompt
const SEARCH_PROMPT = `Eres un analista de reputación corporativa. Analiza la presencia mediática de {{issuer_name}} (ticker: {{ticker}}) en los últimos 7 días.

INSTRUCCIONES:
1. Busca noticias, artículos y menciones recientes sobre esta empresa
2. Identifica temas principales, sentimiento general y fuentes clave
3. Proporciona un análisis estructurado de su percepción pública actual

FORMATO DE RESPUESTA:
Proporciona tu análisis en formato estructurado incluyendo:
- Resumen ejecutivo (2-3 oraciones)
- Puntos clave (lista de 3-5 puntos)
- Sentimiento general (positivo/neutro/negativo)
- Fuentes principales mencionadas
- Controversias o riesgos detectados (si los hay)
- Fortalezas reputacionales observadas

Empresa a analizar: {{issuer_name}}
Ticker: {{ticker}}
Periodo: últimos 7 días`;

interface ModelConfig {
  name: string;
  endpoint: string;
  apiKeyEnv: string;
  buildRequest: (prompt: string) => { headers: Record<string, string>; body: string };
  parseResponse: (data: any) => string;
}

const getModelConfigs = (): ModelConfig[] => [
  {
    name: 'gpt-4o',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKeyEnv: 'OPENAI_API_KEY',
    buildRequest: (prompt: string) => ({
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  {
    name: 'gemini-1.5-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    apiKeyEnv: 'GOOGLE_GEMINI_API_KEY',
    buildRequest: (prompt: string) => ({
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4000,
        },
      }),
    }),
    parseResponse: (data: any) => data.candidates?.[0]?.content?.parts?.[0]?.text || '',
  },
  {
    name: 'sonar',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    buildRequest: (prompt: string) => ({
      headers: {
        'Authorization': `Bearer ${Deno.env.get('PERPLEXITY_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  {
    name: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    buildRequest: (prompt: string) => ({
      headers: {
        'Authorization': `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  {
    name: 'claude-sonnet',
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    buildRequest: (prompt: string) => ({
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    }),
    parseResponse: (data: any) => data.content?.[0]?.text || '',
  },
  {
    name: 'grok-3',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    apiKeyEnv: 'XAI_API_KEY',
    buildRequest: (prompt: string) => ({
      headers: {
        'Authorization': `Bearer ${Deno.env.get('XAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
  {
    name: 'qwen-max',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    buildRequest: (prompt: string) => ({
      headers: {
        'Authorization': `Bearer ${Deno.env.get('DASHSCOPE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-max',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    }),
    parseResponse: (data: any) => data.choices?.[0]?.message?.content || '',
  },
];

async function callModel(config: ModelConfig, prompt: string): Promise<{ success: boolean; response?: string; error?: string; timeMs: number }> {
  const startTime = Date.now();
  
  try {
    const apiKey = Deno.env.get(config.apiKeyEnv);
    if (!apiKey) {
      return { success: false, error: `Missing API key: ${config.apiKeyEnv}`, timeMs: Date.now() - startTime };
    }

    const { headers, body } = config.buildRequest(prompt);
    
    // Special case for Gemini - API key in URL
    let url = config.endpoint;
    if (config.name === 'gemini-1.5-flash') {
      url = `${config.endpoint}?key=${Deno.env.get(config.apiKeyEnv)}`;
    }

    console.log(`[${config.name}] Starting API call...`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${config.name}] API error: ${response.status} - ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`, timeMs: Date.now() - startTime };
    }

    const data = await response.json();
    const content = config.parseResponse(data);
    
    console.log(`[${config.name}] Success - ${content.length} chars in ${Date.now() - startTime}ms`);
    
    return { success: true, response: content, timeMs: Date.now() - startTime };
  } catch (error) {
    console.error(`[${config.name}] Error:`, error);
    return { success: false, error: error.message, timeMs: Date.now() - startTime };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, issuer_name, week_start, week_end } = await req.json();

    if (!ticker || !issuer_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: ticker, issuer_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rix-search-v2] Starting search for ${issuer_name} (${ticker})`);
    const totalStartTime = Date.now();

    // Build prompt
    const prompt = SEARCH_PROMPT
      .replace(/\{\{issuer_name\}\}/g, issuer_name)
      .replace(/\{\{ticker\}\}/g, ticker);

    // Execute all 7 model calls in parallel
    const modelConfigs = getModelConfigs();
    const results = await Promise.allSettled(
      modelConfigs.map(config => callModel(config, prompt))
    );

    // Process results
    const modelResults: Record<string, { success: boolean; response?: string; error?: string; timeMs: number }> = {};
    const modelErrors: Record<string, string> = {};
    
    results.forEach((result, index) => {
      const modelName = modelConfigs[index].name;
      if (result.status === 'fulfilled') {
        modelResults[modelName] = result.value;
        if (!result.value.success && result.value.error) {
          modelErrors[modelName] = result.value.error;
        }
      } else {
        modelResults[modelName] = { success: false, error: result.reason?.message || 'Unknown error', timeMs: 0 };
        modelErrors[modelName] = result.reason?.message || 'Unknown error';
      }
    });

    console.log(`[rix-search-v2] All models completed in ${Date.now() - totalStartTime}ms`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate dates
    const now = new Date();
    const periodFrom = week_start ? new Date(week_start) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodTo = week_end ? new Date(week_end) : now;

    // Insert record into rix_runs_v2
    const insertData = {
      '02_model_name': 'multi-model-v2',
      '03_target_name': issuer_name,
      '04_target_type': 'company',
      '05_ticker': ticker,
      '06_period_from': periodFrom.toISOString().split('T')[0],
      '07_period_to': periodTo.toISOString().split('T')[0],
      '08_tz': 'Europe/Madrid',
      '20_res_gpt_bruto': modelResults['gpt-4o']?.response || null,
      '21_res_perplex_bruto': modelResults['sonar']?.response || null,
      '22_res_gemini_bruto': modelResults['gemini-1.5-flash']?.response || null,
      '23_res_deepseek_bruto': modelResults['deepseek-chat']?.response || null,
      'respuesta_bruto_claude': modelResults['claude-sonnet']?.response || null,
      'respuesta_bruto_grok': modelResults['grok-3']?.response || null,
      'respuesta_bruto_qwen': modelResults['qwen-max']?.response || null,
      'source_pipeline': 'lovable_v2',
      'execution_time_ms': Date.now() - totalStartTime,
      'model_errors': modelErrors,
      'search_completed_at': new Date().toISOString(),
      'batch_execution_date': now.toISOString(),
    };

    const { data: insertedRecord, error: insertError } = await supabase
      .from('rix_runs_v2')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('[rix-search-v2] Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save results', details: insertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rix-search-v2] Record saved with ID: ${insertedRecord.id}`);

    // Build response summary
    const successCount = Object.values(modelResults).filter(r => r.success).length;
    const summary = {
      id: insertedRecord.id,
      ticker,
      issuer_name,
      models_called: modelConfigs.length,
      models_succeeded: successCount,
      models_failed: modelConfigs.length - successCount,
      total_time_ms: Date.now() - totalStartTime,
      model_results: Object.fromEntries(
        Object.entries(modelResults).map(([name, result]) => [
          name,
          {
            success: result.success,
            response_length: result.response?.length || 0,
            time_ms: result.timeMs,
            error: result.error,
          }
        ])
      ),
    };

    return new Response(
      JSON.stringify(summary),
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
