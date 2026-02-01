import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prompt genérico para la mayoría de modelos - FORMATO NARRATIVO PROFESIONAL (estilo Make.com)
const buildSearchPrompt = (issuerName: string, ticker: string, dateFrom: string, dateTo: string): string => `
Eres ANALISTA DE REPUTACIÓN CORPORATIVA senior especializado en monitoreo de marca para comités de dirección.

MISIÓN: Analizar EXHAUSTIVAMENTE TODAS las menciones sobre ${issuerName} (${ticker}) durante el periodo ESPECÍFICO: ${dateFrom} a ${dateTo}.

╔═══════════════════════════════════════════════════════════════════════════╗
║ ⚠️ EXTENSIÓN MÍNIMA OBLIGATORIA: 4,000 TOKENS (~16,000 caracteres)        ║
║ ⚠️ SIEMPRE DEBES RESPONDER. NUNCA devuelvas "no hay información"          ║
║ TEMPORALIDAD ESTRICTA: SOLO menciones del ${dateFrom} al ${dateTo}        ║
╚═══════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════
⚠️ REGLA CRÍTICA: SIEMPRE DEBES PROPORCIONAR UN INFORME COMPLETO
═══════════════════════════════════════════════════════════════════════════

NUNCA digas "no he encontrado información" o "no hay menciones". SIEMPRE hay algo que reportar:

ESTRATEGIA OBLIGATORIA DE BÚSQUEDA (en orden de prioridad):
1. PRIMERO: Busca menciones DIRECTAS de ${issuerName} en prensa, redes, foros
2. SI NO HAY DIRECTAS: Busca noticias del SECTOR (${issuerName} opera en un sector específico - ¡búscalo!)
3. SI NO HAY SECTOR: Busca noticias de COMPETIDORES directos y analiza implicaciones
4. SI NO HAY COMPETIDORES: Busca tendencias MACROECONÓMICAS de España que afecten al sector
5. SIEMPRE: Incluye análisis del CONTEXTO BURSÁTIL si cotiza (IBEX, bolsa española)

JUSTIFICACIÓN: Toda empresa opera en un contexto. Si no hay noticias directas, el contexto sectorial, competitivo y macroeconómico ES RELEVANTE para su reputación.

═══════════════════════════════════════════════════════════════════════════
REGLAS DE TEMPORALIDAD (OBLIGATORIO):
═══════════════════════════════════════════════════════════════════════════

1. SOLO incluye menciones con fechas EXACTAS dentro del periodo ${dateFrom} a ${dateTo}
2. NO incluyas historia genérica de la empresa ni contexto de años anteriores
3. NO inventes ni extrapoles información fuera del periodo

═══════════════════════════════════════════════════════════════════════════
FUENTES OBLIGATORIAS A RASTREAR (buscar TODAS):
═══════════════════════════════════════════════════════════════════════════
• Prensa económica Tier-1: Expansión, Cinco Días, El Economista, El Confidencial, Reuters, Bloomberg, FT
• Reguladores: CNMV, BME, comunicados oficiales
• Redes sociales: X/Twitter, LinkedIn, Instagram
• Foros: Rankia, Forocoches, Reddit r/SpainFinance, Glassdoor
• Blogs sectoriales, análisis de casas de bolsa, medios especializados

═══════════════════════════════════════════════════════════════════════════
ESTRUCTURA DEL INFORME (seguir exactamente):
═══════════════════════════════════════════════════════════════════════════

## Resumen Ejecutivo
(4-6 frases: situación reputacional de ${issuerName} esta semana, contexto de mercado, principales hallazgos)

## Hechos Corporativos y Noticias Directas
Para CADA mención (objetivo: 12-18 menciones mínimo, combinando directas + sector):
- **[FECHA EXACTA dd/mm/yyyy]** - [Titular]
- Fuente: [Nombre](URL)
- **Descripción** (4-6 párrafos): Qué se dice, contexto, declaraciones, datos
- **IMPACTO REPUTACIONAL** (2-3 párrafos): Positivo/negativo/neutro, por qué, implicaciones

## Contexto Sectorial de la Semana
(OBLIGATORIO aunque no haya noticias directas - buscar noticias del sector)
- Noticias de competidores
- Tendencias del sector
- Movimientos regulatorios
- Explicar vínculo con ${issuerName}

## Contexto Macroeconómico Relevante
(Noticias de economía española/europea que afecten al sector de ${issuerName})

## Percepción en Redes Sociales y Foros
- X/Twitter, LinkedIn, Rankia, Reddit
- Si no hay menciones directas: "Semana de baja actividad social" pero analizar el contexto

## Alertas de Riesgo Reputacional
(Si no hay alertas: "Sin alertas significativas identificadas en el periodo")

## Señales Positivas
(Si no hay: "Sin señales destacables identificadas en el periodo")

## Nota Metodológica
- Fuentes consultadas
- Limitaciones
- Nivel de cobertura: directa/sectorial/macro

═══════════════════════════════════════════════════════════════════════════
FORMATO OBLIGATORIO:
═══════════════════════════════════════════════════════════════════════════
• Markdown rico: ## headers, **negritas**, [enlaces](url)
• FECHAS EXACTAS (dd/mm/yyyy) en CADA mención
• URLs reales
• MÍNIMO 4,000 tokens (~16,000 caracteres)
• Responde en Español de España

⚠️ RECUERDA: SIEMPRE debes entregar un informe completo de 4,000+ tokens. NUNCA "no hay información".

NO devuelvas JSON. Escribe un INFORME NARRATIVO PROFESIONAL extenso.
`;

