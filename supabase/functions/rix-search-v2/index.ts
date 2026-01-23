import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prompt genérico para la mayoría de modelos - FORMATO NARRATIVO PROFESIONAL (estilo Make.com)
const buildSearchPrompt = (issuerName: string, ticker: string, dateFrom: string, dateTo: string): string => `
Eres ANALISTA DE REPUTACIÓN CORPORATIVA senior especializado en monitoreo de marca para comités de dirección.

OBJETIVO: Elaborar un INFORME ANALÍTICO NARRATIVO sobre la reputación de ${issuerName} (${ticker}) en España durante el periodo: ${dateFrom} a ${dateTo}.

═══════════════════════════════════════════════════════════════════════════
INSTRUCCIONES DE FORMATO (CRÍTICO):
═══════════════════════════════════════════════════════════════════════════

1. Escribe en FORMATO NARRATIVO PROFESIONAL, como un informe ejecutivo para un comité de dirección.
2. Organiza las menciones por CATEGORÍAS TEMÁTICAS, por ejemplo:
   - "Resultados Financieros y Operaciones Corporativas"
   - "Expansión y Adquisiciones"
   - "Controversias y Gestión de Crisis"
   - "Percepción Social y Redes"
   - "Liderazgo y Gobernanza"
   - "Sostenibilidad y ESG"
   
3. Para CADA mención relevante DEBES incluir:
   - **Fecha exacta** (día/mes/año)
   - **Fuente y URL** entre paréntesis o en formato markdown
   - **Análisis del IMPACTO REPUTACIONAL**: explica POR QUÉ esta mención afecta a la reputación (positiva/negativa/neutra) y cuáles son las implicaciones para la imagen de la empresa
   - **Contexto empresarial** cuando sea relevante

4. Usa formato **Markdown rico**:
   - Headers con ## para categorías
   - **Negritas** para fechas y términos clave
   - [Enlaces](url) para fuentes
   - Listas cuando sea apropiado

═══════════════════════════════════════════════════════════════════════════
FUENTES OBLIGATORIAS A REVISAR:
═══════════════════════════════════════════════════════════════════════════
• Prensa económica Tier-1: Expansión, Cinco Días, El Economista, Reuters, Bloomberg, Financial Times
• Reguladores: CNMV, BME, comunicados oficiales
• Redes sociales: X/Twitter, LinkedIn, Instagram
• Foros y comunidades: Rankia, Forocoches, Reddit r/SpainFinance
• Blogs sectoriales y medios especializados

═══════════════════════════════════════════════════════════════════════════
ESTRUCTURA DEL INFORME:
═══════════════════════════════════════════════════════════════════════════

## Resumen Ejecutivo
(2-4 frases: estado general de la reputación, principales hitos del periodo, tono dominante)

## [Categoría Temática 1]
**[Fecha] - [Titular de la mención]** ([Fuente](URL))
Análisis del impacto: explicación de cómo afecta esta mención a la reputación corporativa, qué percepción genera en stakeholders, y posibles implicaciones...

## [Categoría Temática 2]
...

## Alertas de Riesgo Reputacional
(Si hay controversias, críticas significativas o crisis potenciales)

## Señales Positivas
(Reconocimientos, logros, percepción favorable)

## Nota Metodológica
(Limitaciones de la búsqueda, fuentes no accesibles, incertidumbres)

═══════════════════════════════════════════════════════════════════════════
REGLAS CRÍTICAS:
═══════════════════════════════════════════════════════════════════════════
- Si no hallas menciones en el periodo exacto, busca contexto reciente e indícalo claramente
- Prioriza CALIDAD sobre cantidad: es mejor explicar bien 8-12 menciones que listar 20 sin análisis
- SIEMPRE incluye URLs y fechas exactas
- SIEMPRE explica el impacto reputacional de cada mención
- Responde en Español de España

NO devuelvas JSON. Escribe un informe narrativo profesional.
`;

