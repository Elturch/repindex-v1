import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      .from("api_cost_config")
      .select("input_cost_per_million, output_cost_per_million")
      .eq("provider", params.provider)
      .eq("model", params.model)
      .single();

    // Calculate estimated cost
    let estimatedCost = 0;
    if (costConfig) {
      const inputCost = (params.inputTokens / 1000000) * costConfig.input_cost_per_million;
      const outputCost = (params.outputTokens / 1000000) * costConfig.output_cost_per_million;
      estimatedCost = inputCost + outputCost;
    }

    // Insert log
    const { error } = await params.supabaseClient.from("api_usage_logs").insert({
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
      console.warn("Failed to log API usage:", error.message);
    }
  } catch (e) {
    console.warn("Error in logApiUsage:", e);
  }
}

// =============================================================================
// UNIFIED RIX DATA HELPER - Solo rix_runs_v2 (fuente única de verdad)
// =============================================================================
// Fase 1 (2026-02-19): Desconectado rix_runs (legacy). Solo V2 para eliminar
// contaminación de esquemas incompatibles (rix_runs no tiene respuesta_bruto_grok
// ni respuesta_bruto_qwen). rix_runs sigue existiendo en BD por si se necesita.
interface FetchUnifiedRixOptions {
  supabaseClient: any;
  columns: string;
  tickerFilter?: string | string[];
  limit?: number;
  offset?: number;
  logPrefix?: string;
}

async function fetchUnifiedRixData(options: FetchUnifiedRixOptions): Promise<any[]> {
  const { supabaseClient, columns, tickerFilter, limit = 1000, offset = 0, logPrefix = "[V2-RIX]" } = options;

  // Solo rix_runs_v2 — sin deduplicación, sin contaminación de esquemas legacy
  let query = supabaseClient
    .from("rix_runs_v2")
    .select(columns)
    .or("analysis_completed_at.not.is.null,09_rix_score.not.is.null")
    .order("batch_execution_date", { ascending: false })
    .order('"05_ticker"', { ascending: true });

  // Filtro por ticker
  if (tickerFilter) {
    if (Array.isArray(tickerFilter)) {
      query = query.in('"05_ticker"', tickerFilter);
    } else {
      query = query.eq('"05_ticker"', tickerFilter);
    }
  }

  // Límite / paginación — SIEMPRE usar .range() para evitar el límite silencioso de
  // 1000 filas de PostgREST que ignora cualquier .limit(N>1000) sin range.
  // 5 domingos × ~1.050 registros = ~5.250 → effectiveLimit = 5.500 cubre todo.
  const effectiveLimit = Math.max(limit, 5500);
  query = query.range(offset, offset + effectiveLimit - 1);

  const { data, error } = await query;
  if (error) console.error(`${logPrefix} Error fetching rix_runs_v2:`, error.message);
  console.log(`${logPrefix} V2-only: ${data?.length || 0} records`);

  return data || [];
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
  sourceModel: "ChatGPT" | "Perplexity";
  citationNumber?: number;
  temporalCategory: "window" | "reinforcement" | "unknown";
  extractedDate?: string;
}

// Spanish month names for date extraction
const SPANISH_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
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
  const fullDatePattern =
    /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/gi;
  let match;
  while ((match = fullDatePattern.exec(context)) !== null) {
    const day = parseInt(match[1], 10);
    const month = SPANISH_MONTHS[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, day),
        distance: Math.abs(match.index - (urlPosition - start)),
      });
    }
  }

  // Pattern 2: "MES de AAAA" or "MES AAAA"
  const monthYearPattern =
    /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/gi;
  while ((match = monthYearPattern.exec(context)) !== null) {
    const month = SPANISH_MONTHS[match[1].toLowerCase()];
    const year = parseInt(match[2], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, 15),
        distance: Math.abs(match.index - (urlPosition - start)),
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
  periodTo: Date | null,
): "window" | "reinforcement" | "unknown" {
  if (!extractedDate) return "unknown";
  if (!periodFrom || !periodTo) return "unknown";

  // Extend window by 3 days on each side
  const windowStart = new Date(periodFrom);
  windowStart.setDate(windowStart.getDate() - 3);
  const windowEnd = new Date(periodTo);
  windowEnd.setDate(windowEnd.getDate() + 3);

  if (extractedDate >= windowStart && extractedDate <= windowEnd) {
    return "window";
  } else if (extractedDate < periodFrom) {
    return "reinforcement";
  }
  return "unknown";
}

function extractVerifiedSources(
  chatGptRaw: string | null,
  perplexityRaw: string | null,
  periodFrom: string | null = null,
  periodTo: string | null = null,
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
        const domain = urlObj.hostname.replace(/^www\./, "");
        if (!sources.some((s) => s.url === url)) {
          const extractedDate = extractNearestDate(chatGptRaw, urlPosition);
          const temporalCategory = classifyTemporally(extractedDate, periodFromDate, periodToDate);
          sources.push({
            url,
            domain,
            title: title || undefined,
            sourceModel: "ChatGPT",
            temporalCategory,
            extractedDate: extractedDate?.toISOString(),
          });
        }
      } catch {
        /* Invalid URL */
      }
    }
  }

  // Extract Perplexity sources
  if (perplexityRaw) {
    // Try JSON parsing first
    try {
      const parsed = JSON.parse(perplexityRaw);
      if (parsed.citations && Array.isArray(parsed.citations)) {
        parsed.citations.forEach((citation: string, index: number) => {
          if (citation && citation.startsWith("http")) {
            try {
              const urlObj = new URL(citation);
              const domain = urlObj.hostname.replace(/^www\./, "");
              if (!sources.some((s) => s.url === citation)) {
                sources.push({
                  url: citation,
                  domain,
                  sourceModel: "Perplexity",
                  citationNumber: index + 1,
                  temporalCategory: "unknown", // JSON structure doesn't provide date context
                });
              }
            } catch {
              /* Invalid URL */
            }
          }
        });
      }
    } catch {
      /* Not JSON, try regex */
    }

    // Markdown links from Perplexity
    const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownPattern.exec(perplexityRaw)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const urlPosition = match.index;
      if (sources.some((s) => s.url === url)) continue;
      if (url.includes("perplexity.ai")) continue;
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, "");
        const extractedDate = extractNearestDate(perplexityRaw, urlPosition);
        const temporalCategory = classifyTemporally(extractedDate, periodFromDate, periodToDate);
        sources.push({
          url,
          domain,
          title: title || undefined,
          sourceModel: "Perplexity",
          temporalCategory,
          extractedDate: extractedDate?.toISOString(),
        });
      } catch {
        /* Invalid URL */
      }
    }
  }

  return sources;
}

