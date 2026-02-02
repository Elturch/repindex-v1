import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LegalFormRequest {
  formType: "gdpr" | "complaints";
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  details: string;
  requestTypes?: string[]; // For GDPR form
  language: "pt" | "en" | "es";
}

const formTypeLabels = {
  gdpr: {
    pt: "Exercício de Direitos RGPD",
    en: "GDPR Rights Request",
    es: "Ejercicio de Derechos RGPD",
  },
  complaints: {
    pt: "Reclamação",
    en: "Complaint",
    es: "Reclamación",
  },
};

function generateEmailHtml(data: LegalFormRequest): string {
  const timestamp = new Date().toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "full",
    timeStyle: "short",
  });

  const formLabel = formTypeLabels[data.formType][data.language];
  const requestTypesHtml = data.requestTypes?.length
    ? `<p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">📋 Tipos: ${data.requestTypes.join(", ")}</p>`
    : "";

  return `
<!DOCTYPE html>
<html lang="${data.language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${data.formType === "gdpr" ? "#059669" : "#dc2626"} 0%, ${data.formType === "gdpr" ? "#047857" : "#b91c1c"} 100%); padding: 32px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                ${data.formType === "gdpr" ? "🛡️" : "⚠️"} ${formLabel}
              </h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">
                RepIndex - Formulario Legal
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <!-- Contact Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px; background-color: #f1f5f9; border-radius: 8px;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                      Remitente
                    </p>
                    <p style="margin: 0; font-size: 18px; color: #1e293b; font-weight: 600;">
                      ${data.firstName} ${data.lastName}
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #2563eb;">
                      ${data.email}
                    </p>
                    ${data.phone ? `<p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">📞 ${data.phone}</p>` : ""}
                    ${requestTypesHtml}
                  </td>
                </tr>
              </table>
              
              <!-- Message -->
              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                  Detalles de la Solicitud
                </p>
                <div style="padding: 16px; background-color: #fafafa; border-left: 4px solid ${data.formType === "gdpr" ? "#059669" : "#dc2626"}; border-radius: 4px;">
                  <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6; white-space: pre-wrap;">
${data.details}
                  </p>
                </div>
              </div>
              
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <a href="mailto:${data.email}" style="display: inline-block; padding: 12px 24px; background-color: ${data.formType === "gdpr" ? "#059669" : "#dc2626"}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px;">
                      Responder a ${data.firstName}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                📅 Recibido: ${timestamp}<br>
                🌐 Origen: repindex.ai - ${formLabel}<br>
                🔒 Plazo legal de respuesta: 30 días
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
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: LegalFormRequest = await req.json();

    console.log("Legal form submission received:", {
      formType: data.formType,
      name: `${data.firstName} ${data.lastName}`,
      email: data.email,
      language: data.language,
      requestTypes: data.requestTypes,
    });

    // Validate required fields
    if (!data.formType || !data.firstName || !data.lastName || !data.email || !data.details) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email.trim())) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const formLabel = formTypeLabels[data.formType][data.language];
    const html = generateEmailHtml(data);

    // Send email to info@repindex.ai
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "RepIndex Legal <no-reply@repindex.ai>",
      to: ["info@repindex.ai"],
      replyTo: [data.email.trim()],
      subject: `[${formLabel}] ${data.firstName} ${data.lastName}`,
      html,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Legal form email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, message: "Form submitted successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in send-legal-form:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
