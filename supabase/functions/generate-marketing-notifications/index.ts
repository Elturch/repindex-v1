import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// FATIGUE LIMITS BY LIFECYCLE STAGE
// ============================================
const FATIGUE_LIMITS: Record<string, { perDay: number; perWeek: number; perMonth: number; minHoursBetween: number }> = {
  'power_user': { perDay: 1, perWeek: 3, perMonth: 8, minHoursBetween: 24 },
  'engaged': { perDay: 1, perWeek: 4, perMonth: 12, minHoursBetween: 24 },
  'active': { perDay: 1, perWeek: 3, perMonth: 10, minHoursBetween: 48 },
  'new': { perDay: 1, perWeek: 2, perMonth: 6, minHoursBetween: 48 },
  'at_risk': { perDay: 1, perWeek: 2, perMonth: 4, minHoursBetween: 72 },
  'churned': { perDay: 0, perWeek: 1, perMonth: 2, minHoursBetween: 168 }, // 7 days
};

// ============================================
// DECISION ENGINE: Should we send notification?
// ============================================
interface EngagementScore {
  user_id: string;
  engagement_score: number;
  lifecycle_stage: string;
  notifications_sent_24h: number;
  notifications_sent_7d: number;
  notifications_sent_30d: number;
  last_notification_at: string | null;
  last_notification_type: string | null;
  ignored_count_30d: number;
  weight_newsroom: number;
  weight_persona_tip: number;
  weight_data_refresh: number;
  weight_inactivity: number;
  weight_company_alert: number;
  weight_feature_discovery: number;
  weight_engagement: number;
  recent_notification_types: string[];
}

function shouldSendNotification(
  engagementScore: EngagementScore
): { eligible: boolean; reason: string } {
  const limits = FATIGUE_LIMITS[engagementScore.lifecycle_stage] || FATIGUE_LIMITS['active'];

  // Check daily limit
  if (engagementScore.notifications_sent_24h >= limits.perDay) {
    return { eligible: false, reason: 'daily_limit_reached' };
  }

  // Check weekly limit
  if (engagementScore.notifications_sent_7d >= limits.perWeek) {
    return { eligible: false, reason: 'weekly_limit_reached' };
  }

  // Check monthly limit
  if (engagementScore.notifications_sent_30d >= limits.perMonth) {
    return { eligible: false, reason: 'monthly_limit_reached' };
  }

  // Check minimum time between notifications
  if (engagementScore.last_notification_at) {
    const hoursSince = (Date.now() - new Date(engagementScore.last_notification_at).getTime()) / (1000 * 60 * 60);
    if (hoursSince < limits.minHoursBetween) {
      return { eligible: false, reason: 'too_soon' };
    }
  }

  // Check if user ignores too many notifications (reduce frequency)
  const totalNotifs = engagementScore.notifications_sent_30d || 0;
  const ignoreRate = totalNotifs > 0 ? engagementScore.ignored_count_30d / totalNotifs : 0;
  if (ignoreRate > 0.7 && engagementScore.notifications_sent_7d >= 1) {
    return { eligible: false, reason: 'high_ignore_rate' };
  }

  return { eligible: true, reason: 'eligible' };
}

