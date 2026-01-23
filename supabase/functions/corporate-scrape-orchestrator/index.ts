import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getCurrentSweepId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `corp-${year}-${month}`;
}

// ============================================================================
// SWEEP INITIALIZATION (Fast - no website search)
// ============================================================================

async function ensureSweepInitialized(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<{ initialized: boolean; totalCompanies: number }> {
  // Check if sweep already exists
  const { data: existingProgress } = await supabase
    .from('corporate_scrape_progress')
    .select('id')
    .eq('sweep_id', sweepId)
    .limit(1);

  if (existingProgress && existingProgress.length > 0) {
    const { count } = await supabase
      .from('corporate_scrape_progress')
      .select('*', { count: 'exact', head: true })
      .eq('sweep_id', sweepId);
    return { initialized: false, totalCompanies: count || 0 };
  }

  // Get all active companies with their existing websites
  console.log(`[Orchestrator] Initializing sweep ${sweepId} - querying active companies`);
  const { data: companies, error } = await supabase
    .from('repindex_root_issuers')
    .select('ticker, issuer_name, website')
    .eq('status', 'active');

  if (error) {
    console.error(`[Orchestrator] Query error:`, JSON.stringify(error));
    throw new Error(`Failed to fetch companies: ${error.message}`);
  }
  
  if (!companies || companies.length === 0) {
    console.error(`[Orchestrator] No companies returned`);
    return { initialized: true, totalCompanies: 0 };
  }

  console.log(`[Orchestrator] Found ${companies.length} active companies`);

  // Create progress entries WITHOUT searching for websites (fast init)
  const progressEntries = companies.map(company => ({
    sweep_id: sweepId,
    ticker: company.ticker,
    issuer_name: company.issuer_name,
    website: company.website || null,
    status: company.website ? 'pending' : 'skipped', // Skip if no website yet
  }));

  const { error: insertError } = await supabase
    .from('corporate_scrape_progress')
    .insert(progressEntries);

  if (insertError) {
    throw new Error(`Failed to create progress entries: ${insertError.message}`);
  }

  const pendingCount = progressEntries.filter(e => e.status === 'pending').length;
  const skippedCount = progressEntries.filter(e => e.status === 'skipped').length;
  console.log(`[Orchestrator] Initialized sweep ${sweepId}: ${pendingCount} pending, ${skippedCount} skipped (no website)`);
  
  return { initialized: true, totalCompanies: pendingCount };
}

// ============================================================================
// ZOMBIE DETECTION AND RESET
// ============================================================================

async function resetStuckProcessing(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  timeoutMinutes: number = 5
): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('corporate_scrape_progress')
    .update({ 
      status: 'pending', 
      error_message: `Auto-reset: stuck in processing for >${timeoutMinutes}min`,
      retry_count: 1 
    })
    .eq('sweep_id', sweepId)
    .eq('status', 'processing')
    .lt('started_at', cutoffTime)
    .select('ticker');

  if (error) {
    console.error('[Orchestrator] Error resetting stuck:', error);
    return 0;
  }

  if (data && data.length > 0) {
    console.log(`[Orchestrator] Reset ${data.length} stuck companies: ${data.map(d => d.ticker).join(', ')}`);
  }

  return data?.length || 0;
}

// ============================================================================
// GET NEXT PENDING COMPANY
// ============================================================================

