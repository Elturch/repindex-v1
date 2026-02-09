import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate RepIndex branded magic link email
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { action, data } = await req.json();

    switch (action) {
      // ==================== COMPANIES ====================
      case "list_companies": {
        const { data: companies, error } = await supabaseAdmin
          .from("client_companies")
          .select("*")
          .order("created_at", { ascending: false });
        
        if (error) throw error;
        return new Response(JSON.stringify({ companies }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_company": {
        const { data: company, error } = await supabaseAdmin
          .from("client_companies")
          .insert({
            company_name: data.company_name,
            ticker: data.ticker || null,
            contact_email: data.contact_email || null,
            contact_phone: data.contact_phone || null,
            billing_name: data.billing_name || null,
            billing_address: data.billing_address || null,
            billing_city: data.billing_city || null,
            billing_postal_code: data.billing_postal_code || null,
            tax_id: data.tax_id || null,
            plan_type: data.plan_type || "basic",
            monthly_fee: data.monthly_fee || 0,
            contract_start: data.contract_start || null,
            contract_end: data.contract_end || null,
            notes: data.notes || null,
          })
          .select()
          .single();
        
        if (error) throw error;
        return new Response(JSON.stringify({ company }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_company": {
        const { data: company, error } = await supabaseAdmin
          .from("client_companies")
          .update({
            company_name: data.company_name,
            ticker: data.ticker || null,
            contact_email: data.contact_email || null,
            contact_phone: data.contact_phone || null,
            billing_name: data.billing_name || null,
            tax_id: data.tax_id || null,
            plan_type: data.plan_type,
            monthly_fee: data.monthly_fee ?? 0,
            is_active: data.is_active,
            notes: data.notes || null,
          })
          .eq("id", data.id)
          .select()
          .single();
        
        if (error) throw error;
        return new Response(JSON.stringify({ company }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== USERS ====================
      case "list_users": {
        const { data: profiles, error } = await supabaseAdmin
          .from("user_profiles")
          .select(`
            *,
            client_companies (
              id,
              company_name
            )
          `)
          .order("created_at", { ascending: false });
        
        if (error) throw error;
        return new Response(JSON.stringify({ users: profiles }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_user": {
        // 1. Create user in auth.users using inviteUserByEmail which sends the email automatically
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          data.email,
          {
            data: {
              full_name: data.full_name,
            },
            redirectTo: data.redirect_to || undefined,
          }
        );
        
        if (authError) {
          // Check if user already exists
          if (authError.code === "email_exists") {
            return new Response(
              JSON.stringify({ 
                error: "Este email ya está registrado. Usa 'Enviar Magic Link' para reenviar la invitación." 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              }
            );
          }
          throw authError;
        }
        
        // 2. Update the auto-created profile with additional data
        const { error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .update({
            company_id: data.company_id || null,
            full_name: data.full_name || "",
            is_individual: data.is_individual || false,
          })
          .eq("id", authData.user.id);
        
        if (profileError) throw profileError;
        
        return new Response(JSON.stringify({ 
          user: authData.user,
          message: "Usuario creado e invitación enviada por email" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_user": {
        const { error } = await supabaseAdmin
          .from("user_profiles")
          .update({
            full_name: data.full_name,
            company_id: data.company_id || null,
            is_active: data.is_active,
            is_individual: data.is_individual,
          })
          .eq("id", data.id);
        
        if (error) throw error;
        return new Response(JSON.stringify({ message: "Usuario actualizado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send_magic_link": {
        // Initialize Resend
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
          throw new Error("RESEND_API_KEY no está configurada");
        }
        const resend = new Resend(resendApiKey);

        // Get user profile
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .select("email, full_name")
          .eq("id", data.user_id)
          .single();
        
        if (profileError) throw profileError;
        if (!profile?.email) throw new Error("Usuario no encontrado o sin email");

        // Generate magic link using Supabase Admin API (without sending email)
        const redirectTo = data.redirect_to || "https://repindex-v1.lovable.app/dashboard";
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: profile.email,
          options: {
            redirectTo,
          },
        });
        
        if (linkError) {
          console.error("Error generating magic link:", linkError);
          throw new Error(`Error generando enlace de acceso: ${linkError.message}`);
        }

        if (!linkData?.properties?.action_link) {
          throw new Error("No se pudo generar el enlace de acceso");
        }

        const magicLink = linkData.properties.action_link;
        const userName = profile.full_name || profile.email.split('@')[0];

        // Send email via Resend with custom template
        // IMPORTANT: Domain must be verified in Resend Dashboard: https://resend.com/domains
        const { data: emailData, error: emailError } = await resend.emails.send({
          from: "RepIndex <no-reply@repindex.ai>",
          to: [profile.email],
          subject: "Tu acceso a RepIndex",
          html: generateMagicLinkEmail(userName, magicLink),
        });

        if (emailError) {
          console.error("Resend error:", emailError);
          throw new Error(`Error enviando email: ${emailError.message}`);
        }

        console.log(`Magic link sent via Resend to ${profile.email}:`, emailData);
        
        return new Response(JSON.stringify({ 
          success: true,
          message: `Magic link enviado a ${profile.email}`,
          email_id: emailData?.id 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== CONVERSATIONS ====================
      case "list_conversations": {
        // Fetch all conversations with user info
        const { data: conversations, error: convoError } = await supabaseAdmin
          .from("user_conversations")
          .select("*")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(100);
        
        if (convoError) throw convoError;

        // Get user profiles
        const { data: profiles } = await supabaseAdmin
          .from("user_profiles")
          .select("id, email, full_name");

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

        const enrichedConversations = (conversations || []).map((c: any) => {
          const profile = profileMap.get(c.user_id);
          return {
            ...c,
            user_email: profile?.email || 'Desconocido',
            user_name: profile?.full_name || null,
          };
        });

        return new Response(JSON.stringify({ conversations: enrichedConversations }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_conversation_messages": {
        const { data: messages, error } = await supabaseAdmin
          .from("chat_intelligence_sessions")
          .select("*")
          .eq("session_id", data.session_id)
          .order("created_at", { ascending: true });
        
        if (error) throw error;
        return new Response(JSON.stringify({ messages }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== NOTIFICATIONS ====================
      case "send_test_notification": {
        // Get user by email
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .select("id, email, full_name")
          .eq("email", data.email)
          .single();
        
        if (profileError) throw new Error(`Usuario no encontrado: ${data.email}`);

        // Insert notification
        const { data: notification, error: notifError } = await supabaseAdmin
          .from("user_notifications")
          .insert({
            user_id: profile.id,
            title: data.title || "🧪 Test del Sistema",
            content: data.content || "Este es un mensaje de prueba.",
            notification_type: data.notification_type || "system",
            priority: data.priority || "normal",
            status: "sent",
            approved_at: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (notifError) throw notifError;
        
        console.log(`Test notification sent to ${profile.email}:`, notification);
        
        return new Response(JSON.stringify({ 
          success: true,
          notification,
          message: `Notificación enviada a ${profile.email}` 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== CRON MANAGEMENT ====================
      case "create_issuer_refresh_cron": {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!anonKey) throw new Error("Missing SUPABASE_ANON_KEY");
        
        // Monthly cron on 1st of each month at 03:00 UTC
        const cronSql = `
          SELECT cron.schedule(
            'refresh-issuer-status-monthly',
            '0 3 1 * *',
            'SELECT net.http_post(url:=''${supabaseUrl}/functions/v1/refresh-issuer-status'', headers:=''{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}''::jsonb, body:=''{"batchSize": 50}''::jsonb)'
          )
        `;
        
        const { data: cronResult, error: cronError } = await supabaseAdmin.rpc('execute_sql', { sql_query: cronSql });
        
        if (cronError) throw cronError;
        
        console.log("Created monthly issuer refresh cron:", cronResult);
        
        return new Response(JSON.stringify({ 
          success: true,
          message: "CRON mensual para actualización de estado de emisores creado (día 1 de cada mes a las 03:00 UTC)"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_cron_jobs": {
        const sql = `SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname`;
        const { data: jobs, error: jobsError } = await supabaseAdmin.rpc('execute_sql', { sql_query: sql });
        
        if (jobsError) throw jobsError;
        
        return new Response(JSON.stringify({ 
          success: true,
          jobs
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== LEAD CONVERSION ====================
      case "invite_user": {
        // Create user from interested lead
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          data.email,
          {
            data: {
              full_name: data.full_name || "",
            },
            redirectTo: data.redirect_to || "https://repindex-v1.lovable.app/dashboard",
          }
        );
        
        if (authError) {
          if (authError.code === "email_exists") {
            return new Response(
              JSON.stringify({ error: "Este email ya está registrado como usuario." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          throw authError;
        }
        
        // Update the auto-created profile
        if (data.company_id) {
          await supabaseAdmin
            .from("user_profiles")
            .update({
              company_id: data.company_id,
              full_name: data.full_name || "",
              is_individual: data.is_individual || false,
            })
            .eq("id", authData.user.id);
        }
        
        // Mark lead as converted
        if (data.lead_id) {
          await supabaseAdmin
            .from("interested_leads")
            .update({
              status: "converted",
              converted_at: new Date().toISOString(),
            })
            .eq("id", data.lead_id);
        }
        
        return new Response(JSON.stringify({ 
          success: true,
          user: authData.user,
          message: "Usuario creado e invitación enviada" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== ISSUER MANAGEMENT ====================
      case "create_issuer": {
        const { data: issuer, error } = await supabaseAdmin
          .from("repindex_root_issuers")
          .insert({
            issuer_id: data.issuer_id,
            issuer_name: data.issuer_name,
            ticker: data.ticker,
            include_terms: data.include_terms,
            exclude_terms: data.exclude_terms || '[]',
            sample_query: data.sample_query,
            status: data.status || 'active',
            ibex_status: data.ibex_status,
            languages: data.languages || ['es', 'en'],
            geography: data.geography || ['ES'],
            cotiza_en_bolsa: data.cotiza_en_bolsa ?? false,
            ibex_family_code: data.ibex_family_code || null,
            ibex_family_category: data.ibex_family_category || null,
            sector_category: data.sector_category || null,
            fase: data.fase || null,
            website: data.website || null,
            notes: data.notes || null,
            verified_competitors: data.verified_competitors || '[]',
          })
          .select()
          .single();
        
        if (error) throw error;
        return new Response(JSON.stringify({ issuer }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_sweep_progress": {
        const { data: progress, error } = await supabaseAdmin
          .from("sweep_progress")
          .insert({
            sweep_id: data.sweep_id,
            fase: data.fase,
            ticker: data.ticker,
            issuer_name: data.issuer_name,
            status: data.status || 'pending',
            models_completed: data.models_completed || 0,
            retry_count: data.retry_count || 0,
          })
          .select()
          .single();
        
        if (error) throw error;
        return new Response(JSON.stringify({ progress }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_cron_trigger": {
        const { data: trigger, error } = await supabaseAdmin
          .from("cron_triggers")
          .insert({
            action: data.action,
            params: data.params || {},
            status: data.status || 'pending',
          })
          .select()
          .single();
        
        if (error) throw error;
        return new Response(JSON.stringify({ trigger }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== PLATFORM SNAPSHOTS ====================
      case "list_snapshots": {
        const { data: snapshots, error } = await supabaseAdmin
          .from("platform_snapshots")
          .select("*")
          .order("snapshot_date", { ascending: false });
        if (error) throw error;
        return new Response(JSON.stringify({ snapshots }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_snapshot": {
        const { data: snapshot, error } = await supabaseAdmin
          .from("platform_snapshots")
          .insert({
            version: data.version,
            title: data.title,
            summary: data.summary,
            detailed_description: data.detailed_description,
            snapshot_type: data.snapshot_type || "feature",
            tags: data.tags || [],
            changes: data.changes || [],
            metrics_at_snapshot: data.metrics_at_snapshot || {},
          })
          .select()
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ snapshot }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_snapshot": {
        const { data: snapshot, error } = await supabaseAdmin
          .from("platform_snapshots")
          .update({
            version: data.version,
            title: data.title,
            summary: data.summary,
            detailed_description: data.detailed_description,
            snapshot_type: data.snapshot_type,
            tags: data.tags,
            changes: data.changes,
            metrics_at_snapshot: data.metrics_at_snapshot,
          })
          .eq("id", data.id)
          .select()
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ snapshot }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_snapshot": {
        const { error } = await supabaseAdmin
          .from("platform_snapshots")
          .delete()
          .eq("id", data.id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== RIXC COMPOSITE ====================
      case "compute_rixc": {
        // Get target week: use provided week_start or find the most recent one
        let targetWeek = data?.week_start;
        
        if (!targetWeek) {
          const { data: latestRun, error: latestErr } = await supabaseAdmin
            .from("rix_runs_v2")
            .select("06_period_from")
            .not("09_rix_score", "is", null)
            .order("06_period_from", { ascending: false })
            .limit(1);
          
          if (latestErr) throw latestErr;
          if (!latestRun || latestRun.length === 0) throw new Error("No hay datos en rix_runs_v2");
          targetWeek = latestRun[0]["06_period_from"];
        }

        // Fetch all runs for the target week
        const { data: runs, error: runsErr } = await supabaseAdmin
          .from("rix_runs_v2")
          .select("05_ticker, 03_target_name, 02_model_name, 09_rix_score")
          .eq("06_period_from", targetWeek)
          .not("09_rix_score", "is", null);
        
        if (runsErr) throw runsErr;

        // Group by ticker
        const byTicker: Record<string, { company_name: string; scores: number[] }> = {};
        for (const run of (runs || [])) {
          const ticker = run["05_ticker"];
          const score = run["09_rix_score"];
          if (!ticker || score == null) continue;
          
          if (!byTicker[ticker]) {
            byTicker[ticker] = { company_name: run["03_target_name"] || ticker, scores: [] };
          }
          byTicker[ticker].scores.push(Number(score));
        }

        // Calculate RIXc for each company with 3+ models
        const results: any[] = [];
        for (const [ticker, { company_name, scores }] of Object.entries(byTicker)) {
          if (scores.length < 3) continue;

          // Median
          const sorted = [...scores].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

          // Standard deviation
          const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
          const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
          const sigma = Math.sqrt(variance);

          // IC = max(0, 100 - (sigma * 100 / 12.5))
          const ic = Math.max(0, 100 - (sigma * 100 / 12.5));

          // Consensus level
          let consensus: string;
          if (sigma < 3) consensus = "Hecho Consolidado";
          else if (sigma < 5) consensus = "Señal Fuerte";
          else if (sigma < 8) consensus = "Divergencia Moderada";
          else if (sigma < 12) consensus = "Narrativa Fragmentada";
          else consensus = "Dato Inestable";

          // Build individual_scores map
          const individualScores: Record<string, number> = {};
          for (const run of (runs || [])) {
            if (run["05_ticker"] === ticker && run["09_rix_score"] != null) {
              individualScores[run["02_model_name"] || "unknown"] = Number(run["09_rix_score"]);
            }
          }

          results.push({
            ticker,
            company_name,
            week_start: targetWeek,
            rixc_score: Math.round(median * 100) / 100,
            sigma_intermodelo: Math.round(sigma * 100) / 100,
            ic_score: Math.round(ic * 100) / 100,
            consensus_level: consensus,
            models_count: scores.length,
            individual_scores: individualScores,
          });
        }

        // Upsert into rix_composite_scores
        if (results.length > 0) {
          const { error: upsertErr } = await supabaseAdmin
            .from("rix_composite_scores")
            .upsert(results, { onConflict: "ticker,week_start" });
          if (upsertErr) throw upsertErr;
        }

        // Summary by consensus
        const summary: Record<string, number> = {};
        for (const r of results) {
          summary[r.consensus_level] = (summary[r.consensus_level] || 0) + 1;
        }

        return new Response(JSON.stringify({
          success: true,
          summary: { total_computed: results.length, by_consensus: summary, week: targetWeek },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_rixc_scores": {
        let query = supabaseAdmin
          .from("rix_composite_scores")
          .select("*")
          .order("week_start", { ascending: false })
          .order("rixc_score", { ascending: false });

        if (data?.week_start) {
          query = query.eq("week_start", data.week_start);
        } else {
          // Get latest week only
          const { data: latest } = await supabaseAdmin
            .from("rix_composite_scores")
            .select("week_start")
            .order("week_start", { ascending: false })
            .limit(1);
          
          if (latest && latest.length > 0) {
            query = query.eq("week_start", latest[0].week_start);
          }
        }

        if (data?.consensus_level) {
          query = query.eq("consensus_level", data.consensus_level);
        }

        const { data: scores, error: scoresErr } = await query.limit(500);
        if (scoresErr) throw scoresErr;

        return new Response(JSON.stringify({ scores: scores || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== RIX PRESS ROLE ====================
      case "list_press_users": {
        const { data: pressRoles, error } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "press");
        
        if (error) throw error;
        return new Response(JSON.stringify({ 
          pressUserIds: (pressRoles || []).map((r: any) => r.user_id) 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "toggle_press_role": {
        const { userId, enabled } = data;
        if (!userId) throw new Error("userId is required");

        if (enabled) {
          // Insert press role (ignore conflict)
          const { error } = await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: userId, role: "press" }, { onConflict: "user_id,role" });
          if (error) throw error;
        } else {
          // Remove press role
          const { error } = await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", userId)
            .eq("role", "press");
          if (error) throw error;
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("Admin API error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