function extractSourcesFromRixData(rixData: any[]): VerifiedSource[] {
  const allSources: VerifiedSource[] = [];

  for (const run of rixData) {
    const sources = extractVerifiedSources(
      run["20_res_gpt_bruto"] ?? null,
      run["21_res_perplex_bruto"] ?? null,
      run["06_period_from"] ?? null,
      run["07_period_to"] ?? null,
    );
    allSources.push(...sources);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allSources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

// =============================================================================
// SSE STREAMING HELPERS
// =============================================================================

type SSEEventType = "start" | "chunk" | "metadata" | "done" | "error" | "fallback";

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
  timeout: number = 120000,
): AsyncGenerator<{
  type: "chunk" | "done" | "error";
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  error?: string;
}> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openAIApiKey) {
    yield { type: "error", error: "OpenAI API key not configured" };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`${logPrefix} Starting OpenAI stream (${model})...`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
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
      yield { type: "error", error: `OpenAI error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastFinishReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { type: "chunk", text: content };
            }

            // Capture finish_reason for truncation detection
            const fr = parsed.choices?.[0]?.finish_reason;
            if (fr) lastFinishReason = fr;

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

    yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`${logPrefix} OpenAI stream timeout`);
      yield { type: "error", error: "OpenAI timeout" };
    } else {
      console.error(`${logPrefix} OpenAI stream error:`, error);
      yield { type: "error", error: error.message || "Unknown error" };
    }
  }
}

// Stream Gemini response with SSE
async function* streamGeminiResponse(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000,
): AsyncGenerator<{
  type: "chunk" | "done" | "error";
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  error?: string;
}> {
  const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");

  if (!geminiApiKey) {
    yield { type: "error", error: "Gemini API key not configured" };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`${logPrefix} Starting Gemini stream (${model})...`);

    // Convert messages to Gemini format
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system")?.content;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Gemini stream error:`, response.status, errorText);
      yield { type: "error", error: `Gemini error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastFinishReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini streams as NDJSON-like format
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") continue;

        // Clean up JSON array markers
        let jsonStr = trimmed;
        if (jsonStr.startsWith(",")) jsonStr = jsonStr.slice(1);
        if (jsonStr.startsWith("[")) jsonStr = jsonStr.slice(1);
        if (jsonStr.endsWith(",")) jsonStr = jsonStr.slice(0, -1);
        if (jsonStr.endsWith("]")) jsonStr = jsonStr.slice(0, -1);

        if (!jsonStr.trim()) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield { type: "chunk", text };
          }

          // Capture finish reason for truncation detection
          const fr = parsed.candidates?.[0]?.finishReason;
          if (fr) lastFinishReason = fr === "MAX_TOKENS" ? "length" : fr.toLowerCase();

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

    yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`${logPrefix} Gemini stream timeout`);
      yield { type: "error", error: "Gemini timeout" };
    } else {
      console.error(`${logPrefix} Gemini stream error:`, error);
      yield { type: "error", error: error.message || "Unknown error" };
    }
  }
}

// =============================================================================
// COMPLIANCE GATE: Forbidden Pattern Detection & Stripping
// =============================================================================
// Robust normalization + expanded semantic families for forbidden patterns.
// Detects AI hallucinations about "saving reports to folders", "exceeding
// platform limits", or inventing file systems. Applied AFTER NFD normalization.

/**
 * Normalize text for compliance matching: lowercase, strip diacritics,
 * collapse whitespace, normalize quotes/symbols.
 */
function normalizeForCompliance(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[""«»]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Patterns are written to match NFD-normalized (accent-free) text
const FORBIDDEN_PATTERNS: RegExp[] = [
  // === Family: "limite" / "longitud" / "capacidad" / "excede" ===
  /la\s+respuesta\s+(?:completa\s+)?supera\s+el\s+limite/,
  /supera\s+el\s+limite\s+(?:maximo|tecnico)/,
  /limite\s+maximo\s+permitido/,
  /limite\s+tecnico\s+de\s+entrega/,
  /la\s+respuesta[\s\S]{0,120}?limite[\s\S]{0,120}?(?:plataforma|entrega)/,
  /supera\s+(?:el\s+)?(?:maximo\s+de\s+)?longitud/,
  /longitud\s+maxima\s+(?:permitida|de\s+respuesta)/,
  /maximo\s+de\s+longitud\s+permitido/,
  /excede\s+(?:el\s+)?(?:limite|longitud|maximo)/,
  /supera\s+(?:la\s+)?capacidad\s+(?:de\s+)?(?:esta\s+)?plataforma/,
  /(?:response|output)\s+(?:exceeds?|too\s+long|limit)/,
  /the\s+response\s+exceeds/,
  // === Family: external file/folder/save hallucinations ===
  /documento\s+aparte/,
  /carpeta\s+segura/,
  /\/informes[_\-]?rix\//,
  /informes[_\s\-]?rix/,
  /te\s+lo\s+deje\s+guardado/,
  /lo\s+he\s+dejado\s+en/,
  /he\s+generado\s+el\s+informe.*en\s+un\s+documento/,
  /generado.*documento\s+aparte/,
  /dejado\s+(?:guardado|almacenado)\s+en/,
  /saved?\s+(?:it\s+)?(?:to|in)\s+(?:a\s+)?(?:secure\s+)?folder/,
  // === Family: promises of external delivery ===
  /exportar.*secciones\s+concretas/,
  /las\s+transcribo\s+aqui\s+mismo/,
  /(?:adjunto|archivo|fichero)\s+(?:separado|externo|adicional)/,
  /(?:te\s+envio|te\s+mando|te\s+remito)\s+(?:el\s+)?(?:informe|documento|archivo)/,
  /puedes?\s+descargar(?:lo)?\s+(?:desde|en)/,
  // === Family: meta-commentary about response delivery ===
  /\[?\s*la\s+respuesta\s+completa\s+se\s+ha\s+entregado/,
  /debido\s+a\s+la\s+longitud.*lectura\s+puede\s+requerir/,
  /si\s+necesita\s+aclaraciones\s+sobre\s+alguna\s+seccion.*profundizare/,
  /siguiendo\s+la\s+estructura.*profundidad\s+requerida/,
];

function findForbiddenMatchIndex(text: string): number {
  const normalized = normalizeForCompliance(text);
  let earliest = -1;
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match && match.index !== undefined) {
      // Map back to approximate original position
      const approxOrigIndex = match.index;
      earliest = earliest === -1 ? approxOrigIndex : Math.min(earliest, approxOrigIndex);
    }
  }
  return earliest;
}

function containsForbiddenPattern(text: string): boolean {
  return findForbiddenMatchIndex(text) !== -1;
}

function stripForbiddenContent(text: string): string {
  const matchIndex = findForbiddenMatchIndex(text);
  if (matchIndex === -1) return text;

  const beforeMatch = text.substring(0, matchIndex);
  // Find last clean sentence boundary before the forbidden content
  const lastBoundary = Math.max(
    beforeMatch.lastIndexOf('. '),
    beforeMatch.lastIndexOf('.\n'),
    beforeMatch.lastIndexOf('\n\n'),
    beforeMatch.lastIndexOf('---'),
  );

  if (lastBoundary > text.length * 0.3) {
    return text.substring(0, lastBoundary + 1).trim();
  }

  return beforeMatch.trim();
}

// =============================================================================
// AI FALLBACK HELPER - OpenAI → Gemini
// =============================================================================
interface AICallResult {
  content: string;
  provider: "openai" | "gemini";
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
  },
): Promise<AICallResult> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");

  const preferGemini = options?.preferGemini ?? false;
  const geminiTimeout = options?.geminiTimeout ?? timeout;

  // Model mapping: OpenAI → Gemini equivalent
  const modelMapping: Record<string, string> = {
    o3: "gemini-2.5-flash",
    "gpt-4o-mini": "gemini-2.5-flash-lite",
    "gpt-4o": "gemini-2.5-flash",
  };

  // 1. Try OpenAI first (unless preferGemini)
  if (!preferGemini && openAIApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      console.log(`${logPrefix} Calling OpenAI (${model})...`);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const usage = data.usage || {};
        console.log(
          `${logPrefix} OpenAI response received successfully (in: ${usage.prompt_tokens || 0}, out: ${usage.completion_tokens || 0})`,
        );
        return {
          content: data.choices[0].message.content,
          provider: "openai",
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
      if (error.name === "AbortError") {
        console.warn(`${logPrefix} OpenAI timeout (${timeout}ms), switching to Gemini fallback...`);
      } else if (error.message?.includes("OpenAI API error")) {
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
    throw new Error("Both OpenAI and Gemini API keys are not configured");
  }

  const geminiModel = modelMapping[model] || "gemini-2.5-flash";
  console.log(`${logPrefix} Using Gemini fallback (${geminiModel})...`);

  // Gemini request with timeout (prevents hanging requests that end as client-side "Failed to fetch")
  const geminiController = new AbortController();
  const geminiTimeoutId = setTimeout(() => geminiController.abort(), geminiTimeout);

  const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${geminiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: geminiModel,
      messages,
      max_tokens: maxTokens,
    }),
    signal: geminiController.signal,
  });

  clearTimeout(geminiTimeoutId);

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error(`${logPrefix} Gemini API error:`, errorText);
    throw new Error(`Both OpenAI and Gemini failed. Gemini error: ${geminiResponse.statusText}`);
  }

  const geminiData = await geminiResponse.json();
  const geminiUsage = geminiData.usage || {};
  console.log(
    `${logPrefix} Gemini response received successfully (fallback, in: ${geminiUsage.prompt_tokens || 0}, out: ${geminiUsage.completion_tokens || 0})`,
  );

  return {
    content: geminiData.choices[0].message.content,
    provider: "gemini",
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
  logPrefix: string,
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
  TEF: ["AMS", "IDR", "GOOGLE-PRIV", "AMAZON-PRIV", "META-PRIV", "APPLE-PRIV", "MSFT-PRIV", "LLYC"],
  // Amadeus (tech viajes) no compite con operadores telecom
  AMS: ["TEF", "CLNX", "MAS"],
  // Indra (defensa/IT) no compite con operadores telecom
  IDR: ["TEF", "CLNX", "MAS"],
};

// Sector similarity groups for fallback competitor matching
const RELATED_SECTORS: Record<string, string[]> = {
  "Telecomunicaciones y Tecnología": [], // Too broad, rely on subsector matching
  "Energía y Utilities": ["Infraestructuras"],
  Financiero: [], // Banks compete only with banks
  "Construcción e Infraestructuras": ["Energía y Utilities"],
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
  logPrefix: string = "[Competitors]",
): Promise<CompetitorResult> {
  const collected: CompanyData[] = [];
  const usedTickers = new Set<string>([company.ticker]);

  // Tracking variables for methodology justification
  let tierUsed = "NONE";
  let verifiedCount = 0;
  let subsectorCount = 0;

  console.log(`${logPrefix} Getting competitors for ${company.issuer_name} (${company.ticker})`);
  console.log(
    `${logPrefix} Company sector: ${company.sector_category}, subsector: ${company.subsector}, IBEX: ${company.ibex_family_code}`,
  );
  console.log(
    `${logPrefix} Verified competitors from issuer record: ${JSON.stringify(company.verified_competitors || [])}`,
  );

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
  if (
    company.verified_competitors &&
    Array.isArray(company.verified_competitors) &&
    company.verified_competitors.length > 0
  ) {
    console.log(
      `${logPrefix} TIER 0 (VERIFIED_COMPETITORS): Found ${company.verified_competitors.length} verified competitors in issuer record`,
    );

    for (const competitorTicker of company.verified_competitors) {
      if (collected.length >= limit) break;

      const competitor = allCompanies.find((c) => c.ticker === competitorTicker);
      if (competitor && addCompetitor(competitor)) {
        verifiedCount++;
        tierUsed = "TIER0-VERIFIED-ISSUER";
        console.log(`${logPrefix}   → ${competitor.ticker} (verified from issuer record)`);
      } else if (!competitor) {
        console.warn(`${logPrefix}   ⚠️ Verified competitor ticker not found in companies cache: ${competitorTicker}`);
      }
    }

    // EXCLUSIVE: If we have verified_competitors, we return ONLY these - no fallback to other tiers
    if (collected.length > 0) {
      console.log(
        `${logPrefix} Returning ${collected.length} competitors EXCLUSIVELY from TIER 0 (verified_competitors)`,
      );
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
      .from("competitor_relationships")
      .select("source_ticker, relationship_type, confidence_score")
      .eq("competitor_ticker", company.ticker)
      .order("confidence_score", { ascending: false });

    if (!reverseError && reverseRelationships?.length > 0) {
      console.log(`${logPrefix} TIER 1: Found ${reverseRelationships.length} reverse-direction competitors`);

      for (const rel of reverseRelationships) {
        if (collected.length >= limit) break;

        const competitor = allCompanies.find((c) => c.ticker === rel.source_ticker);
        if (competitor && addCompetitor(competitor)) {
          verifiedCount++;
          tierUsed = "TIER1-BIDIRECTIONAL";
          console.log(
            `${logPrefix}   → ${competitor.ticker} (bidirectional verified, ${rel.relationship_type}, score: ${rel.confidence_score})`,
          );
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
      .from("competitor_relationships")
      .select("competitor_ticker, relationship_type, confidence_score")
      .eq("source_ticker", company.ticker)
      .order("confidence_score", { ascending: false });

    if (!error && verifiedRelationships?.length > 0) {
      console.log(
        `${logPrefix} TIER 2: Found ${verifiedRelationships.length} verified competitors from relationships table`,
      );

      for (const rel of verifiedRelationships) {
        if (collected.length >= limit) break;

        const competitor = allCompanies.find((c) => c.ticker === rel.competitor_ticker);
        if (competitor && addCompetitor(competitor)) {
          verifiedCount++;
          if (tierUsed === "NONE") tierUsed = "TIER2-VERIFIED-RELATIONSHIPS";
          console.log(
            `${logPrefix}   → ${competitor.ticker} (verified relationship, ${rel.relationship_type}, score: ${rel.confidence_score})`,
          );
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
    const tier3 = allCompanies.filter(
      (c) => c.subsector === company.subsector && c.ibex_family_code === company.ibex_family_code,
    );

    console.log(`${logPrefix} TIER 3: Found ${tier3.length} same-subsector + same-IBEX companies`);

    for (const c of tier3) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        subsectorCount++;
        if (tierUsed === "NONE") tierUsed = "TIER3-SUBSECTOR-IBEX";
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
    const tier4 = allCompanies.filter((c) => c.subsector === company.subsector);

    console.log(`${logPrefix} TIER 4: Found ${tier4.length} same-subsector companies (any IBEX)`);

    for (const c of tier4) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        subsectorCount++;
        if (tierUsed === "NONE") tierUsed = "TIER4-SUBSECTOR";
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
    const tier5 = allCompanies.filter(
      (c) => c.sector_category === company.sector_category && c.ibex_family_code === company.ibex_family_code,
    );

    console.log(`${logPrefix} TIER 5: Found ${tier5.length} same-sector + same-IBEX companies`);

    for (const c of tier5) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        if (tierUsed === "NONE") tierUsed = "TIER5-SECTOR-IBEX";
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
    const tier6 = allCompanies.filter((c) => {
      if (c.sector_category !== company.sector_category) return false;

      // If source has subsector, prefer matching or empty subsectors
      if (company.subsector && c.subsector && c.subsector !== company.subsector) {
        // Check if subsectors are related (e.g., both telecom-related)
        const sourceSubsector = company.subsector.toLowerCase();
        const targetSubsector = c.subsector.toLowerCase();

        // Reject obvious mismatches
        const incompatiblePairs = [
          ["telecom", "viajes"],
          ["telecom", "defensa"],
          ["telecom", "big tech"],
          ["telecom", "comunicación"],
          ["banca", "seguros"],
        ];

        for (const [a, b] of incompatiblePairs) {
          if (
            (sourceSubsector.includes(a) && targetSubsector.includes(b)) ||
            (sourceSubsector.includes(b) && targetSubsector.includes(a))
          ) {
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
        if (tierUsed === "NONE") tierUsed = "TIER6-SECTOR";
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
      .filter((c) => c.ibex_family_code === "IBEX35" && c.ticker !== company.ticker)
      .slice(0, limit);

    for (const c of ibex35Fallback) {
      addCompetitor(c);
    }

    tierUsed = "TIER7-FALLBACK-IBEX35";
  }

  console.log(`${logPrefix} Final competitor list (${collected.length}): ${collected.map((c) => c.ticker).join(", ")}`);
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
  company: CompanyData,
): string {
  const parts: string[] = [];

  // Explain the tier used
  const tierExplanations: Record<string, string> = {
    "TIER0-VERIFIED-ISSUER": "competidores directos verificados manualmente (lista curada)",
    "TIER1-BIDIRECTIONAL": "relaciones bidireccionales verificadas en base de datos",
    "TIER2-VERIFIED-RELATIONSHIPS": "relaciones directas verificadas en tabla de competidores",
    "TIER3-SUBSECTOR-IBEX": `mismo subsector (${company.subsector}) y familia IBEX (${company.ibex_family_code})`,
    "TIER4-SUBSECTOR": `mismo subsector (${company.subsector})`,
    "TIER5-SECTOR-IBEX": `mismo sector (${company.sector_category}) y familia IBEX (${company.ibex_family_code})`,
    "TIER6-SECTOR": `mismo sector (${company.sector_category}) con filtrado de incompatibilidades`,
    "TIER7-FALLBACK-IBEX35": "fallback a empresas del IBEX-35 (sin competidores directos identificados)",
    NONE: "metodología no determinada",
  };

  parts.push(`Competidores seleccionados mediante: ${tierExplanations[tierUsed] || tierUsed}.`);

  // Special case: TIER0-VERIFIED-ISSUER has highest confidence
  if (tierUsed === "TIER0-VERIFIED-ISSUER") {
    parts.push(`✓ ${verifiedCount} competidores directos confirmados.`);
  } else if (verifiedCount > 0) {
    parts.push(`${verifiedCount} competidores verificados en base de datos.`);
  }

  if (subsectorCount > 0) {
    parts.push(`${subsectorCount} competidores del mismo subsector (${company.subsector}).`);
  }

  // Add warning if using category-based fallback (TIER3+)
  const categoryTiers = ["TIER3-SUBSECTOR-IBEX", "TIER4-SUBSECTOR", "TIER5-SECTOR-IBEX", "TIER6-SECTOR"];
  if (categoryTiers.includes(tierUsed)) {
    parts.push(
      "⚠️ NOTA: Esta empresa no tiene competidores verificados definidos. Los competidores mostrados pertenecen a la misma categoría/subsector y se incluyen con fines de contexto sectorial, no como competencia directa confirmada.",
    );
  }

  // Add warning if using full fallback
  if (tierUsed.includes("FALLBACK")) {
    parts.push(
      "⚠️ NOTA: Esta empresa no tiene competidores verificados ni subsector definido - las comparativas deben interpretarse con cautela.",
    );
  }

  return parts.join(" ");
}

// =============================================================================
// EMBUDO NARRATIVO — Estructura guía, no corsé. Se adapta a la consulta.
// =============================================================================
function buildDepthPrompt(depthLevel: "quick" | "complete" | "exhaustive", languageName: string): string {
  // Independientemente del depthLevel recibido, siempre devuelve el Embudo Narrativo.
  // La estructura se adapta: empresa → máxima profundidad (≥2.500 palabras);
  // sector → media; comparativa → enfrentada; resto → focalizada.
  return `
═══════════════════════════════════════════════════════════════════════════════
     FORMATO: EMBUDO NARRATIVO — La estructura es una guía, no un corsé
═══════════════════════════════════════════════════════════════════════════════

## EXTENSIÓN Y ADAPTACIÓN
La estructura se adapta a lo que el usuario pregunta. Activa solo los bloques
que aporten valor a la consulta concreta. Si un bloque no aplica, omítelo.

Escala de profundidad según tipo de consulta:
- SI LA PREGUNTA MENCIONA UNA EMPRESA (nombre, ticker o sector con empresa implícita):
  SIEMPRE informe completo con Embudo Narrativo — RANGO OBJETIVO: 4.500–5.400 palabras.
  NO existe la opción "respuesta corta" para consultas sobre empresas.
  Aunque la pregunta parezca pedir solo un dato o métrica, el análisis corporativo
  SIEMPRE requiere el contexto completo del Embudo Narrativo.
  Prioriza DENSIDAD ANALÍTICA (hechos + interpretación + recomendación) sobre repetición decorativa.
  Distribución orientativa: Resumen ~600 · Pilar 1 ~1.500 · Pilar 2 ~1.200 · Pilar 3 ~1.000 · Cierre ~200.
  Termina cuando el análisis esté completo y sea accionable. No alargues por inercia.
  No dupliques ideas entre pilares — cada sección aporta información nueva.
- Análisis sectorial: profundidad media — activa bloques relevantes (mínimo 2.500 palabras)
- Comparativa entre empresas: estructura enfrentada — tabla vs. tabla (mínimo 3.000 palabras)
- Pregunta sin empresa (metodología, conceptos, datos generales): respuesta focalizada

El rol del usuario modifica el ÁNGULO/TONO pero NUNCA elimina datos relevantes.

Orden del embudo (respétalo; omite el bloque completo si no aplica):

═══════════════════════════════════════════════════════════════════════════════
                        RESUMEN EJECUTIVO
═══════════════════════════════════════════════════════════════════════════════

Quien lee SOLO el Resumen entiende la situación. Debe poder presentarse en
un comité de dirección sin más contexto.

### Titular-Diagnóstico
Una frase contundente de 1-2 líneas que sintetice la situación. Ej:
"[Empresa] consolida su liderazgo narrativo pero pierde terreno en evidencia
documental frente a [Competidor], abriendo un flanco de vulnerabilidad."

### 3 KPIs con Delta
Tres indicadores clave con su variación respecto al periodo anterior:
- **[KPI 1]**: [valor] ([+/- delta] vs anterior)
- **[KPI 2]**: [valor] ([+/- delta] vs anterior)
- **[KPI 3]**: [valor] ([+/- delta] vs anterior)

### 3 Hallazgos
Tres descubrimientos principales del análisis, en prosa completa (no bullets
telegráficos). Cada hallazgo en 2-3 oraciones con datos concretos.

### 3 Recomendaciones (acción + responsable + KPI)
Tres recomendaciones ejecutivas, cada una con:
- Acción concreta
- Área responsable
- KPI de seguimiento

### Veredicto
Un párrafo de 3-4 oraciones con la valoración final del analista.

### 5 Mensajes para la Dirección
Bloque diferenciado con 5 mensajes directos y accionables que un directivo
pueda trasladar directamente a su equipo. Redactados como instrucciones
ejecutivas, no como análisis.

═══════════════════════════════════════════════════════════════════════════════
              PILAR 1 — DEFINIR (Qué dice el dato)
═══════════════════════════════════════════════════════════════════════════════

Quien llega a Pilar 1 entiende la situación con detalle factual.

### Visión de las 6 IAs
Tarjetas de cada modelo de IA ordenadas de MAYOR a MENOR puntuación RIX.
Para cada modelo: puntuación RIX, fortaleza principal, debilidad principal,
y un párrafo interpretativo de 3-4 oraciones.

### Las 8 Métricas
Para cada métrica relevante (solo si hay datos):
- **[Nombre completo] ([Sigla])**: [Puntuación]/100
  Párrafo explicativo de 2-3 oraciones interpretando qué significa esa
  puntuación para la empresa, con color semafórico (🟢 >70, 🟡 50-70, 🔴 <50).

### Divergencia entre Modelos
Análisis de las diferencias entre modelos de IA. Qué modelos coinciden,
cuáles divergen significativamente (>12 pts) y qué implica esa divergencia.

═══════════════════════════════════════════════════════════════════════════════
              PILAR 2 — ANALIZAR (Qué significan)
═══════════════════════════════════════════════════════════════════════════════

Quien llega a Pilar 2 entiende POR QUÉ la situación es como es.

### Evolución y Comparativas
Tablas con deltas temporales (vs semana anterior, vs mes anterior).
| Periodo | RIX | Δ | Evento Clave |
|---------|-----|---|--------------|

### Amenazas y Riesgos
Para cada amenaza identificada:
- Impacto estimado en puntos RIX
- Métricas afectadas
- Recomendación de mitigación

### Gaps: Realidad vs Percepción IA
Análisis de brechas entre lo que la empresa comunica y lo que las IAs
perciben. ¿Hay narrativas que no están llegando? ¿Hay percepciones
erróneas que corregir?

### Contexto Competitivo
Ranking comparativo con competidores directos:
| Posición | Empresa | RIX | Fortaleza | Debilidad | Distancia al líder |
|----------|---------|-----|-----------|-----------|---------------------|

═══════════════════════════════════════════════════════════════════════════════
              PILAR 3 — PROSPECTAR (Qué hacer)
═══════════════════════════════════════════════════════════════════════════════

Quien llega a Pilar 3 ACTÚA el lunes. Cada recomendación lleva 6 campos
obligatorios en este orden exacto:

### 3 Activaciones Inmediatas (0-7 días)

Para CADA activación, formato OBLIGATORIO:

# N — LÍNEA TITULAR: verbo de acción + táctica concreta

**Qué**: Entregables, canales, etiquetas, complementos.
**Por qué**: Datos del informe (%, puntuaciones) + mecanismo causal IA.
**Responsable**: Área(s) implicada(s).
**KPI**: Nombre descriptivo de métrica + umbral + plazo.
**Impacto IA**: Modelo — Métrica ↑/↑↑ (uno por línea).

### 3 Tácticas Operativas (2-8 semanas)
Mismo formato de 6 campos que las activaciones inmediatas.

### 3 Líneas Estratégicas (trimestre)
Mismo formato de 6 campos que las activaciones inmediatas.

### Tabla de Escenarios
| Escenario | Condición | RIX Estimado | Acciones Clave |
|-----------|-----------|--------------|----------------|
| Optimista | [condición] | [valor] | [acciones] |
| Base | [condición] | [valor] | [acciones] |
| Riesgo | [condición] | [valor] | [acciones] |

═══════════════════════════════════════════════════════════════════════════════
                        CIERRE
═══════════════════════════════════════════════════════════════════════════════

### Kit de Gestión
Borradores ejecutivos de las 3 activaciones inmediatas recomendadas en
Pilar 3. Cada borrador debe ser directamente utilizable (ej: draft de
comunicado, esquema de fact sheet, talking points para reunión).

═══════════════════════════════════════════════════════════════════════════════
                   FUENTES Y METODOLOGÍA
═══════════════════════════════════════════════════════════════════════════════

Incluir al final:
- Modelos de IA consultados y fecha del análisis
- Número de documentos cualitativos utilizados del Vector Store
- Periodo temporal analizado
- Nota sobre la metodología RepIndex

RECUERDA: Este es un informe de consultoría estratégica de máximo rigor.
El orden del embudo no se altera. Si una sección no aplica, se omite limpiamente.
En análisis de empresa siempre mínimo 2.500 palabras. En preguntas concretas,
responde con precisión y sin relleno.
`;
}

// =============================================================================
// DRUMROLL QUESTION GENERATOR (Complementary Report Suggestion Based on REAL Data)
// =============================================================================
interface DrumrollQuestion {
  title: string;
  fullQuestion: string;
  teaser: string;
  reportType: "competitive" | "vulnerabilities" | "projection" | "sector";
}

interface AnalysisInsights {
  company: string;
  ticker: string;
  overallScore: number;
  weakestMetrics: { name: string; score: number; interpretation: string }[];
  strongestMetrics: { name: string; score: number; interpretation: string }[];
  trend: "up" | "down" | "stable";
  trendDelta: number;
  divergenceLevel: "low" | "medium" | "high";
  divergenceDetail?: string;
  keyFinding: string;
}

// Extract structured insights from rix_runs data for the analyzed company
function extractAnalysisInsights(
  rixData: any[],
  primaryCompany: { ticker: string; issuer_name: string },
  answer: string,
): AnalysisInsights | null {
  // Filter data for this company
  const companyData = rixData
    .filter((r) => r["05_ticker"] === primaryCompany.ticker)
    .sort((a, b) => new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime());

  if (companyData.length === 0) {
    return null;
  }

  // Get latest week data (multiple models)
  const latestDate = companyData[0]?.batch_execution_date;
  const latestWeekData = companyData.filter((r) => r.batch_execution_date === latestDate);

  // Calculate average RIX across models
  const rixScores = latestWeekData.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
  const avgRix = rixScores.length > 0 ? Math.round(rixScores.reduce((a, b) => a + b, 0) / rixScores.length) : 0;

  // Calculate divergence between models
  const maxRix = Math.max(...rixScores);
  const minRix = Math.min(...rixScores);
  const divergence = maxRix - minRix;
  let divergenceLevel: "low" | "medium" | "high" = "low";
  let divergenceDetail = "";

  if (divergence >= 20) {
    divergenceLevel = "high";
    const maxModel = latestWeekData.find((r) => r["09_rix_score"] === maxRix)?.["02_model_name"];
    const minModel = latestWeekData.find((r) => r["09_rix_score"] === minRix)?.["02_model_name"];
    divergenceDetail = `${maxModel} (${maxRix}) vs ${minModel} (${minRix})`;
  } else if (divergence >= 10) {
    divergenceLevel = "medium";
  }

  // Extract metric scores from latest run (use first model with complete data)
  const latestRun = latestWeekData.find((r) => r["23_nvm_score"] != null) || latestWeekData[0];

  const metrics = [
    {
      name: "NVM (Narrativa)",
      fullName: "Calidad Narrativa",
      score: latestRun?.["23_nvm_score"],
      category: latestRun?.["25_nvm_categoria"],
    },
    {
      name: "DRM (Evidencia)",
      fullName: "Evidencia Documental",
      score: latestRun?.["26_drm_score"],
      category: latestRun?.["28_drm_categoria"],
    },
    {
      name: "SIM (Autoridad)",
      fullName: "Autoridad de Fuentes",
      score: latestRun?.["29_sim_score"],
      category: latestRun?.["31_sim_categoria"],
    },
    {
      name: "RMM (Momentum)",
      fullName: "Momentum Mediático",
      score: latestRun?.["32_rmm_score"],
      category: latestRun?.["34_rmm_categoria"],
    },
    {
      name: "CEM (Riesgo)",
      fullName: "Gestión de Controversias",
      score: latestRun?.["35_cem_score"],
      category: latestRun?.["37_cem_categoria"],
    },
    {
      name: "GAM (Gobernanza)",
      fullName: "Percepción de Gobierno",
      score: latestRun?.["38_gam_score"],
      category: latestRun?.["40_gam_categoria"],
    },
    {
      name: "DCM (Coherencia)",
      fullName: "Coherencia Informativa",
      score: latestRun?.["41_dcm_score"],
      category: latestRun?.["43_dcm_categoria"],
    },
    {
      name: "CXM (Ejecución)",
      fullName: "Ejecución Corporativa",
      score: latestRun?.["44_cxm_score"],
      category: latestRun?.["46_cxm_categoria"],
    },
  ].filter((m) => m.score != null && m.score > 0);

  // Sort by score to find weakest and strongest
  const sortedByScore = [...metrics].sort((a, b) => a.score - b.score);
  const weakest = sortedByScore.slice(0, 2);
  const strongest = sortedByScore.slice(-2).reverse();

  // Calculate trend from historical data (compare last 2 weeks if available)
  let trend: "up" | "down" | "stable" = "stable";
  let trendDelta = 0;

  const uniqueDates = [...new Set(companyData.map((r) => r.batch_execution_date))].sort().reverse();
  if (uniqueDates.length >= 2) {
    const thisWeekData = companyData.filter((r) => r.batch_execution_date === uniqueDates[0]);
    const lastWeekData = companyData.filter((r) => r.batch_execution_date === uniqueDates[1]);

    const thisWeekAvg =
      thisWeekData
        .map((r) => r["09_rix_score"])
        .filter(Boolean)
        .reduce((a, b) => a + b, 0) / thisWeekData.length;
    const lastWeekAvg =
      lastWeekData
        .map((r) => r["09_rix_score"])
        .filter(Boolean)
        .reduce((a, b) => a + b, 0) / lastWeekData.length;

    trendDelta = Math.round(thisWeekAvg - lastWeekAvg);
    if (trendDelta >= 3) trend = "up";
    else if (trendDelta <= -3) trend = "down";
  }

  // Extract key finding from answer (first 300 chars or first paragraph)
  const firstParagraph = answer.split("\n\n")[0] || answer.substring(0, 300);
  const keyFinding = firstParagraph.length > 200 ? firstParagraph.substring(0, 200) + "..." : firstParagraph;

  return {
    company: primaryCompany.issuer_name,
    ticker: primaryCompany.ticker,
    overallScore: avgRix,
    weakestMetrics: weakest.map((m) => ({
      name: m.name,
      score: m.score,
      interpretation: m.category || "Sin categoría",
    })),
    strongestMetrics: strongest.map((m) => ({
      name: m.name,
      score: m.score,
      interpretation: m.category || "Sin categoría",
    })),
    trend,
    trendDelta,
    divergenceLevel,
    divergenceDetail,
    keyFinding,
  };
}

async function generateDrumrollQuestion(
  originalQuestion: string,
  insights: AnalysisInsights | null,
  detectedCompanies: { ticker: string; issuer_name: string; sector_category?: string }[],
  allCompaniesCache: any[] | null,
  language: string,
  languageName: string,
  logPrefix: string,
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
      .filter((c) => c.sector_category === sectorInfo && c.ticker !== primaryCompany.ticker)
      .slice(0, 5)
      .map((c) => c.issuer_name);
  }

  // Build prompt with REAL structured data
  const drumrollPrompt = `Acabas de generar un análisis sobre: "${originalQuestion}"

═══════════════════════════════════════════════════════════════════════════════
                      HALLAZGOS CLAVE DEL ANÁLISIS (DATOS REALES)
═══════════════════════════════════════════════════════════════════════════════

EMPRESA ANALIZADA: ${insights.company} (${insights.ticker})
SCORE RIX ACTUAL: ${insights.overallScore}/100
TENDENCIA: ${insights.trend === "up" ? "📈 Subiendo" : insights.trend === "down" ? "📉 Bajando" : "➡️ Estable"} (${insights.trendDelta > 0 ? "+" : ""}${insights.trendDelta} pts vs semana anterior)

MÉTRICAS MÁS DÉBILES (oportunidad de mejora):
${insights.weakestMetrics.map((m) => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join("\n")}

MÉTRICAS MÁS FUERTES:
${insights.strongestMetrics.map((m) => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join("\n")}

NIVEL DE DIVERGENCIA ENTRE IAs: ${insights.divergenceLevel.toUpperCase()}${insights.divergenceDetail ? ` - ${insights.divergenceDetail}` : ""}

SECTOR: ${sectorInfo || "No específico"}
COMPETIDORES DISPONIBLES: ${competitors.join(", ") || "No identificados"}

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
        {
          role: "system",
          content: `Eres un estratega de inteligencia competitiva que propone análisis ESPECÍFICOS basados en datos reales. NUNCA propones informes genéricos. Siempre refieres métricas, scores o tendencias concretas en tus propuestas. Responde SOLO en JSON válido sin bloques de código.`,
        },
        { role: "user", content: drumrollPrompt },
      ],
      "gpt-4o-mini",
      500,
      logPrefix,
    );

    if (!result) {
      console.log(`${logPrefix} No drumroll: AI returned null`);
      return null;
    }

    const cleanResult = result
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleanResult);

    // Validar estructura completa
    if (parsed.title && parsed.fullQuestion && parsed.teaser && parsed.reportType) {
      console.log(
        `${logPrefix} Drumroll generated: "${parsed.title}" (type: ${parsed.reportType}, based on ${insights.weakestMetrics[0]?.name || "general"} insights)`,
      );
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
- **Datos concretos en el titular**: "Repsol cae 8 puntos en RIX mientras Moeve escala posiciones"
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

## 🤖 3. EXCLUSIVA: EL JUICIO DE LAS 6 INTELIGENCIAS

### [TITULAR]: ChatGPT, Perplexity, Gemini, DeepSeek, Grok y Qwen emiten su veredicto sobre [Empresa]

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

#### Grok evalúa: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Grok de xAI [identifica/señala]: [hallazgo principal]"
[3-4 párrafos analizando la perspectiva de Grok, caracterizada por su enfoque conversacional y acceso a datos de X/Twitter en tiempo real]

#### Qwen considera: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Qwen de Alibaba [revela/detecta]: [hallazgo principal]"
[3-4 párrafos analizando la perspectiva de Qwen, el modelo líder chino con fuerte presencia en mercados asiáticos]

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

| Semana | RIX Promedio | ChatGPT | Perplexity | Gemini | DeepSeek | Grok | Qwen | Evento Clave |
|--------|--------------|---------|------------|--------|----------|------|------|--------------|

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

### Glosario de Modelos de IA
- **ChatGPT (OpenAI)**: Modelo conversacional líder, fuerte en razonamiento general y síntesis narrativa. Sus fuentes verificadas incluyen URLs con utm_source=openai.
- **Perplexity**: Motor de búsqueda conversacional con citaciones explícitas. Excelente para fuentes recientes y verificables.
- **Gemini (Google)**: Modelo multimodal de Google, fuerte integración con datos de búsqueda y actualidad.
- **DeepSeek**: Modelo chino open-source, perspectiva alternativa con fuerte capacidad de razonamiento técnico.
- **Grok (xAI)**: Modelo de Elon Musk con acceso a datos de X/Twitter en tiempo real, enfoque conversacional y directo.
- **Qwen (Alibaba)**: Modelo líder chino, fuerte en mercados asiáticos y análisis multilingüe.

⚠️ NOTA METODOLÓGICA: SIM mide jerarquía de fuentes, NO sostenibilidad. DRM mide calidad de evidencia, NO desempeño financiero. DCM mide coherencia entre IAs, NO innovación digital.
⚠️ NOTA BIBLIOGRAFÍA: Solo ChatGPT y Perplexity proveen fuentes verificables documentalmente. Las fuentes de otros modelos no se incluyen en la bibliografía por no ser verificables.

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
  if (req.method === "OPTIONS") {
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
      language = "es",
      languageName = "Español",
      depthLevel = "complete",
      streamMode = false, // NEW: enable SSE streaming
    } = body;

    // =============================================================================
    // EXTRACT USER ID FROM JWT TOKEN
    // =============================================================================
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const {
          data: { user },
          error,
        } = await supabaseClient.auth.getUser(token);
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
    if (action === "enrich" && roleId && rolePrompt && originalResponse) {
      console.log(`${logPrefix} ENRICH REQUEST for role: ${roleName} (${roleId})`);
      return await handleEnrichRequest(
        roleId,
        roleName,
        rolePrompt,
        originalQuestion || "",
        originalResponse,
        sessionId,
        logPrefix,
        supabaseClient,
        userId,
      );
    }

    console.log(`${logPrefix} User question:`, question);
    console.log(`${logPrefix} Depth level:`, depthLevel);

    const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAIApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Load or refresh company cache
    const now = Date.now();
    if (!companiesCache || now - cacheTimestamp > CACHE_TTL) {
      console.log(`${logPrefix} Loading companies from database...`);
      const { data: companies } = await supabaseClient
        .from("repindex_root_issuers")
        .select("issuer_name, issuer_id, ticker, sector_category, ibex_family_code, cotiza_en_bolsa, include_terms");

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

    if (questionCategory !== "corporate_analysis") {
      const redirectResponse = getRedirectResponse(questionCategory, question, languageName, companiesCache || []);

      // Save to database
      if (sessionId) {
        await supabaseClient.from("chat_intelligence_sessions").insert([
          {
            session_id: sessionId,
            role: "user",
            content: question,
            user_id: userId,
            question_category: questionCategory,
            depth_level: depthLevel,
          },
          {
            session_id: sessionId,
            role: "assistant",
            content: redirectResponse.answer,
            suggested_questions: redirectResponse.suggestedQuestions,
            user_id: userId,
            question_category: questionCategory,
          },
        ]);
      }

      return new Response(
        JSON.stringify({
          answer: redirectResponse.answer,
          suggestedQuestions: redirectResponse.suggestedQuestions,
          metadata: {
            type: "redirect",
            questionCategory,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

    const isGenericBulletinRequest = GENERIC_BULLETIN_PATTERNS.some((pattern) => pattern.test(question.trim()));

    if (isGenericBulletinRequest) {
      console.log(`${logPrefix} GENERIC BULLETIN REQUEST - asking for company`);

      // Get some example companies to suggest
      const exampleCompanies = companiesCache?.slice(0, 20).map((c) => c.issuer_name) || [];
      const ibexCompanies =
        companiesCache
          ?.filter((c) => c.ibex_family_code === "IBEX35")
          .slice(0, 10)
          .map((c) => c.issuer_name) || [];

      const suggestedCompanies = [...new Set([...ibexCompanies, ...exampleCompanies])].slice(0, 8);

      return new Response(
        JSON.stringify({
          answer: `¡Perfecto! 📋 Puedo generar un **boletín ejecutivo** completo para cualquier empresa de nuestra base de datos.\n\n**¿De qué empresa quieres el boletín?**\n\nEscribe el nombre de la empresa (por ejemplo: Telefónica, Inditex, Repsol, BBVA, Iberdrola...) y generaré un análisis detallado incluyendo:\n\n- 📊 **RIX Score** por cada modelo de IA (ChatGPT, Perplexity, Gemini, DeepSeek)\n- 🏆 **Comparativa** con competidores del mismo sector\n- 📈 **Tendencia** de las últimas 4 semanas\n- 💡 **Conclusiones** y recomendaciones\n\nEl boletín estará listo para **descargar o imprimir** en formato profesional.`,
          suggestedQuestions: suggestedCompanies.map((c) => `Genera un boletín de ${c}`),
          metadata: {
            type: "standard",
            documentsFound: 0,
            structuredDataFound: companiesCache?.length || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        streamMode, // Pass streaming mode to bulletin handler
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
      roleId, // NEW: pass role info
      roleName,
      rolePrompt,
      streamMode, // Pass streaming mode to standard chat handler
    );
  } catch (error) {
    console.error(`${logPrefix} Error in chat-intelligence function:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// =============================================================================
// GUARDRAILS: QUESTION CATEGORIZATION
// =============================================================================
type QuestionCategory =
  | "corporate_analysis" // Normal question about companies
  | "agent_identity" // "Who are you?"
  | "personal_query" // About an individual person
  | "off_topic" // Outside scope
  | "test_limits"; // Jailbreak/testing attempts

function categorizeQuestion(question: string, companiesCache: any[]): QuestionCategory {
  const q = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Agent identity patterns
  if (
    /qui[ee]n eres|qu[ee] eres|c[oo]mo funcionas|eres una? ia|que modelo|qué modelo|who are you|what are you/i.test(q)
  ) {
    return "agent_identity";
  }

  // Personal query patterns (asking about themselves or specific people without company context)
  if (/c[oó]mo me ven|qu[eé] dicen de m[ií]|analiza(me)?|sobre m[ií]|analyze me|about me/i.test(q)) {
    return "personal_query";
  }

  // If mentions known companies, it's corporate analysis
  if (detectCompaniesInQuestion(question, companiesCache).length > 0) {
    return "corporate_analysis";
  }

  // Off-topic patterns
  if (
    /f[uú]tbol|pol[ií]tica|receta|chiste|poema|\bcuento\b|\bcuentos\b|weather|tiempo hace|football|soccer|joke|recipe|poem|story/i.test(
      q,
    )
  ) {
    return "off_topic";
  }

  // Test limits patterns — expanded to catch injection attempts
  if (/ignore.*instructions|ignora.*instrucciones|jailbreak|bypass|prompt injection|actua como|act as if/i.test(q)) {
    return "test_limits";
  }

  // Detect "responde literalmente" / "repeat exactly" injection attempts
  if (/responde\s+(?:literalmente|exactamente|solo\s+con)|repite?\s+(?:exactamente|literalmente|solo)|repeat\s+(?:exactly|only)|respond\s+only\s+with/i.test(q)) {
    return "test_limits";
  }

  // Sector/methodology/ranking queries WITHOUT a specific company
  if (/\b(?:sector|ranking|top\s+\d+|ibex|mercado|metodolog[ií]a|c[oó]mo\s+funciona|qu[eé]\s+es\s+(?:el\s+)?r[ií]x)\b/i.test(q)) {
    return "corporate_analysis"; // legitimate, will be handled with proper depth
  }

  // Default: only fall to corporate_analysis if the question has substance
  // Short prompts (<20 chars) or pure instructions without company context → test_limits
  if (q.length < 20 && !/\b(?:analiza|compara|ranking|top|sector)\b/i.test(q)) {
    return "test_limits";
  }

  return "corporate_analysis";
}

function getRedirectResponse(
  category: QuestionCategory,
  question: string,
  languageName: string,
  companiesCache: any[],
): { answer: string; suggestedQuestions: string[] } {
  const ibexCompanies = companiesCache
    ?.filter((c) => c.ibex_family_code === "IBEX35")
    .slice(0, 5)
    .map((c) => c.issuer_name) || ["Telefónica", "BBVA", "Santander", "Iberdrola", "Inditex"];

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
      ],
    },
    personal_query: {
      answer: `Mi especialidad es el análisis de reputación **corporativa**, no individual. Analizo cómo las IAs perciben a empresas como entidades, no a personas físicas.

Sin embargo, si estás vinculado a una empresa específica, puedo analizar cómo la percepción del liderazgo afecta a la reputación corporativa de esa organización.

**¿Te gustaría que analizara la reputación corporativa de alguna empresa en particular?**`,
      suggestedQuestions: [
        `Analiza ${ibexCompanies[0]}`,
        `¿Cómo se percibe el liderazgo de ${ibexCompanies[1]}?`,
        `Reputación del sector Tecnología`,
      ],
    },
    off_topic: {
      answer: `Esa pregunta está fuera de mi especialización. Como Agente Rix, me centro exclusivamente en el **análisis de reputación algorítmica corporativa**.

**Lo que sí puedo ofrecerte:**
- 📊 Análisis de cualquier empresa del IBEX-35 o del ecosistema español
- 🏆 Comparativas sectoriales y benchmarking competitivo
- 📈 Detección de tendencias y alertas reputacionales
- 📋 Informes ejecutivos sobre la percepción en IAs

¿Hay alguna empresa o sector que te interese analizar?`,
      suggestedQuestions: [`Ranking del sector Energía`, `Top 10 empresas esta semana`, `Analiza ${ibexCompanies[2]}`],
    },
    test_limits: {
      answer: `Soy el Agente Rix, un analista de reputación corporativa. Mi función es ayudarte a entender cómo las IAs perciben a las empresas españolas.

¿En qué empresa o sector te gustaría que nos centráramos?`,
      suggestedQuestions: [`Analiza ${ibexCompanies[0]}`, `Top 5 del IBEX-35`, `Comparativa sector Telecomunicaciones`],
    },
    corporate_analysis: {
      answer: "", // Not used for this category
      suggestedQuestions: [],
    },
  };

  return responses[category];
}

// =============================================================================
// PERICIAL ENRICH HANDLER - Forensic-grade reputation expert report
// Produces a DICTAMEN PERICIAL, NOT an executive report.
// Completely separate system prompt — no Embudo Narrativo, no Pilar 3.
// =============================================================================
async function handlePericialEnrichRequest(
  roleName: string,
  originalQuestion: string,
  originalResponse: string,
  sessionId: string | undefined,
  logPrefix: string,
  supabaseClient: any,
  userId: string | null,
) {
  console.log(`${logPrefix} Generating DICTAMEN PERICIAL for role: ${roleName}`);

  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `Eres un sistema de análisis forense de reputación corporativa. Tu función es producir DICTÁMENES PERICIALES con valor probatorio para entornos judiciales, arbitrales y de mediación. El dictamen se elabora con la metodología RepIndex, desarrollada y validada académicamente por la Universidad Complutense de Madrid.

## REGLAS ABSOLUTAS DE COMPORTAMIENTO

**TONO Y PERSONA:**
- Tercera persona siempre. El sujeto es "la entidad analizada", "el modelo X", "los datos".
- Verbos permitidos: "se constata", "se observa", "los datos evidencian", "resulta acreditado", "se aprecia", "se detecta", "no se dispone de evidencia suficiente para".
- PROHIBIDO: "creemos", "sugerimos", "recomendamos", "podría ser interesante", "debería", cualquier valoración subjetiva, cualquier recomendación estratégica o comercial.

**ESTÁNDAR DE EVIDENCIA:**
- Cada afirmación requiere: dato numérico + modelo de IA concreto que lo emite + fecha exacta de recogida.
- Formato obligatorio: "[Métrica]: [valor] — Fuente: [modelo], semana [periodo]".
- Cuando un dato no esté disponible: "No se dispone de evidencia suficiente para constatar este extremo en el periodo analizado."
- NUNCA afirmar causalidad. Solo: "se observa una correlación temporal entre [evento X] y [variación Y puntos en métrica Z]".
- Las divergencias entre modelos se documentan modelo por modelo. NUNCA se promedian ni generalizan.

**CUANTIFICACIÓN ECONÓMICA:**
- Prohibido realizar valoración económica del daño. La competencia reputacional se limita a: puntos RIX perdidos, posiciones descendidas en ranking, deltas temporales medidos.
- Si procede, se indica: "La base cuantitativa aquí constatada (X puntos, Y posiciones, delta Z semanas) deberá ser valorada económicamente por perito especializado en daños patrimoniales."

**INFORMACIÓN FALSA EN MODELOS:**
- Si algún modelo contiene información falsa o no verificable, documentar: "El modelo [nombre] afirma [afirmación exacta] (detección: [fecha]). Este dato [no ha podido ser verificado / contradice la realidad verificable en cuanto a: ...]."

**METODOLOGÍA REPINDEX:**
- Siempre referenciar: "Sistema RepIndex, metodología de análisis de reputación algorítmica corporativa, validada académicamente por la Universidad Complutense de Madrid."
- Las 8 métricas del sistema RepIndex son:
  - **NVM (Calidad de la Narrativa)**: Coherencia del discurso, nivel de controversia, verificabilidad de afirmaciones.
  - **DRM (Fortaleza de Evidencia)**: Calidad y trazabilidad de las fuentes primarias citadas por los modelos.
  - **SIM (Autoridad de Fuentes)**: Jerarquía de fuentes (Tier 1: reguladores/financieros → Tier 4: redes/opinión).
  - **RMM (Actualidad y Empuje)**: Frescura temporal de las menciones dentro de la ventana analizada.
  - **CEM (Gestión de Controversias)**: Exposición a narrativas de riesgo (100 = ausencia total de controversias).
  - **GAM (Percepción de Gobierno)**: Percepción de independencia y buenas prácticas de gobernanza corporativa.
  - **DCM (Coherencia Informativa)**: Consistencia de la información entre los distintos modelos de IA consultados.
  - **CXM (Ejecución Corporativa)**: Percepción de desempeño en mercado y cotización (aplica solo a cotizadas).

## ESTRUCTURA OBLIGATORIA DEL DICTAMEN

Produce el documento siguiendo EXACTAMENTE esta estructura. Mínimo 2.000 palabras.

---

# DICTAMEN PERICIAL DE REPUTACIÓN CORPORATIVA
**Elaborado mediante metodología RepIndex — Universidad Complutense de Madrid**
**Fecha de elaboración del dictamen:** ${today}

---

## 1. IDENTIFICACIÓN DEL OBJETO DE ANÁLISIS

Especificar:
- Entidad analizada (denominación completa y ticker si aplica)
- Periodo temporal cubierto por los datos
- Modelos de IA consultados (con denominación exacta)
- Fecha y hora de extracción de los datos RepIndex
- Versión metodológica aplicada

---

## 2. METODOLOGÍA Y CADENA DE CUSTODIA

Describir:
- Descripción del sistema RepIndex: qué mide, cómo funciona, validación UCM
- Qué evalúa cada uno de los 6 modelos de IA consultados (ChatGPT, Perplexity, Gemini, Grok, DeepSeek, Qwen)
- Proceso de recogida de datos: consultas estandarizadas, sin intervención manual, registro automatizado
- Trazabilidad: qué pregunta exacta se formuló a cada modelo, en qué fecha, con qué resultado
- Confirmación de que los datos han sido obtenidos mediante el sistema automatizado RepIndex sin manipulación posterior

---

## 3. CONSTATACIÓN DE HECHOS MEDIBLES

Presentar una tabla con todas las métricas disponibles:

| Métrica | Descripción | Puntuación | Fecha | Modelo(s) | Semáforo |
|---|---|---|---|---|---|

Para cada métrica:
- Si el dato está disponible: reportar con fuente y fecha exacta
- Si el dato NO está disponible: "No se dispone de evidencia suficiente para este extremo"
- Semáforo: 🟢 ≥75 | 🟡 50-74 | 🔴 <50

Nota: La puntuación RIX Score global (media ponderada de las 8 métricas) se constata como síntesis cuantitativa del estado reputacional algorítmico en el periodo analizado.

---

## 4. ANÁLISIS POR MÉTRICA PRIORIZADA

Desarrollar en profundidad las cuatro métricas con mayor relevancia pericial:

### 4.1 DCM — Coherencia Informativa
¿Coinciden los modelos en los datos básicos sobre la entidad? Documentar discrepancias concretas modelo a modelo.

### 4.2 DRM — Fortaleza de Evidencia
¿Las afirmaciones de los modelos tienen respaldo verificable? Identificar afirmaciones sin fuente o con fuentes de baja jerarquía (Tier 3-4).

### 4.3 CEM — Gestión de Controversias
¿Existen narrativas de riesgo activas en los modelos que puedan constituir daño reputacional documentable? Describir cada narrativa detectada con modelo + afirmación + fecha.

### 4.4 NVM — Calidad de la Narrativa
¿Con qué atributos describen los modelos a la entidad? ¿Son fieles a la realidad verificable? Documentar atributos positivos y negativos detectados.

---

## 5. DIVERGENCIAS ENTRE MODELOS

Tabla de divergencias cuando los valores entre modelos se separan más de 10 puntos:

| Modelo | Métrica | Valor | Desviación vs media | Afirmación concreta detectada | Fecha |
|---|---|---|---|---|---|

Para cada divergencia significativa, documentar:
- Modelo que la origina
- Afirmación exacta detectada (cita textual si está disponible)
- Posible causa (información desactualizada, fuentes de baja jerarquía, etc.)
- Fecha de detección

Si no hay divergencias significativas (>10 puntos): constatarlo explícitamente.

---

## 6. EVOLUCIÓN TEMPORAL

(Completar solo si los datos proporcionados incluyen series temporales)

Para cada evento relevante identificado:
- Estado reputacional PREVIO al evento: puntuación + fecha
- Estado reputacional POSTERIOR al evento: puntuación + fecha
- Delta medido: X puntos en métrica Y durante Z semanas
- Constatar: "Se observa una correlación temporal entre [evento] y [variación]. No se afirma relación causal."

Si no hay datos temporales suficientes: "No se dispone de datos históricos suficientes para constatar evolución temporal en el periodo analizado."

---

## 7. CONCLUSIONES PERICIALES

Solo incluir conclusiones que los datos permitan sostener con rigor. Para cada conclusión:
- Enunciar el hecho constatado
- Indicar la base cuantitativa que lo sustenta (puntuaciones, deltas, modelos)
- Si los datos no respaldan una conclusión, declararlo explícitamente: "Los datos disponibles no permiten sostener [X]. Sería necesario [Y] para poder afirmarlo."

Incluir:
- Síntesis del estado reputacional algorítmico constatado
- Existencia o ausencia de deterioro documentable, con base cuantitativa
- Coherencia o incoherencia entre modelos como factor de riesgo probatorio
- Si procede: "La base cuantitativa aquí constatada deberá ser valorada económicamente por perito especializado en daños patrimoniales."

---

## 8. FUENTES Y TRAZABILIDAD

- Modelos de IA consultados con su denominación exacta
- Sistema de análisis: RepIndex (metodología validada, Universidad Complutense de Madrid)
- Periodo de los datos analizados
- Fecha de extracción
- Número de registros analizados (si disponible)
- Declaración de ausencia de manipulación posterior a la extracción

---

## DATOS A ANALIZAR:

${originalResponse}

## PREGUNTA ORIGINAL QUE MOTIVÓ EL ANÁLISIS:
${originalQuestion || "(No disponible)"}

---

## INSTRUCCIONES FINALES:

1. Mínimo 2.000 palabras. El dictamen pericial debe tener cobertura documental suficiente.
2. Tercera persona siempre. Nunca primera persona ni valoraciones subjetivas.
3. Cada afirmación: dato + modelo + fecha.
4. Si algún dato no está disponible en la respuesta original, declararlo explícitamente en lugar de inventarlo.
5. No incluir recomendaciones estratégicas, planes de acción ni lenguaje comercial.
6. El documento debe poder incorporarse como anexo documental en un procedimiento judicial o arbitral.`;

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Elabora el DICTAMEN PERICIAL DE REPUTACIÓN CORPORATIVA completo. Rigor forense absoluto. Mínimo 2.000 palabras. Tercera persona. Solo hechos constatables con base en los datos proporcionados. Sin recomendaciones estratégicas. Sin valoración económica del daño.`,
      },
    ];

    const result = await callAIWithFallback(messages, "o3", 32000, logPrefix);
    const enrichedAnswer = result.content;

    console.log(
      `${logPrefix} DICTAMEN PERICIAL generated (via ${result.provider}), length: ${enrichedAnswer.length} chars`,
    );

    // Log API usage
    await logApiUsage({
      supabaseClient,
      edgeFunction: "chat-intelligence",
      provider: result.provider,
      model: result.model,
      actionType: "enrich",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId,
      sessionId,
      metadata: {
        roleId: "perito_reputacional",
        roleName,
        depth_level: "enrich",
      },
    });

    // Pericial-specific follow-up questions
    const suggestedQuestions = [
      `¿Qué divergencias existen entre los modelos de IA en la evaluación de esta empresa?`,
      `¿Hay evolución temporal documentada que muestre deterioro reputacional antes y después de algún evento?`,
      `¿Qué métricas presentan mayor exposición a narrativas de riesgo con valor probatorio?`,
    ];

    return new Response(
      JSON.stringify({
        answer: enrichedAnswer,
        suggestedQuestions,
        metadata: {
          type: "enriched",
          roleId: "perito_reputacional",
          roleName,
          aiProvider: result.provider,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`${logPrefix} Error in pericial enrich request:`, error);
    throw error;
  }
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
  userId: string | null,
) {
  // Special branch: forensic/legal expert generates a DICTAMEN PERICIAL, not an executive report
  if (roleId === "perito_reputacional") {
    return await handlePericialEnrichRequest(
      roleName,
      originalQuestion,
      originalResponse,
      sessionId,
      logPrefix,
      supabaseClient,
      userId,
    );
  }

  console.log(`${logPrefix} Generating EXPANDED executive report for role: ${roleName}`);

  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey) {
    throw new Error("OpenAI API key not configured");
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

## ESTRUCTURA OBLIGATORIA DEL INFORME — EMBUDO NARRATIVO (mínimo 2500 palabras):

---

# 📋 INFORME EJECUTIVO DE REPUTACIÓN CORPORATIVA
## Alta Dirección — Análisis RepIndex

---

### RESUMEN EJECUTIVO
- **Titular-diagnóstico**: Frase contundente que sintetice la situación
- **3 KPIs con delta** (vs periodo anterior)
- **3 Hallazgos** principales en prosa completa
- **3 Recomendaciones** (acción + responsable + KPI)
- **Veredicto**: Párrafo de 3-4 oraciones con valoración final
- **5 Mensajes para la Dirección**: Instrucciones ejecutivas directas

### PILAR 1 — DEFINIR (Qué dice el dato)
- Visión de las 6 IAs (tarjetas ordenadas de mayor a menor)
- Las 8 métricas (puntuación + color semafórico + párrafo explicativo)
- Divergencia entre modelos

${rolePrompt}

### PILAR 2 — ANALIZAR (Qué significan)
- Evolución y comparativas (tablas con deltas)
- Amenazas y riesgos (impacto en pts + métricas + recomendación)
- Gaps: Realidad vs Percepción IA
- Contexto competitivo (ranking con competidores)

### PILAR 3 — PROSPECTAR (Qué hacer)
Cada recomendación lleva 6 campos obligatorios:

# N — LÍNEA TITULAR: verbo de acción + táctica concreta
**Qué**: Entregables, canales, etiquetas.
**Por qué**: Datos del informe (%, puntuaciones) + mecanismo causal IA.
**Responsable**: Área(s) implicada(s).
**KPI**: Métrica + umbral + plazo.
**Impacto IA**: Modelo — Métrica ↑/↑↑.

Incluir:
- 3 Activaciones inmediatas (0-7 días)
- 3 Tácticas operativas (2-8 semanas)
- 3 Líneas estratégicas (trimestre)
- Tabla de escenarios (optimista / base / riesgo)

### CIERRE
Kit de gestión: borradores ejecutivos de las activaciones inmediatas.

### FUENTES Y METODOLOGÍA
Modelos consultados, periodo analizado, documentos utilizados.

---

## DATOS ORIGINALES A EXPANDIR:

${originalResponse}

## PREGUNTA ORIGINAL:
${originalQuestion || "(No disponible)"}

---

## REGLAS CRÍTICAS:

1. **MÍNIMO 2500 PALABRAS** - Este es un informe ejecutivo premium
2. **ESTRUCTURA EMBUDO** - Resumen → Pilar 1 → Pilar 2 → Pilar 3 → Cierre
3. **USAR TODOS LOS DATOS** - No omitir cifras ni empresas mencionadas
4. **TABLAS Y FORMATO** - Usar Markdown: tablas, negritas, listas, quotes
5. **NUNCA MENCIONAR EL PERFIL** - Adapta el contenido sin decir "para el CEO"
6. **EXPLICAR CADA MÉTRICA** - El lector no conoce la terminología
7. **6 CAMPOS POR RECOMENDACIÓN** - Qué, Por qué, Responsable, KPI, Impacto IA
8. **RECOMENDACIONES CONCRETAS** - No generalidades, acciones específicas
9. **NO INVENTAR DATOS** - Solo expandir análisis de datos existentes`;

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Genera un INFORME EJECUTIVO COMPLETO Y EXTENSO para alta dirección. Este debe ser un documento profesional de consultoría premium de MÁXIMA CALIDAD sin límite de extensión - si necesitas 5000 palabras, escribe 5000 palabras. Expandiendo y profundizando en todos los datos disponibles. NO resumas, EXPANDE. EXCELENCIA sobre brevedad. RECUERDA: No menciones el perfil del destinatario en el texto, simplemente adapta el enfoque. Y SIEMPRE explica qué significa cada métrica RepIndex que menciones.`,
      },
    ];

    const result = await callAIWithFallback(messages, "o3", 32000, logPrefix);
    const enrichedAnswer = result.content;

    console.log(
      `${logPrefix} EXPANDED executive report generated (via ${result.provider}), length: ${enrichedAnswer.length} chars`,
    );

    // Log API usage
    await logApiUsage({
      supabaseClient,
      edgeFunction: "chat-intelligence",
      provider: result.provider,
      model: result.model,
      actionType: "enrich",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId,
      sessionId,
      metadata: {
        roleId,
        roleName,
        depth_level: "enrich", // Enrichment is always a separate call
      },
    });

    // Generate role-specific follow-up questions
    const suggestedQuestions = await generateRoleSpecificQuestions(roleId, roleName, originalQuestion, logPrefix);

    return new Response(
      JSON.stringify({
        answer: enrichedAnswer,
        suggestedQuestions,
        metadata: {
          type: "enriched",
          roleId,
          roleName,
          aiProvider: result.provider,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
  logPrefix: string,
): Promise<string[]> {
  const roleQuestionHints: Record<string, string[]> = {
    ceo: ["impacto en negocio", "decisiones estratégicas", "comparativa competitiva", "riesgos principales"],
    periodista: ["titulares noticiables", "controversias", "investigación periodística", "ángulos de historia"],
    analista_mercados: [
      "correlación RIX-cotización",
      "señales de mercado",
      "análisis técnico",
      "comparativa sectorial",
    ],
    inversor: ["screening reputacional", "riesgo ESG", "oportunidades de entrada", "alertas de cartera"],
    dircom: ["gestión de crisis", "narrativa mediática", "mensajes clave", "sentimiento público"],
    marketing: ["posicionamiento de marca", "benchmarking", "diferenciación", "experiencia de cliente"],
    estratega_interno: [
      "capacidades organizativas",
      "cultura corporativa",
      "recursos internos",
      "brechas de alineamiento",
    ],
    estratega_externo: [
      "posición competitiva",
      "oportunidades de mercado",
      "amenazas externas",
      "movimientos estratégicos",
    ],
  };

  const hints = roleQuestionHints[roleId] || ["análisis detallado", "comparativas", "tendencias"];

  try {
    const messages = [
      {
        role: "system",
        content: `Genera 3 preguntas de seguimiento para un ${roleName} interesado en datos de reputación corporativa RepIndex. Las preguntas deben ser específicas y responderibles con datos de RIX Score, rankings, y comparativas. Temas relevantes: ${hints.join(", ")}. Responde SOLO con un array JSON: ["pregunta 1", "pregunta 2", "pregunta 3"]`,
      },
      {
        role: "user",
        content: `Pregunta original: "${originalQuestion}". Genera 3 preguntas de seguimiento relevantes para un ${roleName}.`,
      },
    ];

    const text = await callAISimple(messages, "gpt-4o-mini", 300, logPrefix);
    if (text) {
      const cleanText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(cleanText);
    }
  } catch (error) {
    console.warn(`${logPrefix} Error generating role-specific questions:`, error);
  }

  // Fallback questions based on role
  const fallbackQuestions: Record<string, string[]> = {
    ceo: [
      "¿Cuáles son los 3 riesgos reputacionales más urgentes?",
      "¿Cómo estamos vs la competencia directa?",
      "¿Qué decisiones debería considerar?",
    ],
    periodista: [
      "¿Qué empresa tiene la historia más noticiable esta semana?",
      "¿Hay alguna controversia emergente?",
      "¿Qué titular propones para esta información?",
    ],
    analista_mercados: [
      "¿Hay correlación entre RIX y cotización?",
      "¿Qué señales técnicas detectas?",
      "Comparativa detallada del sector",
    ],
    inversor: [
      "¿Pasa esta empresa el filtro reputacional?",
      "¿Cuál es el nivel de riesgo ESG?",
      "¿Es buen momento para entrar?",
    ],
  };

  return (
    fallbackQuestions[roleId] || [
      "¿Puedes profundizar más?",
      "¿Cómo se compara con competidores?",
      "¿Cuál es la tendencia?",
    ]
  );
}

// =============================================================================
// BULLETIN REQUEST HANDLER
// =============================================================================
async function handleBulletinRequest(
  companyQuery: string,
  originalQuestion: string,
  depthLevel: "quick" | "complete" | "exhaustive",
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  conversationId: string | undefined,
  streamMode: boolean = false, // NEW: support streaming mode
) {
  console.log(`${logPrefix} Processing bulletin request for: ${companyQuery}`);

  // 1. Find the company in our database
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const normalizedQuery = normalize(companyQuery);
  const matchedCompany = companiesCache?.find((c) => {
    const name = normalize(c.issuer_name);
    const ticker = c.ticker?.toLowerCase() || "";
    if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) return true;
    if (ticker === normalizedQuery) return true;
    // Check include_terms (aliases without accents)
    if (c.include_terms) {
      try {
        const terms = Array.isArray(c.include_terms) ? c.include_terms : JSON.parse(c.include_terms);
        if (
          terms.some((t: string) => {
            const nt = normalize(t);
            return (
              nt.length > 3 && (nt === normalizedQuery || normalizedQuery.includes(nt) || nt.includes(normalizedQuery))
            );
          })
        )
          return true;
      } catch (_) {
        /* ignore */
      }
    }
    return false;
  });

  if (!matchedCompany) {
    console.log(`${logPrefix} Company not found: ${companyQuery}`);
    return new Response(
      JSON.stringify({
        answer: `❌ No encontré la empresa "${companyQuery}" en la base de datos de RepIndex.\n\n**Empresas disponibles** (algunas sugerencias):\n${companiesCache
          ?.slice(0, 10)
          .map((c) => `- ${c.issuer_name} (${c.ticker})`)
          .join("\n")}\n\nPor favor, especifica el nombre exacto o el ticker de la empresa.`,
        suggestedQuestions: [
          "¿Qué empresas están disponibles en RepIndex?",
          "Genera un boletín de Telefónica",
          "Lista las empresas del sector Energía",
        ],
        metadata: { type: "error", bulletinRequested: true },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(`${logPrefix} Matched company: ${matchedCompany.issuer_name} (${matchedCompany.ticker})`);

  // 2. Get competitors using intelligent prioritization system (GUARDRAIL)
  const competitorLimit = 8; // Always exhaustive
  const competitorResult = await getRelevantCompetitors(
    matchedCompany,
    companiesCache || [],
    supabaseClient,
    competitorLimit,
    logPrefix,
  );
  const competitors = competitorResult.competitors;

  console.log(`${logPrefix} Smart competitor selection: ${competitors.map((c) => c.ticker).join(", ")}`);
  console.log(
    `${logPrefix} Competitor methodology: ${competitorResult.tierUsed} (verified: ${competitorResult.verifiedCount}, subsector: ${competitorResult.subsectorCount})`,
  );

  // 3. Get all tickers to fetch (company + competitors)
  const allTickers = [matchedCompany.ticker, ...competitors.map((c) => c.ticker)];

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. VECTOR STORE SEARCH - Qualitative context from AI explanations
  // ═══════════════════════════════════════════════════════════════════════════
  let vectorStoreContext = "";
  const vectorMatchCount = 30; // Always exhaustive

  try {
    // Generate embedding for the company name
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: `${matchedCompany.issuer_name} ${matchedCompany.ticker} reputación corporativa análisis`,
      }),
    });

    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const queryEmbedding = embeddingData.data?.[0]?.embedding;

      if (queryEmbedding) {
        // Search Vector Store for relevant documents
        const { data: vectorDocs, error: vectorError } = await supabaseClient.rpc("match_documents", {
          query_embedding: queryEmbedding,
          match_count: vectorMatchCount,
          filter: {}, // Could filter by metadata->ticker if indexed
        });

        if (!vectorError && vectorDocs?.length > 0) {
          // Filter results to only include documents about this company
          const relevantDocs = vectorDocs.filter((doc: any) => {
            const content = doc.content?.toLowerCase() || "";
            const metadata = doc.metadata || {};
            return (
              content.includes(matchedCompany.ticker.toLowerCase()) ||
              content.includes(matchedCompany.issuer_name.toLowerCase()) ||
              metadata.ticker === matchedCompany.ticker
            );
          });

          if (relevantDocs.length > 0) {
            console.log(
              `${logPrefix} Vector Store: Found ${relevantDocs.length} relevant documents (from ${vectorDocs.length} total)`,
            );

            vectorStoreContext = `\n📚 ANÁLISIS CUALITATIVOS DE IAs (Vector Store - ${relevantDocs.length} documentos):\n`;
            relevantDocs.slice(0, 10).forEach((doc: any, i: number) => {
              const content = doc.content?.substring(0, 600) || "";
              const similarity = doc.similarity ? ` [Similaridad: ${(doc.similarity * 100).toFixed(1)}%]` : "";
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
  let corporateNewsContext = "";

  try {
    const { data: corporateNews, error: newsError } = await supabaseClient
      .from("corporate_news")
      .select("headline, lead_paragraph, published_date, category")
      .eq("ticker", matchedCompany.ticker)
      .order("published_date", { ascending: false })
      .limit(5); // Always exhaustive

    if (!newsError && corporateNews?.length > 0) {
      console.log(`${logPrefix} Corporate News: Found ${corporateNews.length} recent articles`);

      corporateNewsContext = `\n📰 NOTICIAS CORPORATIVAS RECIENTES (${corporateNews.length}):\n`;
      corporateNews.forEach((news: any, i: number) => {
        corporateNewsContext += `${i + 1}. [${news.published_date || "Sin fecha"}] ${news.headline}\n`;
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
      "20_res_gpt_bruto",
      "21_res_perplex_bruto",
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
    logPrefix,
  });

  console.log(`${logPrefix} Fetched ${rixData?.length || 0} RIX records for bulletin`);

  // 7. Organize data by week and company
  const getPeriodKey = (run: any) => `${run["06_period_from"]}|${run["07_period_to"]}`;
  const uniquePeriods = [...new Set(rixData?.map(getPeriodKey) || [])]
    .sort((a, b) => b.split("|")[1].localeCompare(a.split("|")[1]))
    .slice(0, 4); // Always exhaustive: 4 periods

  console.log(`${logPrefix} Unique periods found: ${uniquePeriods.length}`);

  // 8. Build bulletin context
  let bulletinContext = "";

  // Company info
  bulletinContext += `📌 EMPRESA PRINCIPAL:\n`;
  bulletinContext += `- Nombre: ${matchedCompany.issuer_name}\n`;
  bulletinContext += `- Ticker: ${matchedCompany.ticker}\n`;
  bulletinContext += `- Sector: ${matchedCompany.sector_category || "No especificado"}\n`;
  bulletinContext += `- Subsector: ${matchedCompany.subsector || "No definido"}\n`;
  bulletinContext += `- Categoría IBEX: ${matchedCompany.ibex_family_code || "No IBEX"}\n`;
  bulletinContext += `- Cotiza en bolsa: ${matchedCompany.cotiza_en_bolsa ? "Sí" : "No"}\n\n`;

  // Competitors info WITH METHODOLOGY JUSTIFICATION
  bulletinContext += `🏢 COMPETIDORES (${competitors.length}) - METODOLOGÍA DE SELECCIÓN:\n`;
  bulletinContext += `${competitorResult.justification}\n\n`;
  competitors.forEach((c, idx) => {
    bulletinContext += `${idx + 1}. ${c.issuer_name} (${c.ticker})\n`;
    bulletinContext += `   - Sector: ${c.sector_category || "Sin sector"} | Subsector: ${c.subsector || "N/D"}\n`;
  });
  bulletinContext += "\n";

  // Add Vector Store context if available
  if (vectorStoreContext) {
    bulletinContext += vectorStoreContext;
    bulletinContext += "\n";
  }

  // Add Corporate News context if available
  if (corporateNewsContext) {
    bulletinContext += corporateNewsContext;
    bulletinContext += "\n";
  }

  // Data by week with DETAILED metrics
  uniquePeriods.forEach((period, weekIdx) => {
    const [periodFrom, periodTo] = period.split("|");
    const weekData = rixData?.filter((r) => getPeriodKey(r) === period) || [];

    const weekLabel = weekIdx === 0 ? "SEMANA ACTUAL" : `SEMANA -${weekIdx}`;
    bulletinContext += `\n📅 ${weekLabel} (${periodFrom} a ${periodTo}):\n\n`;

    // DETAILED Data for main company
    const mainCompanyData = weekData.filter((r) => r["05_ticker"] === matchedCompany.ticker);
    bulletinContext += `**${matchedCompany.issuer_name} - DATOS DETALLADOS**:\n\n`;

    if (mainCompanyData.length > 0) {
      mainCompanyData.forEach((r) => {
        const score = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
        bulletinContext += `### ${r["02_model_name"]} - RIX: ${score}\n`;

        // Include all RIX metrics
        bulletinContext += `**Métricas del RIX:**\n`;
        bulletinContext += `- NVM (Visibility): ${r["23_nvm_score"] ?? "N/A"} - ${r["25_nvm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- DRM (Digital Resonance): ${r["26_drm_score"] ?? "N/A"} - ${r["28_drm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- SIM (Sentiment): ${r["29_sim_score"] ?? "N/A"} - ${r["31_sim_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- RMM (Momentum): ${r["32_rmm_score"] ?? "N/A"} - ${r["34_rmm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- CEM (Crisis Exposure): ${r["35_cem_score"] ?? "N/A"} - ${r["37_cem_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- GAM (Growth Association): ${r["38_gam_score"] ?? "N/A"} - ${r["40_gam_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- DCM (Data Consistency): ${r["41_dcm_score"] ?? "N/A"} - ${r["43_dcm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- CXM (Customer Experience): ${r["44_cxm_score"] ?? "N/A"} - ${r["46_cxm_categoria"] || "Sin categoría"}\n`;

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
        bulletinContext += "\n---\n";
      });

      const avgScore =
        mainCompanyData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) /
        mainCompanyData.length;
      bulletinContext += `\n**PROMEDIO RIX ${matchedCompany.issuer_name}**: ${avgScore.toFixed(1)}\n`;
    } else {
      bulletinContext += `- Sin datos esta semana\n`;
    }
    bulletinContext += "\n";

    // Data for competitors with metrics
    bulletinContext += `**COMPETIDORES - RESUMEN ESTA SEMANA**:\n`;
    bulletinContext += `| Empresa | Ticker | RIX Prom | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |\n`;
    bulletinContext += `|---------|--------|----------|-----|-----|-----|-----|-----|-----|-----|-----|\n`;

    competitors.forEach((comp) => {
      const compData = weekData.filter((r) => r["05_ticker"] === comp.ticker);
      if (compData.length > 0) {
        const avgScore =
          compData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / compData.length;
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
    bulletinContext += "\n";

    // Individual competitor details for current week only
    if (weekIdx === 0) {
      bulletinContext += `\n**DETALLES DE COMPETIDORES - SEMANA ACTUAL:**\n`;
      competitors.forEach((comp) => {
        const compData = weekData.filter((r) => r["05_ticker"] === comp.ticker);
        if (compData.length > 0) {
          bulletinContext += `\n### ${comp.issuer_name} (${comp.ticker}):\n`;
          compData.forEach((r) => {
            const score = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
            bulletinContext += `- ${r["02_model_name"]}: RIX ${score}`;
            if (r["10_resumen"]) {
              bulletinContext += ` | Resumen: ${r["10_resumen"].substring(0, 200)}...`;
            }
            bulletinContext += "\n";
          });
        }
      });
    }
  });

  // Sector average calculation
  if (matchedCompany.sector_category) {
    const sectorCompanies = companiesCache?.filter((c) => c.sector_category === matchedCompany.sector_category) || [];
    const currentWeekData = rixData?.filter((r) => getPeriodKey(r) === uniquePeriods[0]) || [];

    let sectorTotal = 0;
    let sectorCount = 0;

    sectorCompanies.forEach((comp) => {
      const compData = currentWeekData.filter((r) => r["05_ticker"] === comp.ticker);
      if (compData.length > 0) {
        const avg =
          compData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / compData.length;
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

  const bulletinSystemPrompt = BULLETIN_SYSTEM_PROMPT; // Always full bulletin
  const bulletinMessages = [
    { role: "system", content: bulletinSystemPrompt },
    { role: "user", content: bulletinUserPrompt },
  ];

  // Always exhaustive configuration
  const bulletinMaxTokens = 40000;
  const bulletinTimeoutMs = 120000;
  const geminiModel = "gemini-2.5-flash";

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
          controller.enqueue(
            sseEncoder({
              type: "start",
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
              },
            }),
          );

          let accumulatedContent = "";
          let provider: "openai" | "gemini" = "openai";
          let inputTokens = 0;
          let outputTokens = 0;
          let streamError = false;

          // Try OpenAI first (unless quick mode prefers Gemini)
          if (!isQuickBulletin) {
            console.log(`${logPrefix} Trying OpenAI stream first...`);
            for await (const chunk of streamOpenAIResponse(
              bulletinMessages,
              "o3",
              bulletinMaxTokens,
              logPrefix,
              bulletinTimeoutMs,
            )) {
              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: "chunk", text: chunk.text }));
              } else if (chunk.type === "done") {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === "error") {
                console.warn(`${logPrefix} OpenAI stream error: ${chunk.error}, falling back to Gemini...`);
                streamError = true;
                controller.enqueue(sseEncoder({ type: "fallback", metadata: { provider: "gemini" } }));
                break;
              }
            }
          } else {
            streamError = true; // Skip to Gemini for quick mode
          }

          // Fallback to Gemini if OpenAI failed
          if (streamError || accumulatedContent.length === 0) {
            provider = "gemini";
            accumulatedContent = ""; // Reset for Gemini response

            console.log(`${logPrefix} Using Gemini stream (${geminiModel})...`);
            for await (const chunk of streamGeminiResponse(
              bulletinMessages,
              geminiModel,
              bulletinMaxTokens,
              logPrefix,
              bulletinTimeoutMs,
            )) {
              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: "chunk", text: chunk.text }));
              } else if (chunk.type === "done") {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === "error") {
                console.error(`${logPrefix} Gemini stream also failed: ${chunk.error}`);
                controller.enqueue(
                  sseEncoder({
                    type: "error",
                    error: `Error generando boletín: ${chunk.error}`,
                  }),
                );
                controller.close();
                return;
              }
            }
          }

          console.log(`${logPrefix} Bulletin stream completed (via ${provider}), length: ${accumulatedContent.length}`);

          // Log API usage in background
          logApiUsage({
            supabaseClient,
            edgeFunction: "chat-intelligence",
            provider,
            model: provider === "openai" ? "o3" : geminiModel,
            actionType: "bulletin_stream",
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
          }).catch((e) => console.warn("Failed to log usage:", e));

          // Save to database in background
          if (sessionId) {
            supabaseClient
              .from("chat_intelligence_sessions")
              .insert([
                {
                  session_id: sessionId,
                  role: "user",
                  content: originalQuestion,
                  company: matchedCompany.ticker,
                  analysis_type: "bulletin",
                  user_id: userId,
                },
                {
                  session_id: sessionId,
                  role: "assistant",
                  content: accumulatedContent,
                  company: matchedCompany.ticker,
                  analysis_type: "bulletin",
                  structured_data_found: rixData?.length || 0,
                  user_id: userId,
                },
              ])
              .then(() => console.log(`${logPrefix} Session saved`))
              .catch((e: Error) => console.warn("Failed to save session:", e));
          }

          // Save to user_documents in background
          if (userId) {
            const documentTitle = `Boletín Ejecutivo: ${matchedCompany.issuer_name}`;
            supabaseClient
              .from("user_documents")
              .insert({
                user_id: userId,
                document_type: "bulletin",
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
                  generatedAt: new Date().toISOString(),
                },
              })
              .then(() => console.log(`${logPrefix} Document saved`))
              .catch((e: Error) => console.warn("Failed to save document:", e));
          }

          // Generate suggested questions
          const suggestedQuestions = [
            `Genera un boletín de ${competitors[0]?.issuer_name || "otra empresa"}`,
            `¿Cómo se compara ${matchedCompany.issuer_name} con el sector ${matchedCompany.sector_category}?`,
            `Top 5 empresas del sector ${matchedCompany.sector_category}`,
          ];

          // Calculate divergence for methodology metadata
          const modelScores =
            rixData?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)?.map((r) => r["09_rix_score"]) ||
            [];
          const maxScore = modelScores.length > 0 ? Math.max(...modelScores) : 0;
          const minScore = modelScores.length > 0 ? Math.min(...modelScores) : 0;
          const divergencePoints = maxScore - minScore;
          const divergenceLevel = divergencePoints <= 8 ? "low" : divergencePoints <= 15 ? "medium" : "high";

          // Extract unique models used
          const modelsUsed = [...new Set(rixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];

          // Extract period info
          const periodFrom = rixData
            ?.map((r) => r["06_period_from"])
            .filter(Boolean)
            .sort()[0];
          const periodTo = rixData
            ?.map((r) => r["07_period_to"])
            .filter(Boolean)
            .sort()
            .reverse()[0];

          // Extract verified sources from raw AI responses (only ChatGPT + Perplexity)
          const verifiedSources = extractSourcesFromRixData(rixData || []);
          console.log(`${logPrefix} Extracted ${verifiedSources.length} verified sources from RIX data`);

          // Send final done event with enriched methodology metadata
          controller.enqueue(
            sseEncoder({
              type: "done",
              suggestedQuestions,
              metadata: {
                type: "bulletin",
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
              },
            }),
          );

          controller.close();
        } catch (error) {
          console.error(`${logPrefix} Streaming error:`, error);
          controller.enqueue(
            sseEncoder({
              type: "error",
              error: error instanceof Error ? error.message : "Error de streaming desconocido",
            }),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // =========================================================================
  // NON-STREAMING MODE: Original behavior (for backwards compatibility)
  // =========================================================================
  const bulletinModel = isQuickBulletin ? "gpt-4o-mini" : "o3";

  const result = await callAIWithFallback(
    bulletinMessages,
    bulletinModel,
    bulletinMaxTokens,
    logPrefix,
    bulletinTimeoutMs,
    isQuickBulletin ? { preferGemini: true, geminiTimeout: bulletinTimeoutMs } : { geminiTimeout: bulletinTimeoutMs },
  );
  const bulletinContent = result.content;

  console.log(`${logPrefix} Bulletin generated (via ${result.provider}), length: ${bulletinContent.length}`);

  // Log API usage
  await logApiUsage({
    supabaseClient,
    edgeFunction: "chat-intelligence",
    provider: result.provider,
    model: result.model,
    actionType: "bulletin",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    userId,
    sessionId,
    metadata: {
      companyName: matchedCompany.issuer_name,
      ticker: matchedCompany.ticker,
      depth_level: "bulletin",
    },
  });

  // 8. Save to database (chat_intelligence_sessions)
  if (sessionId) {
    await supabaseClient.from("chat_intelligence_sessions").insert([
      {
        session_id: sessionId,
        role: "user",
        content: originalQuestion,
        company: matchedCompany.ticker,
        analysis_type: "bulletin",
        user_id: userId,
      },
      {
        session_id: sessionId,
        role: "assistant",
        content: bulletinContent,
        company: matchedCompany.ticker,
        analysis_type: "bulletin",
        structured_data_found: rixData?.length || 0,
        user_id: userId,
      },
    ]);
  }

  // 8b. Save bulletin to user_documents for authenticated users
  if (userId) {
    const documentTitle = `Boletín Ejecutivo: ${matchedCompany.issuer_name}`;
    console.log(`${logPrefix} Saving bulletin to user_documents for user: ${userId}`);

    const { error: docError } = await supabaseClient.from("user_documents").insert({
      user_id: userId,
      document_type: "bulletin",
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
        generatedAt: new Date().toISOString(),
      },
    });

    if (docError) {
      console.error(`${logPrefix} Error saving bulletin to user_documents:`, docError);
    } else {
      console.log(`${logPrefix} Bulletin saved to user_documents successfully`);
    }
  }

  // 9. Return bulletin response
  const suggestedQuestions = [
    `Genera un boletín de ${competitors[0]?.issuer_name || "otra empresa"}`,
    `¿Cómo se compara ${matchedCompany.issuer_name} con el sector ${matchedCompany.sector_category}?`,
    `Top 5 empresas del sector ${matchedCompany.sector_category}`,
  ];

  return new Response(
    JSON.stringify({
      answer: bulletinContent,
      suggestedQuestions,
      metadata: {
        type: "bulletin",
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
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

  const normalizedQuestion = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove accents

  const detectedCompanies: any[] = [];

  for (const company of companiesCache) {
    const companyName =
      company.issuer_name
        ?.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") || "";
    const ticker = company.ticker?.toLowerCase() || "";

    // Full name match
    if (companyName && normalizedQuestion.includes(companyName)) {
      detectedCompanies.push(company);
      continue;
    }

    // Ticker match (only if ticker is at least 2 chars and appears as a word)
    if (ticker && ticker.length >= 2) {
      const tickerRegex = new RegExp(`\\b${ticker}\\b`, "i");
      if (tickerRegex.test(normalizedQuestion)) {
        detectedCompanies.push(company);
        continue;
      }
    }

    // Partial name match (significant words > 4 chars, avoiding common words)
    const commonWords = [
      "banco",
      "grupo",
      "empresa",
      "compañia",
      "sociedad",
      "holding",
      "spain",
      "españa",
      "corp",
      "corporation",
    ];
    const nameWords = companyName.split(/\s+/).filter((word) => word.length > 4 && !commonWords.includes(word));

    for (const word of nameWords) {
      if (normalizedQuestion.includes(word)) {
        detectedCompanies.push(company);
        break;
      }
    }

    // Check include_terms aliases (e.g. "Acciona Energia" without accent)
    if (!detectedCompanies.includes(company) && company.include_terms) {
      try {
        const terms = Array.isArray(company.include_terms) ? company.include_terms : JSON.parse(company.include_terms);
        for (const term of terms) {
          const normalizedTerm = (term as string)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          if (normalizedTerm.length > 3 && normalizedQuestion.includes(normalizedTerm)) {
            detectedCompanies.push(company);
            break;
          }
        }
      } catch (_) {
        /* ignore parse errors */
      }
    }
  }

  // Deduplicate
  return [...new Map(detectedCompanies.map((c) => [c.ticker, c])).values()];
}

async function handleStandardChat(
  question: string,
  conversationHistory: any[],
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  language: string = "es",
  languageName: string = "Español",
  depthLevel: "quick" | "complete" | "exhaustive" = "complete",
  roleId?: string,
  roleName?: string,
  rolePrompt?: string,
  streamMode: boolean = false,
) {
  console.log(`${logPrefix} Depth level: ${depthLevel}, Role: ${roleName || "General"}`);
  // =============================================================================
  // =============================================================================
  // PASO 0: DETECTAR EMPRESAS MENCIONADAS EN LA PREGUNTA
  // =============================================================================
  const detectedCompanies = detectCompaniesInQuestion(question, companiesCache || []);
  console.log(
    `${logPrefix} Detected companies in question: ${detectedCompanies.map((c) => c.issuer_name).join(", ") || "none"}`,
  );

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
    confidence_level: "VERIFIED" | "RECENT" | "HISTORICAL" | "STALE";
  }

  const corporateMementos: CorporateMemento[] = [];

  if (detectedCompanies.length > 0) {
    const tickers = detectedCompanies.map((c) => c.ticker);
    console.log(`${logPrefix} Loading corporate snapshots for: ${tickers.join(", ")}`);

    const { data: corporateData, error: corporateError } = await supabaseClient
      .from("corporate_snapshots")
      .select(
        "ticker, ceo_name, president_name, chairman_name, headquarters_city, company_description, snapshot_date_only",
      )
      .in("ticker", tickers)
      .order("snapshot_date_only", { ascending: false });

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
        let confidenceLevel: CorporateMemento["confidence_level"];
        if (daysOld <= 7) {
          confidenceLevel = "VERIFIED";
        } else if (daysOld <= 30) {
          confidenceLevel = "RECENT";
        } else if (daysOld <= 90) {
          confidenceLevel = "HISTORICAL";
        } else {
          confidenceLevel = "STALE";
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
          confidence_level: confidenceLevel,
        });
      });

      console.log(
        `${logPrefix} Loaded ${corporateMementos.length} corporate mementos with confidence levels: ${corporateMementos.map((m) => `${m.ticker}:${m.confidence_level}`).join(", ")}`,
      );
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
    relation: "ORIGIN" | "COMPITE_CON" | "MISMO_SUBSECTOR" | "MISMO_SECTOR";
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
  let graphContextString = "";

  // Always expand graph when companies are detected (always exhaustive)
  const shouldExpandGraph = detectedCompanies.length > 0;

  if (shouldExpandGraph) {
    console.log(
      `${logPrefix} GRAPH EXPANSION: Traversing knowledge graph for ${detectedCompanies
        .slice(0, 3)
        .map((c) => c.ticker)
        .join(", ")}...`,
    );

    try {
      // Expand graph for up to 3 detected companies (parallel calls)
      const graphPromises = detectedCompanies.slice(0, 3).map(async (company) => {
        const { data, error } = await supabaseClient.rpc("expand_entity_graph_with_scores", {
          p_ticker: company.ticker,
          p_depth: 2,
          p_weeks: 4,
        });

        if (error) {
          console.warn(`${logPrefix} Graph expansion error for ${company.ticker}:`, error.message);
          return null;
        }

        return data as GraphExpansionResult;
      });

      const results = await Promise.all(graphPromises);
      entityGraphs = results.filter((r): r is GraphExpansionResult => r !== null);

      console.log(
        `${logPrefix} Graph expansion complete: ${entityGraphs.length} graphs, ${entityGraphs.reduce((sum, g) => sum + (g.metadata?.total_entities || 0), 0)} total entities`,
      );

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
      sections.push(`- Sector: ${primary.sector || "N/A"}`);
      sections.push(`- Subsector: ${primary.subsector || "N/A"}`);
      if (primaryScore) {
        sections.push(
          `- RIX Promedio: ${primaryScore.avg_rix} pts (rango: ${primaryScore.min_rix}-${primaryScore.max_rix})`,
        );
        sections.push(`- Modelos analizados: ${primaryScore.models?.join(", ") || "N/A"}`);
      }

      // Verified competitors (COMPITE_CON)
      const competitors = graph.graph.filter((e) => e.relation === "COMPITE_CON");
      if (competitors.length > 0) {
        sections.push(`\n### COMPETIDORES VERIFICADOS (COMPITE_CON - Alta confianza):`);
        for (const comp of competitors) {
          const compScore = graph.entity_scores?.[comp.ticker];
          const delta = compScore && primaryScore ? (compScore.avg_rix - primaryScore.avg_rix).toFixed(1) : null;
          const deltaStr = delta ? ` (${parseFloat(delta) >= 0 ? "+" : ""}${delta} vs primaria)` : "";
          sections.push(`- ${comp.name} (${comp.ticker}): RIX ${compScore?.avg_rix || "N/A"}${deltaStr}`);
        }
      }

      // Same subsector peers
      const subsectorPeers = graph.graph.filter((e) => e.relation === "MISMO_SUBSECTOR");
      if (subsectorPeers.length > 0) {
        sections.push(`\n### MISMO SUBSECTOR (${primary.subsector}):`);
        for (const peer of subsectorPeers.slice(0, 8)) {
          const peerScore = graph.entity_scores?.[peer.ticker];
          sections.push(`- ${peer.name} (${peer.ticker}): RIX ${peerScore?.avg_rix || "N/A"}`);
        }
      }

      // Sector-level aggregates
      const allEntityScores = Object.entries(graph.entity_scores || {})
        .filter(([ticker]) => ticker !== primary.ticker)
        .map(([ticker, score]) => ({ ticker, ...score }))
        .filter((e) => e.avg_rix);

      if (allEntityScores.length > 0) {
        const avgSectorRix =
          Math.round((allEntityScores.reduce((sum, e) => sum + e.avg_rix, 0) / allEntityScores.length) * 10) / 10;
        const sortedByRix = [...allEntityScores].sort((a, b) => b.avg_rix - a.avg_rix);
        const topPerformer = sortedByRix[0];
        const bottomPerformer = sortedByRix[sortedByRix.length - 1];

        sections.push(`\n### CONTEXTO SECTORIAL:`);
        sections.push(`- RIX promedio del sector: ${avgSectorRix}`);
        if (primaryScore) {
          const diff = (primaryScore.avg_rix - avgSectorRix).toFixed(1);
          const comparison = parseFloat(diff) >= 0 ? "por encima" : "por debajo";
          sections.push(
            `- ${primary.name} está ${Math.abs(parseFloat(diff))} pts ${comparison} del promedio sectorial`,
          );
        }
        if (topPerformer) {
          const topName = graph.graph.find((e) => e.ticker === topPerformer.ticker)?.name || topPerformer.ticker;
          sections.push(`- Líder sectorial: ${topName} (RIX ${topPerformer.avg_rix})`);
        }
        if (bottomPerformer && bottomPerformer.ticker !== topPerformer?.ticker) {
          const bottomName =
            graph.graph.find((e) => e.ticker === bottomPerformer.ticker)?.name || bottomPerformer.ticker;
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

    return sections.join("\n");
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
    const tickers = detectedCompanies.map((c) => c.ticker);

    const { data: newsData, error: newsError } = await supabaseClient
      .from("corporate_news")
      .select("ticker, headline, published_date")
      .in("ticker", tickers)
      .order("published_date", { ascending: false })
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
          is_recent: isRecent,
        });
      });

      console.log(
        `${logPrefix} Loaded ${corporateNews.length} corporate news items (${corporateNews.filter((n) => n.is_recent).length} recent)`,
      );
    }
  }

  // =============================================================================
  // PASO 1: EXTRAER KEYWORDS RELEVANTES DE LA PREGUNTA
  // =============================================================================
  const stopWords = new Set([
    "de",
    "la",
    "el",
    "en",
    "que",
    "es",
    "y",
    "a",
    "los",
    "las",
    "un",
    "una",
    "por",
    "con",
    "para",
    "del",
    "al",
    "se",
    "su",
    "como",
    "más",
    "pero",
    "sus",
    "le",
    "ya",
    "o",
    "este",
    "sí",
    "porque",
    "esta",
    "entre",
    "cuando",
    "muy",
    "sin",
    "sobre",
    "también",
    "me",
    "hasta",
    "hay",
    "donde",
    "quien",
    "desde",
    "todo",
    "nos",
    "durante",
    "todos",
    "uno",
    "les",
    "ni",
    "contra",
    "otros",
    "ese",
    "eso",
    "ante",
    "ellos",
    "e",
    "esto",
    "mí",
    "antes",
    "algunos",
    "qué",
    "unos",
    "yo",
    "otro",
    "otras",
    "otra",
    "él",
    "tanto",
    "esa",
    "estos",
    "mucho",
    "quienes",
    "nada",
    "muchos",
    "cual",
    "poco",
    "ella",
    "estar",
    "estas",
    "algunas",
    "algo",
    "nosotros",
    "mi",
    "mis",
    "tú",
    "te",
    "ti",
    "tu",
    "tus",
    "ellas",
    "nosotras",
    "vosotros",
    "vosotras",
    "os",
    "mío",
    "mía",
    "míos",
    "mías",
    "tuyo",
    "tuya",
    "tuyos",
    "tuyas",
    "suyo",
    "suya",
    "suyos",
    "suyas",
    "nuestro",
    "nuestra",
    "nuestros",
    "nuestras",
    "vuestro",
    "vuestra",
    "vuestros",
    "vuestras",
    "esos",
    "esas",
    "estoy",
    "estás",
    "está",
    "estamos",
    "estáis",
    "están",
    "esté",
    "estés",
    "estemos",
    "estéis",
    "estén",
    "estaré",
    "estarás",
    "estará",
    "estaremos",
    "estaréis",
    "estarán",
    "estaría",
    "estarías",
    "estaríamos",
    "estaríais",
    "estarían",
    "estaba",
    "estabas",
    "estábamos",
    "estabais",
    "estaban",
    "estuve",
    "estuviste",
    "estuvo",
    "estuvimos",
    "estuvisteis",
    "estuvieron",
    "estuviera",
    "estuvieras",
    "estuviéramos",
    "estuvierais",
    "estuvieran",
    "estuviese",
    "estuvieses",
    "estuviésemos",
    "estuvieseis",
    "estuviesen",
    "estando",
    "estado",
    "estada",
    "estados",
    "estadas",
    "estad",
    "he",
    "has",
    "ha",
    "hemos",
    "habéis",
    "han",
    "haya",
    "hayas",
    "hayamos",
    "hayáis",
    "hayan",
    "habré",
    "habrás",
    "habrá",
    "habremos",
    "habréis",
    "habrán",
    "habría",
    "habrías",
    "habríamos",
    "habríais",
    "habrían",
    "había",
    "habías",
    "habíamos",
    "habíais",
    "habían",
    "hube",
    "hubiste",
    "hubo",
    "hubimos",
    "hubisteis",
    "hubieron",
    "hubiera",
    "hubieras",
    "hubiéramos",
    "hubierais",
    "hubieran",
    "hubiese",
    "hubieses",
    "hubiésemos",
    "hubieseis",
    "hubiesen",
    "habiendo",
    "habido",
    "habida",
    "habidos",
    "habidas",
    "soy",
    "eres",
    "somos",
    "sois",
    "son",
    "sea",
    "seas",
    "seamos",
    "seáis",
    "sean",
    "seré",
    "serás",
    "será",
    "seremos",
    "seréis",
    "serán",
    "sería",
    "serías",
    "seríamos",
    "seríais",
    "serían",
    "era",
    "eras",
    "éramos",
    "erais",
    "eran",
    "fui",
    "fuiste",
    "fue",
    "fuimos",
    "fuisteis",
    "fueron",
    "fuera",
    "fueras",
    "fuéramos",
    "fuerais",
    "fueran",
    "fuese",
    "fueses",
    "fuésemos",
    "fueseis",
    "fuesen",
    "siendo",
    "sido",
    "tengo",
    "tienes",
    "tiene",
    "tenemos",
    "tenéis",
    "tienen",
    "tenga",
    "tengas",
    "tengamos",
    "tengáis",
    "tengan",
    "tendré",
    "tendrás",
    "tendrá",
    "tendremos",
    "tendréis",
    "tendrán",
    "tendría",
    "tendrías",
    "tendríamos",
    "tendríais",
    "tendrían",
    "tenía",
    "tenías",
    "teníamos",
    "teníais",
    "tenían",
    "tuve",
    "tuviste",
    "tuvo",
    "tuvimos",
    "tuvisteis",
    "tuvieron",
    "tuviera",
    "tuvieras",
    "tuviéramos",
    "tuvierais",
    "tuvieran",
    "tuviese",
    "tuvieses",
    "tuviésemos",
    "tuvieseis",
    "tuviesen",
    "teniendo",
    "tenido",
    "tenida",
    "tenidos",
    "tenidas",
    "tened",
    "dime",
    "dame",
    "cuál",
    "cuáles",
    "cuánto",
    "cuánta",
    "cuántos",
    "cuántas",
    "cómo",
    "dónde",
    "cuándo",
    "quién",
    "qué",
    "todas",
    "empresa",
    "empresas",
    "cualquier",
    "alguna",
    "alguno",
  ]);

  // Extract meaningful keywords from question
  const questionKeywords = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  console.log(`${logPrefix} Extracted keywords: ${questionKeywords.slice(0, 10).join(", ")}`);

  // =============================================================================
  // PASO 2: BÚSQUEDA FULL-TEXT EN TODA LA BASE DE DATOS
  // =============================================================================
  console.log(`${logPrefix} Performing FULL DATABASE SEARCH across all text fields...`);

  let fullTextSearchResults: any[] = [];
  const searchableKeywords = questionKeywords.filter((k) => k.length > 3).slice(0, 5);

  if (searchableKeywords.length > 0) {
    for (const keyword of searchableKeywords) {
      const searchPattern = `%${keyword}%`;

      // BÚSQUEDA EXHAUSTIVA en TODOS los campos de texto de TODA la base de datos
      const { data: textResults, error: textError } = await supabaseClient
        .from("rix_runs")
        .select(
          `
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
        `,
        )
        .or(
          `"10_resumen".ilike.${searchPattern},"20_res_gpt_bruto".ilike.${searchPattern},"21_res_perplex_bruto".ilike.${searchPattern},"22_res_gemini_bruto".ilike.${searchPattern},"23_res_deepseek_bruto".ilike.${searchPattern},"22_explicacion".ilike.${searchPattern}`,
        )
        .limit(5000); // SIN LÍMITE: capturar ABSOLUTAMENTE TODO

      if (textError) {
        console.error(`${logPrefix} Error in full-text search for "${keyword}":`, textError);
      } else if (textResults && textResults.length > 0) {
        console.log(`${logPrefix} Found ${textResults.length} records mentioning "${keyword}"`);
        fullTextSearchResults.push(...textResults.map((r) => ({ ...r, matchedKeyword: keyword })));
      }
    }

    // Deduplicate
    const seen = new Set();
    fullTextSearchResults = fullTextSearchResults.filter((r) => {
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
      respuesta_bruto_grok,
      respuesta_bruto_qwen,
      batch_execution_date
    `;

    for (const company of detectedCompanies.slice(0, 8)) {
      const companyFullData = await fetchUnifiedRixData({
        supabaseClient,
        columns: fullDataColumns,
        tickerFilter: company.ticker,
        limit: 120, // 6 models × 20 weeks - margen generoso para no truncar
        logPrefix,
      });

      console.log(`${logPrefix} Loaded ${companyFullData.length} full records for ${company.issuer_name}`);
      detectedCompanyFullData.push(...companyFullData);
    }
  }

  // =============================================================================
  // PASO 4: GENERAR EMBEDDING Y VECTOR SEARCH (complementario)
  // =============================================================================
  console.log(`${logPrefix} Generating embedding for vector search...`);
  const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAIApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: question,
    }),
  });

  if (!embeddingResponse.ok) {
    throw new Error(`Embedding API error: ${embeddingResponse.statusText}`);
  }

  const embeddingData = await embeddingResponse.json();
  const embedding = embeddingData.data[0].embedding;

  // Vector search - máximo absoluto
  const { data: vectorDocs } = await supabaseClient.rpc("match_documents", {
    query_embedding: embedding,
    match_count: 200, // TODOS los documentos relevantes
    filter: {},
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
      direction: "positive" | "negative" | "none";
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

  // Always load regression (always exhaustive mode)
  const shouldLoadRegression = true;

  if (shouldLoadRegression) {
    console.log(`${logPrefix} LOADING REGRESSION ANALYSIS (always-on for depth=${depthLevel})...`);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

      // Usar timeout corto para no ralentizar mucho
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s max

      const regressionResponse = await fetch(`${supabaseUrl}/functions/v1/rix-regression-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ minWeeks: 6 }), // Menos restrictivo para más datos
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (regressionResponse.ok) {
        regressionAnalysis = await regressionResponse.json();
        console.log(
          `${logPrefix} Regression analysis loaded: ${regressionAnalysis?.dataProfile?.totalRecords || 0} records, ${regressionAnalysis?.dataProfile?.companiesWithPrices || 0} companies with prices`,
        );
      } else {
        console.warn(`${logPrefix} Regression analysis failed: ${regressionResponse.status}`);
      }
    } catch (regError) {
      if (regError.name === "AbortError") {
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
  const rixBatchSize = 3000;
  const maxRixRecords = depthLevel === "exhaustive" ? 10000 : 5000;

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
      offset: rixOffset,
      logPrefix,
    });

    if (!batch || batch.length === 0) break;

    allRixData.push(...batch);
    rixOffset += batch.length;

    if (batch.length < rixBatchSize) break;

    // Always fetch all batches (exhaustive mode)
  }

  console.log(`${logPrefix} Total unified RIX records loaded: ${allRixData?.length || 0} (depth: ${depthLevel})`);

  // =============================================================================
  // PASO 6: CONSTRUIR CONTEXTO COMPLETO PARA EL LLM
  // =============================================================================
  let context = "";

  // Detección anticipada de intención multi-semana (necesaria antes de sección 6.1)
  const isMultiWeekRequest =
    /\b(evoluci[oó]n|tendencia|hist[oó]rico|[úu]ltimas?\s+\d+\s+semanas?|[úu]ltimo\s+mes|semanas?\s+anteriores?|cronol[oó]gic|progres[oió]n|mes\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|\d+\s+semanas?)\b/i.test(
      question,
    );
  const requestedWeeks = (() => {
    const m = question.match(/[úu]ltimas?\s+(\d+)\s+semanas?/i) || question.match(/(\d+)\s+semanas?/i);
    return m ? Math.min(parseInt(m[1]), 5) : 4;
  })();

  // 6.0-REGRESSION: ANÁLISIS ESTADÍSTICO REAL (siempre disponible para complete/exhaustive)
  // Este contexto permite al LLM usar datos de tendencias y correlaciones precio-métrica
  if (regressionAnalysis && regressionAnalysis.success) {
    context += `📊 ======================================================================\n`;
    context += `📊 CONTEXTO ESTADÍSTICO: CORRELACIONES MÉTRICAS RIX ↔ PRECIO\n`;
    context += `📊 (Usa estos datos para enriquecer análisis de tendencias y valoración)\n`;
    context += `📊 ======================================================================\n\n`;

    context += `### Perfil de Datos Analizados:\n`;
    context += `- **Total registros**: ${regressionAnalysis.dataProfile?.totalRecords.toLocaleString() || "N/A"}\n`;
    context += `- **Empresas con precios**: ${regressionAnalysis.dataProfile?.companiesWithPrices || "N/A"}\n`;
    context += `- **Semanas analizadas**: ${regressionAnalysis.dataProfile?.weeksAnalyzed || "N/A"}\n`;
    context += `- **Rango temporal**: ${regressionAnalysis.dataProfile?.dateRange?.from || "N/A"} a ${regressionAnalysis.dataProfile?.dateRange?.to || "N/A"}\n`;
    context += `- **Modelos IA incluidos**: ${regressionAnalysis.dataProfile?.modelsIncluded?.join(", ") || "N/A"}\n\n`;

    context += `### Métricas TOP Predictoras (estadísticamente significativas):\n`;
    if (regressionAnalysis.topPredictors && regressionAnalysis.topPredictors.length > 0) {
      context += `| Métrica | Nombre | Correlación | Interpretación |\n`;
      context += `|---------|--------|-------------|----------------|\n`;
      regressionAnalysis.topPredictors.forEach((p) => {
        const interp =
          p.correlation > 0
            ? `Mayor ${p.displayName} → precio tiende a subir`
            : `Mayor ${p.displayName} → precio tiende a bajar`;
        context += `| ${p.metric.replace(/^\d+_/, "")} | ${p.displayName} | ${p.correlation > 0 ? "+" : ""}${p.correlation.toFixed(3)} | ${interp} |\n`;
      });
    } else {
      context += `No se encontraron métricas con correlación estadísticamente significativa con el precio.\n`;
    }
    context += `\n`;

    context += `### Análisis Completo por Métrica:\n`;
    if (regressionAnalysis.metricAnalysis && regressionAnalysis.metricAnalysis.length > 0) {
      context += `| Métrica | Correlación | p-value | Significativo | Dirección | Muestra |\n`;
      context += `|---------|-------------|---------|---------------|-----------|--------|\n`;
      regressionAnalysis.metricAnalysis.forEach((m) => {
        const sigSymbol = m.isSignificant ? "✓" : "✗";
        const dirSymbol = m.direction === "positive" ? "↗" : m.direction === "negative" ? "↘" : "→";
        context += `| ${m.displayName} | ${m.correlationWithPrice > 0 ? "+" : ""}${m.correlationWithPrice.toFixed(3)} | ${m.pValue.toFixed(3)} | ${sigSymbol} | ${dirSymbol} | n=${m.sampleSize} |\n`;
      });
    }
    context += `\n`;

    context += `### Calidad del Modelo:\n`;
    context += `- **R² (varianza explicada)**: ${((regressionAnalysis.rSquared || 0) * 100).toFixed(1)}%\n`;
    context += `- **R² ajustado**: ${((regressionAnalysis.adjustedRSquared || 0) * 100).toFixed(1)}%\n\n`;

    context += `### Metodología:\n`;
    context += `${regressionAnalysis.methodology || "Correlación de Pearson entre métricas RIX y variación de precio semanal."}\n\n`;

    context += `### ⚠️ Limitaciones y Caveats:\n`;
    if (regressionAnalysis.caveats) {
      regressionAnalysis.caveats.forEach((c) => {
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
    context += "\n";
  }

  // 6.0-A MEMENTO CORPORATIVO - DATOS VERIFICADOS (PRIORIDAD MÁXIMA)
  if (corporateMementos.length > 0) {
    context += `🏛️ ======================================================================\n`;
    context += `🏛️ MEMENTO CORPORATIVO - DATOS VERIFICADOS CON FECHA\n`;
    context += `🏛️ IMPORTANTE: Usa estos datos para responder preguntas sobre liderazgo y datos corporativos\n`;
    context += `🏛️ ======================================================================\n\n`;

    corporateMementos.forEach((memento) => {
      const company = detectedCompanies.find((c) => c.ticker === memento.ticker);
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
        if (memento.confidence_level === "VERIFIED") {
          context += `✅ *Datos verificados (< 7 días) - Puedes hacer afirmaciones directas mencionando la fecha*\n`;
        } else if (memento.confidence_level === "RECENT") {
          context += `⚠️ *Datos recientes (7-30 días) - Menciona la fecha y sugiere verificar si es crítico*\n`;
        } else if (memento.confidence_level === "HISTORICAL") {
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
        context += `📝 **Descripción**: ${memento.company_description.substring(0, 300)}${memento.company_description.length > 300 ? "..." : ""}\n`;
      }
      context += `\n---\n\n`;
    });
  }

  // 6.0-B NOTICIAS CORPORATIVAS RECIENTES
  if (corporateNews.length > 0) {
    const recentNews = corporateNews.filter((n) => n.is_recent);
    const olderNews = corporateNews.filter((n) => !n.is_recent);

    context += `📰 ======================================================================\n`;
    context += `📰 NOTICIAS CORPORATIVAS (de portales oficiales de las empresas)\n`;
    context += `📰 ======================================================================\n\n`;

    if (recentNews.length > 0) {
      context += `### 🆕 Noticias Recientes (últimos 14 días):\n`;
      recentNews.slice(0, 10).forEach((news) => {
        const company = detectedCompanies.find((c) => c.ticker === news.ticker);
        context += `- **${company?.issuer_name || news.ticker}** (${news.published_date || "sin fecha"}): ${news.headline}\n`;
      });
      context += `\n`;
    }

    if (olderNews.length > 0) {
      context += `### 📅 Noticias Anteriores:\n`;
      olderNews.slice(0, 5).forEach((news) => {
        const company = detectedCompanies.find((c) => c.ticker === news.ticker);
        context += `- **${company?.issuer_name || news.ticker}** (${news.published_date || "sin fecha"}): ${news.headline}\n`;
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
    fullTextSearchResults.forEach((r) => {
      const kw = r.matchedKeyword || "general";
      if (!byKeyword.has(kw)) byKeyword.set(kw, []);
      byKeyword.get(kw)!.push(r);
    });

    for (const [keyword, results] of byKeyword) {
      context += `## 📰 Resultados para "${keyword.toUpperCase()}" (${results.length} registros):\n\n`;
      context += `| Empresa | Ticker | Modelo IA | Período | RIX |\n`;
      context += `|---------|--------|-----------|---------|-----|\n`;

      results.slice(0, 20).forEach((r) => {
        const rix = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
        context += `| ${r["03_target_name"]} | ${r["05_ticker"]} | ${r["02_model_name"]} | ${r["06_period_from"]} a ${r["07_period_to"]} | ${rix} |\n`;
      });

      // Include text excerpts - más extensos para contexto ejecutivo
      context += `\n### Extractos relevantes (fuentes originales de IA):\n`;
      results.slice(0, 8).forEach((r, idx) => {
        const fields = [
          { name: "ChatGPT", value: r["20_res_gpt_bruto"] },
          { name: "Perplexity", value: r["21_res_perplex_bruto"] },
          { name: "Gemini", value: r["22_res_gemini_bruto"] },
          { name: "DeepSeek", value: r["23_res_deepseek_bruto"] },
          { name: "Grok", value: r["respuesta_bruto_grok"] },
          { name: "Qwen", value: r["respuesta_bruto_qwen"] },
          { name: "Explicación", value: r["22_explicacion"] },
          { name: "Resumen", value: r["10_resumen"] },
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
      context += "\n";
    }
    context += "\n";
  }

  // 6.1 DATOS COMPLETOS DE EMPRESAS DETECTADAS (con textos brutos)
  if (detectedCompanyFullData.length > 0) {
    context += `\n🏢 ======================================================================\n`;
    context += `🏢 DATOS COMPLETOS DE EMPRESAS MENCIONADAS (INCLUYE TEXTOS ORIGINALES)\n`;
    context += `🏢 ======================================================================\n\n`;

    // Group by company
    const byCompany = new Map<string, any[]>();
    detectedCompanyFullData.forEach((r) => {
      const company = r["03_target_name"];
      if (!byCompany.has(company)) byCompany.set(company, []);
      byCompany.get(company)!.push(r);
    });

    // Determine primary company (the one the user is asking about)
    const primaryCompanyTicker = detectedCompanies.length > 0 ? detectedCompanies[0].ticker : null;

    for (const [companyName, records] of byCompany) {
      const company = detectedCompanies.find((c) => c.issuer_name === companyName);
      const isPrimaryCompany = company?.ticker === primaryCompanyTicker;
      context += `## 📊 ${companyName.toUpperCase()} (${records[0]["05_ticker"]})\n`;
      if (company) {
        context += `Sector: ${company.sector_category || "N/A"} | IBEX: ${company.ibex_family_code || "N/A"} | Cotiza: ${company.cotiza_en_bolsa ? "Sí" : "No"}\n\n`;
      }

      // Determinar qué fechas mostrar según si es multi-semana o no
      const sortedDates = [
        ...new Set(records.map((r: any) => r.batch_execution_date?.toString().split("T")[0]).filter(Boolean)),
      ]
        .sort()
        .reverse();
      const latestDate = sortedDates[0] || null;

      // Si es multi-semana: incluir N semanas. Si no: solo la más reciente.
      const datesToShow = isMultiWeekRequest
        ? sortedDates.slice(0, requestedWeeks)
        : ([latestDate].filter(Boolean) as string[]);

      const recordsToShow = records
        .filter((r: any) => datesToShow.includes(r.batch_execution_date?.toString().split("T")[0]))
        .sort((a: any, b: any) => {
          const dateDiff = (b.batch_execution_date?.toString() || "").localeCompare(
            a.batch_execution_date?.toString() || "",
          );
          return dateDiff !== 0 ? dateDiff : (a["02_model_name"] || "").localeCompare(b["02_model_name"] || "");
        });

      if (isMultiWeekRequest) {
        // Multi-semana: tabla agrupada por fecha para mostrar evolución cronológica
        context += `### Evolución por semana (${datesToShow.length} snapshots, ${requestedWeeks} semanas solicitadas):\n`;
        datesToShow.forEach((date, weekIdx) => {
          const weekRecords = recordsToShow.filter(
            (r: any) => r.batch_execution_date?.toString().split("T")[0] === date,
          );
          const avgRix =
            weekRecords.length > 0
              ? (
                  weekRecords.reduce(
                    (s: number, r: any) => s + (r["51_rix_score_adjusted"] ?? r["09_rix_score"] ?? 0),
                    0,
                  ) / weekRecords.length
                ).toFixed(1)
              : "N/A";
          context += `\n**📅 Semana ${weekIdx + 1}${weekIdx === 0 ? " (MÁS RECIENTE)" : ""}: ${date}** — promedio RIX: ${avgRix}\n`;
          context += `| Modelo | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |\n`;
          context += `|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|\n`;
          weekRecords.forEach((r: any) => {
            const rix = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
            context += `| ${r["02_model_name"]} | ${rix ?? "-"} | ${r["23_nvm_score"] ?? "-"} | ${r["26_drm_score"] ?? "-"} | ${r["29_sim_score"] ?? "-"} | ${r["32_rmm_score"] ?? "-"} | ${r["35_cem_score"] ?? "-"} | ${r["38_gam_score"] ?? "-"} | ${r["41_dcm_score"] ?? "-"} | ${r["44_cxm_score"] ?? "-"} |\n`;
          });
        });
        // Para multi-semana: incluir textos brutos solo del snapshot más reciente (evitar contexto enorme)
        const latestWeekRecords = recordsToShow.filter(
          (r: any) => r.batch_execution_date?.toString().split("T")[0] === datesToShow[0],
        );
        context += `\n### Análisis narrativo (semana más reciente: ${datesToShow[0]}):\n`;
        latestWeekRecords.forEach((r: any) => {
          context += `\n**${r["02_model_name"]}** (${r["06_period_from"]} a ${r["07_period_to"]}):\n`;
          if (r["10_resumen"]) {
            context += `- **Resumen**: ${r["10_resumen"].substring(0, isPrimaryCompany ? 1500 : 500)}...\n`;
          }
          const modelResponseMap: Record<string, string> = {
            ChatGPT: "20_res_gpt_bruto",
            Perplexity: "21_res_perplex_bruto",
            "Google Gemini": "22_res_gemini_bruto",
            Gemini: "22_res_gemini_bruto",
            Deepseek: "23_res_deepseek_bruto",
            DeepSeek: "23_res_deepseek_bruto",
            Grok: "respuesta_bruto_grok",
            Qwen: "respuesta_bruto_qwen",
          };
          const rawFieldKey = modelResponseMap[r["02_model_name"]] || null;
          const rawField = rawFieldKey ? r[rawFieldKey] : null;
          if (rawField) {
            context += `- **Texto original (extracto)**: ${rawField.substring(0, isPrimaryCompany ? 2500 : 600)}...\n`;
          }
          // Inject explanations for primary company
          if (isPrimaryCompany) {
            if (r["22_explicacion"]) {
              context += `- **Explicación del análisis**: ${r["22_explicacion"].substring(0, 2000)}\n`;
            }
            if (r["25_explicaciones_detalladas"]) {
              const detalladas =
                typeof r["25_explicaciones_detalladas"] === "string"
                  ? r["25_explicaciones_detalladas"]
                  : JSON.stringify(r["25_explicaciones_detalladas"]);
              context += `- **Desglose dimensional**: ${detalladas.substring(0, 2000)}\n`;
            }
          }
        });
      } else {
        // Caso normal (una sola semana): tabla de scores + textos completos
        const singleWeekRecords = recordsToShow.filter(
          (r: any) => r.batch_execution_date?.toString().split("T")[0] === latestDate,
        );
        context += `### Scores por Modelo IA (snapshot: ${latestDate || "más reciente"}, ${singleWeekRecords.length} modelos):\n`;
        context += `| Modelo | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |\n`;
        context += `|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|\n`;
        singleWeekRecords.forEach((r: any) => {
          const rix = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
          context += `| ${r["02_model_name"]} | ${rix ?? "-"} | ${r["23_nvm_score"] ?? "-"} | ${r["26_drm_score"] ?? "-"} | ${r["29_sim_score"] ?? "-"} | ${r["32_rmm_score"] ?? "-"} | ${r["35_cem_score"] ?? "-"} | ${r["38_gam_score"] ?? "-"} | ${r["41_dcm_score"] ?? "-"} | ${r["44_cxm_score"] ?? "-"} |\n`;
          // Inject category interpretation row for primary company
          if (isPrimaryCompany) {
            context += `| _(${r["02_model_name"]} interp.)_ | | ${r["25_nvm_categoria"] || "-"} | ${r["28_drm_categoria"] || "-"} | ${r["31_sim_categoria"] || "-"} | ${r["34_rmm_categoria"] || "-"} | ${r["37_cem_categoria"] || "-"} | ${r["40_gam_categoria"] || "-"} | ${r["43_dcm_categoria"] || "-"} | ${r["46_cxm_categoria"] || "-"} |\n`;
          }
        });
        context += `\n### Análisis de cada modelo IA:\n`;
        singleWeekRecords.forEach((r: any) => {
          context += `\n**${r["02_model_name"]}** (${r["06_period_from"]} a ${r["07_period_to"]}):\n`;
          if (r["10_resumen"]) {
            context += `- **Resumen**: ${r["10_resumen"].substring(0, isPrimaryCompany ? 1500 : 500)}...\n`;
          }
          const modelResponseMap: Record<string, string> = {
            ChatGPT: "20_res_gpt_bruto",
            Perplexity: "21_res_perplex_bruto",
            "Google Gemini": "22_res_gemini_bruto",
            Gemini: "22_res_gemini_bruto",
            Deepseek: "23_res_deepseek_bruto",
            DeepSeek: "23_res_deepseek_bruto",
            Grok: "respuesta_bruto_grok",
            Qwen: "respuesta_bruto_qwen",
          };
          const rawFieldKey = modelResponseMap[r["02_model_name"]] || null;
          const rawField = rawFieldKey ? r[rawFieldKey] : null;
          if (rawField) {
            context += `- **Texto original (extracto)**: ${rawField.substring(0, isPrimaryCompany ? 3000 : 800)}...\n`;
          }
          // Inject explanations for primary company
          if (isPrimaryCompany) {
            if (r["22_explicacion"]) {
              context += `- **Explicación del análisis**: ${r["22_explicacion"].substring(0, 2000)}\n`;
            }
            if (r["25_explicaciones_detalladas"]) {
              const detalladas =
                typeof r["25_explicaciones_detalladas"] === "string"
                  ? r["25_explicaciones_detalladas"]
                  : JSON.stringify(r["25_explicaciones_detalladas"]);
              context += `- **Desglose dimensional**: ${detalladas.substring(0, 2000)}\n`;
            }
          }
        });
      }
      context += "\n---\n\n";
    }
  }

  // 6.2 Documentos vectoriales (contexto adicional)
  if (vectorDocs && vectorDocs.length > 0) {
    context += `📚 CONTEXTO ADICIONAL DEL VECTOR STORE (${vectorDocs.length} documentos):\n\n`;
    vectorDocs.forEach((doc: any, idx: number) => {
      const metadata = doc.metadata || {};
      context += `[${idx + 1}] ${metadata.company_name || "Sin empresa"} - ${metadata.week || "Sin fecha"}\n`;
      context += `${doc.content?.substring(0, 600) || "Sin contenido"}...\n\n`;
    });
    context += "\n";
  }

  // 6.3 Construir ranking general de la semana actual
  if (allRixData && allRixData.length > 0) {
    // =========================================================================
    // SELECCIÓN CANÓNICA DE SNAPSHOT: Los barridos reales siempre son en DOMINGO.
    // batch_execution_date es la fuente de verdad (no period_from/period_to).
    // Los barridos parciales o de prueba caen en días no dominicales y se ignoran.
    // =========================================================================
    const selectCanonicalPeriod = (
      data: any[],
    ): { canonicalDate: string; previousDate: string | null; sundayDates: string[] } => {
      // Agrupar por batch_execution_date (normalizado a YYYY-MM-DD)
      const groupByBatchDate = new Map<string, any[]>();
      for (const run of data) {
        const rawDate = run.batch_execution_date;
        const batchDate = rawDate ? rawDate.toString().split("T")[0] : null;
        if (!batchDate) continue;
        if (!groupByBatchDate.has(batchDate)) groupByBatchDate.set(batchDate, []);
        groupByBatchDate.get(batchDate)!.push(run);
      }

      const isSunday = (dateStr: string): boolean => {
        // Parse as UTC to avoid timezone day-shift
        const d = new Date(dateStr + "T12:00:00Z");
        return d.getUTCDay() === 0;
      };

      const MIN_RECORDS_SUNDAY = 180; // 30 empresas × 6 modelos = snapshot mínimamente significativo

      // Obtener domingos con suficientes registros, ordenados DESC
      const sundayDates = [...groupByBatchDate.entries()]
        .filter(([date, records]) => isSunday(date) && records.length >= MIN_RECORDS_SUNDAY)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date]) => date);

      if (sundayDates.length > 0) {
        const canonicalDate = sundayDates[0];
        const previousDate = sundayDates[1] ?? null;
        console.log(
          `${logPrefix} 📅 Snapshot canónico: ${canonicalDate} (Domingo ✅, ${groupByBatchDate.get(canonicalDate)?.length} registros). Anterior: ${previousDate ?? "ninguno"}`,
        );
        return { canonicalDate, previousDate, sundayDates };
      }

      // Fallback: usar la fecha con más registros (cubre pruebas o emergencias)
      const fallbackDate = [...groupByBatchDate.entries()].sort(([, a], [, b]) => b.length - a.length)[0]?.[0] ?? null;
      console.warn(
        `${logPrefix} ⚠️ No hay domingos con ≥180 registros. Fallback a fecha con más datos: ${fallbackDate}`,
      );
      return { canonicalDate: fallbackDate!, previousDate: null, sundayDates: [] };
    };

    const { canonicalDate, previousDate, sundayDates } = selectCanonicalPeriod(allRixData);

    // isMultiWeekRequest y requestedWeeks ya definidos al inicio del PASO 6
    if (isMultiWeekRequest) {
      console.log(
        `${logPrefix} 🗓️ Multi-week request detectado: ${requestedWeeks} semanas. Domingos disponibles: ${sundayDates.join(", ")}`,
      );
    }

    let currentWeekData = allRixData.filter((run) => {
      const batchDate = run.batch_execution_date?.toString().split("T")[0];
      return batchDate === canonicalDate;
    });

    const previousWeekData = previousDate
      ? allRixData.filter((run) => run.batch_execution_date?.toString().split("T")[0] === previousDate)
      : [];

    // Diagnóstico de cobertura del snapshot activo
    const modelsInCurrentSnapshot = new Set(currentWeekData.map((r: any) => r["02_model_name"]));
    const snapshotDateObj = new Date(canonicalDate + "T12:00:00Z");
    const isSundaySnapshot = snapshotDateObj.getUTCDay() === 0;
    const tickersInSnapshot = new Set(currentWeekData.map((r: any) => r["05_ticker"]));

    context += `\n📅 SNAPSHOT ACTIVO:\n`;
    context += `- Fecha de ejecución: ${canonicalDate} (${isSundaySnapshot ? "Domingo ✅" : "No es domingo ⚠️ — barrido de prueba o fallback"})\n`;
    context += `- Modelos con datos: ${Array.from(modelsInCurrentSnapshot).join(", ")} (${modelsInCurrentSnapshot.size}/6)\n`;
    context += `- Registros totales: ${currentWeekData.length}\n`;
    context += `- Empresas cubiertas: ${tickersInSnapshot.size}\n`;
    if (previousDate) context += `- Snapshot anterior: ${previousDate}\n`;
    if (modelsInCurrentSnapshot.size < 4) {
      context += `⚠️ AVISO CRÍTICO: Solo ${modelsInCurrentSnapshot.size} modelos disponibles. Este snapshot puede estar incompleto.\n`;
      console.warn(
        `${logPrefix} ⚠️ Solo ${modelsInCurrentSnapshot.size} modelos en snapshot actual. Posible barrido incompleto.`,
      );
    }
    // Histórico multi-semana: mostrar todos los domingos disponibles cuando se piden tendencias
    if (isMultiWeekRequest && sundayDates.length > 1) {
      context += `\n📅 HISTÓRICO DISPONIBLE (${sundayDates.length} domingos canónicos, mostrando los ${requestedWeeks} más recientes):\n`;
      sundayDates.slice(0, requestedWeeks).forEach((date, i) => {
        const weekData = allRixData.filter((r: any) => r.batch_execution_date?.toString().split("T")[0] === date);
        const models = new Set(weekData.map((r: any) => r["02_model_name"]));
        const avgRix =
          weekData.length > 0
            ? (
                weekData.reduce(
                  (sum: number, r: any) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"] ?? 0),
                  0,
                ) / weekData.length
              ).toFixed(1)
            : "N/A";
        context += `- Semana ${i + 1} (${i === 0 ? "MÁS RECIENTE" : `hace ${i} semana${i > 1 ? "s" : ""}`}): ${date} → ${weekData.length} registros, ${models.size} modelos, RIX mercado promedio: ${avgRix}\n`;
      });
      context += `INSTRUCCIÓN: Para esta consulta usa los datos de las ${requestedWeeks} semanas anteriores para narrar la evolución cronológica.\n`;
    }
    context += "\n";

    // =========================================================================
    // PRE-FILTERING: Apply model and index filters if user explicitly requested them
    // =========================================================================
    const questionLower = question.toLowerCase();
    const modelFilters: Record<string, string> = {
      chatgpt: "ChatGPT",
      gpt: "ChatGPT",
      perplexity: "Perplexity",
      gemini: "Google Gemini",
      deepseek: "Deepseek",
      grok: "Grok",
      qwen: "Qwen",
    };
    let requestedModel: string | null = null;
    for (const [keyword, modelName] of Object.entries(modelFilters)) {
      if (questionLower.includes(keyword)) {
        requestedModel = modelName;
        break;
      }
    }
    let requestedIndex: string | null = null;
    if (/ibex.?35/i.test(question)) requestedIndex = "IBEX-35";
    else if (/ibex.?mc/i.test(question)) requestedIndex = "IBEX-MC";

    if (requestedModel) {
      currentWeekData = currentWeekData.filter((r) => r["02_model_name"] === requestedModel);
      context += `\n⚡ FILTRO APLICADO: Solo datos de ${requestedModel} (${currentWeekData.length} registros)\n`;
      console.log(`${logPrefix} Pre-filter: model=${requestedModel}, ${currentWeekData.length} records remain`);
    }
    if (requestedIndex && companiesCache) {
      const indexTickers = new Set(
        companiesCache.filter((c: any) => c.ibex_family_code === requestedIndex).map((c: any) => c.ticker),
      );
      currentWeekData = currentWeekData.filter((r) => indexTickers.has(r["05_ticker"]));
      context += `⚡ FILTRO APLICADO: Solo empresas del ${requestedIndex} (${currentWeekData.length} registros)\n`;
      console.log(`${logPrefix} Pre-filter: index=${requestedIndex}, ${currentWeekData.length} records remain`);

      // IBEX-35 GUARDRAIL: detect and repair incomplete data from LIMIT truncation
      if (requestedIndex === "IBEX-35") {
        const expectedIbexCount = indexTickers.size;
        const uniqueIbexTickers = new Set(currentWeekData.map((r) => r["05_ticker"]));

        if (uniqueIbexTickers.size < expectedIbexCount) {
          console.log(
            `${logPrefix} WARNING: IBEX-35 incomplete! Found ${uniqueIbexTickers.size}/${expectedIbexCount} companies. Fetching missing...`,
          );

          const missingTickers = Array.from(indexTickers).filter((t) => !uniqueIbexTickers.has(t));

          if (missingTickers.length > 0) {
            const missingBatch = await fetchUnifiedRixData({
              supabaseClient,
              columns: `
                "01_run_id", "02_model_name", "03_target_name", "05_ticker",
                "06_period_from", "07_period_to", "09_rix_score", "51_rix_score_adjusted",
                "32_rmm_score", "10_resumen", "11_puntos_clave", batch_execution_date
              `,
              tickerFilter: missingTickers,
              limit: 500,
              logPrefix: `${logPrefix} [IBEX-REPAIR]`,
            });

            if (missingBatch.length > 0) {
              allRixData.push(...missingBatch);
              // Re-apply period + model + index filters on the repaired data
              const repairedData = missingBatch
                .filter((run) => run.batch_execution_date?.toString().split("T")[0] === canonicalDate)
                .filter((r) => !requestedModel || r["02_model_name"] === requestedModel)
                .filter((r) => indexTickers.has(r["05_ticker"]));
              currentWeekData.push(...repairedData);

              const repairedTickers = new Set(currentWeekData.map((r) => r["05_ticker"]));
              console.log(`${logPrefix} IBEX-35 repaired: now ${repairedTickers.size}/${expectedIbexCount} companies`);
              context += `🔧 IBEX-35 datos reparados: ${repairedTickers.size}/${expectedIbexCount} empresas\n`;
            }
          }
        }
      }
    }

    console.log(`${logPrefix} Canonical snapshot: ${canonicalDate} (${currentWeekData.length} records)`);
    console.log(`${logPrefix} Previous snapshot: ${previousDate ?? "N/A"} (${previousWeekData.length} records)`);

    // =========================================================================
    // 6.4 RANKING GENERAL (sin filtros destructivos)
    // =========================================================================
    const rankedRecords = currentWeekData
      // ELIMINADO EL FILTRO DESTRUCTIVO: .filter(run => run["32_rmm_score"] !== 0)
      .map((run) => ({
        company: run["03_target_name"],
        ticker: run["05_ticker"],
        model: run["02_model_name"],
        rixScore: run["51_rix_score_adjusted"] ?? run["09_rix_score"],
        rmmScore: run["32_rmm_score"],
        periodFrom: run["06_period_from"],
        periodTo: run["07_period_to"],
      }))
      .filter((r) => r.company && r.rixScore != null)
      .sort((a, b) => (b.rixScore || 0) - (a.rixScore || 0));

    const companyAverages = new Map<string, { scores: number[]; ticker: string }>();

    currentWeekData.forEach((run) => {
      const companyName = run["03_target_name"];
      const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];

      if (!companyName || score == null) return;

      if (!companyAverages.has(companyName)) {
        companyAverages.set(companyName, {
          scores: [],
          ticker: run["05_ticker"] || "",
        });
      }

      companyAverages.get(companyName)!.scores.push(score);
    });

    const rankedByAverage = Array.from(companyAverages.entries())
      .map(([company, data]) => ({
        company,
        ticker: data.ticker,
        avgRix: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
        modelCount: data.scores.length,
      }))
      .sort((a, b) => b.avgRix - a.avgRix);

    const trends = new Map<string, number>();
    if (previousWeekData.length > 0) {
      const prevScores = new Map<string, number[]>();
      previousWeekData.forEach((run) => {
        const companyName = run["03_target_name"];
        const score = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
        if (!companyName || score == null) return;

        if (!prevScores.has(companyName)) prevScores.set(companyName, []);
        prevScores.get(companyName)!.push(score);
      });

      rankedByAverage.forEach((curr) => {
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

    // Intelligent ranking: full when user asks for rankings, reduced otherwise to save tokens
    const isRankingQuery =
      /\b(ranking|top\s?\d|ibex|clasificaci[oó]n|mejor|peor|l[ií]der|primera|[uú]ltima|posici[oó]n|listado|todas las empresas)\b/i.test(
        question,
      );
    const rankingLimit = isRankingQuery ? 150 : 30;

    rankedRecords.slice(0, rankingLimit).forEach((record, idx) => {
      context += `| ${idx + 1} | ${record.company} | ${record.ticker} | ${record.rixScore} | ${record.model} |\n`;
    });

    if (rankedRecords.length > rankingLimit) {
      context += `\n... y ${rankedRecords.length - rankingLimit} evaluaciones más.\n`;
    }

    context += `\n`;

    context += `\n📊 PROMEDIOS POR EMPRESA (solo usar si el usuario pregunta explícitamente):\n`;
    context += `Esta tabla muestra el promedio de los 4 modelos de IA para cada empresa.\n`;
    context += `Total de empresas evaluadas: ${rankedByAverage.length}\n\n`;
    context += `| # | Empresa | Ticker | RIX Promedio | # Modelos | Tendencia vs Semana Anterior |\n`;
    context += `|---|---------|--------|--------------|-----------|------------------------------|\n`;

    const averageLimit = isRankingQuery ? 50 : 20;
    rankedByAverage.slice(0, averageLimit).forEach((company, idx) => {
      const trend = trends.get(company.company);
      const trendStr =
        trend !== undefined
          ? trend > 0
            ? `↗ +${trend.toFixed(1)}`
            : trend < 0
              ? `↘ ${trend.toFixed(1)}`
              : "→ 0.0"
          : "N/A";

      context += `| ${idx + 1} | ${company.company} | ${company.ticker} | ${company.avgRix} | ${company.modelCount} | ${trendStr} |\n`;
    });

    if (rankedByAverage.length > averageLimit) {
      context += `\n... y ${rankedByAverage.length - averageLimit} empresas más.\n`;
    }

    context += `\n`;

    const modelBreakdown = new Map<string, { count: number; avgScore: number; companies: Set<string> }>();

    currentWeekData.forEach((run) => {
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
          const companyData = rankedByAverage.find((c) => c.company === company);
          return { company, trend, ticker: companyData?.ticker || "", rix: companyData?.avgRix || 0 };
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
      context += `\n📅 DATOS SEMANA ANTERIOR (snapshot: ${previousDate ?? "N/A"}):\n`;
      context += `Total de evaluaciones: ${previousWeekData.length}\n\n`;
    }
  } else {
    context += "\n⚠️ No hay datos estructurados de RIX disponibles.\n\n";
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

TU TONO Y ESTILO DE ESCRITURA:
• Profesional y analítico, nunca periodístico ni dramático
• Declarativo: afirmas lo que los datos muestran con la autoridad que merecen
• Narrativo: construyes un relato coherente, no una lista de datos
• Accesible: alguien inteligente sin conocimientos técnicos de RepIndex debe entenderte
• Sin clickbait, sin melodrama, sin exageraciones

REGLAS DE ESCRITURA OPERATIVAS (sin excepción):
• Frases ≤25 palabras. Párrafos ≤4 líneas.
• Datos siempre con delta concreto: nunca "ha mejorado mucho" → "ha subido 8 puntos, de 54 a 62"
• Usa "las IAs" como sujeto genérico. Nombre propio solo cuando te refieras a una IA concreta.
• Tablas y bloques visuales antes que texto corrido en datos comparativos
• Prohibido usar jerga sin explicar (tokens, embeddings, RAG, Tier 2-3…)
• Explica cada concepto la primera vez; después úsalo con naturalidad
• Sé didáctico: explica el porqué de las cosas, no solo el qué

LO QUE NO ERES:
• Un periodista buscando titulares sensacionalistas
• Un manual técnico que lista métricas sin contexto
• Un chatbot que responde con bullets desconectados

═══════════════════════════════════════════════════════════════════════════════
           ARQUITECTURA DE DATOS: REGLAS CRÍTICAS DE NEGOCIO
═══════════════════════════════════════════════════════════════════════════════

REGLA 1 — LOS SNAPSHOTS SON SEMANALES Y SIEMPRE EN DOMINGO:
El sistema RepIndex ejecuta un barrido completo CADA DOMINGO. Cada snapshot
incluye ~175 empresas × 6 modelos de IA = ~1.050 registros con una única
batch_execution_date (domingo). NUNCA afirmes que solo un modelo ha evaluado
esta semana si el snapshot está completo: si hay 1.050 registros con 6 modelos,
todos evaluaron el mismo domingo.

REGLA 2 — PERÍODOS PARCIALES Y DE PRUEBA:
Pueden existir registros con fechas no dominicales (sábados, lunes, etc.).
Son pruebas técnicas o barridos parciales, NUNCA son "la semana actual".
La semana actual es SIEMPRE el snapshot dominical más reciente y completo.
El contexto que recibes ya ha seleccionado el snapshot canónico correcto;
confía en él.

REGLA 3 — COBERTURA DE MODELOS:
Un snapshot completo tiene SIEMPRE 6 modelos: ChatGPT, Perplexity, Gemini,
DeepSeek, Grok y Qwen. Si el contexto indica que hay menos de 4 modelos,
el snapshot puede ser incompleto — decláralo explícitamente al usuario.
Nunca inventes presencia o ausencia de modelos: usa solo los datos del contexto.

REGLA 4 — TRAZABILIDAD TEMPORAL:
Al citar datos, referencia siempre la fecha del snapshot (domingo de ejecución),
no el period_from/period_to. Ejemplo correcto: "En el snapshot del 15 de
febrero de 2026..." — esto da al usuario certeza sobre cuándo se tomó la
fotografía reputacional.

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

⚠️ AVISO DE CONSENSO (OBLIGATORIO cuando aplique):
Cuando priorices consenso (5-6 IAs) sobre menciones aisladas, avisa EXPLÍCITAMENTE
al usuario en el texto: "En este análisis he priorizado los hallazgos en los que
coinciden 5 o 6 IAs. Es posible que esté dejando de mencionar eventos con mención
aislada por una o dos IAs, que podrían ser igualmente relevantes."
Esto da al usuario control sobre qué seguir explorando.

═══════════════════════════════════════════════════════════════════════════════
                    ESTRUCTURA DE INFORME: EMBUDO NARRATIVO ADAPTABLE
═══════════════════════════════════════════════════════════════════════════════

Usa la estructura del Embudo Narrativo (inyectada al final del prompt via buildDepthPrompt).
El orden nunca se altera. Activa solo los bloques relevantes para la consulta.

RESUMEN EJECUTIVO → PILAR 1 DEFINIR → PILAR 2 ANALIZAR → PILAR 3 PROSPECTAR → CIERRE → FUENTES

ESCALA DE PROFUNDIDAD según tipo de consulta:
- Empresa (análisis completo): máxima → todos los pilares, mínimo 2.500 palabras
- Sector: media → Resumen + Pilar 1 comparado + Pilar 2 tendencial
- Comparativa entre empresas: enfrentada → tabla vs. tabla en cada pilar
- Pregunta concreta (un dato, una métrica, una semana): focalizada → respuesta precisa sin relleno

- El rol del usuario determina el ángulo/tono narrativo
- Cada recomendación del Pilar 3 lleva 6 campos: Qué, Por qué, Responsable, KPI, Impacto IA
- Identifica quién pregunta y adapta el ángulo y prioridades (directivo, comunicación, inversor…)
- Si una sección no aplica, omítela limpiamente sin mencionarla

═══════════════════════════════════════════════════════════════════════════════
                    LAS 8 MÉTRICAS DIMENSIONALES (GLOSARIO CANÓNICO)
═══════════════════════════════════════════════════════════════════════════════

NUNCA uses acrónimos (NVM, DRM, SIM…). Usa SIEMPRE el nombre descriptivo.
La primera vez que aparezca cada métrica, explica entre rayas qué mide.
Después úsala con naturalidad usando solo el nombre descriptivo.
Nunca pongas una puntuación sin explicar qué significa en la práctica.

Nombres canónicos y qué mide cada uno:

• Calidad de la Narrativa — cómo de clara y coherente es la historia que las IAs cuentan
  sobre la empresa. Mide coherencia del discurso público y afirmaciones verificables.

• Fortaleza de Evidencia — si las IAs encuentran datos fiables que respalden lo que dicen.
  Evalúa calidad de fuentes primarias, corroboración múltiple y trazabilidad documental.

• Autoridad de Fuentes — cuánto confían las IAs en las fuentes disponibles.
  Analiza la jerarquía de fuentes: reguladores/financieros > medios > redes sociales.
  ⚠️ No mide sostenibilidad/ESG. Mide jerarquía de fuentes.

• Actualidad y Empuje — si las IAs detectan actividad reciente y relevante.
  Mide la frescura temporal de menciones en la ventana semanal analizada.
  ⚠️ No mide marketing/branding. Mide frescura temporal.

• Gestión de Controversias — cómo manejan las IAs los temas sensibles o polémicos.
  Evalúa exposición a riesgos judiciales, políticos y laborales.
  Puntuación INVERSA: 100 = sin controversias, 0 = máxima exposición.

• Percepción de Gobernanza — cómo valoran las IAs el gobierno corporativo y la transparencia.
  Mide percepción de independencia y buenas prácticas de gobernanza corporativa.
  ⚠️ No mide gestión de talento/RRHH. Mide gobierno corporativo.

• Coherencia Informativa — si las distintas IAs coinciden o se contradicen entre sí.
  Evalúa la consistencia de información sobre la empresa entre los diferentes modelos.
  ⚠️ No mide innovación digital. Mide coherencia entre modelos.

• Ejecución Corporativa — cómo perciben las IAs la capacidad del equipo para ejecutar estrategia.
  Mide percepción de ejecución en mercado. Solo para empresas cotizadas.
  ⚠️ No mide experiencia del cliente. Mide ejecución corporativa.

ESCALA SEMAFÓRICA DE MÉTRICAS:
🟢 ≥70 fortaleza · 🟡 50-69 mejora · 🔴 <50 riesgo

ESCALA RIX GLOBAL (0-100):
• 80-100: Excelencia reputacional
• 65-79: Reputación sólida  
• 50-64: Reputación moderada
• 35-49: Reputación vulnerable
• 0-34: Reputación crítica

EJEMPLO DE INTEGRACIÓN CORRECTA (sin acrónimos, con nombres descriptivos):
"La Calidad de la Narrativa —cómo de clara y coherente es la historia que las IAs cuentan—
alcanza 53 puntos, impulsada por los contratos internacionales recientes. Sin embargo,
la Fortaleza de Evidencia —si las IAs encuentran datos fiables que respalden lo que dicen—
se mantiene baja en 29,8 puntos. Esta brecha de 23 puntos indica una narrativa atractiva
pero con poca evidencia verificable que la respalde."

═══════════════════════════════════════════════════════════════════════════════
                    TABLAS DE DATOS EN INFORMES
═══════════════════════════════════════════════════════════════════════════════

Usa tablas markdown para datos comparativos. En cabeceras usa nombres descriptivos abreviados
si el espacio lo requiere (Narrativa, Evidencia, Fuentes, Actualidad, Controversias, Gobernanza, Coherencia, Ejecución).

| Modelo IA  | RIX | Narrativa | Evidencia | Fuentes | Actualidad | Controversias | Gobernanza | Coherencia | Ejecución |
|------------|-----|-----------|-----------|---------|------------|---------------|------------|------------|-----------|
| ChatGPT    | 64  | 71        | 63        | 35      | 35         | 100           | 50         | 88         | 62        |
| Perplexity | 68  | 75        | 58        | 42      | 38         | 95            | 55         | 85         | 58        |

Para benchmarking competitivo:

| Empresa     | RIX  | Tendencia | Comentario síntesis                          |
|-------------|------|-----------|----------------------------------------------|
| Empresa A   | 70   | ↗ estable | Narrativa alta, buena Gobernanza             |
| Empresa B   | 47   | ↗ +5,8    | Contratos vs pérdidas                        |

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

REGLA CRÍTICA ANTI-TRUNCACIÓN (PRIORIDAD MÁXIMA):
- NUNCA simules que has "guardado" el informe en una carpeta, archivo o documento aparte
- NUNCA digas que "la respuesta supera el límite técnico de entrega"
- NUNCA digas que "la respuesta supera el límite máximo permitido en esta plataforma"
- NUNCA digas "la respuesta completa supera el límite"
- NUNCA uses frases como "he generado el informe en un documento aparte"
- NUNCA inventes rutas de carpetas como "/Informes_RIX/" ni ningún filesystem
- NUNCA prometas exportar, guardar o entregar el informe por otra vía
- Tu ÚNICA vía de entrega es ESTE CHAT. Escribe el informe completo aquí mismo.
- Si el informe es largo, escríbelo entero. No hay límite de extensión para ti.
- Si por alguna razón la respuesta se corta, simplemente termina donde puedas
  de forma natural, sin inventar excusas de almacenamiento externo.
- IMPORTANTE: No existe ninguna carpeta, filesystem, ni sistema de archivos.
  No existe ninguna plataforma con límites. Simplemente escribe tu respuesta completa.

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

${
  roleId && rolePrompt
    ? `
═══════════════════════════════════════════════════════════════════════════════
              PERSPECTIVA PROFESIONAL PRE-SELECCIONADA: ${roleName}
═══════════════════════════════════════════════════════════════════════════════

El usuario ha solicitado que la respuesta esté adaptada a la perspectiva de ${roleName}.

## REGLA DE PRIORIDAD

1. PRIORIDAD 1 (ESTRUCTURA): Embudo Narrativo adaptable (activa los bloques relevantes)
2. PRIORIDAD 2 (PROFUNDIDAD): Si menciona empresa → informe completo 4.500-5.400 palabras (OBLIGATORIO). Solo para preguntas SIN empresa → respuesta focalizada
3. PRIORIDAD 3 (TONO): Adapta el ángulo y enfoque al rol "${roleName}"

El rol "${roleName}" modifica CÓMO presentas el contenido (ángulo, tono), pero NUNCA
altera el orden del embudo ni omite datos relevantes para la consulta.

INSTRUCCIONES DEL ROL:
${rolePrompt}

IMPORTANTE: La respuesta ya debe estar adaptada a esta perspectiva desde el inicio.
No generes una respuesta genérica primero - genera directamente el análisis con esta perspectiva.
`
    : ""
}

[IDIOMA: Responde en ${languageName}]`;

  const userPrompt = `[IDIOMA: ${languageName.toUpperCase()}]

PREGUNTA DEL USUARIO: "${question}"

═══════════════════════════════════════════════════════════════════════════════
                    INSTRUCCIONES PARA TU RESPUESTA
═══════════════════════════════════════════════════════════════════════════════

INSTRUCCIONES DE PROFUNDIDAD Y EXPLOTACION DE DATOS:

1. EXPLOTACION DE DATOS: Tienes textos originales de 6 modelos de IA,
   explicaciones del análisis, categorías de métricas y resúmenes completos.
   USA TODOS ESTOS DATOS en tu respuesta. Cruza lo que dice un modelo con
   lo que dice otro. Cita hallazgos específicos de cada IA.

2. ESTRUCTURA OBLIGATORIA para análisis de empresa:
   RESUMEN EJECUTIVO (titular + 3 KPIs + hallazgos + recomendaciones + veredicto)
   → PILAR 1 DEFINIR (visión de las 6 IAs + 8 métricas + divergencias)
   → PILAR 2 ANALIZAR (evolución + amenazas + gaps + contexto competitivo)
   → PILAR 3 PROSPECTAR (3 activaciones + 3 tácticas + 3 líneas estratégicas)
   → CIERRE (kit de gestión + fuentes)

3. EXTENSIÓN: Para análisis de empresa, rango objetivo 4.500–5.400 palabras.
   Prioriza densidad analítica sobre volumen. Cada pilar debe aportar valor
   ejecutivo con datos concretos, no relleno. Termina cuando el análisis
   esté completo y sea accionable — no alargues por inercia.
   No dupliques ideas entre pilares.

4. EVIDENCIA CRUZADA: Cada afirmación importante debe indicar cuántas
   IAs la respaldan. Usa las categorías de métricas (fortaleza/mejora/riesgo)
   que tienes en los datos para fundamentar la interpretación.

5. TABLAS COMPARATIVAS: Incluye tablas de scores por modelo, tablas
   competitivas, y tablas de escenarios cuando corresponda.

6. NARRATIVA: Construye un relato coherente. Fundamenta con datos literales
   del contexto. Explica cada métrica en su primera mención.

7. Solo para preguntas SIN EMPRESA (metodología, conceptos generales): respuesta
   focalizada sin relleno. Si la pregunta menciona cualquier empresa, SIEMPRE
   aplica el informe completo de 4.500-5.400 palabras con Embudo Narrativo.

8. MÉTRICAS INDIVIDUALES: Para análisis de empresa, dedica un párrafo
   COMPLETO (4-6 oraciones) a CADA una de las 8 métricas dimensionales.
   Para cada métrica explica: qué puntuación tiene, qué categoría
   (fortaleza/mejora/riesgo), qué significa en la práctica para la empresa,
   y qué dicen específicamente los diferentes modelos de IA sobre ella.
   Las métricas son el corazón del análisis — no las reduzcas a una línea.

9. IMPORTANTE: Las reglas de estilo (frases cortas, párrafos de 4 líneas)
   se refieren a CLARIDAD, no a BREVEDAD de contenido. Escribe MUCHOS
   párrafos claros y concisos. Más párrafos = más profundidad.

10. REGLA CRÍTICA ANTI-TRUNCACIÓN:
    Escribe el informe ENTERO en esta respuesta.
    NUNCA digas que lo has guardado en una carpeta, documento aparte ni archivo.
    NUNCA menciones límites de longitud, límites de plataforma ni truncaciones.
    NUNCA prometas enviar, exportar o adjuntar el informe por otra vía.
    No existe ningún sistema de archivos, carpeta /Informes_RIX/ ni plataforma de descarga.
    Tu ÚNICA vía de entrega es este chat. Si el espacio se acaba, simplemente
    continúa escribiendo — el sistema encadena automáticamente.

═══════════════════════════════════════════════════════════════════════════════
                    CONTEXTO CON TODOS LOS DATOS DISPONIBLES
═══════════════════════════════════════════════════════════════════════════════

${context}

Responde en ${languageName} usando SOLO información del contexto anterior.`;

  console.log(`${logPrefix} Calling AI model (streaming: ${streamMode})...`);
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userPrompt },
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
          controller.enqueue(
            sseEncoder({
              type: "start",
              metadata: {
                language,
                languageName,
                depthLevel,
                detectedCompanies: detectedCompanies.map((c) => c.issuer_name),
              },
            }),
          );

          let accumulatedContent = "";
          let provider: "openai" | "gemini" = "openai";
          let inputTokens = 0;
          let outputTokens = 0;
          let streamError = false;
          let streamFinishReason = "";

          // Compliance buffer state for anti-hallucination gate
          const HOLDBACK_SIZE = 1200;
          const COMPLIANCE_SCAN_OVERLAP = 800;
          let emittedLength = 0;
          let forbiddenDetected = false;
          let segmentsGenerated = 1;
          let hadTruncation = false;
          let hadForbiddenPattern = false;

          // Helper: emit safe content from holdback buffer
          const flushSafeContent = (isFinal: boolean) => {
            if (forbiddenDetected) return;
            const checkEnd = isFinal ? accumulatedContent.length : Math.max(emittedLength, accumulatedContent.length - HOLDBACK_SIZE);
            if (checkEnd <= emittedLength) return;

            const pendingText = accumulatedContent.substring(emittedLength, checkEnd);
            const scanStart = Math.max(0, emittedLength - COMPLIANCE_SCAN_OVERLAP);
            const scanText = accumulatedContent.substring(scanStart, checkEnd);
            const forbiddenRelativeIndex = findForbiddenMatchIndex(scanText);

            if (forbiddenRelativeIndex !== -1) {
              hadForbiddenPattern = true;
              forbiddenDetected = true;
              const forbiddenAbsoluteIndex = scanStart + forbiddenRelativeIndex;

              const cleanedFull = stripForbiddenContent(
                accumulatedContent.substring(0, Math.max(emittedLength, forbiddenAbsoluteIndex)),
              );
              if (cleanedFull.length > emittedLength) {
                controller.enqueue(sseEncoder({ type: "chunk", text: cleanedFull.substring(emittedLength) }));
              }
              accumulatedContent = cleanedFull;
              emittedLength = cleanedFull.length;
              console.warn(`${logPrefix} Forbidden pattern detected and stripped at char ${forbiddenAbsoluteIndex}`);
              return;
            }

            controller.enqueue(sseEncoder({ type: "chunk", text: pendingText }));
            emittedLength = checkEnd;
          };

          // Helper: consume a stream generator with compliance buffer
          const consumeStream = async (
            generator: AsyncGenerator<any>,
            providerName: "openai" | "gemini"
          ): Promise<{ error: boolean; errorMsg?: string }> => {
            for await (const chunk of generator) {
              if (forbiddenDetected) break;

              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                flushSafeContent(false);
              } else if (chunk.type === "done") {
                streamFinishReason = chunk.finishReason || "stop";
                inputTokens += (chunk.inputTokens || 0);
                outputTokens += (chunk.outputTokens || 0);
                flushSafeContent(true);
                return { error: false };
              } else if (chunk.type === "error") {
                console.warn(`${logPrefix} ${providerName} stream error: ${chunk.error}`);
                return { error: true, errorMsg: chunk.error };
              }
            }
            // Broke out due to forbidden detection
            if (forbiddenDetected) {
              streamFinishReason = "length";
              return { error: false };
            }
            flushSafeContent(true);
            return { error: false };
          };

          // Try OpenAI first (with compliance buffer)
          console.log(`${logPrefix} Trying OpenAI stream first (with compliance gate)...`);
          const openaiResult = await consumeStream(
            streamOpenAIResponse(messages, "o3", 40000, logPrefix, 120000),
            "openai"
          );

          if (openaiResult.error || accumulatedContent.length === 0) {
            streamError = true;
            controller.enqueue(sseEncoder({ type: "fallback", metadata: { provider: "gemini" } }));
          }

          // Fallback to Gemini if OpenAI failed
          if (streamError) {
            provider = "gemini";
            accumulatedContent = "";
            emittedLength = 0;
            forbiddenDetected = false;

            console.log(`${logPrefix} Using Gemini stream (gemini-2.5-flash) with compliance gate...`);
            const geminiResult = await consumeStream(
              streamGeminiResponse(messages, "gemini-2.5-flash", 40000, logPrefix, 120000),
              "gemini"
            );

            if (geminiResult.error && accumulatedContent.length === 0) {
              console.error(`${logPrefix} Gemini stream also failed: ${geminiResult.errorMsg}`);
              controller.enqueue(
                sseEncoder({
                  type: "error",
                  error: `Error generando respuesta: ${geminiResult.errorMsg}`,
                }),
              );
              controller.close();
              return;
            }
          }

          // =================================================================
          // AUTO-CONTINUATION: If truncated, forbidden pattern detected,
          // or corporate report too short — auto-continue
          // =================================================================
          const MAX_CONTINUATIONS = 6;
          const MIN_CORPORATE_CHARS = 18000; // ~4500 palabras en español
          const isCorporateQuery = detectedCompanies.length > 0;

          const checkTooShort = () => isCorporateQuery && accumulatedContent.length < MIN_CORPORATE_CHARS;

          while (
            (streamFinishReason === "length" || forbiddenDetected || checkTooShort()) &&
            segmentsGenerated <= MAX_CONTINUATIONS
          ) {
            const isTooShortNow = checkTooShort();
            hadTruncation = true;
            segmentsGenerated++;
            forbiddenDetected = false;
            streamFinishReason = "";

            const reason = isTooShortNow ? "too_short" : (hadForbiddenPattern ? "forbidden_pattern" : "truncation");
            console.log(`${logPrefix} Auto-continuation #${segmentsGenerated - 1} (reason: ${reason}, accumulated: ${accumulatedContent.length} chars)...`);

            // Compact continuation: only last 500 chars for context, not the full content
            const lastChunk = accumulatedContent.slice(-500);

            const continuationSystemPrompt = isTooShortNow
              ? `Eres el Agente Rix. Tu respuesta anterior es DEMASIADO BREVE para un informe corporativo. Debes completar TODAS las secciones del Embudo Narrativo: Resumen Ejecutivo, Pilar 1 (DEFINIR), Pilar 2 (ANALIZAR), Pilar 3 (PROSPECTAR) y Cierre. El informe completo debe alcanzar 4.500-5.400 palabras. REGLAS: 1) No repitas contenido ya escrito. 2) NUNCA menciones límites, truncaciones, longitud máxima, carpetas, archivos ni plataformas. 3) Continúa añadiendo las secciones que faltan. Responde en ${languageName}.`
              : `Eres el Agente Rix continuando un informe de reputación corporativa. Continúa EXACTAMENTE desde el punto donde se interrumpió. REGLAS ESTRICTAS: 1) No repitas contenido. 2) NUNCA menciones límites, truncaciones, longitud máxima, carpetas, archivos ni plataformas. 3) No añadas prólogos ni transiciones. 4) Mantén formato, tono y estructura. 5) Si el informe está completo, escribe solo una frase de cierre. Responde en ${languageName}.`;

            const continuationUserPrompt = isTooShortNow
              ? `Tu informe está incompleto (${accumulatedContent.length} caracteres, necesitas al menos ${MIN_CORPORATE_CHARS}). Último fragmento escrito:\n\n"""${lastChunk}"""\n\nContinúa añadiendo las secciones que faltan del Embudo Narrativo. No repitas nada.`
              : `El informe se interrumpió. Último fragmento escrito:\n\n"""${lastChunk}"""\n\nContinúa escribiendo desde ahí. No repitas nada.`;

            const continuationMessages = [
              { role: "system", content: continuationSystemPrompt },
              { role: "user", content: continuationUserPrompt },
            ];

            const contGen = provider === "gemini"
              ? streamGeminiResponse(continuationMessages, "gemini-2.5-flash", 40000, logPrefix, 120000)
              : streamOpenAIResponse(continuationMessages, "o3", 40000, logPrefix, 120000);

            await consumeStream(contGen, provider);
          }

          console.log(
            `${logPrefix} Stream completed (via ${provider}), length: ${accumulatedContent.length}, segments: ${segmentsGenerated}, hadTruncation: ${hadTruncation}, hadForbiddenPattern: ${hadForbiddenPattern}`,
          );
          const answer = accumulatedContent;

          // Log API usage in background
          logApiUsage({
            supabaseClient,
            edgeFunction: "chat-intelligence",
            provider,
            model: provider === "openai" ? "o3" : "gemini-2.5-flash",
            actionType: "chat_stream",
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
          }).catch((e) => console.warn("Failed to log usage:", e));

          // =============================================================================
          // Generate suggested questions and drumroll (same logic as non-streaming)
          // =============================================================================
          console.log(`${logPrefix} Generating follow-up questions for streaming response...`);

          // Simplified question generation for streaming (avoid long delay)
          let suggestedQuestions: string[] = [];
          let drumrollQuestion: DrumrollQuestion | null = null;

          try {
            // Quick question generation
            const questionPrompt = `Based on this analysis about ${detectedCompanies.map((c) => c.issuer_name).join(", ") || "corporate reputation"}, generate 3 follow-up questions in ${languageName}. Respond ONLY with a JSON array of 3 strings.`;
            const questionResult = await callAISimple(
              [
                {
                  role: "system",
                  content: `Generate follow-up questions in ${languageName}. Respond ONLY with JSON array.`,
                },
                { role: "user", content: questionPrompt },
              ],
              "gpt-4o-mini",
              300,
              logPrefix,
            );

            if (questionResult) {
              const cleanText = questionResult
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
              suggestedQuestions = JSON.parse(cleanText);
            }
          } catch (qError) {
            console.warn(`${logPrefix} Error generating questions:`, qError);
          }

          // Generate drumroll question (always active in exhaustive mode)
          if (detectedCompanies.length > 0 && allRixData && allRixData.length > 0) {
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
                  logPrefix,
                );
              }
            } catch (dError) {
              console.warn(`${logPrefix} Error generating drumroll:`, dError);
            }
          }

          // Calculate methodology metadata
          const modelScores =
            allRixData
              ?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)
              ?.map((r) => r["09_rix_score"]) || [];
          const maxScoreMethod = modelScores.length > 0 ? Math.max(...modelScores) : 0;
          const minScoreMethod = modelScores.length > 0 ? Math.min(...modelScores) : 0;
          const divergencePointsMethod = maxScoreMethod - minScoreMethod;
          const divergenceLevelMethod =
            divergencePointsMethod <= 8 ? "low" : divergencePointsMethod <= 15 ? "medium" : "high";
          const modelsUsedMethod = [...new Set(allRixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];
          const periodFromMethod = allRixData
            ?.map((r) => r["06_period_from"])
            .filter(Boolean)
            .sort()[0];
          const periodToMethod = allRixData
            ?.map((r) => r["07_period_to"])
            .filter(Boolean)
            .sort()
            .reverse()[0];
          const uniqueCompaniesCount = new Set(allRixData?.map((r) => r["05_ticker"]).filter(Boolean) || []).size;
          const uniqueWeeksCount = allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0;

          // Save to database
          if (sessionId) {
            supabaseClient
              .from("chat_intelligence_sessions")
              .insert([
                {
                  session_id: sessionId,
                  role: "user",
                  content: question,
                  user_id: userId,
                  depth_level: depthLevel,
                },
                {
                  session_id: sessionId,
                  role: "assistant",
                  content: answer,
                  documents_found: vectorDocs?.length || 0,
                  structured_data_found: allRixData?.length || 0,
                  suggested_questions: suggestedQuestions,
                  drumroll_question: drumrollQuestion,
                  depth_level: depthLevel,
                  question_category: detectedCompanies.length > 0 ? "corporate_analysis" : "general_query",
                  user_id: userId,
                },
              ])
              .then(() => console.log(`${logPrefix} Session saved`))
              .catch((e: Error) => console.warn("Failed to save session:", e));
          }

          // Extract verified sources from full RIX data (includes raw AI responses)
          const verifiedSourcesStandard = extractSourcesFromRixData(detectedCompanyFullData || []);
          console.log(`${logPrefix} Extracted ${verifiedSourcesStandard.length} verified sources from RIX data`);

          // Send final done event with all metadata
          controller.enqueue(
            sseEncoder({
              type: "done",
              suggestedQuestions,
              drumrollQuestion,
              metadata: {
                type: "standard",
                documentsFound: vectorDocs?.length || 0,
                structuredDataFound: allRixData?.length || 0,
                dataWeeks: uniqueWeeksCount,
                aiProvider: provider,
                depthLevel,
                questionCategory: detectedCompanies.length > 0 ? "corporate_analysis" : "general_query",
                modelsUsed: modelsUsedMethod,
                periodFrom: periodFromMethod,
                periodTo: periodToMethod,
                divergenceLevel: divergenceLevelMethod,
                divergencePoints: divergencePointsMethod,
                uniqueCompanies: uniqueCompaniesCount,
                uniqueWeeks: uniqueWeeksCount,
                // Verified sources from ChatGPT and Perplexity for bibliography
                verifiedSources: verifiedSourcesStandard.length > 0 ? verifiedSourcesStandard : undefined,
                // Observability: anti-truncation metrics
                segmentsGenerated,
                hadTruncation,
                hadForbiddenPattern,
                finalOutputLength: answer.length,
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
              },
            }),
          );

          controller.close();
        } catch (error) {
          console.error(`${logPrefix} Streaming error:`, error);
          controller.enqueue(
            sseEncoder({
              type: "error",
              error: error instanceof Error ? error.message : "Error de streaming desconocido",
            }),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // =========================================================================
  // NON-STREAMING MODE: Original behavior (for backwards compatibility)
  // =========================================================================
  let chatResult = await callAIWithFallback(messages, "o3", 40000, logPrefix);
  let answer = chatResult.content;

  // Non-streaming compliance gate: check for forbidden patterns + length enforcement
  let nonStreamSegments = 1;
  let nonStreamHadForbidden = false;
  const MAX_NS_CONTINUATIONS = 6;
  const NS_MIN_CORPORATE_CHARS = 18000;
  const nsIsCorporateQuery = detectedCompanies.length > 0;

  const nsCheckTooShort = () => nsIsCorporateQuery && answer.length < NS_MIN_CORPORATE_CHARS;
  
  while ((containsForbiddenPattern(answer) || nsCheckTooShort()) && nonStreamSegments <= MAX_NS_CONTINUATIONS) {
    const isTooShort = nsCheckTooShort();
    const hasForbidden = containsForbiddenPattern(answer);
    
    if (hasForbidden) {
      nonStreamHadForbidden = true;
      answer = stripForbiddenContent(answer);
    }
    
    nonStreamSegments++;
    const reason = isTooShort ? "too_short" : "forbidden_pattern";
    console.warn(`${logPrefix} Non-streaming: ${reason} detected (attempt ${nonStreamSegments}, chars: ${answer.length}), continuing...`);
    
    try {
      const lastChunk = answer.slice(-500);

      const sysPrompt = isTooShort
        ? `Eres el Agente Rix. Tu respuesta anterior es DEMASIADO BREVE para un informe corporativo. Debes completar TODAS las secciones del Embudo Narrativo. El informe debe alcanzar 4.500-5.400 palabras. NUNCA menciones límites, truncaciones, longitud máxima, carpetas ni archivos. Responde en ${languageName}.`
        : `Eres el Agente Rix continuando un informe. NUNCA menciones límites, truncaciones, longitud máxima, carpetas ni archivos. Responde en ${languageName}.`;

      const userPrompt = isTooShort
        ? `Tu informe está incompleto (${answer.length} caracteres, necesitas al menos ${NS_MIN_CORPORATE_CHARS}). Último fragmento:\n\n"""${lastChunk}"""\n\nContinúa añadiendo las secciones que faltan. No repitas.`
        : `El informe se interrumpió. Último fragmento:\n\n"""${lastChunk}"""\n\nContinúa desde ahí. No repitas.`;

      const contMessages = [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt },
      ];
      const contResult = await callAIWithFallback(contMessages, "o3", 40000, logPrefix);
      answer += "\n\n" + (containsForbiddenPattern(contResult.content) ? stripForbiddenContent(contResult.content) : contResult.content);
      chatResult = { ...chatResult, outputTokens: chatResult.outputTokens + contResult.outputTokens };
      
      // If no forbidden and length OK, we're done
      if (!containsForbiddenPattern(answer) && !nsCheckTooShort()) {
        break;
      }
    } catch (contError) {
      console.warn(`${logPrefix} Non-streaming continuation failed:`, contError);
      break;
    }
  }
  
  if (nonStreamHadForbidden || nonStreamSegments > 1) {
    console.log(`${logPrefix} Non-streaming compliance: ${nonStreamSegments} segments, final length: ${answer.length}, clean: ${!containsForbiddenPattern(answer)}`);
  }

  console.log(`${logPrefix} AI response received (via ${chatResult.provider}), length: ${answer.length}`);

  // Log API usage with depth_level tracking
  console.log(`${logPrefix} Logging API usage with depth_level: ${depthLevel}, role: ${roleId || "none"}`);
  await logApiUsage({
    supabaseClient,
    edgeFunction: "chat-intelligence",
    provider: chatResult.provider,
    model: chatResult.model,
    actionType: "chat",
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
      return { patterns: [], anomalies: [], surprises: [], modelDivergences: [], dataQuality: "insufficient" };
    }

    const patterns: string[] = [];
    const anomalies: string[] = [];
    const surprises: string[] = [];

    // Group data by company
    const byCompany: Record<string, any[]> = {};
    allRixData.forEach((r) => {
      const company = r["03_target_name"];
      if (!byCompany[company]) byCompany[company] = [];
      byCompany[company].push(r);
    });

    // =============================================================================
    // VALIDACIÓN DE CALIDAD: Solo considerar empresas con datos de los 4 modelos
    // =============================================================================
    const REQUIRED_MODELS = ["chatgpt", "perplexity", "gemini", "deepseek"];
    const MIN_MODELS_FOR_INSIGHT = 4; // Exigimos cobertura completa

    const companiesWithFullCoverage: Record<string, any[]> = {};
    Object.entries(byCompany).forEach(([company, records]) => {
      const modelsPresent = new Set(records.map((r) => r["02_model_name"]?.toLowerCase()).filter(Boolean));

      // Verificar que tenga datos de los 4 modelos con scores válidos
      const hasAllModels = REQUIRED_MODELS.every((model) =>
        records.some(
          (r) =>
            r["02_model_name"]?.toLowerCase().includes(model) && r["09_rix_score"] != null && r["09_rix_score"] > 0,
        ),
      );

      if (hasAllModels) {
        companiesWithFullCoverage[company] = records;
      }
    });

    const fullCoverageCount = Object.keys(companiesWithFullCoverage).length;
    console.log(
      `${logPrefix} Companies with full 4-model coverage: ${fullCoverageCount}/${Object.keys(byCompany).length}`,
    );

    // Si no hay suficientes empresas con cobertura completa, no generar insights
    if (fullCoverageCount < 10) {
      console.log(
        `${logPrefix} Insufficient data quality for insights (need at least 10 companies with full coverage)`,
      );
      return {
        patterns: [],
        anomalies: [],
        surprises: [],
        modelDivergences: [],
        dataQuality: "insufficient",
        coverageStats: { full: fullCoverageCount, total: Object.keys(byCompany).length },
      };
    }

    // =============================================================================
    // 1. DIVERGENCIAS ENTRE MODELOS (solo empresas con cobertura completa)
    // =============================================================================
    const modelDivergences: {
      company: string;
      ticker: string;
      chatgpt: number;
      deepseek: number;
      perplexity: number;
      gemini: number;
      maxDiff: number;
      models: string;
    }[] = [];

    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      const chatgpt = records.find((r) => r["02_model_name"]?.toLowerCase().includes("chatgpt"));
      const deepseek = records.find((r) => r["02_model_name"]?.toLowerCase().includes("deepseek"));
      const perplexity = records.find((r) => r["02_model_name"]?.toLowerCase().includes("perplexity"));
      const gemini = records.find((r) => r["02_model_name"]?.toLowerCase().includes("gemini"));

      if (chatgpt && deepseek && perplexity && gemini) {
        const scores = [
          { model: "ChatGPT", score: chatgpt["09_rix_score"] },
          { model: "DeepSeek", score: deepseek["09_rix_score"] },
          { model: "Perplexity", score: perplexity["09_rix_score"] },
          { model: "Gemini", score: gemini["09_rix_score"] },
        ];

        const maxScore = Math.max(...scores.map((s) => s.score));
        const minScore = Math.min(...scores.map((s) => s.score));
        const maxDiff = maxScore - minScore;

        // Solo reportar divergencias significativas (>=12 puntos) con datos sólidos
        if (maxDiff >= 12) {
          const highest = scores.find((s) => s.score === maxScore)!;
          const lowest = scores.find((s) => s.score === minScore)!;

          modelDivergences.push({
            company,
            ticker: chatgpt["05_ticker"] || "",
            chatgpt: chatgpt["09_rix_score"],
            deepseek: deepseek["09_rix_score"],
            perplexity: perplexity["09_rix_score"],
            gemini: gemini["09_rix_score"],
            maxDiff,
            models: `${highest.model} (${highest.score}) vs ${lowest.model} (${lowest.score})`,
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
        const companyInfo = companiesCache?.find((c) => c.ticker === records[0]?.["05_ticker"]);
        const sector = companyInfo?.sector_category;
        if (!sector) return;

        // Calcular promedio de los 4 modelos para esta empresa
        const validScores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
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
        companies.forEach((c) => {
          const diff = c.avgRix - sectorAvg;
          if (Math.abs(diff) >= 12) {
            const direction = diff > 0 ? "supera" : "está por debajo de";
            surprises.push(
              `${c.company} ${direction} la media del sector ${sector} (${sectorAvg.toFixed(0)}) en ${Math.abs(diff).toFixed(0)} puntos (promedio 4 modelos: ${c.avgRix.toFixed(0)})`,
            );
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
        const companyInfo = companiesCache?.find((c) => c.ticker === records[0]?.["05_ticker"]);
        if (!companyInfo) return;

        const validScores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
        if (validScores.length < 4) return;

        const avgRix = validScores.reduce((a, b) => a + b, 0) / validScores.length;

        if (companyInfo.ibex_family_code === "IBEX35") {
          ibex35Companies.push({ company, avgRix });
        } else if (!companyInfo.cotiza_en_bolsa) {
          nonTradedCompanies.push({ company, avgRix });
        }
      });

      // Solo generar insight si hay suficientes datos en ambos grupos
      if (ibex35Companies.length >= 10 && nonTradedCompanies.length >= 5) {
        const avgIbex = ibex35Companies.reduce((sum, c) => sum + c.avgRix, 0) / ibex35Companies.length;

        const outperformers = nonTradedCompanies
          .filter((c) => c.avgRix > avgIbex + 5)
          .sort((a, b) => b.avgRix - a.avgRix);

        if (outperformers.length > 0) {
          const best = outperformers[0];
          patterns.push(
            `${best.company} (no cotizada, promedio ${best.avgRix.toFixed(0)}) supera la media del IBEX35 (${avgIbex.toFixed(0)}) basado en consenso de 4 modelos`,
          );
        }
      }
    }

    // =============================================================================
    // 4. DESEQUILIBRIOS DE MÉTRICAS (solo con todas las métricas presentes)
    // =============================================================================
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      // Usar el registro con más métricas completas
      records.forEach((r) => {
        const metrics = [
          { name: "NVM", score: r["23_nvm_score"] },
          { name: "DRM", score: r["26_drm_score"] },
          { name: "SIM", score: r["29_sim_score"] },
          { name: "RMM", score: r["32_rmm_score"] },
          { name: "CEM", score: r["35_cem_score"] },
          { name: "GAM", score: r["38_gam_score"] },
          { name: "DCM", score: r["41_dcm_score"] },
          { name: "CXM", score: r["44_cxm_score"] },
        ].filter((m) => m.score != null && m.score > 0);

        // Solo considerar si tiene al menos 7 de 8 métricas (datos sólidos)
        if (metrics.length >= 7) {
          const max = metrics.reduce((a, b) => (a.score > b.score ? a : b));
          const min = metrics.reduce((a, b) => (a.score < b.score ? a : b));

          // Desequilibrio significativo: ≥30 puntos
          if (max.score - min.score >= 30) {
            const model = r["02_model_name"];
            patterns.push(
              `${company} (según ${model}): desequilibrio de ${max.score - min.score} pts entre ${max.name} (${max.score}) y ${min.name} (${min.score})`,
            );
          }
        }
      });
    });

    // =============================================================================
    // 5. CONSENSO vs DISCORDIA (solo empresas con 4 modelos)
    // =============================================================================
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      const scores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);

      // Requiere exactamente 4 scores válidos
      if (scores.length !== 4) return;

      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const range = max - min;
      const avg = scores.reduce((a, b) => a + b, 0) / 4;

      if (range <= 4) {
        patterns.push(
          `${company} tiene consenso perfecto entre los 4 modelos: RIX entre ${min} y ${max} (promedio: ${avg.toFixed(0)})`,
        );
      } else if (range >= 20) {
        anomalies.push(
          `${company} genera discordia total: ${range} puntos entre modelos (${min}-${max}), requiere análisis`,
        );
      }
    });

    // =============================================================================
    // 6. TENDENCIA DE MODELOS (solo con volumen suficiente)
    // =============================================================================
    const modelStats: Record<string, { scores: number[]; count: number }> = {};
    Object.values(companiesWithFullCoverage)
      .flat()
      .forEach((r) => {
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
        count: data.count,
      }))
      .sort((a, b) => b.avg - a.avg);

    if (modelRankings.length >= 4) {
      const mostGenerous = modelRankings[0];
      const mostCritical = modelRankings[modelRankings.length - 1];
      const diff = mostGenerous.avg - mostCritical.avg;

      if (diff >= 4) {
        patterns.push(
          `${mostGenerous.model} es sistemáticamente ${diff.toFixed(1)} pts más generoso que ${mostCritical.model} (basado en ${mostGenerous.count} empresas con cobertura completa)`,
        );
      }
    }

    return {
      patterns: patterns.slice(0, 4),
      anomalies: anomalies.slice(0, 4),
      surprises: surprises.slice(0, 4),
      modelDivergences: modelDivergences.slice(0, 3),
      dataQuality: "solid",
      coverageStats: { full: fullCoverageCount, total: Object.keys(byCompany).length },
    };
  };

  const dataInsights = analyzeDataForInsights();
  console.log(
    `${logPrefix} Data insights found: ${dataInsights.patterns.length} patterns, ${dataInsights.anomalies.length} anomalies, ${dataInsights.surprises.length} surprises`,
  );

  // Extract topics already discussed to avoid repetition
  const discussedTopics = new Set<string>();
  const allConversationText = [...conversationHistory.map((m: any) => m.content || ""), question, answer]
    .join(" ")
    .toLowerCase();

  // Mark mentioned companies as discussed
  if (allRixData) {
    allRixData.forEach((r) => {
      const companyName = r["03_target_name"]?.toLowerCase();
      if (companyName && allConversationText.includes(companyName)) {
        discussedTopics.add(companyName);
      }
    });
  }

  const availableSectors = companiesCache
    ? [...new Set(companiesCache.map((c) => c.sector_category).filter(Boolean))].join(", ")
    : "Energía, Banca, Telecomunicaciones, Construcción, Tecnología, Consumo";

  // Build prompt with REAL DATA DISCOVERIES (solo si hay calidad suficiente)
  const hasQualityData =
    dataInsights.dataQuality === "solid" &&
    (dataInsights.patterns.length > 0 || dataInsights.anomalies.length > 0 || dataInsights.surprises.length > 0);

  const dataDiscoveriesPrompt = hasQualityData
    ? `You are an EXPERT DATA ANALYST who has discovered hidden patterns analyzing ${dataInsights.coverageStats?.full || "multiple"} companies with COMPLETE COVERAGE from all 4 AI models. Generate 3 questions that SURPRISE the user by revealing non-obvious insights.

🔬 VERIFIED DISCOVERIES (based ONLY on companies with data from ChatGPT + Perplexity + Gemini + DeepSeek):

📊 DETECTED PATTERNS:
${dataInsights.patterns.map((p, i) => `${i + 1}. ${p}`).join("\n")}

⚠️ ANOMALIES FOUND:
${dataInsights.anomalies.length > 0 ? dataInsights.anomalies.map((a, i) => `${i + 1}. ${a}`).join("\n") : "- No significant anomalies with solid data"}

💡 DATA SURPRISES:
${dataInsights.surprises.length > 0 ? dataInsights.surprises.map((s, i) => `${i + 1}. ${s}`).join("\n") : "- No notable surprises with complete data"}

🎯 MAXIMUM DIVERGENCES BETWEEN MODELS (4 models analyzed):
${
  dataInsights.modelDivergences?.length > 0
    ? dataInsights.modelDivergences
        .map((d, i) => `${i + 1}. ${d.company}: ${d.models} = ${d.maxDiff} pts difference`)
        .join("\n")
    : "- High consensus between models"
}

📈 DATA QUALITY: ${dataInsights.coverageStats?.full}/${dataInsights.coverageStats?.total} companies with complete 4-model coverage

TOPICS ALREADY DISCUSSED (AVOID REPEATING):
${[...discussedTopics].slice(0, 10).join(", ") || "None specific yet"}

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
      {
        role: "system",
        content: `You are a data analyst who generates questions based on REAL discoveries. Each question must reveal a hidden insight in the data. IMPORTANT: Generate all questions in ${languageName}. Respond ONLY with the JSON array.`,
      },
      { role: "user", content: dataDiscoveriesPrompt },
    ];

    let suggestedQuestions: string[] = [];

    const questionsText = await callAISimple(questionsMessages, "gpt-4o-mini", 600, logPrefix);
    if (questionsText) {
      try {
        const cleanText = questionsText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        suggestedQuestions = JSON.parse(cleanText);
        console.log(`${logPrefix} Generated ${suggestedQuestions.length} data-driven questions`);
      } catch (parseError) {
        console.warn(`${logPrefix} Error parsing follow-up questions:`, parseError);
        suggestedQuestions = [];
      }
    }

    // =============================================================================
    // GENERATE DRUMROLL QUESTION (Complementary Report Suggestion)
    // Always active in exhaustive mode
    // =============================================================================
    // Extract structured insights from the rix data for drumroll generation
    let drumrollQuestion: DrumrollQuestion | null = null;
    if (detectedCompanies.length > 0 && allRixData && allRixData.length > 0) {
      console.log(`${logPrefix} Extracting analysis insights for ${detectedCompanies[0]?.issuer_name}...`);

      const insights = extractAnalysisInsights(allRixData, detectedCompanies[0], answer);

      if (insights) {
        console.log(
          `${logPrefix} Insights extracted: RIX=${insights.overallScore}, weakest=${insights.weakestMetrics[0]?.name}, trend=${insights.trend}(${insights.trendDelta}pts), divergence=${insights.divergenceLevel}`,
        );

        drumrollQuestion = await generateDrumrollQuestion(
          question,
          insights,
          detectedCompanies,
          companiesCache,
          language,
          languageName,
          logPrefix,
        );
      } else {
        console.log(`${logPrefix} No insights extracted - skipping drumroll`);
      }
    }

    // Determine question category (simplified classification)
    const questionCategory = detectedCompanies.length > 0 ? "corporate_analysis" : "general_query";

    // Save to database with new fields
    if (sessionId) {
      await supabaseClient.from("chat_intelligence_sessions").insert([
        {
          session_id: sessionId,
          role: "user",
          content: question,
          user_id: userId,
          depth_level: depthLevel,
        },
        {
          session_id: sessionId,
          role: "assistant",
          content: answer,
          documents_found: vectorDocs?.length || 0,
          structured_data_found: allRixData?.length || 0,
          suggested_questions: suggestedQuestions,
          drumroll_question: drumrollQuestion,
          depth_level: depthLevel,
          question_category: questionCategory,
          user_id: userId,
        },
      ]);
    }

    // Calculate divergence for methodology metadata
    const modelScores =
      allRixData?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)?.map((r) => r["09_rix_score"]) ||
      [];
    const maxScoreMethod = modelScores.length > 0 ? Math.max(...modelScores) : 0;
    const minScoreMethod = modelScores.length > 0 ? Math.min(...modelScores) : 0;
    const divergencePointsMethod = maxScoreMethod - minScoreMethod;
    const divergenceLevelMethod =
      divergencePointsMethod <= 8 ? "low" : divergencePointsMethod <= 15 ? "medium" : "high";

    // Extract unique models used
    const modelsUsedMethod = [...new Set(allRixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];

    // Extract period info
    const periodFromMethod = allRixData
      ?.map((r) => r["06_period_from"])
      .filter(Boolean)
      .sort()[0];
    const periodToMethod = allRixData
      ?.map((r) => r["07_period_to"])
      .filter(Boolean)
      .sort()
      .reverse()[0];

    // Extract unique companies and weeks
    const uniqueCompaniesCount = new Set(allRixData?.map((r) => r["05_ticker"]).filter(Boolean) || []).size;
    const uniqueWeeksCount = allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0;

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
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
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
          dataWeeks: allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0,
          aiProvider: chatResult.provider,
          depthLevel,
          questionCategory: "error",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}
