import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PariRun {
  id: string;
  "02_model_name": string;
  "03_target_name": string;
  "05_ticker": string;
  "06_period_from": string;
  "07_period_to": string;
  "10_resumen": string;
  "20_res_gpt_bruto": string;
  "21_res_perplex_bruto": string;
  "22_res_gemini_bruto": string;
  "23_res_deepseek_bruto": string;
  "09_pari_score": number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no configurada');
    }

    const { weekStart, weekEnd, ticker } = await req.json();

    if (!weekStart || !weekEnd) {
      throw new Error('Se requieren weekStart y weekEnd');
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get all PARI runs for the specified week
    let query = supabase
      .from('pari_runs')
      .select('*')
      .gte('06_period_from', weekStart)
      .lte('07_period_to', weekEnd);

    if (ticker) {
      query = query.eq('05_ticker', ticker);
    }

    const { data: pariRuns, error } = await query;

    if (error) {
      console.error('Error fetching PARI runs:', error);
      throw error;
    }

    if (!pariRuns || pariRuns.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No se encontraron datos para el período especificado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Group runs by company
    const companiesData = new Map<string, PariRun[]>();
    pariRuns.forEach((run: PariRun) => {
      const companyName = run["03_target_name"];
      if (!companiesData.has(companyName)) {
        companiesData.set(companyName, []);
      }
      companiesData.get(companyName)!.push(run);
    });

    const consolidationReports = [];

    // Analyze each company
    for (const [companyName, runs] of companiesData.entries()) {
      console.log(`Analizando ${companyName} con ${runs.length} corridas...`);

      // Prepare texts for analysis
      const aiTexts = {
        gpt: runs.find(r => r["20_res_gpt_bruto"])?.["20_res_gpt_bruto"] || '',
        perplexity: runs.find(r => r["21_res_perplex_bruto"])?.["21_res_perplex_bruto"] || '',
        gemini: runs.find(r => r["22_res_gemini_bruto"])?.["22_res_gemini_bruto"] || '',
        deepseek: runs.find(r => r["23_res_deepseek_bruto"])?.["23_res_deepseek_bruto"] || '',
      };

      const modelsAnalyzed = Object.entries(aiTexts)
        .filter(([_, text]) => text.length > 0)
        .map(([model, _]) => model);

      if (modelsAnalyzed.length < 2) {
        console.log(`Saltando ${companyName}: solo ${modelsAnalyzed.length} modelo(s) disponible(s)`);
        continue;
      }

      // Create prompt for OpenAI
      const prompt = `Analiza los siguientes textos generados por diferentes modelos de IA sobre ${companyName} para el período ${weekStart} a ${weekEnd}.

Tu tarea es identificar:
1. COINCIDENCIAS: Temas, eventos o hechos mencionados por múltiples IA
2. FUENTES MEDIÁTICAS: Nombres de medios de comunicación citados (ej: El País, Reuters, Bloomberg, etc.)
3. DIVERGENCIAS: Aspectos en los que las IA difieren significativamente
4. CONSENSO: Score de 0-100 sobre qué tan de acuerdo están las IA

TEXTOS A ANALIZAR:

${modelsAnalyzed.includes('gpt') ? `=== ChatGPT ===\n${aiTexts.gpt}\n\n` : ''}
${modelsAnalyzed.includes('perplexity') ? `=== Perplexity ===\n${aiTexts.perplexity}\n\n` : ''}
${modelsAnalyzed.includes('gemini') ? `=== Gemini ===\n${aiTexts.gemini}\n\n` : ''}
${modelsAnalyzed.includes('deepseek') ? `=== Deepseek ===\n${aiTexts.deepseek}\n\n` : ''}

Responde SOLO con un JSON válido (sin markdown) con esta estructura:
{
  "main_coincidences": [
    {"topic": "tema", "mentioned_by": ["gpt", "gemini"], "description": "descripción"}
  ],
  "common_media_sources": [
    {"media": "nombre medio", "mentioned_by": ["perplexity"], "frequency": 1}
  ],
  "divergences": [
    {"aspect": "aspecto", "difference": "descripción de la diferencia"}
  ],
  "consensus_score": 75,
  "full_analysis": "análisis detallado en español",
  "media_ranking": [
    {"media": "El País", "mentions": 5, "models": ["gpt", "perplexity"]}
  ],
  "temporal_patterns": [
    {"pattern": "descripción del patrón temporal"}
  ]
}`;

      // Call OpenAI
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'Eres un analista experto en consolidación de información de múltiples fuentes de IA. Respondes siempre en español con JSON válido.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error(`OpenAI error for ${companyName}:`, errorText);
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const openaiData = await openaiResponse.json();
      const analysisText = openaiData.choices[0].message.content;
      
      // Parse JSON response
      let analysisResult;
      try {
        // Remove markdown code blocks if present
        const cleanedText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        analysisResult = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError);
        console.error('Response text:', analysisText);
        throw new Error('Error parsing AI response as JSON');
      }

      // Calculate total sources found
      const totalSources = analysisResult.common_media_sources?.length || 0;

      // Insert into database
      const { data: insertedReport, error: insertError } = await supabase
        .from('ai_consolidation_reports')
        .insert({
          week_start: weekStart,
          week_end: weekEnd,
          ticker: runs[0]["05_ticker"],
          company_name: companyName,
          main_coincidences: analysisResult.main_coincidences || [],
          common_media_sources: analysisResult.common_media_sources || [],
          divergences: analysisResult.divergences || [],
          consensus_score: analysisResult.consensus_score || 0,
          full_analysis: analysisResult.full_analysis || '',
          media_ranking: analysisResult.media_ranking || [],
          temporal_patterns: analysisResult.temporal_patterns || [],
          models_analyzed: modelsAnalyzed,
          total_sources_found: totalSources,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting report:', insertError);
        throw insertError;
      }

      consolidationReports.push(insertedReport);
    }

    return new Response(
      JSON.stringify({
        success: true,
        reports_created: consolidationReports.length,
        reports: consolidationReports,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-consolidation-analysis:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
