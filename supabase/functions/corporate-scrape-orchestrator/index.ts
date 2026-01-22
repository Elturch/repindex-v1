import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

function getCurrentSweepId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `corp-${year}-${month}`;
}

// Search for company's official website using Firecrawl
async function findCompanyWebsite(
  companyName: string, 
  ticker: string,
  firecrawlApiKey: string
): Promise<string | null> {
  try {
    console.log(`[WebsiteFinder] Searching for ${companyName} (${ticker}) official website`);
    
    // Search queries to try
    const queries = [
      `${companyName} sitio web oficial corporativo`,
      `${companyName} official corporate website`,
      `${ticker} investor relations website`,
    ];

    for (const query of queries) {
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

      // Look for official corporate domains
      for (const result of results) {
        const url = result.url?.toLowerCase() || '';
        const title = result.title?.toLowerCase() || '';
        const companyLower = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Skip social media, Wikipedia, news sites
        if (url.includes('wikipedia') || 
            url.includes('linkedin') || 
            url.includes('twitter') ||
            url.includes('facebook') ||
            url.includes('youtube') ||
            url.includes('bloomberg') ||
            url.includes('reuters') ||
            url.includes('yahoo') ||
            url.includes('investing.com')) {
          continue;
        }

        // Check if URL or title contains company name
        const urlDomain = new URL(result.url).hostname.replace('www.', '');
        if (urlDomain.includes(companyLower.substring(0, 6)) || 
            title.includes(companyName.toLowerCase())) {
          console.log(`[WebsiteFinder] Found: ${result.url} for ${companyName}`);
          return result.url;
        }
      }
    }

    console.log(`[WebsiteFinder] No official website found for ${companyName}`);
    return null;
  } catch (error) {
    console.error(`[WebsiteFinder] Error searching for ${companyName}:`, error);
    return null;
  }
}

async function initializeSweep(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  firecrawlApiKey: string
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

  // Get all active companies - using status field
  console.log(`[Orchestrator] Querying repindex_root_issuers for status=active`);
  const { data: companies, error } = await supabase
    .from('repindex_root_issuers')
    .select('ticker, issuer_name, website')
    .eq('status', 'active');

  if (error) {
    console.error(`[Orchestrator] Query error:`, JSON.stringify(error));
    throw new Error(`Failed to fetch companies: ${error.message}`);
  }
  
  if (!companies) {
    console.error(`[Orchestrator] No companies returned (null)`);
    throw new Error('Failed to fetch companies: null result');
  }

  console.log(`[Orchestrator] Found ${companies.length} active companies`);

  // For companies without websites, try to find them
  const progressEntries = [];
  for (const company of companies) {
    let website = company.website;
    
    if (!website) {
      // Try to find the website
      website = await findCompanyWebsite(company.issuer_name, company.ticker, firecrawlApiKey);
      
      // If found, update the issuer record
      if (website) {
        await supabase
          .from('repindex_root_issuers')
          .update({ website })
          .eq('ticker', company.ticker);
        console.log(`[Orchestrator] Updated website for ${company.ticker}: ${website}`);
      }
      
      // Small delay between searches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    progressEntries.push({
      sweep_id: sweepId,
      ticker: company.ticker,
      issuer_name: company.issuer_name,
      website: website || null,
      status: website ? 'pending' : 'skipped', // Skip if no website found
    });
  }

  const { error: insertError } = await supabase
    .from('corporate_scrape_progress')
    .insert(progressEntries);

  if (insertError) {
    throw new Error(`Failed to create progress entries: ${insertError.message}`);
  }

  const pendingCount = progressEntries.filter(e => e.status === 'pending').length;
  console.log(`[Orchestrator] Initialized sweep ${sweepId} with ${pendingCount} companies to scrape`);
  
  return { initialized: true, totalCompanies: pendingCount };
}

