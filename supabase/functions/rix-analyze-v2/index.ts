import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Model used for RIX analysis (single source of truth)
const RIX_ANALYSIS_MODEL = 'gpt-5';

// Full ORG_RIXSchema_V2 Tool Definition for GPT-5
const RIX_ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "submit_rix_analysis",
    description: "Submit the complete RIX reputational analysis following ORG_RIXSchema_V2",
    parameters: {
      type: "object",
      properties: {
        // Core RIX Score
        rix_score: {
          type: "integer",
          description: "Overall RIX score (0-100). If DRM<40 or SIM<40, cap at 64.",
          minimum: 0,
          maximum: 100,
        },
        resumen: {
          type: "string",
          description: "Executive summary (2-3 sentences) of reputation status",
        },
        puntos_clave: {
          type: "array",
          items: { type: "string" },
          description: "3-5 key reputation points",
        },
        explicacion: {
          type: "array",
          items: { type: "string" },
          description: "Detailed methodology explanation for each subscore",
        },
        
        // Counters
        palabras: {
          type: "integer",
          description: "Word count of analyzed text",
        },
        num_fechas: {
          type: "integer",
          description: "Number of dates found in sources",
        },
        num_citas: {
          type: "integer",
          description: "Number of citations/sources",
        },
        temporal_alignment: {
          type: "number",
          description: "Proportion of facts within date window (0-1)",
          minimum: 0,
          maximum: 1,
        },
        citation_density: {
          type: "number",
          description: "Citation density metric (0-1)",
          minimum: 0,
          maximum: 1,
        },
        
        // NVM - Narrative Value Metric
        nvm_score: {
          type: "integer",
          description: "NVM score (0-100). Formula: clip0-100(50*(s̄+1) - 20*c̄ - 30*h̄)",
          minimum: 0,
          maximum: 100,
        },
        nvm_categoria: {
          type: "string",
          enum: ["Bueno", "Mejorable", "Insuficiente"],
          description: "NVM category: Bueno(≥70), Mejorable(40-69), Insuficiente(<40)",
        },
        
        // DRM - Data Reliability Metric
        drm_score: {
          type: "integer",
          description: "DRM score (0-100). Primary 40% + corroboration 20% + clarity 30% + traceability 10%",
          minimum: 0,
          maximum: 100,
        },
        drm_categoria: {
          type: "string",
          enum: ["Bueno", "Mejorable", "Insuficiente"],
        },
        
        // SIM - Source Integrity Metric
        sim_score: {
          type: "integer",
          description: "SIM score (0-100). Formula: 100*(0.45*T1 + 0.30*T2 + 0.15*T3 + 0.10*T4)",
          minimum: 0,
          maximum: 100,
        },
        sim_categoria: {
          type: "string",
          enum: ["Bueno", "Mejorable", "Insuficiente"],
        },
        
        // RMM - Reputational Momentum Metric
        rmm_score: {
          type: "integer",
          description: "RMM score (0-100). If <50% facts in window, cap at 69 and flag datos_antiguos",
          minimum: 0,
          maximum: 100,
        },
        rmm_categoria: {
          type: "string",
          enum: ["Bueno", "Mejorable", "Insuficiente"],
        },
        
        // CEM - Controversy Exposure Metric
        cem_score: {
          type: "integer",
          description: "CEM score (0-100). Formula: 100 - (0.5*J + 0.3*P + 0.2*L)",
          minimum: 0,
          maximum: 100,
        },
        cem_categoria: {
          type: "string",
          enum: ["Bueno", "Mejorable", "Insuficiente"],
        },
        
        // GAM - Governance Autonomy Metric
        gam_score: {
          type: "integer",
          description: "GAM score (0-100). Independence, policies, declared conflicts",
          minimum: 0,
          maximum: 100,
        },
        gam_categoria: {
          type: "string",
          enum: ["Bueno", "Mejorable", "Insuficiente"],
        },
        
        // DCM - Data Consistency Metric
        dcm_score: {
          type: "integer",
          description: "DCM score (0-100). Coherence of names/roles/dates/figures",
          minimum: 0,
          maximum: 100,
        },
        dcm_categoria: {
          type: "string",
          enum: ["Bueno", "Mejorable", "Insuficiente"],
        },
        
        // CXM - Corporate Execution Metric
        cxm_score: {
          type: "integer",
          description: "CXM score (0-100) or -1 if not applicable. If traded and missing price, set to 25.",
          minimum: -1,
          maximum: 100,
        },
        cxm_categoria: {
          type: "string",
          enum: ["Bueno", "Mejorable", "Insuficiente", "no_aplica"],
        },
        
        // Stock data
        precio_accion_semana: {
          type: "number",
          description: "Weekly stock price if applicable, null otherwise",
        },
        precio_minimo_accion_year: {
          type: "number",
          description: "52-week low stock price if applicable, null otherwise",
        },
        precio_accion_interanual: {
          type: "string",
          description: "Year-over-year stock price change description",
        },
        accion_vs_reputacion: {
          type: "string",
          description: "Analysis of stock vs reputation correlation",
        },
        
        // Flags
        flags: {
          type: "array",
          items: { 
            type: "string",
            enum: [
              "pocas_fechas", "sin_fuentes", "datos_antiguos", "respuesta_corta",
              "inconsistencias", "dudas_no_aclaradas", "confusion_alias",
              "cutoff_disclaimer", "alto_riesgo", "drm_bajo", "sim_bajo"
            ]
          },
          description: "Quality and risk flags detected",
        },
      },
      required: [
        "rix_score", "resumen", "puntos_clave", "explicacion",
        "palabras", "num_fechas", "num_citas",
        "temporal_alignment", "citation_density",
        "nvm_score", "nvm_categoria",
        "drm_score", "drm_categoria",
        "sim_score", "sim_categoria",
        "rmm_score", "rmm_categoria",
        "cem_score", "cem_categoria",
        "gam_score", "gam_categoria",
        "dcm_score", "dcm_categoria",
        "cxm_score", "cxm_categoria",
        "flags"
      ],
    },
  },
};

