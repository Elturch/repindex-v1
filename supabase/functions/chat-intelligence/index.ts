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

#### NVM (Visibilidad Narrativa): [Score]/100 — [Categoría]
**Titular de métrica**: "[Empresa] [destaca/flaquea] en visibilidad: [dato clave]"
[2-3 párrafos periodísticos sobre esta métrica: qué significa, por qué tiene este score, comparación con competidores, qué debería hacer]

#### DRM (Resonancia Digital): [Score]/100 — [Categoría]
**Titular de métrica**: "La huella digital de [Empresa]: [hallazgo principal]"
[2-3 párrafos]

#### SIM (Integridad del Sentimiento): [Score]/100 — [Categoría]
**Titular de métrica**: "¿Cómo se sienten sobre [Empresa]? El veredicto de las IAs"
[2-3 párrafos]

#### RMM (Momentum Reputacional): [Score]/100 — [Categoría]
**Titular de métrica**: "[Empresa] [gana/pierde] impulso: análisis del momentum"
[2-3 párrafos]

#### CEM (Exposición a Crisis): [Score]/100 — [Categoría]
**Titular de métrica**: "Nivel de alerta: ¿Está [Empresa] en zona de riesgo?"
[2-3 párrafos]

#### GAM (Asociación con Crecimiento): [Score]/100 — [Categoría]
**Titular de métrica**: "Percepción de crecimiento: [lo que dicen los datos]"
[2-3 párrafos]

#### DCM (Consistencia de Datos): [Score]/100 — [Categoría]
**Titular de métrica**: "Coherencia informativa: el reto de [Empresa]"
[2-3 párrafos]

#### CXM (Experiencia de Cliente): [Score]/100 — [Categoría]
**Titular de métrica**: "El cliente opina: percepción de experiencia en [Empresa]"
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