async function processAllCompanies(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<void> {
  console.log(`[Orchestrator] Starting background processing for sweep ${sweepId}`);
  
  const DELAY_BETWEEN_COMPANIES_MS = 90000; // 90 seconds between companies
  
  while (true) {
    // Get next pending company
    const { data: pending, error } = await supabase
      .from('corporate_scrape_progress')
      .select('id, ticker, issuer_name, website')
      .eq('sweep_id', sweepId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('[Orchestrator] Error fetching pending:', error);
      break;
    }

    if (!pending || pending.length === 0) {
      console.log('[Orchestrator] No more pending companies. Sweep complete!');
      break;
    }

    const company = pending[0];
    console.log(`[Orchestrator] Processing ${company.ticker} (${company.issuer_name})`);

    // Mark as processing
    await supabase
      .from('corporate_scrape_progress')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', company.id);

    try {
      // Call the scrape function
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

      await supabase
        .from('corporate_scrape_progress')
        .update({
          status: result.success ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          error_message: result.error || null,
        })
        .eq('id', company.id);

      console.log(`[Orchestrator] ${company.ticker}: ${result.success ? 'completed' : 'failed'}`);

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
    }

    // Log progress
    const { data: statusData } = await supabase
      .from('corporate_scrape_progress')
      .select('status')
      .eq('sweep_id', sweepId);
    
    if (statusData) {
      const completed = statusData.filter(s => s.status === 'completed').length;
      const failed = statusData.filter(s => s.status === 'failed').length;
      const pending = statusData.filter(s => s.status === 'pending').length;
      console.log(`[Orchestrator] Progress: ${completed} completed, ${failed} failed, ${pending} pending`);
    }

    // Wait before next company to respect rate limits
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_COMPANIES_MS));
  }

  console.log(`[Orchestrator] Sweep ${sweepId} finished!`);
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

    // Get status only
    if (mode === 'get_status') {
      const status = await getSweepStatus(supabase, sweepId);
      return new Response(
        JSON.stringify({ success: true, sweep_id: sweepId, status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reset failed companies
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

    // Start full automated sweep (init + process all in background)
    if (mode === 'start_full_sweep') {
      // Initialize sweep (this includes finding websites)
      const { totalCompanies } = await initializeSweep(supabase, sweepId, firecrawlApiKey);

      if (totalCompanies === 0) {
        return new Response(
          JSON.stringify({ success: true, sweep_id: sweepId, message: 'No companies to process' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Start background processing
      EdgeRuntime.waitUntil(processAllCompanies(supabase, sweepId, supabaseUrl, supabaseServiceKey));

      const estimatedHours = Math.ceil((totalCompanies * 90) / 3600); // 90 sec per company
      
      return new Response(
        JSON.stringify({
          success: true,
          sweep_id: sweepId,
          message: `Started automated sweep for ${totalCompanies} companies`,
          estimated_completion_hours: estimatedHours,
          status: await getSweepStatus(supabase, sweepId),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process single company (for CRON or manual trigger)
    if (mode === 'process_one') {
      // Initialize if needed
      await initializeSweep(supabase, sweepId, firecrawlApiKey);

      // Get next pending
      const { data: pending } = await supabase
        .from('corporate_scrape_progress')
        .select('id, ticker, issuer_name, website')
        .eq('sweep_id', sweepId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

      if (!pending || pending.length === 0) {
        return new Response(
          JSON.stringify({ success: true, sweep_id: sweepId, message: 'No pending companies', status: await getSweepStatus(supabase, sweepId) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const company = pending[0];
      
      // Process in background
      EdgeRuntime.waitUntil((async () => {
        await supabase
          .from('corporate_scrape_progress')
          .update({ status: 'processing', started_at: new Date().toISOString() })
          .eq('id', company.id);

        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/firecrawl-corporate-scrape`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: company.ticker, website: company.website, issuer_name: company.issuer_name }),
          });
          const result = await response.json();
          
          await supabase
            .from('corporate_scrape_progress')
            .update({ status: result.success ? 'completed' : 'failed', completed_at: new Date().toISOString(), error_message: result.error || null })
            .eq('id', company.id);
        } catch (err) {
          await supabase
            .from('corporate_scrape_progress')
            .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: err instanceof Error ? err.message : 'Error' })
            .eq('id', company.id);
        }
      })());

      return new Response(
        JSON.stringify({ success: true, sweep_id: sweepId, processing: company.ticker, status: await getSweepStatus(supabase, sweepId) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid mode. Use: get_status, start_full_sweep, process_one, reset_failed' }),
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