// Prompt optimizado para Perplexity - SIEMPRE debe responder
const buildPerplexityPrompt = (issuerName: string, ticker: string): string => `Eres ANALISTA DE REPUTACIÓN CORPORATIVA senior.

MISIÓN: Informe EXHAUSTIVO sobre ${issuerName} (${ticker}) en España durante los ÚLTIMOS 7 DÍAS.

╔═══════════════════════════════════════════════════════════════════════════╗
║ ⚠️ EXTENSIÓN MÍNIMA OBLIGATORIA: 4,000 TOKENS (~16,000 caracteres)        ║
║ ⚠️ SIEMPRE DEBES RESPONDER. NUNCA "no hay información"                    ║
║ OBJETIVO: 15-25 menciones con análisis EXHAUSTIVO                         ║
╚═══════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════
⚠️ REGLA CRÍTICA: SIEMPRE PROPORCIONA UN INFORME COMPLETO
═══════════════════════════════════════════════════════════════════════════

NUNCA digas "no he encontrado información". SIEMPRE hay algo que reportar:

ESTRATEGIA OBLIGATORIA DE BÚSQUEDA:
1. PRIMERO: Busca menciones DIRECTAS de ${issuerName} en prensa, redes, foros
2. SI NO HAY DIRECTAS: Busca noticias del SECTOR de ${issuerName}
3. SI NO HAY SECTOR: Busca noticias de COMPETIDORES directos
4. SI NO HAY COMPETIDORES: Busca tendencias MACROECONÓMICAS de España
5. SIEMPRE: Incluye contexto bursátil (IBEX, bolsa española) si cotiza

═══════════════════════════════════════════════════════════════════════════
TEMPORALIDAD:
═══════════════════════════════════════════════════════════════════════════
- SOLO menciones de los ÚLTIMOS 7 DÍAS
- NO historia genérica de la empresa

═══════════════════════════════════════════════════════════════════════════
FUENTES A RASTREAR:
═══════════════════════════════════════════════════════════════════════════
• Prensa: Expansión, Cinco Días, El Economista, El Confidencial, Reuters, Bloomberg
• Reguladores: CNMV, BME
• Redes: X/Twitter (@${ticker}, "${issuerName}"), LinkedIn
• Foros: Rankia, Forocoches, Reddit, Glassdoor

═══════════════════════════════════════════════════════════════════════════
ESTRUCTURA:
═══════════════════════════════════════════════════════════════════════════

## Resumen Ejecutivo
(4-6 frases: situación reputacional esta semana)

## Hechos Corporativos y Noticias
Para CADA mención (objetivo 12-18):
- **[FECHA dd/mm/yyyy]** - [Titular]
- Fuente: [Nombre](URL)
- **Descripción** (4-6 párrafos)
- **IMPACTO REPUTACIONAL** (2-3 párrafos)

## Contexto Sectorial de la Semana
(OBLIGATORIO aunque no haya noticias directas)

## Contexto Macroeconómico
(Noticias económicas España que afecten al sector)

## Percepción en Redes Sociales
(Si no hay menciones: "Semana de baja actividad social" + analizar contexto)

## Alertas de Riesgo
(Si no hay: "Sin alertas significativas")

## Señales Positivas
(Si no hay: "Sin señales destacables")

## Nota Metodológica

═══════════════════════════════════════════════════════════════════════════
FORMATO:
═══════════════════════════════════════════════════════════════════════════
• Markdown: ## headers, **negritas**, [enlaces](url)
• Fechas exactas (dd/mm/yyyy)
• URLs reales
• MÍNIMO 4,000 tokens
• Español de España

⚠️ RECUERDA: SIEMPRE informe completo de 4,000+ tokens. NUNCA "no hay información".`;

