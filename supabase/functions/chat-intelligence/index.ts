import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache for company data
let companiesCache: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// =============================================================================
// API USAGE LOGGING HELPER
// =============================================================================
interface ApiUsageParams {
  supabaseClient: any;
  edgeFunction: string;
  provider: string;
  model: string;
  actionType: string;
  inputTokens: number;
  outputTokens: number;
  userId?: string | null;
  sessionId?: string;
  metadata?: Record<string, any>;
}

async function logApiUsage(params: ApiUsageParams): Promise<void> {
  try {
    // Fetch cost config
    const { data: costConfig } = await params.supabaseClient
      .from('api_cost_config')
      .select('input_cost_per_million, output_cost_per_million')
      .eq('provider', params.provider)
      .eq('model', params.model)
      .single();

    // Calculate estimated cost
    let estimatedCost = 0;
    if (costConfig) {
      const inputCost = (params.inputTokens / 1000000) * costConfig.input_cost_per_million;
      const outputCost = (params.outputTokens / 1000000) * costConfig.output_cost_per_million;
      estimatedCost = inputCost + outputCost;
    }

    // Insert log
    const { error } = await params.supabaseClient
      .from('api_usage_logs')
      .insert({
        edge_function: params.edgeFunction,
        provider: params.provider,
        model: params.model,
        action_type: params.actionType,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        estimated_cost_usd: estimatedCost,
        user_id: params.userId || null,
        session_id: params.sessionId || null,
        metadata: params.metadata || {},
      });

    if (error) {
      console.warn('Failed to log API usage:', error.message);
    }
  } catch (e) {
    console.warn('Error in logApiUsage:', e);
  }
}

// =============================================================================
// UNIFIED RIX DATA HELPER - Combines rix_runs and rix_runs_v2
// =============================================================================
// This ensures we get data from all 6 AI models (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen)
interface FetchUnifiedRixOptions {
  supabaseClient: any;
  columns: string;
  tickerFilter?: string | string[];
  limit?: number;
  logPrefix?: string;
}

async function fetchUnifiedRixData(options: FetchUnifiedRixOptions): Promise<any[]> {
  const { supabaseClient, columns, tickerFilter, limit = 1000, logPrefix = '[Unified-RIX]' } = options;
  
  // Build queries for both tables
  let queryRix = supabaseClient.from('rix_runs').select(columns).order('batch_execution_date', { ascending: false });
  
  // V2: Include records with EITHER completed analysis OR valid rix_score
  // This ensures we get Grok & Qwen even if analysis is pending for newest week
  let queryV2 = supabaseClient
    .from('rix_runs_v2')
    .select(columns)
    .or('analysis_completed_at.not.is.null,09_rix_score.not.is.null')
    .order('batch_execution_date', { ascending: false });
  
  // Apply ticker filter if provided
  if (tickerFilter) {
    if (Array.isArray(tickerFilter)) {
      queryRix = queryRix.in('"05_ticker"', tickerFilter);
      queryV2 = queryV2.in('"05_ticker"', tickerFilter);
    } else {
      queryRix = queryRix.eq('"05_ticker"', tickerFilter);
      queryV2 = queryV2.eq('"05_ticker"', tickerFilter);
    }
  }
  
  // Apply limits
  queryRix = queryRix.limit(limit);
  queryV2 = queryV2.limit(limit);
  
  // Execute in parallel
  const [rixResult, v2Result] = await Promise.all([queryRix, queryV2]);
  
  const rixData = rixResult.data || [];
  const v2Data = v2Result.data || [];
  
  // Combine with v2 data LAST so it takes precedence in deduplication
  // v2 is the authoritative source for current data (has Grok & Qwen)
  const dedupeMap = new Map<string, { record: any; isV2: boolean; hasAnalysis: boolean }>();
  
  // First pass: add all rix_runs (legacy) data
  rixData.forEach(record => {
    const key = `${record['05_ticker']}_${record['02_model_name']}_${record['06_period_from']}_${record['07_period_to']}`;
    dedupeMap.set(key, { record, isV2: false, hasAnalysis: true });
  });
  
  // Second pass: v2 data ALWAYS overwrites legacy data for same key
  // This ensures v2 is the source of truth for current/trending analysis
  // Prioritize records with completed analysis over those without
  v2Data.forEach(record => {
    const key = `${record['05_ticker']}_${record['02_model_name']}_${record['06_period_from']}_${record['07_period_to']}`;
    const existing = dedupeMap.get(key);
    const hasAnalysis = record.analysis_completed_at != null || record['09_rix_score'] != null;
    
    // V2 wins if: no existing record, existing is legacy, or v2 has newer/equal batch date
    const shouldReplace = !existing || 
      existing.isV2 === false || 
      (record.batch_execution_date && existing.record.batch_execution_date && 
       new Date(record.batch_execution_date) >= new Date(existing.record.batch_execution_date));
    
    if (shouldReplace) {
      dedupeMap.set(key, { record, isV2: true, hasAnalysis });
    }
  });
  
  const result = Array.from(dedupeMap.values()).map(item => item.record);
  const v2Count = Array.from(dedupeMap.values()).filter(item => item.isV2).length;
  const analyzedCount = Array.from(dedupeMap.values()).filter(item => item.hasAnalysis).length;
  console.log(`${logPrefix} Combined RIX data: ${rixData.length} legacy + ${v2Data.length} v2 = ${result.length} unique records (${v2Count} from v2, ${analyzedCount} with analysis)`);
  
  return result;
}

// =============================================================================
// VERIFIED SOURCE EXTRACTOR - Only ChatGPT (utm_source=openai) and Perplexity
// =============================================================================
// CRITICAL: Other models (Gemini, DeepSeek, Grok, Qwen) are IGNORED because
// they may contain fabricated/hallucinated URLs.
//
// TEMPORAL CLASSIFICATION:
// - 'window': Sources within the analysis period (period_from to period_to)
// - 'reinforcement': Historical/contextual sources used by AIs
// - 'unknown': Cannot determine temporal category

interface VerifiedSource {
  url: string;
  domain: string;
  title?: string;
  sourceModel: 'ChatGPT' | 'Perplexity';
  citationNumber?: number;
  temporalCategory: 'window' | 'reinforcement' | 'unknown';
  extractedDate?: string;
}

// Spanish month names for date extraction
const SPANISH_MONTHS: Record<string, number> = {
  'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
  'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
  'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
};

/**
 * Extract dates from text near a URL position (within ~200 chars).
 */
function extractNearestDate(text: string, urlPosition: number): Date | null {
  const start = Math.max(0, urlPosition - 200);
  const end = Math.min(text.length, urlPosition + 200);
  const context = text.slice(start, end);
  
  const dates: { date: Date; distance: number }[] = [];
  
  // Pattern 1: "DD de MES de AAAA" (Spanish full date)
  const fullDatePattern = /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/gi;
  let match;
  while ((match = fullDatePattern.exec(context)) !== null) {
    const day = parseInt(match[1], 10);
    const month = SPANISH_MONTHS[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, day),
        distance: Math.abs(match.index - (urlPosition - start))
      });
    }
  }
  
  // Pattern 2: "MES de AAAA" or "MES AAAA"
  const monthYearPattern = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/gi;
  while ((match = monthYearPattern.exec(context)) !== null) {
    const month = SPANISH_MONTHS[match[1].toLowerCase()];
    const year = parseInt(match[2], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, 15),
        distance: Math.abs(match.index - (urlPosition - start))
      });
    }
  }
  
  if (dates.length === 0) return null;
  dates.sort((a, b) => a.distance - b.distance);
  return dates[0].date;
}

/**
 * Classify a source temporally based on extracted date and analysis period.
 */
function classifyTemporally(
  extractedDate: Date | null,
  periodFrom: Date | null,
  periodTo: Date | null
): 'window' | 'reinforcement' | 'unknown' {
  if (!extractedDate) return 'unknown';
  if (!periodFrom || !periodTo) return 'unknown';
  
  // Extend window by 3 days on each side
  const windowStart = new Date(periodFrom);
  windowStart.setDate(windowStart.getDate() - 3);
  const windowEnd = new Date(periodTo);
  windowEnd.setDate(windowEnd.getDate() + 3);
  
  if (extractedDate >= windowStart && extractedDate <= windowEnd) {
    return 'window';
  } else if (extractedDate < periodFrom) {
    return 'reinforcement';
  }
  return 'unknown';
}

function extractVerifiedSources(
  chatGptRaw: string | null,
  perplexityRaw: string | null,
  periodFrom: string | null = null,
  periodTo: string | null = null
): VerifiedSource[] {
  const sources: VerifiedSource[] = [];
  const periodFromDate = periodFrom ? new Date(periodFrom) : null;
  const periodToDate = periodTo ? new Date(periodTo) : null;
  
  // Extract ChatGPT sources (only with utm_source=openai)
  if (chatGptRaw) {
    const chatGptPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+utm_source=openai[^)]*)\)/g;
    let match;
    while ((match = chatGptPattern.exec(chatGptRaw)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const urlPosition = match.index;
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        if (!sources.some(s => s.url === url)) {
          const extractedDate = extractNearestDate(chatGptRaw, urlPosition);
          const temporalCategory = classifyTemporally(extractedDate, periodFromDate, periodToDate);
          sources.push({ 
            url, 
            domain, 
            title: title || undefined, 
            sourceModel: 'ChatGPT',
            temporalCategory,
            extractedDate: extractedDate?.toISOString(),
          });
        }
      } catch { /* Invalid URL */ }
    }
  }
  
  // Extract Perplexity sources
  if (perplexityRaw) {
    // Try JSON parsing first
    try {
      const parsed = JSON.parse(perplexityRaw);
      if (parsed.citations && Array.isArray(parsed.citations)) {
        parsed.citations.forEach((citation: string, index: number) => {
          if (citation && citation.startsWith('http')) {
            try {
              const urlObj = new URL(citation);
              const domain = urlObj.hostname.replace(/^www\./, '');
              if (!sources.some(s => s.url === citation)) {
                sources.push({ 
                  url: citation, 
                  domain, 
                  sourceModel: 'Perplexity', 
                  citationNumber: index + 1,
                  temporalCategory: 'unknown', // JSON structure doesn't provide date context
                });
              }
            } catch { /* Invalid URL */ }
          }
        });
      }
    } catch { /* Not JSON, try regex */ }
    
    // Markdown links from Perplexity
    const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownPattern.exec(perplexityRaw)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const urlPosition = match.index;
      if (sources.some(s => s.url === url)) continue;
      if (url.includes('perplexity.ai')) continue;
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        const extractedDate = extractNearestDate(perplexityRaw, urlPosition);
        const temporalCategory = classifyTemporally(extractedDate, periodFromDate, periodToDate);
        sources.push({ 
          url, 
          domain, 
          title: title || undefined, 
          sourceModel: 'Perplexity',
          temporalCategory,
          extractedDate: extractedDate?.toISOString(),
        });
      } catch { /* Invalid URL */ }
    }
  }
  
  return sources;
}

function extractSourcesFromRixData(rixData: any[]): VerifiedSource[] {
  const allSources: VerifiedSource[] = [];
  
  for (const run of rixData) {
    const sources = extractVerifiedSources(
      run['20_res_gpt_bruto'] ?? null,
      run['21_res_perplex_bruto'] ?? null,
      run['06_period_from'] ?? null,
      run['07_period_to'] ?? null
    );
    allSources.push(...sources);
  }
  
  // Deduplicate by URL
  const seen = new Set<string>();
  return allSources.filter(source => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

// =============================================================================
// SSE STREAMING HELPERS
// =============================================================================

type SSEEventType = 'start' | 'chunk' | 'metadata' | 'done' | 'error' | 'fallback';

interface SSEEvent {
  type: SSEEventType;
  text?: string;
  metadata?: Record<string, unknown>;
  suggestedQuestions?: string[];
  drumrollQuestion?: DrumrollQuestion | null;
  error?: string;
}

function createSSEEncoder() {
  const encoder = new TextEncoder();
  return (event: SSEEvent): Uint8Array => {
    const data = JSON.stringify(event);
    return encoder.encode(`data: ${data}\n\n`);
  };
}

// Stream OpenAI response with SSE
async function* streamOpenAIResponse(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000
): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; text?: string; inputTokens?: number; outputTokens?: number; error?: string }> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openAIApiKey) {
    yield { type: 'error', error: 'OpenAI API key not configured' };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`${logPrefix} Starting OpenAI stream (${model})...`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} OpenAI stream error:`, response.status, errorText);
      yield { type: 'error', error: `OpenAI error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            yield { type: 'done', inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { type: 'chunk', text: content };
            }
            
            // Capture usage from final chunk if available
            if (parsed.usage) {
              totalInputTokens = parsed.usage.prompt_tokens || 0;
              totalOutputTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }

    yield { type: 'done', inputTokens: totalInputTokens, outputTokens: totalOutputTokens };

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn(`${logPrefix} OpenAI stream timeout`);
      yield { type: 'error', error: 'OpenAI timeout' };
    } else {
      console.error(`${logPrefix} OpenAI stream error:`, error);
      yield { type: 'error', error: error.message || 'Unknown error' };
    }
  }
}

// Stream Gemini response with SSE
async function* streamGeminiResponse(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000
): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; text?: string; inputTokens?: number; outputTokens?: number; error?: string }> {
  const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    yield { type: 'error', error: 'Gemini API key not configured' };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`${logPrefix} Starting Gemini stream (${model})...`);

    // Convert messages to Gemini format
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const systemInstruction = messages.find(m => m.role === 'system')?.content;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: { maxOutputTokens: maxTokens }
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Gemini stream error:`, response.status, errorText);
      yield { type: 'error', error: `Gemini error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Gemini streams as NDJSON-like format
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') continue;
        
        // Clean up JSON array markers
        let jsonStr = trimmed;
        if (jsonStr.startsWith(',')) jsonStr = jsonStr.slice(1);
        if (jsonStr.startsWith('[')) jsonStr = jsonStr.slice(1);
        if (jsonStr.endsWith(',')) jsonStr = jsonStr.slice(0, -1);
        if (jsonStr.endsWith(']')) jsonStr = jsonStr.slice(0, -1);
        
        if (!jsonStr.trim()) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield { type: 'chunk', text };
          }
          
          // Capture usage metadata
          if (parsed.usageMetadata) {
            totalInputTokens = parsed.usageMetadata.promptTokenCount || 0;
            totalOutputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    yield { type: 'done', inputTokens: totalInputTokens, outputTokens: totalOutputTokens };

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn(`${logPrefix} Gemini stream timeout`);
      yield { type: 'error', error: 'Gemini timeout' };
    } else {
      console.error(`${logPrefix} Gemini stream error:`, error);
      yield { type: 'error', error: error.message || 'Unknown error' };
    }
  }
}

// =============================================================================
// AI FALLBACK HELPER - OpenAI → Gemini
// =============================================================================
interface AICallResult {
  content: string;
  provider: 'openai' | 'gemini';
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function callAIWithFallback(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000,
  options?: {
    preferGemini?: boolean;
    geminiTimeout?: number;
  }
): Promise<AICallResult> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');

  const preferGemini = options?.preferGemini ?? false;
  const geminiTimeout = options?.geminiTimeout ?? timeout;
  
  // Model mapping: OpenAI → Gemini equivalent
  const modelMapping: Record<string, string> = {
    'o3': 'gemini-2.5-flash',
    'gpt-4o-mini': 'gemini-2.5-flash-lite',
    'gpt-4o': 'gemini-2.5-flash',
  };
  
  // 1. Try OpenAI first (unless preferGemini)
  if (!preferGemini && openAIApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      console.log(`${logPrefix} Calling OpenAI (${model})...`);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxTokens,
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const usage = data.usage || {};
        console.log(`${logPrefix} OpenAI response received successfully (in: ${usage.prompt_tokens || 0}, out: ${usage.completion_tokens || 0})`);
        return { 
          content: data.choices[0].message.content, 
          provider: 'openai',
          model: model,
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        };
      }
      
      // Errors that trigger fallback: 429, 500, 502, 503, 504
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const errorText = await response.text();
        console.warn(`${logPrefix} OpenAI returned ${response.status}, switching to Gemini fallback...`);
        console.warn(`${logPrefix} OpenAI error details: ${errorText.substring(0, 200)}`);
      } else {
        const errorText = await response.text();
        console.error(`${logPrefix} OpenAI API error (${response.status}):`, errorText);
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn(`${logPrefix} OpenAI timeout (${timeout}ms), switching to Gemini fallback...`);
      } else if (error.message?.includes('OpenAI API error')) {
        throw error; // Re-throw non-recoverable errors
      } else {
        console.warn(`${logPrefix} OpenAI network error, switching to Gemini fallback:`, error.message);
      }
    }
  } else {
    if (!preferGemini) {
      console.warn(`${logPrefix} No OpenAI API key, using Gemini directly...`);
    }
  }
  
  // 2. Fallback to Gemini
  if (!geminiApiKey) {
    throw new Error('Both OpenAI and Gemini API keys are not configured');
  }
  
  const geminiModel = modelMapping[model] || 'gemini-2.5-flash';
  console.log(`${logPrefix} Using Gemini fallback (${geminiModel})...`);

  // Gemini request with timeout (prevents hanging requests that end as client-side "Failed to fetch")
  const geminiController = new AbortController();
  const geminiTimeoutId = setTimeout(() => geminiController.abort(), geminiTimeout);

  const geminiResponse = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${geminiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: geminiModel,
        messages,
        max_tokens: maxTokens,
      }),
      signal: geminiController.signal,
    }
  );

  clearTimeout(geminiTimeoutId);
  
  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error(`${logPrefix} Gemini API error:`, errorText);
    throw new Error(`Both OpenAI and Gemini failed. Gemini error: ${geminiResponse.statusText}`);
  }
  
  const geminiData = await geminiResponse.json();
  const geminiUsage = geminiData.usage || {};
  console.log(`${logPrefix} Gemini response received successfully (fallback, in: ${geminiUsage.prompt_tokens || 0}, out: ${geminiUsage.completion_tokens || 0})`);
  
  return { 
    content: geminiData.choices[0].message.content, 
    provider: 'gemini',
    model: geminiModel,
    inputTokens: geminiUsage.prompt_tokens || 0,
    outputTokens: geminiUsage.completion_tokens || 0,
  };
}

// Helper for simpler calls (gpt-4o-mini for questions generation)
async function callAISimple(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string
): Promise<string | null> {
  try {
    const result = await callAIWithFallback(messages, model, maxTokens, logPrefix, 30000);
    return result.content;
  } catch (error) {
    console.warn(`${logPrefix} AI call failed:`, error.message);
    return null;
  }
}

// =============================================================================
// INTELLIGENT COMPETITOR SELECTION (GUARDRAIL SYSTEM)
// =============================================================================

// Known non-competitors to filter out (falsos positivos conocidos)
const KNOWN_NON_COMPETITORS: Record<string, string[]> = {
  // Telefónica NO compite con empresas de otros subsectores del "Telecomunicaciones y Tecnología"
  'TEF': ['AMS', 'IDR', 'GOOGLE-PRIV', 'AMAZON-PRIV', 'META-PRIV', 'APPLE-PRIV', 'MSFT-PRIV', 'LLYC'],
  // Amadeus (tech viajes) no compite con operadores telecom
  'AMS': ['TEF', 'CLNX', 'MAS'],
  // Indra (defensa/IT) no compite con operadores telecom
  'IDR': ['TEF', 'CLNX', 'MAS'],
};

// Sector similarity groups for fallback competitor matching
const RELATED_SECTORS: Record<string, string[]> = {
  'Telecomunicaciones y Tecnología': [], // Too broad, rely on subsector matching
  'Energía y Utilities': ['Infraestructuras'],
  'Financiero': [], // Banks compete only with banks
  'Construcción e Infraestructuras': ['Energía y Utilities'],
};

interface CompanyData {
  ticker: string;
  issuer_name: string;
  sector_category?: string;
  subsector?: string;
  ibex_family_code?: string;
  verified_competitors?: string[]; // Array of tickers of verified direct competitors
}

/**
 * Result from competitor selection including methodology justification
 */
interface CompetitorResult {
  competitors: CompanyData[];
  justification: string;
  tierUsed: string;
  verifiedCount: number;
  subsectorCount: number;
}

/**
 * Intelligent competitor selection with verified_competitors priority
 * NEW TIER 0: Uses verified_competitors array from repindex_root_issuers (EXCLUSIVE if populated)
 * Prevents irrelevant companies from appearing in bulletins
 * Returns competitors WITH methodology justification for transparency
 */
