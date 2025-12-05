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
        // Get user email first
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .select("email")
          .eq("id", data.user_id)
          .single();
        
        if (profileError) throw profileError;

        // Generate a magic link for existing user
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: profile.email,
          options: {
            redirectTo: data.redirect_to || undefined,
          },
        });
        
        if (linkError) throw linkError;

        // Send the email using Supabase's built-in email (or we return the link for manual sending)
        // Since generateLink doesn't send email automatically, we use inviteUserByEmail as fallback
        // But for existing users, we can use signInWithOtp via admin
        const { error: otpError } = await supabaseAdmin.auth.signInWithOtp({
          email: profile.email,
          options: {
            emailRedirectTo: data.redirect_to || undefined,
            shouldCreateUser: false, // Don't create new user, just send OTP
          },
        });
        
        if (otpError) throw otpError;
        
        return new Response(JSON.stringify({ 
          message: "Magic link enviado a " + profile.email 
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
