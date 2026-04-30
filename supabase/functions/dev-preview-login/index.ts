import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function isDevOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const h = new URL(origin).hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h.endsWith(".lovableproject.com")) return true;
    if (h.endsWith(".lovable.dev")) return true;
    if (h.endsWith(".lovable.app") && h.includes("preview")) return true;
    return false;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const origin = req.headers.get("origin");
  if (!isDevOrigin(origin)) {
    console.warn("[dev-preview-login] forbidden_origin", { origin });
    return new Response(
      JSON.stringify({ ok: false, error: "forbidden_origin" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { email, secret, redirect_to } = await req.json();
    const expectedSecret = Deno.env.get("DEV_PREVIEW_LOGIN_SECRET");
    const allowlist = (Deno.env.get("DEV_PREVIEW_LOGIN_ALLOWLIST") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!expectedSecret || secret !== expectedSecret) {
      console.warn("[dev-preview-login] forbidden_secret", { origin, email });
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden_secret" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalized = String(email ?? "").trim().toLowerCase();
    if (!normalized || !allowlist.includes(normalized)) {
      console.warn("[dev-preview-login] forbidden_email", { origin, email: normalized });
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden_email" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, srk, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify user exists & active
    const { data: profile, error: profileErr } = await admin
      .from("user_profiles")
      .select("id, is_active")
      .eq("email", normalized)
      .maybeSingle();

    if (profileErr) {
      console.error("[dev-preview-login] profile lookup error", profileErr);
      return new Response(
        JSON.stringify({ ok: false, error: "internal_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!profile || !profile.is_active) {
      return new Response(
        JSON.stringify({ ok: false, error: "user_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auto-confirm if needed (so magiclink generation doesn't fall back to invite)
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
      if (authUser?.user && !authUser.user.email_confirmed_at) {
        await admin.auth.admin.updateUserById(profile.id, { email_confirm: true });
      }
    } catch (e) {
      console.warn("[dev-preview-login] auto-confirm non-fatal", e);
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: normalized,
      options: { redirectTo: redirect_to || `${origin}/chat` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[dev-preview-login] generateLink error", linkErr);
      return new Response(
        JSON.stringify({ ok: false, error: "link_generation_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[dev-preview-login] ✅ session issued", { origin, email: normalized });
    return new Response(
      JSON.stringify({ ok: true, action_link: linkData.properties.action_link }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[dev-preview-login] unexpected", e);
    return new Response(
      JSON.stringify({ ok: false, error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});