// Mapping of model names to their response columns
const MODEL_RESPONSE_MAP: Record<string, string> = {
  'ChatGPT': '20_res_gpt_bruto',
  'Perplexity': '21_res_perplex_bruto',
  'Google Gemini': '22_res_gemini_bruto',
  'Deepseek': '23_res_deepseek_bruto',
  'Grok': 'respuesta_bruto_grok',
  'Qwen': 'respuesta_bruto_qwen',
};

// Full analysis prompt implementing ORG_RIXSchema_V2 - EXACT MAKE.COM ORIGINAL PROMPT
const buildAnalysisPrompt = (
  issuerName: string,
  ticker: string,
  dateFrom: string,
  dateTo: string,
  tz: string,
  cotiza: boolean,
  weights: Record<string, number>,
  modelName: string,
  rawResponse: string,
  stockPriceData: string
): string => `INSTRUCCIONES (lee y cumple estrictamente):

Eres evaluador de RepIndex. Debes evaluar EXCLUSIVAMENTE el texto de una respuesta orgánica de una IA sobre la reputación de una marca/persona en una semana dada.

PROHIBIDO navegar o añadir información externa. Trabaja SOLO con el texto entre las marcas COMIENZO/FIN.

Devuelve tu análisis usando la función submit_rix_analysis que cumpla EXACTAMENTE el esquema ORG_PARISchema_V2.

Redondea todas las puntuaciones a ENTEROS. Si un componente no aplica (p. ej., Mercado para no cotizadas o si el texto no cubre mercado), marca la categoría "no_aplica" y redistribuye internamente su peso en el RIX entre los demás componentes de forma proporcional, en pesos y scores siempre devuelves números enteros o deja el campo vacío si no aplica.

VENTANA Y METADATOS:

Marca/Persona: ${issuerName} | Tipo: marca

Ticker (si aplica): ${ticker}

Ventana: ${dateFrom}..${dateTo} (TZ=${tz})

Cotiza: ${cotiza ? 'Si' : 'No'}

Modelo evaluado: ${modelName}

Pesos de componentes (suman 100): ${JSON.stringify(weights)}

DEFINICIONES DE MÉTRICAS (siempre 0–100; nombres EXACTOS):

Calidad de la narrativa — Narrative Value Metric (NVM)

NVM = clip0-100( 50·(s̄+1) − 20·c̄ − 30·h̄ ), con s̄∈[-1,+1] tono medio; c̄∈[0,1] controversia; h̄∈[0,1] alucinación/afirmaciones sin soporte.

Fortaleza de evidencia — Data Reliability Metric (DRM)

Primaria/oficial (40%), corroboración independiente (20%), claridad documental (30: medio+fecha), trazabilidad (10).

Mezcla de autoridad de fuentes — Source Integrity Metric (SIM)

Clasifica referencias citadas en Tiers: T1 (reguladores y Tier-1 financiero: CNMV/SEC, Reuters/Bloomberg/FT/WSJ, Expansión/Cinco Días/El Economista, casas de análisis), T2 (generalistas referencia), T3 (especializados verificados), T4 (opinión/redes). SIM=100·(0.45·T1+0.30·T2+0.15·T3+0.10·T4).

Actualidad y empuje — Reputational Momentum Metric (RMM)

En función de (i) % de menciones con fecha dentro de la ventana y (ii) señales de impulso reciente. Aprox: RMM ≈ minmax_0-100(0.7·coverage_temporal + 0.3·peso_T1_reciente).

Controversia y riesgo legal (reverso) — Controversy Exposure Metric (CEM)

CEM = 100 − (0.5·J + 0.3·P + 0.2·L), con J/P/L∈[0,100] (judicial, político, laboral/social) según el propio texto.

Percepción de independencia de gobierno — Governance Autonomy Metric (GAM)

Señales de independencia, políticas y conflictos declarados.

Integridad del grafo de conocimiento — Data Consistency Metric (DCM)

Coherencia de nombres/roles/fechas/cifras y consistencia interna.

Impacto de mercado/ejecución — Corporate Execution Metric (CXM)

0–100 si el texto integra cotización/ratings/eventos de mercado; Si un componente está en "no_aplica", calcula internamente los pesos efectivos para el resto de métricas como:

w_eff[k] = (w[k] / (100 - w_no_aplica)) * 100

(Nota: si hubiera varios "no_aplica", usa w_no_aplica = suma de sus pesos).

Usa w_eff para calcular el RIX y devuelve en los campos xx_peso esos pesos efectivos redondeados a enteros de forma que sumen 100 (ajusta el residuo en la métrica con mayor peso).

RIX (índice 0–100):

RIX = suma ponderada de las 8 métricas usando weights recibidos. Si CXM es "no_aplica", reparte su peso proporcionalmente en el resto para el cálculo.

PRECIO ACCION vs REPUTACION

Analiza los valores reputacionales y relacionalos con el precio de la acción con un pequeño texto reflexivo, evalua el precio semanal de la acción y el mínimo de esa acción a 52 semanas y saca conclusiones.

CONTADORES Y FLAGS:

Calcula: palabras, num_fechas, num_citas, temporal_alignment (0..1), citation_density (0..1).

flags: usa según proceda: "pocas_fechas", "sin_fuentes", "datos_antiguos", "respuesta_corta", "dudas_no_aclaradas", "confusion_alias", "cutoff_disclaimer".

Clasifica cada sub-métrica en: "Bueno" (≥70), "Mejorable" (40–69), "Insuficiente" (<40) o "no_aplica".

IMPORTANTE SOBRE LOS NOMBRES DE SUBSCORES (usa exactamente estas etiquetas):

label: "Calidad de la narrativa" / label_en_sigla: "Narrative Value Metric — NVM"
label: "Fortaleza de evidencia" / label_en_sigla: "Data Reliability Metric — DRM"
label: "Mezcla de autoridad de fuentes" / label_en_sigla: "Source Integrity Metric — SIM"
label: "Actualidad y empuje" / label_en_sigla: "Reputational Momentum Metric — RMM"
label: "Controversia y riesgo legal (reverso)" / label_en_sigla: "Controversy Exposure Metric — CEM"
label: "Percepción de independencia de gobierno" / label_en_sigla: "Governance Autonomy Metric — GAM"
label: "Integridad del grafo de conocimiento" / label_en_sigla: "Data Consistency Metric — DCM"
label: "Impacto de mercado/ejecución" / label_en_sigla: "Corporate Execution Metric — CXM"

Si <50% de los hechos datados caen dentro de la ventana, limita RMM ≤ 69 y activa flag datos_antiguos.

A CONTINUACIÓN, LA RESPUESTA ORGÁNICA A EVALUAR (usa SOLO esto):

=== RESPUESTA_ORGANICA_COMIENZO ===

${rawResponse}

precio acción: ${stockPriceData}

=== RESPUESTA_ORGANICA_FIN ===

Usa la función submit_rix_analysis para enviar tu análisis estructurado.`;