// ============================================
// SELECT BEST NOTIFICATION TYPE
// ============================================
function selectNotificationType(
  engagementScore: EngagementScore
): string {
  const weights: Record<string, number> = {
    newsroom: engagementScore.weight_newsroom || 0,
    persona_tip: engagementScore.weight_persona_tip || 0,
    data_refresh: engagementScore.weight_data_refresh || 0,
    inactivity: engagementScore.weight_inactivity || 0,
    company_alert: engagementScore.weight_company_alert || 0,
    feature_discovery: engagementScore.weight_feature_discovery || 0,
    engagement: engagementScore.weight_engagement || 0,
  };

  // Sort types by weight
  const sortedTypes = Object.entries(weights)
    .filter(([_, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1]);

  // Avoid repeating same type from last 7 days
  const recentTypes = engagementScore.recent_notification_types || [];
  
  for (const [type] of sortedTypes) {
    if (!recentTypes.includes(type)) {
      return type;
    }
  }

  // If all were used recently, use the highest weighted
  return sortedTypes[0]?.[0] || 'newsroom';
}

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
    engagementScore: number;
    lifecycleStage: string;
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
- Personaliza según el perfil del usuario y su engagement score
- Incluye call-to-action claro
- Tono profesional pero cercano
- En español

TIPOS DE NOTIFICACIÓN:
- welcome: Bienvenida y primeros pasos
- newsroom: Novedades del análisis semanal
- data_refresh: Datos actualizados disponibles
- persona_tip: Consejo personalizado según perfil
- inactivity: Reenganche de usuarios inactivos (tono muy cuidadoso, no agresivo)
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
- Engagement Score: ${userContext.engagementScore}/100
- Lifecycle Stage: ${userContext.lifecycleStage}
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

Genera una notificación relevante y personalizada para su nivel de engagement.`;

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
    return getStaticNotification(notificationType, userContext.personaName);
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

// Get weekly highlights from database
async function getWeeklyHighlights(supabase: any): Promise<any> {
  try {
    const { data: trends } = await supabase
      .from("rix_trends")
      .select("company_name, rix_score")
      .order("batch_week", { ascending: false })
      .limit(50);

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

// Update fatigue counters after sending notification
async function updateFatigueCounters(
  supabase: any,
  userId: string,
  notificationType: string
): Promise<void> {
  try {
    // Get current engagement score
    const { data: current } = await supabase
      .from("user_engagement_scores")
      .select("notifications_sent_24h, notifications_sent_7d, notifications_sent_30d, recent_notification_types")
      .eq("user_id", userId)
      .single();

    if (!current) return;

    const recentTypes = current.recent_notification_types || [];
    recentTypes.push(notificationType);
    
    // Keep only last 5 types
    const trimmedTypes = recentTypes.slice(-5);

    await supabase
      .from("user_engagement_scores")
      .update({
        notifications_sent_24h: (current.notifications_sent_24h || 0) + 1,
        notifications_sent_7d: (current.notifications_sent_7d || 0) + 1,
        notifications_sent_30d: (current.notifications_sent_30d || 0) + 1,
        last_notification_at: new Date().toISOString(),
        last_notification_type: notificationType,
        recent_notification_types: trimmedTypes,
      })
      .eq("user_id", userId);
  } catch (e) {
    console.error("Failed to update fatigue counters:", e);
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
      dmPayload,
      targetingMode,
      targetUserIds,
      targetCompanies,
    } = body;

    // ============================================
    // ACTION: CRON - Weighted Decision Engine Notifications
    // ============================================
    if (action === "cron_weighted_notifications") {
      console.log("Starting CRON weighted decision engine...");

      // Get all engagement scores
      const { data: engagementScores, error: engError } = await supabase
        .from("user_engagement_scores")
        .select("*");

      if (engError) throw engError;

      if (!engagementScores?.length) {
        console.log("No engagement scores found. Run analyze-user-profiles first.");
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "No engagement scores available",
            notificationsSent: 0 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get user activity snapshots for context
      const { data: latestBatch } = await supabase
        .from("profile_analysis_batches")
        .select("id")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .single();

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
        .eq("analysis_batch_id", latestBatch?.id);

      const snapshotMap = new Map(userSnapshots?.map((s: any) => [s.user_id, s]) || []);

      // Get weekly highlights
      const weeklyHighlights = await getWeeklyHighlights(supabase);

      // Get user preferences
      const { data: preferences } = await supabase
        .from("user_notification_preferences")
        .select("*");
      const prefMap = new Map(preferences?.map((p: any) => [p.user_id, p]) || []);

      const notifications: any[] = [];
      const skipped: { userId: string; reason: string }[] = [];

      for (const engScore of engagementScores) {
        // Step 1: Check eligibility (fatigue management)
        const eligibility = shouldSendNotification(engScore);
        
        if (!eligibility.eligible) {
          skipped.push({ userId: engScore.user_id, reason: eligibility.reason });
          continue;
        }

        // Step 2: Select optimal notification type based on weights
        const notificationType = selectNotificationType(engScore);

        // Step 3: Check user preferences
        const userPrefs = prefMap.get(engScore.user_id);
        if (userPrefs) {
          if (notificationType === "persona_tip" && !userPrefs.enable_persona_tips) continue;
          if (notificationType === "newsroom" && !userPrefs.enable_newsroom_alerts) continue;
          if (notificationType === "data_refresh" && !userPrefs.enable_data_refresh_alerts) continue;
          if (notificationType === "inactivity" && !userPrefs.enable_inactivity_reminders) continue;
          if (notificationType === "company_alert" && !userPrefs.enable_company_alerts) continue;
        }

        // Step 4: Get user context for personalization
        const snapshot = snapshotMap.get(engScore.user_id);
        const persona = snapshot?.user_personas as any;

        // Step 5: Generate personalized notification with AI
        const notif = await generatePersonalizedNotification(
          {
            userName: snapshot?.user_name || "Usuario",
            personaName: persona?.name || "Usuario",
            personaEmoji: persona?.emoji || "👤",
            characteristics: persona?.characteristics || [],
            totalConversations: snapshot?.total_conversations || 0,
            totalDocuments: snapshot?.total_documents || 0,
            lastActivity: snapshot?.last_activity || "",
            favoriteRoles: snapshot?.favorite_roles || [],
            mentionedCompanies: snapshot?.mentioned_companies || [],
            engagementScore: engScore.engagement_score,
            lifecycleStage: engScore.lifecycle_stage,
          },
          notificationType,
          weeklyHighlights
        );

        notifications.push({
          user_id: engScore.user_id,
          notification_type: notificationType,
          title: notif.title,
          content: notif.content,
          priority: notif.priority,
          persona_id: persona?.id || null,
          metadata: {
            persona_name: persona?.name || null,
            engagement_score: engScore.engagement_score,
            lifecycle_stage: engScore.lifecycle_stage,
            generated_by: "weighted_decision_engine",
            notification_weights: {
              newsroom: engScore.weight_newsroom,
              persona_tip: engScore.weight_persona_tip,
              company_alert: engScore.weight_company_alert,
            },
            generated_at: new Date().toISOString(),
          },
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
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

        // Update fatigue counters for each notified user
        for (const notif of notifications) {
          await updateFatigueCounters(supabase, notif.user_id, notif.notification_type);
        }

        // Track analytics
        const analyticsEntries = notifications.map(n => ({
          campaign_id: null,
          user_id: n.user_id,
          event_type: "cron_delivered",
          event_data: { 
            engagement_score: n.metadata.engagement_score,
            lifecycle_stage: n.metadata.lifecycle_stage,
            notification_type: n.notification_type,
          },
        }));

        await supabase.from("notification_analytics").insert(analyticsEntries);
      }

      // Calculate summary by lifecycle stage
      const byLifecycle = notifications.reduce((acc: Record<string, number>, n) => {
        const stage = n.metadata.lifecycle_stage || "unknown";
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
      }, {});

      const byType = notifications.reduce((acc: Record<string, number>, n) => {
        acc[n.notification_type] = (acc[n.notification_type] || 0) + 1;
        return acc;
      }, {});

      console.log(`CRON complete: ${notifications.length} sent, ${skipped.length} skipped`);

      return new Response(
        JSON.stringify({
          success: true,
          notificationsSent: notifications.length,
          usersSkipped: skipped.length,
          skipReasons: skipped.reduce((acc: Record<string, number>, s) => {
            acc[s.reason] = (acc[s.reason] || 0) + 1;
            return acc;
          }, {}),
          byLifecycleStage: byLifecycle,
          byNotificationType: byType,
          generatedBy: "weighted_decision_engine",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Generate AI-powered notifications for all users (legacy)
    if (action === "generate_ai_notifications") {
      console.log("Starting AI-powered notification generation...");

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

      // Get engagement scores
      const { data: engagementScores } = await supabase
        .from("user_engagement_scores")
        .select("user_id, engagement_score, lifecycle_stage");
      
      const engMap = new Map(engagementScores?.map((e: any) => [e.user_id, e]) || []);

      const weeklyHighlights = await getWeeklyHighlights(supabase);

      const { data: preferences } = await supabase
        .from("user_notification_preferences")
        .select("*");
      const prefMap = new Map(preferences?.map((p: any) => [p.user_id, p]) || []);

      const targetPersonaSet = new Set(targetPersonas || []);
      const notifications: any[] = [];

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
        const eng = engMap.get(snapshot.user_id);

        if (targetPersonas?.length > 0 && !targetPersonaSet.has(persona?.id)) {
          continue;
        }

        const userPrefs = prefMap.get(snapshot.user_id);
        const notifTypes = notificationTypesForPersona[personaName] || ["persona_tip", "newsroom"];
        const typesToSend = notifTypes.slice(0, 2);

        for (const notifType of typesToSend) {
          if (userPrefs) {
            if (notifType === "persona_tip" && !userPrefs.enable_persona_tips) continue;
            if (notifType === "newsroom" && !userPrefs.enable_newsroom_alerts) continue;
            if (notifType === "data_refresh" && !userPrefs.enable_data_refresh_alerts) continue;
          }

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
              engagementScore: eng?.engagement_score || 50,
              lifecycleStage: eng?.lifecycle_stage || "active",
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

        if (insertError) {
          console.error("Insert error:", insertError);
          throw insertError;
        }

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

      // Update ignored count in engagement scores
      if (userId) {
        const { data: current } = await supabase
          .from("user_engagement_scores")
          .select("ignored_count_30d")
          .eq("user_id", userId)
          .single();

        if (current) {
          await supabase
            .from("user_engagement_scores")
            .update({ ignored_count_30d: (current.ignored_count_30d || 0) + 1 })
            .eq("user_id", userId);
        }
      }

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

    // ACTION: Get engagement dashboard data
    if (action === "get_engagement_dashboard") {
      const { data: engagementScores } = await supabase
        .from("user_engagement_scores")
        .select(`
          *,
          user_profiles (email, full_name)
        `);

      // Calculate distributions
      const lifecycleDistribution = engagementScores?.reduce((acc: Record<string, number>, e) => {
        acc[e.lifecycle_stage] = (acc[e.lifecycle_stage] || 0) + 1;
        return acc;
      }, {}) || {};

      const avgEngagement = engagementScores?.length 
        ? Math.round(engagementScores.reduce((s, e) => s + (e.engagement_score || 0), 0) / engagementScores.length)
        : 0;

      const eligibleToday = engagementScores?.filter(e => {
        const eligibility = shouldSendNotification(e);
        return eligibility.eligible;
      }).length || 0;

      return new Response(
        JSON.stringify({
          success: true,
          totalUsers: engagementScores?.length || 0,
          avgEngagementScore: avgEngagement,
          lifecycleDistribution,
          eligibleToday,
          users: engagementScores?.map(e => ({
            userId: e.user_id,
            email: (e.user_profiles as any)?.email,
            fullName: (e.user_profiles as any)?.full_name,
            engagementScore: e.engagement_score,
            lifecycleStage: e.lifecycle_stage,
            lastNotification: e.last_notification_at,
            notificationsSent24h: e.notifications_sent_24h,
            notificationsSent7d: e.notifications_sent_7d,
          })) || [],
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

      if (targetingMode === "individual" || targetingMode === "custom") {
        finalUserIds = targetUserIds || [];
      } else if (targetingMode === "company") {
        if (targetCompanies?.length > 0) {
          const { data: companyUsers } = await supabase
            .from("user_profiles")
            .select("id")
            .in("company_id", targetCompanies)
            .eq("is_active", true);
          finalUserIds = companyUsers?.map((u: any) => u.id) || [];
        }
      } else if (targetingMode === "persona") {
        if (targetPersonas?.length > 0) {
          const { data: latestBatch } = await supabase
            .from("profile_analysis_batches")
            .select("id")
            .order("analyzed_at", { ascending: false })
            .limit(1)
            .single();

          if (latestBatch) {
            const { data: allPersonas } = await supabase
              .from("user_personas")
              .select("id, name")
              .eq("analysis_batch_id", latestBatch.id);
            
            const personaNameMap: Record<string, string> = {
              "inactive_users": "Usuarios Inactivos",
              "casual_user": "Usuario Casual", 
              "executive_user": "Ejecutivo Activo",
              "power_user": "Usuario Avanzado",
              "analyst": "Analista",
            };
            
            const realPersonaIds: string[] = [];
            for (const targetId of targetPersonas) {
              const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
              
              if (isUUID) {
                realPersonaIds.push(targetId);
              } else {
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
            
            if (realPersonaIds.length > 0) {
              const { data: snapshots } = await supabase
                .from("user_activity_snapshots")
                .select("user_id, persona_id")
                .eq("analysis_batch_id", latestBatch.id)
                .in("persona_id", realPersonaIds);
              
              finalUserIds = [...new Set(snapshots?.map((s: any) => s.user_id) || [])];
            }
          }
        }
      } else if (targetingMode === "all") {
        const { data: allUsers } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("is_active", true);
        finalUserIds = allUsers?.map((u: any) => u.id) || [];
      } else if (targetUserIds?.length > 0) {
        finalUserIds = targetUserIds;
      }

      if (finalUserIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "No se encontraron destinatarios para el mensaje" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      finalUserIds = [...new Set(finalUserIds)];

      let finalTitle = dmPayload.title;
      let finalContent = dmPayload.content;
      let finalPriority = dmPayload.priority || "normal";
      let generatedBy = "manual";

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
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      }));

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

      const analyticsEntries = finalUserIds.map((uid: string) => ({
        user_id: uid,
        event_type: "dm_delivered",
        event_data: {
          targeting_mode: targetingMode,
          generated_by: generatedBy,
        },
      }));

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
