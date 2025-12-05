import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maximum characters to include from each raw response
const MAX_RAW_RESPONSE_LENGTH = 8000;

// Background processing function
async function processVectorStore(shouldClean: boolean, includeRawResponses: boolean) {
  console.log('Starting background vector store population...');
  
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    console.error('OPENAI_API_KEY not configured');
    return;
  }

  try {
    // Clean existing documents if requested
    if (shouldClean) {
      console.log('Cleaning existing documents...');
      const { error: deleteError } = await supabaseClient
        .from('documents')
        .delete()
        .neq('id', 0);
      
      if (deleteError) {
        console.error('Error cleaning documents:', deleteError);
      } else {
        console.log('Documents cleaned successfully');
      }
    }

    // Get all rix_runs - include raw AI responses for rich text search
    const { data: rixRuns, error: rixError } = await supabaseClient
      .from('rix_runs')
      .select('*')
      .not('10_resumen', 'is', null);

    if (rixError) {
      console.error('Error fetching rix_runs:', rixError);
      return;
    }

    console.log(`Processing ${rixRuns?.length || 0} rix_runs...`);
    console.log(`Include raw AI responses: ${includeRawResponses}`);

    // Get all issuers data
    const { data: issuers, error: issuersError } = await supabaseClient
      .from('repindex_root_issuers')
      .select('ticker, issuer_name, sector_category, ibex_family_code');

    if (issuersError) {
      console.error('Error fetching issuers:', issuersError);
      return;
    }

    const issuersMap = new Map(
      issuers?.map(issuer => [issuer.ticker, issuer]) || []
    );

    let documentsCreated = 0;
    let documentsSkipped = 0;
    let documentsErrored = 0;

    for (const run of rixRuns || []) {
      try {
        // Check if document already exists
        if (!shouldClean) {
          const { data: existing } = await supabaseClient
            .from('documents')
            .select('id')
            .eq('metadata->>rix_run_id', run.id)
            .maybeSingle();

          if (existing) {
            documentsSkipped++;
            continue;
          }
        }

        const issuerData = issuersMap.get(run["05_ticker"]);

        // Build RICH content including raw AI responses
        let content = `Empresa: ${run["03_target_name"] || "N/A"}\n`;
        content += `Ticker: ${run["05_ticker"] || "N/A"}\n`;
        content += `Modelo IA: ${run["02_model_name"] || "N/A"}\n`;
        content += `Período: ${run["06_period_from"]} - ${run["07_period_to"]}\n`;
        content += `RIX Score: ${run["09_rix_score"] || "N/A"}\n`;
        
        if (issuerData) {
          content += `Sector: ${issuerData.sector_category || "N/A"}\n`;
          content += `Familia IBEX: ${issuerData.ibex_family_code || "N/A"}\n`;
        }
        content += `\n`;
        
        // Include summary
        if (run["10_resumen"]) {
          content += `RESUMEN EJECUTIVO:\n${run["10_resumen"]}\n\n`;
        }
        
        // Include key points
        if (run["11_puntos_clave"]) {
          try {
            let puntosClave: string[] = [];
            
            if (typeof run["11_puntos_clave"] === 'string') {
              try {
                puntosClave = JSON.parse(run["11_puntos_clave"]);
              } catch {
                const text = run["11_puntos_clave"];
                if (text.includes(',')) {
                  puntosClave = text.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                } else if (text.includes('\n')) {
                  puntosClave = text.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                } else {
                  puntosClave = [text];
                }
              }
            } else if (Array.isArray(run["11_puntos_clave"])) {
              puntosClave = run["11_puntos_clave"];
            }
            
            if (puntosClave.length > 0) {
              content += `PUNTOS CLAVE:\n`;
              puntosClave.forEach((punto: string, idx: number) => {
                content += `${idx + 1}. ${punto}\n`;
              });
              content += `\n`;
            }
          } catch (e) {
            console.error('Error processing puntos_clave for run', run.id, ':', e);
          }
        }

        // Include explanation if available
        if (run["22_explicacion"]) {
          content += `EXPLICACIÓN DEL ANÁLISIS:\n${run["22_explicacion"]}\n\n`;
        }

        // Include RAW AI RESPONSES - This is where sources like Forbes appear!
        if (includeRawResponses) {
          if (run["20_res_gpt_bruto"]) {
            const gptText = run["20_res_gpt_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH);
            content += `RESPUESTA COMPLETA CHATGPT:\n${gptText}\n\n`;
          }

          if (run["21_res_perplex_bruto"]) {
            const perplexText = run["21_res_perplex_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH);
            content += `RESPUESTA COMPLETA PERPLEXITY:\n${perplexText}\n\n`;
          }

          if (run["22_res_gemini_bruto"]) {
            const geminiText = run["22_res_gemini_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH);
            content += `RESPUESTA COMPLETA GEMINI:\n${geminiText}\n\n`;
          }

          if (run["23_res_deepseek_bruto"]) {
            const deepseekText = run["23_res_deepseek_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH);
            content += `RESPUESTA COMPLETA DEEPSEEK:\n${deepseekText}\n\n`;
          }
        }

        // Include detailed explanations per metric if available
        if (run["25_explicaciones_detalladas"]) {
          try {
            const explicaciones = typeof run["25_explicaciones_detalladas"] === 'string'
              ? JSON.parse(run["25_explicaciones_detalladas"])
              : run["25_explicaciones_detalladas"];
            
            if (explicaciones && typeof explicaciones === 'object') {
              content += `EXPLICACIONES POR MÉTRICA:\n`;
              for (const [metric, explanation] of Object.entries(explicaciones)) {
                if (explanation) {
                  content += `- ${metric}: ${explanation}\n`;
                }
              }
              content += `\n`;
            }
          } catch (e) {
            console.error('Error processing explicaciones_detalladas for run', run.id, ':', e);
          }
        }

        // Log content size for monitoring
        console.log(`Processing ${run.id} (${run["03_target_name"]}): ${content.length} chars`);

        // Generate embedding with OpenAI
        const contentForEmbedding = content.slice(0, 32000);

        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: contentForEmbedding,
          }),
        });

        if (!embeddingResponse.ok) {
          const errorText = await embeddingResponse.text();
          console.error(`Failed embedding for run ${run.id}:`, errorText);
          documentsErrored++;
          continue;
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0].embedding;

        // Build comprehensive metadata
        const metadata = {
          rix_run_id: run.id,
          company_name: run["03_target_name"],
          ticker: run["05_ticker"],
          ai_model: run["02_model_name"],
          week_start: run["06_period_from"],
          week_end: run["07_period_to"],
          rix_score: run["09_rix_score"],
          sector_category: issuerData?.sector_category,
          ibex_family_code: issuerData?.ibex_family_code,
          has_raw_responses: includeRawResponses && !!(
            run["20_res_gpt_bruto"] || 
            run["21_res_perplex_bruto"] || 
            run["22_res_gemini_bruto"] || 
            run["23_res_deepseek_bruto"]
          ),
          content_length: content.length,
          scores: {
            nvm: run["23_nvm_score"],
            drm: run["26_drm_score"],
            sim: run["29_sim_score"],
            rmm: run["32_rmm_score"],
            cem: run["35_cem_score"],
            gam: run["38_gam_score"],
            dcm: run["41_dcm_score"],
            cxm: run["44_cxm_score"],
          },
          categories: {
            nvm: run["25_nvm_categoria"],
            drm: run["28_drm_categoria"],
            sim: run["31_sim_categoria"],
            rmm: run["34_rmm_categoria"],
            cem: run["37_cem_categoria"],
            gam: run["40_gam_categoria"],
            dcm: run["43_dcm_categoria"],
            cxm: run["46_cxm_categoria"],
          },
          flags: run["17_flags"] || [],
          citation_density: run["16_citation_density"],
          temporal_alignment: run["15_temporal_alignment"],
        };

        // Insert document with full content
        const { error: insertError } = await supabaseClient
          .from('documents')
          .insert({
            content,
            metadata,
            embedding,
          });

        if (insertError) {
          console.error(`Error inserting doc ${run.id}:`, insertError);
          documentsErrored++;
        } else {
          documentsCreated++;
        }

        // Rate limit control
        if (documentsCreated % 50 === 0) {
          console.log(`Progress: ${documentsCreated} created, ${documentsSkipped} skipped, ${documentsErrored} errored`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (docError) {
        console.error(`Error processing run ${run.id}:`, docError);
        documentsErrored++;
      }
    }

    console.log(`COMPLETED: ${documentsCreated} created, ${documentsSkipped} skipped, ${documentsErrored} errored`);
  } catch (error) {
    console.error('Fatal error in background processing:', error);
  }
}

// Handle shutdown gracefully
addEventListener('beforeunload', (ev) => {
  console.log('Function shutdown - reason:', (ev as any).detail?.reason);
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body for options
    const body = await req.json().catch(() => ({}));
    const shouldClean = body.clean === true;
    const includeRawResponses = body.includeRawResponses !== false;

    console.log(`Starting vector store population - clean: ${shouldClean}, includeRawResponses: ${includeRawResponses}`);

    // Start background processing - this won't block the response
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processVectorStore(shouldClean, includeRawResponses));

    // Return immediate response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Vector store population started in background',
        clean: shouldClean,
        includeRawResponses: includeRawResponses,
        note: 'Check function logs for progress'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error starting populate-vector-store:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