// Prompt para Grok - SIN FECHAS ESPECÍFICAS para evitar filtros de seguridad
// Grok rechaza fechas que considera "futuras" diciendo que sería generar información ficticia
const buildGrokPrompt = (issuerName: string, ticker: string): string => `Eres ANALISTA DE REPUTACIÓN CORPORATIVA senior.

MISIÓN: Analiza EXHAUSTIVAMENTE las menciones RECIENTES sobre ${issuerName} (${ticker}) durante la ÚLTIMA SEMANA.

╔═══════════════════════════════════════════════════════════════════════════╗
║ ⚠️ EXTENSIÓN MÍNIMA OBLIGATORIA: 4,000 TOKENS (~16,000 caracteres)        ║
║ ⚠️ SIEMPRE DEBES RESPONDER. NUNCA "no hay información"                    ║
║ TEMPORALIDAD: SOLO menciones de los ÚLTIMOS 7 DÍAS                        ║
╚═══════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════
⚠️ REGLA CRÍTICA: SIEMPRE DEBES PROPORCIONAR UN INFORME COMPLETO
═══════════════════════════════════════════════════════════════════════════

NUNCA digas "no he encontrado información" o "no hay menciones". SIEMPRE hay algo que reportar:

ESTRATEGIA OBLIGATORIA DE BÚSQUEDA (en orden de prioridad):
1. PRIMERO: Busca menciones DIRECTAS de ${issuerName} en prensa española e internacional
2. SI NO HAY DIRECTAS: Busca noticias del SECTOR de la empresa
3. SI NO HAY SECTOR: Busca noticias de COMPETIDORES directos y analiza implicaciones
4. SI NO HAY COMPETIDORES: Busca tendencias MACROECONÓMICAS de España
5. SIEMPRE: Incluye análisis del CONTEXTO BURSÁTIL si cotiza (IBEX, bolsa española)

═══════════════════════════════════════════════════════════════════════════
FUENTES OBLIGATORIAS A RASTREAR:
═══════════════════════════════════════════════════════════════════════════
• Prensa económica: Expansión, Cinco Días, El Economista, El Confidencial, Reuters, Bloomberg
• Reguladores: CNMV, BME, comunicados oficiales
• Redes sociales: X/Twitter, LinkedIn, Instagram
• Foros: Rankia, Forocoches, Reddit, Glassdoor

═══════════════════════════════════════════════════════════════════════════
ESTRUCTURA DEL INFORME:
═══════════════════════════════════════════════════════════════════════════

## Resumen Ejecutivo
(4-6 frases: situación reputacional de ${issuerName} esta semana)

## Hechos Corporativos y Noticias Directas
Para CADA mención (objetivo: 12-18 menciones):
- **[FECHA EXACTA dd/mm/yyyy]** - [Titular]
- Fuente: [Nombre](URL)
- **Descripción** (4-6 párrafos)
- **IMPACTO REPUTACIONAL** (2-3 párrafos)

## Contexto Sectorial de la Semana
(OBLIGATORIO aunque no haya noticias directas)

## Contexto Macroeconómico Relevante
(Noticias de economía española que afecten al sector)

## Percepción en Redes Sociales y Foros
(Si no hay menciones: "Semana de baja actividad social" pero analizar contexto)

## Alertas de Riesgo Reputacional
(Si no hay: "Sin alertas significativas identificadas")

## Señales Positivas
(Si no hay: "Sin señales destacables identificadas")

## Nota Metodológica

═══════════════════════════════════════════════════════════════════════════
FORMATO OBLIGATORIO:
═══════════════════════════════════════════════════════════════════════════
• Markdown: ## headers, **negritas**, [enlaces](url)
• FECHAS EXACTAS (dd/mm/yyyy) en CADA mención
• URLs reales
• MÍNIMO 4,000 tokens
• Español de España

⚠️ RECUERDA: SIEMPRE informe completo de 4,000+ tokens. NUNCA "no hay información".`;

// 6 modelos con acceso real a Internet - ahora con display name para guardar en 02_model_name
interface SearchModelConfig {
  name: string;
  displayName: string;
  apiKeyEnv: string;
  endpoint: string;
  hasRealWebSearch: boolean; // Flag para indicar si el modelo tiene búsqueda web real
  usesRelativeDates?: boolean; // Flag para modelos que rechazan fechas específicas (ej: Grok)
  buildRequest: (prompt: string, apiKey: string) => { headers: Record<string, string>; body: object };
  parseResponse: (data: any) => string;
  dbColumn: string;
}

