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

  const startTime = Date.now();
  console.log('Starting feedback vector store population...');

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'OPENAI_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get positive feedback items that haven't been included yet
    const { data: pendingFeedback, error: fetchError } = await supabaseClient
      .from('chat_response_feedback')
      .select('*')
      .eq('rating', 'positive')
      .eq('included_in_vector_store', false)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      throw new Error(`Error fetching feedback: ${fetchError.message}`);
    }

    if (!pendingFeedback || pendingFeedback.length === 0) {
      console.log('No pending positive feedback to process');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No pending feedback' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${pendingFeedback.length} positive feedback items to process`);

    let processed = 0;
    let errors = 0;

    for (const feedback of pendingFeedback) {
      try {
        // Build content for embedding
        let content = `RESPUESTA VALORADA POSITIVAMENTE POR USUARIO\n\n`;
        
        if (feedback.user_question) {
          content += `PREGUNTA DEL USUARIO:\n${feedback.user_question}\n\n`;
        }
        
        content += `RESPUESTA DEL AGENTE RIX:\n${feedback.message_content}\n\n`;
        content += `CONTEXTO: Esta respuesta fue valorada positivamente por un usuario, indicando que fue útil y relevante.\n`;
        content += `FECHA DE VALORACIÓN: ${new Date(feedback.created_at).toISOString()}\n`;

        // Generate embedding
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: content.slice(0, 8000),
          }),
        });

        if (!embeddingResponse.ok) {
          const errorText = await embeddingResponse.text();
          console.error(`Embedding failed for feedback ${feedback.id}:`, errorText);
          errors++;
          continue;
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0].embedding;

        // Metadata for the document
        const metadata = {
          source_type: 'user_feedback',
          feedback_id: feedback.id,
          session_id: feedback.session_id,
          user_id: feedback.user_id,
          rating: feedback.rating,
          feedback_date: feedback.created_at,
          has_question: !!feedback.user_question,
          content_length: feedback.message_content.length,
        };

        // Insert into documents table
        const { error: insertError } = await supabaseClient
          .from('documents')
          .insert({
            content,
            metadata,
            embedding,
          });

        if (insertError) {
          console.error(`Insert failed for feedback ${feedback.id}:`, insertError);
          errors++;
          continue;
        }

        // Mark as included
        const { error: updateError } = await supabaseClient
          .from('chat_response_feedback')
          .update({
            included_in_vector_store: true,
            vector_store_included_at: new Date().toISOString(),
          })
          .eq('id', feedback.id);

        if (updateError) {
          console.error(`Update failed for feedback ${feedback.id}:`, updateError);
        }

        processed++;
        console.log(`Processed feedback ${feedback.id} (${processed}/${pendingFeedback.length})`);

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (itemError) {
        console.error(`Error processing feedback ${feedback.id}:`, itemError);
        errors++;
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`Completed: ${processed} processed, ${errors} errors, ${elapsed}s elapsed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        errors,
        total: pendingFeedback.length,
        elapsed_seconds: elapsed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
