import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Executive roles for scoring
const EXECUTIVE_ROLES = [
  'ceo', 'cfo', 'dircom', 'estratega_interno', 'estratega_externo',
  'rsc_esg', 'legal', 'rrhh',
];

interface SubmitQualificationRequest {
  token: string;
  companiesInterested: string[];
  sectorsInterested: string[];
  roleType: string;
  additionalNotes?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      token, 
      companiesInterested, 
      sectorsInterested, 
      roleType, 
      additionalNotes 
    }: SubmitQualificationRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token and get qualification record
    const { data: qualRecord, error: qualError } = await supabase
      .from("lead_qualification_responses")
      .select("*, interested_leads(*)")
      .eq("token", token)
      .single();

    if (qualError || !qualRecord) {
      console.error("Token not found:", qualError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (new Date(qualRecord.token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Token has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already submitted
    if (qualRecord.submitted_at) {
      return new Response(
        JSON.stringify({ error: "Form already submitted" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lead = qualRecord.interested_leads;
    const emailDomain = qualRecord.email_domain || "";

    // Fetch companies to check for domain match
    const { data: companies } = await supabase
      .from("repindex_root_issuers")
      .select("ticker, issuer_name, website, sector_category")
      .in("ticker", companiesInterested);

    // Calculate contactability score
    let score = 0;
    let scoreBreakdown: string[] = [];

    // +20 if corporate email
    if (qualRecord.is_corporate_email) {
      score += 20;
      scoreBreakdown.push("+20 email corporativo");
    }

    // +30 if email domain matches a company of interest
    if (companies && companies.length > 0) {
      const matchingCompany = companies.find(c => {
        const website = c.website?.toLowerCase() || "";
        return website.includes(emailDomain) || emailDomain.includes(website.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0]);
      });
      if (matchingCompany) {
        score += 30;
        scoreBreakdown.push(`+30 dominio coincide con ${matchingCompany.ticker}`);
      }
    }

    // +10 if executive role
    if (EXECUTIVE_ROLES.includes(roleType)) {
      score += 10;
      scoreBreakdown.push("+10 perfil directivo");
    }

    // +20 for each sector that matches companies of interest (max 2 = +40)
    if (companies && sectorsInterested.length > 0) {
      const companySectors = new Set(companies.map(c => c.sector_category).filter(Boolean));
      const matchingSectors = sectorsInterested.filter(s => companySectors.has(s));
      const sectorPoints = Math.min(matchingSectors.length * 20, 40);
      if (sectorPoints > 0) {
        score += sectorPoints;
        scoreBreakdown.push(`+${sectorPoints} sectores coincidentes`);
      }
    }

    // +10 if additional notes provided
    if (additionalNotes && additionalNotes.trim().length > 10) {
      score += 10;
      scoreBreakdown.push("+10 comentarios adicionales");
    }

    // Cap at 100
    score = Math.min(score, 100);

    // Update qualification record
    const { error: updateQualError } = await supabase
      .from("lead_qualification_responses")
      .update({
        companies_interested: companiesInterested,
        sectors_interested: sectorsInterested,
        role_type: roleType,
        additional_notes: additionalNotes || null,
        contactability_score: score,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", qualRecord.id);

    if (updateQualError) {
      console.error("Error updating qualification:", updateQualError);
      return new Response(
        JSON.stringify({ error: "Failed to save form" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update lead status and score
    const { error: updateLeadError } = await supabase
      .from("interested_leads")
      .update({
        qualification_status: "form_completed",
        qualification_score: score,
      })
      .eq("id", qualRecord.lead_id);

    if (updateLeadError) {
      console.error("Error updating lead:", updateLeadError);
    }

    // Send notification email to admin
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      
      const priorityLabel = score >= 70 ? "🔥 ALTA PRIORIDAD" : score >= 40 ? "📌 Media prioridad" : "📋 Baja prioridad";
      
      try {
        await resend.emails.send({
          from: "RepIndex System <info@repindex.ai>",
          to: ["info@repindex.ai"],
          subject: `[Cualificación Completada] ${lead.email} - Score: ${score}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 20px; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 20px;">${priorityLabel}</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Nuevo lead cualificado</p>
              </div>
              
              <div style="background: #f9fafb; padding: 25px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <h2 style="color: #1e3a5f; margin-top: 0; font-size: 18px;">${lead.email}</h2>
                
                <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                  <h3 style="margin: 0 0 10px 0; color: #1e3a5f; font-size: 14px;">📊 Score de Contactabilidad</h3>
                  <div style="font-size: 32px; font-weight: bold; color: ${score >= 70 ? '#16a34a' : score >= 40 ? '#ca8a04' : '#6b7280'};">
                    ${score}/100
                  </div>
                  <div style="color: #666; font-size: 12px; margin-top: 5px;">
                    ${scoreBreakdown.join(' | ')}
                  </div>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                  <h3 style="margin: 0 0 10px 0; color: #1e3a5f; font-size: 14px;">🏢 Empresas de interés</h3>
                  <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                    ${companiesInterested.map(c => `<span style="background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 4px; font-size: 12px;">${c}</span>`).join('')}
                  </div>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                  <h3 style="margin: 0 0 10px 0; color: #1e3a5f; font-size: 14px;">🏭 Sectores de interés</h3>
                  <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                    ${sectorsInterested.map(s => `<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 4px; font-size: 12px;">${s}</span>`).join('')}
                  </div>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                  <h3 style="margin: 0 0 10px 0; color: #1e3a5f; font-size: 14px;">👤 Perfil</h3>
                  <div style="color: #333;">${roleType}</div>
                </div>
                
                ${additionalNotes ? `
                <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                  <h3 style="margin: 0 0 10px 0; color: #1e3a5f; font-size: 14px;">📝 Comentarios adicionales</h3>
                  <div style="color: #666; font-style: italic;">"${additionalNotes}"</div>
                </div>
                ` : ''}
                
                <div style="background: white; padding: 15px; border-radius: 6px;">
                  <h3 style="margin: 0 0 10px 0; color: #1e3a5f; font-size: 14px;">ℹ️ Datos del lead</h3>
                  <table style="width: 100%; font-size: 13px;">
                    <tr><td style="color: #666;">Email corporativo:</td><td><strong>${qualRecord.is_corporate_email ? 'Sí' : 'No'}</strong></td></tr>
                    <tr><td style="color: #666;">Dominio:</td><td>${qualRecord.email_domain}</td></tr>
                    <tr><td style="color: #666;">Consentimiento:</td><td>${lead.contact_consent ? 'Sí' : 'No'}</td></tr>
                    <tr><td style="color: #666;">Fecha registro:</td><td>${new Date(lead.created_at).toLocaleDateString('es-ES')}</td></tr>
                  </table>
                </div>
                
                <div style="text-align: center; margin-top: 20px;">
                  <a href="https://id-preview--bc807963-c063-4e58-b3fe-21a2a28cd8bf.lovable.app/admin" style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Ver en Panel Admin
                  </a>
                </div>
              </div>
            </body>
            </html>
          `,
        });
        console.log("Admin notification email sent");
      } catch (emailError) {
        console.error("Failed to send admin notification:", emailError);
        // Don't fail the request if email fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Form submitted successfully",
        score,
        scoreBreakdown,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in submit-qualification-form:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
