import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  supabase: SupabaseClient<any>,
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

  // Get all companies with status=active (includes all ibex_status types)
  console.log(`[Orchestrator] Initializing sweep ${sweepId} - querying all active companies`);
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

  // Use upsert to handle re-initialization gracefully (ignores existing entries)
  const { error: insertError } = await supabase
    .from('corporate_scrape_progress')
    .upsert(progressEntries as any, { 
      onConflict: 'sweep_id,ticker',
      ignoreDuplicates: true 
    });

  if (insertError) {
    throw new Error(`Failed to create progress entries: ${insertError.message}`);
  }

  const pendingCount = progressEntries.filter(e => e.status === 'pending').length;
  const skippedCount = progressEntries.filter(e => e.status === 'skipped').length;
  console.log(`[Orchestrator] Initialized sweep ${sweepId}: ${pendingCount} pending, ${skippedCount} skipped (no website)`);
  
  return { initialized: true, totalCompanies: pendingCount };
}

// ============================================================================
// ZOMBIE DETECTION AND RESET (AUTO-RECOVERY)
// ============================================================================

async function resetStuckProcessing(
  supabase: SupabaseClient<any>,
  sweepId: string,
  timeoutMinutes: number = 5
): Promise<{ count: number; tickers: string[] }> {
  const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  
  // First get the stuck records to log them
  const { data: stuckRecords } = await supabase
    .from('corporate_scrape_progress')
    .select('id, ticker, started_at')
    .eq('sweep_id', sweepId)
    .eq('status', 'processing')
    .lt('started_at', cutoffTime);
  
  if (!stuckRecords || stuckRecords.length === 0) {
    return { count: 0, tickers: [] };
  }
  
  const stuckIds = stuckRecords.map(r => r.id);
  const stuckTickers = stuckRecords.map(r => r.ticker);
  
  console.log(`[Orchestrator] Found ${stuckRecords.length} ZOMBIE records stuck in processing: ${stuckTickers.join(', ')}`);

  const { error } = await supabase
    .from('corporate_scrape_progress')
    .update({ 
      status: 'pending', 
      error_message: `Auto-reset: stuck in processing for >${timeoutMinutes}min at ${new Date().toISOString()}`,
      started_at: null
    })
    .in('id', stuckIds);

  if (error) {
    console.error('[Orchestrator] Error resetting stuck:', error);
    return { count: 0, tickers: [] };
  }

  console.log(`[Orchestrator] AUTO-RECOVERED ${stuckRecords.length} zombie records: ${stuckTickers.join(', ')}`);

  return { count: stuckRecords.length, tickers: stuckTickers };
}

// ============================================================================
// GET ZOMBIE COUNT (for monitoring)
// ============================================================================

async function getZombieCount(
  supabase: SupabaseClient<any>,
  sweepId: string,
  timeoutMinutes: number = 10
): Promise<{ count: number; tickers: string[] }> {
  const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  
  const { data } = await supabase
    .from('corporate_scrape_progress')
    .select('ticker, started_at')
    .eq('sweep_id', sweepId)
    .eq('status', 'processing')
    .lt('started_at', cutoffTime);
  
  return {
    count: data?.length || 0,
    tickers: data?.map(r => r.ticker) || []
  };
}

// ============================================================================
// GET NEXT PENDING COMPANY
// ============================================================================