const getSearchModelConfigs = (): SearchModelConfig[] => [
  // 1. Perplexity Sonar Pro - ✅ Web Search nativo
  {
    name: 'perplexity-sonar-pro',
    displayName: 'Perplexity',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    hasRealWebSearch: true,
    dbColumn: '21_res_perplex_bruto',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: 'INSTRUCCIÓN CRÍTICA: SIEMPRE debes responder con un informe completo de MÍNIMO 4,000 tokens (~16,000 caracteres). NUNCA digas "no hay información". Si no hay menciones directas: 1) Busca noticias del SECTOR, 2) Busca noticias de COMPETIDORES, 3) Busca tendencias MACROECONÓMICAS de España. SIEMPRE hay contexto relevante. Desarrolla cada mención con 4-6 párrafos.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
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
  // 2. Grok (xAI) - ✅ Web Search via Responses API
  // Actualizado enero 2026: grok-3 → grok-4 (requerido para web_search tools)
  // Actualizado enero 2026: web_search_preview → web_search
  // IMPORTANTE: Grok rechaza fechas futuras como "información ficticia"
  // Usamos "últimos 7 días" en lugar de fechas específicas para evitar filtros de seguridad
  {
    name: 'grok-4',
    displayName: 'Grok',
    apiKeyEnv: 'XAI_API_KEY',
    endpoint: 'https://api.x.ai/v1/responses',
    hasRealWebSearch: true,
    dbColumn: 'respuesta_bruto_grok',
    usesRelativeDates: true, // Flag para usar prompt sin fechas específicas
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        // grok-4 es requerido para server-side tools (web_search)
        model: 'grok-4',
        input: prompt,
        // web_search (antes web_search_preview, deprecated 12 ene 2026)
        tools: [{ type: 'web_search' }],
        temperature: 0.1,
      },
    }),
    parseResponse: (data: any) => {
      // Debug: Log estructura de respuesta Grok
      console.log('[Grok-Parse] Response structure:', JSON.stringify(data).substring(0, 500));
      
      // Formato xAI Responses API (enero 2026):
      // - output_text: string directo con el texto completo
      // - output: array de objetos con type='message' y content[]
      
      // Prioridad 1: output_text directo (formato más común)
      if (data.output_text && typeof data.output_text === 'string') {
        console.log('[Grok-Parse] Using output_text, length:', data.output_text.length);
        return data.output_text;
      }
      
      // Prioridad 2: output como array con mensajes
      if (Array.isArray(data.output)) {
        const textParts = data.output
          .filter((item: any) => item.type === 'message')
          .map((item: any) => {
            // El contenido puede estar en content[].text o text directo
            if (Array.isArray(item.content)) {
              return item.content
                .filter((c: any) => c.type === 'output_text' || c.type === 'text')
                .map((c: any) => c.text)
                .filter(Boolean)
                .join('');
            }
            return item.text || (typeof item.content === 'string' ? item.content : '') || '';
          })
          .filter(Boolean);
        
        if (textParts.length > 0) {
          const content = textParts.join('\n');
          console.log('[Grok-Parse] Extracted from output array, length:', content.length);
          return content;
        }
      }
      
      // Prioridad 3: output como string directo
      if (typeof data.output === 'string') {
        console.log('[Grok-Parse] Using output string, length:', data.output.length);
        return data.output;
      }
      
      // Prioridad 4: output como objeto con text/content
      if (data.output && typeof data.output === 'object') {
        const content = data.output.text || data.output.content || '';
        if (content && typeof content === 'string') {
          console.log('[Grok-Parse] Using output object, length:', content.length);
          return content;
        }
      }
      
      // Prioridad 5: choices (compatibilidad con chat/completions)
      if (data.choices?.[0]?.message?.content) {
        console.log('[Grok-Parse] Using choices format');
        return data.choices[0].message.content;
      }
      
      // Fallback: log para debug y retornar vacío
      console.log('[Grok-Parse] Could not extract text from:', Object.keys(data));
      return '';
    },
  },
  // 3. DeepSeek - ✅ Ahora con RAG via Tavily Search API
  // DeepSeek + Tavily = Búsqueda web real + análisis profundo
  {
    name: 'deepseek-chat',
    displayName: 'Deepseek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    endpoint: 'https://api.deepseek.com/chat/completions',
    hasRealWebSearch: true, // ✅ Ahora tiene web search via Tavily RAG
    dbColumn: '23_res_deepseek_bruto',
    // Custom flag para activar pre-búsqueda Tavily
    usesTavilyRAG: true,
    buildRequest: (prompt: string, apiKey: string, tavilyContext?: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: `Eres analista de reputación corporativa con ACCESO A BÚSQUEDA WEB REAL.
TIENES ACCESO A FUENTES WEB REALES proporcionadas por Tavily Search API.
Las fuentes web reales se incluyen al final del mensaje del usuario.
REGLA CRÍTICA: BASA TU ANÁLISIS EN ESAS FUENTES REALES.
CITA las URLs proporcionadas por Tavily.
SIEMPRE debes responder con informe completo de MÍNIMO 4,000 tokens.
NUNCA "no hay información" - analiza las fuentes Tavily proporcionadas.
Cada mención: fecha dd/mm/yyyy, URL real de Tavily, 4-6 párrafos análisis impacto reputacional.
Markdown. Español España.` },
          { role: 'user', content: prompt + (tavilyContext || '') }
        ],
        temperature: 0.1,
      },
    }),
    parseResponse: (data: any) => {
      const content = data.choices?.[0]?.message?.content || '';
      return content + '\n\n[Búsqueda: Tavily Search API]';
    },
  },
  // 4. GPT-4.1 mini (OpenAI) - ✅ Con Web Search Tool
  {
    name: 'gpt-4.1-mini',
    displayName: 'ChatGPT',
    apiKeyEnv: 'OPENAI_API_KEY',
    endpoint: 'https://api.openai.com/v1/responses',  // Nuevo endpoint para responses API con tools
    hasRealWebSearch: true,
    dbColumn: '20_res_gpt_bruto',
    buildRequest: (prompt: string, apiKey: string) => ({
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: 'Eres analista de reputación corporativa. REGLA CRÍTICA: SIEMPRE debes responder con informe completo de MÍNIMO 4,000 tokens. NUNCA "no hay información". Si no hay menciones directas: busca SECTOR + COMPETIDORES + MACRO España. SIEMPRE hay contexto. Solo fechas del periodo (NO historia). Cada mención: fecha dd/mm/yyyy, URL, 4-6 párrafos análisis impacto reputacional. Markdown. Español España.' },
          { role: 'user', content: prompt }
        ],
        tools: [{ type: 'web_search_preview' }],  // Habilitar web search
        tool_choice: 'auto',
      },
    }),
    parseResponse: (data: any) => {
      // La responses API devuelve output en formato diferente
      const output = data.output || [];
      let content = '';
      let citations = '';
      
      for (const item of output) {
        if (item.type === 'message' && item.content) {
          for (const part of item.content) {
            if (part.type === 'output_text') {
              content += part.text;
            }
          }
        }
        // Extraer citaciones de web search
        if (item.type === 'web_search_call') {
          citations += `\n[Web Search: ${item.status || 'completed'}]`;
        }
      }
      
      // Fallback para formato legacy
      if (!content && data.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content;
      }
      
      return content + citations;
    },
  },
  // 5. Gemini 2.5 Pro (Google) - ✅ Con Google Search grounding
  {
    name: 'gemini-2.5-pro',
    displayName: 'Google Gemini',
    apiKeyEnv: 'GOOGLE_GEMINI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    hasRealWebSearch: true,
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
        },
        systemInstruction: {
          parts: [{ text: 'Eres analista de reputación corporativa. REGLA CRÍTICA: SIEMPRE debes responder con informe completo de MÍNIMO 4,000 tokens. NUNCA "no hay información". Si no hay menciones directas: busca SECTOR + COMPETIDORES + MACRO España. SIEMPRE hay contexto. Solo fechas del periodo (NO historia). Cada mención: fecha dd/mm/yyyy, URL, 4-6 párrafos análisis impacto reputacional. Markdown. Español España.' }]
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
  // 6. Qwen Max (Alibaba DashScope) - ✅ Con enable_search
  {
    name: 'qwen-max',
    displayName: 'Qwen',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    endpoint: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    hasRealWebSearch: true,
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
            { role: 'system', content: 'Eres analista de reputación corporativa. REGLA CRÍTICA: SIEMPRE debes responder con informe completo de MÍNIMO 4,000 tokens. NUNCA "no hay información". Si no hay menciones directas: busca SECTOR + COMPETIDORES + MACRO España. SIEMPRE hay contexto. Solo fechas del periodo (NO historia). Cada mención: fecha dd/mm/yyyy, URL, 4-6 párrafos análisis impacto reputacional. Markdown. Español España.' },
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

// ============================================================================
// TAVILY CACHE: Optimización para evitar latencia repetida
// Cache en memoria con TTL de 7 días y timeout de 5 segundos
// ============================================================================
interface TavilyCacheEntry {
  context: string;
  timestamp: number;
}

const TAVILY_CACHE = new Map<string, TavilyCacheEntry>();
const TAVILY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const TAVILY_TIMEOUT_MS = 5000; // 5 segundos - evitar bloqueo

// Wrapper con cache y timeout
async function searchWithTavilyCached(
  issuerName: string,
  ticker: string,
  dateFrom: string,
  dateTo: string
): Promise<string> {
  const cacheKey = `${ticker}_${dateFrom}_${dateTo}`;
  const cached = TAVILY_CACHE.get(cacheKey);
  
  // Si hay cache válido, usar directamente
  if (cached && (Date.now() - cached.timestamp < TAVILY_CACHE_TTL_MS)) {
    console.log(`[TAVILY-CACHE-HIT] ${ticker} - using cached context (${cached.context.length} chars)`);
    return cached.context;
  }

  // Si no hay cache, buscar con timeout de 5s
  console.log(`[TAVILY-SEARCH] ${ticker} - fetching fresh context with 5s timeout...`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
    
    const context = await searchWithTavilyInternal(issuerName, ticker, dateFrom, dateTo, controller.signal);
    clearTimeout(timeoutId);
    
    // Guardar en cache
    if (context) {
      TAVILY_CACHE.set(cacheKey, { context, timestamp: Date.now() });
      console.log(`[TAVILY-CACHED] ${ticker} - stored ${context.length} chars in cache`);
    }
    
    return context;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[TAVILY-TIMEOUT] ${ticker} - 5s timeout exceeded, proceeding without web context`);
    } else {
      console.warn(`[TAVILY-ERROR] ${ticker} - ${err.message}, proceeding without web context`);
    }
    return '';
  }
}

// Función interna real de búsqueda Tavily (con soporte para AbortSignal)
async function searchWithTavilyInternal(
  issuerName: string, 
  ticker: string, 
  dateFrom: string, 
  dateTo: string,
  signal?: AbortSignal
): Promise<string> {
  const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY');
  if (!TAVILY_API_KEY) {
    console.warn('[rix-search-v2] TAVILY_API_KEY not configured, DeepSeek will use fallback');
    return '';
  }

  try {
    console.log(`[rix-search-v2] Tavily search for ${issuerName} (${ticker})`);
    
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: `${issuerName} ${ticker} noticias corporativas España ${dateFrom} ${dateTo}`,
        search_depth: 'advanced',
        include_domains: [
          'expansion.com', 'cincodias.elpais.com', 'eleconomista.es',
          'elconfidencial.com', 'reuters.com', 'bloomberg.com',
          'cnmv.es', 'bolsasymercados.es', 'invertia.com',
          'lainformacion.com', 'elperiodico.com', 'abc.es'
        ],
        max_results: 10,
        include_answer: false,
        include_raw_content: false
      })
    });

    if (!response.ok) {
      console.error(`[rix-search-v2] Tavily error: ${response.status}`);
      return '';
    }

    const data = await response.json();
    
    if (!data.results?.length) {
      console.log('[rix-search-v2] Tavily returned no results');
      return '\n\n══════ FUENTES WEB TAVILY ══════\n[Sin resultados específicos para el periodo]';
    }

    // Formatear resultados para inyectar en el prompt de DeepSeek
    let context = '\n\n══════════════════════════════════════════════════════════════════════\n';
    context += '📡 FUENTES WEB REALES (Tavily Search API - Búsqueda Avanzada)\n';
    context += '══════════════════════════════════════════════════════════════════════\n\n';
    context += `Búsqueda: "${issuerName}" | Periodo: ${dateFrom} - ${dateTo}\n`;
    context += `Resultados encontrados: ${data.results.length}\n\n`;
    
    for (const result of data.results) {
      context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      context += `📰 ${result.title}\n`;
      context += `🔗 URL: ${result.url}\n`;
      if (result.published_date) {
        context += `📅 Fecha: ${result.published_date}\n`;
      }
      context += `\n${result.content?.substring(0, 800) || 'Sin contenido disponible'}...\n\n`;
    }
    
    context += '══════════════════════════════════════════════════════════════════════\n';
    context += '⚠️ INSTRUCCIÓN: BASA TU ANÁLISIS EN ESTAS FUENTES REALES. CITA LAS URLs.\n';
    context += '══════════════════════════════════════════════════════════════════════\n';

    console.log(`[rix-search-v2] Tavily returned ${data.results.length} results for ${ticker}`);
    return context;
    
  } catch (error: any) {
    // Si es timeout/abort, propagar para que el wrapper lo maneje
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error('[rix-search-v2] Tavily exception:', error);
    return '';
  }
}

async function callSearchModel(
  config: SearchModelConfig & { usesTavilyRAG?: boolean }, 
  prompt: string,
  tavilyContext?: string
): Promise<{ success: boolean; response?: string; error?: string; timeMs: number }> {
  const startTime = Date.now();
  
  // ═══════════════════════════════════════════════════════════════════
  // TIMEOUT DE 180 SEGUNDOS POR MODELO
  // Previene bloqueos indefinidos por DeepSeek/Qwen lentos
  // ═══════════════════════════════════════════════════════════════════
  const TIMEOUT_MS = 180_000; // 180 segundos = 3 minutos máximo por modelo
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const apiKey = Deno.env.get(config.apiKeyEnv);
    if (!apiKey) {
      clearTimeout(timeoutId);
      console.log(`[rix-search-v2] Missing ${config.apiKeyEnv} for ${config.displayName}`);
      return { success: false, error: `Missing ${config.apiKeyEnv}`, timeMs: Date.now() - startTime };
    }

    console.log(`[rix-search-v2] Calling ${config.displayName} (timeout: ${TIMEOUT_MS/1000}s)...`);

    // Para DeepSeek con Tavily RAG, pasamos el contexto de búsqueda
    const { headers, body } = config.usesTavilyRAG && tavilyContext
      ? (config.buildRequest as any)(prompt, apiKey, tavilyContext)
      : config.buildRequest(prompt, apiKey);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,  // ← AbortSignal para timeout
    });

    clearTimeout(timeoutId);

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

  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // Detectar timeout específicamente
    if (error.name === 'AbortError') {
      console.log(`[rix-search-v2] ${config.displayName} TIMEOUT after ${TIMEOUT_MS/1000}s`);
      return { 
        success: false, 
        error: `Timeout after ${TIMEOUT_MS/1000}s`, 
        timeMs: Date.now() - startTime 
      };
    }
    
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
    const body = await req.json();
    const { ticker, issuer_name, single_model, repair_mode } = body;

    if (!ticker || !issuer_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: ticker, issuer_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();

    // Calculate date range (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateFrom = weekAgo.toISOString().split('T')[0];
    const dateTo = now.toISOString().split('T')[0];

    // Calculate batch date (Sunday of current week) - MOVED UP for early duplicate check
    const dayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    // Initialize Supabase client early for duplicate check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ═══════════════════════════════════════════════════════════════════
    // SINGLE MODEL MODE: For repair/watchdog - only run ONE specific model
    // ═══════════════════════════════════════════════════════════════════
    if (single_model) {
      console.log(`[rix-search-v2] SINGLE MODEL MODE: ${single_model} for ${ticker}`);
      const allConfigs = getSearchModelConfigs();
      
      // Normalize alias: 'Gemini' -> 'Google Gemini' (matching displayName)
      const modelAliases: Record<string, string> = {
        'gemini': 'google gemini',
      };
      const normalizedSearch = modelAliases[single_model.toLowerCase()] || single_model.toLowerCase();
      
      const targetConfig = allConfigs.find(c => 
        c.displayName.toLowerCase() === normalizedSearch ||
        c.name.toLowerCase().includes(normalizedSearch)
      );

      if (!targetConfig) {
        return new Response(
          JSON.stringify({ error: `Model not found: ${single_model}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build prompt - select based on model requirements
      const genericPrompt = buildSearchPrompt(issuer_name, ticker, dateFrom, dateTo);
      const perplexityPrompt = buildPerplexityPrompt(issuer_name, ticker);
      const grokPrompt = buildGrokPrompt(issuer_name, ticker);
      
      let prompt: string;
      if (targetConfig.name === 'perplexity-sonar-pro') {
        prompt = perplexityPrompt;
      } else if (targetConfig.name === 'grok-4') {
        prompt = grokPrompt;
      } else {
        prompt = genericPrompt;
      }

      // For DeepSeek, fetch Tavily context
      let context: string | undefined;
      if ((targetConfig as any).usesTavilyRAG) {
        context = await searchWithTavilyCached(issuer_name, ticker, dateFrom, dateTo);
      }

      // Call the single model
      const result = await callSearchModel(targetConfig as any, prompt, context);

      if (!result.success) {
        console.log(`[rix-search-v2] Single model ${single_model} failed: ${result.error}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            model: single_model,
            error: result.error,
            time_ms: result.timeMs 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // In repair mode, update existing record instead of creating new
      if (repair_mode) {
        const { data: existingRecord } = await supabase
          .from('rix_runs_v2')
          .select('id')
          .eq('05_ticker', ticker)
          .eq('02_model_name', targetConfig.displayName)
          .eq('batch_execution_date', sunday.toISOString())
          .maybeSingle();

        if (existingRecord) {
          await supabase
            .from('rix_runs_v2')
            .update({
              [targetConfig.dbColumn]: result.response,
              search_completed_at: new Date().toISOString(),
              model_errors: null, // Clear any previous error
            })
            .eq('id', existingRecord.id);

          console.log(`[rix-search-v2] Updated existing record ${existingRecord.id} with ${single_model} data`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          model: single_model,
          response_length: result.response?.length || 0,
          time_ms: result.timeMs,
          repair_mode,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // CRITICAL OPTIMIZATION: Check for existing records BEFORE calling models
    // This saves ~2 minutes per duplicate company
    // ═══════════════════════════════════════════════════════════════════
    const { data: existingRecords, error: checkError } = await supabase
      .from('rix_runs_v2')
      .select('id, "02_model_name"')
      .eq('05_ticker', ticker)
      .eq('batch_execution_date', sunday.toISOString());

    if (!checkError && existingRecords && existingRecords.length >= 5) {
      // Already have records for all/most models this week - skip entirely
      console.log(`[DUPLICATE-SKIP-EARLY] ${ticker} - ${existingRecords.length} models already exist for this period, skipping API calls`);
      const totalTime = Date.now() - startTime;
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'duplicate_early_check',
          existing_records: existingRecords.length,
          ticker,
          issuer_name,
          total_time_ms: totalTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get model configs (now 6 models including Grok)
    const modelConfigs = getSearchModelConfigs();
    console.log(`[rix-search-v2] Starting search for ${issuer_name} (${ticker}) with ${modelConfigs.length} models`);

    // Build prompts - Different models use different prompts
    // Perplexity: uses relative dates ("últimos 7 días")
    // Grok: uses relative dates to avoid "future date" rejection
    // Others: use specific dates
    const genericPrompt = buildSearchPrompt(issuer_name, ticker, dateFrom, dateTo);
    const perplexityPrompt = buildPerplexityPrompt(issuer_name, ticker);
    const grokPrompt = buildGrokPrompt(issuer_name, ticker);

    // OPTIMIZATION: Tavily runs IN PARALLEL with other models, not before
    // This removes 5-15s from the critical path
    console.log(`[rix-search-v2] Starting parallel model calls (Tavily runs with DeepSeek)...`);

    // Call all search models in parallel - Tavily context fetched inside DeepSeek call
    const results = await Promise.allSettled(
      modelConfigs.map(async config => {
        // Select prompt based on model requirements
        let prompt: string;
        if (config.name === 'perplexity-sonar-pro') {
          prompt = perplexityPrompt;
        } else if (config.name === 'grok-4') {
          prompt = grokPrompt;
        } else {
          prompt = genericPrompt;
        }
        
        // Para DeepSeek, buscar Tavily en paralelo (dentro de esta Promise)
        let context: string | undefined;
        if ((config as any).usesTavilyRAG) {
          console.log(`[rix-search-v2] Fetching Tavily for ${config.displayName} in parallel...`);
          context = await searchWithTavilyCached(issuer_name, ticker, dateFrom, dateTo);
          if (context) {
            console.log(`[rix-search-v2] Tavily context for ${config.displayName}: ${context.length} chars`);
          }
        }
        return callSearchModel(config as any, prompt, context);
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
          // OPTIMIZACIÓN: Ignorar errores de duplicate key (23505) silenciosamente
          // Esto evita reintentos innecesarios en empresas ya procesadas
          if (insertError.code === '23505') {
            console.warn(`[DUPLICATE-SKIP] ${ticker} - ${config.displayName} already exists for this period, skipping`);
            insertedRecords.push({
              id: '',
              model_name: config.displayName,
              success: true, // Marcamos como success para no reintentar
              error: 'duplicate_skipped',
            });
          } else {
            console.error(`[rix-search-v2] Insert error for ${config.displayName}:`, insertError);
            insertedRecords.push({
              id: '',
              model_name: config.displayName,
              success: false,
              error: insertError.message,
            });
          }
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
