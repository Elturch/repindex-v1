import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AI Provider fallback system
async function callAIWithFallback(messages: any[], maxTokens: number = 2000): Promise<{ content: string; provider: string }> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const geminiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");

  // Try OpenAI first
  if (openaiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          max_tokens: maxTokens,
          temperature: 0.8,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return {
          content: data.choices[0]?.message?.content || "",
          provider: "openai",
        };
      }
      console.log("OpenAI failed with status:", response.status);
    } catch (e) {
      console.log("OpenAI error, falling back to Gemini:", e);
    }
  }

  // Fallback to Gemini
  if (geminiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${geminiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages,
          max_tokens: maxTokens,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return {
        content: data.choices[0]?.message?.content || "",
        provider: "gemini",
      };
    }
    throw new Error(`Gemini failed: ${response.status}`);
  }

  throw new Error("No AI provider available");
}

// Generate personalized notification using AI
async function generatePersonalizedNotification(
  userContext: {
    userName: string;
    personaName: string;
    personaEmoji: string;
    characteristics: string[];
    totalConversations: number;
    totalDocuments: number;
    lastActivity: string;
    favoriteRoles: string[];
    mentionedCompanies: string[];
  },
  notificationType: string,
  weeklyHighlights?: {
    topMovers: string[];
    newStories: number;
    topCompanies: string[];
  }
): Promise<{ title: string; content: string; priority: string }> {
  const systemPrompt = `Eres el asistente de marketing de RepIndex, una plataforma de análisis de reputación corporativa.
Tu tarea es generar notificaciones push personalizadas y atractivas para usuarios.

REGLAS:
- Mensajes cortos, directos y accionables (máximo 2 líneas)
- Usa emojis relevantes
- Personaliza según el perfil del usuario
- Incluye call-to-action claro
- Tono profesional pero cercano
- En español

TIPOS DE NOTIFICACIÓN:
- welcome: Bienvenida y primeros pasos
- newsroom: Novedades del análisis semanal
- data_refresh: Datos actualizados disponibles
- persona_tip: Consejo personalizado según perfil
- inactivity: Reenganche de usuarios inactivos
- company_alert: Alertas sobre empresas mencionadas
- feature_discovery: Descubrimiento de funcionalidades
- engagement: Fomentar uso recurrente

Responde SOLO en formato JSON:
{
  "title": "título con emoji (max 50 chars)",
  "content": "mensaje personalizado (max 150 chars)",
  "priority": "low|normal|high"
}`;

  const userPrompt = `Genera una notificación de tipo "${notificationType}" para:

PERFIL DEL USUARIO:
- Nombre: ${userContext.userName || "Usuario"}
- Tipo: ${userContext.personaEmoji} ${userContext.personaName}
- Características: ${userContext.characteristics?.join(", ") || "No definidas"}
- Conversaciones totales: ${userContext.totalConversations || 0}
- Documentos generados: ${userContext.totalDocuments || 0}
- Última actividad: ${userContext.lastActivity || "Desconocida"}
- Roles favoritos: ${userContext.favoriteRoles?.join(", ") || "Ninguno"}
- Empresas de interés: ${userContext.mentionedCompanies?.slice(0, 5).join(", ") || "No especificadas"}

${weeklyHighlights ? `
CONTEXTO SEMANAL:
- Top movers: ${weeklyHighlights.topMovers?.join(", ")}
- Nuevas historias publicadas: ${weeklyHighlights.newStories}
- Empresas destacadas: ${weeklyHighlights.topCompanies?.join(", ")}
` : ""}

Genera una notificación relevante y personalizada.`;

  try {
    const { content } = await callAIWithFallback([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 500);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Invalid JSON response");
  } catch (e) {
    console.error("AI notification generation failed:", e);
    // Fallback to static templates
    return getStaticNotification(notificationType, userContext.personaName);
  }
}

// Generate push notification schedule for a user
async function generateUserSchedule(
  userContext: {
    userName: string;
    personaName: string;
    characteristics: string[];
    activityDays: number;
    totalConversations: number;
    lastActivity: string;
  }
): Promise<{
  frequency: string;
  preferredDays: string[];
  notificationTypes: string[];
  maxPerWeek: number;
}> {
  const systemPrompt = `Eres un experto en marketing automation de RepIndex.
Diseña un calendario de notificaciones push óptimo para cada usuario según su perfil y comportamiento.

REGLAS:
- Usuarios activos: máximo 3-4 notificaciones/semana
- Usuarios regulares: 2-3 notificaciones/semana  
- Usuarios casuales: 1-2 notificaciones/semana
- Usuarios inactivos: 1 notificación/semana (reenganche)
- Evitar saturación
- Considerar mejores días (lunes, miércoles son buenos para B2B)
- Priorizar tipos de notificación según perfil

Responde SOLO en formato JSON:
{
  "frequency": "daily|weekly|biweekly",
  "preferredDays": ["monday", "wednesday"],
  "notificationTypes": ["newsroom", "persona_tip"],
  "maxPerWeek": 3
}`;

  const userPrompt = `Diseña calendario de notificaciones para:
- Perfil: ${userContext.personaName}
- Características: ${userContext.characteristics?.join(", ") || "No definidas"}
- Días de actividad: ${userContext.activityDays || 0}
- Conversaciones: ${userContext.totalConversations || 0}
- Última actividad: ${userContext.lastActivity || "Desconocida"}`;

  try {
    const { content } = await callAIWithFallback([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 300);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Invalid JSON");
  } catch (e) {
    console.error("Schedule generation failed:", e);
    return {
      frequency: "weekly",
      preferredDays: ["monday", "thursday"],
      notificationTypes: ["newsroom", "persona_tip"],
      maxPerWeek: 2,
    };
  }
}

// Generate complete inbound marketing plan for all personas
async function generateInboundPlan(personas: any[]): Promise<any> {
  const systemPrompt = `Eres un estratega de inbound marketing para RepIndex, plataforma de análisis de reputación corporativa.
Diseña un plan de marketing automation completo para maximizar engagement y retención.

OBJETIVO: Aumentar uso recurrente de la plataforma

CANALES DISPONIBLES:
- Notificaciones push in-app (chat)
- Alertas de datos actualizados
- Consejos personalizados
- Novedades del newsroom semanal
- Alertas de empresas de interés

MÉTRICAS CLAVE:
- Frecuencia de uso semanal
- Generación de boletines
- Tiempo en plataforma
- Conversiones de casual a power user

Responde en JSON con estructura:
{
  "campaigns": [
    {
      "name": "nombre campaña",
      "target_personas": ["persona_id"],
      "trigger": "weekly|event|inactivity",
      "notification_sequence": [
        {
          "day_offset": 0,
          "type": "newsroom|persona_tip|etc",
          "goal": "objetivo específico"
        }
      ],
      "success_metrics": ["métrica1", "métrica2"]
    }
  ],
  "automation_rules": [
    {
      "trigger": "evento disparador",
      "action": "acción a tomar",
      "target": "a quién aplica"
    }
  ],
  "calendar": {
    "monday": ["tipo_notificacion"],
    "wednesday": ["tipo_notificacion"],
    "friday": ["tipo_notificacion"]
  }
}`;

  const userPrompt = `Diseña plan de inbound marketing para estos perfiles de usuario:

${personas.map(p => `
PERFIL: ${p.emoji} ${p.name}
- Descripción: ${p.description}
- Características: ${p.characteristics?.join(", ")}
- Usuarios en este perfil: ${p.user_count || 0}
- Promedio conversaciones: ${p.avg_conversations || 0}
- Promedio documentos: ${p.avg_documents || 0}
`).join("\n")}

Genera un plan completo con campañas específicas para cada perfil, reglas de automatización y calendario semanal.`;

  try {
    const { content, provider } = await callAIWithFallback([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 4000);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0]);
      plan.generated_by = provider;
      plan.generated_at = new Date().toISOString();
      return plan;
    }
    throw new Error("Invalid JSON");
  } catch (e) {
    console.error("Inbound plan generation failed:", e);
    return getDefaultInboundPlan();
  }
}

