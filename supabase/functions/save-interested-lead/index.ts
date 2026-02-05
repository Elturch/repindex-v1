import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeadPayload {
  email: string;
  contact_consent: boolean;
  source?: string;
  user_agent?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: LeadPayload = await req.json();
    console.log('[save-interested-lead] Received payload:', { 
      email: payload.email?.substring(0, 3) + '***', 
      contact_consent: payload.contact_consent,
      source: payload.source 
    });

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!payload.email || !emailRegex.test(payload.email)) {
      console.error('[save-interested-lead] Invalid email:', payload.email);
      return new Response(
        JSON.stringify({ ok: false, error: 'Email inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate contact_consent is boolean
    if (typeof payload.contact_consent !== 'boolean') {
      console.error('[save-interested-lead] Invalid contact_consent:', payload.contact_consent);
      return new Response(
        JSON.stringify({ ok: false, error: 'Consentimiento inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate source (optional, default to login_attempt)
    const allowedSources = ['login_attempt', 'landing', 'contact_form'];
    const source = allowedSources.includes(payload.source || '') 
      ? payload.source 
      : 'login_attempt';

    // Create Supabase client with Service Role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    // Upsert the lead
    const { data, error } = await supabase
      .from('interested_leads')
      .upsert({
        email: payload.email.trim().toLowerCase(),
        contact_consent: payload.contact_consent,
        consent_date: new Date().toISOString(),
        user_agent: payload.user_agent || null,
        source: source,
        status: 'pending',
      }, { 
        onConflict: 'email',
        ignoreDuplicates: false 
      })
      .select('id')
      .single();

    if (error) {
      console.error('[save-interested-lead] Supabase error:', error);
      return new Response(
        JSON.stringify({ ok: false, error: 'Error al guardar. Inténtalo de nuevo.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[save-interested-lead] Lead saved successfully:', data?.id);

    return new Response(
      JSON.stringify({ ok: true, leadId: data?.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[save-interested-lead] Unexpected error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Error inesperado. Inténtalo de nuevo.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