// Prompt optimizado para Perplexity - FORMATO NARRATIVO PROFESIONAL (estilo Make.com)
const buildPerplexityPrompt = (issuerName: string, ticker: string): string => `Actúa como ANALISTA DE REPUTACIÓN CORPORATIVA senior especializado en monitoreo de marca para comités de dirección.

OBJETIVO: Elaborar un INFORME ANALÍTICO NARRATIVO sobre la reputación de ${issuerName} (${ticker}) en España durante los ÚLTIMOS 7 DÍAS.

═══════════════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (CRÍTICO):
═══════════════════════════════════════════════════════════════════════════

Escribe como INFORME EJECUTIVO NARRATIVO, NO como JSON ni lista seca de menciones.

Para cada mención que encuentres:
1. **Fecha exacta** (día/mes/año)
2. **Fuente con URL** en formato markdown [Fuente](url)
3. **ANÁLISIS DEL IMPACTO REPUTACIONAL**: Explica en 2-4 frases:
   - ¿Qué se dice sobre la empresa?
   - ¿Por qué esto AFECTA a su reputación? (positiva/negativa/neutra)
   - ¿Qué percepción genera en inversores, clientes, empleados?
   - ¿Hay implicaciones a futuro?

Usa formato **Markdown rico** con headers ##, negritas, y enlaces.

═══════════════════════════════════════════════════════════════════════════
CATEGORÍAS TEMÁTICAS A CUBRIR:
═══════════════════════════════════════════════════════════════════════════
- **Resultados Financieros y Operaciones Corporativas**: beneficios, adquisiciones, ventas, reestructuraciones
- **Noticias de Prensa Económica**: cobertura en medios Tier-1
- **Menciones en Redes Sociales y Foros**: X/Twitter, LinkedIn, Rankia, Reddit
- **Controversias y Alertas de Riesgo**: críticas, quejas, problemas de servicio, investigaciones
- **Liderazgo y Gobernanza**: cambios directivos, declaraciones de ejecutivos
- **Sostenibilidad y ESG**: iniciativas medioambientales, sociales, de gobernanza

═══════════════════════════════════════════════════════════════════════════
FUENTES (prioridad máxima a menciones <7 días):
═══════════════════════════════════════════════════════════════════════════
• Prensa: Expansión, Cinco Días, El Economista, Reuters, Bloomberg, FT
• Reguladores: CNMV, BME
• Social: X/Twitter, LinkedIn, Rankia, Reddit, Forocoches
• Blogs sectoriales y foros especializados

═══════════════════════════════════════════════════════════════════════════
ESTRUCTURA DEL INFORME:
═══════════════════════════════════════════════════════════════════════════

## Resumen Ejecutivo
(2-4 frases: estado general de reputación, principales hitos, tono dominante del periodo)

## [Categoría Temática 1: ej. Operaciones Corporativas]
**[Fecha] - [Titular]** ([Fuente](URL))
Análisis del impacto reputacional: Esta noticia podría generar [percepción positiva/negativa] porque... Los stakeholders podrían interpretar esto como...

## [Categoría Temática 2]
...

## Alertas de Riesgo Reputacional
(Controversias, críticas significativas, riesgos potenciales)

## Nota Metodológica
(Limitaciones: acceso a fuentes, URLs aproximadas, incertidumbres de fecha)

═══════════════════════════════════════════════════════════════════════════
REGLAS CRÍTICAS:
═══════════════════════════════════════════════════════════════════════════
- Objetivo: 10-15 menciones relevantes CON análisis de impacto
- SIEMPRE incluye URLs y fechas
- SIEMPRE explica POR QUÉ cada mención afecta a la reputación
- Si no hay menciones recientes, indica claramente y busca contexto relevante
- Responde en Español de España

NO devuelvas JSON. Escribe un informe narrativo profesional.`;

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
          { role: 'system', content: 'Eres analista de reputación corporativa senior. Escribe INFORMES NARRATIVOS profesionales, NO JSON. Organiza por categorías temáticas. Para cada mención: incluye fecha exacta, URL, y ANÁLISIS del impacto reputacional (por qué afecta a la imagen de la empresa). Usa Markdown con headers y negritas. Responde en español.' },
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
          { role: 'system', content: 'Eres analista de reputación corporativa senior. Escribe INFORMES NARRATIVOS profesionales organizados por categorías temáticas (Operaciones Corporativas, Controversias, Percepción Social, etc.). Para cada mención: incluye fecha, URL, y ANÁLISIS DETALLADO del impacto reputacional explicando POR QUÉ afecta a la imagen corporativa. Usa Markdown. Responde en español.' },
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
          { role: 'system', content: 'Eres analista de reputación corporativa senior. Escribe INFORMES NARRATIVOS profesionales como si fueran para un comité de dirección. Organiza por categorías temáticas. Para cada mención: fecha exacta, fuente con URL, y ANÁLISIS DEL IMPACTO REPUTACIONAL explicando cómo afecta a la percepción de la empresa entre inversores, clientes y empleados. Usa Markdown rico. Responde en español.' },
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
  // 6. Qwen Max (Alibaba DashScope) - Con enable_search
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
            { role: 'system', content: 'Eres analista de reputación corporativa senior. Escribe INFORMES NARRATIVOS profesionales organizados por categorías temáticas. Para cada mención incluye: fecha, URL, y ANÁLISIS del impacto reputacional (positivo/negativo y por qué). Usa Markdown con headers y negritas. Responde en español.' },
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

