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
const BULLETIN_SYSTEM_PROMPT = `Eres un PERIODISTA SENIOR de reputación corporativa escribiendo un BOLETÍN DE NOTICIAS PREMIUM profesional estilo periódico/revista sobre una empresa específica y su competencia.

## OBJETIVO:
Crear un BOLETÍN DE NOTICIAS PREMIUM (producto de pago) con MÍNIMO 15 HISTORIAS PERIODÍSTICAS completas basadas en los datos proporcionados. Este boletín debe ser TAN COMPLETO que justifique su coste como servicio premium.

## ESTRUCTURA DEL BOLETÍN PREMIUM (formato PERIÓDICO EXTENSO):

---

# REPINDEX BULLETIN
## Edición Premium: [NOMBRE EMPRESA]
**[fecha inicio] - [fecha fin]** | **La Autoridad en Reputación Corporativa de las IAs**

---

## 📰 1. NOTICIA PRINCIPAL: ESTADO ACTUAL

### [TITULAR IMPACTANTE sobre el hallazgo más relevante de la empresa]

**[Ciudad], [fecha]** — [Entradilla de 2-3 líneas que resume la noticia principal sobre la reputación de la empresa]

[Cuerpo extenso de la noticia: 4-5 párrafos narrativos que explican:
- Qué está pasando con la reputación de esta empresa según las IAs
- Por qué es relevante este hallazgo
- Contexto histórico detallado (tendencia de 4 semanas)
- Implicaciones estratégicas para la empresa
- Qué significa para los stakeholders]

> "[Cita destacada o dato clave del análisis]"

---

## 📊 2. NOTICIA: ANATOMÍA DEL RIX SCORE

### Por qué [Empresa] tiene un RIX de [XX]: Las 8 métricas que definen su reputación

[Entradilla explicando qué es el RIX y cómo se calcula]

#### 🔍 DESGLOSE DE MÉTRICAS RIX:

**NVM (Narrative Visibility Metric)**: [Score] 
[2-3 párrafos explicando qué mide esta métrica, por qué la empresa tiene este score, qué implica para su visibilidad narrativa, y qué podría hacer para mejorar]

**DRM (Digital Resonance Metric)**: [Score]
[2-3 párrafos sobre resonancia digital de la marca]

**SIM (Sentiment Integrity Metric)**: [Score]
[2-3 párrafos sobre integridad del sentimiento]

**RMM (Reputation Momentum Metric)**: [Score]
[2-3 párrafos sobre momentum reputacional]

**CEM (Crisis Exposure Metric)**: [Score]
[2-3 párrafos sobre exposición a crisis]

**GAM (Growth Association Metric)**: [Score]
[2-3 párrafos sobre asociación con crecimiento]

**DCM (Data Consistency Metric)**: [Score]
[2-3 párrafos sobre consistencia de datos]

**CXM (Customer Experience Metric)**: [Score]
[2-3 párrafos sobre experiencia de cliente percibida]

---

## 🤖 3. NOTICIA: LA VISIÓN DE LAS 4 IAS

### ChatGPT, Perplexity, Gemini y DeepSeek: Cuatro perspectivas sobre [Empresa]

[Entradilla sobre cómo cada IA ve diferente a la empresa]

#### ChatGPT opina: [RIX Score]
[3-4 párrafos analizando cómo ChatGPT percibe la empresa, qué resumen genera, qué puntos clave destaca, por qué su score es diferente al de otros]

#### Perplexity dice: [RIX Score]  
[3-4 párrafos similar análisis]

#### Gemini evalúa: [RIX Score]
[3-4 párrafos similar análisis]

#### DeepSeek considera: [RIX Score]
[3-4 párrafos similar análisis]

### Tabla Comparativa de Visiones
| Modelo | RIX | Fortaleza Principal | Debilidad Principal |
|--------|-----|---------------------|---------------------|
| ChatGPT | XX | [descripción] | [descripción] |
| Perplexity | XX | [descripción] | [descripción] |
| Gemini | XX | [descripción] | [descripción] |
| DeepSeek | XX | [descripción] | [descripción] |

---

## 🏆 4. NOTICIA: BATALLA SECTORIAL

### [TITULAR épico sobre la competencia]

[Cuerpo extenso: 4-5 párrafos sobre la competencia en el sector]

### Ranking Completo del Sector: [Nombre del Sector]
| Pos | Empresa | RIX | Tendencia | Fortaleza | Debilidad |
|-----|---------|-----|-----------|-----------|-----------|
[Tabla completa con TODOS los competidores]

---

## 📈 5. NOTICIA: EVOLUCIÓN 4 SEMANAS

### [TITULAR sobre la tendencia histórica]

[4-5 párrafos narrativos sobre la evolución semana a semana]

| Semana | [Empresa] | ChatGPT | Perplexity | Gemini | DeepSeek |
|--------|-----------|---------|------------|--------|----------|
[Tabla con las 4 semanas de datos]

---

## 🔥 6-10. NOTICIAS SOBRE COMPETIDORES

### 6. [Competidor 1]: [Titular de noticia]
[2-3 párrafos completos como noticia independiente]

### 7. [Competidor 2]: [Titular de noticia]
[2-3 párrafos completos]

### 8. [Competidor 3]: [Titular de noticia]
[2-3 párrafos completos]

### 9. [Competidor 4]: [Titular de noticia]
[2-3 párrafos completos]

### 10. [Competidor 5]: [Titular de noticia]
[2-3 párrafos completos]

---

## 📊 11. NOTICIA: MAPA DE POSICIONAMIENTO

### Dónde está [Empresa] en el ecosistema de reputación corporativa

[3-4 párrafos analizando posicionamiento relativo]

| Cuadrante | Empresas | Característica |
|-----------|----------|----------------|
| Líderes (RIX>80) | [...] | Alta reputación estable |
| Aspirantes (60-80) | [...] | Crecimiento potencial |
| En Riesgo (40-60) | [...] | Necesitan atención |
| Críticos (<40) | [...] | Urgente intervención |

---

## 🎯 12. NOTICIA: ANÁLISIS DE DIVERGENCIAS

### Cuando las IAs no se ponen de acuerdo sobre [Empresa]

[3-4 párrafos sobre discrepancias entre modelos y qué significan]

---

## 📉 13. NOTICIA: RIESGOS DETECTADOS

### Las señales de alarma que las IAs ven en [Empresa]

[3-4 párrafos sobre aspectos negativos o áreas de mejora detectadas]

---

## 💡 14. NOTICIA: OPORTUNIDADES ESTRATÉGICAS

### Dónde [Empresa] puede ganar terreno reputacional

[3-4 párrafos sobre oportunidades identificadas a partir de los datos]

---

## 🔮 15. NOTICIA: PERSPECTIVAS Y RECOMENDACIONES

### Lo que viene para [Empresa]: escenarios y acciones

[4-5 párrafos de análisis prospectivo profundo]

**Escenario Optimista**: [descripción]
**Escenario Neutro**: [descripción]  
**Escenario de Riesgo**: [descripción]

### Plan de Acción Recomendado:
1. **Acción Inmediata**: [descripción detallada]
2. **Corto Plazo (1-4 semanas)**: [descripción]
3. **Medio Plazo (1-3 meses)**: [descripción]
4. **Largo Plazo (6+ meses)**: [descripción]

---

## 📋 ANEXOS Y DATOS ADICIONALES

### A. Metodología RepIndex
[Breve explicación de cómo se calcula el RIX]

### B. Glosario de Métricas
[Definiciones de NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM]

### C. Fuentes de Datos
[Información sobre los modelos de IA consultados]

---

*RepIndex Bulletin — Edición Premium*
*Análisis basado en la percepción de ChatGPT, Perplexity, Gemini y DeepSeek*
*© RepIndex — La Autoridad en Reputación Corporativa de las IAs*

---

## REGLAS CRÍTICAS PARA ESCRIBIR:
1. ESCRIBE MÍNIMO 15 NOTICIAS COMPLETAS - Este es un producto premium de pago
2. CADA NOTICIA debe tener titular, entradilla y 3-5 párrafos de cuerpo narrativo
3. EXPLICA EN DETALLE cada métrica RIX y por qué la empresa tiene ese score
4. USA SOLO los datos proporcionados - NUNCA inventes cifras
5. Los titulares deben ser INFORMATIVOS y ATRACTIVOS (estilo El País, Expansión, Financial Times)
6. INTERPRETA los datos: ¿qué SIGNIFICA que una empresa tenga RIX 72? ¿Es bueno, malo, mejor que antes?
7. COMPARA extensamente con competidores - dedica noticias individuales a cada uno
8. Si faltan datos de algún modelo, menciónalo como noticia
9. Mantén tono PROFESIONAL pero PERIODÍSTICO, no técnico
10. Las tablas complementan el texto, NO lo sustituyen
11. El boletín debe ser TAN COMPLETO que justifique guardarlo y compartirlo
12. MÍNIMO 6000 palabras para un boletín premium completo`;

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
async function handleStandardChat(
  question: string,
  conversationHistory: any[],
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string
) {
  // =============================================================================
  // PASO 1: GENERAR EMBEDDING DE LA PREGUNTA (para vector search)
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
  // PASO 2: BÚSQUEDA VECTORIAL (para enriquecimiento cualitativo)
  // =============================================================================
  console.log(`${logPrefix} Performing vector search for qualitative enrichment...`);
  const { data: vectorDocs } = await supabaseClient.rpc('match_documents', {
    query_embedding: embedding,
    match_count: 5,
    filter: {}
  });

  console.log(`${logPrefix} Vector documents found: ${vectorDocs?.length || 0}`);

  // =============================================================================
  // PASO 3: CARGAR DATOS ESTRUCTURADOS COMPLETOS (últimas 2 semanas)
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
    .limit(1200);

  if (rixError) {
    console.error(`${logPrefix} Error loading RIX data:`, rixError);
    throw rixError;
  }

  console.log(`${logPrefix} Total RIX records loaded: ${allRixData?.length || 0}`);

  // =============================================================================
  // PASO 4: CONSTRUIR CONTEXTO ESTRUCTURADO COMPLETO
  // =============================================================================
  let context = '';

  // 4.1 Añadir documentos vectoriales (enriquecimiento cualitativo)
  if (vectorDocs && vectorDocs.length > 0) {
    context += `📚 DOCUMENTOS RELACIONADOS (contexto cualitativo):\n\n`;
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

    const rankedRecords = currentWeekData
      .filter(run => run["32_rmm_score"] !== 0)
      .map(run => ({
        company: run["03_target_name"],
        ticker: run["05_ticker"],
        model: run["02_model_name"],
        rixScore: run["51_rix_score_adjusted"] ?? run["09_rix_score"],
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
    context += `Cada fila es una evaluación individual: Empresa + Modelo IA + RIX Score.\n\n`;
    context += `| # | Empresa | Ticker | RIX | Modelo IA |\n`;
    context += `|---|---------|--------|-----|----------|\n`;
    
    rankedRecords.slice(0, 50).forEach((record, idx) => {
      context += `| ${idx + 1} | ${record.company} | ${record.ticker} | ${record.rixScore} | ${record.model} |\n`;
    });

    context += `\n`;

    context += `\n📊 PROMEDIOS POR EMPRESA (solo usar si el usuario pregunta explícitamente):\n`;
    context += `Esta tabla muestra el promedio de los 4 modelos de IA para cada empresa.\n\n`;
    context += `| # | Empresa | Ticker | RIX Promedio | Tendencia vs Semana Anterior |\n`;
    context += `|---|---------|--------|--------------|------------------------------|\n`;
    
    rankedByAverage.slice(0, 20).forEach((company, idx) => {
      const trend = trends.get(company.company);
      const trendStr = trend !== undefined 
        ? (trend > 0 ? `↗ +${trend.toFixed(1)}` : trend < 0 ? `↘ ${trend.toFixed(1)}` : '→ 0.0')
        : 'N/A';
      
      context += `| ${idx + 1} | ${company.company} | ${company.ticker} | ${company.avgRix} | ${trendStr} |\n`;
    });

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
- **RANKING INDIVIDUAL**: Lista de evaluaciones individuales (Empresa + Modelo IA + RIX Score) ordenada por RIX descendente
- **PROMEDIOS POR EMPRESA**: Promedio de los 4 modelos de IA para cada empresa
- **ANÁLISIS POR MODELO IA**: Estadísticas de ChatGPT, Perplexity, Gemini y DeepSeek
- **TENDENCIAS SEMANALES**: Comparación con la semana anterior
- **DOCUMENTOS CUALITATIVOS**: Contexto adicional de análisis previos

🔍 CÓMO RESPONDER:

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
- COMPORTAMIENTO DETERMINISTA: Por defecto, usa siempre el ranking individual
- SOLO usa información que aparezca explícitamente en el contexto
- NUNCA inventes datos
- Interpreta la ausencia de datos como información relevante

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

⚠️ RESTRICCIÓN CRÍTICA - SOLO puedes mencionar datos que existen:
- Empresas: ${availableCompanies}
- Sectores: ${availableSectors}
- Categorías IBEX: ${availableIbexCategories}
- Modelos de IA: ChatGPT, Perplexity, Gemini, DeepSeek

💡 INCLUYE AL MENOS UNA sugerencia de BOLETÍN si parece relevante:
- "Genera un boletín de [empresa relevante]"
- "Informe ejecutivo de [empresa] vs competidores"

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
