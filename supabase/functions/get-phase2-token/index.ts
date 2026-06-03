// get-phase2-token
// Devuelve el valor del Secret STRESS_TESTS_HEADER_TOKEN exclusivamente a
// usuarios autenticados con rol admin (has_role(auth.uid(), 'admin')).
// NO loguea el token en ningún momento.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function noBody(status: number) {
  return new Response(null, { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return noBody(405);
  }

  const authHeader =
    req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return noBody(401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice(7).trim();
  const { data: userData, error: userError } = await userClient.auth.getUser(
    token,
  );
  if (userError || !userData?.user) {
    return noBody(401);
  }

  const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleError || !isAdmin) {
    return noBody(403);
  }

  const secret = (Deno.env.get("STRESS_TESTS_HEADER_TOKEN") ?? "").trim();
  if (!secret) {
    return json(
      { error: "secret_not_configured", token: null, masked: null },
      500,
    );
  }

  const last4 = secret.length >= 4 ? secret.slice(-4) : secret;
  return json({ token: secret, masked: "••••••••" + last4 }, 200);
});