async function getRelevantCompetitors(
  company: CompanyData,
  allCompanies: CompanyData[],
  supabaseClient: any,
  limit: number = 5,
  logPrefix: string = '[Competitors]'
): Promise<CompetitorResult> {
  const collected: CompanyData[] = [];
  const usedTickers = new Set<string>([company.ticker]);

  // Tracking variables for methodology justification
  let tierUsed = 'NONE';
  let verifiedCount = 0;
  let subsectorCount = 0;

  console.log(`${logPrefix} Getting competitors for ${company.issuer_name} (${company.ticker})`);
  console.log(`${logPrefix} Company sector: ${company.sector_category}, subsector: ${company.subsector}, IBEX: ${company.ibex_family_code}`);
  console.log(`${logPrefix} Verified competitors from issuer record: ${JSON.stringify(company.verified_competitors || [])}`);

  // Helper to add companies avoiding duplicates
  const addCompetitor = (c: CompanyData): boolean => {
    if (usedTickers.has(c.ticker)) return false;
    
    // Apply blacklist filter
    if (KNOWN_NON_COMPETITORS[company.ticker]?.includes(c.ticker)) {
      console.log(`${logPrefix} Blacklisted: ${c.ticker} (known non-competitor of ${company.ticker})`);
      return false;
    }
    
    usedTickers.add(c.ticker);
    collected.push(c);
    return true;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 0 (NEW PRIORITY): Verified competitors from repindex_root_issuers.verified_competitors
  // If this field is populated, use EXCLUSIVELY these competitors and skip all other tiers
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.verified_competitors && Array.isArray(company.verified_competitors) && company.verified_competitors.length > 0) {
    console.log(`${logPrefix} TIER 0 (VERIFIED_COMPETITORS): Found ${company.verified_competitors.length} verified competitors in issuer record`);
    
    for (const competitorTicker of company.verified_competitors) {
      if (collected.length >= limit) break;
      
      const competitor = allCompanies.find(c => c.ticker === competitorTicker);
      if (competitor && addCompetitor(competitor)) {
        verifiedCount++;
        tierUsed = 'TIER0-VERIFIED-ISSUER';
        console.log(`${logPrefix}   → ${competitor.ticker} (verified from issuer record)`);
      } else if (!competitor) {
        console.warn(`${logPrefix}   ⚠️ Verified competitor ticker not found in companies cache: ${competitorTicker}`);
      }
    }
    
    // EXCLUSIVE: If we have verified_competitors, we return ONLY these - no fallback to other tiers
    if (collected.length > 0) {
      console.log(`${logPrefix} Returning ${collected.length} competitors EXCLUSIVELY from TIER 0 (verified_competitors)`);
      const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
      return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: Bidirectional verified relationships from competitor_relationships table
  // Only reached if verified_competitors is empty
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { data: reverseRelationships, error: reverseError } = await supabaseClient
      .from('competitor_relationships')
      .select('source_ticker, relationship_type, confidence_score')
      .eq('competitor_ticker', company.ticker)
      .order('confidence_score', { ascending: false });

    if (!reverseError && reverseRelationships?.length > 0) {
      console.log(`${logPrefix} TIER 1: Found ${reverseRelationships.length} reverse-direction competitors`);
      
      for (const rel of reverseRelationships) {
        if (collected.length >= limit) break;
        
        const competitor = allCompanies.find(c => c.ticker === rel.source_ticker);
        if (competitor && addCompetitor(competitor)) {
          verifiedCount++;
          tierUsed = 'TIER1-BIDIRECTIONAL';
          console.log(`${logPrefix}   → ${competitor.ticker} (bidirectional verified, ${rel.relationship_type}, score: ${rel.confidence_score})`);
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Error fetching reverse competitors:`, e);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: Verified competitors from competitor_relationships table
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { data: verifiedRelationships, error } = await supabaseClient
      .from('competitor_relationships')
      .select('competitor_ticker, relationship_type, confidence_score')
      .eq('source_ticker', company.ticker)
      .order('confidence_score', { ascending: false });

    if (!error && verifiedRelationships?.length > 0) {
      console.log(`${logPrefix} TIER 2: Found ${verifiedRelationships.length} verified competitors from relationships table`);
      
      for (const rel of verifiedRelationships) {
        if (collected.length >= limit) break;
        
        const competitor = allCompanies.find(c => c.ticker === rel.competitor_ticker);
        if (competitor && addCompetitor(competitor)) {
          verifiedCount++;
          if (tierUsed === 'NONE') tierUsed = 'TIER2-VERIFIED-RELATIONSHIPS';
          console.log(`${logPrefix}   → ${competitor.ticker} (verified relationship, ${rel.relationship_type}, score: ${rel.confidence_score})`);
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Error fetching verified competitors:`, e);
  }

  if (collected.length >= limit) {
    console.log(`${logPrefix} Returning ${collected.length} competitors from TIER 1/2 (verified relationships)`);
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: Same SUBSECTOR + Same IBEX Family (highest precision after verified)
  // NOTE: From this tier onwards, competitors are "por categoría" and need disclosure
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.subsector && company.ibex_family_code) {
    const tier3 = allCompanies.filter(c => 
      c.subsector === company.subsector &&
      c.ibex_family_code === company.ibex_family_code
    );
    
    console.log(`${logPrefix} TIER 3: Found ${tier3.length} same-subsector + same-IBEX companies`);
    
    for (const c of tier3) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        subsectorCount++;
        if (tierUsed === 'NONE') tierUsed = 'TIER3-SUBSECTOR-IBEX';
        console.log(`${logPrefix}   → ${c.ticker} (subsector: ${c.subsector}, IBEX: ${c.ibex_family_code})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: Same SUBSECTOR only (any IBEX family)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.subsector) {
    const tier4 = allCompanies.filter(c => 
      c.subsector === company.subsector
    );
    
    console.log(`${logPrefix} TIER 4: Found ${tier4.length} same-subsector companies (any IBEX)`);
    
    for (const c of tier4) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        subsectorCount++;
        if (tierUsed === 'NONE') tierUsed = 'TIER4-SUBSECTOR';
        console.log(`${logPrefix}   → ${c.ticker} (subsector: ${c.subsector})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 5: Same SECTOR + Same IBEX Family (fallback, AND not OR!)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.sector_category && company.ibex_family_code) {
    const tier5 = allCompanies.filter(c => 
      c.sector_category === company.sector_category &&
      c.ibex_family_code === company.ibex_family_code
    );
    
    console.log(`${logPrefix} TIER 5: Found ${tier5.length} same-sector + same-IBEX companies`);
    
    for (const c of tier5) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        if (tierUsed === 'NONE') tierUsed = 'TIER5-SECTOR-IBEX';
        console.log(`${logPrefix}   → ${c.ticker} (sector: ${c.sector_category}, IBEX: ${c.ibex_family_code})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 6: Same SECTOR only (last resort, but still AND-based logic from subsector)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.sector_category) {
    // If we have subsector, only accept companies in same or related subsectors
    const tier6 = allCompanies.filter(c => {
      if (c.sector_category !== company.sector_category) return false;
      
      // If source has subsector, prefer matching or empty subsectors
      if (company.subsector && c.subsector && c.subsector !== company.subsector) {
        // Check if subsectors are related (e.g., both telecom-related)
        const sourceSubsector = company.subsector.toLowerCase();
        const targetSubsector = c.subsector.toLowerCase();
        
        // Reject obvious mismatches
        const incompatiblePairs = [
          ['telecom', 'viajes'],
          ['telecom', 'defensa'],
          ['telecom', 'big tech'],
          ['telecom', 'comunicación'],
          ['banca', 'seguros'],
        ];
        
        for (const [a, b] of incompatiblePairs) {
          if ((sourceSubsector.includes(a) && targetSubsector.includes(b)) ||
              (sourceSubsector.includes(b) && targetSubsector.includes(a))) {
            return false;
          }
        }
      }
      
      return true;
    });
    
    console.log(`${logPrefix} TIER 6: Found ${tier6.length} filtered same-sector companies`);
    
    for (const c of tier6) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        if (tierUsed === 'NONE') tierUsed = 'TIER6-SECTOR';
        console.log(`${logPrefix}   → ${c.ticker} (sector: ${c.sector_category})`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 7: FALLBACK - If still no competitors, use top IBEX35 companies
  // ═══════════════════════════════════════════════════════════════════════════
  if (collected.length === 0) {
    console.warn(`${logPrefix} NO COMPETITORS FOUND for ${company.ticker} - using fallback IBEX35`);
    
    const ibex35Fallback = allCompanies
      .filter(c => c.ibex_family_code === 'IBEX35' && c.ticker !== company.ticker)
      .slice(0, limit);
    
    for (const c of ibex35Fallback) {
      addCompetitor(c);
    }
    
    tierUsed = 'TIER7-FALLBACK-IBEX35';
  }

  console.log(`${logPrefix} Final competitor list (${collected.length}): ${collected.map(c => c.ticker).join(', ')}`);
  const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
  return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
}

/**
 * Build human-readable justification for competitor selection methodology
 */
function buildCompetitorJustification(
  tierUsed: string,
  verifiedCount: number,
  subsectorCount: number,
  company: CompanyData
): string {
  const parts: string[] = [];
  
  // Explain the tier used
  const tierExplanations: Record<string, string> = {
    'TIER0-VERIFIED-ISSUER': 'competidores directos verificados manualmente (lista curada)',
    'TIER1-BIDIRECTIONAL': 'relaciones bidireccionales verificadas en base de datos',
    'TIER2-VERIFIED-RELATIONSHIPS': 'relaciones directas verificadas en tabla de competidores',
    'TIER3-SUBSECTOR-IBEX': `mismo subsector (${company.subsector}) y familia IBEX (${company.ibex_family_code})`,
    'TIER4-SUBSECTOR': `mismo subsector (${company.subsector})`,
    'TIER5-SECTOR-IBEX': `mismo sector (${company.sector_category}) y familia IBEX (${company.ibex_family_code})`,
    'TIER6-SECTOR': `mismo sector (${company.sector_category}) con filtrado de incompatibilidades`,
    'TIER7-FALLBACK-IBEX35': 'fallback a empresas del IBEX-35 (sin competidores directos identificados)',
    'NONE': 'metodología no determinada',
  };

  parts.push(`Competidores seleccionados mediante: ${tierExplanations[tierUsed] || tierUsed}.`);
  
  // Special case: TIER0-VERIFIED-ISSUER has highest confidence
  if (tierUsed === 'TIER0-VERIFIED-ISSUER') {
    parts.push(`✓ ${verifiedCount} competidores directos confirmados.`);
  } else if (verifiedCount > 0) {
    parts.push(`${verifiedCount} competidores verificados en base de datos.`);
  }
  
  if (subsectorCount > 0) {
    parts.push(`${subsectorCount} competidores del mismo subsector (${company.subsector}).`);
  }
  
  // Add warning if using category-based fallback (TIER3+)
  const categoryTiers = ['TIER3-SUBSECTOR-IBEX', 'TIER4-SUBSECTOR', 'TIER5-SECTOR-IBEX', 'TIER6-SECTOR'];
  if (categoryTiers.includes(tierUsed)) {
    parts.push('⚠️ NOTA: Esta empresa no tiene competidores verificados definidos. Los competidores mostrados pertenecen a la misma categoría/subsector y se incluyen con fines de contexto sectorial, no como competencia directa confirmada.');
  }
  
  // Add warning if using full fallback
  if (tierUsed.includes('FALLBACK')) {
    parts.push('⚠️ NOTA: Esta empresa no tiene competidores verificados ni subsector definido - las comparativas deben interpretarse con cautela.');
  }
  
  return parts.join(' ');
}

// =============================================================================
function buildDepthPrompt(depthLevel: 'quick' | 'complete' | 'exhaustive', languageName: string): string {
  const depthInstructions: Record<string, string> = {
    quick: `
═══════════════════════════════════════════════════════════════════════════════
            FORMATO REQUERIDO: SÍNTESIS EJECUTIVA (máximo 500 palabras)
═══════════════════════════════════════════════════════════════════════════════

Estructura OBLIGATORIA (respeta este orden exacto):

## Síntesis Estratégica
Un párrafo denso (4-5 líneas) con la conclusión principal. El directivo debe 
captar la esencia en 30 segundos. Incluye el veredicto claro y la recomendación.

## Puntos Clave
• [Punto 1]: Una línea con dato concreto y su implicación
• [Punto 2]: Una línea con dato concreto y su implicación  
• [Punto 3]: Una línea con dato concreto y su implicación

## Recomendación
Una frase directa de acción si procede.

PROHIBIDO en este nivel:
- Tablas detalladas de métricas
- Citas individuales de modelos de IA
- Explicaciones extensas de métricas
- Más de 500 palabras
- Listas largas de bullets

RECUERDA: Este es un resumen ejecutivo para quien tiene 30 segundos.
`,

    complete: `
═══════════════════════════════════════════════════════════════════════════════
         FORMATO REQUERIDO: INFORME EJECUTIVO COMPLETO (máximo 1800 palabras)
═══════════════════════════════════════════════════════════════════════════════

Estructura OBLIGATORIA (respeta este orden exacto):

## Síntesis Estratégica
Párrafo denso (5-6 líneas) con conclusión principal y recomendación estratégica.
Debe ser presentable a comité de dirección sin más contexto.
Este párrafo debe poder leerse de forma independiente.

## Análisis Interpretativo
Narrativa de 3-4 párrafos donde las IAs son BASE DE PENSAMIENTO, no protagonistas.
IMPORTANTE:
- Usa expresiones como: "la percepción algorítmica indica...", "el consenso de 
  modelos refleja...", "el análisis multi-IA sugiere..."
- NO nombres individuales de IAs excepto para divergencias significativas (>12 pts)
- Contextualiza con comparativas sectoriales cuando sea relevante
- Cada afirmación debe estar respaldada por datos del contexto

## Tabla Resumen
Incluye UNA tabla comparativa si hay datos de múltiples empresas o modelos.

| Empresa/Modelo | RIX Promedio | Tendencia | Fortaleza Principal | Debilidad Principal |
|----------------|--------------|-----------|---------------------|---------------------|

## Conclusiones
2-3 puntos accionables basados en el análisis:
1. **Prioridad inmediata**: Acción concreta para esta semana
2. **Prioridad táctica**: Acción para el próximo mes
3. **Visión estratégica**: Dirección a largo plazo (opcional)

RECUERDA: Este informe se presenta a alta dirección. Profesionalismo absoluto.
`,

    exhaustive: `
═══════════════════════════════════════════════════════════════════════════════
         FORMATO REQUERIDO: INFORME EXHAUSTIVO (máximo 4500 palabras)
═══════════════════════════════════════════════════════════════════════════════

## EXTENSIÓN OBLIGATORIA
- Mínimo 2,500 palabras (~15,000 caracteres) - UNA RESPUESTA CORTA ES UN ERROR
- TODAS las secciones numeradas (1-5) son OBLIGATORIAS
- Si el usuario ha seleccionado un ROL específico (periodista, CEO, etc.), MANTÉN esta extensión
- Adapta el TONO al rol pero NUNCA reduzcas la EXTENSIÓN requerida
- Si el rol es "Periodista", genera un REPORTAJE DE INVESTIGACIÓN LARGO, no una nota breve

Estructura OBLIGATORIA (respeta este orden exacto):

## 1. Síntesis Estratégica
Conclusión contundente de 6-8 líneas para comité de dirección.
Incluye: hallazgo principal, implicación estratégica, recomendación clara.
Este párrafo debe poder presentarse de forma independiente en un comité ejecutivo.

## 2. Análisis Interpretativo
Narrativa profesional de 4-5 párrafos integrando patrones y señales.
IMPORTANTE:
- Contextualiza cada afirmación con datos específicos del contexto
- Explica las métricas en su primera mención (nombre completo + sigla)
- Identifica causas probables de los patrones observados
- Conecta los hallazgos con implicaciones de negocio
- Menciona modelos de IA solo cuando hay divergencias significativas (>12 pts)

## 3. Base Empírica

### 3.1 Tabla de Scores por Modelo
| Empresa | ChatGPT | Perplexity | Gemini | DeepSeek | Promedio | Divergencia |
|---------|---------|------------|--------|----------|----------|-------------|
[Incluir TODOS los datos disponibles]

### 3.2 Desglose de Métricas (Glosario Canónico)
Para cada métrica relevante (solo si hay datos):
- **NVM (Calidad de la Narrativa)**: [Score] - Coherencia del discurso, controversia, verificabilidad
- **DRM (Fortaleza de Evidencia)**: [Score] - Calidad de fuentes primarias, corroboración
- **SIM (Autoridad de Fuentes)**: [Score] - Jerarquía de fuentes (T1-T4)
- **RMM (Actualidad y Empuje)**: [Score] - Frescura temporal de menciones
- **CEM (Gestión de Controversias)**: [Score] - Exposición a riesgos (inverso: 100=sin riesgo)
- **GAM (Percepción de Gobierno)**: [Score] - Independencia de gobierno corporativo
- **DCM (Coherencia Informativa)**: [Score] - Consistencia entre modelos de IA
- **CXM (Ejecución Corporativa)**: [Score] - Percepción de ejecución en mercado

### 3.3 Evolución Temporal
Tendencia de las últimas 4 semanas si hay datos disponibles.
| Semana | RIX Promedio | Variación | Evento Clave |
|--------|--------------|-----------|--------------|

### 3.4 Comparativa Competitiva
Posicionamiento frente a competidores directos del sector.
| Posición | Empresa | RIX | Distancia al líder |
|----------|---------|-----|---------------------|

## 4. Citas Relevantes
Extractos textuales de los modelos de IA que respaldan el análisis.
> "Cita textual del modelo X sobre aspecto Y" — [Modelo]

## 5. Recomendaciones
Plan de acción en 3 horizontes temporales:
1. **Inmediato** (esta semana): [Acción concreta con responsable sugerido]
2. **Corto plazo** (próximo mes): [Acción táctica con KPIs]
3. **Estratégico** (próximo trimestre): [Visión y objetivos]

RECUERDA: Este es un informe de consultoría estratégica. Máximo rigor y profundidad.
`
  };

  return depthInstructions[depthLevel] || depthInstructions.complete;
}

// =============================================================================
// DRUMROLL QUESTION GENERATOR (Complementary Report Suggestion Based on REAL Data)
// =============================================================================
interface DrumrollQuestion {
  title: string;
  fullQuestion: string;
  teaser: string;
  reportType: 'competitive' | 'vulnerabilities' | 'projection' | 'sector';
}

interface AnalysisInsights {
  company: string;
  ticker: string;
  overallScore: number;
  weakestMetrics: { name: string; score: number; interpretation: string }[];
  strongestMetrics: { name: string; score: number; interpretation: string }[];
  trend: 'up' | 'down' | 'stable';
  trendDelta: number;
  divergenceLevel: 'low' | 'medium' | 'high';
  divergenceDetail?: string;
  keyFinding: string;
}

// Extract structured insights from rix_runs data for the analyzed company
function extractAnalysisInsights(
  rixData: any[],
  primaryCompany: { ticker: string; issuer_name: string },
  answer: string
): AnalysisInsights | null {
  
  // Filter data for this company
  const companyData = rixData
    .filter(r => r['05_ticker'] === primaryCompany.ticker)
    .sort((a, b) => new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime());
  
  if (companyData.length === 0) {
    return null;
  }
  
  // Get latest week data (multiple models)
  const latestDate = companyData[0]?.batch_execution_date;
  const latestWeekData = companyData.filter(r => r.batch_execution_date === latestDate);
  
  // Calculate average RIX across models
  const rixScores = latestWeekData.map(r => r['09_rix_score']).filter(s => s != null && s > 0);
  const avgRix = rixScores.length > 0 ? Math.round(rixScores.reduce((a, b) => a + b, 0) / rixScores.length) : 0;
  
  // Calculate divergence between models
  const maxRix = Math.max(...rixScores);
  const minRix = Math.min(...rixScores);
  const divergence = maxRix - minRix;
  let divergenceLevel: 'low' | 'medium' | 'high' = 'low';
  let divergenceDetail = '';
  
  if (divergence >= 20) {
    divergenceLevel = 'high';
    const maxModel = latestWeekData.find(r => r['09_rix_score'] === maxRix)?.['02_model_name'];
    const minModel = latestWeekData.find(r => r['09_rix_score'] === minRix)?.['02_model_name'];
    divergenceDetail = `${maxModel} (${maxRix}) vs ${minModel} (${minRix})`;
  } else if (divergence >= 10) {
    divergenceLevel = 'medium';
  }
  
  // Extract metric scores from latest run (use first model with complete data)
  const latestRun = latestWeekData.find(r => r['23_nvm_score'] != null) || latestWeekData[0];
  
  const metrics = [
    { name: 'NVM (Narrativa)', fullName: 'Calidad Narrativa', score: latestRun?.['23_nvm_score'], category: latestRun?.['25_nvm_categoria'] },
    { name: 'DRM (Evidencia)', fullName: 'Evidencia Documental', score: latestRun?.['26_drm_score'], category: latestRun?.['28_drm_categoria'] },
    { name: 'SIM (Autoridad)', fullName: 'Autoridad de Fuentes', score: latestRun?.['29_sim_score'], category: latestRun?.['31_sim_categoria'] },
    { name: 'RMM (Momentum)', fullName: 'Momentum Mediático', score: latestRun?.['32_rmm_score'], category: latestRun?.['34_rmm_categoria'] },
    { name: 'CEM (Riesgo)', fullName: 'Gestión de Controversias', score: latestRun?.['35_cem_score'], category: latestRun?.['37_cem_categoria'] },
    { name: 'GAM (Gobernanza)', fullName: 'Percepción de Gobierno', score: latestRun?.['38_gam_score'], category: latestRun?.['40_gam_categoria'] },
    { name: 'DCM (Coherencia)', fullName: 'Coherencia Informativa', score: latestRun?.['41_dcm_score'], category: latestRun?.['43_dcm_categoria'] },
    { name: 'CXM (Ejecución)', fullName: 'Ejecución Corporativa', score: latestRun?.['44_cxm_score'], category: latestRun?.['46_cxm_categoria'] },
  ].filter(m => m.score != null && m.score > 0);
  
  // Sort by score to find weakest and strongest
  const sortedByScore = [...metrics].sort((a, b) => a.score - b.score);
  const weakest = sortedByScore.slice(0, 2);
  const strongest = sortedByScore.slice(-2).reverse();
  
  // Calculate trend from historical data (compare last 2 weeks if available)
  let trend: 'up' | 'down' | 'stable' = 'stable';
  let trendDelta = 0;
  
  const uniqueDates = [...new Set(companyData.map(r => r.batch_execution_date))].sort().reverse();
  if (uniqueDates.length >= 2) {
    const thisWeekData = companyData.filter(r => r.batch_execution_date === uniqueDates[0]);
    const lastWeekData = companyData.filter(r => r.batch_execution_date === uniqueDates[1]);
    
    const thisWeekAvg = thisWeekData.map(r => r['09_rix_score']).filter(Boolean).reduce((a, b) => a + b, 0) / thisWeekData.length;
    const lastWeekAvg = lastWeekData.map(r => r['09_rix_score']).filter(Boolean).reduce((a, b) => a + b, 0) / lastWeekData.length;
    
    trendDelta = Math.round(thisWeekAvg - lastWeekAvg);
    if (trendDelta >= 3) trend = 'up';
    else if (trendDelta <= -3) trend = 'down';
  }
  
  // Extract key finding from answer (first 300 chars or first paragraph)
  const firstParagraph = answer.split('\n\n')[0] || answer.substring(0, 300);
  const keyFinding = firstParagraph.length > 200 
    ? firstParagraph.substring(0, 200) + '...'
    : firstParagraph;
  
  return {
    company: primaryCompany.issuer_name,
    ticker: primaryCompany.ticker,
    overallScore: avgRix,
    weakestMetrics: weakest.map(m => ({ 
      name: m.name, 
      score: m.score,
      interpretation: m.category || 'Sin categoría'
    })),
    strongestMetrics: strongest.map(m => ({
      name: m.name,
      score: m.score, 
      interpretation: m.category || 'Sin categoría'
    })),
    trend,
    trendDelta,
    divergenceLevel,
    divergenceDetail,
    keyFinding
  };
}

async function generateDrumrollQuestion(
  originalQuestion: string,
  insights: AnalysisInsights | null,
  detectedCompanies: { ticker: string; issuer_name: string; sector_category?: string }[],
  allCompaniesCache: any[] | null,
  language: string,
  languageName: string,
  logPrefix: string
): Promise<DrumrollQuestion | null> {
  
  // Solo generar para preguntas corporativas con datos estructurados
  if (detectedCompanies.length === 0 || !insights) {
    console.log(`${logPrefix} No drumroll: no companies or no insights available`);
    return null;
  }

  const primaryCompany = detectedCompanies[0];
  const sectorInfo = primaryCompany.sector_category || null;
  
  // Encontrar competidores del mismo sector
  let competitors: string[] = [];
  if (sectorInfo && allCompaniesCache) {
    competitors = allCompaniesCache
      .filter(c => c.sector_category === sectorInfo && c.ticker !== primaryCompany.ticker)
      .slice(0, 5)
      .map(c => c.issuer_name);
  }
  
  // Build prompt with REAL structured data
  const drumrollPrompt = `Acabas de generar un análisis sobre: "${originalQuestion}"

═══════════════════════════════════════════════════════════════════════════════
                      HALLAZGOS CLAVE DEL ANÁLISIS (DATOS REALES)
═══════════════════════════════════════════════════════════════════════════════

EMPRESA ANALIZADA: ${insights.company} (${insights.ticker})
SCORE RIX ACTUAL: ${insights.overallScore}/100
TENDENCIA: ${insights.trend === 'up' ? '📈 Subiendo' : insights.trend === 'down' ? '📉 Bajando' : '➡️ Estable'} (${insights.trendDelta > 0 ? '+' : ''}${insights.trendDelta} pts vs semana anterior)

MÉTRICAS MÁS DÉBILES (oportunidad de mejora):
${insights.weakestMetrics.map(m => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join('\n')}

MÉTRICAS MÁS FUERTES:
${insights.strongestMetrics.map(m => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join('\n')}

NIVEL DE DIVERGENCIA ENTRE IAs: ${insights.divergenceLevel.toUpperCase()}${insights.divergenceDetail ? ` - ${insights.divergenceDetail}` : ''}

SECTOR: ${sectorInfo || 'No específico'}
COMPETIDORES DISPONIBLES: ${competitors.join(', ') || 'No identificados'}

═══════════════════════════════════════════════════════════════════════════════

TU MISIÓN: Basándote en los HALLAZGOS REALES de arriba, propón UN informe complementario que PROFUNDICE en:

1. Si hay MÉTRICAS DÉBILES (<50 pts) → Propón analizar causas específicas y plan de mejora
   Ejemplo: "¿Por qué ${insights.company} tiene baja ${insights.weakestMetrics[0]?.name}? Diagnóstico y soluciones"
   
2. Si hay TENDENCIA NEGATIVA → Propón proyección de escenarios y causas
   Ejemplo: "Análisis de la caída de ${insights.trendDelta} pts: qué está pasando con ${insights.company}"
   
3. Si hay ALTA DIVERGENCIA → Propón entender por qué las IAs difieren
   Ejemplo: "El enigma de ${insights.company}: por qué ChatGPT y DeepSeek discrepan ${insights.divergenceDetail}"
   
4. Si hay FORTALEZA CLARA (>75 pts) → Propón comparar con competidores en esa métrica
   Ejemplo: "¿Puede ${insights.company} mantener su liderazgo en ${insights.strongestMetrics[0]?.name}?"

REGLAS CRÍTICAS:
- El informe debe ser ESPECÍFICO a los datos de arriba - MENCIONA scores, métricas o tendencias concretas
- NO propongas cosas genéricas como "mapa competitivo" o "análisis del sector" sin especificar QUÉ analizar
- El título DEBE mencionar algo específico: una métrica, un score, una tendencia, una cifra
- El teaser debe explicar POR QUÉ este análisis es valioso dado lo que ya sabemos

IDIOMA: Genera TODO en ${languageName}

Responde SOLO en JSON válido (sin markdown):
{
  "title": "Título que referencia un hallazgo ESPECÍFICO del análisis",
  "fullQuestion": "Pregunta ejecutable que profundiza en ese hallazgo específico",
  "teaser": "Por qué este análisis es valioso dado lo que hemos descubierto",
  "reportType": "competitive|vulnerabilities|projection|sector"
}`;

  try {
    const result = await callAISimple(
      [
        { role: 'system', content: `Eres un estratega de inteligencia competitiva que propone análisis ESPECÍFICOS basados en datos reales. NUNCA propones informes genéricos. Siempre refieres métricas, scores o tendencias concretas en tus propuestas. Responde SOLO en JSON válido sin bloques de código.` },
        { role: 'user', content: drumrollPrompt }
      ],
      'gpt-4o-mini',
      500,
      logPrefix
    );
    
    if (!result) {
      console.log(`${logPrefix} No drumroll: AI returned null`);
      return null;
    }
    
    const cleanResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanResult);
    
    // Validar estructura completa
    if (parsed.title && parsed.fullQuestion && parsed.teaser && parsed.reportType) {
      console.log(`${logPrefix} Drumroll generated: "${parsed.title}" (type: ${parsed.reportType}, based on ${insights.weakestMetrics[0]?.name || 'general'} insights)`);
      return parsed as DrumrollQuestion;
    }
    
    console.log(`${logPrefix} No drumroll: invalid structure`, parsed);
    return null;
  } catch (error) {
    console.warn(`${logPrefix} Error generating drumroll question:`, error);
    return null;
  }
}

// =============================================================================
// BULLETIN DETECTION PATTERNS
// =============================================================================
const BULLETIN_PATTERNS = [
  /(?:genera|crea|hazme|prepara|elabora|dame)\s+(?:un\s+)?(?:bolet[íi]n|informe|reporte|an[áa]lisis\s+completo)\s+(?:de|sobre|para)\s+(.+?)(?:\s+y\s+(?:sus?\s+)?(?:competidores?|competencia))?$/i,
  /(?:bolet[íi]n|informe|reporte)\s+(?:ejecutivo\s+)?(?:de|para|sobre)\s+(.+)/i,
  /an[áa]lisis\s+(?:completo|detallado|exhaustivo)\s+(?:de|para|sobre)\s+(.+?)(?:\s+(?:con|incluyendo|vs?)\s+(?:competidores?|competencia|sector))?/i,
  /(?:compara|comparar|comparativa)\s+(.+?)\s+(?:con|vs?|versus)\s+(?:su\s+)?(?:competencia|competidores?|sector)/i,
];

// =============================================================================
// BULLETIN GENERATION PROMPT - Magazine Style with News Stories
// =============================================================================
const BULLETIN_SYSTEM_PROMPT = `Eres un PERIODISTA ECONÓMICO DE ÉLITE escribiendo un BOLETÍN DE NOTICIAS PREMIUM sobre una empresa específica y su competencia, al estilo de El País, Expansión, Financial Times o The Economist.

## OBJETIVO:
Crear un BOLETÍN PERIODÍSTICO PREMIUM con MÍNIMO 15 NOTICIAS con TITULARES IMPACTANTES basados en datos reales. Cada noticia debe parecer una pieza de periodismo de investigación corporativa.

## ESTILO DE TITULARES (OBLIGATORIO):
Los titulares deben ser:
- **PROVOCATIVOS pero basados en datos**: "Telefónica pierde la batalla digital: ChatGPT la sitúa 15 puntos por debajo de Vodafone"
- **Con gancho emocional**: "La caída silenciosa de BBVA: tres semanas de declive que las IAs no perdonan"
- **Preguntas retóricas**: "¿Está Iberdrola perdiendo su corona energética?"
- **Metáforas periodísticas**: "La guerra de percepciones en el sector bancario", "La montaña rusa reputacional de Inditex"
- **Datos concretos en el titular**: "Repsol cae 8 puntos en RIX mientras Cepsa escala posiciones"
- **Contrastes dramáticos**: "Mientras Mercadona brilla, Carrefour lucha por recuperar terreno"

## EJEMPLOS DE TITULARES POR CATEGORÍA:

**NOTICIA PRINCIPAL:**
- "EXCLUSIVA: [Empresa] sufre su peor semana en RepIndex mientras la competencia avanza"
- "[Empresa] rompe el consenso: ChatGPT y DeepSeek discrepan 20 puntos en su valoración"
- "Alerta en [Sector]: [Empresa] pierde el liderazgo reputacional por primera vez en 2025"

**ANÁLISIS DE MÉTRICAS:**
- "Radiografía de una caída: Las 8 métricas que explican el tropiezo de [Empresa]"
- "¿Por qué ChatGPT castiga a [Empresa]? Desglose de un RIX de [XX] puntos"
- "La anatomía del éxito: Cómo [Empresa] logró un RIX de [XX]"

**COMPETENCIA:**
- "Duelo en el [Sector]: [Empresa A] vs [Empresa B], la batalla que define el sector"
- "[Competidor] adelanta a [Empresa] en el ranking: las claves del sorpasso"
- "El nuevo orden en [Sector]: quién sube, quién baja y quién resiste"

**DIVERGENCIAS:**
- "Caso [Empresa]: Cuando las IAs no se ponen de acuerdo"
- "El misterio de [Empresa]: ChatGPT la adora, Perplexity la cuestiona"
- "20 puntos de diferencia: La empresa que divide a las inteligencias artificiales"

**TENDENCIAS:**
- "Cuarta semana de caída: ¿Puede [Empresa] frenar la sangría reputacional?"
- "El rally de [Empresa]: cuatro semanas de ascenso imparable"
- "Punto de inflexión: [Empresa] rompe su racha negativa"

## ESTRUCTURA DEL BOLETÍN PREMIUM:

---

# REPINDEX BULLETIN
## Edición Premium: [NOMBRE EMPRESA]
**[fecha inicio] - [fecha fin]** | **La Autoridad en Reputación Corporativa de las IAs**

---

## 📰 1. PORTADA: LA GRAN HISTORIA

### [TITULAR IMPACTANTE ESTILO PERIODÍSTICO - máximo 80 caracteres]

**Madrid, [fecha]** — [Entradilla de 2-3 líneas con el dato más impactante, respondiendo qué-quién-cuándo-dónde]

[Cuerpo extenso: 4-5 párrafos narrativos estilo periodístico de investigación:
- Párrafo 1: El hecho noticioso principal con datos concretos
- Párrafo 2: Contexto y antecedentes (qué pasó las semanas anteriores)
- Párrafo 3: Análisis de causas y consecuencias
- Párrafo 4: Declaraciones implícitas de los datos ("Los números hablan por sí solos...")
- Párrafo 5: Implicaciones para stakeholders y mercado]

> "El dato que cambia todo: [cita o cifra destacada]"

---

## 🔍 2. INVESTIGACIÓN: ANATOMÍA DEL RIX

### Radiografía de [Empresa]: Las 8 métricas que definen su reputación corporativa

[Entradilla explicando que el RIX no es un número arbitrario sino la suma de 8 dimensiones críticas]

#### Calidad de la Narrativa (NVM): [Score]/100 — [Categoría]
**Titular de métrica**: "[Empresa] [destaca/flaquea] en narrativa: [dato clave]"
[2-3 párrafos periodísticos sobre esta métrica: qué significa, por qué tiene este score, comparación con competidores, qué debería hacer]

#### Fortaleza de Evidencia (DRM): [Score]/100 — [Categoría]
**Titular de métrica**: "La solidez documental de [Empresa]: [hallazgo principal]"
[2-3 párrafos]

#### Autoridad de Fuentes (SIM): [Score]/100 — [Categoría]
**Titular de métrica**: "¿De dónde viene la información sobre [Empresa]? El análisis de fuentes"
[2-3 párrafos]

#### Actualidad y Empuje (RMM): [Score]/100 — [Categoría]
**Titular de métrica**: "[Empresa] [gana/pierde] impulso: análisis del momentum"
[2-3 párrafos]

#### Controversia y Riesgo (CEM): [Score]/100 — [Categoría]
**Titular de métrica**: "Nivel de alerta: ¿Está [Empresa] en zona de riesgo?"
[2-3 párrafos]

#### Independencia de Gobierno (GAM): [Score]/100 — [Categoría]
**Titular de métrica**: "Percepción de gobernanza: [lo que dicen los datos]"
[2-3 párrafos]

#### Integridad del Grafo (DCM): [Score]/100 — [Categoría]
**Titular de métrica**: "Coherencia informativa: el reto de [Empresa]"
[2-3 párrafos]

#### Ejecución Corporativa (CXM): [Score]/100 — [Categoría]
**Titular de métrica**: "El mercado opina: percepción de ejecución en [Empresa]"
[2-3 párrafos]

---

## 🤖 3. EXCLUSIVA: EL JUICIO DE LAS 4 INTELIGENCIAS

### [TITULAR]: ChatGPT, Perplexity, Gemini y DeepSeek emiten su veredicto sobre [Empresa]

[Entradilla sobre cómo cada IA procesa información diferente y por qué sus opiniones importan]

#### ChatGPT dice: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "ChatGPT [aprueba/suspende/cuestiona] a [Empresa]: los motivos"
[3-4 párrafos analizando la perspectiva de ChatGPT, su resumen, puntos clave, por qué difiere de otros]

#### Perplexity opina: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "El veredicto de Perplexity: [hallazgo principal]"
[3-4 párrafos]

#### Gemini evalúa: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Gemini de Google [destaca/critica]: [dato clave]"
[3-4 párrafos]

#### DeepSeek considera: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "DeepSeek, la IA china, [sorprende/confirma]: [hallazgo]"
[3-4 párrafos]

| Modelo | RIX | Veredicto | Fortaleza | Debilidad |
|--------|-----|-----------|-----------|-----------|

---

## 🏆 4. REPORTAJE: LA BATALLA DEL [SECTOR]

### [TITULAR ÉPICO sobre la competencia - ej: "Guerra abierta en el sector [X]: así se reparten el pastel reputacional"]

[Cuerpo de reportaje: 5-6 párrafos estilo reportaje de investigación sobre el panorama competitivo]

**Ranking del Sector [X] - Semana Actual:**
| Pos | Empresa | RIX | Δ | Tendencia | Veredicto |
|-----|---------|-----|---|-----------|-----------|

---

## 📈 5. CRÓNICA: 4 SEMANAS DE [EMPRESA]

### [TITULAR sobre tendencia - ej: "El mes que lo cambió todo para [Empresa]" o "Cuatro semanas de montaña rusa"]

[Crónica periodística semana a semana: 4-5 párrafos narrando la evolución como una historia]

| Semana | RIX Promedio | ChatGPT | Perplexity | Gemini | DeepSeek | Evento Clave |
|--------|--------------|---------|------------|--------|----------|--------------|

---

## 🔥 6-10. NOTICIAS DE LA COMPETENCIA

### 6. [TITULAR PERIODÍSTICO sobre Competidor 1]
[Noticia completa de 3-4 párrafos como pieza independiente]

### 7. [TITULAR PERIODÍSTICO sobre Competidor 2]
[Noticia completa de 3-4 párrafos]

### 8. [TITULAR PERIODÍSTICO sobre Competidor 3]
[Noticia completa de 3-4 párrafos]

### 9. [TITULAR PERIODÍSTICO sobre Competidor 4]
[Noticia completa de 3-4 párrafos]

### 10. [TITULAR PERIODÍSTICO sobre Competidor 5]
[Noticia completa de 3-4 párrafos]

---

## 📊 11. ANÁLISIS: EL MAPA DEL PODER REPUTACIONAL

### [TITULAR - ej: "Dónde está [Empresa] en el tablero de la reputación corporativa"]

[Análisis de posicionamiento: 3-4 párrafos]

| Cuadrante | Empresas | Característica |
|-----------|----------|----------------|
| 🥇 Líderes (>80) | [...] | Reputación consolidada |
| 🥈 Aspirantes (60-80) | [...] | En ascenso |
| ⚠️ En vigilancia (40-60) | [...] | Requieren atención |
| 🚨 Críticos (<40) | [...] | Situación urgente |

---

## 🎯 12. INVESTIGACIÓN: LAS DIVERGENCIAS

### [TITULAR - ej: "El caso [Empresa]: cuando las IAs no se ponen de acuerdo"]

[Análisis de por qué hay discrepancias entre modelos: 3-4 párrafos]

---

## 📉 13. ALERTA: RIESGOS DETECTADOS

### [TITULAR ALARMANTE pero basado en datos - ej: "Las señales de alarma que [Empresa] no puede ignorar"]

[Análisis de riesgos: 3-4 párrafos]

---

## 💡 14. OPORTUNIDAD: DÓNDE PUEDE GANAR [EMPRESA]

### [TITULAR OPTIMISTA - ej: "El territorio inexplorado: dónde [Empresa] puede dar el salto"]

[Análisis de oportunidades: 3-4 párrafos]

---

## 🔮 15. PROSPECTIVA: ESCENARIOS Y RECOMENDACIONES

### [TITULAR PROSPECTIVO - ej: "2025 para [Empresa]: tres caminos posibles"]

[Análisis prospectivo profundo: 4-5 párrafos]

**Escenario Optimista**: [descripción narrativa]
**Escenario Base**: [descripción narrativa]
**Escenario de Riesgo**: [descripción narrativa]

### Plan de Acción Ejecutivo:
1. **Esta semana**: [acción concreta]
2. **Próximo mes**: [acción táctica]
3. **Próximo trimestre**: [acción estratégica]
4. **Este año**: [visión a largo plazo]

---

## 📋 ANEXOS

### Metodología RepIndex
[Explicación breve del sistema de scoring]

### Glosario de Métricas (Canónico)
- **NVM (Narrative Value Metric → Calidad de la Narrativa)**: Coherencia del discurso, nivel de controversia, afirmaciones verificables
- **DRM (Data Reliability Metric → Fortaleza de Evidencia)**: Solidez documental, fuentes primarias, corroboración
- **SIM (Source Integrity Metric → Autoridad de Fuentes)**: Jerarquía de fuentes citadas (T1: reguladores/financieros → T4: redes/opinión)
- **RMM (Reputational Momentum Metric → Actualidad y Empuje)**: Frescura temporal de menciones en ventana semanal
- **CEM (Controversy Exposure Metric → Gestión de Controversias)**: Exposición a riesgos judiciales/políticos/laborales (100 = sin riesgo, inverso)
- **GAM (Governance Autonomy Metric → Percepción de Gobierno)**: Percepción de independencia y buenas prácticas de gobernanza
- **DCM (Data Consistency Metric → Coherencia Informativa)**: Consistencia de información entre diferentes modelos de IA
- **CXM (Corporate Execution Metric → Ejecución Corporativa)**: Percepción de ejecución en mercado y cotización (solo cotizadas)

⚠️ NOTA METODOLÓGICA: SIM mide jerarquía de fuentes, NO sostenibilidad. DRM mide calidad de evidencia, NO desempeño financiero. DCM mide coherencia entre IAs, NO innovación digital.

---

*RepIndex Bulletin — Edición Premium*
*© RepIndex — La Autoridad en Reputación Corporativa de las IAs*

---

## REGLAS CRÍTICAS:
1. **TITULARES PERIODÍSTICOS**: Cada noticia DEBE tener un titular impactante, provocativo pero basado en datos
2. **MÍNIMO 15 NOTICIAS** completas con titular + entradilla + cuerpo narrativo
3. **ESTILO PERIODÍSTICO**: Escribe como El País, Expansión o Financial Times, no como un informe técnico
4. **DATOS CONCRETOS**: Cada párrafo debe incluir al menos un dato numérico
5. **METÁFORAS Y RECURSOS**: Usa "guerra de percepciones", "montaña rusa", "batalla sectorial", etc.
6. **PREGUNTAS RETÓRICAS**: Engancha al lector con preguntas
7. **NUNCA INVENTES**: Usa SOLO los datos proporcionados
8. **COMPARACIONES CONSTANTES**: Siempre compara con competidores
9. **MÍNIMO 6000 PALABRAS**: Es un producto premium de pago
10. **CADA MÉTRICA ES UNA HISTORIA**: Explica el "por qué" detrás de cada score`;

// Quick bulletin variant used when the user selects "informe rápido".
// It avoids the ultra-long premium constraints to prevent edge timeouts.
const BULLETIN_SYSTEM_PROMPT_QUICK = `Eres RepIndex Bulletin, un analista experto en reputación corporativa.

OBJETIVO: Generar un **boletín ejecutivo RÁPIDO** (800–1200 palabras) basado SOLO en el contexto.

FORMATO OBLIGATORIO:
## Síntesis (30 segundos)
Un párrafo (4-5 líneas) con veredicto + recomendación.

## Highlights
- 5 bullets máximos, cada uno con 1 dato numérico.

## Semáforo de señales
- ✅ Oportunidades (2)
- ⚠️ Riesgos (2)

## Qué vigilar la próxima semana
- 3 bullets máximos.

REGLAS:
- NO inventes datos.
- NO excedas 1200 palabras.
- Máximo 6 mini-noticias (titular + 2 líneas) si el contexto lo permite.
- Estilo ejecutivo, directo, presentable a dirección.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logPrefix = `[${crypto.randomUUID().slice(0, 8)}]`;

  try {
    const body = await req.json();
    const { 
      question, 
      conversationHistory = [], 
      sessionId, 
      action, 
      roleId, 
      roleName, 
      rolePrompt, 
      originalQuestion, 
      originalResponse, 
      conversationId, 
      bulletinMode, 
      bulletinCompanyName, 
      language = 'es', 
      languageName = 'Español',
      depthLevel = 'complete',
      streamMode = false // NEW: enable SSE streaming
    } = body;
    
    // =============================================================================
    // EXTRACT USER ID FROM JWT TOKEN
    // =============================================================================
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { data: { user }, error } = await supabaseClient.auth.getUser(token);
        if (user && !error) {
          userId = user.id;
          console.log(`${logPrefix} Authenticated user: ${userId}`);
        }
      } catch (authError) {
        console.warn(`${logPrefix} Could not extract user from token:`, authError);
      }
    }
    
    // =============================================================================
    // CHECK FOR STREAMING MODE (SSE response)
    // =============================================================================
    if (streamMode) {
      console.log(`${logPrefix} STREAMING MODE enabled - SSE response`);
      // For now, fall through to standard processing but return as SSE
      // Full streaming will be implemented in a follow-up
    }
    
    // =============================================================================
    // CHECK FOR ENRICH ACTION (role-based response adaptation)
    // =============================================================================
    if (action === 'enrich' && roleId && rolePrompt && originalResponse) {
      console.log(`${logPrefix} ENRICH REQUEST for role: ${roleName} (${roleId})`);
      return await handleEnrichRequest(
        roleId,
        roleName,
        rolePrompt,
        originalQuestion || '',
        originalResponse,
        sessionId,
        logPrefix,
        supabaseClient,
        userId
      );
    }

    console.log(`${logPrefix} User question:`, question);
    console.log(`${logPrefix} Depth level:`, depthLevel);

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Load or refresh company cache
    const now = Date.now();
    if (!companiesCache || (now - cacheTimestamp) > CACHE_TTL) {
      console.log(`${logPrefix} Loading companies from database...`);
      const { data: companies } = await supabaseClient
        .from('repindex_root_issuers')
        .select('issuer_name, ticker, sector_category, ibex_family_code, cotiza_en_bolsa');
      
      if (companies) {
        companiesCache = companies;
        cacheTimestamp = now;
        console.log(`${logPrefix} Loaded ${companies.length} companies from database and cached`);
      }
    }

    // =============================================================================
    // GUARDRAILS: CATEGORIZE QUESTION AND REDIRECT IF NEEDED
    // =============================================================================
    const questionCategory = categorizeQuestion(question, companiesCache || []);
    console.log(`${logPrefix} Question category: ${questionCategory}`);
    
    if (questionCategory !== 'corporate_analysis') {
      const redirectResponse = getRedirectResponse(questionCategory, question, languageName, companiesCache || []);
      
      // Save to database
      if (sessionId) {
        await supabaseClient.from('chat_intelligence_sessions').insert([
          {
            session_id: sessionId,
            role: 'user',
            content: question,
            user_id: userId,
            question_category: questionCategory,
            depth_level: depthLevel,
          },
          {
            session_id: sessionId,
            role: 'assistant',
            content: redirectResponse.answer,
            suggested_questions: redirectResponse.suggestedQuestions,
            user_id: userId,
            question_category: questionCategory,
          }
        ]);
      }
      
      return new Response(
        JSON.stringify({
          answer: redirectResponse.answer,
          suggestedQuestions: redirectResponse.suggestedQuestions,
          metadata: {
            type: 'redirect',
            questionCategory,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =============================================================================
    // CHECK FOR GENERIC BULLETIN REQUEST (without specific company)
    // =============================================================================
    const GENERIC_BULLETIN_PATTERNS = [
      /^quiero\s+(?:generar|crear|ver)\s+(?:un\s+)?bolet[íi]n\s+(?:ejecutivo\s+)?(?:de\s+una\s+empresa)?$/i,
      /^(?:genera|crea|hazme|prepara)\s+(?:un\s+)?bolet[íi]n$/i,
      /^bolet[íi]n\s+ejecutivo$/i,
      /^(?:quiero|necesito|me\s+gustar[íi]a)\s+(?:un\s+)?bolet[íi]n/i,
    ];

    const isGenericBulletinRequest = GENERIC_BULLETIN_PATTERNS.some(pattern => pattern.test(question.trim()));
    
    if (isGenericBulletinRequest) {
      console.log(`${logPrefix} GENERIC BULLETIN REQUEST - asking for company`);
      
      // Get some example companies to suggest
      const exampleCompanies = companiesCache?.slice(0, 20).map(c => c.issuer_name) || [];
      const ibexCompanies = companiesCache?.filter(c => c.ibex_family_code === 'IBEX35').slice(0, 10).map(c => c.issuer_name) || [];
      
      const suggestedCompanies = [...new Set([...ibexCompanies, ...exampleCompanies])].slice(0, 8);
      
      return new Response(
        JSON.stringify({
          answer: `¡Perfecto! 📋 Puedo generar un **boletín ejecutivo** completo para cualquier empresa de nuestra base de datos.\n\n**¿De qué empresa quieres el boletín?**\n\nEscribe el nombre de la empresa (por ejemplo: Telefónica, Inditex, Repsol, BBVA, Iberdrola...) y generaré un análisis detallado incluyendo:\n\n- 📊 **RIX Score** por cada modelo de IA (ChatGPT, Perplexity, Gemini, DeepSeek)\n- 🏆 **Comparativa** con competidores del mismo sector\n- 📈 **Tendencia** de las últimas 4 semanas\n- 💡 **Conclusiones** y recomendaciones\n\nEl boletín estará listo para **descargar o imprimir** en formato profesional.`,
          suggestedQuestions: suggestedCompanies.map(c => `Genera un boletín de ${c}`),
          metadata: {
            type: 'standard',
            documentsFound: 0,
            structuredDataFound: companiesCache?.length || 0
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =============================================================================
    // BULLETIN MODE - ONLY TRIGGERED BY EXPLICIT BUTTON CLICK
    // =============================================================================
    // Bulletins are ONLY generated when bulletinMode is explicitly set to true
    // This prevents false positives from users asking for "informes" in general conversation
    if (bulletinMode === true && bulletinCompanyName) {
      console.log(`${logPrefix} BULLETIN MODE ACTIVATED for company: ${bulletinCompanyName}`);
      return await handleBulletinRequest(
        bulletinCompanyName,
        question,
        depthLevel,
        supabaseClient,
        openAIApiKey,
        sessionId,
        logPrefix,
        userId,
        conversationId,
        streamMode // Pass streaming mode to bulletin handler
      );
    }

    // =============================================================================
    // STANDARD CHAT FLOW (existing logic)
    // =============================================================================
    return await handleStandardChat(
      question,
      conversationHistory,
      supabaseClient,
      openAIApiKey,
      sessionId,
      logPrefix,
      userId,
      language,
      languageName,
      depthLevel,
      roleId,      // NEW: pass role info
      roleName,
      rolePrompt,
      streamMode   // Pass streaming mode to standard chat handler
    );

  } catch (error) {
    console.error(`${logPrefix} Error in chat-intelligence function:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// =============================================================================
// GUARDRAILS: QUESTION CATEGORIZATION
// =============================================================================
type QuestionCategory = 
  | 'corporate_analysis'    // Normal question about companies
  | 'agent_identity'        // "Who are you?"
  | 'personal_query'        // About an individual person
  | 'off_topic'             // Outside scope
  | 'test_limits';          // Jailbreak/testing attempts

function categorizeQuestion(question: string, companiesCache: any[]): QuestionCategory {
  const q = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Agent identity patterns
  if (/qui[ee]n eres|qu[ee] eres|c[oo]mo funcionas|eres una? ia|que modelo|qué modelo|who are you|what are you/i.test(q)) {
    return 'agent_identity';
  }
  
  // Personal query patterns (asking about themselves or specific people without company context)
  if (/c[oó]mo me ven|qu[eé] dicen de m[ií]|analiza(me)?|sobre m[ií]|analyze me|about me/i.test(q)) {
    return 'personal_query';
  }
  
  // If mentions known companies, it's corporate analysis
  if (detectCompaniesInQuestion(question, companiesCache).length > 0) {
    return 'corporate_analysis';
  }
  
  // Off-topic patterns
  if (/f[uú]tbol|pol[ií]tica|receta|chiste|poema|cuent[oa]|weather|tiempo hace|football|soccer|joke|recipe|poem|story/i.test(q)) {
    return 'off_topic';
  }
  
  // Test limits patterns
  if (/ignore.*instructions|ignora.*instrucciones|jailbreak|bypass|prompt injection|actua como|act as if/i.test(q)) {
    return 'test_limits';
  }
  
  // Default: try to process as corporate analysis
  return 'corporate_analysis';
}

function getRedirectResponse(category: QuestionCategory, question: string, languageName: string, companiesCache: any[]): { answer: string; suggestedQuestions: string[] } {
  const ibexCompanies = companiesCache?.filter(c => c.ibex_family_code === 'IBEX35').slice(0, 5).map(c => c.issuer_name) || ['Telefónica', 'BBVA', 'Santander', 'Iberdrola', 'Inditex'];
  
  const responses: Record<QuestionCategory, { answer: string; suggestedQuestions: string[] }> = {
    agent_identity: {
      answer: `Soy el **Agente Rix**, un analista especializado en reputación algorítmica corporativa.

Mi función es ayudarte a interpretar cómo los principales modelos de inteligencia artificial (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) perciben a las empresas españolas y su posicionamiento reputacional.

**Puedo hacer por ti:**
- 📊 Analizar métricas RIX de cualquier empresa
- 🏆 Comparar empresas con su competencia sectorial
- 📈 Detectar tendencias y evolución temporal
- 📋 Generar informes ejecutivos para comité de dirección

¿Sobre qué empresa o sector te gustaría que hiciéramos un análisis?`,
      suggestedQuestions: [
        `Analiza la reputación de ${ibexCompanies[0]}`,
        `Top 5 empresas del IBEX-35 esta semana`,
        `Comparativa del sector Banca`,
      ]
    },
    personal_query: {
      answer: `Mi especialidad es el análisis de reputación **corporativa**, no individual. Analizo cómo las IAs perciben a empresas como entidades, no a personas físicas.

Sin embargo, si estás vinculado a una empresa específica, puedo analizar cómo la percepción del liderazgo afecta a la reputación corporativa de esa organización.

**¿Te gustaría que analizara la reputación corporativa de alguna empresa en particular?**`,
      suggestedQuestions: [
        `Analiza ${ibexCompanies[0]}`,
        `¿Cómo se percibe el liderazgo de ${ibexCompanies[1]}?`,
        `Reputación del sector Tecnología`,
      ]
    },
    off_topic: {
      answer: `Esa pregunta está fuera de mi especialización. Como Agente Rix, me centro exclusivamente en el **análisis de reputación algorítmica corporativa**.

**Lo que sí puedo ofrecerte:**
- 📊 Análisis de cualquier empresa del IBEX-35 o del ecosistema español
- 🏆 Comparativas sectoriales y benchmarking competitivo
- 📈 Detección de tendencias y alertas reputacionales
- 📋 Informes ejecutivos sobre la percepción en IAs

¿Hay alguna empresa o sector que te interese analizar?`,
      suggestedQuestions: [
        `Ranking del sector Energía`,
        `Top 10 empresas esta semana`,
        `Analiza ${ibexCompanies[2]}`,
      ]
    },
    test_limits: {
      answer: `Soy el Agente Rix, un analista de reputación corporativa. Mi función es ayudarte a entender cómo las IAs perciben a las empresas españolas.

¿En qué empresa o sector te gustaría que nos centráramos?`,
      suggestedQuestions: [
        `Analiza ${ibexCompanies[0]}`,
        `Top 5 del IBEX-35`,
        `Comparativa sector Telecomunicaciones`,
      ]
    },
    corporate_analysis: {
      answer: '', // Not used for this category
      suggestedQuestions: []
    }
  };
  
  return responses[category];
}

// =============================================================================
// ENRICH REQUEST HANDLER - Role-based EXPANDED executive reports
// =============================================================================
async function handleEnrichRequest(
  roleId: string,
  roleName: string,
  rolePrompt: string,
  originalQuestion: string,
  originalResponse: string,
  sessionId: string | undefined,
  logPrefix: string,
  supabaseClient: any,
  userId: string | null
) {
  console.log(`${logPrefix} Generating EXPANDED executive report for role: ${roleName}`);

  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `Eres el Agente Rix, un consultor senior de reputación corporativa creando un **INFORME EJECUTIVO COMPLETO** para alta dirección.

## REGLA CRÍTICA DE COMUNICACIÓN:

**NO menciones NUNCA el perfil del destinatario en el texto.** 
- ❌ PROHIBIDO: "Como CEO, debes...", "Este informe es para el CEO...", "Para un Director de Marketing..."
- ❌ PROHIBIDO: "Desde tu posición de...", "En tu rol como...", "Como responsable de..."
- ✅ CORRECTO: Simplemente adapta el enfoque y las recomendaciones sin mencionar el perfil
- ✅ CORRECTO: El contenido debe reflejar las prioridades del perfil SIN decirlo explícitamente

**EXPLICA SIEMPRE LAS MÉTRICAS RepIndex (GLOSARIO CANÓNICO):**
El lector NO conoce de memoria qué significa cada métrica. SIEMPRE incluye una explicación breve cuando menciones cualquier métrica:

- **NVM (Calidad de la Narrativa)**: Coherencia del discurso, nivel de controversia, afirmaciones verificables
- **DRM (Fortaleza de Evidencia)**: Calidad de fuentes primarias, corroboración, trazabilidad documental
- **SIM (Autoridad de Fuentes)**: Jerarquía de fuentes citadas (T1: reguladores/financieros → T4: redes/opinión)
- **RMM (Actualidad y Empuje)**: Frescura temporal de menciones dentro de la ventana analizada
- **CEM (Gestión de Controversias)**: Exposición a riesgos (puntuación inversa: 100 = sin controversias)
- **GAM (Percepción de Gobierno)**: Percepción de independencia y buenas prácticas de gobernanza
- **DCM (Coherencia Informativa)**: Consistencia de información entre diferentes modelos de IA
- **CXM (Ejecución Corporativa)**: Percepción de ejecución en mercado y cotización (solo cotizadas)

⚠️ ERRORES A EVITAR: SIM NO mide sostenibilidad. DRM NO mide desempeño financiero. DCM NO mide innovación digital.

Cuando menciones un score (ej: "CEM: 72"), añade contexto: "CEM (Gestión de Controversias): 72 puntos, lo que indica baja exposición a riesgos..."

## IMPORTANTE: ESTO ES UNA EXPANSIÓN, NO UN RESUMEN

La respuesta original contiene datos que DEBES mantener y EXPANDIR significativamente. Tu trabajo es:

1. **MANTENER todos los datos** de la respuesta original (cifras, empresas, métricas, comparativas)
2. **EXPANDIR el análisis** con profundidad propia de un informe ejecutivo de consultoría premium
3. **ADAPTAR el enfoque** a las prioridades del perfil (sin mencionarlo)
4. **INCLUIR secciones adicionales** con recomendaciones estratégicas

## ESTRUCTURA OBLIGATORIA DEL INFORME (mínimo 2500 palabras):

---

# 📋 INFORME EJECUTIVO DE REPUTACIÓN CORPORATIVA
## Alta Dirección de ${roleName} - Análisis RepIndex

---

### 1. RESUMEN EJECUTIVO (2-3 párrafos)
- Conclusión principal en negrita
- Hallazgo más relevante
- Acción prioritaria recomendada

### 2. CONTEXTO Y DATOS CLAVE
[Incluir TODOS los datos de la respuesta original organizados en tablas]

### 3. ANÁLISIS ESTRATÉGICO DETALLADO

${rolePrompt}

Desarrolla CADA punto con:
- Mínimo 3-4 párrafos por punto
- Datos concretos de la respuesta original
- Explicación clara de cada métrica mencionada
- Recomendaciones accionables

### 4. COMPARATIVA Y BENCHMARKING
[Tabla comparativa con competidores si están disponibles]
[Análisis de posición relativa]

### 5. RIESGOS Y OPORTUNIDADES
- ⚠️ Riesgos identificados (mínimo 3, con detalle)
- 💡 Oportunidades detectadas (mínimo 3, con detalle)

### 6. PLAN DE ACCIÓN RECOMENDADO
| Prioridad | Acción | Responsable | Plazo | Impacto Esperado |
|-----------|--------|-------------|-------|------------------|
[Mínimo 5 acciones concretas]

### 7. CONCLUSIONES Y SIGUIENTES PASOS
[3-4 párrafos de cierre con visión estratégica]

---

## DATOS ORIGINALES A EXPANDIR:

${originalResponse}

## PREGUNTA ORIGINAL:
${originalQuestion || "(No disponible)"}

---

## REGLAS CRÍTICAS:

1. **MÍNIMO 2500 PALABRAS** - Este es un informe ejecutivo premium
2. **NO RESUMIR** - Expandir y profundizar en CADA punto
3. **USAR TODOS LOS DATOS** - No omitir cifras ni empresas mencionadas
4. **TABLAS Y FORMATO** - Usar Markdown: tablas, negritas, listas, quotes
5. **NUNCA MENCIONAR EL PERFIL** - Adapta el contenido sin decir "para el CEO", "como Director de..."
6. **EXPLICAR CADA MÉTRICA** - El lector no conoce la terminología, siempre contextualiza
7. **VALOR CONSULTIVO** - Como si fuera un entregable de McKinsey o BCG
8. **RECOMENDACIONES CONCRETAS** - No generalidades, acciones específicas
9. **NO INVENTAR DATOS** - Solo expandir análisis de datos existentes`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Genera un INFORME EJECUTIVO COMPLETO Y EXTENSO para alta dirección. Este debe ser un documento profesional de consultoría premium de MÁXIMA CALIDAD sin límite de extensión - si necesitas 5000 palabras, escribe 5000 palabras. Expandiendo y profundizando en todos los datos disponibles. NO resumas, EXPANDE. EXCELENCIA sobre brevedad. RECUERDA: No menciones el perfil del destinatario en el texto, simplemente adapta el enfoque. Y SIEMPRE explica qué significa cada métrica RepIndex que menciones.` }
    ];

    const result = await callAIWithFallback(messages, 'o3', 32000, logPrefix);
    const enrichedAnswer = result.content;

    console.log(`${logPrefix} EXPANDED executive report generated (via ${result.provider}), length: ${enrichedAnswer.length} chars`);

    // Log API usage
    await logApiUsage({
      supabaseClient,
      edgeFunction: 'chat-intelligence',
      provider: result.provider,
      model: result.model,
      actionType: 'enrich',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId,
      sessionId,
      metadata: { 
        roleId, 
        roleName,
        depth_level: 'enrich', // Enrichment is always a separate call
      },
    });

    // Generate role-specific follow-up questions
    const suggestedQuestions = await generateRoleSpecificQuestions(
      roleId,
      roleName,
      originalQuestion,
      logPrefix
    );

    return new Response(
      JSON.stringify({
        answer: enrichedAnswer,
        suggestedQuestions,
        metadata: {
          type: 'enriched',
          roleId,
          roleName,
          aiProvider: result.provider,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`${logPrefix} Error in enrich request:`, error);
    throw error;
  }
}

// Helper function to generate role-specific follow-up questions
async function generateRoleSpecificQuestions(
  roleId: string,
  roleName: string,
  originalQuestion: string,
  logPrefix: string
): Promise<string[]> {
  const roleQuestionHints: Record<string, string[]> = {
    ceo: [
      "impacto en negocio",
      "decisiones estratégicas",
      "comparativa competitiva",
      "riesgos principales"
    ],
    periodista: [
      "titulares noticiables",
      "controversias",
      "investigación periodística",
      "ángulos de historia"
    ],
    analista_mercados: [
      "correlación RIX-cotización",
      "señales de mercado",
      "análisis técnico",
      "comparativa sectorial"
    ],
    inversor: [
      "screening reputacional",
      "riesgo ESG",
      "oportunidades de entrada",
      "alertas de cartera"
    ],
    dircom: [
      "gestión de crisis",
      "narrativa mediática",
      "mensajes clave",
      "sentimiento público"
    ],
    marketing: [
      "posicionamiento de marca",
      "benchmarking",
      "diferenciación",
      "experiencia de cliente"
    ],
    estratega_interno: [
      "capacidades organizativas",
      "cultura corporativa",
      "recursos internos",
      "brechas de alineamiento"
    ],
    estratega_externo: [
      "posición competitiva",
      "oportunidades de mercado",
      "amenazas externas",
      "movimientos estratégicos"
    ],
  };

  const hints = roleQuestionHints[roleId] || ["análisis detallado", "comparativas", "tendencias"];

  try {
    const messages = [
      { 
        role: 'system', 
        content: `Genera 3 preguntas de seguimiento para un ${roleName} interesado en datos de reputación corporativa RepIndex. Las preguntas deben ser específicas y responderibles con datos de RIX Score, rankings, y comparativas. Temas relevantes: ${hints.join(', ')}. Responde SOLO con un array JSON: ["pregunta 1", "pregunta 2", "pregunta 3"]`
      },
      { role: 'user', content: `Pregunta original: "${originalQuestion}". Genera 3 preguntas de seguimiento relevantes para un ${roleName}.` }
    ];

    const text = await callAISimple(messages, 'gpt-4o-mini', 300, logPrefix);
    if (text) {
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleanText);
    }
  } catch (error) {
    console.warn(`${logPrefix} Error generating role-specific questions:`, error);
  }

  // Fallback questions based on role
  const fallbackQuestions: Record<string, string[]> = {
    ceo: ["¿Cuáles son los 3 riesgos reputacionales más urgentes?", "¿Cómo estamos vs la competencia directa?", "¿Qué decisiones debería considerar?"],
    periodista: ["¿Qué empresa tiene la historia más noticiable esta semana?", "¿Hay alguna controversia emergente?", "¿Qué titular propones para esta información?"],
    analista_mercados: ["¿Hay correlación entre RIX y cotización?", "¿Qué señales técnicas detectas?", "Comparativa detallada del sector"],
    inversor: ["¿Pasa esta empresa el filtro reputacional?", "¿Cuál es el nivel de riesgo ESG?", "¿Es buen momento para entrar?"],
  };

  return fallbackQuestions[roleId] || ["¿Puedes profundizar más?", "¿Cómo se compara con competidores?", "¿Cuál es la tendencia?"];
}

// =============================================================================
// BULLETIN REQUEST HANDLER
// =============================================================================
async function handleBulletinRequest(
  companyQuery: string,
  originalQuestion: string,
  depthLevel: 'quick' | 'complete' | 'exhaustive',
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  conversationId: string | undefined,
  streamMode: boolean = false // NEW: support streaming mode
) {
  console.log(`${logPrefix} Processing bulletin request for: ${companyQuery}`);

  // 1. Find the company in our database
  const normalizedQuery = companyQuery.toLowerCase().trim();
  const matchedCompany = companiesCache?.find(c => 
    c.issuer_name.toLowerCase().includes(normalizedQuery) ||
    c.ticker.toLowerCase() === normalizedQuery ||
    normalizedQuery.includes(c.issuer_name.toLowerCase())
  );

  if (!matchedCompany) {
    console.log(`${logPrefix} Company not found: ${companyQuery}`);
    return new Response(
      JSON.stringify({
        answer: `❌ No encontré la empresa "${companyQuery}" en la base de datos de RepIndex.\n\n**Empresas disponibles** (algunas sugerencias):\n${companiesCache?.slice(0, 10).map(c => `- ${c.issuer_name} (${c.ticker})`).join('\n')}\n\nPor favor, especifica el nombre exacto o el ticker de la empresa.`,
        suggestedQuestions: [
          "¿Qué empresas están disponibles en RepIndex?",
          "Genera un boletín de Telefónica",
          "Lista las empresas del sector Energía"
        ],
        metadata: { type: 'error', bulletinRequested: true }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`${logPrefix} Matched company: ${matchedCompany.issuer_name} (${matchedCompany.ticker})`);

  // 2. Get competitors using intelligent prioritization system (GUARDRAIL)
  const competitorLimit = depthLevel === 'quick' ? 5 : 8;
  const competitorResult = await getRelevantCompetitors(
    matchedCompany,
    companiesCache || [],
    supabaseClient,
    competitorLimit,
    logPrefix
  );
  const competitors = competitorResult.competitors;

  console.log(`${logPrefix} Smart competitor selection: ${competitors.map(c => c.ticker).join(', ')}`);
  console.log(`${logPrefix} Competitor methodology: ${competitorResult.tierUsed} (verified: ${competitorResult.verifiedCount}, subsector: ${competitorResult.subsectorCount})`);

  // 3. Get all tickers to fetch (company + competitors)
  const allTickers = [matchedCompany.ticker, ...competitors.map(c => c.ticker)];

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. VECTOR STORE SEARCH - Qualitative context from AI explanations
  // ═══════════════════════════════════════════════════════════════════════════
  let vectorStoreContext = '';
  const vectorMatchCount = depthLevel === 'quick' ? 10 : depthLevel === 'exhaustive' ? 30 : 20;
  
  try {
    // Generate embedding for the company name
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: `${matchedCompany.issuer_name} ${matchedCompany.ticker} reputación corporativa análisis`
      })
    });

    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const queryEmbedding = embeddingData.data?.[0]?.embedding;

      if (queryEmbedding) {
        // Search Vector Store for relevant documents
        const { data: vectorDocs, error: vectorError } = await supabaseClient.rpc('match_documents', {
          query_embedding: queryEmbedding,
          match_count: vectorMatchCount,
          filter: {} // Could filter by metadata->ticker if indexed
        });

        if (!vectorError && vectorDocs?.length > 0) {
          // Filter results to only include documents about this company
          const relevantDocs = vectorDocs.filter((doc: any) => {
            const content = doc.content?.toLowerCase() || '';
            const metadata = doc.metadata || {};
            return content.includes(matchedCompany.ticker.toLowerCase()) ||
                   content.includes(matchedCompany.issuer_name.toLowerCase()) ||
                   metadata.ticker === matchedCompany.ticker;
          });

          if (relevantDocs.length > 0) {
            console.log(`${logPrefix} Vector Store: Found ${relevantDocs.length} relevant documents (from ${vectorDocs.length} total)`);
            
            vectorStoreContext = `\n📚 ANÁLISIS CUALITATIVOS DE IAs (Vector Store - ${relevantDocs.length} documentos):\n`;
            relevantDocs.slice(0, 10).forEach((doc: any, i: number) => {
              const content = doc.content?.substring(0, 600) || '';
              const similarity = doc.similarity ? ` [Similaridad: ${(doc.similarity * 100).toFixed(1)}%]` : '';
              vectorStoreContext += `\n[Fuente ${i + 1}]${similarity}:\n${content}...\n`;
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Vector Store search failed:`, e);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CORPORATE NEWS - Recent news about the company
  // ═══════════════════════════════════════════════════════════════════════════
  let corporateNewsContext = '';
  
  try {
    const { data: corporateNews, error: newsError } = await supabaseClient
      .from('corporate_news')
      .select('headline, lead_paragraph, published_date, category')
      .eq('ticker', matchedCompany.ticker)
      .order('published_date', { ascending: false })
      .limit(depthLevel === 'quick' ? 3 : 5);

    if (!newsError && corporateNews?.length > 0) {
      console.log(`${logPrefix} Corporate News: Found ${corporateNews.length} recent articles`);
      
      corporateNewsContext = `\n📰 NOTICIAS CORPORATIVAS RECIENTES (${corporateNews.length}):\n`;
      corporateNews.forEach((news: any, i: number) => {
        corporateNewsContext += `${i + 1}. [${news.published_date || 'Sin fecha'}] ${news.headline}\n`;
        if (news.lead_paragraph) {
          corporateNewsContext += `   ${news.lead_paragraph.substring(0, 200)}...\n`;
        }
      });
    }
  } catch (e) {
    console.warn(`${logPrefix} Corporate news fetch failed:`, e);
  }

  // 6. Fetch 4 weeks of data for company and competitors with ALL 6 AI models
  // Uses unified helper to combine rix_runs (legacy) + rix_runs_v2 (Grok, Qwen)
  const rixData = await fetchUnifiedRixData({
    supabaseClient,
    columns: `
      "02_model_name",
      "03_target_name",
      "05_ticker",
      "06_period_from",
      "07_period_to",
      "09_rix_score",
      "51_rix_score_adjusted",
      "10_resumen",
      "11_puntos_clave",
      "22_explicacion",
      "23_nvm_score",
      "25_nvm_categoria",
      "26_drm_score",
      "28_drm_categoria",
      "29_sim_score",
      "31_sim_categoria",
      "32_rmm_score",
      "34_rmm_categoria",
      "35_cem_score",
      "37_cem_categoria",
      "38_gam_score",
      "40_gam_categoria",
      "41_dcm_score",
      "43_dcm_categoria",
      "44_cxm_score",
      "46_cxm_categoria",
      "25_explicaciones_detalladas",
      batch_execution_date
    `,
    tickerFilter: allTickers,
    limit: 800,
    logPrefix
  });

  console.log(`${logPrefix} Fetched ${rixData?.length || 0} RIX records for bulletin`);

  // 7. Organize data by week and company
  const getPeriodKey = (run: any) => `${run["06_period_from"]}|${run["07_period_to"]}`;
  const uniquePeriods = [...new Set(rixData?.map(getPeriodKey) || [])]
    .sort((a, b) => b.split('|')[1].localeCompare(a.split('|')[1]))
    .slice(0, depthLevel === 'quick' ? 2 : 4); // Quick: 2 periods, otherwise: 4

  console.log(`${logPrefix} Unique periods found: ${uniquePeriods.length}`);

  // 8. Build bulletin context
  let bulletinContext = '';

  // Company info
  bulletinContext += `📌 EMPRESA PRINCIPAL:\n`;
  bulletinContext += `- Nombre: ${matchedCompany.issuer_name}\n`;
  bulletinContext += `- Ticker: ${matchedCompany.ticker}\n`;
  bulletinContext += `- Sector: ${matchedCompany.sector_category || 'No especificado'}\n`;
  bulletinContext += `- Subsector: ${matchedCompany.subsector || 'No definido'}\n`;
  bulletinContext += `- Categoría IBEX: ${matchedCompany.ibex_family_code || 'No IBEX'}\n`;
  bulletinContext += `- Cotiza en bolsa: ${matchedCompany.cotiza_en_bolsa ? 'Sí' : 'No'}\n\n`;

  // Competitors info WITH METHODOLOGY JUSTIFICATION
  bulletinContext += `🏢 COMPETIDORES (${competitors.length}) - METODOLOGÍA DE SELECCIÓN:\n`;
  bulletinContext += `${competitorResult.justification}\n\n`;
  competitors.forEach((c, idx) => {
    bulletinContext += `${idx + 1}. ${c.issuer_name} (${c.ticker})\n`;
    bulletinContext += `   - Sector: ${c.sector_category || 'Sin sector'} | Subsector: ${c.subsector || 'N/D'}\n`;
  });
  bulletinContext += '\n';

  // Add Vector Store context if available
  if (vectorStoreContext) {
    bulletinContext += vectorStoreContext;
    bulletinContext += '\n';
  }

  // Add Corporate News context if available
  if (corporateNewsContext) {
    bulletinContext += corporateNewsContext;
    bulletinContext += '\n';
  }

  // Data by week with DETAILED metrics
  uniquePeriods.forEach((period, weekIdx) => {
    const [periodFrom, periodTo] = period.split('|');
    const weekData = rixData?.filter(r => getPeriodKey(r) === period) || [];
    
    const weekLabel = weekIdx === 0 ? 'SEMANA ACTUAL' : `SEMANA -${weekIdx}`;
    bulletinContext += `\n📅 ${weekLabel} (${periodFrom} a ${periodTo}):\n\n`;

    // DETAILED Data for main company
    const mainCompanyData = weekData.filter(r => r["05_ticker"] === matchedCompany.ticker);
    bulletinContext += `**${matchedCompany.issuer_name} - DATOS DETALLADOS**:\n\n`;
    
    if (mainCompanyData.length > 0) {
      mainCompanyData.forEach(r => {
        const score = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
        bulletinContext += `### ${r["02_model_name"]} - RIX: ${score}\n`;
        
        // Include all RIX metrics
        bulletinContext += `**Métricas del RIX:**\n`;
        bulletinContext += `- NVM (Visibility): ${r["23_nvm_score"] ?? 'N/A'} - ${r["25_nvm_categoria"] || 'Sin categoría'}\n`;
        bulletinContext += `- DRM (Digital Resonance): ${r["26_drm_score"] ?? 'N/A'} - ${r["28_drm_categoria"] || 'Sin categoría'}\n`;
        bulletinContext += `- SIM (Sentiment): ${r["29_sim_score"] ?? 'N/A'} - ${r["31_sim_categoria"] || 'Sin categoría'}\n`;
        bulletinContext += `- RMM (Momentum): ${r["32_rmm_score"] ?? 'N/A'} - ${r["34_rmm_categoria"] || 'Sin categoría'}\n`;
        bulletinContext += `- CEM (Crisis Exposure): ${r["35_cem_score"] ?? 'N/A'} - ${r["37_cem_categoria"] || 'Sin categoría'}\n`;
        bulletinContext += `- GAM (Growth Association): ${r["38_gam_score"] ?? 'N/A'} - ${r["40_gam_categoria"] || 'Sin categoría'}\n`;
        bulletinContext += `- DCM (Data Consistency): ${r["41_dcm_score"] ?? 'N/A'} - ${r["43_dcm_categoria"] || 'Sin categoría'}\n`;
        bulletinContext += `- CXM (Customer Experience): ${r["44_cxm_score"] ?? 'N/A'} - ${r["46_cxm_categoria"] || 'Sin categoría'}\n`;
        
        // Include summary and key points
        if (r["10_resumen"]) {
          bulletinContext += `\n**Resumen de la IA:**\n${r["10_resumen"]}\n`;
        }
        if (r["11_puntos_clave"] && Array.isArray(r["11_puntos_clave"])) {
          bulletinContext += `\n**Puntos Clave:**\n`;
          r["11_puntos_clave"].forEach((punto: string, i: number) => {
            bulletinContext += `${i + 1}. ${punto}\n`;
          });
        }
        if (r["22_explicacion"]) {
          bulletinContext += `\n**Explicación del Score:**\n${r["22_explicacion"]}\n`;
        }
        if (r["25_explicaciones_detalladas"]) {
          bulletinContext += `\n**Explicaciones Detalladas por Métrica:**\n${JSON.stringify(r["25_explicaciones_detalladas"], null, 2)}\n`;
        }
        bulletinContext += '\n---\n';
      });
      
      const avgScore = mainCompanyData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / mainCompanyData.length;
      bulletinContext += `\n**PROMEDIO RIX ${matchedCompany.issuer_name}**: ${avgScore.toFixed(1)}\n`;
    } else {
      bulletinContext += `- Sin datos esta semana\n`;
    }
    bulletinContext += '\n';

    // Data for competitors with metrics
    bulletinContext += `**COMPETIDORES - RESUMEN ESTA SEMANA**:\n`;
    bulletinContext += `| Empresa | Ticker | RIX Prom | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |\n`;
    bulletinContext += `|---------|--------|----------|-----|-----|-----|-----|-----|-----|-----|-----|\n`;
    
    competitors.forEach(comp => {
      const compData = weekData.filter(r => r["05_ticker"] === comp.ticker);
      if (compData.length > 0) {
        const avgScore = compData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / compData.length;
        const avgNVM = compData.reduce((sum, r) => sum + (r["23_nvm_score"] || 0), 0) / compData.length;
        const avgDRM = compData.reduce((sum, r) => sum + (r["26_drm_score"] || 0), 0) / compData.length;
        const avgSIM = compData.reduce((sum, r) => sum + (r["29_sim_score"] || 0), 0) / compData.length;
        const avgRMM = compData.reduce((sum, r) => sum + (r["32_rmm_score"] || 0), 0) / compData.length;
        const avgCEM = compData.reduce((sum, r) => sum + (r["35_cem_score"] || 0), 0) / compData.length;
        const avgGAM = compData.reduce((sum, r) => sum + (r["38_gam_score"] || 0), 0) / compData.length;
        const avgDCM = compData.reduce((sum, r) => sum + (r["41_dcm_score"] || 0), 0) / compData.length;
        const avgCXM = compData.reduce((sum, r) => sum + (r["44_cxm_score"] || 0), 0) / compData.length;
        bulletinContext += `| ${comp.issuer_name} | ${comp.ticker} | ${avgScore.toFixed(1)} | ${avgNVM.toFixed(0)} | ${avgDRM.toFixed(0)} | ${avgSIM.toFixed(0)} | ${avgRMM.toFixed(0)} | ${avgCEM.toFixed(0)} | ${avgGAM.toFixed(0)} | ${avgDCM.toFixed(0)} | ${avgCXM.toFixed(0)} |\n`;
      }
    });
    bulletinContext += '\n';

    // Individual competitor details for current week only
    if (weekIdx === 0) {
      bulletinContext += `\n**DETALLES DE COMPETIDORES - SEMANA ACTUAL:**\n`;
      competitors.forEach(comp => {
        const compData = weekData.filter(r => r["05_ticker"] === comp.ticker);
        if (compData.length > 0) {
          bulletinContext += `\n### ${comp.issuer_name} (${comp.ticker}):\n`;
          compData.forEach(r => {
            const score = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
            bulletinContext += `- ${r["02_model_name"]}: RIX ${score}`;
            if (r["10_resumen"]) {
              bulletinContext += ` | Resumen: ${r["10_resumen"].substring(0, 200)}...`;
            }
            bulletinContext += '\n';
          });
        }
      });
    }
  });

  // Sector average calculation
  if (matchedCompany.sector_category) {
    const sectorCompanies = companiesCache?.filter(c => c.sector_category === matchedCompany.sector_category) || [];
    const currentWeekData = rixData?.filter(r => getPeriodKey(r) === uniquePeriods[0]) || [];
    
    let sectorTotal = 0;
    let sectorCount = 0;
    
    sectorCompanies.forEach(comp => {
      const compData = currentWeekData.filter(r => r["05_ticker"] === comp.ticker);
      if (compData.length > 0) {
        const avg = compData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / compData.length;
        sectorTotal += avg;
        sectorCount++;
      }
    });

    if (sectorCount > 0) {
      bulletinContext += `\n📊 CONTEXTO SECTORIAL:\n`;
      bulletinContext += `- Sector: ${matchedCompany.sector_category}\n`;
      bulletinContext += `- Total empresas en sector: ${sectorCompanies.length}\n`;
      bulletinContext += `- Empresas con datos esta semana: ${sectorCount}\n`;
      bulletinContext += `- RIX promedio del sector: ${(sectorTotal / sectorCount).toFixed(1)}\n\n`;
    }
  }

  // 7. Call AI with bulletin prompt
  console.log(`${logPrefix} Calling AI for bulletin generation (depth: ${depthLevel}, streaming: ${streamMode})...`);
  
  const bulletinUserPrompt = `Genera un BOLETÍN EJECUTIVO completo para la empresa ${matchedCompany.issuer_name} (${matchedCompany.ticker}).

CONTEXTO CON TODOS LOS DATOS:
${bulletinContext}

Usa SOLO estos datos para generar el boletín. Sigue el formato exacto especificado en tus instrucciones.`;

  const bulletinSystemPrompt = depthLevel === 'quick' ? BULLETIN_SYSTEM_PROMPT_QUICK : BULLETIN_SYSTEM_PROMPT;
  const bulletinMessages = [
    { role: 'system', content: bulletinSystemPrompt },
    { role: 'user', content: bulletinUserPrompt }
  ];

  // Configuration based on depth level
  const isQuickBulletin = depthLevel === 'quick';
  const bulletinMaxTokens = isQuickBulletin ? 6000 : 40000;
  const bulletinTimeoutMs = isQuickBulletin ? 45000 : 120000; // Extended timeout for streaming
  const geminiModel = isQuickBulletin ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';

  // =========================================================================
  // STREAMING MODE: Return SSE stream for real-time text generation
  // =========================================================================
  if (streamMode) {
    console.log(`${logPrefix} Starting STREAMING bulletin generation...`);
    
    const sseEncoder = createSSEEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(sseEncoder({
            type: 'start',
            metadata: {
              companyName: matchedCompany.issuer_name,
              ticker: matchedCompany.ticker,
              sector: matchedCompany.sector_category,
              subsector: matchedCompany.subsector,
              competitorsCount: competitors.length,
              competitorMethodology: competitorResult.tierUsed,
              competitorJustification: competitorResult.justification,
              verifiedCompetitors: competitorResult.verifiedCount,
              vectorStoreDocsUsed: vectorStoreContext ? true : false,
              corporateNewsUsed: corporateNewsContext ? true : false,
              weeksAnalyzed: uniquePeriods.length,
              dataPointsUsed: rixData?.length || 0,
            }
          }));

          let accumulatedContent = '';
          let provider: 'openai' | 'gemini' = 'openai';
          let inputTokens = 0;
          let outputTokens = 0;
          let streamError = false;

          // Try OpenAI first (unless quick mode prefers Gemini)
          if (!isQuickBulletin) {
            console.log(`${logPrefix} Trying OpenAI stream first...`);
            for await (const chunk of streamOpenAIResponse(bulletinMessages, 'o3', bulletinMaxTokens, logPrefix, bulletinTimeoutMs)) {
              if (chunk.type === 'chunk' && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: 'chunk', text: chunk.text }));
              } else if (chunk.type === 'done') {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === 'error') {
                console.warn(`${logPrefix} OpenAI stream error: ${chunk.error}, falling back to Gemini...`);
                streamError = true;
                controller.enqueue(sseEncoder({ type: 'fallback', metadata: { provider: 'gemini' } }));
                break;
              }
            }
          } else {
            streamError = true; // Skip to Gemini for quick mode
          }

          // Fallback to Gemini if OpenAI failed
          if (streamError || accumulatedContent.length === 0) {
            provider = 'gemini';
            accumulatedContent = ''; // Reset for Gemini response
            
            console.log(`${logPrefix} Using Gemini stream (${geminiModel})...`);
            for await (const chunk of streamGeminiResponse(bulletinMessages, geminiModel, bulletinMaxTokens, logPrefix, bulletinTimeoutMs)) {
              if (chunk.type === 'chunk' && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: 'chunk', text: chunk.text }));
              } else if (chunk.type === 'done') {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === 'error') {
                console.error(`${logPrefix} Gemini stream also failed: ${chunk.error}`);
                controller.enqueue(sseEncoder({ 
                  type: 'error', 
                  error: `Error generando boletín: ${chunk.error}` 
                }));
                controller.close();
                return;
              }
            }
          }

          console.log(`${logPrefix} Bulletin stream completed (via ${provider}), length: ${accumulatedContent.length}`);

          // Log API usage in background
          logApiUsage({
            supabaseClient,
            edgeFunction: 'chat-intelligence',
            provider,
            model: provider === 'openai' ? 'o3' : geminiModel,
            actionType: 'bulletin_stream',
            inputTokens,
            outputTokens,
            userId,
            sessionId,
            metadata: { 
              companyName: matchedCompany.issuer_name, 
              ticker: matchedCompany.ticker,
              depth_level: depthLevel,
              streaming: true,
            },
          }).catch(e => console.warn('Failed to log usage:', e));

          // Save to database in background
          if (sessionId) {
            supabaseClient.from('chat_intelligence_sessions').insert([
              {
                session_id: sessionId,
                role: 'user',
                content: originalQuestion,
                company: matchedCompany.ticker,
                analysis_type: 'bulletin',
                user_id: userId
              },
              {
                session_id: sessionId,
                role: 'assistant',
                content: accumulatedContent,
                company: matchedCompany.ticker,
                analysis_type: 'bulletin',
                structured_data_found: rixData?.length || 0,
                user_id: userId
              }
            ]).then(() => console.log(`${logPrefix} Session saved`))
              .catch((e: Error) => console.warn('Failed to save session:', e));
          }

          // Save to user_documents in background
          if (userId) {
            const documentTitle = `Boletín Ejecutivo: ${matchedCompany.issuer_name}`;
            supabaseClient.from('user_documents').insert({
              user_id: userId,
              document_type: 'bulletin',
              title: documentTitle,
              company_name: matchedCompany.issuer_name,
              ticker: matchedCompany.ticker,
              content_markdown: accumulatedContent,
              conversation_id: conversationId || null,
              metadata: {
                sector: matchedCompany.sector_category,
                competitorsCount: competitors.length,
                weeksAnalyzed: uniquePeriods.length,
                dataPointsUsed: rixData?.length || 0,
                aiProvider: provider,
                generatedAt: new Date().toISOString()
              }
            }).then(() => console.log(`${logPrefix} Document saved`))
              .catch((e: Error) => console.warn('Failed to save document:', e));
          }

          // Generate suggested questions
          const suggestedQuestions = [
            `Genera un boletín de ${competitors[0]?.issuer_name || 'otra empresa'}`,
            `¿Cómo se compara ${matchedCompany.issuer_name} con el sector ${matchedCompany.sector_category}?`,
            `Top 5 empresas del sector ${matchedCompany.sector_category}`
          ];

          // Calculate divergence for methodology metadata
          const modelScores = rixData
            ?.filter(r => r['09_rix_score'] != null && r['09_rix_score'] > 0)
            ?.map(r => r['09_rix_score']) || [];
          const maxScore = modelScores.length > 0 ? Math.max(...modelScores) : 0;
          const minScore = modelScores.length > 0 ? Math.min(...modelScores) : 0;
          const divergencePoints = maxScore - minScore;
          const divergenceLevel = divergencePoints <= 8 ? 'low' : divergencePoints <= 15 ? 'medium' : 'high';
          
          // Extract unique models used
          const modelsUsed = [...new Set(rixData?.map(r => r['02_model_name']).filter(Boolean) || [])];
          
          // Extract period info
          const periodFrom = rixData?.map(r => r['06_period_from']).filter(Boolean).sort()[0];
          const periodTo = rixData?.map(r => r['07_period_to']).filter(Boolean).sort().reverse()[0];

          // Extract verified sources from raw AI responses (only ChatGPT + Perplexity)
          const verifiedSources = extractSourcesFromRixData(rixData || []);
          console.log(`${logPrefix} Extracted ${verifiedSources.length} verified sources from RIX data`);

          // Send final done event with enriched methodology metadata
          controller.enqueue(sseEncoder({
            type: 'done',
            suggestedQuestions,
            metadata: {
              type: 'bulletin',
              companyName: matchedCompany.issuer_name,
              ticker: matchedCompany.ticker,
              sector: matchedCompany.sector_category,
              competitorsCount: competitors.length,
              weeksAnalyzed: uniquePeriods.length,
              dataPointsUsed: rixData?.length || 0,
              aiProvider: provider,
              // Verified sources from ChatGPT and Perplexity for bibliography
              verifiedSources: verifiedSources.length > 0 ? verifiedSources : undefined,
              // Methodology metadata for "Radar Reputacional" validation sheet
              methodology: {
                hasRixData: (rixData?.length || 0) > 0,
                modelsUsed,
                periodFrom,
                periodTo,
                observationsCount: rixData?.length || 0,
                divergenceLevel,
                divergencePoints,
                uniqueCompanies: 1,
                uniqueWeeks: uniquePeriods.length,
              },
            }
          }));

          controller.close();
          
        } catch (error) {
          console.error(`${logPrefix} Streaming error:`, error);
          controller.enqueue(sseEncoder({ 
            type: 'error', 
            error: error instanceof Error ? error.message : 'Error de streaming desconocido'
          }));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  }

  // =========================================================================
  // NON-STREAMING MODE: Original behavior (for backwards compatibility)
  // =========================================================================
  const bulletinModel = isQuickBulletin ? 'gpt-4o-mini' : 'o3';

  const result = await callAIWithFallback(
    bulletinMessages,
    bulletinModel,
    bulletinMaxTokens,
    logPrefix,
    bulletinTimeoutMs,
    isQuickBulletin
      ? { preferGemini: true, geminiTimeout: bulletinTimeoutMs }
      : { geminiTimeout: bulletinTimeoutMs }
  );
  const bulletinContent = result.content;

  console.log(`${logPrefix} Bulletin generated (via ${result.provider}), length: ${bulletinContent.length}`);

  // Log API usage
  await logApiUsage({
    supabaseClient,
    edgeFunction: 'chat-intelligence',
    provider: result.provider,
    model: result.model,
    actionType: 'bulletin',
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    userId,
    sessionId,
    metadata: { 
      companyName: matchedCompany.issuer_name, 
      ticker: matchedCompany.ticker,
      depth_level: 'bulletin',
    },
  });

  // 8. Save to database (chat_intelligence_sessions)
  if (sessionId) {
    await supabaseClient.from('chat_intelligence_sessions').insert([
      {
        session_id: sessionId,
        role: 'user',
        content: originalQuestion,
        company: matchedCompany.ticker,
        analysis_type: 'bulletin',
        user_id: userId
      },
      {
        session_id: sessionId,
        role: 'assistant',
        content: bulletinContent,
        company: matchedCompany.ticker,
        analysis_type: 'bulletin',
        structured_data_found: rixData?.length || 0,
        user_id: userId
      }
    ]);
  }
  
  // 8b. Save bulletin to user_documents for authenticated users
  if (userId) {
    const documentTitle = `Boletín Ejecutivo: ${matchedCompany.issuer_name}`;
    console.log(`${logPrefix} Saving bulletin to user_documents for user: ${userId}`);
    
    const { error: docError } = await supabaseClient.from('user_documents').insert({
      user_id: userId,
      document_type: 'bulletin',
      title: documentTitle,
      company_name: matchedCompany.issuer_name,
      ticker: matchedCompany.ticker,
      content_markdown: bulletinContent,
      conversation_id: conversationId || null,
      metadata: {
        sector: matchedCompany.sector_category,
        competitorsCount: competitors.length,
        weeksAnalyzed: uniquePeriods.length,
        dataPointsUsed: rixData?.length || 0,
        aiProvider: result.provider,
        generatedAt: new Date().toISOString()
      }
    });
    
    if (docError) {
      console.error(`${logPrefix} Error saving bulletin to user_documents:`, docError);
    } else {
      console.log(`${logPrefix} Bulletin saved to user_documents successfully`);
    }
  }

  // 9. Return bulletin response
  const suggestedQuestions = [
    `Genera un boletín de ${competitors[0]?.issuer_name || 'otra empresa'}`,
    `¿Cómo se compara ${matchedCompany.issuer_name} con el sector ${matchedCompany.sector_category}?`,
    `Top 5 empresas del sector ${matchedCompany.sector_category}`
  ];

  return new Response(
    JSON.stringify({
      answer: bulletinContent,
      suggestedQuestions,
      metadata: {
        type: 'bulletin',
        companyName: matchedCompany.issuer_name,
        ticker: matchedCompany.ticker,
        sector: matchedCompany.sector_category,
        subsector: matchedCompany.subsector,
        competitorsCount: competitors.length,
        competitorMethodology: competitorResult.tierUsed,
        competitorJustification: competitorResult.justification,
        verifiedCompetitors: competitorResult.verifiedCount,
        vectorStoreDocsUsed: vectorStoreContext ? true : false,
        corporateNewsUsed: corporateNewsContext ? true : false,
        weeksAnalyzed: uniquePeriods.length,
        dataPointsUsed: rixData?.length || 0,
        aiProvider: result.provider,
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// =============================================================================
// STANDARD CHAT HANDLER (existing logic refactored)
// =============================================================================
// =============================================================================
// FUNCIÓN: Detectar empresas mencionadas en la pregunta
// =============================================================================
function detectCompaniesInQuestion(question: string, companiesCache: any[]): any[] {
  if (!companiesCache || companiesCache.length === 0) return [];
  
  const normalizedQuestion = question.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents
  
  const detectedCompanies: any[] = [];
  
  for (const company of companiesCache) {
    const companyName = company.issuer_name?.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") || '';
    const ticker = company.ticker?.toLowerCase() || '';
    
    // Full name match
    if (companyName && normalizedQuestion.includes(companyName)) {
      detectedCompanies.push(company);
      continue;
    }
    
    // Ticker match (only if ticker is at least 2 chars and appears as a word)
    if (ticker && ticker.length >= 2) {
      const tickerRegex = new RegExp(`\\b${ticker}\\b`, 'i');
      if (tickerRegex.test(normalizedQuestion)) {
        detectedCompanies.push(company);
        continue;
      }
    }
    
    // Partial name match (significant words > 4 chars, avoiding common words)
    const commonWords = ['banco', 'grupo', 'empresa', 'compañia', 'sociedad', 'holding', 'spain', 'españa', 'corp', 'corporation'];
    const nameWords = companyName.split(/\s+/).filter(
      word => word.length > 4 && !commonWords.includes(word)
    );
    
    for (const word of nameWords) {
      if (normalizedQuestion.includes(word)) {
        detectedCompanies.push(company);
        break;
      }
    }
  }
  
  // Deduplicate
  return [...new Map(detectedCompanies.map(c => [c.ticker, c])).values()];
}

async function handleStandardChat(
  question: string,
  conversationHistory: any[],
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  language: string = 'es',
  languageName: string = 'Español',
  depthLevel: 'quick' | 'complete' | 'exhaustive' = 'complete',
  roleId?: string,
  roleName?: string,
  rolePrompt?: string,
  streamMode: boolean = false
) {
  console.log(`${logPrefix} Depth level: ${depthLevel}, Role: ${roleName || 'General'}`);
  // =============================================================================
  // =============================================================================
  // PASO 0: DETECTAR EMPRESAS MENCIONADAS EN LA PREGUNTA
  // =============================================================================
  const detectedCompanies = detectCompaniesInQuestion(question, companiesCache || []);
  console.log(`${logPrefix} Detected companies in question: ${detectedCompanies.map(c => c.issuer_name).join(', ') || 'none'}`);

  // =============================================================================
  // PASO 0.5: CARGAR DATOS CORPORATIVOS VERIFICADOS (MEMENTO CORPORATIVO)
  // Solo para empresas detectadas - carga directa de corporate_snapshots
  // =============================================================================
  interface CorporateMemento {
    ticker: string;
    ceo_name: string | null;
    president_name: string | null;
    chairman_name: string | null;
    headquarters_city: string | null;
    company_description: string | null;
    snapshot_date_only: string;
    days_old: number;
    confidence_level: 'VERIFIED' | 'RECENT' | 'HISTORICAL' | 'STALE';
  }

  const corporateMementos: CorporateMemento[] = [];
  
  if (detectedCompanies.length > 0) {
    const tickers = detectedCompanies.map(c => c.ticker);
    console.log(`${logPrefix} Loading corporate snapshots for: ${tickers.join(', ')}`);
    
    const { data: corporateData, error: corporateError } = await supabaseClient
      .from('corporate_snapshots')
      .select('ticker, ceo_name, president_name, chairman_name, headquarters_city, company_description, snapshot_date_only')
      .in('ticker', tickers)
      .order('snapshot_date_only', { ascending: false });
    
    if (corporateError) {
      console.warn(`${logPrefix} Error fetching corporate snapshots:`, corporateError.message);
    } else if (corporateData && corporateData.length > 0) {
      // Deduplicate by ticker (keep most recent)
      const byTicker = new Map<string, any>();
      corporateData.forEach((snapshot: any) => {
        if (!byTicker.has(snapshot.ticker)) {
          byTicker.set(snapshot.ticker, snapshot);
        }
      });
      
      byTicker.forEach((snapshot) => {
        const snapshotDate = new Date(snapshot.snapshot_date_only);
        const daysOld = Math.floor((Date.now() - snapshotDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Determine confidence level based on freshness
        let confidenceLevel: CorporateMemento['confidence_level'];
        if (daysOld <= 7) {
          confidenceLevel = 'VERIFIED';
        } else if (daysOld <= 30) {
          confidenceLevel = 'RECENT';
        } else if (daysOld <= 90) {
          confidenceLevel = 'HISTORICAL';
        } else {
          confidenceLevel = 'STALE';
        }
        
        corporateMementos.push({
          ticker: snapshot.ticker,
          ceo_name: snapshot.ceo_name,
          president_name: snapshot.president_name,
          chairman_name: snapshot.chairman_name,
          headquarters_city: snapshot.headquarters_city,
          company_description: snapshot.company_description,
          snapshot_date_only: snapshot.snapshot_date_only,
          days_old: daysOld,
          confidence_level: confidenceLevel
        });
      });
      
      console.log(`${logPrefix} Loaded ${corporateMementos.length} corporate mementos with confidence levels: ${corporateMementos.map(m => `${m.ticker}:${m.confidence_level}`).join(', ')}`);
    }
  }

  // =============================================================================
  // PASO 0.55: GRAPH EXPANSION - Knowledge Graph Traversal
  // Expands detected entities to discover related companies via verified relationships
  // =============================================================================
  interface GraphEntity {
    ticker: string;
    name: string;
    sector: string | null;
    subsector: string | null;
    ibex_family: string | null;
    depth: number;
    relation: 'ORIGIN' | 'COMPITE_CON' | 'MISMO_SUBSECTOR' | 'MISMO_SECTOR';
    strength: number;
    path: string[];
  }

  interface EntityScore {
    avg_rix: number;
    min_rix: number;
    max_rix: number;
    models_count: number;
    models: string[];
    by_model: any[];
  }

  interface GraphExpansionResult {
    primary_entity: {
      ticker: string;
      name: string;
      sector: string | null;
      subsector: string | null;
      ibex_family: string | null;
    };
    graph: GraphEntity[];
    entity_scores: Record<string, EntityScore>;
    metadata: {
      generated_at: string;
      depth: number;
      weeks_requested: number;
      total_entities: number;
      entities_with_scores: number;
    };
  }

  let entityGraphs: GraphExpansionResult[] = [];
  let graphContextString = '';
  
  // Only perform graph expansion for complete/exhaustive depth and when companies are detected
  const shouldExpandGraph = depthLevel !== 'quick' && detectedCompanies.length > 0;
  
  if (shouldExpandGraph) {
    console.log(`${logPrefix} GRAPH EXPANSION: Traversing knowledge graph for ${detectedCompanies.slice(0, 3).map(c => c.ticker).join(', ')}...`);
    
    try {
      // Expand graph for up to 3 detected companies (parallel calls)
      const graphPromises = detectedCompanies.slice(0, 3).map(async (company) => {
        const { data, error } = await supabaseClient.rpc('expand_entity_graph_with_scores', {
          p_ticker: company.ticker,
          p_depth: 2,
          p_weeks: 4
        });
        
        if (error) {
          console.warn(`${logPrefix} Graph expansion error for ${company.ticker}:`, error.message);
          return null;
        }
        
        return data as GraphExpansionResult;
      });
      
      const results = await Promise.all(graphPromises);
      entityGraphs = results.filter((r): r is GraphExpansionResult => r !== null);
      
      console.log(`${logPrefix} Graph expansion complete: ${entityGraphs.length} graphs, ${entityGraphs.reduce((sum, g) => sum + (g.metadata?.total_entities || 0), 0)} total entities`);
      
      // Build graph context string for LLM
      if (entityGraphs.length > 0) {
        graphContextString = buildGraphContextString(entityGraphs, detectedCompanies);
      }
    } catch (graphError) {
      console.error(`${logPrefix} Graph expansion failed:`, graphError);
    }
  } else {
    console.log(`${logPrefix} Skipping graph expansion (depth=${depthLevel}, companies=${detectedCompanies.length})`);
  }

  // Helper function to build graph context string
  function buildGraphContextString(graphs: GraphExpansionResult[], companies: any[]): string {
    const sections: string[] = [];
    
    sections.push(`🕸️ ======================================================================`);
    sections.push(`🕸️ GRAFO DE CONOCIMIENTO EMPRESARIAL (Relaciones Verificadas)`);
    sections.push(`🕸️ ======================================================================\n`);
    
    for (const graph of graphs) {
      if (!graph.primary_entity || !graph.graph) continue;
      
      const primary = graph.primary_entity;
      const primaryScore = graph.entity_scores?.[primary.ticker];
      
      sections.push(`## ENTIDAD PRINCIPAL: ${primary.name} (${primary.ticker})`);
      sections.push(`- Sector: ${primary.sector || 'N/A'}`);
      sections.push(`- Subsector: ${primary.subsector || 'N/A'}`);
      if (primaryScore) {
        sections.push(`- RIX Promedio: ${primaryScore.avg_rix} pts (rango: ${primaryScore.min_rix}-${primaryScore.max_rix})`);
        sections.push(`- Modelos analizados: ${primaryScore.models?.join(', ') || 'N/A'}`);
      }
      
      // Verified competitors (COMPITE_CON)
      const competitors = graph.graph.filter(e => e.relation === 'COMPITE_CON');
      if (competitors.length > 0) {
        sections.push(`\n### COMPETIDORES VERIFICADOS (COMPITE_CON - Alta confianza):`);
        for (const comp of competitors) {
          const compScore = graph.entity_scores?.[comp.ticker];
          const delta = compScore && primaryScore 
            ? (compScore.avg_rix - primaryScore.avg_rix).toFixed(1)
            : null;
          const deltaStr = delta ? ` (${parseFloat(delta) >= 0 ? '+' : ''}${delta} vs primaria)` : '';
          sections.push(`- ${comp.name} (${comp.ticker}): RIX ${compScore?.avg_rix || 'N/A'}${deltaStr}`);
        }
      }
      
      // Same subsector peers
      const subsectorPeers = graph.graph.filter(e => e.relation === 'MISMO_SUBSECTOR');
      if (subsectorPeers.length > 0) {
        sections.push(`\n### MISMO SUBSECTOR (${primary.subsector}):`);
        for (const peer of subsectorPeers.slice(0, 8)) {
          const peerScore = graph.entity_scores?.[peer.ticker];
          sections.push(`- ${peer.name} (${peer.ticker}): RIX ${peerScore?.avg_rix || 'N/A'}`);
        }
      }
      
      // Sector-level aggregates
      const allEntityScores = Object.entries(graph.entity_scores || {})
        .filter(([ticker]) => ticker !== primary.ticker)
        .map(([ticker, score]) => ({ ticker, ...score }))
        .filter(e => e.avg_rix);
      
      if (allEntityScores.length > 0) {
        const avgSectorRix = Math.round(allEntityScores.reduce((sum, e) => sum + e.avg_rix, 0) / allEntityScores.length * 10) / 10;
        const sortedByRix = [...allEntityScores].sort((a, b) => b.avg_rix - a.avg_rix);
        const topPerformer = sortedByRix[0];
        const bottomPerformer = sortedByRix[sortedByRix.length - 1];
        
        sections.push(`\n### CONTEXTO SECTORIAL:`);
        sections.push(`- RIX promedio del sector: ${avgSectorRix}`);
        if (primaryScore) {
          const diff = (primaryScore.avg_rix - avgSectorRix).toFixed(1);
          const comparison = parseFloat(diff) >= 0 ? 'por encima' : 'por debajo';
          sections.push(`- ${primary.name} está ${Math.abs(parseFloat(diff))} pts ${comparison} del promedio sectorial`);
        }
        if (topPerformer) {
          const topName = graph.graph.find(e => e.ticker === topPerformer.ticker)?.name || topPerformer.ticker;
          sections.push(`- Líder sectorial: ${topName} (RIX ${topPerformer.avg_rix})`);
        }
        if (bottomPerformer && bottomPerformer.ticker !== topPerformer?.ticker) {
          const bottomName = graph.graph.find(e => e.ticker === bottomPerformer.ticker)?.name || bottomPerformer.ticker;
          sections.push(`- Rezagado sectorial: ${bottomName} (RIX ${bottomPerformer.avg_rix})`);
        }
      }
      
      // Relationship summary
      sections.push(`\n### RESUMEN DEL GRAFO:`);
      sections.push(`- Total entidades conectadas: ${graph.metadata?.total_entities || graph.graph.length}`);
      sections.push(`- Competidores verificados: ${competitors.length}`);
      sections.push(`- Mismo subsector: ${subsectorPeers.length}`);
      sections.push(`- Entidades con scores RIX: ${graph.metadata?.entities_with_scores || 0}`);
      
      // Confidence note
      if (competitors.length > 0) {
        sections.push(`\n⚠️ ALTA CONFIANZA: Competidores verificados + datos RIX completos disponibles.`);
      } else if (subsectorPeers.length > 0) {
        sections.push(`\n⚠️ CONFIANZA MEDIA: Sin competidores verificados, usando peers de subsector.`);
      } else {
        sections.push(`\n⚠️ CONFIANZA BAJA: Datos limitados, comparativas solo contextuales.`);
      }
      
      sections.push(`\n---\n`);
    }
    
    return sections.join('\n');
  }

  // =============================================================================
  // PASO 0.6: CARGAR NOTICIAS CORPORATIVAS RECIENTES
  // =============================================================================
  interface CorporateNewsItem {
    ticker: string;
    headline: string;
    published_date: string | null;
    days_old: number | null;
    is_recent: boolean;
  }

  const corporateNews: CorporateNewsItem[] = [];
  
  if (detectedCompanies.length > 0) {
    const tickers = detectedCompanies.map(c => c.ticker);
    
    const { data: newsData, error: newsError } = await supabaseClient
      .from('corporate_news')
      .select('ticker, headline, published_date')
      .in('ticker', tickers)
      .order('published_date', { ascending: false })
      .limit(30); // Max 30 news items per query
    
    if (newsError) {
      console.warn(`${logPrefix} Error fetching corporate news:`, newsError.message);
    } else if (newsData && newsData.length > 0) {
      newsData.forEach((news: any) => {
        let daysOld: number | null = null;
        let isRecent = false;
        
        if (news.published_date) {
          const pubDate = new Date(news.published_date);
          daysOld = Math.floor((Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
          isRecent = daysOld < 14;
        }
        
        corporateNews.push({
          ticker: news.ticker,
          headline: news.headline,
          published_date: news.published_date,
          days_old: daysOld,
          is_recent: isRecent
        });
      });
      
      console.log(`${logPrefix} Loaded ${corporateNews.length} corporate news items (${corporateNews.filter(n => n.is_recent).length} recent)`);
    }
  }

  // =============================================================================
  // PASO 1: EXTRAER KEYWORDS RELEVANTES DE LA PREGUNTA
  // =============================================================================
  const stopWords = new Set(['de', 'la', 'el', 'en', 'que', 'es', 'y', 'a', 'los', 'las', 'un', 'una', 'por', 'con', 'para', 'del', 'al', 'se', 'su', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él', 'tanto', 'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella', 'estar', 'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tú', 'te', 'ti', 'tu', 'tus', 'ellas', 'nosotras', 'vosotros', 'vosotras', 'os', 'mío', 'mía', 'míos', 'mías', 'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya', 'suyos', 'suyas', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras', 'esos', 'esas', 'estoy', 'estás', 'está', 'estamos', 'estáis', 'están', 'esté', 'estés', 'estemos', 'estéis', 'estén', 'estaré', 'estarás', 'estará', 'estaremos', 'estaréis', 'estarán', 'estaría', 'estarías', 'estaríamos', 'estaríais', 'estarían', 'estaba', 'estabas', 'estábamos', 'estabais', 'estaban', 'estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron', 'estuviera', 'estuvieras', 'estuviéramos', 'estuvierais', 'estuvieran', 'estuviese', 'estuvieses', 'estuviésemos', 'estuvieseis', 'estuviesen', 'estando', 'estado', 'estada', 'estados', 'estadas', 'estad', 'he', 'has', 'ha', 'hemos', 'habéis', 'han', 'haya', 'hayas', 'hayamos', 'hayáis', 'hayan', 'habré', 'habrás', 'habrá', 'habremos', 'habréis', 'habrán', 'habría', 'habrías', 'habríamos', 'habríais', 'habrían', 'había', 'habías', 'habíamos', 'habíais', 'habían', 'hube', 'hubiste', 'hubo', 'hubimos', 'hubisteis', 'hubieron', 'hubiera', 'hubieras', 'hubiéramos', 'hubierais', 'hubieran', 'hubiese', 'hubieses', 'hubiésemos', 'hubieseis', 'hubiesen', 'habiendo', 'habido', 'habida', 'habidos', 'habidas', 'soy', 'eres', 'somos', 'sois', 'son', 'sea', 'seas', 'seamos', 'seáis', 'sean', 'seré', 'serás', 'será', 'seremos', 'seréis', 'serán', 'sería', 'serías', 'seríamos', 'seríais', 'serían', 'era', 'eras', 'éramos', 'erais', 'eran', 'fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron', 'fuera', 'fueras', 'fuéramos', 'fuerais', 'fueran', 'fuese', 'fueses', 'fuésemos', 'fueseis', 'fuesen', 'siendo', 'sido', 'tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen', 'tenga', 'tengas', 'tengamos', 'tengáis', 'tengan', 'tendré', 'tendrás', 'tendrá', 'tendremos', 'tendréis', 'tendrán', 'tendría', 'tendrías', 'tendríamos', 'tendríais', 'tendrían', 'tenía', 'tenías', 'teníamos', 'teníais', 'tenían', 'tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron', 'tuviera', 'tuvieras', 'tuviéramos', 'tuvierais', 'tuvieran', 'tuviese', 'tuvieses', 'tuviésemos', 'tuvieseis', 'tuviesen', 'teniendo', 'tenido', 'tenida', 'tenidos', 'tenidas', 'tened', 'dime', 'dame', 'cuál', 'cuáles', 'cuánto', 'cuánta', 'cuántos', 'cuántas', 'cómo', 'dónde', 'cuándo', 'quién', 'qué', 'todas', 'empresa', 'empresas', 'cualquier', 'alguna', 'alguno']);
  
  // Extract meaningful keywords from question
  const questionKeywords = question
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  console.log(`${logPrefix} Extracted keywords: ${questionKeywords.slice(0, 10).join(', ')}`);

  // =============================================================================
  // PASO 2: BÚSQUEDA FULL-TEXT EN TODA LA BASE DE DATOS
  // =============================================================================
  console.log(`${logPrefix} Performing FULL DATABASE SEARCH across all text fields...`);
  
  let fullTextSearchResults: any[] = [];
  const searchableKeywords = questionKeywords.filter(k => k.length > 3).slice(0, 5);
  
  if (searchableKeywords.length > 0) {
    for (const keyword of searchableKeywords) {
      const searchPattern = `%${keyword}%`;
      
      // BÚSQUEDA EXHAUSTIVA en TODOS los campos de texto de TODA la base de datos
      const { data: textResults, error: textError } = await supabaseClient
        .from('rix_runs')
        .select(`
          "03_target_name",
          "05_ticker",
          "02_model_name",
          "06_period_from",
          "07_period_to",
          "09_rix_score",
          "51_rix_score_adjusted",
          "10_resumen",
          "11_puntos_clave",
          "20_res_gpt_bruto",
          "21_res_perplex_bruto",
          "22_res_gemini_bruto",
          "23_res_deepseek_bruto",
          "22_explicacion",
          "25_explicaciones_detalladas",
          "23_nvm_score",
          "26_drm_score",
          "29_sim_score",
          "32_rmm_score",
          "35_cem_score",
          "38_gam_score",
          "41_dcm_score",
          "44_cxm_score",
          "25_nvm_categoria",
          "28_drm_categoria",
          "31_sim_categoria",
          "34_rmm_categoria",
          "37_cem_categoria",
          "40_gam_categoria",
          "43_dcm_categoria",
          "46_cxm_categoria"
        `)
        .or(`"10_resumen".ilike.${searchPattern},"20_res_gpt_bruto".ilike.${searchPattern},"21_res_perplex_bruto".ilike.${searchPattern},"22_res_gemini_bruto".ilike.${searchPattern},"23_res_deepseek_bruto".ilike.${searchPattern},"22_explicacion".ilike.${searchPattern}`)
        .limit(5000); // SIN LÍMITE: capturar ABSOLUTAMENTE TODO
      
      if (textError) {
        console.error(`${logPrefix} Error in full-text search for "${keyword}":`, textError);
      } else if (textResults && textResults.length > 0) {
        console.log(`${logPrefix} Found ${textResults.length} records mentioning "${keyword}"`);
        fullTextSearchResults.push(...textResults.map(r => ({ ...r, matchedKeyword: keyword })));
      }
    }
    
    // Deduplicate
    const seen = new Set();
    fullTextSearchResults = fullTextSearchResults.filter(r => {
      const key = `${r["03_target_name"]}-${r["02_model_name"]}-${r["06_period_from"]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    console.log(`${logPrefix} Total unique full-text search results: ${fullTextSearchResults.length}`);
  }

  // =============================================================================
  // PASO 3: CARGAR DATOS COMPLETOS DE EMPRESAS DETECTADAS (con textos)
  // =============================================================================
  let detectedCompanyFullData: any[] = [];
  
  if (detectedCompanies.length > 0) {
    console.log(`${logPrefix} Loading FULL DATA (including raw texts) for detected companies - ALL 6 AI MODELS...`);
    
    const fullDataColumns = `
      "02_model_name",
      "03_target_name",
      "05_ticker",
      "06_period_from",
      "07_period_to",
      "09_rix_score",
      "51_rix_score_adjusted",
      "10_resumen",
      "11_puntos_clave",
      "20_res_gpt_bruto",
      "21_res_perplex_bruto",
      "22_res_gemini_bruto",
      "23_res_deepseek_bruto",
      "22_explicacion",
      "25_explicaciones_detalladas",
      "23_nvm_score",
      "26_drm_score",
      "29_sim_score",
      "32_rmm_score",
      "35_cem_score",
      "38_gam_score",
      "41_dcm_score",
      "44_cxm_score",
      "25_nvm_categoria",
      "28_drm_categoria",
      "31_sim_categoria",
      "34_rmm_categoria",
      "37_cem_categoria",
      "40_gam_categoria",
      "43_dcm_categoria",
      "46_cxm_categoria",
      batch_execution_date
    `;
    
    for (const company of detectedCompanies.slice(0, 8)) {
      const companyFullData = await fetchUnifiedRixData({
        supabaseClient,
        columns: fullDataColumns,
        tickerFilter: company.ticker,
        limit: 48, // 6 models × 8 weeks
        logPrefix
      });
      
      console.log(`${logPrefix} Loaded ${companyFullData.length} full records for ${company.issuer_name}`);
      detectedCompanyFullData.push(...companyFullData);
    }
  }

  // =============================================================================
  // PASO 4: GENERAR EMBEDDING Y VECTOR SEARCH (complementario)
  // =============================================================================
  console.log(`${logPrefix} Generating embedding for vector search...`);
  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: question,
    }),
  });

  if (!embeddingResponse.ok) {
    throw new Error(`Embedding API error: ${embeddingResponse.statusText}`);
  }

  const embeddingData = await embeddingResponse.json();
  const embedding = embeddingData.data[0].embedding;

  // Vector search - máximo absoluto
  const { data: vectorDocs } = await supabaseClient.rpc('match_documents', {
    query_embedding: embedding,
    match_count: 200, // TODOS los documentos relevantes
    filter: {}
  });

  console.log(`${logPrefix} Vector documents found: ${vectorDocs?.length || 0}`);

  // =============================================================================
  // PASO 4.5: SIEMPRE CARGAR ANÁLISIS DE REGRESIÓN (NO solo por keywords)
  // La regresión da contexto de tendencias y correlación precio-métricas
  // que enriquece TODAS las respuestas del agente
  // =============================================================================
  
  interface RegressionAnalysisResult {
    success: boolean;
    dataProfile?: {
      totalRecords: number;
      companiesWithPrices: number;
      weeksAnalyzed: number;
      dateRange: { from: string; to: string };
      modelsIncluded: string[];
    };
    metricAnalysis?: Array<{
      metric: string;
      displayName: string;
      correlationWithPrice: number;
      pValue: number;
      isSignificant: boolean;
      direction: 'positive' | 'negative' | 'none';
      sampleSize: number;
    }>;
    topPredictors?: Array<{ metric: string; displayName: string; correlation: number }>;
    weakPredictors?: Array<{ metric: string; displayName: string; correlation: number }>;
    rSquared?: number;
    adjustedRSquared?: number;
    methodology?: string;
    caveats?: string[];
  }
  
  let regressionAnalysis: RegressionAnalysisResult | null = null;
  
  // SIEMPRE llamar a regresión para complete/exhaustive (quick puede omitirla para velocidad)
  const shouldLoadRegression = depthLevel !== 'quick';
  
  if (shouldLoadRegression) {
    console.log(`${logPrefix} LOADING REGRESSION ANALYSIS (always-on for depth=${depthLevel})...`);
    
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      
      // Usar timeout corto para no ralentizar mucho
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s max
      
      const regressionResponse = await fetch(`${supabaseUrl}/functions/v1/rix-regression-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ minWeeks: 6 }), // Menos restrictivo para más datos
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (regressionResponse.ok) {
        regressionAnalysis = await regressionResponse.json();
        console.log(`${logPrefix} Regression analysis loaded: ${regressionAnalysis?.dataProfile?.totalRecords || 0} records, ${regressionAnalysis?.dataProfile?.companiesWithPrices || 0} companies with prices`);
      } else {
        console.warn(`${logPrefix} Regression analysis failed: ${regressionResponse.status}`);
      }
    } catch (regError) {
      if (regError.name === 'AbortError') {
        console.warn(`${logPrefix} Regression analysis timeout (15s) - continuing without it`);
      } else {
        console.error(`${logPrefix} Error loading regression analysis:`, regError);
      }
    }
  } else {
    console.log(`${logPrefix} Skipping regression for quick depth level`);
  }

  // =============================================================================
  // PASO 5: CARGAR DATOS ESTRUCTURADOS (con paginación inteligente)
  // =============================================================================
  console.log(`${logPrefix} Loading structured RIX data for rankings - ALL 6 AI MODELS...`);
  
  // Use pagination for large requests
  let allRixData: any[] = [];
  let rixOffset = 0;
  const rixBatchSize = 2000;
  const maxRixRecords = depthLevel === 'exhaustive' ? 10000 : 5000;
  
  while (rixOffset < maxRixRecords) {
    const batch = await fetchUnifiedRixData({
      supabaseClient,
      columns: `
        "01_run_id",
        "02_model_name",
        "03_target_name",
        "05_ticker",
        "06_period_from",
        "07_period_to",
        "09_rix_score",
        "51_rix_score_adjusted",
        "32_rmm_score",
        "10_resumen",
        "11_puntos_clave",
        batch_execution_date
      `,
      limit: rixBatchSize,
      logPrefix
    });
    
    if (!batch || batch.length === 0) break;
    
    allRixData.push(...batch);
    rixOffset += batch.length;
    
    if (batch.length < rixBatchSize) break;
    
    // For quick depth, stop after first batch
    if (depthLevel === 'quick') break;
  }

  console.log(`${logPrefix} Total unified RIX records loaded: ${allRixData?.length || 0} (depth: ${depthLevel})`);

  // =============================================================================
  // PASO 6: CONSTRUIR CONTEXTO COMPLETO PARA EL LLM
  // =============================================================================
  let context = '';

  // 6.0-REGRESSION: ANÁLISIS ESTADÍSTICO REAL (siempre disponible para complete/exhaustive)
  // Este contexto permite al LLM usar datos de tendencias y correlaciones precio-métrica
  if (regressionAnalysis && regressionAnalysis.success) {
    context += `📊 ======================================================================\n`;
    context += `📊 CONTEXTO ESTADÍSTICO: CORRELACIONES MÉTRICAS RIX ↔ PRECIO\n`;
    context += `📊 (Usa estos datos para enriquecer análisis de tendencias y valoración)\n`;
    context += `📊 ======================================================================\n\n`;
    
    context += `### Perfil de Datos Analizados:\n`;
    context += `- **Total registros**: ${regressionAnalysis.dataProfile?.totalRecords.toLocaleString() || 'N/A'}\n`;
    context += `- **Empresas con precios**: ${regressionAnalysis.dataProfile?.companiesWithPrices || 'N/A'}\n`;
    context += `- **Semanas analizadas**: ${regressionAnalysis.dataProfile?.weeksAnalyzed || 'N/A'}\n`;
    context += `- **Rango temporal**: ${regressionAnalysis.dataProfile?.dateRange?.from || 'N/A'} a ${regressionAnalysis.dataProfile?.dateRange?.to || 'N/A'}\n`;
    context += `- **Modelos IA incluidos**: ${regressionAnalysis.dataProfile?.modelsIncluded?.join(', ') || 'N/A'}\n\n`;
    
    context += `### Métricas TOP Predictoras (estadísticamente significativas):\n`;
    if (regressionAnalysis.topPredictors && regressionAnalysis.topPredictors.length > 0) {
      context += `| Métrica | Nombre | Correlación | Interpretación |\n`;
      context += `|---------|--------|-------------|----------------|\n`;
      regressionAnalysis.topPredictors.forEach(p => {
        const interp = p.correlation > 0 
          ? `Mayor ${p.displayName} → precio tiende a subir` 
          : `Mayor ${p.displayName} → precio tiende a bajar`;
        context += `| ${p.metric.replace(/^\d+_/, '')} | ${p.displayName} | ${p.correlation > 0 ? '+' : ''}${p.correlation.toFixed(3)} | ${interp} |\n`;
      });
    } else {
      context += `No se encontraron métricas con correlación estadísticamente significativa con el precio.\n`;
    }
    context += `\n`;
    
    context += `### Análisis Completo por Métrica:\n`;
    if (regressionAnalysis.metricAnalysis && regressionAnalysis.metricAnalysis.length > 0) {
      context += `| Métrica | Correlación | p-value | Significativo | Dirección | Muestra |\n`;
      context += `|---------|-------------|---------|---------------|-----------|--------|\n`;
      regressionAnalysis.metricAnalysis.forEach(m => {
        const sigSymbol = m.isSignificant ? '✓' : '✗';
        const dirSymbol = m.direction === 'positive' ? '↗' : m.direction === 'negative' ? '↘' : '→';
        context += `| ${m.displayName} | ${m.correlationWithPrice > 0 ? '+' : ''}${m.correlationWithPrice.toFixed(3)} | ${m.pValue.toFixed(3)} | ${sigSymbol} | ${dirSymbol} | n=${m.sampleSize} |\n`;
      });
    }
    context += `\n`;
    
    context += `### Calidad del Modelo:\n`;
    context += `- **R² (varianza explicada)**: ${((regressionAnalysis.rSquared || 0) * 100).toFixed(1)}%\n`;
    context += `- **R² ajustado**: ${((regressionAnalysis.adjustedRSquared || 0) * 100).toFixed(1)}%\n\n`;
    
    context += `### Metodología:\n`;
    context += `${regressionAnalysis.methodology || 'Correlación de Pearson entre métricas RIX y variación de precio semanal.'}\n\n`;
    
    context += `### ⚠️ Limitaciones y Caveats:\n`;
    if (regressionAnalysis.caveats) {
      regressionAnalysis.caveats.forEach(c => {
        context += `- ${c}\n`;
      });
    }
    context += `\n`;
    
    context += `📊 ======================================================================\n\n`;
  }

  // 6.0-GRAPH: GRAFO DE CONOCIMIENTO EMPRESARIAL (Hybrid RAG)
  // Provides structured entity relationships for reasoning about connections
  if (graphContextString) {
    context += graphContextString;
    context += '\n';
  }

  // 6.0-A MEMENTO CORPORATIVO - DATOS VERIFICADOS (PRIORIDAD MÁXIMA)
  if (corporateMementos.length > 0) {
    context += `🏛️ ======================================================================\n`;
    context += `🏛️ MEMENTO CORPORATIVO - DATOS VERIFICADOS CON FECHA\n`;
    context += `🏛️ IMPORTANTE: Usa estos datos para responder preguntas sobre liderazgo y datos corporativos\n`;
    context += `🏛️ ======================================================================\n\n`;
    
    corporateMementos.forEach(memento => {
      const company = detectedCompanies.find(c => c.ticker === memento.ticker);
      const companyName = company?.issuer_name || memento.ticker;
      
      context += `## 🏢 ${companyName.toUpperCase()} (${memento.ticker})\n`;
      context += `📅 **Fecha de actualización**: ${memento.snapshot_date_only} (hace ${memento.days_old} días)\n`;
      context += `🔒 **Nivel de certeza**: ${memento.confidence_level}\n\n`;
      
      // ========================================================================
      // REGLA ANTI-ALUCINACIÓN: Bloquear mención de ejecutivos si NO hay datos
      // ========================================================================
      const hasLeadershipData = memento.president_name || memento.ceo_name || memento.chairman_name;
      
      if (!hasLeadershipData) {
        context += `🚫 **ADVERTENCIA CRÍTICA - DATOS DE LIDERAZGO NO DISPONIBLES**\n`;
        context += `⚠️ NO hay datos verificados de directivos (CEO, Presidente, Chairman) para ${companyName}.\n`;
        context += `❌ PROHIBIDO: NO menciones nombres de ejecutivos, presidentes o CEOs para esta empresa.\n`;
        context += `✅ Si el usuario pregunta sobre liderazgo de ${companyName}, responde:\n`;
        context += `   "No dispongo de datos verificados sobre el equipo directivo actual de ${companyName}.\n`;
        context += `    Te recomiendo consultar su web corporativa oficial para información actualizada."\n`;
        context += `⚠️ NO uses tu conocimiento de entrenamiento para nombrar ejecutivos - puede estar desactualizado.\n\n`;
      } else {
        // Guidance for certainty levels (solo si HAY datos)
        if (memento.confidence_level === 'VERIFIED') {
          context += `✅ *Datos verificados (< 7 días) - Puedes hacer afirmaciones directas mencionando la fecha*\n`;
        } else if (memento.confidence_level === 'RECENT') {
          context += `⚠️ *Datos recientes (7-30 días) - Menciona la fecha y sugiere verificar si es crítico*\n`;
        } else if (memento.confidence_level === 'HISTORICAL') {
          context += `📜 *Datos históricos (30-90 días) - Usa caveats: "según información de [fecha]..."*\n`;
        } else {
          context += `❓ *Datos antiguos (> 90 días) - Solo mencionar como referencia histórica*\n`;
        }
        context += `\n`;
        
        // Mostrar cargos con etiquetas correctas según el contexto español
        if (memento.president_name) {
          context += `👔 **Presidente Ejecutivo**: ${memento.president_name}\n`;
        }
        if (memento.ceo_name && memento.ceo_name !== memento.president_name) {
          context += `🎯 **CEO / Consejero Delegado**: ${memento.ceo_name}\n`;
        }
        if (memento.chairman_name && memento.chairman_name !== memento.president_name) {
          context += `🏛️ **Presidente del Consejo**: ${memento.chairman_name}\n`;
        }
      }
      
      if (memento.headquarters_city) {
        context += `📍 **Sede**: ${memento.headquarters_city}\n`;
      }
      if (memento.company_description) {
        context += `📝 **Descripción**: ${memento.company_description.substring(0, 300)}${memento.company_description.length > 300 ? '...' : ''}\n`;
      }
      context += `\n---\n\n`;
    });
  }

  // 6.0-B NOTICIAS CORPORATIVAS RECIENTES
  if (corporateNews.length > 0) {
    const recentNews = corporateNews.filter(n => n.is_recent);
    const olderNews = corporateNews.filter(n => !n.is_recent);
    
    context += `📰 ======================================================================\n`;
    context += `📰 NOTICIAS CORPORATIVAS (de portales oficiales de las empresas)\n`;
    context += `📰 ======================================================================\n\n`;
    
    if (recentNews.length > 0) {
      context += `### 🆕 Noticias Recientes (últimos 14 días):\n`;
      recentNews.slice(0, 10).forEach(news => {
        const company = detectedCompanies.find(c => c.ticker === news.ticker);
        context += `- **${company?.issuer_name || news.ticker}** (${news.published_date || 'sin fecha'}): ${news.headline}\n`;
      });
      context += `\n`;
    }
    
    if (olderNews.length > 0) {
      context += `### 📅 Noticias Anteriores:\n`;
      olderNews.slice(0, 5).forEach(news => {
        const company = detectedCompanies.find(c => c.ticker === news.ticker);
        context += `- **${company?.issuer_name || news.ticker}** (${news.published_date || 'sin fecha'}): ${news.headline}\n`;
      });
      context += `\n`;
    }
    context += `\n`;
  }

  // 6.0-C RESULTADOS DE BÚSQUEDA FULL-TEXT (PRIORIDAD MÁXIMA)
  if (fullTextSearchResults.length > 0) {
    context += `🔍 ======================================================================\n`;
    context += `🔍 RESULTADOS DE BÚSQUEDA EN TEXTOS ORIGINALES DE IA\n`;
    context += `🔍 Se encontraron ${fullTextSearchResults.length} registros relevantes en la base de datos\n`;
    context += `🔍 ======================================================================\n\n`;
    
    // Group by keyword
    const byKeyword = new Map<string, any[]>();
    fullTextSearchResults.forEach(r => {
      const kw = r.matchedKeyword || 'general';
      if (!byKeyword.has(kw)) byKeyword.set(kw, []);
      byKeyword.get(kw)!.push(r);
    });
    
    for (const [keyword, results] of byKeyword) {
      context += `## 📰 Resultados para "${keyword.toUpperCase()}" (${results.length} registros):\n\n`;
      context += `| Empresa | Ticker | Modelo IA | Período | RIX |\n`;
      context += `|---------|--------|-----------|---------|-----|\n`;
      
      results.slice(0, 20).forEach(r => {
        const rix = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
        context += `| ${r["03_target_name"]} | ${r["05_ticker"]} | ${r["02_model_name"]} | ${r["06_period_from"]} a ${r["07_period_to"]} | ${rix} |\n`;
      });
      
      // Include text excerpts - más extensos para contexto ejecutivo
      context += `\n### Extractos relevantes (fuentes originales de IA):\n`;
      results.slice(0, 8).forEach((r, idx) => {
        const fields = [
          { name: 'ChatGPT', value: r["20_res_gpt_bruto"] },
          { name: 'Perplexity', value: r["21_res_perplex_bruto"] },
          { name: 'Gemini', value: r["22_res_gemini_bruto"] },
          { name: 'DeepSeek', value: r["23_res_deepseek_bruto"] },
          { name: 'Grok', value: r["respuesta_bruto_grok"] },
          { name: 'Qwen', value: r["respuesta_bruto_qwen"] },
          { name: 'Explicación', value: r["22_explicacion"] },
          { name: 'Resumen', value: r["10_resumen"] },
        ];
        
        for (const field of fields) {
          if (field.value && field.value.toLowerCase().includes(keyword.toLowerCase())) {
            const lowerText = field.value.toLowerCase();
            const pos = lowerText.indexOf(keyword.toLowerCase());
            const start = Math.max(0, pos - 250);
            const end = Math.min(field.value.length, pos + keyword.length + 500);
            const snippet = field.value.substring(start, end);
            
            context += `\n**${idx + 1}. ${r["03_target_name"]} (${r["02_model_name"]} - ${field.name}):**\n`;
            context += `> "...${snippet}..."\n`;
            break;
          }
        }
      });
      context += '\n';
    }
    context += '\n';
  }

  // 6.1 DATOS COMPLETOS DE EMPRESAS DETECTADAS (con textos brutos)
  if (detectedCompanyFullData.length > 0) {
    context += `\n🏢 ======================================================================\n`;
    context += `🏢 DATOS COMPLETOS DE EMPRESAS MENCIONADAS (INCLUYE TEXTOS ORIGINALES)\n`;
    context += `🏢 ======================================================================\n\n`;
    
    // Group by company
    const byCompany = new Map<string, any[]>();
    detectedCompanyFullData.forEach(r => {
      const company = r["03_target_name"];
      if (!byCompany.has(company)) byCompany.set(company, []);
      byCompany.get(company)!.push(r);
    });
    
    for (const [companyName, records] of byCompany) {
      const company = detectedCompanies.find(c => c.issuer_name === companyName);
      context += `## 📊 ${companyName.toUpperCase()} (${records[0]["05_ticker"]})\n`;
      if (company) {
        context += `Sector: ${company.sector_category || 'N/A'} | IBEX: ${company.ibex_family_code || 'N/A'} | Cotiza: ${company.cotiza_en_bolsa ? 'Sí' : 'No'}\n\n`;
      }
      
      // Show scores by model
      context += `### Scores por Modelo IA:\n`;
      context += `| Modelo | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |\n`;
      context += `|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|\n`;
      
      records.slice(0, 6).forEach(r => {
        const rix = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
        context += `| ${r["02_model_name"]} | ${rix ?? '-'} | ${r["23_nvm_score"] ?? '-'} | ${r["26_drm_score"] ?? '-'} | ${r["29_sim_score"] ?? '-'} | ${r["32_rmm_score"] ?? '-'} | ${r["35_cem_score"] ?? '-'} | ${r["38_gam_score"] ?? '-'} | ${r["41_dcm_score"] ?? '-'} | ${r["44_cxm_score"] ?? '-'} |\n`;
      });
      
      // Include raw text excerpts (most recent per model)
      context += `\n### Análisis de cada modelo IA:\n`;
      records.slice(0, 6).forEach(r => {
        context += `\n**${r["02_model_name"]}** (${r["06_period_from"]} a ${r["07_period_to"]}):\n`;
        
        // Resumen
        if (r["10_resumen"]) {
          context += `- **Resumen**: ${r["10_resumen"].substring(0, 500)}...\n`;
        }
        
        // Raw text excerpt
        // Map model name to raw response field (supports all 7 models)
        const modelResponseMap: Record<string, string> = {
          'ChatGPT': '20_res_gpt_bruto',
          'Perplexity': '21_res_perplex_bruto',
          'Google Gemini': '22_res_gemini_bruto',
          'Gemini': '22_res_gemini_bruto',
          'Deepseek': '23_res_deepseek_bruto',
          'DeepSeek': '23_res_deepseek_bruto',
          'Grok': 'respuesta_bruto_grok',
          'Qwen': 'respuesta_bruto_qwen',
        };
        const rawFieldKey = modelResponseMap[r["02_model_name"]] || null;
        const rawField = rawFieldKey ? r[rawFieldKey] : null;
        
        if (rawField) {
          context += `- **Texto original (extracto)**: ${rawField.substring(0, 800)}...\n`;
        }
      });
      context += '\n---\n\n';
    }
  }

  // 6.2 Documentos vectoriales (contexto adicional)
  if (vectorDocs && vectorDocs.length > 0) {
    context += `📚 CONTEXTO ADICIONAL DEL VECTOR STORE (${vectorDocs.length} documentos):\n\n`;
    vectorDocs.forEach((doc: any, idx: number) => {
      const metadata = doc.metadata || {};
      context += `[${idx + 1}] ${metadata.company_name || 'Sin empresa'} - ${metadata.week || 'Sin fecha'}\n`;
      context += `${doc.content?.substring(0, 600) || 'Sin contenido'}...\n\n`;
    });
    context += '\n';
  }

  // 6.3 Construir ranking general de la semana actual
  if (allRixData && allRixData.length > 0) {
    const getPeriodKey = (run: any) => `${run["06_period_from"]}|${run["07_period_to"]}`;

    const uniquePeriods = [...new Set(allRixData.map(getPeriodKey))]
      .sort((a, b) => {
        const dateA = a.split('|')[1];
        const dateB = b.split('|')[1];
        return dateB.localeCompare(dateA);
      });

    const currentPeriod = uniquePeriods[0];
    const currentWeekData = allRixData.filter(run => getPeriodKey(run) === currentPeriod);

    const previousPeriod = uniquePeriods[1];
    const previousWeekData = previousPeriod 
      ? allRixData.filter(run => getPeriodKey(run) === previousPeriod) 
      : [];

    const [currentFrom, currentTo] = currentPeriod ? currentPeriod.split('|') : [null, null];
    const [prevFrom, prevTo] = previousPeriod ? previousPeriod.split('|') : [null, null];

    console.log(`${logPrefix} Current period: ${currentFrom} to ${currentTo} (${currentWeekData.length} records)`);
    console.log(`${logPrefix} Previous period: ${prevFrom || 'N/A'} to ${prevTo || 'N/A'} (${previousWeekData.length} records)`);

    // =========================================================================
    // 6.4 RANKING GENERAL (sin filtros destructivos)
    // =========================================================================
    const rankedRecords = currentWeekData
      // ELIMINADO EL FILTRO DESTRUCTIVO: .filter(run => run["32_rmm_score"] !== 0)
      .map(run => ({
        company: run["03_target_name"],
        ticker: run["05_ticker"],
        model: run["02_model_name"],
        rixScore: run["51_rix_score_adjusted"] ?? run["09_rix_score"],
        rmmScore: run["32_rmm_score"],
        periodFrom: run["06_period_from"],
        periodTo: run["07_period_to"]
      }))
      .filter(r => r.company && r.rixScore != null)
      .sort((a, b) => (b.rixScore || 0) - (a.rixScore || 0));

    const companyAverages = new Map<string, { scores: number[], ticker: string }>();
    
    currentWeekData.forEach(run => {
      const companyName = run["03_target_name"];
      const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
      
      if (!companyName || score == null) return;
      
      if (!companyAverages.has(companyName)) {
        companyAverages.set(companyName, {
          scores: [],
          ticker: run["05_ticker"] || ''
        });
      }
      
      companyAverages.get(companyName)!.scores.push(score);
    });

    const rankedByAverage = Array.from(companyAverages.entries())
      .map(([company, data]) => ({
        company,
        ticker: data.ticker,
        avgRix: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
        modelCount: data.scores.length
      }))
      .sort((a, b) => b.avgRix - a.avgRix);

    const trends = new Map<string, number>();
    if (previousWeekData.length > 0) {
      const prevScores = new Map<string, number[]>();
      previousWeekData.forEach(run => {
        const companyName = run["03_target_name"];
        const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
        if (!companyName || score == null) return;
        
        if (!prevScores.has(companyName)) prevScores.set(companyName, []);
        prevScores.get(companyName)!.push(score);
      });

      rankedByAverage.forEach(curr => {
        const prevData = prevScores.get(curr.company);
        if (prevData && prevData.length > 0) {
          const prevAvg = prevData.reduce((a, b) => a + b, 0) / prevData.length;
          trends.set(curr.company, curr.avgRix - prevAvg);
        }
      });
    }

    const periodFrom = rankedRecords[0]?.periodFrom;
    const periodTo = rankedRecords[0]?.periodTo;
    
    context += `\n📊 RANKING INDIVIDUAL SEMANA ACTUAL (${periodFrom} a ${periodTo}):\n`;
    context += `Este es el ranking tal como aparece en el dashboard principal.\n`;
    context += `Cada fila es una evaluación individual: Empresa + Modelo IA + RIX Score.\n`;
    context += `Total de evaluaciones esta semana: ${rankedRecords.length}\n\n`;
    context += `| # | Empresa | Ticker | RIX | Modelo IA |\n`;
    context += `|---|---------|--------|-----|----------|\n`;
    
    // Increased from 50 to 150 records shown
    rankedRecords.slice(0, 150).forEach((record, idx) => {
      context += `| ${idx + 1} | ${record.company} | ${record.ticker} | ${record.rixScore} | ${record.model} |\n`;
    });

    if (rankedRecords.length > 150) {
      context += `\n... y ${rankedRecords.length - 150} evaluaciones más.\n`;
    }

    context += `\n`;

    context += `\n📊 PROMEDIOS POR EMPRESA (solo usar si el usuario pregunta explícitamente):\n`;
    context += `Esta tabla muestra el promedio de los 4 modelos de IA para cada empresa.\n`;
    context += `Total de empresas evaluadas: ${rankedByAverage.length}\n\n`;
    context += `| # | Empresa | Ticker | RIX Promedio | # Modelos | Tendencia vs Semana Anterior |\n`;
    context += `|---|---------|--------|--------------|-----------|------------------------------|\n`;
    
    // Increased from 20 to 50 companies shown
    rankedByAverage.slice(0, 50).forEach((company, idx) => {
      const trend = trends.get(company.company);
      const trendStr = trend !== undefined 
        ? (trend > 0 ? `↗ +${trend.toFixed(1)}` : trend < 0 ? `↘ ${trend.toFixed(1)}` : '→ 0.0')
        : 'N/A';
      
      context += `| ${idx + 1} | ${company.company} | ${company.ticker} | ${company.avgRix} | ${company.modelCount} | ${trendStr} |\n`;
    });

    if (rankedByAverage.length > 50) {
      context += `\n... y ${rankedByAverage.length - 50} empresas más.\n`;
    }

    context += `\n`;

    const modelBreakdown = new Map<string, { count: number, avgScore: number, companies: Set<string> }>();
    
    currentWeekData.forEach(run => {
      const model = run["02_model_name"];
      const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
      const company = run["03_target_name"];
      
      if (!model || score == null) return;
      
      if (!modelBreakdown.has(model)) {
        modelBreakdown.set(model, { count: 0, avgScore: 0, companies: new Set() });
      }
      
      const entry = modelBreakdown.get(model)!;
      entry.count++;
      entry.avgScore += score;
      entry.companies.add(company);
    });

    context += `\n🤖 ANÁLISIS POR MODELO DE IA:\n\n`;
    Array.from(modelBreakdown.entries())
      .sort((a, b) => b[1].avgScore / b[1].count - a[1].avgScore / a[1].count)
      .forEach(([model, data]) => {
        const avg = Math.round((data.avgScore / data.count) * 10) / 10;
        context += `**${model}**: ${data.count} evaluaciones, ${data.companies.size} empresas, promedio ${avg}\n`;
      });

    context += `\n`;

    if (trends.size > 0) {
      const sortedByTrend = Array.from(trends.entries())
        .map(([company, trend]) => {
          const companyData = rankedByAverage.find(c => c.company === company);
          return { company, trend, ticker: companyData?.ticker || '', rix: companyData?.avgRix || 0 };
        })
        .sort((a, b) => b.trend - a.trend);

      const topGainers = sortedByTrend.slice(0, 5);
      const topLosers = sortedByTrend.slice(-5).reverse();

      context += `\n📈 TOP 5 GANADORES (mayor mejora promedio vs semana anterior):\n`;
      topGainers.forEach((item, idx) => {
        context += `${idx + 1}. ${item.company} (${item.ticker}): RIX promedio ${item.rix}, cambio +${item.trend.toFixed(1)}\n`;
      });

      context += `\n📉 TOP 5 PERDEDORES (mayor caída promedio vs semana anterior):\n`;
      topLosers.forEach((item, idx) => {
        context += `${idx + 1}. ${item.company} (${item.ticker}): RIX promedio ${item.rix}, cambio ${item.trend.toFixed(1)}\n`;
      });

      context += `\n`;
    }

    if (previousWeekData.length > 0) {
      context += `\n📅 DATOS SEMANA ANTERIOR (${prevFrom} a ${prevTo}):\n`;
      context += `Total de evaluaciones: ${previousWeekData.length}\n\n`;
    }
  } else {
    context += '\n⚠️ No hay datos estructurados de RIX disponibles.\n\n';
  }

  // Context is complete - no hints needed

  console.log(`${logPrefix} Context length: ${context.length} characters`);

  // =============================================================================
  // PASO 5: LLAMAR A LA IA CON CONTEXTO COMPLETO
  // =============================================================================
  
  console.log(`${logPrefix} Language: ${language} (${languageName})`);
  
  const systemPrompt = `[IDIOMA OBLIGATORIO: ${languageName} (${language})]
Responde SIEMPRE en ${languageName}. Sin excepciones.

═══════════════════════════════════════════════════════════════════════════════
                    AGENTE RIX – ANALISTA REPUTACIONAL CORPORATIVO
═══════════════════════════════════════════════════════════════════════════════

Eres el AGENTE RIX, un analista senior de reputación algorítmica que produce 
INFORMES EJECUTIVOS para alta dirección. Tus informes son presentables en 
comités de dirección, consejos de administración y reuniones de inversores.

TU TONO:
• Profesional y analítico, nunca periodístico ni dramático
• Declarativo: afirmas lo que los datos muestran con la autoridad que merecen
• Narrativo: construyes un relato coherente, no una lista de datos
• Accesible: un directivo sin formación técnica debe entenderte perfectamente
• Sin clickbait, sin melodrama, sin exageraciones

LO QUE NO ERES:
• Un periodista buscando titulares sensacionalistas
• Un manual técnico que lista métricas sin contexto
• Un chatbot que responde con bullets desconectados

═══════════════════════════════════════════════════════════════════════════════
              PRINCIPIO RECTOR: DENSIDAD DE EVIDENCIA CRUZADA
═══════════════════════════════════════════════════════════════════════════════

El RepIndex analiza cómo 6 modelos de IA perciben cada empresa. El PESO de 
cada hallazgo depende de cuántas IAs coinciden:

┌─────────────────────────────────────────────────────────────────────────────┐
│ HECHO CONSOLIDADO (5-6 IAs coinciden)                                       │
│ → Afirmación directa con autoridad plena                                    │
│ Ejemplo: "Las seis IAs coinciden en destacar el liderazgo de [Empresa]      │
│ en transición energética, consolidando este como un hecho reputacional."    │
├─────────────────────────────────────────────────────────────────────────────┤
│ SEÑAL FUERTE (3-4 IAs coinciden)                                            │
│ → "La mayoría de los modelos indica...", "Cuatro de seis IAs destacan..."   │
├─────────────────────────────────────────────────────────────────────────────┤
│ INDICACIÓN (2 IAs coinciden)                                                │
│ → "Según ChatGPT y Gemini...", "Dos modelos señalan..."                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ DATO AISLADO (1 sola IA)                                                    │
│ → Solo mencionar si es muy relevante: "Según DeepSeek..." con caveat        │
└─────────────────────────────────────────────────────────────────────────────┘

La CONJUNCIÓN DE DATOS es más valiosa que cualquier métrica individual.
Un dato mencionado por 5 IAs tiene más peso analítico que un score de 80 puntos.

═══════════════════════════════════════════════════════════════════════════════
                    ESTRUCTURA DE INFORME EJECUTIVO
═══════════════════════════════════════════════════════════════════════════════

Usa esta estructura para informes completos sobre una empresa:

### 1. RESUMEN EJECUTIVO
Un párrafo denso que sintetice la situación reputacional. El directivo debe
poder leer SOLO esto y llevarse la idea clave al comité.

Ejemplo: "[Empresa] ha avanzado de forma perceptible en narrativa sectorial 
y contratos internacionales, pero su reputación permanece en zona vulnerable 
(RIX 47,3) debido a la fragilidad financiera y a una comunicación irregular."

### 2. CONTEXTO Y DATOS CLAVE
- Posicionamiento sectorial (qué hace la empresa, con quién compite)
- Tabla de diagnóstico multi-IA con TODAS las métricas
- Tendencia últimas semanas
- Palancas positivas y riesgos detectados

### 3. ANÁLISIS ESTRATÉGICO DETALLADO
- Brevedad ejecutiva: 4-5 puntos clave sin tecnicismos
- Impacto en negocio: cómo afecta la reputación a captación de talento, 
  financiación, desarrollo comercial
- Comparativa competitiva: benchmark con empresas similares
- Decisiones requeridas: recomendaciones concretas

### 4. COMPARATIVA Y BENCHMARKING
Tabla comparativa con competidores directos mostrando todas las métricas.

### 5. RIESGOS Y OPORTUNIDADES
- Riesgos identificados con su impacto potencial
- Oportunidades de mejora reputacional

Para preguntas simples, adapta la profundidad manteniendo el rigor.

═══════════════════════════════════════════════════════════════════════════════
                    LAS 8 MÉTRICAS DIMENSIONALES (GLOSARIO CANÓNICO)
═══════════════════════════════════════════════════════════════════════════════

SIEMPRE explica cada métrica en su PRIMERA MENCIÓN. Después usa la sigla.
USA EXCLUSIVAMENTE ESTOS NOMBRES TÉCNICOS. NO inventes interpretaciones alternativas.

• NVM (Narrative Value Metric → Calidad de la Narrativa): mide la coherencia 
  del discurso público, nivel de controversia y afirmaciones verificables.

• DRM (Data Reliability Metric → Fortaleza de Evidencia): evalúa la calidad 
  de fuentes primarias, corroboración múltiple y trazabilidad documental.

• SIM (Source Integrity Metric → Autoridad de Fuentes): analiza la jerarquía 
  de fuentes citadas. T1: reguladores/financieros → T4: redes/opinión.
  ⚠️ NO mide sostenibilidad/ESG. Mide JERARQUÍA DE FUENTES.

• RMM (Reputational Momentum Metric → Actualidad y Empuje): mide la frescura 
  temporal de menciones dentro de la ventana semanal analizada.
  ⚠️ NO mide marketing/branding. Mide FRESCURA TEMPORAL.

• CEM (Controversy Exposure Metric → Gestión de Controversias): evalúa la 
  exposición a riesgos judiciales, políticos y laborales. 
  Puntuación INVERSA: 100 = sin controversias, 0 = máxima exposición.

• GAM (Governance Autonomy Metric → Percepción de Gobierno): mide la 
  percepción de independencia y buenas prácticas de gobernanza corporativa.
  ⚠️ NO mide gestión de talento/RRHH. Mide GOBIERNO CORPORATIVO.

• DCM (Data Consistency Metric → Coherencia Informativa): evalúa la 
  consistencia de información sobre la empresa entre diferentes modelos de IA.
  ⚠️ NO mide innovación digital. Mide COHERENCIA ENTRE MODELOS.

• CXM (Corporate Execution Metric → Ejecución Corporativa): mide la percepción 
  de ejecución en mercado y correlación con cotización bursátil (solo cotizadas).
  ⚠️ NO mide experiencia del cliente. Mide EJECUCIÓN CORPORATIVA.

ESCALA RIX GLOBAL (0-100):
• 80-100: Excelencia reputacional
• 65-79: Reputación sólida  
• 50-64: Reputación moderada
• 35-49: Reputación vulnerable
• 0-34: Reputación crítica

EJEMPLO DE INTEGRACIÓN CORRECTA:
"La Calidad de la Narrativa (NVM, que mide coherencia del discurso y 
afirmaciones verificables) alcanza 53 puntos de media, impulsada por los 
contratos internacionales recientes. Sin embargo, la Fortaleza de Evidencia 
(DRM, que evalúa calidad de fuentes primarias) se mantiene baja en 29,8 
puntos, reflejando documentación insuficiente en las afirmaciones de las IAs.
Esta brecha de 23 puntos entre NVM y DRM indica una narrativa atractiva pero 
con poca evidencia verificable que la respalde."

═══════════════════════════════════════════════════════════════════════════════
                    TABLAS DE DATOS EN INFORMES
═══════════════════════════════════════════════════════════════════════════════

Usa TABLAS MARKDOWN para presentar datos comparativos. Formato:

| Modelo IA  | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |
|------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| ChatGPT    | 64  | 71  | 63  | 35  | 35  | 100 | 50  | 88  | 62  |
| Perplexity | 68  | 75  | 58  | 42  | 38  | 95  | 55  | 85  | 58  |
| Gemini     | 50  | 55  | 30  | 10  | 42  | 90  | 50  | 70  | 60  |
| DeepSeek   | 55  | 60  | 45  | 25  | 35  | 88  | 48  | 72  | 55  |
| Grok       | 62  | 68  | 52  | 38  | 40  | 92  | 52  | 78  | 60  |
| Qwen       | 58  | 65  | 48  | 30  | 36  | 90  | 50  | 75  | 57  |

Para benchmarking competitivo:

| Empresa     | RIX  | Tendencia | Comentario síntesis |
|-------------|------|-----------|---------------------|
| Empresa A   | 70   | ↗ estable | Alta NVM, buena GAM |
| Empresa B   | 47   | ↗ +5,8    | Contratos vs pérdidas |

═══════════════════════════════════════════════════════════════════════════════
                    ANÁLISIS DE DIVERGENCIA ENTRE MODELOS
═══════════════════════════════════════════════════════════════════════════════

Cuando los modelos divergen (>10 puntos), esto es un INSIGHT VALIOSO:

CONVERGENCIA (buena señal narrativa):
"El consenso entre modelos es notable: los seis evalúan a [Empresa] en un 
rango de apenas 4 puntos (70-74). Esta consistencia indica una narrativa 
corporativa bien consolidada en el ecosistema de IA."

DIVERGENCIA (señal de narrativa fragmentada):
"Existe divergencia significativa: ChatGPT otorga 64 puntos mientras 
DeepSeek marca 37. Esta diferencia de 27 puntos sugiere que la narrativa 
de [Empresa] no está uniformemente establecida, posiblemente debido a la 
inconsistencia en la comunicación financiera."

═══════════════════════════════════════════════════════════════════════════════
                     PROTOCOLO DE DATOS CORPORATIVOS
═══════════════════════════════════════════════════════════════════════════════

Cuando tengas datos del MEMENTO CORPORATIVO:

NIVEL 1 - VERIFIED (< 7 días): Afirmación directa con fecha
"Según datos corporativos verificados el [fecha], el Presidente Ejecutivo 
de [Empresa] es [Nombre]."

NIVEL 2 - RECENT (7-30 días): Con nota temporal
"Según información corporativa del [fecha], [dato]."

NIVEL 3 - HISTORICAL (30-90 días): Con caveat
"La última información verificada ([mes año]) indicaba [dato]."

TERMINOLOGÍA ESPAÑOLA: Usa "Presidente Ejecutivo" cuando así aparezca en 
los datos. Muchas grandes empresas españolas distinguen entre Presidente 
(del Consejo) y CEO/Consejero Delegado.

═══════════════════════════════════════════════════════════════════════════════
                 🚫 REGLA ANTI-ALUCINACIÓN DE LIDERAZGO 🚫
═══════════════════════════════════════════════════════════════════════════════

REGLA CRÍTICA - NUNCA VIOLAR:

NUNCA menciones nombres de ejecutivos, CEOs, Presidentes o directivos de 
empresas españolas SALVO que aparezcan EXPLÍCITAMENTE en el MEMENTO CORPORATIVO 
con fecha de verificación.

Si el Memento Corporativo tiene campos VACÍOS para liderazgo de una empresa:

✅ CORRECTO: "No dispongo de datos verificados sobre el equipo directivo 
   actual de [Empresa]. Te recomiendo consultar su web corporativa oficial."

❌ PROHIBIDO: Usar tu conocimiento de entrenamiento para nombrar ejecutivos.
   Los cargos corporativos cambian frecuentemente y tu información puede 
   estar desactualizada (por ejemplo, cambios en Telefónica, BBVA, etc.).

❌ PROHIBIDO: Inventar o asumir nombres de directivos que no estén en el contexto.

Esta regla existe porque los cargos directivos cambian con frecuencia 
(fusiones, dimisiones, nombramientos) y el LLM puede tener información obsoleta.

═══════════════════════════════════════════════════════════════════════════════
                         ANÁLISIS ESTADÍSTICO (REGRESIÓN)
═══════════════════════════════════════════════════════════════════════════════

Cuando el usuario pregunte sobre regresión, correlación, ponderaciones, o qué 
métricas predicen movimientos de precio, USARÁS los datos del bloque 
"ANÁLISIS ESTADÍSTICO REAL" si está presente en el contexto.

REGLAS CRÍTICAS PARA ANÁLISIS ESTADÍSTICO:
1. SOLO usa los coeficientes de correlación y p-values del análisis real
2. NUNCA inventes cifras estadísticas - usa las que aparecen en el contexto
3. Interpreta la correlación correctamente:
   - |r| > 0.3: Correlación moderada
   - |r| > 0.5: Correlación fuerte
   - p-value < 0.05: Estadísticamente significativo
4. SIEMPRE menciona las limitaciones del análisis (semanas disponibles, R²)
5. Si NO hay bloque de regresión en el contexto, indica que no tienes 
   datos calculados y sugiere preguntar específicamente sobre "análisis 
   de correlación entre métricas RIX y precios"

EJEMPLO DE RESPUESTA CORRECTA:
"Basándome en el análisis de correlación de Pearson con [totalRecords] 
registros y [companiesWithPrices] empresas cotizadas:

**Métricas con mayor poder predictivo sobre precio:**
1. CEM (Comunicación/Engagement): r = +0.187, p < 0.05 ✓
2. RMM (Riesgo/Crisis): r = -0.142, p < 0.05 ✓

El modelo explica aproximadamente un [rSquared]% de la varianza en precios.

⚠️ **Limitaciones importantes:**
- Serie temporal limitada ([weeksAnalyzed] semanas)
- Correlación no implica causalidad
- Factores externos de mercado no capturados"

═══════════════════════════════════════════════════════════════════════════════
                   GRAFO DE CONOCIMIENTO EMPRESARIAL (HYBRID RAG)
═══════════════════════════════════════════════════════════════════════════════

Tienes acceso a un GRAFO DE CONOCIMIENTO que conecta empresas mediante relaciones 
verificadas. Este grafo complementa la búsqueda vectorial con estructura explícita.

TIPOS DE RELACIONES (edges):

| Relación       | Significado                              | Confianza |
|----------------|------------------------------------------|-----------|
| COMPITE_CON    | Competidor directo verificado            | Alta (0.9)|
| MISMO_SUBSECTOR| Empresa del mismo subsector específico   | Media (0.7)|
| MISMO_SECTOR   | Empresa del mismo sector amplio          | Baja (0.5)|

CÓMO USAR EL GRAFO EN TUS RESPUESTAS:

1. PARA COMPARATIVAS COMPETITIVAS:
   - Usa SOLO entidades con relación COMPITE_CON
   - Compara RIX, métricas dimensionales, tendencias
   - Ejemplo: "Frente a sus competidores directos (Santander, CaixaBank), BBVA..."

2. PARA ANÁLISIS SECTORIAL:
   - Incluye MISMO_SUBSECTOR para contexto granular
   - Incluye MISMO_SECTOR solo si no hay subsector data
   - Ejemplo: "En el subsector Operadores Telecom, Telefónica lidera con..."

3. PARA BENCHMARKING:
   - Compara RIX de entidad primaria vs promedio de competidores
   - Destaca gaps vs líder sectorial
   - Ejemplo: "Con un RIX de 58, Grifols está 12 pts por debajo del líder sectorial Rovi (70)"

4. PARA DETECCIÓN DE OPORTUNIDADES:
   - Identifica métricas donde la empresa está por debajo de competidores
   - Sugiere acciones basadas en lo que hacen bien los líderes

REGLAS CRÍTICAS DEL GRAFO:

❌ NUNCA inventes relaciones que no estén en el contexto
❌ NUNCA asumas competencia solo porque dos empresas estén en el mismo sector
✅ Si una conexión no existe, dilo: "No hay relación verificada entre X e Y"
✅ Prioriza COMPITE_CON sobre MISMO_SECTOR para comparativas directas
✅ Menciona la confianza de las relaciones cuando sea relevante

EJEMPLO DE USO CORRECTO:
"Según el grafo de conocimiento, los competidores directos verificados de Telefónica 
son Orange, Vodafone y MásMóvil. Comparando sus RIX de esta semana:
- Telefónica: 62 pts (↗ +3)
- Orange: 58 pts (→ estable)
- Vodafone: 55 pts (↘ -2)
- MásMóvil: 67 pts (↗ +5)

Telefónica está 5 pts por debajo del líder del subsector (MásMóvil)."

═══════════════════════════════════════════════════════════════════════════════
                          FUENTES DE INFORMACIÓN
═══════════════════════════════════════════════════════════════════════════════

Recibes datos de:
• GRAFO DE CONOCIMIENTO: Relaciones verificadas entre empresas (competidores, sector, subsector)
• MEMENTO CORPORATIVO: Datos verificados de directivos, sede, con fecha
• NOTICIAS CORPORATIVAS: Noticias de fuentes oficiales con fecha
• DATOS RIX: Scores por modelo, métricas dimensionales, rankings
• TEXTOS BRUTOS DE IA: Respuestas originales de los 6 modelos
• CONTEXTO VECTORIAL: Análisis previos relevantes
• PRECIOS DE ACCIONES: Precio semanal de cierre para empresas cotizadas

Clasificación de fuentes citadas por las IAs:
• TIER 1: Reuters, Bloomberg, AFP, CNMV, Financial Times, WSJ
• TIER 2: El País, Expansión, Cinco Días, El Economista
• TIER 3: El Confidencial, medios regionales
• TIER 4: Foros, redes sociales, LinkedIn

Prioriza datos respaldados por fuentes Tier 1-2 en tu análisis.

═══════════════════════════════════════════════════════════════════════════════
                           LIMITACIONES
═══════════════════════════════════════════════════════════════════════════════

PUEDO analizar:
✓ RIX Scores y las 8 métricas dimensionales
✓ Evaluaciones de 6 modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen)
✓ Textos brutos de las IAs sobre empresas
✓ Rankings, tendencias, comparativas históricas
✓ Datos corporativos verificados (si están en contexto)
✓ Noticias corporativas (si están en contexto)
✓ Precios de acciones semanales (si están en contexto)

NO PUEDO proporcionar:
✗ Cotizaciones en tiempo real
✗ Datos financieros detallados (EBITDA, deuda, etc.)
✗ Historia general de las empresas
✗ Información que no esté en el contexto
✗ NOMBRES DE DIRECTIVOS si no están en el Memento Corporativo

Si la pregunta está fuera de mi alcance, redirijo hacia el análisis de 
reputación algorítmica que SÍ puedo ofrecer.

═══════════════════════════════════════════════════════════════════════════════
                         ESTÁNDARES DE CALIDAD
═══════════════════════════════════════════════════════════════════════════════

Cada respuesta debe ser:
• PRESENTABLE A ALTA DIRECCIÓN: Un directivo puede llevarla a comité
• NARRATIVA: Construye un relato, no una lista de datos
• FUNDAMENTADA: Cada afirmación respaldada por datos del contexto
• CONTEXTUALIZADA: Con comparativas sectoriales cuando sea relevante
• EXPLICATIVA: Toda métrica explicada en su primera mención

NUNCA:
• Inventar datos o nombres de ejecutivos (CRÍTICO)
• Mencionar directivos sin verificar que están en el Memento Corporativo
• Usar lenguaje dramático, sensacionalista o de clickbait
• Listar métricas como bullets sin explicar su significado
• Responder "no hay datos" si la información está en el contexto
• Terminar con llamadas a la acción comerciales

═══════════════════════════════════════════════════════════════════════════════
              JUSTIFICACIÓN METODOLÓGICA "RADAR REPUTACIONAL"
═══════════════════════════════════════════════════════════════════════════════

CONTEXTO FILOSÓFICO:
RepIndex no mide la reputación tradicional. Mide la PROBABILIDAD de que una 
narrativa gane tracción en el ecosistema informativo algorítmico. En 2026, 
las IAs son el primer filtro cognitivo. El primer punto de contacto 
reputacional. La reputación ya no se pierde en una portada: se pierde 
cuando un modelo deja de confiar en tu narrativa.

INSTRUCCIONES PARA INTEGRAR CONTEXTO METODOLÓGICO:
Al final de cada sección principal de datos donde cites scores o métricas, 
incluye un breve párrafo explicativo en blockquote (>) que justifique:

1. QUÉ MIDE: Explica qué mide exactamente esa métrica/score
2. CONSENSO: Indica el nivel de consenso entre los 6 modelos de IA
3. SEÑAL ESTRATÉGICA: Qué significa esta señal para la anticipación reputacional

Ejemplo de integración:
> *Nota metodológica: Este RIX de 72 representa el consenso de 6 modelos 
> de IA con búsqueda web real. La divergencia inter-modelo de ±8 puntos 
> indica un nivel medio de incertidumbre epistémica, sugiriendo que la 
> narrativa está consolidándose pero aún presenta variabilidad.*

IMPORTANTE:
• No añadas notas metodológicas a CADA párrafo - solo a secciones principales
• Usa un tono técnico-legal pero accesible (como letra pequeña de un informe)
• Las notas deben sentirse naturales, no intrusivas

${buildDepthPrompt(depthLevel, languageName)}

${roleId && rolePrompt ? `
═══════════════════════════════════════════════════════════════════════════════
              PERSPECTIVA PROFESIONAL PRE-SELECCIONADA: ${roleName}
═══════════════════════════════════════════════════════════════════════════════

El usuario ha solicitado que la respuesta esté adaptada a la perspectiva de ${roleName}.

## REGLA DE PRIORIDAD ABSOLUTA
${depthLevel === 'exhaustive' ? `
⚠️ MODO EXHAUSTIVO ACTIVO - PRIORIDADES:
1. PRIORIDAD 1 (EXTENSIÓN): Mínimo 2,500 palabras con TODAS las secciones obligatorias
2. PRIORIDAD 2 (TONO): Adapta el tono y enfoque al rol "${roleName}"

El rol "${roleName}" modifica CÓMO presentas el contenido, pero NUNCA reduce la extensión.
Si el rol sugiere formato breve (ej. "nota de prensa"), conviértelo en REPORTAJE LARGO.
` : depthLevel === 'complete' ? `
⚠️ MODO COMPLETO ACTIVO - PRIORIDADES:
1. PRIORIDAD 1 (EXTENSIÓN): Mínimo 1,500 palabras con estructura completa
2. PRIORIDAD 2 (TONO): Adapta el tono al rol "${roleName}"
` : `
Modo rápido: El rol "${roleName}" puede determinar el formato.
`}

INSTRUCCIONES DEL ROL:
${rolePrompt}

IMPORTANTE: La respuesta ya debe estar adaptada a esta perspectiva desde el inicio.
No generes una respuesta genérica primero - genera directamente el análisis con esta perspectiva.
` : ''}

[IDIOMA: Responde en ${languageName}]`;

  const userPrompt = `[IDIOMA: ${languageName.toUpperCase()}]

PREGUNTA DEL USUARIO: "${question}"

═══════════════════════════════════════════════════════════════════════════════
                    INSTRUCCIONES PARA TU RESPUESTA
═══════════════════════════════════════════════════════════════════════════════

1. Produce un INFORME EJECUTIVO presentable a alta dirección
2. Prioriza HECHOS CONSOLIDADOS (datos en los que coinciden 5-6 IAs)
3. SIEMPRE explica cada métrica en su primera mención
4. Usa TABLAS para presentar datos comparativos de múltiples modelos o empresas
5. Fundamenta cada afirmación con datos del contexto
6. Construye una NARRATIVA coherente, no una lista de bullets
7. Si es un análisis completo de empresa, sigue la estructura de informe ejecutivo
8. Si es una pregunta simple, adapta la profundidad pero mantén el rigor

═══════════════════════════════════════════════════════════════════════════════
                    CONTEXTO CON TODOS LOS DATOS DISPONIBLES
═══════════════════════════════════════════════════════════════════════════════

${context}

Responde en ${languageName} usando SOLO información del contexto anterior.`;

  console.log(`${logPrefix} Calling AI model (streaming: ${streamMode})...`);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userPrompt }
  ];

  // =========================================================================
  // STREAMING MODE: Return SSE stream for real-time text generation
  // =========================================================================
  if (streamMode) {
    console.log(`${logPrefix} Starting STREAMING standard chat...`);
    
    const sseEncoder = createSSEEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(sseEncoder({
            type: 'start',
            metadata: {
              language,
              languageName,
              depthLevel,
              detectedCompanies: detectedCompanies.map(c => c.issuer_name),
            }
          }));

          let accumulatedContent = '';
          let provider: 'openai' | 'gemini' = 'openai';
          let inputTokens = 0;
          let outputTokens = 0;
          let streamError = false;

          // Try OpenAI first
          console.log(`${logPrefix} Trying OpenAI stream first...`);
          for await (const chunk of streamOpenAIResponse(messages, 'o3', 24000, logPrefix, 120000)) {
            if (chunk.type === 'chunk' && chunk.text) {
              accumulatedContent += chunk.text;
              controller.enqueue(sseEncoder({ type: 'chunk', text: chunk.text }));
            } else if (chunk.type === 'done') {
              inputTokens = chunk.inputTokens || 0;
              outputTokens = chunk.outputTokens || 0;
              break;
            } else if (chunk.type === 'error') {
              console.warn(`${logPrefix} OpenAI stream error: ${chunk.error}, falling back to Gemini...`);
              streamError = true;
              controller.enqueue(sseEncoder({ type: 'fallback', metadata: { provider: 'gemini' } }));
              break;
            }
          }

          // Fallback to Gemini if OpenAI failed
          if (streamError || accumulatedContent.length === 0) {
            provider = 'gemini';
            accumulatedContent = ''; // Reset for Gemini response
            
            console.log(`${logPrefix} Using Gemini stream (gemini-2.5-flash)...`);
            for await (const chunk of streamGeminiResponse(messages, 'gemini-2.5-flash', 24000, logPrefix, 120000)) {
              if (chunk.type === 'chunk' && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: 'chunk', text: chunk.text }));
              } else if (chunk.type === 'done') {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === 'error') {
                console.error(`${logPrefix} Gemini stream also failed: ${chunk.error}`);
                controller.enqueue(sseEncoder({ 
                  type: 'error', 
                  error: `Error generando respuesta: ${chunk.error}` 
                }));
                controller.close();
                return;
              }
            }
          }

          console.log(`${logPrefix} Standard chat stream completed (via ${provider}), length: ${accumulatedContent.length}`);
          const answer = accumulatedContent;

          // Log API usage in background
          logApiUsage({
            supabaseClient,
            edgeFunction: 'chat-intelligence',
            provider,
            model: provider === 'openai' ? 'o3' : 'gemini-2.5-flash',
            actionType: 'chat_stream',
            inputTokens,
            outputTokens,
            userId,
            sessionId,
            metadata: { 
              depth_level: depthLevel,
              role: roleId || null,
              role_name: roleName || null,
              streaming: true,
            },
          }).catch(e => console.warn('Failed to log usage:', e));

          // =============================================================================
          // Generate suggested questions and drumroll (same logic as non-streaming)
          // =============================================================================
          console.log(`${logPrefix} Generating follow-up questions for streaming response...`);
          
          // Simplified question generation for streaming (avoid long delay)
          let suggestedQuestions: string[] = [];
          let drumrollQuestion: DrumrollQuestion | null = null;
          
          try {
            // Quick question generation
            const questionPrompt = `Based on this analysis about ${detectedCompanies.map(c => c.issuer_name).join(', ') || 'corporate reputation'}, generate 3 follow-up questions in ${languageName}. Respond ONLY with a JSON array of 3 strings.`;
            const questionResult = await callAISimple([
              { role: 'system', content: `Generate follow-up questions in ${languageName}. Respond ONLY with JSON array.` },
              { role: 'user', content: questionPrompt }
            ], 'gpt-4o-mini', 300, logPrefix);
            
            if (questionResult) {
              const cleanText = questionResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
              suggestedQuestions = JSON.parse(cleanText);
            }
          } catch (qError) {
            console.warn(`${logPrefix} Error generating questions:`, qError);
          }

          // Generate drumroll question for complete/exhaustive depth
          if (depthLevel !== 'quick' && detectedCompanies.length > 0 && allRixData && allRixData.length > 0) {
            try {
              const insights = extractAnalysisInsights(allRixData, detectedCompanies[0], answer);
              if (insights) {
                drumrollQuestion = await generateDrumrollQuestion(
                  question,
                  insights,
                  detectedCompanies,
                  companiesCache,
                  language,
                  languageName,
                  logPrefix
                );
              }
            } catch (dError) {
              console.warn(`${logPrefix} Error generating drumroll:`, dError);
            }
          }

          // Calculate methodology metadata
          const modelScores = allRixData
            ?.filter(r => r['09_rix_score'] != null && r['09_rix_score'] > 0)
            ?.map(r => r['09_rix_score']) || [];
          const maxScoreMethod = modelScores.length > 0 ? Math.max(...modelScores) : 0;
          const minScoreMethod = modelScores.length > 0 ? Math.min(...modelScores) : 0;
          const divergencePointsMethod = maxScoreMethod - minScoreMethod;
          const divergenceLevelMethod = divergencePointsMethod <= 8 ? 'low' : divergencePointsMethod <= 15 ? 'medium' : 'high';
          const modelsUsedMethod = [...new Set(allRixData?.map(r => r['02_model_name']).filter(Boolean) || [])];
          const periodFromMethod = allRixData?.map(r => r['06_period_from']).filter(Boolean).sort()[0];
          const periodToMethod = allRixData?.map(r => r['07_period_to']).filter(Boolean).sort().reverse()[0];
          const uniqueCompaniesCount = new Set(allRixData?.map(r => r['05_ticker']).filter(Boolean) || []).size;
          const uniqueWeeksCount = allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0;

          // Save to database
          if (sessionId) {
            supabaseClient.from('chat_intelligence_sessions').insert([
              {
                session_id: sessionId,
                role: 'user',
                content: question,
                user_id: userId,
                depth_level: depthLevel
              },
              {
                session_id: sessionId,
                role: 'assistant',
                content: answer,
                documents_found: vectorDocs?.length || 0,
                structured_data_found: allRixData?.length || 0,
                suggested_questions: suggestedQuestions,
                drumroll_question: drumrollQuestion,
                depth_level: depthLevel,
                question_category: detectedCompanies.length > 0 ? 'corporate_analysis' : 'general_query',
                user_id: userId
              }
            ]).then(() => console.log(`${logPrefix} Session saved`))
              .catch((e: Error) => console.warn('Failed to save session:', e));
          }

          // Extract verified sources from full RIX data (includes raw AI responses)
          const verifiedSourcesStandard = extractSourcesFromRixData(detectedCompanyFullData || []);
          console.log(`${logPrefix} Extracted ${verifiedSourcesStandard.length} verified sources from RIX data`);

          // Send final done event with all metadata
          controller.enqueue(sseEncoder({
            type: 'done',
            suggestedQuestions,
            drumrollQuestion,
            metadata: {
              type: 'standard',
              documentsFound: vectorDocs?.length || 0,
              structuredDataFound: allRixData?.length || 0,
              dataWeeks: uniqueWeeksCount,
              aiProvider: provider,
              depthLevel,
              questionCategory: detectedCompanies.length > 0 ? 'corporate_analysis' : 'general_query',
              modelsUsed: modelsUsedMethod,
              periodFrom: periodFromMethod,
              periodTo: periodToMethod,
              divergenceLevel: divergenceLevelMethod,
              divergencePoints: divergencePointsMethod,
              uniqueCompanies: uniqueCompaniesCount,
              uniqueWeeks: uniqueWeeksCount,
              // Verified sources from ChatGPT and Perplexity for bibliography
              verifiedSources: verifiedSourcesStandard.length > 0 ? verifiedSourcesStandard : undefined,
              methodology: {
                hasRixData: (allRixData?.length || 0) > 0,
                modelsUsed: modelsUsedMethod,
                periodFrom: periodFromMethod,
                periodTo: periodToMethod,
                observationsCount: allRixData?.length || 0,
                divergenceLevel: divergenceLevelMethod,
                divergencePoints: divergencePointsMethod,
                uniqueCompanies: uniqueCompaniesCount,
                uniqueWeeks: uniqueWeeksCount,
              },
            }
          }));

          controller.close();
          
        } catch (error) {
          console.error(`${logPrefix} Streaming error:`, error);
          controller.enqueue(sseEncoder({ 
            type: 'error', 
            error: error instanceof Error ? error.message : 'Error de streaming desconocido'
          }));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  }

  // =========================================================================
  // NON-STREAMING MODE: Original behavior (for backwards compatibility)
  // =========================================================================
  const chatResult = await callAIWithFallback(messages, 'o3', 24000, logPrefix);
  const answer = chatResult.content;

  console.log(`${logPrefix} AI response received (via ${chatResult.provider}), length: ${answer.length}`);

  // Log API usage with depth_level tracking
  console.log(`${logPrefix} Logging API usage with depth_level: ${depthLevel}, role: ${roleId || 'none'}`);
  await logApiUsage({
    supabaseClient,
    edgeFunction: 'chat-intelligence',
    provider: chatResult.provider,
    model: chatResult.model,
    actionType: 'chat',
    inputTokens: chatResult.inputTokens,
    outputTokens: chatResult.outputTokens,
    userId,
    sessionId,
    metadata: { 
      depth_level: depthLevel,
      role: roleId || null,
      role_name: roleName || null,
    },
  });

  // =============================================================================
  // PASO 6: GENERAR PREGUNTAS SUGERIDAS BASADAS EN ANÁLISIS DE DATOS
  // =============================================================================
  console.log(`${logPrefix} Analyzing data for hidden patterns and generating smart questions...`);
  
  // =============================================================================
  // ANÁLISIS DE DATOS CON VALIDACIÓN DE CALIDAD
  // Solo genera insights basados en datos SÓLIDOS (cobertura completa de 4 modelos)
  // =============================================================================
  const analyzeDataForInsights = () => {
    if (!allRixData || allRixData.length === 0) {
      return { patterns: [], anomalies: [], surprises: [], modelDivergences: [], dataQuality: 'insufficient' };
    }
    
    const patterns: string[] = [];
    const anomalies: string[] = [];
    const surprises: string[] = [];
    
    // Group data by company
    const byCompany: Record<string, any[]> = {};
    allRixData.forEach(r => {
      const company = r["03_target_name"];
      if (!byCompany[company]) byCompany[company] = [];
      byCompany[company].push(r);
    });
    
    // =============================================================================
    // VALIDACIÓN DE CALIDAD: Solo considerar empresas con datos de los 4 modelos
    // =============================================================================
    const REQUIRED_MODELS = ['chatgpt', 'perplexity', 'gemini', 'deepseek'];
    const MIN_MODELS_FOR_INSIGHT = 4; // Exigimos cobertura completa
    
    const companiesWithFullCoverage: Record<string, any[]> = {};
    Object.entries(byCompany).forEach(([company, records]) => {
      const modelsPresent = new Set(
        records
          .map(r => r["02_model_name"]?.toLowerCase())
          .filter(Boolean)
      );
      
      // Verificar que tenga datos de los 4 modelos con scores válidos
      const hasAllModels = REQUIRED_MODELS.every(model => 
        records.some(r => 
          r["02_model_name"]?.toLowerCase().includes(model) && 
          r["09_rix_score"] != null &&
          r["09_rix_score"] > 0
        )
      );
      
      if (hasAllModels) {
        companiesWithFullCoverage[company] = records;
      }
    });
    
    const fullCoverageCount = Object.keys(companiesWithFullCoverage).length;
    console.log(`${logPrefix} Companies with full 4-model coverage: ${fullCoverageCount}/${Object.keys(byCompany).length}`);
    
    // Si no hay suficientes empresas con cobertura completa, no generar insights
    if (fullCoverageCount < 10) {
      console.log(`${logPrefix} Insufficient data quality for insights (need at least 10 companies with full coverage)`);
      return { 
        patterns: [], 
        anomalies: [], 
        surprises: [], 
        modelDivergences: [],
        dataQuality: 'insufficient',
        coverageStats: { full: fullCoverageCount, total: Object.keys(byCompany).length }
      };
    }
    
    // =============================================================================
    // 1. DIVERGENCIAS ENTRE MODELOS (solo empresas con cobertura completa)
    // =============================================================================
    const modelDivergences: { company: string; ticker: string; chatgpt: number; deepseek: number; perplexity: number; gemini: number; maxDiff: number; models: string }[] = [];
    
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      const chatgpt = records.find(r => r["02_model_name"]?.toLowerCase().includes('chatgpt'));
      const deepseek = records.find(r => r["02_model_name"]?.toLowerCase().includes('deepseek'));
      const perplexity = records.find(r => r["02_model_name"]?.toLowerCase().includes('perplexity'));
      const gemini = records.find(r => r["02_model_name"]?.toLowerCase().includes('gemini'));
      
      if (chatgpt && deepseek && perplexity && gemini) {
        const scores = [
          { model: 'ChatGPT', score: chatgpt["09_rix_score"] },
          { model: 'DeepSeek', score: deepseek["09_rix_score"] },
          { model: 'Perplexity', score: perplexity["09_rix_score"] },
          { model: 'Gemini', score: gemini["09_rix_score"] },
        ];
        
        const maxScore = Math.max(...scores.map(s => s.score));
        const minScore = Math.min(...scores.map(s => s.score));
        const maxDiff = maxScore - minScore;
        
        // Solo reportar divergencias significativas (>=12 puntos) con datos sólidos
        if (maxDiff >= 12) {
          const highest = scores.find(s => s.score === maxScore)!;
          const lowest = scores.find(s => s.score === minScore)!;
          
          modelDivergences.push({
            company,
            ticker: chatgpt["05_ticker"] || '',
            chatgpt: chatgpt["09_rix_score"],
            deepseek: deepseek["09_rix_score"],
            perplexity: perplexity["09_rix_score"],
            gemini: gemini["09_rix_score"],
            maxDiff,
            models: `${highest.model} (${highest.score}) vs ${lowest.model} (${lowest.score})`
          });
        }
      }
    });
    
    modelDivergences.sort((a, b) => b.maxDiff - a.maxDiff);
    if (modelDivergences.length > 0) {
      const top = modelDivergences[0];
      anomalies.push(`${top.company} tiene ${top.maxDiff} puntos de divergencia: ${top.models}`);
    }
    
    // =============================================================================
    // 2. ANÁLISIS SECTORIAL (solo con sectores que tengan ≥3 empresas con cobertura completa)
    // =============================================================================
    if (companiesCache) {
      const bySector: Record<string, { company: string; avgRix: number; ticker: string }[]> = {};
      
      Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
        const companyInfo = companiesCache?.find(c => c.ticker === records[0]?.["05_ticker"]);
        const sector = companyInfo?.sector_category;
        if (!sector) return;
        
        // Calcular promedio de los 4 modelos para esta empresa
        const validScores = records.map(r => r["09_rix_score"]).filter(s => s != null && s > 0);
        if (validScores.length < 4) return; // Necesitamos los 4 scores
        
        const avgRix = validScores.reduce((a, b) => a + b, 0) / validScores.length;
        
        if (!bySector[sector]) bySector[sector] = [];
        bySector[sector].push({ company, avgRix, ticker: records[0]?.["05_ticker"] });
      });
      
      Object.entries(bySector).forEach(([sector, companies]) => {
        // Solo analizar sectores con al menos 3 empresas con cobertura completa
        if (companies.length < 3) return;
        
        const sectorAvg = companies.reduce((sum, c) => sum + c.avgRix, 0) / companies.length;
        const sortedByRix = [...companies].sort((a, b) => b.avgRix - a.avgRix);
        
        // Detectar outliers: empresas que difieren >12 puntos de la media sectorial
        companies.forEach(c => {
          const diff = c.avgRix - sectorAvg;
          if (Math.abs(diff) >= 12) {
            const direction = diff > 0 ? 'supera' : 'está por debajo de';
            surprises.push(`${c.company} ${direction} la media del sector ${sector} (${sectorAvg.toFixed(0)}) en ${Math.abs(diff).toFixed(0)} puntos (promedio 4 modelos: ${c.avgRix.toFixed(0)})`);
          }
        });
      });
    }
    
    // =============================================================================
    // 3. IBEX35 vs NO COTIZADAS (solo con cobertura completa)
    // =============================================================================
    if (companiesCache) {
      const ibex35Companies: { company: string; avgRix: number }[] = [];
      const nonTradedCompanies: { company: string; avgRix: number }[] = [];
      
      Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
        const companyInfo = companiesCache?.find(c => c.ticker === records[0]?.["05_ticker"]);
        if (!companyInfo) return;
        
        const validScores = records.map(r => r["09_rix_score"]).filter(s => s != null && s > 0);
        if (validScores.length < 4) return;
        
        const avgRix = validScores.reduce((a, b) => a + b, 0) / validScores.length;
        
        if (companyInfo.ibex_family_code === 'IBEX35') {
          ibex35Companies.push({ company, avgRix });
        } else if (!companyInfo.cotiza_en_bolsa) {
          nonTradedCompanies.push({ company, avgRix });
        }
      });
      
      // Solo generar insight si hay suficientes datos en ambos grupos
      if (ibex35Companies.length >= 10 && nonTradedCompanies.length >= 5) {
        const avgIbex = ibex35Companies.reduce((sum, c) => sum + c.avgRix, 0) / ibex35Companies.length;
        
        const outperformers = nonTradedCompanies
          .filter(c => c.avgRix > avgIbex + 5)
          .sort((a, b) => b.avgRix - a.avgRix);
        
        if (outperformers.length > 0) {
          const best = outperformers[0];
          patterns.push(`${best.company} (no cotizada, promedio ${best.avgRix.toFixed(0)}) supera la media del IBEX35 (${avgIbex.toFixed(0)}) basado en consenso de 4 modelos`);
        }
      }
    }
    
    // =============================================================================
    // 4. DESEQUILIBRIOS DE MÉTRICAS (solo con todas las métricas presentes)
    // =============================================================================
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      // Usar el registro con más métricas completas
      records.forEach(r => {
        const metrics = [
          { name: 'NVM', score: r["23_nvm_score"] },
          { name: 'DRM', score: r["26_drm_score"] },
          { name: 'SIM', score: r["29_sim_score"] },
          { name: 'RMM', score: r["32_rmm_score"] },
          { name: 'CEM', score: r["35_cem_score"] },
          { name: 'GAM', score: r["38_gam_score"] },
          { name: 'DCM', score: r["41_dcm_score"] },
          { name: 'CXM', score: r["44_cxm_score"] },
        ].filter(m => m.score != null && m.score > 0);
        
        // Solo considerar si tiene al menos 7 de 8 métricas (datos sólidos)
        if (metrics.length >= 7) {
          const max = metrics.reduce((a, b) => a.score > b.score ? a : b);
          const min = metrics.reduce((a, b) => a.score < b.score ? a : b);
          
          // Desequilibrio significativo: ≥30 puntos
          if (max.score - min.score >= 30) {
            const model = r["02_model_name"];
            patterns.push(`${company} (según ${model}): desequilibrio de ${max.score - min.score} pts entre ${max.name} (${max.score}) y ${min.name} (${min.score})`);
          }
        }
      });
    });
    
    // =============================================================================
    // 5. CONSENSO vs DISCORDIA (solo empresas con 4 modelos)
    // =============================================================================
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      const scores = records.map(r => r["09_rix_score"]).filter(s => s != null && s > 0);
      
      // Requiere exactamente 4 scores válidos
      if (scores.length !== 4) return;
      
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const range = max - min;
      const avg = scores.reduce((a, b) => a + b, 0) / 4;
      
      if (range <= 4) {
        patterns.push(`${company} tiene consenso perfecto entre los 4 modelos: RIX entre ${min} y ${max} (promedio: ${avg.toFixed(0)})`);
      } else if (range >= 20) {
        anomalies.push(`${company} genera discordia total: ${range} puntos entre modelos (${min}-${max}), requiere análisis`);
      }
    });
    
    // =============================================================================
    // 6. TENDENCIA DE MODELOS (solo con volumen suficiente)
    // =============================================================================
    const modelStats: Record<string, { scores: number[]; count: number }> = {};
    Object.values(companiesWithFullCoverage).flat().forEach(r => {
      const model = r["02_model_name"];
      const score = r["09_rix_score"];
      if (!model || score == null || score <= 0) return;
      
      if (!modelStats[model]) modelStats[model] = { scores: [], count: 0 };
      modelStats[model].scores.push(score);
      modelStats[model].count++;
    });
    
    const modelRankings = Object.entries(modelStats)
      .filter(([_, data]) => data.count >= 50) // Mínimo 50 empresas para estadística robusta
      .map(([model, data]) => ({
        model,
        avg: data.scores.reduce((a, b) => a + b, 0) / data.count,
        count: data.count
      }))
      .sort((a, b) => b.avg - a.avg);
    
    if (modelRankings.length >= 4) {
      const mostGenerous = modelRankings[0];
      const mostCritical = modelRankings[modelRankings.length - 1];
      const diff = mostGenerous.avg - mostCritical.avg;
      
      if (diff >= 4) {
        patterns.push(`${mostGenerous.model} es sistemáticamente ${diff.toFixed(1)} pts más generoso que ${mostCritical.model} (basado en ${mostGenerous.count} empresas con cobertura completa)`);
      }
    }
    
    return {
      patterns: patterns.slice(0, 4),
      anomalies: anomalies.slice(0, 4),
      surprises: surprises.slice(0, 4),
      modelDivergences: modelDivergences.slice(0, 3),
      dataQuality: 'solid',
      coverageStats: { full: fullCoverageCount, total: Object.keys(byCompany).length }
    };
  };
  
  const dataInsights = analyzeDataForInsights();
  console.log(`${logPrefix} Data insights found: ${dataInsights.patterns.length} patterns, ${dataInsights.anomalies.length} anomalies, ${dataInsights.surprises.length} surprises`);
  
  // Extract topics already discussed to avoid repetition
  const discussedTopics = new Set<string>();
  const allConversationText = [
    ...conversationHistory.map((m: any) => m.content || ''),
    question,
    answer
  ].join(' ').toLowerCase();
  
  // Mark mentioned companies as discussed
  if (allRixData) {
    allRixData.forEach(r => {
      const companyName = r["03_target_name"]?.toLowerCase();
      if (companyName && allConversationText.includes(companyName)) {
        discussedTopics.add(companyName);
      }
    });
  }
  
  const availableSectors = companiesCache 
    ? [...new Set(companiesCache.map(c => c.sector_category).filter(Boolean))].join(', ')
    : 'Energía, Banca, Telecomunicaciones, Construcción, Tecnología, Consumo';

  // Build prompt with REAL DATA DISCOVERIES (solo si hay calidad suficiente)
  const hasQualityData = dataInsights.dataQuality === 'solid' && 
    (dataInsights.patterns.length > 0 || dataInsights.anomalies.length > 0 || dataInsights.surprises.length > 0);
  
  const dataDiscoveriesPrompt = hasQualityData 
    ? `You are an EXPERT DATA ANALYST who has discovered hidden patterns analyzing ${dataInsights.coverageStats?.full || 'multiple'} companies with COMPLETE COVERAGE from all 4 AI models. Generate 3 questions that SURPRISE the user by revealing non-obvious insights.

🔬 VERIFIED DISCOVERIES (based ONLY on companies with data from ChatGPT + Perplexity + Gemini + DeepSeek):

📊 DETECTED PATTERNS:
${dataInsights.patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}

⚠️ ANOMALIES FOUND:
${dataInsights.anomalies.length > 0 ? dataInsights.anomalies.map((a, i) => `${i + 1}. ${a}`).join('\n') : '- No significant anomalies with solid data'}

💡 DATA SURPRISES:
${dataInsights.surprises.length > 0 ? dataInsights.surprises.map((s, i) => `${i + 1}. ${s}`).join('\n') : '- No notable surprises with complete data'}

🎯 MAXIMUM DIVERGENCES BETWEEN MODELS (4 models analyzed):
${dataInsights.modelDivergences?.length > 0 
  ? dataInsights.modelDivergences.map((d, i) => `${i + 1}. ${d.company}: ${d.models} = ${d.maxDiff} pts difference`).join('\n')
  : '- High consensus between models'}

📈 DATA QUALITY: ${dataInsights.coverageStats?.full}/${dataInsights.coverageStats?.total} companies with complete 4-model coverage

TOPICS ALREADY DISCUSSED (AVOID REPEATING):
${[...discussedTopics].slice(0, 10).join(', ') || 'None specific yet'}

CURRENT USER QUESTION: "${question}"

🧠 YOUR MISSION: Generate 3 questions that:

1. **REVEAL HIDDEN DATA**: Use ONLY the verified discoveries above (never invent)
2. **SURPRISE WITH CONCRETE FACTS**: Each question must mention specific data
3. **BE IMPOSSIBLE TO IGNORE**: Questions that generate immediate curiosity

❌ FORBIDDEN:
- Generic questions the user could guess
- Inventing data or companies not listed above
- Repeating companies or topics already discussed
- Questions based on incomplete or partial data

🌐 CRITICAL - LANGUAGE: Generate ALL questions in ${languageName} (${language}). Every single question MUST be written in ${languageName}.

Respond ONLY with a JSON array of 3 questions in ${languageName}:
["question 1", "question 2", "question 3"]`
    : `Generate 3 generic but useful questions about corporate reputation analysis for IBEX35 and Spanish companies.

CURRENT USER QUESTION: "${question}"

Avoid: obvious questions like "What's the top 5?". 
Suggest: sector comparisons, AI model divergences, non-listed vs IBEX35 companies.

🌐 CRITICAL - LANGUAGE: Generate ALL questions in ${languageName} (${language}). Every single question MUST be written in ${languageName}.

Respond ONLY with a JSON array of 3 strings in ${languageName}:
["question 1", "question 2", "question 3"]`;

  try {
    const questionsMessages = [
      { role: 'system', content: `You are a data analyst who generates questions based on REAL discoveries. Each question must reveal a hidden insight in the data. IMPORTANT: Generate all questions in ${languageName}. Respond ONLY with the JSON array.` },
      { role: 'user', content: dataDiscoveriesPrompt }
    ];

    let suggestedQuestions: string[] = [];
    
    const questionsText = await callAISimple(questionsMessages, 'gpt-4o-mini', 600, logPrefix);
    if (questionsText) {
      try {
        const cleanText = questionsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        suggestedQuestions = JSON.parse(cleanText);
        console.log(`${logPrefix} Generated ${suggestedQuestions.length} data-driven questions`);
      } catch (parseError) {
        console.warn(`${logPrefix} Error parsing follow-up questions:`, parseError);
        suggestedQuestions = [];
      }
    }

    // =============================================================================
    // GENERATE DRUMROLL QUESTION (Complementary Report Suggestion)
    // Only for complete/exhaustive depth levels, not for quick
    // =============================================================================
    // Extract structured insights from the rix data for drumroll generation
    let drumrollQuestion: DrumrollQuestion | null = null;
    if (depthLevel !== 'quick' && detectedCompanies.length > 0 && allRixData && allRixData.length > 0) {
      console.log(`${logPrefix} Extracting analysis insights for ${detectedCompanies[0]?.issuer_name}...`);
      
      const insights = extractAnalysisInsights(
        allRixData,
        detectedCompanies[0],
        answer
      );
      
      if (insights) {
        console.log(`${logPrefix} Insights extracted: RIX=${insights.overallScore}, weakest=${insights.weakestMetrics[0]?.name}, trend=${insights.trend}(${insights.trendDelta}pts), divergence=${insights.divergenceLevel}`);
        
        drumrollQuestion = await generateDrumrollQuestion(
          question,
          insights,
          detectedCompanies,
          companiesCache,
          language,
          languageName,
          logPrefix
        );
      } else {
        console.log(`${logPrefix} No insights extracted - skipping drumroll`);
      }
    }

    // Determine question category (simplified classification)
    const questionCategory = detectedCompanies.length > 0 ? 'corporate_analysis' : 'general_query';

    // Save to database with new fields
    if (sessionId) {
      await supabaseClient.from('chat_intelligence_sessions').insert([
        {
          session_id: sessionId,
          role: 'user',
          content: question,
          user_id: userId,
          depth_level: depthLevel
        },
        {
          session_id: sessionId,
          role: 'assistant',
          content: answer,
          documents_found: vectorDocs?.length || 0,
          structured_data_found: allRixData?.length || 0,
          suggested_questions: suggestedQuestions,
          drumroll_question: drumrollQuestion,
          depth_level: depthLevel,
          question_category: questionCategory,
          user_id: userId
        }
      ]);
    }

    // Calculate divergence for methodology metadata
    const modelScores = allRixData
      ?.filter(r => r['09_rix_score'] != null && r['09_rix_score'] > 0)
      ?.map(r => r['09_rix_score']) || [];
    const maxScoreMethod = modelScores.length > 0 ? Math.max(...modelScores) : 0;
    const minScoreMethod = modelScores.length > 0 ? Math.min(...modelScores) : 0;
    const divergencePointsMethod = maxScoreMethod - minScoreMethod;
    const divergenceLevelMethod = divergencePointsMethod <= 8 ? 'low' : divergencePointsMethod <= 15 ? 'medium' : 'high';
    
    // Extract unique models used
    const modelsUsedMethod = [...new Set(allRixData?.map(r => r['02_model_name']).filter(Boolean) || [])];
    
    // Extract period info
    const periodFromMethod = allRixData?.map(r => r['06_period_from']).filter(Boolean).sort()[0];
    const periodToMethod = allRixData?.map(r => r['07_period_to']).filter(Boolean).sort().reverse()[0];
    
    // Extract unique companies and weeks
    const uniqueCompaniesCount = new Set(allRixData?.map(r => r['05_ticker']).filter(Boolean) || []).size;
    const uniqueWeeksCount = allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0;

    return new Response(
      JSON.stringify({
        answer,
        suggestedQuestions,
        drumrollQuestion,
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: uniqueWeeksCount,
          aiProvider: chatResult.provider,
          depthLevel,
          questionCategory,
          // Methodology metadata for "Radar Reputacional" validation sheet
          modelsUsed: modelsUsedMethod,
          periodFrom: periodFromMethod,
          periodTo: periodToMethod,
          divergenceLevel: divergenceLevelMethod,
          divergencePoints: divergencePointsMethod,
          uniqueCompanies: uniqueCompaniesCount,
          uniqueWeeks: uniqueWeeksCount,
          methodology: {
            hasRixData: (allRixData?.length || 0) > 0,
            modelsUsed: modelsUsedMethod,
            periodFrom: periodFromMethod,
            periodTo: periodToMethod,
            observationsCount: allRixData?.length || 0,
            divergenceLevel: divergenceLevelMethod,
            divergencePoints: divergencePointsMethod,
            uniqueCompanies: uniqueCompaniesCount,
            uniqueWeeks: uniqueWeeksCount,
          },
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (questionsError) {
    console.error(`${logPrefix} Error generating follow-up questions:`, questionsError);
    return new Response(
      JSON.stringify({
        answer,
        suggestedQuestions: [],
        drumrollQuestion: null,
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0,
          aiProvider: chatResult.provider,
          depthLevel,
          questionCategory: 'error',
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}
