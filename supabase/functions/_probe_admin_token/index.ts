import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// One-shot helper used during Phase 1.13 verification ONLY. Mints a real
// admin user access_token by issuing a magic link as service_role and
// exchanging the hashed_token via verifyOtp. The function is gated by a
// PROBE_SECRET header so casual callers cannot use it to escalate.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null);
  const probeHeader = req.headers.get('x-probe-secret');
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!probeHeader || probeHeader !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }
  const url = Deno.env.get('SUPABASE_URL')!;
  const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const { email } = await req.json();
  const adminClient = createClient(url, srk, { auth: { persistSession: false } });
  const { data, error } = await adminClient.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const hashed = (data as any).properties?.hashed_token;
  if (!hashed) return new Response(JSON.stringify({ error: 'no hashed_token' }), { status: 500 });
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const v = await anonClient.auth.verifyOtp({ type: 'magiclink', token_hash: hashed });
  if (v.error) return new Response(JSON.stringify({ error: v.error.message }), { status: 500 });
  return new Response(JSON.stringify({ access_token: v.data.session?.access_token }), {
    headers: { 'Content-Type': 'application/json' },
  });
});