// Static fallback notification
function getStaticNotification(type: string, personaName: string): { title: string; content: string; priority: string } {
  const templates: Record<string, { title: string; content: string; priority: string }> = {
    welcome: {
      title: "👋 ¡Bienvenido a RepIndex!",
      content: "Estamos aquí para ayudarte. Pregunta cualquier cosa sobre reputación corporativa.",
      priority: "high",
    },
    newsroom: {
      title: "📰 Nuevo análisis semanal",
      content: "Ya está disponible el análisis reputacional de esta semana. Descubre las tendencias.",
      priority: "normal",
    },
    data_refresh: {
      title: "🔄 Datos actualizados",
      content: "Los RIX Scores han sido actualizados. Consulta las variaciones en el dashboard.",
      priority: "normal",
    },
    persona_tip: {
      title: "💡 Consejo personalizado",
      content: "Prueba el enriquecimiento por rol profesional para insights especializados.",
      priority: "low",
    },
    inactivity: {
      title: "🔔 Te echamos de menos",
      content: "Han pasado algunos días desde tu última visita. ¡Hay novedades esperándote!",
      priority: "high",
    },
    company_alert: {
      title: "🏢 Alerta de empresa",
      content: "Una de las empresas que sigues tiene actualizaciones importantes.",
      priority: "high",
    },
    feature_discovery: {
      title: "🚀 Nueva funcionalidad",
      content: "Descubre las nuevas herramientas disponibles para potenciar tu análisis.",
      priority: "normal",
    },
    engagement: {
      title: "📊 Tu resumen semanal",
      content: "Revisa tu actividad y descubre qué empresas han cambiado más esta semana.",
      priority: "normal",
    },
  };

  return templates[type] || templates.persona_tip;
}

