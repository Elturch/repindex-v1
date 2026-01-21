import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Issuer {
  ticker: string;
  issuer_name: string;
  ibex_family_code: string | null;
}

interface BatchProgress {
  total: number;
  processed: number;
  successes: number;
  failures: number;
  currentBatch: number;
  totalBatches: number;
  errors: Array<{ ticker: string; error: string }>;
  startedAt: string;
  estimatedEndAt: string | null;
}

// Configuration
const BATCH_SIZE = 5; // Companies to process in parallel
const DELAY_BETWEEN_BATCHES_MS = 30000; // 30 seconds between batches
const ESTIMATED_TIME_PER_COMPANY_MS = 45000; // 45 seconds per company (search + 7 analyses)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function triggerSearch(
  ticker: string,
  issuerName: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[rix-batch-orchestrator] Triggering search for ${ticker} (${issuerName})`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        ticker,
        issuer_name: issuerName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[rix-batch-orchestrator] Search failed for ${ticker}: ${errorText}`);
      return { success: false, error: errorText };
    }

    const result = await response.json();
    console.log(`[rix-batch-orchestrator] Search completed for ${ticker}:`, {
      modelsProcessed: result.results?.length || 0,
      errors: result.errors?.length || 0,
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[rix-batch-orchestrator] Exception for ${ticker}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

async function processBatch(
  batch: Issuer[],
  supabaseUrl: string,
  serviceKey: string
): Promise<Array<{ ticker: string; success: boolean; error?: string }>> {
  const results = await Promise.allSettled(
    batch.map(issuer => triggerSearch(issuer.ticker, issuer.issuer_name, supabaseUrl, serviceKey))
  );

  return results.map((result, index) => {
    const ticker = batch[index].ticker;
    if (result.status === "fulfilled") {
      return { ticker, ...result.value };
    } else {
      return { ticker, success: false, error: result.reason?.message || "Unknown error" };
    }
  });
}

async function runFullSweep(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string
): Promise<BatchProgress> {
  const startedAt = new Date().toISOString();
  
  // Fetch all issuers
  const { data: issuers, error: fetchError } = await supabase
    .from("repindex_root_issuers")
    .select("ticker, issuer_name, ibex_family_code")
    .order("ibex_family_code", { nullsLast: true })
    .order("issuer_name");

  if (fetchError || !issuers) {
    console.error("[rix-batch-orchestrator] Failed to fetch issuers:", fetchError);
    throw new Error(`Failed to fetch issuers: ${fetchError?.message}`);
  }

  console.log(`[rix-batch-orchestrator] Starting full sweep of ${issuers.length} companies`);
  
  const totalBatches = Math.ceil(issuers.length / BATCH_SIZE);
  const estimatedDurationMs = issuers.length * ESTIMATED_TIME_PER_COMPANY_MS / BATCH_SIZE + 
                               (totalBatches - 1) * DELAY_BETWEEN_BATCHES_MS;
  const estimatedEndAt = new Date(Date.now() + estimatedDurationMs).toISOString();

  const progress: BatchProgress = {
    total: issuers.length,
    processed: 0,
    successes: 0,
    failures: 0,
    currentBatch: 0,
    totalBatches,
    errors: [],
    startedAt,
    estimatedEndAt,
  };

  console.log(`[rix-batch-orchestrator] Estimated completion: ${estimatedEndAt}`);

  // Process in batches
  for (let i = 0; i < issuers.length; i += BATCH_SIZE) {
    progress.currentBatch = Math.floor(i / BATCH_SIZE) + 1;
    const batch = issuers.slice(i, i + BATCH_SIZE);
    
    console.log(`[rix-batch-orchestrator] Processing batch ${progress.currentBatch}/${totalBatches}: ${batch.map(b => b.ticker).join(", ")}`);

    const batchResults = await processBatch(batch, supabaseUrl, serviceKey);

    for (const result of batchResults) {
      progress.processed++;
      if (result.success) {
        progress.successes++;
      } else {
        progress.failures++;
        progress.errors.push({ ticker: result.ticker, error: result.error || "Unknown" });
      }
    }

    console.log(`[rix-batch-orchestrator] Batch ${progress.currentBatch} complete. Progress: ${progress.processed}/${progress.total} (${progress.successes} ok, ${progress.failures} failed)`);

    // Delay between batches (except for the last one)
    if (i + BATCH_SIZE < issuers.length) {
      console.log(`[rix-batch-orchestrator] Waiting ${DELAY_BETWEEN_BATCHES_MS / 1000}s before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`[rix-batch-orchestrator] Full sweep complete!`, {
    total: progress.total,
    successes: progress.successes,
    failures: progress.failures,
    duration: `${Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)} minutes`,
  });

  return progress;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let requestBody: { trigger?: string; full_sweep?: boolean; test_mode?: boolean } = {};
    try {
      requestBody = await req.json();
    } catch {
      // Empty body is fine
    }

    const { trigger = "manual", full_sweep = true, test_mode = false } = requestBody;

    console.log(`[rix-batch-orchestrator] Invoked - trigger: ${trigger}, full_sweep: ${full_sweep}, test_mode: ${test_mode}`);

    if (test_mode) {
      // Test mode: just return the count of companies
      const { count } = await supabase
        .from("repindex_root_issuers")
        .select("*", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Test mode - no processing",
          totalCompanies: count,
          estimatedDurationMinutes: Math.round(((count || 0) * ESTIMATED_TIME_PER_COMPANY_MS / BATCH_SIZE + 
                                                 Math.ceil((count || 0) / BATCH_SIZE) * DELAY_BETWEEN_BATCHES_MS) / 60000),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (full_sweep) {
      // Use background task for long-running operation
      const sweepPromise = runFullSweep(supabase, supabaseUrl, supabaseServiceKey);

      // Check if EdgeRuntime is available for background processing
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(sweepPromise);
        
        // Return immediate response
        const { count } = await supabase
          .from("repindex_root_issuers")
          .select("*", { count: "exact", head: true });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Full sweep started in background",
            trigger,
            totalCompanies: count,
            batchSize: BATCH_SIZE,
            delayBetweenBatchesSeconds: DELAY_BETWEEN_BATCHES_MS / 1000,
            estimatedDurationMinutes: Math.round(((count || 0) * ESTIMATED_TIME_PER_COMPANY_MS / BATCH_SIZE + 
                                                   Math.ceil((count || 0) / BATCH_SIZE) * DELAY_BETWEEN_BATCHES_MS) / 60000),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Fallback: run synchronously (may timeout for large datasets)
        console.log("[rix-batch-orchestrator] EdgeRuntime not available, running synchronously");
        const progress = await sweepPromise;

        return new Response(
          JSON.stringify({
            success: true,
            message: "Full sweep completed",
            trigger,
            progress,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "No action taken",
        trigger,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[rix-batch-orchestrator] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