// Default weights
const DEFAULT_WEIGHTS: Record<string, number> = {
  NVM: 15,
  DRM: 15,
  SIM: 12,
  RMM: 12,
  CEM: 12,
  GAM: 12,
  DCM: 12,
  CXM: 10,
};

function getCategory(score: number): string {
  if (score >= 70) return 'Bueno';
  if (score >= 40) return 'Mejorable';
  return 'Insuficiente';
}

function calculateEffectiveWeights(analysis: any, baseWeights: Record<string, number>): Record<string, number> {
  const weights = { ...baseWeights };
  
  if (analysis.cxm_categoria === 'no_aplica' || analysis.cxm_score === -1) {
    const cxmWeight = weights.CXM || 10;
    delete weights.CXM;
    
    const totalOther = Object.values(weights).reduce((a, b) => a + b, 0);
    const keys = Object.keys(weights);
    
    keys.forEach(key => {
      weights[key] = Math.round(weights[key] * (100 / totalOther));
    });
    
    // Adjust rounding to ensure sum is 100
    const currentSum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (currentSum !== 100) {
      const maxKey = keys.reduce((a, b) => weights[a] > weights[b] ? a : b);
      weights[maxKey] += 100 - currentSum;
    }
  }
  
  return weights;
}

function calculateFinalRixScore(analysis: any, weights: Record<string, number>): number {
  const scoreMap: Record<string, number> = {
    NVM: analysis.nvm_score,
    DRM: analysis.drm_score,
    SIM: analysis.sim_score,
    RMM: analysis.rmm_score,
    CEM: analysis.cem_score,
    GAM: analysis.gam_score,
    DCM: analysis.dcm_score,
    CXM: analysis.cxm_score >= 0 ? analysis.cxm_score : 0,
  };
  
  let totalScore = 0;
  let totalWeight = 0;
  
  Object.entries(weights).forEach(([key, weight]) => {
    if (scoreMap[key] !== undefined && scoreMap[key] >= 0) {
      totalScore += scoreMap[key] * weight;
      totalWeight += weight;
    }
  });
  
  const rixScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  
  // Cap removed: GPT-5 applies its own judgment based on prompt instructions
  // (historically in Make.com, only ~2.5% of runs were capped at 64 despite 92.6% having SIM<40)
  
  return rixScore;
}

