import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NewsroomEmailRequest {
  weeklyNewsId: string;
  weekLabel: string;
  mainHeadline: string;
  mainLead: string;
  stories: Array<{
    headline: string;
    lead: string;
  }>;
}

interface EligibleUser {
  id: string;
  email: string;
  full_name: string | null;
}

// Generate premium HTML email template
function generateEmailHtml(
  weekLabel: string,
  mainHeadline: string,
  mainLead: string,
  stories: Array<{ headline: string; lead: string }>,
  userName?: string
): string {
  const storiesHtml = stories
    .slice(0, 4)
    .map(
      (story) => `
        <tr>
          <td style="padding: 0 32px 20px;">
            <div style="border-left: 4px solid #2563eb; padding-left: 16px;">
              <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #1e293b;">
                ${story.headline}
              </p>
              <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
                ${story.lead}
              </p>
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  const greeting = userName ? `Hola ${userName.split(" ")[0]},` : "Hola,";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RepIndex Newsroom - ${weekLabel}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); overflow: hidden;">
          
          <!-- Header with RepIndex branding -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
                📰 RepIndex Newsroom
              </h1>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 13px;">
                Inteligencia Reputacional Semanal
              </p>
            </td>
          </tr>
          
          <!-- Greeting and week label -->
          <tr>
            <td style="padding: 32px 32px 16px;">
              <p style="margin: 0 0 8px 0; font-size: 15px; color: #475569;">
                ${greeting}
              </p>
              <p style="margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                ${weekLabel}
              </p>
            </td>
          </tr>
          
          <!-- Main headline -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <h2 style="margin: 0 0 12px 0; font-size: 22px; color: #1e293b; line-height: 1.3; font-weight: 700;">
                ${mainHeadline}
              </h2>
              <p style="margin: 0; font-size: 15px; color: #475569; line-height: 1.6;">
                ${mainLead}
              </p>
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0 0 24px 0;">
            </td>
          </tr>
          
          <!-- Section title -->
          <tr>
            <td style="padding: 0 32px 16px;">
              <p style="margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                Más historias destacadas
              </p>
            </td>
          </tr>
          
          <!-- Stories -->
          ${storiesHtml}
          
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 24px 32px 32px;">
              <a href="https://repindex.ai/noticias" 
                 style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);">
                Leer Newsroom Completo →
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5;">
                Recibes este email porque tienes activadas las alertas del Newsroom en tu perfil de RepIndex.
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                <a href="https://repindex.ai/perfil" style="color: #2563eb; text-decoration: none;">Gestionar preferencias</a>
                &nbsp;·&nbsp;
                <a href="https://repindex.ai" style="color: #64748b; text-decoration: none;">repindex.ai</a>
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

// Delay helper for rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: NewsroomEmailRequest = await req.json();

    console.log("Newsroom email distribution started:", {
      weeklyNewsId: data.weeklyNewsId,
      weekLabel: data.weekLabel,
      mainHeadline: data.mainHeadline?.substring(0, 50),
      storiesCount: data.stories?.length,
    });

    // Validate required fields
    if (!data.weeklyNewsId || !data.weekLabel || !data.mainHeadline) {
      throw new Error("Missing required fields: weeklyNewsId, weekLabel, mainHeadline");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch eligible users
    const { data: users, error: usersError } = await supabase
      .from("user_profiles")
      .select(`
        id,
        email,
        full_name,
        user_notification_preferences!left (
          enable_newsroom_alerts,
          enable_email_notifications
        )
      `)
      .eq("is_active", true)
      .not("email", "is", null);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw new Error("Failed to fetch eligible users");
    }

    // Filter users based on notification preferences
    const eligibleUsers: EligibleUser[] = (users || []).filter((user: any) => {
      const prefs = user.user_notification_preferences?.[0];
      // Default to true if no preferences set
      const newsroomEnabled = prefs?.enable_newsroom_alerts ?? true;
      const emailEnabled = prefs?.enable_email_notifications ?? true;
      return newsroomEnabled && emailEnabled && user.email;
    }).map((user: any) => ({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    }));

    console.log(`Found ${eligibleUsers.length} eligible users for Newsroom email`);

    if (eligibleUsers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No eligible users found",
          sent: 0 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send emails in batches
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_EMAILS = 100; // 100ms
    
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
      const batch = eligibleUsers.slice(i, i + BATCH_SIZE);
      
      for (const user of batch) {
        try {
          // Generate personalized email
          const html = generateEmailHtml(
            data.weekLabel,
            data.mainHeadline,
            data.mainLead || "",
            data.stories || [],
            user.full_name || undefined
          );

          // Send email via Resend (add BCC to info@repindex.ai for internal tracking)
          const { error: emailError } = await resend.emails.send({
            from: "RepIndex <no-reply@repindex.ai>",
            to: [user.email],
            bcc: ["info@repindex.ai"],
            subject: `📰 ${data.weekLabel} | ${data.mainHeadline.substring(0, 40)}...`,
            html,
          });

          if (emailError) {
            console.error(`Email failed for ${user.email}:`, emailError);
            errors.push(`${user.email}: ${emailError.message}`);
            errorCount++;
          } else {
            console.log(`✅ Email sent to ${user.email}`);
            successCount++;

            // Register in user_notifications for tracking
            await supabase.from("user_notifications").insert({
              user_id: user.id,
              notification_type: "newsroom_weekly",
              title: `📰 ${data.weekLabel}`,
              content: data.mainHeadline,
              metadata: { 
                week_id: data.weeklyNewsId, 
                email_sent: true,
                sent_at: new Date().toISOString()
              },
              status: "sent",
              approved_at: new Date().toISOString(),
            });
          }

          // Rate limiting delay
          await delay(DELAY_BETWEEN_EMAILS);
          
        } catch (userError: any) {
          console.error(`Error processing user ${user.email}:`, userError);
          errors.push(`${user.email}: ${userError.message}`);
          errorCount++;
        }
      }
    }

    console.log(`Newsroom email distribution complete: ${successCount} sent, ${errorCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: errorCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-newsroom-email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
