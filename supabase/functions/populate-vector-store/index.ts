import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const MAX_RAW_RESPONSE_LENGTH = 8000;
const BATCH_SIZE = 100; // Documents per execution
const MAX_EXECUTION_TIME = 45000; // 45 seconds (safe margin before timeout)

// Background processing function - INCREMENTAL ONLY (never deletes)
async function processVectorStore(includeRawResponses: boolean) {
  const startTime = Date.now();
  console.log('Starting incremental vector store population...');
  
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    console.error('OPENAI_API_KEY not configured');
    return { success: false, error: 'OPENAI_API_KEY not configured' };
  }

  try {
    // Get existing document IDs (by rix_run_id in metadata)
    console.log('Fetching existing documents...');
    const { data: existingDocs, error: existingError } = await supabaseClient
      .from('documents')
      .select('metadata');

    if (existingError) {
      console.error('Error fetching existing docs:', existingError);
      return { success: false, error: existingError.message };
    }

    const existingRunIds = new Set(
      existingDocs?.map(d => d.metadata?.rix_run_id).filter(Boolean) || []
    );
    console.log(`Found ${existingRunIds.size} existing documents`);

    // Get all rix_runs that don't have documents yet
    const { data: rixRuns, error: rixError } = await supabaseClient
      .from('rix_runs')
      .select('*')
      .not('10_resumen', 'is', null);

    if (rixError) {
      console.error('Error fetching rix_runs:', rixError);
      return { success: false, error: rixError.message };
    }

    const totalRuns = rixRuns?.length || 0;
    const pendingRuns = rixRuns?.filter(r => !existingRunIds.has(r.id)) || [];
    
    console.log(`Total rix_runs: ${totalRuns}, Pending: ${pendingRuns.length}`);

    if (pendingRuns.length === 0) {
      console.log('No pending documents to process!');
      return { 
        success: true, 
        complete: true, 
        processed: 0, 
        remaining: 0,
        total: totalRuns,
        existing: existingRunIds.size
      };
    }

    // Get issuers data
    const { data: issuers } = await supabaseClient
      .from('repindex_root_issuers')
      .select('ticker, issuer_name, sector_category, ibex_family_code');

    const issuersMap = new Map(
      issuers?.map(issuer => [issuer.ticker, issuer]) || []
    );

    let documentsCreated = 0;
    let documentsErrored = 0;

    // Process batch with time limit
    const batchToProcess = pendingRuns.slice(0, BATCH_SIZE);
    
    for (const run of batchToProcess) {
      // Check time limit
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`Time limit reached after ${documentsCreated} documents`);
        break;
      }

      try {
        const issuerData = issuersMap.get(run["05_ticker"]);

        // Build RICH content
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
        
        if (run["10_resumen"]) {
          content += `RESUMEN EJECUTIVO:\n${run["10_resumen"]}\n\n`;
        }
        
        // Key points
        if (run["11_puntos_clave"]) {
          try {
            let puntosClave: string[] = [];
            if (typeof run["11_puntos_clave"] === 'string') {
              try {
                puntosClave = JSON.parse(run["11_puntos_clave"]);
              } catch {
                const text = run["11_puntos_clave"];
                puntosClave = text.includes(',') 
                  ? text.split(',').map((s: string) => s.trim()).filter(Boolean)
                  : text.includes('\n')
                    ? text.split('\n').map((s: string) => s.trim()).filter(Boolean)
                    : [text];
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
            console.error('Error processing puntos_clave:', e);
          }
        }

        if (run["22_explicacion"]) {
          content += `EXPLICACIÓN DEL ANÁLISIS:\n${run["22_explicacion"]}\n\n`;
        }

        // Raw AI responses
        if (includeRawResponses) {
          if (run["20_res_gpt_bruto"]) {
            content += `RESPUESTA COMPLETA CHATGPT:\n${run["20_res_gpt_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
          }
          if (run["21_res_perplex_bruto"]) {
            content += `RESPUESTA COMPLETA PERPLEXITY:\n${run["21_res_perplex_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
          }
          if (run["22_res_gemini_bruto"]) {
            content += `RESPUESTA COMPLETA GEMINI:\n${run["22_res_gemini_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
          }
          if (run["23_res_deepseek_bruto"]) {
            content += `RESPUESTA COMPLETA DEEPSEEK:\n${run["23_res_deepseek_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
          }
        }

        // Detailed explanations
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
            console.error('Error processing explicaciones_detalladas:', e);
          }
        }

        // Generate embedding
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

        // Metadata
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
          has_raw_responses: includeRawResponses,
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

        // Insert document
        const { error: insertError } = await supabaseClient
          .from('documents')
          .insert({ content, metadata, embedding });

        if (insertError) {
          console.error(`Error inserting doc ${run.id}:`, insertError);
          documentsErrored++;
        } else {
          documentsCreated++;
        }

        // Progress log
        if (documentsCreated % 20 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`Progress: ${documentsCreated} created, ${documentsErrored} errors, ${elapsed}s elapsed`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (docError) {
        console.error(`Error processing run ${run.id}:`, docError);
        documentsErrored++;
      }
    }

    const remaining = pendingRuns.length - documentsCreated;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`BATCH COMPLETED: ${documentsCreated} created, ${documentsErrored} errors, ${remaining} remaining, ${elapsed}s`);
    
    return {
      success: true,
      complete: remaining <= 0,
      processed: documentsCreated,
      errored: documentsErrored,
      remaining: Math.max(0, remaining),
      total: totalRuns,
      existing: existingRunIds.size + documentsCreated,
      elapsed_seconds: elapsed,
    };
    
  } catch (error) {
    console.error('Fatal error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const includeRawResponses = body.includeRawResponses !== false;

    console.log(`Starting incremental vector store population (includeRawResponses: ${includeRawResponses})`);

    // Process synchronously to return result (auto-continuation needs result)
    const result = await processVectorStore(includeRawResponses);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in populate-vector-store:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
