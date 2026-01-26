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
  timeout: number = 120000
): Promise<AICallResult> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  
  // Model mapping: OpenAI → Gemini equivalent
  const modelMapping: Record<string, string> = {
    'o3': 'gemini-2.5-flash',
    'gpt-4o-mini': 'gemini-2.5-flash-lite',
    'gpt-4o': 'gemini-2.5-flash',
  };
  
  // 1. Try OpenAI first
  if (openAIApiKey) {
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
    console.warn(`${logPrefix} No OpenAI API key, using Gemini directly...`);
  }
  
  // 2. Fallback to Gemini
  if (!geminiApiKey) {
    throw new Error('Both OpenAI and Gemini API keys are not configured');
  }
  
  const geminiModel = modelMapping[model] || 'gemini-2.5-flash';
  console.log(`${logPrefix} Using Gemini fallback (${geminiModel})...`);
  
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
    }
  );
  
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
// DEPTH-BASED PROMPT INSTRUCTIONS (PYRAMID STRUCTURE)
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

### 3.2 Desglose de Métricas
Para cada métrica relevante (solo si hay datos):
- **NVM (Narrativa y Visibilidad Mediática)**: [Score] - [Interpretación ejecutiva]
- **DRM (Reputación Digital)**: [Score] - [Interpretación ejecutiva]
- **SIM (Imagen Social)**: [Score] - [Interpretación ejecutiva]
- **RMM (Riesgo y Gestión de Crisis)**: [Score] - [Interpretación ejecutiva]
- **CEM (Comunicación y Engagement)**: [Score] - [Interpretación ejecutiva]
- **GAM (Gobierno y Transparencia)**: [Score] - [Interpretación ejecutiva]
- **DCM (Diferenciación Competitiva)**: [Score] - [Interpretación ejecutiva]
- **CXM (Experiencia de Cliente)**: [Score] - [Interpretación ejecutiva]

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
// DRUMROLL QUESTION GENERATOR (Complementary Report Suggestion)
// =============================================================================
interface DrumrollQuestion {
  title: string;
  fullQuestion: string;
  teaser: string;
  reportType: 'competitive' | 'vulnerabilities' | 'projection' | 'sector';
}