// Mapping from model name to cost config provider/model
const MODEL_COST_MAP: Record<string, { provider: string; model: string }> = {
  'perplexity-sonar-pro': { provider: 'perplexity', model: 'sonar-pro' },
  'grok-3': { provider: 'xai', model: 'grok-3' },
  'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat' },
  'gemini-2.5-pro': { provider: 'gemini', model: 'gemini-2.5-pro-preview-05-06' },
  'gpt-4.1-mini': { provider: 'openai', model: 'gpt-4.1-mini' },
  'qwen-max': { provider: 'alibaba', model: 'qwen-max' },
};

// Helper to log API usage for cost tracking
async function logApiUsage(
  supabase: any,
  config: SearchModelConfig,
  prompt: string,
  response: string | undefined,
  ticker: string,
  success: boolean
): Promise<void> {
  try {
    const costMapping = MODEL_COST_MAP[config.name];
    if (!costMapping) return;

    // Estimate tokens more accurately from actual content
    // Using 4 chars/token for input, 3.5 for output (industry standard estimation)
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = response ? Math.ceil(response.length / 3.5) : 0;

    // Get cost config from database
    const { data: costConfig } = await supabase
      .from('api_cost_config')
      .select('input_cost_per_million, output_cost_per_million')
      .eq('provider', costMapping.provider)
      .eq('model', costMapping.model)
      .single();

    const inputCost = costConfig ? (inputTokens / 1_000_000) * costConfig.input_cost_per_million : 0;
    const outputCost = costConfig ? (outputTokens / 1_000_000) * costConfig.output_cost_per_million : 0;
    const totalCost = inputCost + outputCost;

    await supabase.from('api_usage_logs').insert({
      edge_function: 'rix-search-v2',
      provider: costMapping.provider,
      model: costMapping.model,
      action_type: 'rix_search',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: totalCost,
      pipeline_stage: 'search',
      ticker: ticker,
      metadata: {
        model_name: config.displayName,
        success,
        response_length: response?.length || 0,
        prompt_length: prompt.length,
      },
    });
  } catch (err) {
    console.error(`[rix-search-v2] Cost logging error for ${config.name}:`, err);
  }
}

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

// Fetch stock prices from EODHD via our edge function
interface StockPriceResult {
  precio_cierre: string;
  minimo_52_semanas: string | null;
}

async function fetchStockPrice(
  ticker: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<StockPriceResult | null> {
  try {
    console.log(`[rix-search-v2] Fetching stock price for ${ticker}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/fetch-stock-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tickers: [ticker] }),
    });

    if (!response.ok) {
      console.error(`[rix-search-v2] fetch-stock-prices failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const priceData = data.prices?.[ticker];
    
    if (priceData && priceData.precio_cierre !== 'NC') {
      console.log(`[rix-search-v2] Got price for ${ticker}: ${priceData.precio_cierre}€`);
      return priceData;
    }
    
    console.log(`[rix-search-v2] No price available for ${ticker}`);
    return null;
  } catch (error: any) {
    console.error(`[rix-search-v2] Error fetching price for ${ticker}:`, error.message);
    return null;
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

    // Check if company is listed and fetch stock prices
    let stockPrice: StockPriceResult | null = null;
    let isListed = false;
    
    try {
      const { data: issuerData } = await supabase
        .from('repindex_root_issuers')
        .select('cotiza_en_bolsa')
        .eq('ticker', ticker)
        .single();
      
      isListed = issuerData?.cotiza_en_bolsa === true;
      
      if (isListed) {
        console.log(`[rix-search-v2] ${ticker} is listed, fetching stock price...`);
        stockPrice = await fetchStockPrice(ticker, supabaseUrl, supabaseServiceKey);
      } else {
        console.log(`[rix-search-v2] ${ticker} is not listed, skipping stock price`);
      }
    } catch (err: any) {
      console.warn(`[rix-search-v2] Error checking listing status for ${ticker}:`, err.message);
    }

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
        // Stock price columns for listed companies
        '48_precio_accion': stockPrice?.precio_cierre || (isListed ? null : 'NC'),
        '59_precio_minimo_52_semanas': stockPrice?.minimo_52_semanas || null,
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
          
          // Log API usage for cost tracking - pass actual prompt for accurate token counting
          const usedPrompt = config.name === 'perplexity-sonar-pro' ? perplexityPrompt : genericPrompt;
          EdgeRuntime.waitUntil(
            logApiUsage(supabase, config, usedPrompt, result.response, ticker, result.success)
          );
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
