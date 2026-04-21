import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.test('mint admin access token', async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(url, srk, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'maturci@gmail.com' });
  if (error) throw error;
  const hashed = (data as any).properties?.hashed_token;
  if (!hashed) throw new Error('no hashed_token');
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const v = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: hashed });
  if (v.error) throw v.error;
  const at = v.data.session?.access_token;
  if (!at) throw new Error('no access token');
  console.log('ACCESS_TOKEN_BEGIN');
  console.log(at);
  console.log('ACCESS_TOKEN_END');
});