### Glosario
- **NVM**: Narrative Visibility Metric - Mide cuánto y cómo aparece la empresa en las respuestas de las IAs
- **DRM**: Digital Resonance Metric - Mide la amplificación digital de la marca
- **SIM**: Sentiment Integrity Metric - Mide la coherencia y positividad del sentimiento
- **RMM**: Reputation Momentum Metric - Mide la tendencia de la reputación
- **CEM**: Crisis Exposure Metric - Mide vulnerabilidad a crisis
- **GAM**: Growth Association Metric - Mide asociación con crecimiento
- **DCM**: Data Consistency Metric - Mide consistencia de la información
- **CXM**: Customer Experience Metric - Mide percepción de experiencia cliente

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
    const { question, conversationHistory = [], sessionId } = await req.json();
    console.log(`${logPrefix} User question:`, question);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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
    // CHECK FOR BULLETIN INTENT (with specific company)
    // =============================================================================
    let bulletinCompany: string | null = null;
    
    for (const pattern of BULLETIN_PATTERNS) {
      const match = question.match(pattern);
      if (match) {
        bulletinCompany = match[1].trim();
        console.log(`${logPrefix} BULLETIN INTENT DETECTED for company: ${bulletinCompany}`);
        break;
      }
    }

    // If bulletin intent detected, use specialized flow
    if (bulletinCompany) {
      return await handleBulletinRequest(
        bulletinCompany,
        question,
        supabaseClient,
        openAIApiKey,
        sessionId,
        logPrefix
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
      logPrefix
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
// BULLETIN REQUEST HANDLER
// =============================================================================
async function handleBulletinRequest(
  companyQuery: string,
  originalQuestion: string,
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string
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

  const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'o3',
      messages: [
        { role: 'system', content: BULLETIN_SYSTEM_PROMPT },
        { role: 'user', content: bulletinUserPrompt }
      ],
      max_completion_tokens: 40000,
    }),
  });

  if (!chatResponse.ok) {
    const errorText = await chatResponse.text();
    console.error(`${logPrefix} OpenAI API error:`, errorText);
    throw new Error(`OpenAI API error: ${chatResponse.statusText}`);
  }

  const chatData = await chatResponse.json();
  const bulletinContent = chatData.choices[0].message.content;

  console.log(`${logPrefix} Bulletin generated, length: ${bulletinContent.length}`);

  // 8. Save to database
  if (sessionId) {
    await supabaseClient.from('chat_intelligence_sessions').insert([
      {
        session_id: sessionId,
        role: 'user',
        content: originalQuestion,
        company: matchedCompany.ticker,
        analysis_type: 'bulletin'
      },
      {
        session_id: sessionId,
        role: 'assistant',
        content: bulletinContent,
        company: matchedCompany.ticker,
        analysis_type: 'bulletin',
        structured_data_found: rixData?.length || 0,
      }
    ]);
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
        dataPointsUsed: rixData?.length || 0
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
  logPrefix: string
) {
  // =============================================================================
  // PASO 0: DETECTAR EMPRESAS MENCIONADAS EN LA PREGUNTA
  // =============================================================================
  const detectedCompanies = detectCompaniesInQuestion(question, companiesCache || []);
  console.log(`${logPrefix} Detected companies in question: ${detectedCompanies.map(c => c.issuer_name).join(', ') || 'none'}`);

  // =============================================================================
  // PASO 0.5: DETECTAR SI ES UNA BÚSQUEDA DE FUENTES/MEDIOS
  // =============================================================================
  const mediaSearchPatterns = [
    /(?:forbes|reuters|bloomberg|expansi[oó]n|cinco\s*d[ií]as|el\s*pa[ií]s|el\s*mundo|el\s*economista|financial\s*times|wsj|wall\s*street)/i,
    /(?:medios?|fuentes?|prensa|peri[oó]dicos?|citad[oa]s?|mencion|aparece|referencia)/i,
  ];
  
  const isMediaSearch = mediaSearchPatterns.some(p => p.test(question));
  let searchTerms: string[] = [];
  
  if (isMediaSearch) {
    // Extract specific media names from the question
    const mediaNames = question.match(/forbes|reuters|bloomberg|expansi[oó]n|cinco\s*d[ií]as|el\s*pa[ií]s|el\s*mundo|el\s*economista|financial\s*times|wsj|wall\s*street|abc|la\s*vanguardia|el\s*confidencial|invertia|bolsamania/gi);
    if (mediaNames) {
      searchTerms = [...new Set(mediaNames.map(m => m.toLowerCase()))];
    }
    console.log(`${logPrefix} MEDIA SEARCH DETECTED - Terms: ${searchTerms.join(', ') || 'general media search'}`);
  }

  // =============================================================================
  // PASO 1: BÚSQUEDA DIRECTA EN TEXTOS BRUTOS (si es búsqueda de fuentes)
  // =============================================================================
  let rawTextSearchResults: any[] = [];
  
  if (isMediaSearch && searchTerms.length > 0) {
    console.log(`${logPrefix} Performing FULL-TEXT search across ALL raw AI responses...`);
    
    // Search in raw text fields using ILIKE for each search term
    for (const term of searchTerms) {
      const searchPattern = `%${term}%`;
      
      const { data: textResults, error: textError } = await supabaseClient
        .from('rix_runs')
        .select(`
          "03_target_name",
          "05_ticker",
          "02_model_name",
          "06_period_from",
          "07_period_to",
          "09_rix_score",
          "20_res_gpt_bruto",
          "21_res_perplex_bruto",
          "22_res_gemini_bruto",
          "23_res_deepseek_bruto",
          "22_explicacion"
        `)
        .or(`"20_res_gpt_bruto".ilike.${searchPattern},"21_res_perplex_bruto".ilike.${searchPattern},"22_res_gemini_bruto".ilike.${searchPattern},"23_res_deepseek_bruto".ilike.${searchPattern},"22_explicacion".ilike.${searchPattern}`)
        .limit(100);
      
      if (textError) {
        console.error(`${logPrefix} Error in text search for "${term}":`, textError);
      } else {
        console.log(`${logPrefix} Found ${textResults?.length || 0} records mentioning "${term}"`);
        if (textResults) {
          rawTextSearchResults.push(...textResults.map(r => ({ ...r, searchTerm: term })));
        }
      }
    }
    
    // Deduplicate by company+model
    const seen = new Set();
    rawTextSearchResults = rawTextSearchResults.filter(r => {
      const key = `${r["03_target_name"]}-${r["02_model_name"]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    console.log(`${logPrefix} Total unique records with media mentions: ${rawTextSearchResults.length}`);
  }

  // =============================================================================
  // PASO 2: GENERAR EMBEDDING DE LA PREGUNTA (para vector search)
  // =============================================================================
  console.log(`${logPrefix} Generating embedding for question...`);
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

  // =============================================================================
  // PASO 3: BÚSQUEDA VECTORIAL (para enriquecimiento cualitativo)
  // =============================================================================
  console.log(`${logPrefix} Performing vector search for qualitative enrichment...`);
  const { data: vectorDocs } = await supabaseClient.rpc('match_documents', {
    query_embedding: embedding,
    match_count: 10, // Increased from 5
    filter: {}
  });

  console.log(`${logPrefix} Vector documents found: ${vectorDocs?.length || 0}`);

  // =============================================================================
  // PASO 4: CARGAR DATOS ESTRUCTURADOS COMPLETOS (últimas 2 semanas)
  // =============================================================================
  console.log(`${logPrefix} Loading complete RIX data (last 2 weeks)...`);
  
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
    .limit(1500);

  if (rixError) {
    console.error(`${logPrefix} Error loading RIX data:`, rixError);
    throw rixError;
  }

  console.log(`${logPrefix} Total RIX records loaded: ${allRixData?.length || 0}`);

  // =============================================================================
  // PASO 5: CONSTRUIR CONTEXTO ESTRUCTURADO COMPLETO
  // =============================================================================
  let context = '';

  // 5.0 AÑADIR RESULTADOS DE BÚSQUEDA DE MEDIOS (PRIORIDAD MÁXIMA)
  if (rawTextSearchResults.length > 0) {
    context += `🔍 ======================================================================\n`;
    context += `🔍 RESULTADOS DE BÚSQUEDA EN TEXTOS ORIGINALES DE IA\n`;
    context += `🔍 Se encontraron ${rawTextSearchResults.length} registros con las fuentes buscadas\n`;
    context += `🔍 ======================================================================\n\n`;
    
    // Group by search term
    const byTerm = new Map<string, any[]>();
    rawTextSearchResults.forEach(r => {
      const term = r.searchTerm || 'unknown';
      if (!byTerm.has(term)) byTerm.set(term, []);
      byTerm.get(term)!.push(r);
    });
    
    for (const [term, results] of byTerm) {
      context += `## 📰 Menciones de "${term.toUpperCase()}" (${results.length} registros):\n\n`;
      context += `| Empresa | Ticker | Modelo IA | Período | RIX |\n`;
      context += `|---------|--------|-----------|---------|-----|\n`;
      
      results.slice(0, 30).forEach(r => {
        context += `| ${r["03_target_name"]} | ${r["05_ticker"]} | ${r["02_model_name"]} | ${r["06_period_from"]} a ${r["07_period_to"]} | ${r["09_rix_score"]} |\n`;
      });
      
      // Include some text excerpts showing the mention
      context += `\n### Extractos donde aparece "${term}":\n`;
      results.slice(0, 5).forEach((r, idx) => {
        // Find which field contains the mention
        const fields = [
          { name: 'ChatGPT', value: r["20_res_gpt_bruto"] },
          { name: 'Perplexity', value: r["21_res_perplex_bruto"] },
          { name: 'Gemini', value: r["22_res_gemini_bruto"] },
          { name: 'DeepSeek', value: r["23_res_deepseek_bruto"] },
          { name: 'Explicación', value: r["22_explicacion"] },
        ];
        
        for (const field of fields) {
          if (field.value && field.value.toLowerCase().includes(term.toLowerCase())) {
            // Extract snippet around the mention
            const lowerText = field.value.toLowerCase();
            const pos = lowerText.indexOf(term.toLowerCase());
            const start = Math.max(0, pos - 100);
            const end = Math.min(field.value.length, pos + term.length + 200);
            const snippet = field.value.substring(start, end);
            
            context += `\n**${idx + 1}. ${r["03_target_name"]} (${field.name}):**\n`;
            context += `> "...${snippet}..."\n`;
            break; // Only show first matching field per record
          }
        }
      });
      context += '\n';
    }
    context += '\n';
  }

  // 5.1 Añadir documentos vectoriales (enriquecimiento cualitativo)
  if (vectorDocs && vectorDocs.length > 0) {
    context += `📚 DOCUMENTOS RELACIONADOS (contexto cualitativo del vector store):\n\n`;
    vectorDocs.forEach((doc: any, idx: number) => {
      const metadata = doc.metadata || {};
      context += `[${idx + 1}] ${metadata.company_name || 'Sin empresa'} - ${metadata.week || 'Sin fecha'}\n`;
      context += `${doc.content?.substring(0, 500) || 'Sin contenido'}...\n\n`;
    });
    context += '\n';
  }

  // 4.2 Construir ranking completo de la semana actual
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
    // 4.3 SECCIÓN PRIORITARIA: EMPRESAS MENCIONADAS EN LA PREGUNTA
    // =========================================================================
    if (detectedCompanies.length > 0) {
      context += `\n🎯 ======================================================================\n`;
      context += `🎯 DATOS DE EMPRESAS MENCIONADAS EN LA PREGUNTA (PRIORIDAD MÁXIMA)\n`;
      context += `🎯 ======================================================================\n\n`;
      
      for (const company of detectedCompanies) {
        const companyName = company.issuer_name;
        const ticker = company.ticker;
        
        // Get current week data for this company (ALL records, no filtering)
        const companyCurrentData = currentWeekData.filter(run => 
          run["03_target_name"]?.toLowerCase() === companyName.toLowerCase() ||
          run["05_ticker"]?.toLowerCase() === ticker?.toLowerCase()
        );
        
        // Get previous week data for trend
        const companyPrevData = previousWeekData.filter(run => 
          run["03_target_name"]?.toLowerCase() === companyName.toLowerCase() ||
          run["05_ticker"]?.toLowerCase() === ticker?.toLowerCase()
        );
        
        console.log(`${logPrefix} Company "${companyName}" (${ticker}): Current=${companyCurrentData.length} records, Previous=${companyPrevData.length} records`);
        
        context += `## 📊 ${companyName.toUpperCase()} (${ticker})\n`;
        context += `Sector: ${company.sector_category || 'No especificado'} | IBEX: ${company.ibex_family_code || 'No IBEX'} | Cotiza: ${company.cotiza_en_bolsa ? 'Sí' : 'No'}\n\n`;
        
        if (companyCurrentData.length > 0) {
          context += `### Datos Semana Actual (${currentFrom} a ${currentTo}):\n`;
          context += `| Modelo IA | RIX Score | RMM Score |\n`;
          context += `|-----------|-----------|----------|\n`;
          
          companyCurrentData.forEach(run => {
            const rixScore = run["51_rix_score_adjusted"] ?? run["09_rix_score"];
            const rmmScore = run["32_rmm_score"];
            context += `| ${run["02_model_name"]} | ${rixScore ?? 'N/A'} | ${rmmScore ?? 'N/A'} |\n`;
          });
          
          // Calculate average
          const validScores = companyCurrentData
            .map(r => r["51_rix_score_adjusted"] ?? r["09_rix_score"])
            .filter(s => s != null);
          
          if (validScores.length > 0) {
            const avgScore = Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10;
            context += `\n**Promedio RIX (${validScores.length} modelos): ${avgScore}**\n`;
          }
          
          // Include resumen if available
          const summaries = companyCurrentData.filter(r => r["10_resumen"]).slice(0, 2);
          if (summaries.length > 0) {
            context += `\n### Resúmenes de IA:\n`;
            summaries.forEach(s => {
              context += `- **${s["02_model_name"]}**: ${s["10_resumen"]?.substring(0, 300)}...\n`;
            });
          }
        } else {
          context += `⚠️ NO HAY DATOS DE ${companyName} EN LA SEMANA ACTUAL (${currentFrom} a ${currentTo})\n`;
          context += `Esto puede indicar que la empresa no fue evaluada esta semana o hay un problema de datos.\n`;
        }
        
        // Trend comparison with previous week
        if (companyPrevData.length > 0 && companyCurrentData.length > 0) {
          const currAvg = companyCurrentData
            .map(r => r["51_rix_score_adjusted"] ?? r["09_rix_score"])
            .filter(s => s != null)
            .reduce((a, b, _, arr) => a + b / arr.length, 0);
          
          const prevAvg = companyPrevData
            .map(r => r["51_rix_score_adjusted"] ?? r["09_rix_score"])
            .filter(s => s != null)
            .reduce((a, b, _, arr) => a + b / arr.length, 0);
          
          const change = currAvg - prevAvg;
          const trendIcon = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
          context += `\n### Tendencia vs Semana Anterior:\n`;
          context += `${trendIcon} Cambio: ${change > 0 ? '+' : ''}${change.toFixed(1)} puntos (de ${prevAvg.toFixed(1)} a ${currAvg.toFixed(1)})\n`;
        }
        
        context += `\n---\n\n`;
      }
    }

    // =========================================================================
    // 4.4 RANKING GENERAL (sin filtros destructivos)
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

  // Add hint about bulletin capability
  context += `\n💡 NOTA: Si el usuario quiere un análisis más completo de una empresa específica, puede pedir un "boletín ejecutivo" o "informe completo" que incluirá competidores y 4 semanas de datos históricos.\n`;

  console.log(`${logPrefix} Context length: ${context.length} characters`);

  // =============================================================================
  // PASO 5: LLAMAR A LA IA CON CONTEXTO COMPLETO
  // =============================================================================
  const systemPrompt = `Eres un analista experto en reputación corporativa que trabaja con el sistema RepIndex.

🎯 TU MISIÓN:
Interpretar preguntas en lenguaje natural y responder usando SOLO los datos proporcionados.

📊 DATOS QUE RECIBES:
- **🎯 DATOS DE EMPRESAS MENCIONADAS**: Sección PRIORITARIA con datos COMPLETOS de cualquier empresa que el usuario mencione
- **RANKING INDIVIDUAL**: Lista de evaluaciones individuales (Empresa + Modelo IA + RIX Score) ordenada por RIX descendente
- **PROMEDIOS POR EMPRESA**: Promedio de los 4 modelos de IA para cada empresa
- **ANÁLISIS POR MODELO IA**: Estadísticas de ChatGPT, Perplexity, Gemini y DeepSeek
- **TENDENCIAS SEMANALES**: Comparación con la semana anterior
- **DOCUMENTOS CUALITATIVOS**: Contexto adicional de análisis previos

🚨🚨🚨 REGLA ANTI-ALUCINACIÓN CRÍTICA 🚨🚨🚨

ANTES DE RESPONDER, VERIFICA:
1. Si el usuario pregunta por una empresa específica (ej: "Banco Santander", "Telefónica", "BBVA")
2. Busca esa empresa en la sección "🎯 DATOS DE EMPRESAS MENCIONADAS EN LA PREGUNTA"
3. Si la empresa aparece ahí con datos de modelos de IA → USA ESOS DATOS
4. NUNCA digas "no tengo datos" o "no hay información" si la empresa aparece en el contexto con scores

Si una empresa tiene datos de ALGUNOS modelos pero no de todos:
- Reporta los datos que SÍ existen
- Menciona qué modelos tienen datos y cuáles no
- NO digas que no hay datos de la empresa

🔍 CÓMO RESPONDER:

**CUANDO PREGUNTAN POR UNA EMPRESA ESPECÍFICA:**
1. PRIMERO busca en "🎯 DATOS DE EMPRESAS MENCIONADAS"
2. Si está ahí, usa esos datos directamente
3. Muestra: RIX por modelo, promedio, tendencia

**POR DEFECTO - USA EL RANKING INDIVIDUAL:**
- "Top 5 empresas" → Usa las primeras 5 filas del ranking
- "¿Cómo está X empresa?" → Muestra las 4 evaluaciones de esa empresa

**SOLO SI PREGUNTAN EXPLÍCITAMENTE - USA PROMEDIOS:**
- "Promedio de X" / "Consenso entre modelos" → Usa la tabla de promedios

💡 FUNCIONALIDAD ESPECIAL - BOLETINES:
Si el usuario necesita un análisis más profundo de una empresa, sugiérele que puede pedir un "boletín ejecutivo" o "informe de [empresa] con sus competidores" para obtener:
- Análisis detallado por modelo de IA
- Comparativa con competidores del sector
- Tendencia histórica de 4 semanas
- Contexto sectorial completo

⚠️ REGLAS CRÍTICAS:
- PRIORIDAD 1: Siempre usar "DATOS DE EMPRESAS MENCIONADAS" cuando el usuario pregunte por una empresa específica
- COMPORTAMIENTO DETERMINISTA: Por defecto, usa siempre el ranking individual
- SOLO usa información que aparezca explícitamente en el contexto
- NUNCA inventes datos
- NUNCA digas "no hay datos" si los datos están en el contexto
- Interpreta la ausencia de datos SOLO si la empresa NO aparece en ninguna parte del contexto

💬 ESTILO DE RESPUESTA:
- Directo y profesional
- Usa emojis moderadamente (📊 📈 📉 ⚠️)
- Formato en markdown cuando ayude
- Respuestas concisas pero completas`;

  const userPrompt = `Pregunta del usuario: "${question}"

CONTEXTO CON TODOS LOS DATOS DISPONIBLES:
${context}

Por favor, responde a la pregunta usando SOLO la información del contexto anterior.`;

  console.log(`${logPrefix} Calling OpenAI (o3 reasoning model)...`);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userPrompt }
  ];

  const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'o3',
      messages: messages,
      max_completion_tokens: 4000,
    }),
  });

  if (!chatResponse.ok) {
    const errorText = await chatResponse.text();
    console.error(`${logPrefix} OpenAI API error:`, errorText);
    throw new Error(`OpenAI API error: ${chatResponse.statusText}`);
  }

  const chatData = await chatResponse.json();
  const answer = chatData.choices[0].message.content;

  console.log(`${logPrefix} AI response received, length: ${answer.length}`);

  // =============================================================================
  // PASO 6: GENERAR PREGUNTAS SUGERIDAS
  // =============================================================================
  console.log(`${logPrefix} Generating follow-up questions...`);
  
  const availableCompanies = allRixData 
    ? [...new Set(allRixData.map(r => r["03_target_name"]))].slice(0, 30).join(', ')
    : '';
  
  const availableSectors = companiesCache 
    ? [...new Set(companiesCache.map(c => c.sector_category).filter(Boolean))].join(', ')
    : 'Energía, Banca, Telecomunicaciones, Construcción, Tecnología, Consumo';
  
  const availableIbexCategories = companiesCache
    ? [...new Set(companiesCache.map(c => c.ibex_family_code).filter(Boolean))].join(', ')
    : 'IBEX35, IBEX_MEDIUM, IBEX_SMALL, NO_IBEX';
  
  const suggestedQuestionsPrompt = `Basándote en la pregunta "${question}" y la respuesta proporcionada, genera exactamente 3 preguntas de seguimiento.

⚠️ RESTRICCIÓN CRÍTICA - Las preguntas DEBEN ser respondibles con los datos existentes:

DATOS DISPONIBLES EN REPINDEX:
- RIX Score (0-100) por empresa y modelo de IA
- Tendencias semanales (subida/bajada vs semana anterior)
- Comparativas entre empresas del mismo sector
- Ranking por modelos: ChatGPT, Perplexity, Gemini, DeepSeek
- Categorías: IBEX35, IBEX_MEDIUM, IBEX_SMALL, empresas no cotizadas
- Sectores: ${availableSectors}
- Empresas: ${availableCompanies}

❌ PREGUNTAS PROHIBIDAS (no tenemos estos datos):
- Noticias específicas, eventos, declaraciones de directivos
- Datos financieros (ingresos, beneficios, dividendos, cotización detallada)
- Información histórica de hace meses o años
- Causas exactas de variaciones (solo podemos inferir)
- Comparaciones con empresas que NO están en la lista
- Predicciones o proyecciones futuras
- Análisis de competidores internacionales no listados
- ESG, sostenibilidad, gobierno corporativo específico

✅ TIPOS DE PREGUNTAS VÁLIDAS:
- "¿Cuál es el RIX de [empresa de la lista]?"
- "Top 5 empresas del sector [sector existente]"
- "¿Cómo se comparan ChatGPT vs Perplexity en [empresa]?"
- "¿Qué empresas subieron más esta semana?"
- "Genera un boletín de [empresa de la lista]"
- "¿Qué modelo de IA es más crítico/generoso?"
- "Empresas cotizadas vs no cotizadas"
- "Comparativa del sector [sector existente]"

Responde SOLO con un array JSON de 3 strings:
["pregunta 1", "pregunta 2", "pregunta 3"]`;

  try {
    const questionsResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Generas preguntas de seguimiento sobre datos de reputación corporativa. Responde SOLO con el array JSON.' },
          { role: 'user', content: suggestedQuestionsPrompt }
        ],
        max_tokens: 300,
        temperature: 0.5,
      }),
    });

    let suggestedQuestions: string[] = [];
    
    if (questionsResponse.ok) {
      const questionsData = await questionsResponse.json();
      const questionsText = questionsData.choices[0].message.content.trim();
      
      try {
        const cleanText = questionsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        suggestedQuestions = JSON.parse(cleanText);
      } catch (parseError) {
        console.warn(`${logPrefix} Error parsing follow-up questions:`, parseError);
        suggestedQuestions = [];
      }
    }

    // Save to database
    if (sessionId) {
      await supabaseClient.from('chat_intelligence_sessions').insert([
        {
          session_id: sessionId,
          role: 'user',
          content: question,
        },
        {
          session_id: sessionId,
          role: 'assistant',
          content: answer,
          documents_found: vectorDocs?.length || 0,
          structured_data_found: allRixData?.length || 0,
          suggested_questions: suggestedQuestions,
        }
      ]);
    }

    return new Response(
      JSON.stringify({
        answer,
        suggestedQuestions,
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0
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
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}
