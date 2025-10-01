import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Parse request body for clean option
    const body = await req.json().catch(() => ({}));
    const shouldClean = body.clean === true;

    // Clean existing documents if requested
    if (shouldClean) {
      console.log('Cleaning existing documents...');
      const { error: deleteError } = await supabaseClient
        .from('documents')
        .delete()
        .neq('id', 0); // Delete all
      
      if (deleteError) {
        console.error('Error cleaning documents:', deleteError);
      } else {
        console.log('Documents cleaned successfully');
      }
    }

    // Get all pari_runs with resumen
    const { data: pariRuns, error: pariError } = await supabaseClient
      .from('pari_runs')
      .select('*')
      .not('10_resumen', 'is', null);

    if (pariError) throw pariError;

    console.log(`Processing ${pariRuns?.length || 0} pari_runs...`);

    // Get all issuers data to join manually
    const { data: issuers, error: issuersError } = await supabaseClient
      .from('repindex_root_issuers')
      .select('ticker, issuer_name, sector_category, ibex_family_code');

    if (issuersError) throw issuersError;

    // Create a map for quick lookup
    const issuersMap = new Map(
      issuers?.map(issuer => [issuer.ticker, issuer]) || []
    );

    let documentsCreated = 0;
    let documentsSkipped = 0;

    for (const run of pariRuns || []) {
      // Check if document already exists (skip if clean wasn't requested)
      if (!shouldClean) {
        const { data: existing } = await supabaseClient
          .from('documents')
          .select('id')
          .eq('metadata->>pari_run_id', run.id)
          .maybeSingle();

        if (existing) {
          documentsSkipped++;
          continue;
        }
      }

      // Get issuer data from map
      const issuerData = issuersMap.get(run["05_ticker"]);

      // Build content from resumen and puntos_clave
      let content = `Empresa: ${run["03_target_name"] || "N/A"}\n`;
      content += `Ticker: ${run["05_ticker"] || "N/A"}\n`;
      content += `Modelo IA: ${run["02_model_name"] || "N/A"}\n`;
      content += `Período: ${run["06_period_from"]} - ${run["07_period_to"]}\n`;
      content += `PARI Score: ${run["09_pari_score"] || "N/A"}\n\n`;
      
      if (run["10_resumen"]) {
        content += `Resumen:\n${run["10_resumen"]}\n\n`;
      }
      
      if (run["11_puntos_clave"]) {
        try {
          let puntosClave: string[] = [];
          
          if (typeof run["11_puntos_clave"] === 'string') {
            // Try to parse as JSON first
            try {
              puntosClave = JSON.parse(run["11_puntos_clave"]);
            } catch {
              // If not JSON, split by comma and newline, or use as single item
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
            content += `Puntos Clave:\n`;
            puntosClave.forEach((punto: string, idx: number) => {
              content += `${idx + 1}. ${punto}\n`;
            });
          }
        } catch (e) {
          console.error('Error processing puntos_clave for run', run.id, ':', e);
          // Continue without puntos_clave rather than failing
        }
      }

      // Generate embedding with OpenAI
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: content,
        }),
      });

      if (!embeddingResponse.ok) {
        console.error(`Failed to generate embedding for run ${run.id}`);
        continue;
      }

      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;

      // Build metadata
      const metadata = {
        pari_run_id: run.id,
        company_name: run["03_target_name"],
        ticker: run["05_ticker"],
        ai_model: run["02_model_name"],
        week_start: run["06_period_from"],
        week_end: run["07_period_to"],
        pari_score: run["09_pari_score"],
        sector_category: issuerData?.sector_category,
        ibex_family_code: issuerData?.ibex_family_code,
        scores: {
          lns: run["23_lns_score"],
          es: run["26_es_score"],
          sam: run["29_sam_score"],
          rm: run["32_rm_score"],
          clr: run["35_clr_score"],
          gip: run["38_gip_score"],
          kgi: run["41_kgi_score"],
          mpi: run["44_mpi_score"],
        },
        categories: {
          lns: run["25_lns_categoria"],
          es: run["28_es_categoria"],
          sam: run["31_sam_categoria"],
          rm: run["34_rm_categoria"],
          clr: run["37_clr_categoria"],
          gip: run["40_gip_categoria"],
          kgi: run["43_kgi_categoria"],
          mpi: run["46_mpi_categoria"],
        },
        flags: run["17_flags"] || [],
        citation_density: run["16_citation_density"],
        temporal_alignment: run["15_temporal_alignment"],
      };

      // Insert document
      const { error: insertError } = await supabaseClient
        .from('documents')
        .insert({
          content,
          metadata,
          embedding,
        });

      if (insertError) {
        console.error(`Error inserting document for run ${run.id}:`, insertError);
      } else {
        documentsCreated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_runs: pariRuns?.length || 0,
        documents_created: documentsCreated,
        documents_skipped: documentsSkipped,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in populate-vector-store:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