// Default inbound plan fallback
function getDefaultInboundPlan() {
  return {
    campaigns: [
      {
        name: "Onboarding Nuevos Usuarios",
        target_personas: ["casual_user"],
        trigger: "event",
        notification_sequence: [
          { day_offset: 0, type: "welcome", goal: "Primer contacto" },
          { day_offset: 2, type: "persona_tip", goal: "Enseñar funcionalidad básica" },
          { day_offset: 5, type: "feature_discovery", goal: "Descubrir boletines" },
        ],
        success_metrics: ["first_query", "first_bulletin"],
      },
      {
        name: "Engagement Semanal",
        target_personas: ["regular_user", "power_user"],
        trigger: "weekly",
        notification_sequence: [
          { day_offset: 0, type: "newsroom", goal: "Informar novedades" },
          { day_offset: 3, type: "persona_tip", goal: "Profundizar uso" },
        ],
        success_metrics: ["weekly_sessions", "documents_generated"],
      },
      {
        name: "Reenganche Inactivos",
        target_personas: ["dormant_user"],
        trigger: "inactivity",
        notification_sequence: [
          { day_offset: 0, type: "inactivity", goal: "Recuperar usuario" },
          { day_offset: 7, type: "newsroom", goal: "Mostrar valor perdido" },
        ],
        success_metrics: ["reactivation_rate"],
      },
    ],
    automation_rules: [
      { trigger: "7_days_inactive", action: "send_inactivity_notification", target: "all_users" },
      { trigger: "new_weekly_data", action: "send_newsroom_notification", target: "active_users" },
      { trigger: "company_rix_change_5pct", action: "send_company_alert", target: "users_following_company" },
    ],
    calendar: {
      monday: ["newsroom"],
      wednesday: ["persona_tip"],
      friday: ["engagement"],
    },
    generated_by: "fallback",
    generated_at: new Date().toISOString(),
  };
}

