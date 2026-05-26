import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { token } = await req.json().catch(() => ({ token: null }));

    if (!token || typeof token !== 'string' || token.length < 16 || token.length > 128) {
      return new Response(
        JSON.stringify({ ok: true, valid: false, reason: 'invalid' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
      .from('lead_qualification_responses')
      .select('token_expires_at, submitted_at, lead_id, interested_leads(email)')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      console.error('[validate-qualification-token] DB error:', error);
      return new Response(
        JSON.stringify({ ok: false, error: 'Internal error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ ok: true, valid: false, reason: 'invalid' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (data.submitted_at) {
      return new Response(
        JSON.stringify({ ok: true, valid: false, reason: 'used' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ ok: true, valid: false, reason: 'expired' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const email = (data.interested_leads as { email?: string } | null)?.email || '';

    return new Response(
      JSON.stringify({ ok: true, valid: true, email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[validate-qualification-token] Unexpected error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});