async function getNextPending(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<{ id: string; ticker: string; issuer_name: string; website: string } | null> {
  const { data, error } = await supabase
    .from('corporate_scrape_progress')
    .select('id, ticker, issuer_name, website')
    .eq('sweep_id', sweepId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[Orchestrator] Error fetching pending:', error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

// ============================================================================
// PROCESS SINGLE COMPANY (Synchronous)
// ============================================================================

async function processCompany(
  supabase: ReturnType<typeof createClient>,
  company: { id: string; ticker: string; issuer_name: string; website: string },
  supabaseUrl: string,
  serviceKey: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[Orchestrator] Processing ${company.ticker} (${company.issuer_name})`);

  // Mark as processing
  await supabase
    .from('corporate_scrape_progress')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', company.id);

  try {
    // Call the scrape function synchronously
    const response = await fetch(`${supabaseUrl}/functions/v1/firecrawl-corporate-scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticker: company.ticker,
        website: company.website,
        issuer_name: company.issuer_name,
      }),
    });

    const result = await response.json();

    // Update status based on result
    await supabase
      .from('corporate_scrape_progress')
      .update({
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        error_message: result.error || null,
      })
      .eq('id', company.id);

    console.log(`[Orchestrator] ${company.ticker}: ${result.success ? 'completed' : 'failed'}`);
    return { success: result.success, error: result.error };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await supabase
      .from('corporate_scrape_progress')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMsg,
      })
      .eq('id', company.id);
    
    console.error(`[Orchestrator] ${company.ticker} exception:`, err);
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// GET SWEEP STATUS
// ============================================================================

async function getSweepStatus(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
}> {
  const { data } = await supabase
    .from('corporate_scrape_progress')
    .select('status')
    .eq('sweep_id', sweepId);

  if (!data) return { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, skipped: 0 };

  return {
    total: data.length,
    pending: data.filter(d => d.status === 'pending').length,
    processing: data.filter(d => d.status === 'processing').length,
    completed: data.filter(d => d.status === 'completed').length,
    failed: data.filter(d => d.status === 'failed').length,
    skipped: data.filter(d => d.status === 'skipped').length,
  };
}

// ============================================================================
// WEBSITE DISCOVERY (Incremental - separate mode)
// ============================================================================

