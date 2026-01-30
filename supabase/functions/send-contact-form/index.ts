import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiting (resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 5; // 5 requests per hour per IP

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  
  entry.count++;
  return false;
}

// Clean up old entries periodically
function cleanupRateLimitMap() {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

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

const generateInternalEmailHtml = (name: string, email: string, company: string | undefined, message: string): string => {
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

const generateConfirmationEmailHtml = (name: string): string => {
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
            <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                ¡Gracias por contactarnos!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px 0; font-size: 18px; color: #1e293b; line-height: 1.6;">
                Hola <strong>${name}</strong>,
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #475569; line-height: 1.7;">
                Hemos recibido tu mensaje correctamente. Nuestro equipo lo revisará y <strong>nos pondremos en contacto contigo lo antes posible</strong>.
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #475569; line-height: 1.7;">
                Normalmente respondemos en un plazo de <strong>24-48 horas laborables</strong>.
              </p>
              
              <!-- Divider -->
              <div style="border-top: 1px solid #e2e8f0; margin: 32px 0;"></div>
              
              <!-- What is RepIndex -->
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                ¿Qué es RepIndex?
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 15px; color: #475569; line-height: 1.7;">
                RepIndex mide cómo las principales IAs (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) describen a las empresas del IBEX 35 y empresas cotizadas. Es el primer índice de reputación algorítmica en España.
              </p>
              
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <a href="https://repindex.ai" style="display: inline-block; padding: 14px 28px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
                      Explorar RepIndex
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b; text-align: center;">
                <strong>RepIndex.ai</strong> — Análisis Reputacional Inteligente
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                Este es un mensaje automático. Por favor, no respondas a este correo.
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
    // Rate limiting check
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || 
                     "unknown";
    
    // Cleanup old entries (simple garbage collection)
    if (Math.random() < 0.1) cleanupRateLimitMap();
    
    if (isRateLimited(clientIp)) {
      console.log(`Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Demasiadas solicitudes. Por favor, inténtalo más tarde." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data: ContactRequest = await req.json();
    
    console.log("Contact form submission received:", { 
      name: data.name, 
      email: data.email, 
      company: data.company,
      messageLength: data.message?.length,
      clientIp: clientIp.substring(0, 10) + "***" // Log partial IP for debugging
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

    // Generate email HTML for internal notification
    const internalHtml = generateInternalEmailHtml(name, email, company, message);
    
    // Generate confirmation email HTML for user
    const confirmationHtml = generateConfirmationEmailHtml(name);

    // Send internal notification email
    const { data: internalEmailData, error: internalEmailError } = await resend.emails.send({
      from: "RepIndex <no-reply@repindex.ai>",
      to: ["informes@hablamosde.com"],
      replyTo: [email],
      subject: `[Contacto Web] ${name}${company ? ` - ${company}` : ''}`,
      html: internalHtml,
    });

    if (internalEmailError) {
      console.error("Resend error (internal):", internalEmailError);
      return new Response(
        JSON.stringify({ error: "Error al enviar el mensaje. Por favor, inténtalo de nuevo." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Internal email sent successfully:", internalEmailData);

    // Send confirmation email to user
    const { data: confirmationEmailData, error: confirmationEmailError } = await resend.emails.send({
      from: "RepIndex <no-reply@repindex.ai>",
      to: [email],
      subject: "¡Gracias por contactar con RepIndex!",
      html: confirmationHtml,
    });

    if (confirmationEmailError) {
      // Log error but don't fail the request - internal email was already sent
      console.error("Resend error (confirmation):", confirmationEmailError);
    } else {
      console.log("Confirmation email sent successfully:", confirmationEmailData);
    }

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
