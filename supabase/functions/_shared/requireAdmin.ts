// Shared admin guard for sensitive edge functions (admin-api, admin-api-data).
// Validates the caller's JWT and verifies the `admin` role via public.has_role(),
// then writes a row to public.admin_audit_log. Returns either an HTTP 401/403
// Response (caller MUST return it directly) or { admin: { id, email } }.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AdminContext {
  id: string;
  email: string | null;
}

export interface RequireAdminOk {
  admin: AdminContext;
}

export interface RequireAdminFail {
  response: Response;
}

export type RequireAdminResult = RequireAdminOk | RequireAdminFail;

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function requireAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<RequireAdminResult> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return { response: jsonResponse({ error: 'Unauthorized: missing bearer token' }, 401, corsHeaders) };
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return { response: jsonResponse({ error: 'Unauthorized: empty bearer token' }, 401, corsHeaders) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const userClient: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return { response: jsonResponse({ error: 'Unauthorized: invalid token' }, 401, corsHeaders) };
  }
  const user = userData.user;

  const { data: hasRole, error: roleError } = await userClient.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin',
  });
  if (roleError) {
    console.error('[requireAdmin] has_role RPC error', roleError);
    return { response: jsonResponse({ error: 'Forbidden: role check failed' }, 403, corsHeaders) };
  }
  if (!hasRole) {
    return { response: jsonResponse({ error: 'Forbidden: admin role required' }, 403, corsHeaders) };
  }

  return { admin: { id: user.id, email: user.email ?? null } };
}

export function getServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function logAdminAction(params: {
  serviceClient: SupabaseClient;
  admin: AdminContext;
  edgeFunction: string;
  action: string;
  resource?: string | null;
  payload?: unknown;
  req: Request;
  statusCode: number;
}): Promise<void> {
  try {
    const ip = params.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || params.req.headers.get('cf-connecting-ip')
      || null;
    const ua = params.req.headers.get('user-agent') || null;

    let safePayload: unknown = null;
    try {
      const serialized = JSON.stringify(params.payload ?? null);
      // truncate at 8KB to avoid log spam
      safePayload = serialized && serialized.length > 8192
        ? { _truncated: true, preview: serialized.slice(0, 8192) }
        : (params.payload ?? null);
    } catch {
      safePayload = { _unserializable: true };
    }

    await params.serviceClient.from('admin_audit_log').insert({
      user_id: params.admin.id,
      user_email: params.admin.email,
      edge_function: params.edgeFunction,
      action: params.action,
      resource: params.resource ?? null,
      payload: safePayload,
      ip_address: ip,
      user_agent: ua,
      status_code: params.statusCode,
    });
  } catch (e) {
    console.error('[logAdminAction] insert failed (non-fatal):', e);
  }
}