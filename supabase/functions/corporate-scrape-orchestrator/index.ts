import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getCurrentSweepId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `corp-${year}-${month}`;
}

async function initializeSweepIfNeeded(
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
    // Count total companies in this sweep
    const { count } = await supabase
      .from('corporate_scrape_progress')
      .select('*', { count: 'exact', head: true })
      .eq('sweep_id', sweepId);

    return { initialized: false, totalCompanies: count || 0 };
  }

  // Get all active companies with websites
  const { data: companies, error } = await supabase
    .from('repindex_root_issuers')
    .select('ticker, issuer_name, website')
    .eq('ibex_status', 'active_now')
    .not('website', 'is', null);

  if (error) {
    console.error('[Orchestrator] Error fetching companies:', error);
    throw new Error(`Failed to fetch companies: ${error.message}`);
  }

  if (!companies || companies.length === 0) {
    console.log('[Orchestrator] No companies with websites found');
    return { initialized: true, totalCompanies: 0 };
  }

  // Create progress entries for all companies
  const progressEntries = companies.map(company => ({
    sweep_id: sweepId,
    ticker: company.ticker,
    issuer_name: company.issuer_name,
    website: company.website,
    status: 'pending',
  }));

  const { error: insertError } = await supabase
    .from('corporate_scrape_progress')
    .insert(progressEntries);

  if (insertError) {
    console.error('[Orchestrator] Error creating progress entries:', insertError);
    throw new Error(`Failed to create progress entries: ${insertError.message}`);
  }

  console.log(`[Orchestrator] Initialized sweep ${sweepId} with ${companies.length} companies`);
  return { initialized: true, totalCompanies: companies.length };
}

async function getNextPendingCompany(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<{ ticker: string; issuer_name: string; website: string; progress_id: string } | null> {
  const { data: pending, error } = await supabase
    .from('corporate_scrape_progress')
    .select('id, ticker, issuer_name, website')
    .eq('sweep_id', sweepId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[Orchestrator] Error fetching pending company:', error);
    return null;
  }

  if (!pending || pending.length === 0) {
    return null;
  }

  return {
    progress_id: pending[0].id,
    ticker: pending[0].ticker,
    issuer_name: pending[0].issuer_name,
    website: pending[0].website,
  };
}

async function processCompany(
  supabase: ReturnType<typeof createClient>,
  progressId: string,
  ticker: string,
  issuerName: string,
  website: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<{ success: boolean; error?: string }> {
  // Mark as processing
  await supabase
    .from('corporate_scrape_progress')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', progressId);

  try {
    console.log(`[Orchestrator] Processing ${ticker} (${issuerName})`);

    // Call the scrape function
    const response = await fetch(`${supabaseUrl}/functions/v1/firecrawl-corporate-scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticker,
        website,
        issuer_name: issuerName,
      }),
    });

    const result = await response.json();

    if (result.success) {
      // Mark as completed
      await supabase
        .from('corporate_scrape_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', progressId);

      console.log(`[Orchestrator] Completed ${ticker}`);
      return { success: true };
    } else {
      // Mark as failed
      await supabase
        .from('corporate_scrape_progress')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: result.error || 'Unknown error',
        })
        .eq('id', progressId);

      console.log(`[Orchestrator] Failed ${ticker}: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    // Mark as failed
    await supabase
      .from('corporate_scrape_progress')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMsg,
      })
      .eq('id', progressId);

    console.error(`[Orchestrator] Exception processing ${ticker}:`, error);
    return { success: false, error: errorMsg };
  }
}

async function getSweepStatus(
  supabase: ReturnType<typeof createClient>,
  sweepId: string
): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const { data, error } = await supabase
    .from('corporate_scrape_progress')
    .select('status')
    .eq('sweep_id', sweepId);

  if (error || !data) {
    return { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
  }

  const counts = {
    total: data.length,
    pending: data.filter(d => d.status === 'pending').length,
    processing: data.filter(d => d.status === 'processing').length,
    completed: data.filter(d => d.status === 'completed').length,
    failed: data.filter(d => d.status === 'failed').length,
  };

  return counts;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'process_one';
    const sweepId = body.sweep_id || getCurrentSweepId();

    console.log(`[Orchestrator] Mode: ${mode}, Sweep ID: ${sweepId}`);

    // Get status
    if (mode === 'get_status') {
      const status = await getSweepStatus(supabase, sweepId);
      return new Response(
        JSON.stringify({ success: true, sweep_id: sweepId, status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize only
    if (mode === 'init_only') {
      const { initialized, totalCompanies } = await initializeSweepIfNeeded(supabase, sweepId);
      return new Response(
        JSON.stringify({
          success: true,
          sweep_id: sweepId,
          initialized,
          total_companies: totalCompanies,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reset failed companies back to pending
    if (mode === 'reset_failed') {
      const { data: resetCount, error } = await supabase
        .from('corporate_scrape_progress')
        .update({ status: 'pending', error_message: null, retry_count: 1 })
        .eq('sweep_id', sweepId)
        .eq('status', 'failed')
        .select();

      return new Response(
        JSON.stringify({
          success: !error,
          sweep_id: sweepId,
          reset_count: resetCount?.length || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process a single company (default mode)
    // First, ensure sweep is initialized
    await initializeSweepIfNeeded(supabase, sweepId);

    // Get next pending company
    const nextCompany = await getNextPendingCompany(supabase, sweepId);

    if (!nextCompany) {
      const status = await getSweepStatus(supabase, sweepId);
      return new Response(
        JSON.stringify({
          success: true,
          sweep_id: sweepId,
          message: 'No pending companies',
          status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process the company
    const result = await processCompany(
      supabase,
      nextCompany.progress_id,
      nextCompany.ticker,
      nextCompany.issuer_name,
      nextCompany.website,
      supabaseUrl,
      supabaseServiceKey
    );

    const status = await getSweepStatus(supabase, sweepId);

    return new Response(
      JSON.stringify({
        success: result.success,
        sweep_id: sweepId,
        processed: {
          ticker: nextCompany.ticker,
          issuer_name: nextCompany.issuer_name,
          result: result.success ? 'completed' : 'failed',
          error: result.error,
        },
        status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Orchestrator] Exception:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
