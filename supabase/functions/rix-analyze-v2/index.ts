import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// RIX Analysis Schema for GPT-4o tool calling
const RIX_ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "submit_rix_analysis",
    description: "Submit the RIX reputational analysis scores for a company",
    parameters: {
      type: "object",
      properties: {
        rix_score: {
          type: "integer",
          description: "Overall RIX score (0-100)",
          minimum: 0,
          maximum: 100,
        },
        resumen: {
          type: "string",
          description: "Executive summary of the company's reputation (2-3 sentences)",
        },
        puntos_clave: {
          type: "array",
          items: { type: "string" },
          description: "List of 3-5 key points about the company's reputation",
        },
        nvm_score: {
          type: "integer",
          description: "News Volume & Media Coverage score (0-100)",
          minimum: 0,
          maximum: 100,
        },
        nvm_categoria: {
          type: "string",
          enum: ["muy_alto", "alto", "medio", "bajo", "muy_bajo"],
          description: "News Volume category",
        },
        drm_score: {
          type: "integer",
          description: "Digital Reputation Management score (0-100)",
          minimum: 0,
          maximum: 100,
        },
        drm_categoria: {
          type: "string",
          enum: ["excelente", "bueno", "aceptable", "deficiente", "crítico"],
          description: "Digital Reputation category",
        },
        sim_score: {
          type: "integer",
          description: "Stakeholder Impact Measurement score (0-100)",
          minimum: 0,
          maximum: 100,
        },
        sim_categoria: {
          type: "string",
          enum: ["muy_positivo", "positivo", "neutro", "negativo", "muy_negativo"],
          description: "Stakeholder Impact category",
        },
        rmm_score: {
          type: "integer",
          description: "Risk Management & Mitigation score (0-100)",
          minimum: 0,
          maximum: 100,
        },
        rmm_categoria: {
          type: "string",
          enum: ["excelente", "bueno", "aceptable", "deficiente", "crítico"],
          description: "Risk Management category",
        },
        cem_score: {
          type: "integer",
          description: "Corporate Ethics & Management score (0-100)",
          minimum: 0,
          maximum: 100,
        },
        cem_categoria: {
          type: "string",
          enum: ["ejemplar", "bueno", "aceptable", "cuestionable", "deficiente"],
          description: "Corporate Ethics category",
        },
        gam_score: {
          type: "integer",
          description: "Growth & Adaptability Metrics score (0-100)",
          minimum: 0,
          maximum: 100,
        },
        gam_categoria: {
          type: "string",
          enum: ["innovador", "adaptable", "estable", "rezagado", "estancado"],
          description: "Growth & Adaptability category",
        },
        dcm_score: {
          type: "integer",
          description: "Digital Communication & Marketing score (0-100)",
          minimum: 0,
          maximum: 100,
        },
        dcm_categoria: {
          type: "string",
          enum: ["líder", "avanzado", "competente", "básico", "deficiente"],
          description: "Digital Communication category",
        },
        cxm_score: {
          type: "integer",
          description: "Customer Experience Management score (0-100). Use -1 if not applicable (B2B companies)",
          minimum: -1,
          maximum: 100,
        },
        cxm_categoria: {
          type: "string",
          enum: ["excepcional", "bueno", "aceptable", "mejorable", "deficiente", "no_aplica"],
          description: "Customer Experience category",
        },
        flags: {
          type: "array",
          items: { type: "string" },
          description: "List of detected flags: controversia_activa, riesgo_reputacional, tendencia_positiva, liderazgo_sectorial, crisis_comunicacion, esg_destacado, innovacion_reconocida",
        },
        palabras: {
          type: "integer",
          description: "Approximate word count of the analysis",
        },
        num_fechas: {
          type: "integer",
          description: "Number of specific dates mentioned in sources",
        },
        num_citas: {
          type: "integer",
          description: "Number of sources/citations referenced",
        },
      },
      required: [
        "rix_score", "resumen", "puntos_clave",
        "nvm_score", "nvm_categoria",
        "drm_score", "drm_categoria",
        "sim_score", "sim_categoria",
        "rmm_score", "rmm_categoria",
        "cem_score", "cem_categoria",
        "gam_score", "gam_categoria",
        "dcm_score", "dcm_categoria",
        "cxm_score", "cxm_categoria",
        "flags", "palabras", "num_fechas", "num_citas"
      ],
    },
  },
};

