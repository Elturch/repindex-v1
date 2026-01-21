import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Full ORG_RIXSchema_V2 Tool Definition for GPT-4o
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
        num_posts_social: {
          type: "integer",
          description: "Number of social media posts cited",
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
        "rix_score", "resumen", "puntos_clave",
        "palabras", "num_fechas", "num_citas", "num_posts_social",
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

// Full analysis prompt implementing ORG_RIXSchema_V2 specifications
const buildAnalysisPrompt = (
  issuerName: string,
  ticker: string,
  dateFrom: string,
  dateTo: string,
  cotiza: boolean,
  weights: Record<string, number>,
  perplexityResponse: string | null,
  grokResponse: string | null,
  deepseekResponse: string | null
): string => `
INSTRUCCIONES (lee y cumple estrictamente):

Eres evaluador de RepIndex. Debes evaluar EXCLUSIVAMENTE el texto de las respuestas orgánicas de IAs sobre la reputación de una marca en una semana dada.

PROHIBIDO navegar o añadir información externa. Trabaja SOLO con el texto proporcionado.

Devuelve tu análisis usando la función submit_rix_analysis.

Redondea TODAS las puntuaciones a ENTEROS.

VENTANA Y METADATOS:
• Marca/Persona: ${issuerName}
• Ticker: ${ticker}
• Ventana: ${dateFrom}..${dateTo}
• Cotiza: ${cotiza ? 'Sí' : 'No'}
• Pesos: ${JSON.stringify(weights)}

DEFINICIONES DE MÉTRICAS (0–100):

• NVM (Narrative Value Metric) = clip0-100( 50·(s̄+1) − 20·c̄ − 30·h̄ )
  s̄∈[-1,+1] tono medio; c̄∈[0,1] controversia; h̄∈[0,1] alucinación

• DRM (Data Reliability Metric) = Primaria/oficial 40% + corroboración independiente 20% + claridad documental 30% + trazabilidad 10%

• SIM (Source Integrity Metric) = 100·(0.45·T1 + 0.30·T2 + 0.15·T3 + 0.10·T4)
  Según tier de cada referencia

• RMM (Reputational Momentum Metric) = minmax0-100(0.6·coverage_temporal + 0.2·peso_T1_reciente + 0.2·log10(nº_menciones))
  Si <50% hechos en ventana, RMM ≤ 69 y flag "datos_antiguos"

• CEM (Controversy Exposure Metric) = 100 − (0.5·J + 0.3·P + 0.2·L)
  J/P/L∈[0,100] (judicial, político, laboral/social)

• GAM (Governance Autonomy Metric) = Independencia, políticas, conflictos declarados

• DCM (Data Consistency Metric) = Coherencia de nombres/roles/fechas/cifras

• CXM (Corporate Execution Metric) = Impacto de mercado
  Si cotiza y faltan precios, CXM_score = 25 (NO "no_aplica")
  Si no cotiza, marca "no_aplica"

REGLAS DE NEGOCIO:

1. Mínimo 3 citas con fecha dentro de la ventana; si no, flag "pocas_fechas" o "datos_antiguos"
2. Si ticker-precio difiere >5% de BME/CNMV, resta 10 pts a DCM y flag "inconsistencias"
3. SI DRM < 40 O SIM < 40, limita RIX a 64 máximo y añade flag correspondiente
4. Si CXM es "no_aplica", redistribuye su peso proporcionalmente entre las otras métricas
5. Clasifica cada métrica: "Bueno" (≥70), "Mejorable" (40-69), "Insuficiente" (<40)

FLAGS DISPONIBLES:
["pocas_fechas", "sin_fuentes", "datos_antiguos", "respuesta_corta", "inconsistencias", "dudas_no_aclaradas", "confusion_alias", "cutoff_disclaimer", "alto_riesgo", "drm_bajo", "sim_bajo"]

CONTADORES A CALCULAR:
- palabras: total de palabras analizadas
- num_fechas: fechas específicas encontradas
- num_citas: número de fuentes/URLs
- num_posts_social: menciones de redes sociales
- temporal_alignment: proporción de hechos en ventana (0-1)
- citation_density: densidad de citas (0-1)

=== RESPUESTAS ORGÁNICAS A EVALUAR ===

--- PERPLEXITY SONAR PRO ---
${perplexityResponse || 'No disponible'}

--- GROK 3 ---
${grokResponse || 'No disponible'}

--- DEEPSEEK ---
${deepseekResponse || 'No disponible'}

=== FIN DE RESPUESTAS ===

Consolida la información de todos los modelos, identifica consensos y divergencias.
Usa la función submit_rix_analysis para enviar tu análisis estructurado.
`;

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
  
  let rixScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  
  // Apply business rule: cap at 64 if DRM < 40 or SIM < 40
  if (analysis.drm_score < 40 || analysis.sim_score < 40) {
    rixScore = Math.min(rixScore, 64);
  }
  
  return rixScore;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { record_id } = await req.json();

    if (!record_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: record_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rix-analyze-v2] Starting analysis for record: ${record_id}`);
    const startTime = Date.now();

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Check if company is traded
    const { data: issuerData } = await supabase
      .from('repindex_root_issuers')
      .select('cotiza_en_bolsa')
      .eq('ticker', record['05_ticker'])
      .single();

    const cotiza = issuerData?.cotiza_en_bolsa ?? false;

    // Build analysis prompt
    const analysisPrompt = buildAnalysisPrompt(
      record['03_target_name'] || 'Unknown',
      record['05_ticker'] || 'N/A',
      record['06_period_from'] || '',
      record['07_period_to'] || '',
      cotiza,
      DEFAULT_WEIGHTS,
      record['21_res_perplex_bruto'],
      record['respuesta_bruto_grok'],
      record['23_res_deepseek_bruto']
    );

    // Call GPT-4o with tool calling
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing OPENAI_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[rix-analyze-v2] Calling GPT-4o with full ORG_RIXSchema_V2 tool...');

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: analysisPrompt }],
        tools: [RIX_ANALYSIS_TOOL],
        tool_choice: { type: 'function', function: { name: 'submit_rix_analysis' } },
        temperature: 0.2,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('[rix-analyze-v2] OpenAI error:', errorText);
      return new Response(
        JSON.stringify({ error: 'OpenAI API error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openaiData = await openaiResponse.json();
    
    // Extract tool call arguments
    const toolCall = openaiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'submit_rix_analysis') {
      console.error('[rix-analyze-v2] No valid tool call in response');
      return new Response(
        JSON.stringify({ error: 'No valid analysis returned from GPT-4o' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    console.log('[rix-analyze-v2] Analysis received, processing...');

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

    // Map to database columns
    const updateData: Record<string, any> = {
      '09_rix_score': finalRixScore,
      '10_resumen': analysis.resumen,
      '11_puntos_clave': analysis.puntos_clave,
      '23_explicacion': analysis.explicacion || [],
      
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
      '48_precio_accion': analysis.precio_accion_semana,
      '49_precio_minimo_52s': analysis.precio_minimo_accion_year,
      '50_accion_vs_reputacion': analysis.accion_vs_reputacion,
      
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
      console.error('[rix-analyze-v2] Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update record', details: updateError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log(`[rix-analyze-v2] Analysis completed in ${totalTime}ms. RIX: ${finalRixScore}`);

    return new Response(
      JSON.stringify({
        success: true,
        record_id,
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
        counters: {
          palabras: analysis.palabras,
          num_fechas: analysis.num_fechas,
          num_citas: analysis.num_citas,
          num_posts_social: analysis.num_posts_social,
          temporal_alignment: analysis.temporal_alignment,
          citation_density: analysis.citation_density,
        },
        flags,
        effective_weights: effectiveWeights,
      }),
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