async function generateDrumrollQuestion(
  originalQuestion: string,
  generatedAnswer: string,
  detectedCompanies: { ticker: string; issuer_name: string; sector_category?: string }[],
  allCompaniesCache: any[] | null,
  language: string,
  languageName: string,
  logPrefix: string
): Promise<DrumrollQuestion | null> {
  
  // Solo generar para preguntas corporativas con suficiente contexto
  if (detectedCompanies.length === 0) {
    console.log(`${logPrefix} No drumroll: no companies detected`);
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
  
  const drumrollPrompt = `Acabas de generar un análisis sobre: "${originalQuestion}"

CONTEXTO:
- Empresa principal analizada: ${primaryCompany.issuer_name} (${primaryCompany.ticker})
- Sector: ${sectorInfo || 'No específico'}
- Competidores en el sector: ${competitors.join(', ') || 'No identificados'}
- Otras empresas mencionadas: ${detectedCompanies.slice(1).map(c => c.issuer_name).join(', ') || 'Ninguna'}

EXTRACTO DE LA RESPUESTA GENERADA (primeros 500 chars):
${generatedAnswer.substring(0, 500)}...

TU MISIÓN: Proponer UN informe complementario de ALTO VALOR que el usuario NO pidió pero NECESITA para completar su visión estratégica.

TIPOS DE INFORMES (elige el más valioso dado el contexto):
1. **competitive**: Mapa competitivo con rivales directos - IDEAL si analizó una empresa sola
2. **vulnerabilities**: Análisis profundo de puntos débiles detectados - IDEAL si hay métricas bajas
3. **projection**: Escenarios futuros basados en tendencias - IDEAL si hay evolución temporal
4. **sector**: Panorama completo del sector con todos los players - IDEAL si preguntó por una empresa específica

REGLAS CRÍTICAS:
- El informe debe COMPLEMENTAR, no repetir lo ya dicho
- Debe revelar algo NO OBVIO que emerja de cruzar datos
- El título debe ser MAGNÉTICO y específico (max 12 palabras)
- El teaser debe generar CURIOSIDAD inmediata sin revelarlo todo
- La fullQuestion debe ser ejecutable directamente en el chat

IDIOMA: Genera TODO en ${languageName}

Responde SOLO en JSON válido (sin markdown):
{
  "title": "Título magnético del informe sugerido",
  "fullQuestion": "La pregunta exacta que el usuario debería hacer para obtener este informe (en ${languageName})",
  "teaser": "1-2 frases que adelanten el valor sin revelarlo todo",
  "reportType": "competitive|vulnerabilities|projection|sector"
}`;

  try {
    const result = await callAISimple(
      [
        { role: 'system', content: `Eres un estratega de inteligencia competitiva de élite. Propones análisis de alto valor que complementan lo ya analizado. Responde SOLO en JSON válido sin bloques de código.` },
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
      console.log(`${logPrefix} Drumroll question generated: "${parsed.title}" (${parsed.reportType})`);
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

### Glosario de Métricas
- **Calidad de la Narrativa (NVM)**: Mide cuánto y cómo aparece la empresa en las respuestas de las IAs, evaluando tono y sentimiento
- **Fortaleza de Evidencia (DRM)**: Mide la solidez documental y la calidad de las fuentes primarias citadas
- **Autoridad de Fuentes (SIM)**: Mide la mezcla de fuentes por tiers (reguladores, prensa financiera, generalistas, redes)
- **Actualidad y Empuje (RMM)**: Mide qué tan recientes son los datos y el momentum de la reputación
- **Controversia y Riesgo (CEM)**: Mide exposición a riesgos judiciales, políticos y laborales (100 = sin riesgo)
- **Independencia de Gobierno (GAM)**: Mide percepción de buenas prácticas de gobierno corporativo
- **Integridad del Grafo (DCM)**: Mide la consistencia y coherencia de la información sobre la empresa
- **Ejecución Corporativa (CXM)**: Mide percepción de la ejecución en mercado y resultados (solo cotizadas)

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
      depthLevel = 'complete' // NEW: depth level parameter
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
        supabaseClient,
        openAIApiKey,
        sessionId,
        logPrefix,
        userId,
        conversationId
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
      depthLevel // NEW: pass depth level
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

**EXPLICA SIEMPRE LAS MÉTRICAS RepIndex:**
El lector NO conoce de memoria qué significa cada métrica. SIEMPRE incluye una explicación breve cuando menciones cualquier métrica:

- **NVM (Narrativa y Visibilidad Mediática)**: Mide la presencia y calidad de cobertura en medios
- **DRM (Reputación Digital)**: Evalúa la huella digital y percepción online
- **SIM (Imagen Social)**: Analiza la responsabilidad social y percepción ciudadana
- **RMM (Riesgo y Gestión de Crisis)**: Mide la vulnerabilidad a crisis reputacionales
- **CEM (Comunicación y Engagement)**: Evalúa la efectividad comunicativa
- **GAM (Gobierno y Transparencia)**: Mide la gobernanza corporativa
- **DCM (Diferenciación Competitiva)**: Evalúa el posicionamiento vs competencia
- **CXM (Experiencia de Cliente)**: Mide la percepción del cliente/usuario

Cuando menciones un score (ej: "CEM: 72"), añade contexto: "CEM (Comunicación y Engagement): 72 puntos, lo que indica..."

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
      metadata: { roleId, roleName },
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
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  conversationId: string | undefined
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

  // 2. Get competitors (same sector + same ibex_family)
  const competitors = companiesCache?.filter(c => 
    c.ticker !== matchedCompany.ticker && (
      (matchedCompany.sector_category && c.sector_category === matchedCompany.sector_category) ||
      (matchedCompany.ibex_family_code && c.ibex_family_code === matchedCompany.ibex_family_code)
    )
  ).slice(0, 8) || [];

  console.log(`${logPrefix} Found ${competitors.length} competitors`);

  // 3. Get all tickers to fetch (company + competitors)
  const allTickers = [matchedCompany.ticker, ...competitors.map(c => c.ticker)];

  // 4. Fetch 4 weeks of data for company and competitors with ALL metrics
  const { data: rixData, error: rixError } = await supabaseClient
    .from('rix_runs')
    .select(`
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
    `)
    .in('"05_ticker"', allTickers)
    .order('batch_execution_date', { ascending: false })
    .limit(800);

  if (rixError) {
    console.error(`${logPrefix} Error fetching RIX data:`, rixError);
    throw rixError;
  }

  console.log(`${logPrefix} Fetched ${rixData?.length || 0} RIX records for bulletin`);

  // 5. Organize data by week and company
  const getPeriodKey = (run: any) => `${run["06_period_from"]}|${run["07_period_to"]}`;
  const uniquePeriods = [...new Set(rixData?.map(getPeriodKey) || [])]
    .sort((a, b) => b.split('|')[1].localeCompare(a.split('|')[1]))
    .slice(0, 4); // Last 4 weeks

  console.log(`${logPrefix} Unique periods found: ${uniquePeriods.length}`);

  // 6. Build bulletin context
  let bulletinContext = '';

  // Company info
  bulletinContext += `📌 EMPRESA PRINCIPAL:\n`;
  bulletinContext += `- Nombre: ${matchedCompany.issuer_name}\n`;
  bulletinContext += `- Ticker: ${matchedCompany.ticker}\n`;
  bulletinContext += `- Sector: ${matchedCompany.sector_category || 'No especificado'}\n`;
  bulletinContext += `- Categoría IBEX: ${matchedCompany.ibex_family_code || 'No IBEX'}\n`;
  bulletinContext += `- Cotiza en bolsa: ${matchedCompany.cotiza_en_bolsa ? 'Sí' : 'No'}\n\n`;

  // Competitors info
  bulletinContext += `🏢 COMPETIDORES (${competitors.length}):\n`;
  competitors.forEach((c, idx) => {
    bulletinContext += `${idx + 1}. ${c.issuer_name} (${c.ticker}) - ${c.sector_category || 'Sin sector'}\n`;
  });
  bulletinContext += '\n';

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
  console.log(`${logPrefix} Calling OpenAI for bulletin generation...`);
  
  const bulletinUserPrompt = `Genera un BOLETÍN EJECUTIVO completo para la empresa ${matchedCompany.issuer_name} (${matchedCompany.ticker}).

CONTEXTO CON TODOS LOS DATOS:
${bulletinContext}

Usa SOLO estos datos para generar el boletín. Sigue el formato exacto especificado en tus instrucciones.`;

  const bulletinMessages = [
    { role: 'system', content: BULLETIN_SYSTEM_PROMPT },
    { role: 'user', content: bulletinUserPrompt }
  ];

  const result = await callAIWithFallback(bulletinMessages, 'o3', 40000, logPrefix, 180000);
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
    metadata: { companyName: matchedCompany.issuer_name, ticker: matchedCompany.ticker },
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
        competitorsCount: competitors.length,
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
  depthLevel: 'quick' | 'complete' | 'exhaustive' = 'complete'
) {
  console.log(`${logPrefix} Depth level: ${depthLevel}`);
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
    console.log(`${logPrefix} Loading FULL DATA (including raw texts) for detected companies...`);
    
    for (const company of detectedCompanies.slice(0, 8)) { // Aumentado de 5 a 8 empresas
      const { data: companyData, error: companyError } = await supabaseClient
        .from('rix_runs')
        .select(`
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
          "46_cxm_categoria"
        `)
        .eq('"05_ticker"', company.ticker)
        .order('batch_execution_date', { ascending: false })
        .limit(32); // 4 models × 8 weeks - más historial
      
      if (!companyError && companyData) {
        console.log(`${logPrefix} Loaded ${companyData.length} full records for ${company.issuer_name}`);
        detectedCompanyFullData.push(...companyData);
      }
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
  // PASO 5: CARGAR DATOS ESTRUCTURADOS (últimas 2 semanas para ranking)
  // =============================================================================
  console.log(`${logPrefix} Loading structured RIX data for rankings...`);
  
  const { data: allRixData, error: rixError } = await supabaseClient
    .from('rix_runs')
    .select(`
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
    `)
    .order('batch_execution_date', { ascending: false })
    .limit(50000); // BASE DE DATOS COMPLETA - sin límite práctico

  if (rixError) {
    console.error(`${logPrefix} Error loading RIX data:`, rixError);
    throw rixError;
  }

  console.log(`${logPrefix} Total RIX records loaded: ${allRixData?.length || 0}`);

  // =============================================================================
  // PASO 6: CONSTRUIR CONTEXTO COMPLETO PARA EL LLM
  // =============================================================================
  let context = '';

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
      
      records.slice(0, 4).forEach(r => {
        const rix = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
        context += `| ${r["02_model_name"]} | ${rix ?? '-'} | ${r["23_nvm_score"] ?? '-'} | ${r["26_drm_score"] ?? '-'} | ${r["29_sim_score"] ?? '-'} | ${r["32_rmm_score"] ?? '-'} | ${r["35_cem_score"] ?? '-'} | ${r["38_gam_score"] ?? '-'} | ${r["41_dcm_score"] ?? '-'} | ${r["44_cxm_score"] ?? '-'} |\n`;
      });
      
      // Include raw text excerpts (most recent per model)
      context += `\n### Análisis de cada modelo IA:\n`;
      records.slice(0, 4).forEach(r => {
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
                    LAS 8 MÉTRICAS DIMENSIONALES
═══════════════════════════════════════════════════════════════════════════════

SIEMPRE explica cada métrica en su PRIMERA MENCIÓN. Después usa la sigla.

• NVM (Narrativa y Visibilidad Mediática): mide la presencia y calidad de 
  la cobertura en medios tradicionales, especializados y respuestas de IA.

• DRM (Reputación Digital): evalúa la huella digital y la percepción online, 
  incluyendo redes sociales, foros y amplificación orgánica de marca.

• SIM (Imagen Social): analiza la responsabilidad social corporativa y la 
  percepción ciudadana de la marca como actor social.

• RMM (Riesgo y Gestión de Crisis): mide la vulnerabilidad percibida y la 
  capacidad de respuesta ante crisis reputacionales.

• CEM (Comunicación y Engagement): evalúa la efectividad comunicativa y la 
  exposición al riesgo. Un CEM de 90-100 = ALTA exposición a crisis.

• GAM (Gobierno y Transparencia): mide la calidad de la gobernanza 
  corporativa y la transparencia informativa.

• DCM (Diferenciación Competitiva): evalúa el posicionamiento único frente 
  a competidores directos.

• CXM (Experiencia de Cliente): mide la satisfacción, confianza y percepción 
  del cliente/usuario final.

ESCALA RIX GLOBAL (0-100):
• 80-100: Excelencia reputacional
• 65-79: Reputación sólida  
• 50-64: Reputación moderada
• 35-49: Reputación vulnerable
• 0-34: Reputación crítica

EJEMPLO DE INTEGRACIÓN CORRECTA:
"La Narrativa y Visibilidad Mediática (NVM, que mide la presencia en medios 
y respuestas de IA) alcanza 53 puntos de media, impulsada por los contratos 
internacionales recientes. Sin embargo, la Reputación Digital (DRM, que 
evalúa la huella online) se mantiene baja en 29,8 puntos, reflejando que 
la conversación online depende de foros de inversores minoristas más que 
de cobertura institucional. Esta brecha de 23 puntos entre NVM y DRM es 
sintomática de una comunicación corporativa que genera titulares pero no 
consigue amplificación orgánica."

═══════════════════════════════════════════════════════════════════════════════
                    TABLAS DE DATOS EN INFORMES
═══════════════════════════════════════════════════════════════════════════════

Usa TABLAS MARKDOWN para presentar datos comparativos. Formato:

| Modelo IA | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |
|-----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| ChatGPT   | 64  | 71  | 63  | 35  | 35  | 100 | 50  | 88  | 62  |
| Gemini    | 50  | 55  | 30  | 10  | 42  | 90  | 50  | 70  | 60  |
| ...       | ... | ... | ... | ... | ... | ... | ... | ... | ... |

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
                          FUENTES DE INFORMACIÓN
═══════════════════════════════════════════════════════════════════════════════

Recibes datos de:
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

${buildDepthPrompt(depthLevel, languageName)}

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

  console.log(`${logPrefix} Calling AI model...`);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userPrompt }
  ];

  const chatResult = await callAIWithFallback(messages, 'o3', 24000, logPrefix);
  const answer = chatResult.content;

  console.log(`${logPrefix} AI response received (via ${chatResult.provider}), length: ${answer.length}`);

  // Log API usage
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
    let drumrollQuestion: DrumrollQuestion | null = null;
    if (depthLevel !== 'quick' && detectedCompanies.length > 0) {
      console.log(`${logPrefix} Generating drumroll question for ${detectedCompanies[0]?.issuer_name}...`);
      drumrollQuestion = await generateDrumrollQuestion(
        question,
        answer,
        detectedCompanies,
        companiesCache,
        language,
        languageName,
        logPrefix
      );
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

    return new Response(
      JSON.stringify({
        answer,
        suggestedQuestions,
        drumrollQuestion,
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0,
          aiProvider: chatResult.provider,
          depthLevel,
          questionCategory,
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
