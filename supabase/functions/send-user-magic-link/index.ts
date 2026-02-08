import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate RepIndex branded magic link email (same template as admin-api)
const generateMagicLinkEmail = (userName: string, magicLink: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1e293b;padding:24px 32px;text-align:center;">
              <img src="https://repindex-v1.lovable.app/assets/repindex-logo-text-transparent.png" alt="RepIndex" height="32" style="height:32px;">
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 32px;">
              <h1 style="margin:0 0 16px;font-size:24px;color:#1e293b;">Accede a tu cuenta</h1>
              <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
                Hola ${userName || 'Usuario'},
              </p>
              <p style="margin:0 0 32px;font-size:16px;color:#475569;line-height:1.6;">
                Haz clic en el botón para acceder a RepIndex. Este enlace es válido durante 24 horas.
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${magicLink}" style="display:inline-block;background:#2563eb;color:#fff;font-size:16px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
                      Acceder a RepIndex
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Fallback link -->
              <p style="margin:32px 0 0;font-size:14px;color:#94a3b8;line-height:1.5;">
                Si el botón no funciona, copia este enlace:<br>
                <a href="${magicLink}" style="color:#2563eb;word-break:break-all;">${magicLink}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">
                Este email fue enviado por RepIndex.<br>
                Si no solicitaste este acceso, puedes ignorar este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, redirect_to } = await req.json();
    
    if (!email) {
      console.error("[send-user-magic-link] No email provided");
      return new Response(
        JSON.stringify({ success: false, error: "Email requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[send-user-magic-link] Processing request for: ${normalizedEmail}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[send-user-magic-link] Missing Supabase credentials");
      return new Response(
        JSON.stringify({ success: false, error: "Error de configuración del servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resendApiKey) {
      console.error("[send-user-magic-link] Missing RESEND_API_KEY");
      return new Response(
        JSON.stringify({ success: false, error: "Error de configuración del servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Verify user exists in user_profiles and is active
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("id, email, full_name, is_active")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (profileError) {
      console.error("[send-user-magic-link] DB error:", profileError);
      return new Response(
        JSON.stringify({ success: false, error: "Error interno. Inténtalo de nuevo." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile) {
      console.log("[send-user-magic-link] Email not found in user_profiles:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: false, error: "Email no registrado.", notRegistered: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile.is_active) {
      console.log("[send-user-magic-link] User inactive:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: false, error: "Tu cuenta está desactivada. Contacta con el administrador." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-user-magic-link] User verified: ${profile.full_name || normalizedEmail}, is_active: ${profile.is_active}`);

    // 2. Generate magic link using Admin API (ALWAYS works, regardless of email confirmation status)
    const redirectUrl = redirect_to || "https://repindex-v1.lovable.app/dashboard";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: { redirectTo: redirectUrl }
    });

    if (linkError) {
      console.error("[send-user-magic-link] Link generation error:", linkError);
      return new Response(
        JSON.stringify({ success: false, error: "Error generando enlace. Inténtalo de nuevo." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!linkData?.properties?.action_link) {
      console.error("[send-user-magic-link] No action_link in response");
      return new Response(
        JSON.stringify({ success: false, error: "Error generando enlace. Inténtalo de nuevo." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const magicLink = linkData.properties.action_link;
    console.log(`[send-user-magic-link] Magic link generated successfully for ${normalizedEmail}`);

    // 3. Send email via Resend with branded template
    const resend = new Resend(resendApiKey);
    const userName = profile.full_name || normalizedEmail.split('@')[0];
    
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "RepIndex <no-reply@repindex.ai>",
      to: [normalizedEmail],
      subject: "Tu acceso a RepIndex",
      html: generateMagicLinkEmail(userName, magicLink),
    });

    if (emailError) {
      console.error("[send-user-magic-link] Resend error:", emailError);
      return new Response(
        JSON.stringify({ success: false, error: "Error enviando email. Inténtalo de nuevo." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-user-magic-link] ✅ Magic link sent to ${normalizedEmail}, Resend ID: ${emailData?.id}`);
    
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[send-user-magic-link] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Error interno. Inténtalo de nuevo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