// Get weekly highlights from database
async function getWeeklyHighlights(supabase: any): Promise<any> {
  try {
    // Get top movers
    const { data: trends } = await supabase
      .from("rix_trends")
      .select("company_name, rix_score")
      .order("batch_week", { ascending: false })
      .limit(50);

    // Get latest news count
    const { data: news } = await supabase
      .from("weekly_news")
      .select("id, main_headline, stories")
      .order("week_start", { ascending: false })
      .limit(1)
      .single();

    const topCompanies = trends?.slice(0, 5).map((t: any) => t.company_name) || [];
    const storiesCount = news?.stories?.length || 0;

    return {
      topMovers: topCompanies,
      newStories: storiesCount,
      topCompanies: topCompanies,
    };
  } catch (e) {
    console.error("Failed to get weekly highlights:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { 
      action, 
      campaignId, 
      targetPersonas, 
      customNotification, 
      userId, 
      notificationId,
      // DM specific params
      dmPayload,
      targetingMode,
      targetUserIds,
      targetCompanies,
    } = body;

    // ACTION: Generate AI-powered notifications for all users
    if (action === "generate_ai_notifications") {
      console.log("Starting AI-powered notification generation...");

      // Get latest analysis batch
      const { data: latestBatch } = await supabase
        .from("profile_analysis_batches")
        .select("id")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .single();

      if (!latestBatch) {
        return new Response(
          JSON.stringify({ error: "No hay análisis de perfiles. Ejecuta primero el análisis." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get user snapshots with persona info
      const { data: userSnapshots } = await supabase
        .from("user_activity_snapshots")
        .select(`
          user_id, user_email, user_name,
          total_conversations, total_documents, total_enrichments,
          last_activity, activity_days,
          favorite_roles, mentioned_companies,
          persona_id,
          user_personas (id, name, emoji, characteristics)
        `)
        .eq("analysis_batch_id", latestBatch.id);

      if (!userSnapshots?.length) {
        return new Response(
          JSON.stringify({ error: "No hay usuarios analizados." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get weekly highlights
      const weeklyHighlights = await getWeeklyHighlights(supabase);

      // Get user preferences
      const { data: preferences } = await supabase
        .from("user_notification_preferences")
        .select("*");
      const prefMap = new Map(preferences?.map((p: any) => [p.user_id, p]) || []);

      const targetPersonaSet = new Set(targetPersonas || []);
      const notifications: any[] = [];
      const schedules: any[] = [];

      // Determine notification types based on user profile
      const notificationTypesForPersona: Record<string, string[]> = {
        "Usuario Intensivo": ["newsroom", "persona_tip", "feature_discovery"],
        "Usuario Regular": ["newsroom", "persona_tip", "data_refresh"],
        "Usuario Casual": ["welcome", "persona_tip", "engagement"],
        "Usuario Inactivo": ["inactivity", "newsroom"],
        "Generador de Informes": ["newsroom", "persona_tip", "company_alert"],
      };

      for (const snapshot of userSnapshots) {
        const persona = snapshot.user_personas as any;
        const personaName = persona?.name || "Usuario";

        // Filter by target personas if specified
        if (targetPersonas?.length > 0 && !targetPersonaSet.has(persona?.id)) {
          continue;
        }

        // Check user preferences
        const userPrefs = prefMap.get(snapshot.user_id);

        // Generate user schedule
        const schedule = await generateUserSchedule({
          userName: snapshot.user_name || "Usuario",
          personaName,
          characteristics: persona?.characteristics || [],
          activityDays: snapshot.activity_days || 0,
          totalConversations: snapshot.total_conversations || 0,
          lastActivity: snapshot.last_activity || "",
        });

        schedules.push({
          user_id: snapshot.user_id,
          schedule,
        });

        // Get notification types for this persona
        const notifTypes = notificationTypesForPersona[personaName] || ["persona_tip", "newsroom"];
        
        // Generate 1-2 AI-powered notifications
        const typesToSend = notifTypes.slice(0, Math.min(2, schedule.maxPerWeek));

        for (const notifType of typesToSend) {
          // Check preferences
          if (userPrefs) {
            if (notifType === "persona_tip" && !userPrefs.enable_persona_tips) continue;
            if (notifType === "newsroom" && !userPrefs.enable_newsroom_alerts) continue;
            if (notifType === "data_refresh" && !userPrefs.enable_data_refresh_alerts) continue;
          }

          // Generate personalized notification with AI
          const notif = await generatePersonalizedNotification(
            {
              userName: snapshot.user_name || "Usuario",
              personaName,
              personaEmoji: persona?.emoji || "👤",
              characteristics: persona?.characteristics || [],
              totalConversations: snapshot.total_conversations || 0,
              totalDocuments: snapshot.total_documents || 0,
              lastActivity: snapshot.last_activity || "",
              favoriteRoles: snapshot.favorite_roles || [],
              mentionedCompanies: snapshot.mentioned_companies || [],
            },
            notifType,
            weeklyHighlights
          );

          notifications.push({
            user_id: snapshot.user_id,
            notification_type: notifType,
            title: notif.title,
            content: notif.content,
            priority: notif.priority,
            persona_id: persona?.id || null,
            metadata: {
              persona_name: personaName,
              generated_by: "ai",
              schedule: schedule,
              campaign_id: campaignId || null,
              generated_at: new Date().toISOString(),
            },
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      // Insert notifications
      if (notifications.length > 0) {
        const { error: insertError } = await supabase
          .from("user_notifications")
          .insert(notifications);

        if (insertError) {
          console.error("Insert error:", insertError);
          throw insertError;
        }

        // Track analytics
        const analyticsEntries = notifications.map(n => ({
          campaign_id: campaignId || null,
          user_id: n.user_id,
          event_type: "delivered",
          event_data: { 
            persona_id: n.persona_id,
            generated_by: "ai",
          },
        }));

        await supabase.from("notification_analytics").insert(analyticsEntries);
      }

      return new Response(
        JSON.stringify({
          success: true,
          notificationsSent: notifications.length,
          usersReached: new Set(notifications.map(n => n.user_id)).size,
          schedules: schedules.length,
          byPersona: Object.entries(
            notifications.reduce((acc: Record<string, number>, n) => {
              const key = n.metadata.persona_name || "Sin perfil";
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {})
          ).map(([name, count]) => ({ name, count })),
          generatedBy: "ai",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Generate complete inbound marketing plan
    if (action === "generate_inbound_plan") {
      console.log("Generating AI-powered inbound marketing plan...");

      // Get all personas from latest batch
      const { data: latestBatch } = await supabase
        .from("profile_analysis_batches")
        .select("id")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .single();

      if (!latestBatch) {
        return new Response(
          JSON.stringify({ error: "No hay análisis de perfiles disponible." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: personas } = await supabase
        .from("user_personas")
        .select("*")
        .eq("analysis_batch_id", latestBatch.id);

      if (!personas?.length) {
        return new Response(
          JSON.stringify({ error: "No hay personas definidas." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const plan = await generateInboundPlan(personas);

      return new Response(
        JSON.stringify({
          success: true,
          plan,
          personasAnalyzed: personas.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Generate static notifications (original behavior)
    if (action === "generate_for_all") {
      const { data: latestBatch } = await supabase
        .from("profile_analysis_batches")
        .select("id")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .single();

      if (!latestBatch) {
        return new Response(
          JSON.stringify({ error: "No hay análisis de perfiles disponible." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: userSnapshots } = await supabase
        .from("user_activity_snapshots")
        .select(`
          user_id, user_email, user_name,
          persona_id,
          user_personas (id, name, emoji)
        `)
        .eq("analysis_batch_id", latestBatch.id);

      const { data: preferences } = await supabase
        .from("user_notification_preferences")
        .select("user_id, enable_persona_tips, enable_newsroom_alerts, enable_data_refresh_alerts");

      const prefMap = new Map(preferences?.map(p => [p.user_id, p]) || []);
      const notifications: any[] = [];
      const targetPersonaSet = new Set(targetPersonas || []);

      for (const snapshot of userSnapshots || []) {
        const persona = snapshot.user_personas as any;
        const personaName = persona?.name || "Usuario";

        if (targetPersonas?.length > 0 && !targetPersonaSet.has(persona?.id)) {
          continue;
        }

        const userPrefs = prefMap.get(snapshot.user_id);
        const notifTypes = ["newsroom", "persona_tip"];
        
        for (const type of notifTypes.slice(0, 2)) {
          if (userPrefs) {
            if (type === "persona_tip" && !userPrefs.enable_persona_tips) continue;
            if (type === "newsroom" && !userPrefs.enable_newsroom_alerts) continue;
          }

          const notif = getStaticNotification(type, personaName);

          notifications.push({
            user_id: snapshot.user_id,
            notification_type: type,
            title: notif.title,
            content: notif.content,
            priority: notif.priority,
            persona_id: persona?.id || null,
            metadata: {
              persona_name: personaName,
              generated_by: "static",
              campaign_id: campaignId || null,
              generated_at: new Date().toISOString(),
            },
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      if (notifications.length > 0) {
        const { error: insertError } = await supabase
          .from("user_notifications")
          .insert(notifications);
        if (insertError) throw insertError;

        await supabase.from("notification_analytics").insert(
          notifications.map(n => ({
            campaign_id: campaignId || null,
            user_id: n.user_id,
            event_type: "delivered",
            event_data: { persona_id: n.persona_id },
          }))
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          notificationsSent: notifications.length,
          usersReached: new Set(notifications.map(n => n.user_id)).size,
          generatedBy: "static",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Send custom notification with AI enhancement
    if (action === "send_custom_ai") {
      if (!customNotification?.prompt) {
        return new Response(
          JSON.stringify({ error: "Se requiere prompt para generar notificación" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const systemPrompt = `Genera una notificación push para RepIndex basada en el prompt del usuario.
Responde en JSON: {"title": "...", "content": "...", "priority": "low|normal|high"}`;

      const { content } = await callAIWithFallback([
        { role: "system", content: systemPrompt },
        { role: "user", content: customNotification.prompt },
      ], 500);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return new Response(
          JSON.stringify({ error: "Error generando notificación" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const generatedNotif = JSON.parse(jsonMatch[0]);

      let targetUserIds: string[] = [];
      if (userId) {
        targetUserIds = [userId];
      } else if (targetPersonas?.length > 0) {
        const { data: snapshots } = await supabase
          .from("user_activity_snapshots")
          .select("user_id, persona_id")
          .in("persona_id", targetPersonas);
        targetUserIds = [...new Set(snapshots?.map(s => s.user_id) || [])];
      } else {
        const { data: users } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("is_active", true);
        targetUserIds = users?.map(u => u.id) || [];
      }

      const notifications = targetUserIds.map(uid => ({
        user_id: uid,
        notification_type: customNotification.type || "persona_tip",
        title: generatedNotif.title,
        content: generatedNotif.content,
        priority: generatedNotif.priority,
        metadata: {
          generated_by: "ai",
          prompt: customNotification.prompt,
          campaign_id: campaignId,
          generated_at: new Date().toISOString(),
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }));

      if (notifications.length > 0) {
        const { error } = await supabase.from("user_notifications").insert(notifications);
        if (error) throw error;
      }

      return new Response(
        JSON.stringify({
          success: true,
          notificationsSent: notifications.length,
          generatedNotification: generatedNotif,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Send custom notification (static)
    if (action === "send_custom") {
      if (!customNotification) {
        return new Response(
          JSON.stringify({ error: "Se requiere customNotification" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let targetUserIds: string[] = [];
      if (userId) {
        targetUserIds = [userId];
      } else if (targetPersonas?.length > 0) {
        const { data: snapshots } = await supabase
          .from("user_activity_snapshots")
          .select("user_id, persona_id")
          .in("persona_id", targetPersonas);
        targetUserIds = [...new Set(snapshots?.map(s => s.user_id) || [])];
      } else {
        const { data: users } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("is_active", true);
        targetUserIds = users?.map(u => u.id) || [];
      }

      const notifications = targetUserIds.map(uid => ({
        user_id: uid,
        notification_type: customNotification.type || "persona_tip",
        title: customNotification.title,
        content: customNotification.content,
        priority: customNotification.priority || "normal",
        metadata: {
          custom: true,
          campaign_id: campaignId,
          generated_at: new Date().toISOString(),
        },
        expires_at: customNotification.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }));

      if (notifications.length > 0) {
        const { error } = await supabase.from("user_notifications").insert(notifications);
        if (error) throw error;
      }

      return new Response(
        JSON.stringify({
          success: true,
          notificationsSent: notifications.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Get user notifications
    if (action === "get_user_notifications") {
      const { data: notifications } = await supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", userId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(20);

      return new Response(
        JSON.stringify({ notifications: notifications || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Mark notification as read
    if (action === "mark_read") {
      const { error } = await supabase
        .from("user_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId);

      if (error) throw error;

      await supabase.from("notification_analytics").insert({
        notification_id: notificationId,
        user_id: userId,
        event_type: "read",
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Dismiss notification
    if (action === "dismiss") {
      const { error } = await supabase
        .from("user_notifications")
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq("id", notificationId);

      if (error) throw error;

      await supabase.from("notification_analytics").insert({
        notification_id: notificationId,
        user_id: userId,
        event_type: "dismissed",
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Get campaign stats
    if (action === "get_campaign_stats") {
      const { data: campaigns } = await supabase
        .from("marketing_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: analytics } = await supabase
        .from("notification_analytics")
        .select("campaign_id, event_type")
        .not("campaign_id", "is", null);

      const statsMap: Record<string, { delivered: number; read: number; clicked: number; dismissed: number }> = {};
      for (const a of analytics || []) {
        if (!statsMap[a.campaign_id]) {
          statsMap[a.campaign_id] = { delivered: 0, read: 0, clicked: 0, dismissed: 0 };
        }
        if (a.event_type === "delivered") statsMap[a.campaign_id].delivered++;
        if (a.event_type === "read") statsMap[a.campaign_id].read++;
        if (a.event_type === "clicked") statsMap[a.campaign_id].clicked++;
        if (a.event_type === "dismissed") statsMap[a.campaign_id].dismissed++;
      }

      return new Response(
        JSON.stringify({
          campaigns: (campaigns || []).map(c => ({
            ...c,
            stats: statsMap[c.id] || { delivered: 0, read: 0, clicked: 0, dismissed: 0 },
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Send Direct Message (DM) - flexible targeting
    if (action === "send_dm" || action === "send_dm_ai") {
      console.log("Processing DM with targeting mode:", targetingMode);
      
      if (!dmPayload?.title || !dmPayload?.content) {
        return new Response(
          JSON.stringify({ error: "Se requiere título y contenido del mensaje" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let finalUserIds: string[] = [];

      // Determine target users based on targeting mode
      if (targetingMode === "individual" || targetingMode === "custom") {
        finalUserIds = targetUserIds || [];
      } else if (targetingMode === "company") {
        // Get all users from selected companies
        if (targetCompanies?.length > 0) {
          const { data: companyUsers } = await supabase
            .from("user_profiles")
            .select("id")
            .in("company_id", targetCompanies)
            .eq("is_active", true);
          finalUserIds = companyUsers?.map((u: any) => u.id) || [];
        }
      } else if (targetingMode === "persona") {
        // Get users by persona from latest analysis
        if (targetPersonas?.length > 0) {
          console.log("Target personas received:", targetPersonas);
          
          const { data: latestBatch } = await supabase
            .from("profile_analysis_batches")
            .select("id")
            .order("analyzed_at", { ascending: false })
            .limit(1)
            .single();

          if (latestBatch) {
            console.log("Latest batch ID:", latestBatch.id);
            
            // Get all personas from this batch to map internal IDs to real UUIDs
            const { data: allPersonas } = await supabase
              .from("user_personas")
              .select("id, name")
              .eq("analysis_batch_id", latestBatch.id);
            
            console.log("Available personas in DB:", allPersonas);
            
            // Map internal persona IDs to real UUIDs
            const personaNameMap: Record<string, string> = {
              "inactive_users": "Usuarios Inactivos",
              "casual_user": "Usuario Casual", 
              "executive_user": "Ejecutivo Activo",
              "power_user": "Usuario Avanzado",
              "analyst": "Analista",
            };
            
            const realPersonaIds: string[] = [];
            for (const targetId of targetPersonas) {
              // Check if already a UUID
              const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
              
              if (isUUID) {
                realPersonaIds.push(targetId);
              } else {
                // Map internal ID to persona name, then find UUID
                const mappedName = personaNameMap[targetId];
                const matchingPersona = allPersonas?.find((p: any) => 
                  p.name === mappedName || 
                  p.name.toLowerCase().includes(targetId.replace(/_/g, " ").toLowerCase())
                );
                if (matchingPersona) {
                  realPersonaIds.push(matchingPersona.id);
                }
              }
            }
            
            console.log("Resolved persona IDs:", realPersonaIds);
            
            if (realPersonaIds.length > 0) {
              const { data: snapshots } = await supabase
                .from("user_activity_snapshots")
                .select("user_id, persona_id")
                .eq("analysis_batch_id", latestBatch.id)
                .in("persona_id", realPersonaIds);
              
              console.log("Found snapshots:", snapshots?.length || 0);
              finalUserIds = [...new Set(snapshots?.map((s: any) => s.user_id) || [])];
            }
          }
        }
      } else if (targetingMode === "all") {
        // Get all active users
        const { data: allUsers } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("is_active", true);
        finalUserIds = allUsers?.map((u: any) => u.id) || [];
      } else if (targetUserIds?.length > 0) {
        // Fallback to explicit user IDs
        finalUserIds = targetUserIds;
      }

      if (finalUserIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "No se encontraron destinatarios para el mensaje" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deduplicate
      finalUserIds = [...new Set(finalUserIds)];

      let finalTitle = dmPayload.title;
      let finalContent = dmPayload.content;
      let finalPriority = dmPayload.priority || "normal";
      let generatedBy = "manual";

      // If AI generation requested, enhance the message
      if (action === "send_dm_ai" && dmPayload.aiPrompt) {
        const systemPrompt = `Eres el asistente de comunicación de RepIndex. 
Genera un mensaje profesional pero cercano basado en el prompt.
El mensaje debe ser relevante para usuarios de una plataforma de análisis de reputación corporativa.

Responde SOLO en JSON:
{
  "title": "título con emoji apropiado (max 60 chars)",
  "content": "mensaje mejorado y personalizado (max 300 chars)",
  "priority": "${finalPriority}"
}`;

        try {
          const { content: aiResponse, provider } = await callAIWithFallback([
            { role: "system", content: systemPrompt },
            { role: "user", content: `Prompt original: ${dmPayload.aiPrompt}\n\nTítulo base: ${dmPayload.title}\nContenido base: ${dmPayload.content}` },
          ], 500);

          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const enhanced = JSON.parse(jsonMatch[0]);
            finalTitle = enhanced.title || finalTitle;
            finalContent = enhanced.content || finalContent;
            finalPriority = enhanced.priority || finalPriority;
            generatedBy = `ai_${provider}`;
          }
        } catch (e) {
          console.error("AI enhancement failed, using original message:", e);
          generatedBy = "manual_ai_fallback";
        }
      }

      // Create notifications for all target users
      const notifications = finalUserIds.map((uid: string) => ({
        user_id: uid,
        notification_type: dmPayload.type || "announcement",
        title: finalTitle,
        content: finalContent,
        priority: finalPriority,
        metadata: {
          dm: true,
          targeting_mode: targetingMode,
          generated_by: generatedBy,
          sent_at: new Date().toISOString(),
          ai_prompt: dmPayload.aiPrompt || null,
        },
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days expiry
      }));

      // Insert notifications in batches to avoid timeout
      const batchSize = 100;
      let insertedCount = 0;
      
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from("user_notifications")
          .insert(batch);
        
        if (insertError) {
          console.error("DM insert error:", insertError);
          throw insertError;
        }
        insertedCount += batch.length;
      }

      // Track analytics
      const analyticsEntries = finalUserIds.map((uid: string) => ({
        user_id: uid,
        event_type: "dm_delivered",
        event_data: {
          targeting_mode: targetingMode,
          generated_by: generatedBy,
        },
      }));

      // Insert analytics in batches
      for (let i = 0; i < analyticsEntries.length; i += batchSize) {
        const batch = analyticsEntries.slice(i, i + batchSize);
        await supabase.from("notification_analytics").insert(batch);
      }

      console.log(`DM sent successfully to ${insertedCount} users`);

      return new Response(
        JSON.stringify({
          success: true,
          notificationsSent: insertedCount,
          usersReached: finalUserIds.length,
          targetingMode,
          generatedBy,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción no reconocida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in marketing notifications:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