// Core analysis function - processes a single record
async function analyzeRecord(supabase: any, record: any): Promise<any> {
  const startTime = Date.now();
  const record_id = record.id;
  
  // Determine which model this row belongs to and get its response
  const modelName = record['02_model_name'] as string;
  const responseColumn = MODEL_RESPONSE_MAP[modelName];
  
  if (!responseColumn) {
    throw new Error(`Unknown model name: ${modelName}. Valid models: ${Object.keys(MODEL_RESPONSE_MAP).join(', ')}`);
  }

  const rawResponse = record[responseColumn] as string | null;

  if (!rawResponse || rawResponse.length < 100) {
    throw new Error(`No valid raw response found for model ${modelName} in column ${responseColumn}`);
  }

  console.log(`[rix-analyze-v2] Analyzing ${modelName} response (${rawResponse.length} chars)`);

  // Check if company is traded
  const { data: issuerData } = await supabase
    .from('repindex_root_issuers')
    .select('cotiza_en_bolsa')
    .eq('ticker', record['05_ticker'])
    .single();

  const cotiza = issuerData?.cotiza_en_bolsa ?? false;

  // Get stock price data from the record (populated by rix-search-v2)
  const precioCierre = record['48_precio_accion'] as string | null;
  const minimo52s = record['59_precio_minimo_52_semanas'] as string | null;
  
  let stockPriceData = 'No cotiza o precio no disponible';
  if (cotiza && precioCierre && precioCierre !== 'NC') {
    stockPriceData = `Precio cierre: ${precioCierre}€`;
    if (minimo52s) {
      stockPriceData += ` | Mínimo 52 semanas: ${minimo52s}€`;
    }
  }

  // Build analysis prompt for SINGLE MODEL response
  const analysisPrompt = buildAnalysisPrompt(
    record['03_target_name'] || 'Unknown',
    record['05_ticker'] || 'N/A',
    record['06_period_from'] || '',
    record['07_period_to'] || '',
    record['08_tz'] || 'Europe/Madrid',
    cotiza,
    DEFAULT_WEIGHTS,
    modelName,
    rawResponse,
    stockPriceData
  );

  // Call GPT-5 with tool calling
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  console.log(`[rix-analyze-v2] Calling ${RIX_ANALYSIS_MODEL} to analyze ${modelName} response...`);

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: RIX_ANALYSIS_MODEL,
      messages: [{ role: 'user', content: analysisPrompt }],
      tools: [RIX_ANALYSIS_TOOL],
      tool_choice: { type: 'function', function: { name: 'submit_rix_analysis' } },
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const openaiData = await openaiResponse.json();
  
  // Extract tool call arguments
  const toolCall = openaiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== 'submit_rix_analysis') {
    throw new Error('No valid analysis returned from GPT-5');
  }

  const analysis = JSON.parse(toolCall.function.arguments);
  console.log(`[rix-analyze-v2] Analysis received for ${modelName}, processing...`);

  // Calculate effective weights and final RIX score
  const cxmExcluded = analysis.cxm_categoria === 'no_aplica' || analysis.cxm_score === -1;
  const effectiveWeights = calculateEffectiveWeights(analysis, DEFAULT_WEIGHTS);
  const finalRixScore = calculateFinalRixScore(analysis, effectiveWeights);

  // Add business rule flags
  const flags = [...(analysis.flags || [])];
  if (analysis.drm_score < 40 && !flags.includes('drm_bajo')) {
    flags.push('drm_bajo');
  }
  if (analysis.sim_score < 40 && !flags.includes('sim_bajo')) {
    flags.push('sim_bajo');
  }

  // Fetch momentum tips for listed companies with valid prices
  let momentumAnalysis: string | null = null;
  if (cotiza && precioCierre && precioCierre !== 'NC') {
    try {
      console.log(`[rix-analyze-v2] Fetching momentum tips for ${record['05_ticker']}...`);
      
      const momentumSupabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const momentumServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      const momentumResponse = await fetch(`${momentumSupabaseUrl}/functions/v1/fetch-momentum-tips`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${momentumServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: record['05_ticker'],
          company_name: record['03_target_name'],
          precio_cierre: precioCierre,
          minimo_52_semanas: minimo52s,
          rix_score: finalRixScore,
        }),
      });

      if (momentumResponse.ok) {
        const momentumData = await momentumResponse.json();
        if (momentumData.success && momentumData.momentum_analysis) {
          let formattedAnalysis = momentumData.momentum_analysis;
          if (momentumData.tips && momentumData.tips.length > 0) {
            formattedAnalysis += '\n\n📊 **Tips verificados:**\n';
            momentumData.tips.forEach((tip: string, idx: number) => {
              formattedAnalysis += `${idx + 1}. ${tip}\n`;
            });
          }
          if (momentumData.sources && momentumData.sources.length > 0) {
            formattedAnalysis += `\n📰 Fuentes: ${momentumData.sources.join(', ')}`;
          }
          momentumAnalysis = formattedAnalysis;
          console.log(`[rix-analyze-v2] Momentum tips received for ${record['05_ticker']}`);
        }
      }
    } catch (momentumError: any) {
      console.warn(`[rix-analyze-v2] Error fetching momentum tips:`, momentumError.message);
    }
  }

  // Map to database columns
  const updateData: Record<string, any> = {
    '09_rix_score': finalRixScore,
    '10_resumen': analysis.resumen,
    '11_puntos_clave': analysis.puntos_clave,
    '22_explicacion': analysis.explicacion || [],
    
    // Counters
    '12_palabras': analysis.palabras,
    '13_num_fechas': analysis.num_fechas,
    '14_num_citas': analysis.num_citas,
    '15_temporal_alignment': analysis.temporal_alignment,
    '16_citation_density': analysis.citation_density,
    
    // NVM
    '23_nvm_score': analysis.nvm_score,
    '24_nvm_peso': effectiveWeights.NVM || DEFAULT_WEIGHTS.NVM,
    '25_nvm_categoria': analysis.nvm_categoria,
    
    // DRM
    '26_drm_score': analysis.drm_score,
    '27_drm_peso': effectiveWeights.DRM || DEFAULT_WEIGHTS.DRM,
    '28_drm_categoria': analysis.drm_categoria,
    
    // SIM
    '29_sim_score': analysis.sim_score,
    '30_sim_peso': effectiveWeights.SIM || DEFAULT_WEIGHTS.SIM,
    '31_sim_categoria': analysis.sim_categoria,
    
    // RMM
    '32_rmm_score': analysis.rmm_score,
    '33_rmm_peso': effectiveWeights.RMM || DEFAULT_WEIGHTS.RMM,
    '34_rmm_categoria': analysis.rmm_categoria,
    
    // CEM
    '35_cem_score': analysis.cem_score,
    '36_cem_peso': effectiveWeights.CEM || DEFAULT_WEIGHTS.CEM,
    '37_cem_categoria': analysis.cem_categoria,
    
    // GAM
    '38_gam_score': analysis.gam_score,
    '39_gam_peso': effectiveWeights.GAM || DEFAULT_WEIGHTS.GAM,
    '40_gam_categoria': analysis.gam_categoria,
    
    // DCM
    '41_dcm_score': analysis.dcm_score,
    '42_dcm_peso': effectiveWeights.DCM || DEFAULT_WEIGHTS.DCM,
    '43_dcm_categoria': analysis.dcm_categoria,
    
    // CXM
    '44_cxm_score': cxmExcluded ? null : analysis.cxm_score,
    '45_cxm_peso': cxmExcluded ? 0 : (effectiveWeights.CXM || DEFAULT_WEIGHTS.CXM),
    '46_cxm_categoria': analysis.cxm_categoria,
    '52_cxm_excluded': cxmExcluded,
    
    // Stock data
    '49_reputacion_vs_precio': momentumAnalysis || analysis.accion_vs_reputacion || null,
    '50_precio_accion_interanual': analysis.precio_accion_interanual || null,
    
    // Flags and weights
    '17_flags': flags,
    '19_weights': effectiveWeights,
    
    // Timestamps
    'analysis_completed_at': new Date().toISOString(),
    'updated_at': new Date().toISOString(),
  };

  // Update record
  const { error: updateError } = await supabase
    .from('rix_runs_v2')
    .update(updateData)
    .eq('id', record_id);

  if (updateError) {
    throw new Error(`Failed to update record: ${updateError.message}`);
  }

  // Log API usage for cost tracking
  const analysisInputTokens = Math.ceil(analysisPrompt.length / 4);
  const analysisOutputTokens = Math.ceil(JSON.stringify(analysis).length / 3.5);
  
  const { data: costConfig } = await supabase
    .from('api_cost_config')
    .select('input_cost_per_million, output_cost_per_million')
    .eq('provider', 'openai')
    .eq('model', RIX_ANALYSIS_MODEL)
    .single();

  const inputCost = costConfig ? (analysisInputTokens / 1_000_000) * costConfig.input_cost_per_million : 0;
  const outputCost = costConfig ? (analysisOutputTokens / 1_000_000) * costConfig.output_cost_per_million : 0;
  const totalCost = inputCost + outputCost;

  await supabase.from('api_usage_logs').insert({
    edge_function: 'rix-analyze-v2',
    provider: 'openai',
    model: RIX_ANALYSIS_MODEL,
    action_type: 'rix_reanalysis',
    input_tokens: analysisInputTokens,
    output_tokens: analysisOutputTokens,
    estimated_cost_usd: totalCost,
    pipeline_stage: 'analysis',
    ticker: record['05_ticker'],
    metadata: {
      model_name: modelName,
      rix_score: finalRixScore,
      record_id,
      is_reprocess: true,
    },
  });

  const totalTime = Date.now() - startTime;
  console.log(`[rix-analyze-v2] Analysis completed for ${modelName} in ${totalTime}ms. RIX: ${finalRixScore}`);

  return {
    success: true,
    record_id,
    model_name: modelName,
    rix_score: finalRixScore,
    cxm_excluded: cxmExcluded,
    analysis_time_ms: totalTime,
    subscores: {
      nvm: analysis.nvm_score,
      drm: analysis.drm_score,
      sim: analysis.sim_score,
      rmm: analysis.rmm_score,
      cem: analysis.cem_score,
      gam: analysis.gam_score,
      dcm: analysis.dcm_score,
      cxm: cxmExcluded ? 'N/A' : analysis.cxm_score,
    },
    flags,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, record_id, batch_size = 10 } = body;
    
    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // === MODE 1: Reprocess pending records (surgical repair) ===
    if (action === 'reprocess_pending') {
      console.log(`[rix-analyze-v2] REPROCESS MODE: Finding up to ${batch_size} pending records...`);
      
      // Find records with search completed but analysis pending
      const { data: pendingRecords, error: fetchError } = await supabase
        .from('rix_runs_v2')
        .select('*')
        .is('analysis_completed_at', null)
        .not('search_completed_at', 'is', null)
        .order('created_at', { ascending: true })
        .limit(batch_size);

      if (fetchError) {
        console.error('[rix-analyze-v2] Error fetching pending records:', fetchError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch pending records', details: fetchError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!pendingRecords || pendingRecords.length === 0) {
        console.log('[rix-analyze-v2] No pending records found - all complete!');
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'No pending records found - all analyses are complete!',
            processed: 0,
            remaining: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[rix-analyze-v2] Found ${pendingRecords.length} pending records to process`);
      
      const results: any[] = [];
      const errors: any[] = [];
      
      // Process each record sequentially (to avoid rate limits)
      for (const record of pendingRecords) {
        try {
          console.log(`[rix-analyze-v2] Processing: ${record['05_ticker']} - ${record['02_model_name']}`);
          const result = await analyzeRecord(supabase, record);
          results.push(result);
          
          // Small delay between records to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error: any) {
          console.error(`[rix-analyze-v2] Error processing ${record.id}:`, error.message);
          errors.push({
            record_id: record.id,
            ticker: record['05_ticker'],
            model: record['02_model_name'],
            error: error.message,
          });
        }
      }
      
      // Count remaining
      const { count: remaining } = await supabase
        .from('rix_runs_v2')
        .select('*', { count: 'exact', head: true })
        .is('analysis_completed_at', null)
        .not('search_completed_at', 'is', null);

      console.log(`[rix-analyze-v2] Batch complete. Processed: ${results.length}, Errors: ${errors.length}, Remaining: ${remaining}`);

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'reprocess_pending',
          processed: results.length,
          errors: errors.length,
          remaining: remaining || 0,
          results,
          error_details: errors.length > 0 ? errors : undefined,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === MODE 2: Single record analysis (original behavior) ===
    if (!record_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: record_id or action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rix-analyze-v2] Starting analysis for record: ${record_id}`);

    // Fetch the record
    const { data: record, error: fetchError } = await supabase
      .from('rix_runs_v2')
      .select('*')
      .eq('id', record_id)
      .single();

    if (fetchError || !record) {
      console.error('[rix-analyze-v2] Record not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Record not found', details: fetchError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use shared analysis function
    const result = await analyzeRecord(supabase, record);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[rix-analyze-v2] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
