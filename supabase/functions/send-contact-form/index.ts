import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContactRequest {
  name: string;
  email: string;
  company?: string;
  message: string;
  honeypot?: string;
}

const validateRequest = (data: ContactRequest): { valid: boolean; error?: string } => {
  // Honeypot check - if filled, it's a bot
  if (data.honeypot && data.honeypot.length > 0) {
    console.log("Honeypot triggered - rejecting spam");
    return { valid: false, error: "Invalid request" };
  }

  // Name validation
  if (!data.name || data.name.trim().length === 0) {
    return { valid: false, error: "El nombre es requerido" };
  }
  if (data.name.trim().length > 100) {
    return { valid: false, error: "El nombre no puede exceder 100 caracteres" };
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!data.email || !emailRegex.test(data.email.trim())) {
    return { valid: false, error: "Email inválido" };
  }
  if (data.email.trim().length > 255) {
    return { valid: false, error: "El email no puede exceder 255 caracteres" };
  }

  // Company validation (optional)
  if (data.company && data.company.trim().length > 100) {
    return { valid: false, error: "La empresa no puede exceder 100 caracteres" };
  }

  // Message validation
  if (!data.message || data.message.trim().length === 0) {
    return { valid: false, error: "El mensaje es requerido" };
  }
  if (data.message.trim().length > 1000) {
    return { valid: false, error: "El mensaje no puede exceder 1000 caracteres" };
  }

  return { valid: true };
};

const generateEmailHtml = (name: string, email: string, company: string | undefined, message: string): string => {
  const timestamp = new Date().toLocaleString("es-ES", { 
    timeZone: "Europe/Madrid",
    dateStyle: "full",
    timeStyle: "short"
  });

  return `
<!DOCTYPE html>
<html lang="es">
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
            <td style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 32px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                📩 Nuevo Contacto Web
              </h1>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 14px;">
                RepIndex - Formulario de Contacto
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
                      ${name}
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #2563eb;">
                      ${email}
                    </p>
                    ${company ? `<p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">🏢 ${company}</p>` : ''}
                  </td>
                </tr>
              </table>
              
              <!-- Message -->
              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                  Mensaje
                </p>
                <div style="padding: 16px; background-color: #fafafa; border-left: 4px solid #2563eb; border-radius: 4px;">
                  <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6; white-space: pre-wrap;">
${message}
                  </p>
                </div>
              </div>
              
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <a href="mailto:${email}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px;">
                      Responder a ${name}
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
                🌐 Origen: repindex.ai - Formulario de Contacto
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
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: ContactRequest = await req.json();
    
    console.log("Contact form submission received:", { 
      name: data.name, 
      email: data.email, 
      company: data.company,
      messageLength: data.message?.length 
    });

    // Validate request
    const validation = validateRequest(data);
    if (!validation.valid) {
      console.log("Validation failed:", validation.error);
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Sanitize inputs
    const name = data.name.trim();
    const email = data.email.trim().toLowerCase();
    const company = data.company?.trim() || undefined;
    const message = data.message.trim();

    // Generate email HTML
    const html = generateEmailHtml(name, email, company, message);

    // Send email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "RepIndex <noreply@repindex.ai>",
      to: ["informes@repindex.ai"],
      replyTo: [email],
      subject: `[Contacto Web] ${name}${company ? ` - ${company}` : ''}`,
      html,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return new Response(
        JSON.stringify({ error: "Error al enviar el mensaje. Por favor, inténtalo de nuevo." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, message: "Mensaje enviado correctamente" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error in send-contact-form:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