const ANALYSIS_PROMPT = `Eres un analista experto en reputación corporativa. Analiza las siguientes respuestas de 7 modelos de IA sobre la empresa {{issuer_name}} ({{ticker}}) y genera una evaluación RIX consolidada.

RESPUESTAS DE LOS MODELOS:

=== GPT-4o ===
{{gpt_response}}

=== Gemini ===
{{gemini_response}}

=== Perplexity ===
{{perplexity_response}}

=== DeepSeek ===
{{deepseek_response}}

=== Claude ===
{{claude_response}}

=== Grok ===
{{grok_response}}

=== Qwen ===
{{qwen_response}}

INSTRUCCIONES DE ANÁLISIS:

1. Consolida la información de todos los modelos
2. Identifica consensos y divergencias entre modelos
3. Genera puntuaciones para cada métrica RIX (0-100):
   - NVM (News Volume & Media): Volumen y alcance de cobertura mediática
   - DRM (Digital Reputation): Estado de la reputación digital
   - SIM (Stakeholder Impact): Impacto en stakeholders (empleados, inversores, etc.)
   - RMM (Risk Management): Gestión de riesgos reputacionales
   - CEM (Corporate Ethics): Ética corporativa y gobernanza
   - GAM (Growth & Adaptability): Capacidad de crecimiento e innovación
   - DCM (Digital Communication): Comunicación y marketing digital
   - CXM (Customer Experience): Experiencia del cliente (usa -1 si es B2B puro)

4. REGLAS DE NEGOCIO:
   - Si DRM < 40 O SIM < 40, el RIX total no puede superar 64
   - Si CXM = "no_aplica", redistribuye su peso entre las otras métricas
   - Identifica flags relevantes de la lista proporcionada

5. Usa la función submit_rix_analysis para enviar tu análisis estructurado.

Empresa: {{issuer_name}}
Ticker: {{ticker}}`;

// Default weights for RIX calculation
const DEFAULT_WEIGHTS = {
  nvm: 10,
  drm: 15,
  sim: 15,
  rmm: 15,
  cem: 15,
  gam: 10,
  dcm: 10,
  cxm: 10,
};

function calculateRixScore(analysis: any): { rixScore: number; adjustedRixScore: number; cxmExcluded: boolean; weights: Record<string, number> } {
  const weights = { ...DEFAULT_WEIGHTS };
  let cxmExcluded = false;

  // Handle CXM exclusion
  if (analysis.cxm_categoria === 'no_aplica' || analysis.cxm_score === -1) {
    cxmExcluded = true;
    // Redistribute CXM weight proportionally
    const cxmWeight = weights.cxm;
    delete weights.cxm;
    const totalOtherWeights = Object.values(weights).reduce((a, b) => a + b, 0);
    Object.keys(weights).forEach(key => {
      weights[key] = Math.round(weights[key] * (100 / totalOtherWeights));
    });
  }

  // Calculate weighted score
  let totalScore = 0;
  let totalWeight = 0;

  const scoreMap: Record<string, number> = {
    nvm: analysis.nvm_score,
    drm: analysis.drm_score,
    sim: analysis.sim_score,
    rmm: analysis.rmm_score,
    cem: analysis.cem_score,
    gam: analysis.gam_score,
    dcm: analysis.dcm_score,
    cxm: cxmExcluded ? 0 : analysis.cxm_score,
  };

  Object.entries(weights).forEach(([key, weight]) => {
    if (scoreMap[key] !== undefined && scoreMap[key] >= 0) {
      totalScore += scoreMap[key] * weight;
      totalWeight += weight;
    }
  });

  const rixScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

  // Apply business rule: cap at 64 if DRM < 40 or SIM < 40
  let adjustedRixScore = rixScore;
  if (analysis.drm_score < 40 || analysis.sim_score < 40) {
    adjustedRixScore = Math.min(rixScore, 64);
  }

  return { rixScore, adjustedRixScore, cxmExcluded, weights };
}