async function getNextPending(
  supabase: SupabaseClient<any>,
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
  supabase: SupabaseClient<any>,
  company: { id: string; ticker: string; issuer_name: string; website: string },
  supabaseUrl: string,
  serviceKey: string,
  newsOnly: boolean = false
): Promise<{ success: boolean; error?: string; result_type?: string }> {
  const modeLabel = newsOnly ? 'NEWS ONLY' : 'FULL';
  console.log(`[Orchestrator] Processing ${company.ticker} (${company.issuer_name}) - ${modeLabel}`);

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
        news_only: newsOnly,
      }),
    });

    const result = await response.json();
    
    // Extract semantic result_type from the scrape response
    const resultType = result.result_type || (result.success ? 'success_no_news' : 'error_parsing');
    const newsFoundCount = result.news_found_count || 0;
    const latestNewsDate = result.latest_news_date || null;

    // Update status with semantic classification
    await supabase
      .from('corporate_scrape_progress')
      .update({
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        error_message: result.error || null,
        result_type: resultType,
        news_found_count: newsFoundCount,
        latest_news_date: latestNewsDate,
      })
      .eq('id', company.id);

    console.log(`[Orchestrator] ${company.ticker}: ${result.success ? 'completed' : 'failed'} (${modeLabel}) - result_type: ${resultType}`);
    return { success: result.success, error: result.error, result_type: resultType };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = errorMsg.toLowerCase().includes('timeout');
    const resultType = isTimeout ? 'error_timeout' : 'error_parsing';
    
    await supabase
      .from('corporate_scrape_progress')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMsg,
        result_type: resultType,
        news_found_count: 0,
        latest_news_date: null,
      })
      .eq('id', company.id);
    
    console.error(`[Orchestrator] ${company.ticker} exception (${resultType}):`, err);
    return { success: false, error: errorMsg, result_type: resultType };
  }
}

// ============================================================================
// AUTO-CONTINUATION TRIGGER INSERTION
// Inserta triggers en cron_triggers para encadenamiento automático
// ============================================================================

const RETRYABLE_RESULT_TYPES = ['error_timeout', 'error_rate_limit', 'error_website_down', 'error_parsing'];

async function maybeInsertContinueTrigger(
  supabase: SupabaseClient<any>,
  sweepId: string,
  status: { pending: number; processing: number; failed: number }
): Promise<{ action: string | null; reason: string }> {
  // Si no hay más trabajo pendiente, verificar errores reintentables
  if (status.pending === 0 && status.processing === 0) {
    // Verificar si hay failed_retryable que deban reintentarse (max 3 retries)
    const { count: retryableCount } = await supabase
      .from('corporate_scrape_progress')
      .select('*', { count: 'exact', head: true })
      .eq('sweep_id', sweepId)
      .eq('status', 'failed')
      .in('result_type', RETRYABLE_RESULT_TYPES)
      .lt('retry_count', 3);
    
    if ((retryableCount || 0) > 0) {
      // Hay errores reintentables - verificar que no existe ya un trigger
      const { data: existingTrigger } = await supabase
        .from('cron_triggers')
        .select('id')
        .eq('action', 'corporate_scrape_retry')
        .in('status', ['pending', 'processing'])
        .limit(1)
        .maybeSingle();
      
      if (!existingTrigger) {
        await supabase.from('cron_triggers').insert({
          action: 'corporate_scrape_retry',
          params: { sweep_id: sweepId, retryable_count: retryableCount },
          status: 'pending'
        });
        console.log(`[Orchestrator] Inserted corporate_scrape_retry trigger (${retryableCount} retryable errors)`);
        return { action: 'corporate_scrape_retry', reason: `${retryableCount} retryable errors pending` };
      }
      return { action: null, reason: 'corporate_scrape_retry already pending' };
    }
    
    console.log(`[Orchestrator] Corporate scrape complete! No more work.`);
    return { action: null, reason: 'sweep complete' };
  }

  // Hay trabajo pendiente - insertar trigger de continuación
  const { data: existingTrigger } = await supabase
    .from('cron_triggers')
    .select('id')
    .eq('action', 'corporate_scrape_continue')
    .in('status', ['pending', 'processing'])
    .limit(1)
    .maybeSingle();

  if (!existingTrigger) {
    await supabase.from('cron_triggers').insert({
      action: 'corporate_scrape_continue',
      params: { sweep_id: sweepId, pending: status.pending },
      status: 'pending'
    });
    console.log(`[Orchestrator] Inserted corporate_scrape_continue trigger (${status.pending} pending)`);
    return { action: 'corporate_scrape_continue', reason: `${status.pending} companies pending` };
  }
  
  return { action: null, reason: 'corporate_scrape_continue already pending' };
}

// ============================================================================
// GET SWEEP STATUS
// ============================================================================

