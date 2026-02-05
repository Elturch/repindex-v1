import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Non-corporate email domains
const NON_CORPORATE_DOMAINS = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com',
  'outlook.es', 'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com',
  'protonmail.com', 'proton.me', 'aol.com', 'mail.com', 'gmx.com', 'gmx.es',
  'yandex.com', 'zoho.com', 'tutanota.com', 'msn.com', 'ymail.com',
  'telefonica.net', 'terra.es', 'ono.com', 'orange.es', 'vodafone.es',
];

interface SendQualificationRequest {
  leadId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    const { leadId }: SendQualificationRequest = await req.json();

    if (!leadId) {
      return new Response(
        JSON.stringify({ error: "leadId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the lead
    const { data: lead, error: leadError } = await supabase
      .from("interested_leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      console.error("Lead not found:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = lead.email;
    const domain = email.split("@")[1]?.toLowerCase() || "";
    const isCorporate = !NON_CORPORATE_DOMAINS.includes(domain);

    // Generate unique token
    const token = crypto.randomUUID();
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create qualification response record
    const { error: insertError } = await supabase
      .from("lead_qualification_responses")
      .insert({
        lead_id: leadId,
        token,
        token_expires_at: tokenExpiresAt.toISOString(),
        email_domain: domain,
        is_corporate_email: isCorporate,
        form_sent_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Error creating qualification record:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create qualification record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which email to send
    if (isCorporate) {
      // Send qualification form email
      const formUrl = `https://repindex-v1.lovable.app/cualificacion/${token}`;
      
      const emailResponse = await resend.emails.send({
        from: "RepIndex <info@repindex.ai>",
        to: [email],
        subject: "Tu acceso a RepIndex - Un paso más",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">RepIndex</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Inteligencia de Reputación Corporativa</p>
            </div>
            
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
              <h2 style="color: #1e3a5f; margin-top: 0;">¡Hola!</h2>
              
              <p>Gracias por tu interés en RepIndex, la plataforma de inteligencia que mide cómo las principales IAs perciben a las empresas cotizadas españolas.</p>
              
              <p>Para personalizar tu experiencia y darte acceso a los informes más relevantes para ti, necesitamos que completes un breve formulario de cualificación.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${formUrl}" style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Completar formulario
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                <strong>Nota:</strong> Este enlace es válido durante 7 días. Si tienes alguna pregunta, responde a este email.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
              
              <p style="color: #888; font-size: 12px; margin: 0;">
                RepIndex · Inteligencia de Reputación Corporativa<br>
                <a href="https://repindex-v1.lovable.app" style="color: #1e3a5f;">repindex.ai</a>
              </p>
            </div>
          </body>
          </html>
        `,
      });

      console.log("Qualification form email sent:", emailResponse);

      // Update lead status
      await supabase
        .from("interested_leads")
        .update({
          qualification_status: "form_sent",
          contacted_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Qualification form sent",
          isCorporate: true,
          token,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      // Send rejection email for non-corporate email
      const emailResponse = await resend.emails.send({
        from: "RepIndex <info@repindex.ai>",
        to: [email],
        subject: "Sobre tu interés en RepIndex",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">RepIndex</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Inteligencia de Reputación Corporativa</p>
            </div>
            
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
              <h2 style="color: #1e3a5f; margin-top: 0;">¡Hola!</h2>
              
              <p>Gracias por tu interés en RepIndex. Hemos recibido tu solicitud desde <strong>${email}</strong>.</p>
              
              <p>Para poder ofrecerte el mejor servicio y personalizar los informes de reputación corporativa para tu empresa, necesitamos que te registres con tu <strong>email corporativo</strong>.</p>
              
              <p>Esto nos permite:</p>
              <ul style="color: #555;">
                <li>Identificar tu empresa y sector</li>
                <li>Personalizar los informes a tu perfil</li>
                <li>Darte acceso a las métricas más relevantes</li>
              </ul>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="mailto:info@repindex.ai?subject=Solicitud%20de%20acceso%20a%20RepIndex" style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Contactar desde email corporativo
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                Si tienes alguna pregunta, no dudes en escribirnos a <a href="mailto:info@repindex.ai" style="color: #1e3a5f;">info@repindex.ai</a>
              </p>
              
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
              
              <p style="color: #888; font-size: 12px; margin: 0;">
                RepIndex · Inteligencia de Reputación Corporativa<br>
                <a href="https://repindex-v1.lovable.app" style="color: #1e3a5f;">repindex.ai</a>
              </p>
            </div>
          </body>
          </html>
        `,
      });

      console.log("Rejection email sent:", emailResponse);

      // Update lead status
      await supabase
        .from("interested_leads")
        .update({
          qualification_status: "rejected_email",
          contacted_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Non-corporate email rejection sent",
          isCorporate: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error in send-qualification-form:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
