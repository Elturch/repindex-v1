import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Non-corporate email domains that should be rejected
const NON_CORPORATE_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.es', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it',
  'outlook.com', 'outlook.es', 'outlook.fr', 'outlook.de', 'live.com', 'live.es', 'msn.com',
  'yahoo.com', 'yahoo.es', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.it', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'protonmail.ch', 'proton.me', 'tutanota.com', 'tutanota.de', 'tutamail.com',
  'aol.com', 'mail.com', 'gmx.com', 'gmx.es', 'gmx.de', 'gmx.net',
  'yandex.com', 'yandex.ru', 'zoho.com', 'mail.ru', 'inbox.com', 'fastmail.com', 'hushmail.com',
  'telefonica.net', 'terra.es', 'ono.com', 'orange.es', 'vodafone.es', 'movistar.es', 'ya.com',
  'tempmail.com', 'guerrillamail.com', 'mailinator.com', 'throwaway.email', 'temp-mail.org',
];

function isCorporateEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !NON_CORPORATE_DOMAINS.includes(domain);
}

function getEmailDomain(email: string): string {
  if (!email || !email.includes('@')) return '';
  return email.split('@')[1]?.toLowerCase() || '';
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

interface LeadPayload {
  email: string;
  contact_consent: boolean;
  source?: string;
  user_agent?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: LeadPayload = await req.json();
    console.log('[save-interested-lead] Received payload:', { 
      email: payload.email?.substring(0, 3) + '***', 
      contact_consent: payload.contact_consent,
      source: payload.source 
    });

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!payload.email || !emailRegex.test(payload.email)) {
      console.error('[save-interested-lead] Invalid email:', payload.email);
      return new Response(
        JSON.stringify({ ok: false, error: 'Email inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate contact_consent is boolean
    if (typeof payload.contact_consent !== 'boolean') {
      console.error('[save-interested-lead] Invalid contact_consent:', payload.contact_consent);
      return new Response(
        JSON.stringify({ ok: false, error: 'Consentimiento inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate source (optional, default to login_attempt)
    const allowedSources = ['login_attempt', 'landing', 'contact_form'];
    const source = allowedSources.includes(payload.source || '') 
      ? payload.source 
      : 'login_attempt';

    // Create Supabase client with Service Role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const emailNormalized = payload.email.trim().toLowerCase();
    const isCorporate = isCorporateEmail(emailNormalized);
    const emailDomain = getEmailDomain(emailNormalized);

    // Determine initial qualification status
    let qualificationStatus = 'pending';
    if (payload.contact_consent) {
      qualificationStatus = isCorporate ? 'form_sent' : 'rejected_email';
    }

    // Upsert the lead
    const { data: leadData, error: leadError } = await supabase
      .from('interested_leads')
      .upsert({
        email: emailNormalized,
        contact_consent: payload.contact_consent,
        consent_date: new Date().toISOString(),
        user_agent: payload.user_agent || null,
        source: source,
        status: 'pending',
        qualification_status: qualificationStatus,
      }, { 
        onConflict: 'email',
        ignoreDuplicates: false 
      })
      .select('id')
      .single();

    if (leadError) {
      console.error('[save-interested-lead] Supabase error:', leadError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Error al guardar. Inténtalo de nuevo.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leadId = leadData?.id;
    console.log('[save-interested-lead] Lead saved successfully:', leadId);

    // If consent was given, send the qualification email
    let qualificationSent = false;
    let emailSentType: 'form' | 'rejection' | null = null;

    if (payload.contact_consent && leadId) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      
      if (!resendApiKey) {
        console.error('[save-interested-lead] RESEND_API_KEY not configured');
        // Still return success for the lead save, but note email wasn't sent
        return new Response(
          JSON.stringify({ 
            ok: true, 
            leadId, 
            qualificationSent: false,
            isCorporateEmail: isCorporate,
            message: 'Lead guardado, pero email no configurado'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const resend = new Resend(resendApiKey);

      if (isCorporate) {
        // Generate token for qualification form
        const token = generateToken();
        const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Create qualification response record
        const { error: qualError } = await supabase
          .from('lead_qualification_responses')
          .insert({
            lead_id: leadId,
            token: token,
            token_expires_at: tokenExpiresAt.toISOString(),
            email_domain: emailDomain,
            is_corporate_email: true,
            form_sent_at: new Date().toISOString(),
          });

        if (qualError) {
          console.error('[save-interested-lead] Error creating qualification record:', qualError);
        }

        // Send qualification form email
        const formUrl = `https://repindex-v1.lovable.app/qualification/${token}`;
        
        try {
          await resend.emails.send({
            from: 'RepIndex <noreply@repindex.ai>',
            to: [emailNormalized],
            subject: 'Tu acceso a RepIndex - Un paso más',
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #1a1a1a; margin-bottom: 10px;">
                    <span style="color: #0066cc;">Rep</span>Index
                  </h1>
                  <p style="color: #666; font-size: 14px;">AI Corporate Reputation Authority</p>
                </div>
                
                <h2 style="color: #1a1a1a;">¡Gracias por tu interés!</h2>
                
                <p>Estamos encantados de que quieras conocer RepIndex, la primera plataforma que mide cómo perciben las IAs a las empresas cotizadas.</p>
                
                <p>Para ofrecerte la mejor experiencia posible, necesitamos conocerte un poco mejor. Por favor, completa este breve formulario:</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${formUrl}" style="display: inline-block; background-color: #0066cc; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Completar formulario</a>
                </div>
                
                <p style="color: #666; font-size: 14px;">Este enlace es válido durante 7 días.</p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                
                <p style="color: #999; font-size: 12px;">
                  Si no has solicitado acceso a RepIndex, puedes ignorar este email.<br>
                  © ${new Date().getFullYear()} RepIndex. Todos los derechos reservados.
                </p>
              </body>
              </html>
            `,
          });
          qualificationSent = true;
          emailSentType = 'form';
          console.log('[save-interested-lead] Qualification form email sent to:', emailNormalized);
        } catch (emailError) {
          console.error('[save-interested-lead] Error sending qualification email:', emailError);
        }
      } else {
        // Send rejection email for non-corporate addresses
        try {
          await resend.emails.send({
            from: 'RepIndex <noreply@repindex.ai>',
            to: [emailNormalized],
            subject: 'Sobre tu interés en RepIndex',
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #1a1a1a; margin-bottom: 10px;">
                    <span style="color: #0066cc;">Rep</span>Index
                  </h1>
                  <p style="color: #666; font-size: 14px;">AI Corporate Reputation Authority</p>
                </div>
                
                <h2 style="color: #1a1a1a;">Gracias por tu interés</h2>
                
                <p>Hemos recibido tu solicitud de acceso desde <strong>${emailNormalized}</strong>.</p>
                
                <p>RepIndex está diseñado para profesionales que trabajan en empresas cotizadas o asesoran a las mismas. Para poder ofrecerte informes personalizados y relevantes, necesitamos verificar tu vinculación profesional.</p>
                
                <p><strong>¿Cómo puedes acceder?</strong></p>
                
                <p>Simplemente solicita acceso desde tu email corporativo (el de tu empresa). Esto nos permite:</p>
                
                <ul>
                  <li>Personalizar los informes para tu empresa</li>
                  <li>Darte acceso a datos de tu sector</li>
                  <li>Ofrecerte comparativas con competidores relevantes</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="mailto:info@repindex.ai?subject=Solicitud%20de%20acceso%20a%20RepIndex" style="display: inline-block; background-color: #0066cc; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Contactar con nosotros</a>
                </div>
                
                <p style="color: #666; font-size: 14px;">Si tienes cualquier duda, responde a este email o escríbenos a info@repindex.ai.</p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                
                <p style="color: #999; font-size: 12px;">
                  © ${new Date().getFullYear()} RepIndex. Todos los derechos reservados.
                </p>
              </body>
              </html>
            `,
          });
          qualificationSent = true;
          emailSentType = 'rejection';
          console.log('[save-interested-lead] Rejection email sent to:', emailNormalized);
        } catch (emailError) {
          console.error('[save-interested-lead] Error sending rejection email:', emailError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        leadId,
        qualificationSent,
        isCorporateEmail: isCorporate,
        emailSentType,
        message: qualificationSent 
          ? (isCorporate ? 'Formulario enviado' : 'Email informativo enviado')
          : 'Lead guardado'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[save-interested-lead] Unexpected error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Error inesperado. Inténtalo de nuevo.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
