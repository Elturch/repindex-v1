import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        // Get user profile
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .select("email, full_name")
          .eq("id", data.user_id)
          .single();
        
        if (profileError) throw profileError;

        // Use Supabase's native magic link via inviteUserByEmail (sends email automatically)
        // This bypasses the need for Resend
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          profile.email,
          {
            redirectTo: data.redirect_to || "https://repindex-v1.lovable.app/dashboard",
          }
        );
        
        if (inviteError) {
          // If user already confirmed, use generateLink + native OTP email
          if (inviteError.code === "email_exists" || inviteError.message?.includes("already")) {
            // For existing users, generate OTP link via admin API
            const { error: otpError } = await supabaseAdmin.auth.admin.generateLink({
              type: "magiclink",
              email: profile.email,
              options: {
                redirectTo: data.redirect_to || "https://repindex-v1.lovable.app/dashboard",
              },
            });
            
            if (otpError) throw otpError;
            
            // Use signInWithOtp which sends email via Supabase's built-in system
            const anonClient = createClient(
              Deno.env.get("SUPABASE_URL")!,
              Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!
            );
            
            const { error: signInError } = await anonClient.auth.signInWithOtp({
              email: profile.email,
              options: {
                emailRedirectTo: data.redirect_to || "https://repindex-v1.lovable.app/dashboard",
              },
            });
            
            if (signInError) throw signInError;
          } else {
            throw inviteError;
          }
        }
        
        return new Response(JSON.stringify({ 
          message: "Magic link enviado a " + profile.email 
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