async function getSweepStatus(
  supabase: SupabaseClient<any>,
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
  supabase: SupabaseClient<any>,
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
    // MODE: get_status - Return current sweep status WITH zombie info
    // ========================================================================
    if (mode === 'get_status') {
      const status = await getSweepStatus(supabase, sweepId);
      const zombies = await getZombieCount(supabase, sweepId, 10);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sweep_id: sweepId, 
          status,
          zombies: {
            count: zombies.count,
            tickers: zombies.tickers
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // MODE: reset_zombies - Manually reset stuck processing records
    // ========================================================================
    if (mode === 'reset_zombies') {
      const timeoutMinutes = body.timeout_minutes || 5;
      const result = await resetStuckProcessing(supabase, sweepId, timeoutMinutes);
      const status = await getSweepStatus(supabase, sweepId);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sweep_id: sweepId,
          reset_count: result.count,
          reset_tickers: result.tickers,
          status
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // MODE: process_single - Process exactly ONE company (FOOLPROOF)
    // Supports watchdog trigger for autonomous 24/7 operation
    // ========================================================================
    if (mode === 'process_single') {
      const trigger = body.trigger || 'manual';
      const isWatchdog = trigger === 'watchdog';
      
      if (isWatchdog) {
        console.log(`[WATCHDOG] ========================================`);
        console.log(`[WATCHDOG] Corporate scrape auto-triggered at ${new Date().toISOString()}`);
        console.log(`[WATCHDOG] Sweep ID: ${sweepId}`);
      }
      
      // 1. Ensure sweep is initialized (fast, no website search)
      await ensureSweepInitialized(supabase, sweepId);
      
      // 2. Auto-reset zombies (stuck in processing > 5 min)
      const zombieReset = await resetStuckProcessing(supabase, sweepId, 5);
      
      if (isWatchdog && zombieReset.count > 0) {
        console.log(`[WATCHDOG] Auto-cleaned ${zombieReset.count} zombie(s): ${zombieReset.tickers.join(', ')}`);
      }
      
      // 3. Get next pending company
      const company = await getNextPending(supabase, sweepId);
      
      if (!company) {
        const status = await getSweepStatus(supabase, sweepId);
        const isComplete = status.pending === 0 && status.processing === 0;
        
        if (isWatchdog) {
          console.log(`[WATCHDOG] No pending companies. Complete: ${isComplete}`);
          console.log(`[WATCHDOG] ========================================`);
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            sweep_id: sweepId,
            processed: false, 
            complete: isComplete,
            message: 'No pending companies',
            trigger,
            zombies_reset: zombieReset.count,
            zombies_reset_tickers: zombieReset.tickers,
            status 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. Process synchronously (no waitUntil!)
      if (isWatchdog) {
        console.log(`[WATCHDOG] Processing: ${company.ticker} (${company.issuer_name})`);
      }
      
      const result = await processCompany(supabase, company, supabaseUrl, supabaseServiceKey, false);
      
      // 5. Get updated status
      const status = await getSweepStatus(supabase, sweepId);
      
      if (isWatchdog) {
        console.log(`[WATCHDOG] Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`[WATCHDOG] Remaining: ${status.pending} pending, ${status.failed} failed`);
        console.log(`[WATCHDOG] ========================================`);
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          sweep_id: sweepId,
          processed: true,
          ticker: company.ticker,
          issuer_name: company.issuer_name,
          result: result.success ? 'completed' : 'failed',
          error: result.error,
          trigger,
          zombies_reset: zombieReset.count,
          remaining: status.pending,
          status
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // MODE: scrape_news_only - Process ONE company for NEWS ONLY (weekly)
    // ========================================================================
    if (mode === 'scrape_news_only') {
      // 1. Ensure sweep is initialized
      await ensureSweepInitialized(supabase, sweepId);
      
      // 2. Auto-reset zombies
      const zombieReset = await resetStuckProcessing(supabase, sweepId, 5);
      
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
            message: 'No pending companies for news scraping',
            mode: 'news_only',
            zombies_reset: zombieReset.count,
            status 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. Process with news_only=true (faster, skips corporate data extraction)
      const result = await processCompany(supabase, company, supabaseUrl, supabaseServiceKey, true);
      
      // 5. Get updated status
      const status = await getSweepStatus(supabase, sweepId);
      
      return new Response(
        JSON.stringify({
          success: true,
          sweep_id: sweepId,
          processed: true,
          mode: 'news_only',
          ticker: company.ticker,
          issuer_name: company.issuer_name,
          result: result.success ? 'completed' : 'failed',
          error: result.error,
          zombies_reset: zombieReset.count,
          remaining: status.pending,
          status
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // MODE: continue_cascade - Process multiple companies (for CRON)
    // ========================================================================
    if (mode === 'continue_cascade') {
      const batchSize = body.batch_size || 10;
      const newsOnly = body.news_only || false;
      
      console.log(`[Orchestrator] Continue cascade: batch_size=${batchSize}, news_only=${newsOnly}`);
      
      // 1. Ensure sweep is initialized
      await ensureSweepInitialized(supabase, sweepId);
      
      // 2. Auto-reset zombies
      const zombieReset = await resetStuckProcessing(supabase, sweepId, 5);
      
      const processed: { ticker: string; success: boolean; error?: string }[] = [];
      
      // 3. Process batch
      for (let i = 0; i < batchSize; i++) {
        const company = await getNextPending(supabase, sweepId);
        
        if (!company) {
          console.log(`[Orchestrator] No more pending companies after ${processed.length} processed`);
          break;
        }
        
        const result = await processCompany(supabase, company, supabaseUrl, supabaseServiceKey, newsOnly);
        processed.push({ ticker: company.ticker, success: result.success, error: result.error });
        
        // Small delay between companies
        if (i < batchSize - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // 4. Get updated status
      const status = await getSweepStatus(supabase, sweepId);
      
      // 5. AUTO-CHAINING: Insert continuation trigger if work remains
      const chainResult = await maybeInsertContinueTrigger(supabase, sweepId, status);
      
      return new Response(
        JSON.stringify({
          success: true,
          sweep_id: sweepId,
          mode: 'continue_cascade',
          batch_size: batchSize,
          processed_count: processed.length,
          processed,
          zombies_reset: zombieReset.count,
          complete: status.pending === 0 && status.processing === 0 && !chainResult.action,
          next_trigger: chainResult.action,
          next_trigger_reason: chainResult.reason,
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
    // MODE: sync_new - Add new companies that aren't in the current sweep
    // ========================================================================
    if (mode === 'sync_new') {
      console.log(`[Orchestrator] Sync new companies for sweep ${sweepId}`);
      
      // Get all tickers currently in the sweep
      const { data: existingProgress } = await supabase
        .from('corporate_scrape_progress')
        .select('ticker')
        .eq('sweep_id', sweepId);
      
      const existingTickers = new Set((existingProgress || []).map(p => p.ticker));
      console.log(`[Orchestrator] Existing tickers in sweep: ${existingTickers.size}`);
      
      // Get all active companies
      const { data: allCompanies, error: companyError } = await supabase
        .from('repindex_root_issuers')
        .select('ticker, issuer_name, website')
        .eq('status', 'active');
      
      if (companyError) {
        throw new Error(`Failed to fetch companies: ${companyError.message}`);
      }
      
      // Filter to only new companies not in the sweep
      const newCompanies = (allCompanies || []).filter(c => !existingTickers.has(c.ticker));
      console.log(`[Orchestrator] Found ${newCompanies.length} new companies to add`);
      
      if (newCompanies.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            sweep_id: sweepId,
            synced_count: 0,
            message: 'No new companies to sync',
            status: await getSweepStatus(supabase, sweepId)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Create progress entries for new companies
      const newEntries = newCompanies.map(company => ({
        sweep_id: sweepId,
        ticker: company.ticker,
        issuer_name: company.issuer_name,
        website: company.website || null,
        status: company.website ? 'pending' : 'skipped',
      }));
      
      const { error: insertError } = await supabase
        .from('corporate_scrape_progress')
        .insert(newEntries);
      
      if (insertError) {
        throw new Error(`Failed to insert new companies: ${insertError.message}`);
      }
      
      const pendingCount = newEntries.filter(e => e.status === 'pending').length;
      const skippedCount = newEntries.filter(e => e.status === 'skipped').length;
      
      console.log(`[Orchestrator] Synced ${newCompanies.length} new companies: ${pendingCount} pending, ${skippedCount} skipped`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sweep_id: sweepId,
          synced_count: newCompanies.length,
          pending_added: pendingCount,
          skipped_added: skippedCount,
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
        error: 'Invalid mode. Use: get_status, process_single, scrape_news_only, continue_cascade, reset_zombies, reset_failed, discover_websites, init_only, sync_new' 
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