serve(async (req) => {
  // Handle CORS
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

    // Initialize Supabase client
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

    // Build analysis prompt
    const prompt = ANALYSIS_PROMPT
      .replace(/\{\{issuer_name\}\}/g, record['03_target_name'] || 'Unknown')
      .replace(/\{\{ticker\}\}/g, record['05_ticker'] || 'N/A')
      .replace('{{gpt_response}}', record['20_res_gpt_bruto'] || 'No disponible')
      .replace('{{gemini_response}}', record['22_res_gemini_bruto'] || 'No disponible')
      .replace('{{perplexity_response}}', record['21_res_perplex_bruto'] || 'No disponible')
      .replace('{{deepseek_response}}', record['23_res_deepseek_bruto'] || 'No disponible')
      .replace('{{claude_response}}', record['respuesta_bruto_claude'] || 'No disponible')
      .replace('{{grok_response}}', record['respuesta_bruto_grok'] || 'No disponible')
      .replace('{{qwen_response}}', record['respuesta_bruto_qwen'] || 'No disponible');

    // Call GPT-4o with tool calling
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing OPENAI_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[rix-analyze-v2] Calling GPT-4o with tool calling...');

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
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
    console.log('[rix-analyze-v2] Analysis received:', JSON.stringify(analysis).substring(0, 200));

    // Calculate RIX scores with business rules
    const { rixScore, adjustedRixScore, cxmExcluded, weights } = calculateRixScore(analysis);

    // Update record with analysis results
    const updateData = {
      '09_rix_score': rixScore,
      '51_rix_score_adjusted': adjustedRixScore,
      '10_resumen': analysis.resumen,
      '11_puntos_clave': analysis.puntos_clave,
      '23_nvm_score': analysis.nvm_score,
      '24_nvm_peso': weights.nvm || DEFAULT_WEIGHTS.nvm,
      '25_nvm_categoria': analysis.nvm_categoria,
      '26_drm_score': analysis.drm_score,
      '27_drm_peso': weights.drm || DEFAULT_WEIGHTS.drm,
      '28_drm_categoria': analysis.drm_categoria,
      '29_sim_score': analysis.sim_score,
      '30_sim_peso': weights.sim || DEFAULT_WEIGHTS.sim,
      '31_sim_categoria': analysis.sim_categoria,
      '32_rmm_score': analysis.rmm_score,
      '33_rmm_peso': weights.rmm || DEFAULT_WEIGHTS.rmm,
      '34_rmm_categoria': analysis.rmm_categoria,
      '35_cem_score': analysis.cem_score,
      '36_cem_peso': weights.cem || DEFAULT_WEIGHTS.cem,
      '37_cem_categoria': analysis.cem_categoria,
      '38_gam_score': analysis.gam_score,
      '39_gam_peso': weights.gam || DEFAULT_WEIGHTS.gam,
      '40_gam_categoria': analysis.gam_categoria,
      '41_dcm_score': analysis.dcm_score,
      '42_dcm_peso': weights.dcm || DEFAULT_WEIGHTS.dcm,
      '43_dcm_categoria': analysis.dcm_categoria,
      '44_cxm_score': cxmExcluded ? null : analysis.cxm_score,
      '45_cxm_peso': cxmExcluded ? 0 : (weights.cxm || DEFAULT_WEIGHTS.cxm),
      '46_cxm_categoria': analysis.cxm_categoria,
      '52_cxm_excluded': cxmExcluded,
      '17_flags': analysis.flags,
      '12_palabras': analysis.palabras,
      '13_num_fechas': analysis.num_fechas,
      '14_num_citas': analysis.num_citas,
      '19_weights': weights,
      'analysis_completed_at': new Date().toISOString(),
      'updated_at': new Date().toISOString(),
    };

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

    console.log(`[rix-analyze-v2] Analysis completed in ${Date.now() - startTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        record_id,
        rix_score: rixScore,
        rix_score_adjusted: adjustedRixScore,
        cxm_excluded: cxmExcluded,
        analysis_time_ms: Date.now() - startTime,
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
        flags: analysis.flags,
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
