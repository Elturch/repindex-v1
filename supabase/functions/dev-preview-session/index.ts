// Dev-only auto-session for Lovable Preview / localhost.
// Issues a real Supabase session for a fixed admin user, with strict Origin allowlist.
// NEVER reachable from production domains.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ADMIN_EMAIL =
  Deno.env.get("DEV_PREVIEW_ADMIN_EMAIL") ?? "maturci@gmail.com";

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]*preview[a-z0-9-]*--[a-z0-9-]+\.lovable\.app$/,
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function buildCors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = buildCors(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(
      JSON.stringify({ error: "forbidden_origin", origin }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Generate a magic link to obtain a verifiable token_hash for the admin user.
    const { data: linkData, error: linkErr } = await admin.auth.admin
      .generateLink({
        type: "magiclink",
        email: ADMIN_EMAIL,
      });

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("[dev-preview-session] generateLink failed", linkErr);
      return new Response(
        JSON.stringify({
          error: "generate_link_failed",
          detail: linkErr?.message,
        }),
        {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const token_hash = linkData.properties.hashed_token;

    // 2) Verify the OTP using the anon client to materialize a real session.
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash,
    });

    if (verifyErr || !verifyData?.session) {
      console.error("[dev-preview-session] verifyOtp failed", verifyErr);
      return new Response(
        JSON.stringify({
          error: "verify_otp_failed",
          detail: verifyErr?.message,
        }),
        {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
        user_email: ADMIN_EMAIL,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[dev-preview-session] unexpected", e);
    return new Response(
      JSON.stringify({ error: "unexpected", detail: String(e) }),
      {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
});