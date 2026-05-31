import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 6 modelos canónicos del barrido V2.
const MODELS = ['ChatGPT', 'Perplexity', 'Gemini', 'Deepseek', 'Grok', 'Qwen'] as const;

function getCurrentSweepId(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sweepId: string = body?.sweep_id ?? getCurrentSweepId();
    const onlyTickers: string[] | null = Array.isArray(body?.only_tickers) ? body.only_tickers : null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Cargar universo.
    let query = supabase
      .from('repindex_root_issuers')
      .select('ticker, issuer_name')
      .not('ticker', 'is', null);
    if (onlyTickers && onlyTickers.length > 0) {
      query = query.in('ticker', onlyTickers);
    }
    const { data: issuers, error: issuersErr } = await query;
    if (issuersErr) throw issuersErr;
    if (!issuers || issuers.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'no_issuers_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Construir filas: 1 por (ticker, model).
    const rows = issuers.flatMap((iss: any) =>
      MODELS.map((m) => ({
        sweep_id: sweepId,
        ticker: iss.ticker,
        issuer_name: iss.issuer_name ?? null,
        model_name: m,
        status: 'pending',
        attempts: 0,
      })),
    );

    // 3. Insert por chunks con ON CONFLICT DO NOTHING (idempotente).
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error: insErr, count } = await supabase
        .from('sweep_queue')
        .upsert(chunk, { onConflict: 'sweep_id,ticker,model_name', ignoreDuplicates: true, count: 'exact' });
      if (insErr) {
        console.error('[seed-sweep-queue] insert chunk error:', insErr);
        throw insErr;
      }
      inserted += count ?? chunk.length;
    }

    console.log(`[seed-sweep-queue] sweep=${sweepId} issuers=${issuers.length} rows=${rows.length} inserted=${inserted}`);

    return new Response(JSON.stringify({
      success: true,
      sweep_id: sweepId,
      issuers: issuers.length,
      rows_attempted: rows.length,
      rows_inserted_or_existing: inserted,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[seed-sweep-queue] error:', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});