async function discoverWebsitesIncremental(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  firecrawlApiKey: string,
  limit: number = 3
): Promise<{ discovered: number; remaining: number }> {
  // Get companies without websites in the sweep
  const { data: skipped } = await supabase
    .from('corporate_scrape_progress')
    .select('id, ticker, issuer_name')
    .eq('sweep_id', sweepId)
    .eq('status', 'skipped')
    .is('website', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!skipped || skipped.length === 0) {
    return { discovered: 0, remaining: 0 };
  }

  let discovered = 0;

  for (const company of skipped) {
    console.log(`[WebsiteFinder] Searching for ${company.issuer_name} (${company.ticker})`);
    
    try {
      const queries = [
        `${company.issuer_name} sitio web oficial corporativo`,
        `${company.issuer_name} official corporate website`,
      ];

      let foundUrl: string | null = null;

      for (const query of queries) {
        if (foundUrl) break;
        
        const response = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            limit: 5,
            lang: 'es',
            country: 'ES',
          }),
        });

        if (!response.ok) continue;

        const data = await response.json();
        const results = data.data || [];

        for (const result of results) {
          const url = result.url?.toLowerCase() || '';
          const title = result.title?.toLowerCase() || '';
          const companyLower = company.issuer_name.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          // Skip unwanted domains
          if (url.includes('wikipedia') || url.includes('linkedin') || 
              url.includes('twitter') || url.includes('facebook') ||
              url.includes('youtube') || url.includes('bloomberg') ||
              url.includes('reuters') || url.includes('yahoo') ||
              url.includes('investing.com')) {
            continue;
          }

          try {
            const urlDomain = new URL(result.url).hostname.replace('www.', '');
            if (urlDomain.includes(companyLower.substring(0, 6)) || 
                title.includes(company.issuer_name.toLowerCase())) {
              foundUrl = result.url;
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (foundUrl) {
        // Update issuer record with website
        await supabase
          .from('repindex_root_issuers')
          .update({ website: foundUrl })
          .eq('ticker', company.ticker);

        // Update progress to pending with website
        await supabase
          .from('corporate_scrape_progress')
          .update({ website: foundUrl, status: 'pending' })
          .eq('id', company.id);

        console.log(`[WebsiteFinder] Found ${foundUrl} for ${company.ticker}`);
        discovered++;
      }

      // Delay between searches
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`[WebsiteFinder] Error for ${company.ticker}:`, error);
    }
  }

  // Count remaining
  const { count } = await supabase
    .from('corporate_scrape_progress')
    .select('*', { count: 'exact', head: true })
    .eq('sweep_id', sweepId)
    .eq('status', 'skipped')
    .is('website', null);

  return { discovered, remaining: count || 0 };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'get_status';
    const sweepId = body.sweep_id || getCurrentSweepId();

    console.log(`[Orchestrator] Mode: ${mode}, Sweep ID: ${sweepId}`);

    // ========================================================================
    // MODE: get_status - Return current sweep status
    // ========================================================================
    if (mode === 'get_status') {
      const status = await getSweepStatus(supabase, sweepId);
      return new Response(
        JSON.stringify({ success: true, sweep_id: sweepId, status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // MODE: process_single - Process exactly ONE company (FOOLPROOF)
    // ========================================================================
    if (mode === 'process_single') {
      // 1. Ensure sweep is initialized (fast, no website search)
      await ensureSweepInitialized(supabase, sweepId);
      
      // 2. Auto-reset zombies (stuck in processing > 5 min)
      const resetCount = await resetStuckProcessing(supabase, sweepId, 5);
      
      // 3. Get next pending company
      const company = await getNextPending(supabase, sweepId);
      
      if (!company) {
        const status = await getSweepStatus(supabase, sweepId);
        return new Response(
          JSON.stringify({ 
            success: true, 
            sweep_id: sweepId,
            processed: false, 
            complete: status.pending === 0 && status.processing === 0,
            message: 'No pending companies',
            zombies_reset: resetCount,
            status 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. Process synchronously (no waitUntil!)
      const result = await processCompany(supabase, company, supabaseUrl, supabaseServiceKey);
      
      // 5. Get updated status
      const status = await getSweepStatus(supabase, sweepId);
      
      return new Response(
        JSON.stringify({
          success: true,
          sweep_id: sweepId,
          processed: true,
          ticker: company.ticker,
          issuer_name: company.issuer_name,
          result: result.success ? 'completed' : 'failed',
          error: result.error,
          zombies_reset: resetCount,
          remaining: status.pending,
          status
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // MODE: reset_failed - Reset failed companies to pending
    // ========================================================================
    if (mode === 'reset_failed') {
      const { data: resetData } = await supabase
        .from('corporate_scrape_progress')
        .update({ status: 'pending', error_message: null, retry_count: 1 })
        .eq('sweep_id', sweepId)
        .eq('status', 'failed')
        .select();

      return new Response(
        JSON.stringify({ success: true, sweep_id: sweepId, reset_count: resetData?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // MODE: discover_websites - Search for missing corporate websites
    // ========================================================================
    if (mode === 'discover_websites') {
      await ensureSweepInitialized(supabase, sweepId);
      const result = await discoverWebsitesIncremental(supabase, sweepId, firecrawlApiKey, body.limit || 3);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sweep_id: sweepId, 
          discovered: result.discovered,
          remaining_without_website: result.remaining,
          status: await getSweepStatus(supabase, sweepId)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // MODE: init_only - Just initialize the sweep without processing
    // ========================================================================
    if (mode === 'init_only') {
      const { initialized, totalCompanies } = await ensureSweepInitialized(supabase, sweepId);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sweep_id: sweepId,
          initialized,
          total_companies: totalCompanies,
          status: await getSweepStatus(supabase, sweepId)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // DEPRECATED: start_full_sweep - Kept for backwards compatibility
    // Redirects to process_single with a warning
    // ========================================================================
    if (mode === 'start_full_sweep') {
      // Just initialize and process first company
      await ensureSweepInitialized(supabase, sweepId);
      await resetStuckProcessing(supabase, sweepId, 5);
      
      const company = await getNextPending(supabase, sweepId);
      if (company) {
        await processCompany(supabase, company, supabaseUrl, supabaseServiceKey);
      }

      const status = await getSweepStatus(supabase, sweepId);
      
      return new Response(
        JSON.stringify({
          success: true,
          sweep_id: sweepId,
          message: 'DEPRECATED: Use process_single mode with cascade. Processed 1 company.',
          status
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Invalid mode. Use: get_status, process_single, reset_failed, discover_websites, init_only' 
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Orchestrator] Exception:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
