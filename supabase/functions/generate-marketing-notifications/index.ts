import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PersonaNotificationTemplate {
  personaId: string;
  personaName: string;
  notifications: {
    type: string;
    title: string;
    content: string;
    priority: string;
  }[];
}

// Templates de notificaciones por tipo de persona
const PERSONA_TEMPLATES: Record<string, PersonaNotificationTemplate> = {
  power_user: {
    personaId: "power_user",
    personaName: "Usuario Intensivo",
    notifications: [
      {
        type: "persona_tip",
        title: "🚀 Maximiza tu análisis",
        content: "¿Sabías que puedes exportar tus boletines en formato PDF para compartir con tu equipo? Prueba la función de exportación en tu próximo análisis.",
        priority: "normal",
      },
      {
        type: "newsroom",
        title: "📰 Nuevo análisis semanal disponible",
        content: "Ya está disponible el análisis reputacional de esta semana con 15 historias principales. Descubre las empresas con mayor variación en su RIX Score.",
        priority: "high",
      },
      {
        type: "persona_tip",
        title: "💡 Sugerencia profesional",
        content: "Como usuario avanzado, te recomendamos explorar el enriquecimiento por rol de Analista de M&A para obtener insights de valoración reputacional.",
        priority: "normal",
      },
    ],
  },
  regular_user: {
    personaId: "regular_user",
    personaName: "Usuario Regular",
    notifications: [
      {
        type: "persona_tip",
        title: "📊 Descubre nuevas funciones",
        content: "¿Has probado el enriquecimiento por rol profesional? Puedes ver el mismo análisis desde la perspectiva de un CEO, periodista o inversor.",
        priority: "normal",
      },
      {
        type: "data_refresh",
        title: "🔄 Datos actualizados",
        content: "Los datos de RIX Score de esta semana ya están disponibles. Consulta las variaciones más significativas en el dashboard.",
        priority: "normal",
      },
      {
        type: "persona_tip",
        title: "📄 Genera tu primer boletín",
        content: "Solicita un boletín ejecutivo de cualquier empresa escribiendo 'Genera un boletín de [empresa]' en el chat.",
        priority: "low",
      },
    ],
  },
  casual_user: {
    personaId: "casual_user",
    personaName: "Usuario Casual",
    notifications: [
      {
        type: "welcome",
        title: "👋 ¡Bienvenido a RepIndex!",
        content: "Estamos aquí para ayudarte. Pregunta cualquier cosa sobre reputación corporativa: '¿Cuáles son las empresas mejor valoradas?' o '¿Cómo ha evolucionado Telefónica?'",
        priority: "high",
      },
      {
        type: "persona_tip",
        title: "🎯 Empieza aquí",
        content: "Prueba preguntar: '¿Cuál es el ranking de empresas del IBEX?' o 'Muéstrame las 10 empresas con mejor reputación'.",
        priority: "normal",
      },
      {
        type: "persona_tip",
        title: "💬 El Agente Rix te ayuda",
        content: "Puedes preguntar en lenguaje natural. Por ejemplo: '¿Por qué Inditex tiene este score?' o 'Compara Santander vs BBVA'.",
        priority: "normal",
      },
    ],
  },
  dormant_user: {
    personaId: "dormant_user",
    personaName: "Usuario Inactivo",
    notifications: [
      {
        type: "inactivity",
        title: "🔔 Te echamos de menos",
        content: "Han pasado algunos días desde tu última visita. ¡Hay nuevos análisis esperándote! Descubre qué ha cambiado en el mercado.",
        priority: "high",
      },
      {
        type: "newsroom",
        title: "📰 Novedades de la semana",
        content: "Esta semana han ocurrido cambios significativos en varias empresas. Entra para ver las historias más destacadas.",
        priority: "normal",
      },
      {
        type: "persona_tip",
        title: "🚀 Vuelve a explorar",
        content: "¿Sabías que puedes preguntar sobre cualquier empresa? Prueba: '¿Cuáles son las empresas que más han mejorado esta semana?'",
        priority: "normal",
      },
    ],
  },
  doc_generator: {
    personaId: "doc_generator",
    personaName: "Generador de Informes",
    notifications: [
      {
        type: "persona_tip",
        title: "📄 Optimiza tus informes",
        content: "Puedes solicitar boletines comparativos: 'Genera un boletín de Telefónica comparándola con sus competidores del sector'.",
        priority: "normal",
      },
      {
        type: "newsroom",
        title: "📊 Nuevos datos disponibles",
        content: "Los datos de esta semana ya están listos. Genera tus informes con la información más actualizada.",
        priority: "high",
      },
      {
        type: "persona_tip",
        title: "🎯 Enriquecimiento ejecutivo",
        content: "Usa el rol 'CEO' o 'Director Financiero' para obtener informes con enfoque estratégico adaptado a la alta dirección.",
        priority: "normal",
      },
    ],
  },
};

// Templates genéricos para personas no mapeadas
const GENERIC_TEMPLATES = [
  {
    type: "newsroom",
    title: "📰 Análisis semanal disponible",
    content: "Ya está disponible el nuevo análisis reputacional. Descubre las tendencias y cambios más relevantes de esta semana.",
    priority: "normal",
  },
  {
    type: "data_refresh",
    title: "🔄 Datos actualizados",
    content: "Los RIX Scores han sido actualizados con los datos más recientes. Consulta las variaciones en el dashboard.",
    priority: "normal",
  },
  {
    type: "persona_tip",
    title: "💡 Consejo de la semana",
    content: "Prueba el enriquecimiento por rol profesional para obtener perspectivas especializadas sobre tus consultas.",
    priority: "low",
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, campaignId, targetPersonas, customNotification, userId } = await req.json();

    if (action === "generate_for_all") {
      // Get latest user activity snapshots
      const { data: latestBatch } = await supabase
        .from("profile_analysis_batches")
        .select("id")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .single();

      if (!latestBatch) {
        return new Response(
          JSON.stringify({ error: "No hay análisis de perfiles disponible. Ejecuta primero el análisis de perfiles." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get user activity snapshots with persona info
      const { data: userSnapshots } = await supabase
        .from("user_activity_snapshots")
        .select(`
          user_id, user_email, user_name,
          persona_id,
          user_personas (id, name, emoji)
        `)
        .eq("analysis_batch_id", latestBatch.id);

      // Get user notification preferences
      const { data: preferences } = await supabase
        .from("user_notification_preferences")
        .select("user_id, enable_persona_tips, enable_newsroom_alerts, enable_data_refresh_alerts");

      const prefMap = new Map(preferences?.map(p => [p.user_id, p]) || []);

      const notifications: any[] = [];
      const targetPersonaSet = new Set(targetPersonas || []);

      for (const snapshot of userSnapshots || []) {
        const persona = snapshot.user_personas as any;
        const personaName = persona?.name || "Usuario";
        
        // Filter by target personas if specified
        if (targetPersonas?.length > 0 && !targetPersonaSet.has(persona?.id)) {
          continue;
        }

        // Get persona-specific templates
        let templates = GENERIC_TEMPLATES;
        for (const [key, template] of Object.entries(PERSONA_TEMPLATES)) {
          if (personaName.toLowerCase().includes(key.replace("_", " ")) || 
              template.personaName.toLowerCase() === personaName.toLowerCase()) {
            templates = template.notifications;
            break;
          }
        }

        // Check user preferences
        const userPrefs = prefMap.get(snapshot.user_id);
        
        // Pick 1-2 random notifications from templates
        const shuffled = [...templates].sort(() => Math.random() - 0.5);
        const toSend = shuffled.slice(0, Math.min(2, shuffled.length));

        for (const notif of toSend) {
          // Check if user has disabled this notification type
          if (userPrefs) {
            if (notif.type === "persona_tip" && !userPrefs.enable_persona_tips) continue;
            if (notif.type === "newsroom" && !userPrefs.enable_newsroom_alerts) continue;
            if (notif.type === "data_refresh" && !userPrefs.enable_data_refresh_alerts) continue;
          }

          notifications.push({
            user_id: snapshot.user_id,
            notification_type: notif.type,
            title: notif.title,
            content: notif.content,
            priority: notif.priority,
            persona_id: persona?.id || null,
            metadata: {
              persona_name: personaName,
              generated_at: new Date().toISOString(),
              campaign_id: campaignId || null,
            },
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          });
        }
      }

      // Insert notifications
      if (notifications.length > 0) {
        const { error: insertError } = await supabase
          .from("user_notifications")
          .insert(notifications);

        if (insertError) throw insertError;

        // Track analytics
        const analyticsEntries = notifications.map(n => ({
          notification_id: null, // Would need to get inserted IDs
          campaign_id: campaignId || null,
          user_id: n.user_id,
          event_type: "delivered",
          event_data: { persona_id: n.persona_id },
        }));

        await supabase.from("notification_analytics").insert(analyticsEntries);

        // Update campaign stats if applicable
        if (campaignId) {
          await supabase.rpc("increment_campaign_sent", { 
            campaign_id: campaignId, 
            count: notifications.length 
          }).catch(() => {}); // Ignore if function doesn't exist
        }
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
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send_custom") {
      // Send custom notification to specific users or personas
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
        // Get users from specified personas
        const { data: snapshots } = await supabase
          .from("user_activity_snapshots")
          .select("user_id, persona_id")
          .in("persona_id", targetPersonas);

        targetUserIds = [...new Set(snapshots?.map(s => s.user_id) || [])];
      } else {
        // Get all active users
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

    if (action === "get_user_notifications") {
      // Get notifications for a specific user
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

    if (action === "mark_read") {
      const { notificationId } = await req.json();
      
      const { error } = await supabase
        .from("user_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId);

      if (error) throw error;

      // Track read event
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

    if (action === "get_campaign_stats") {
      const { data: campaigns } = await supabase
        .from("marketing_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: analytics } = await supabase
        .from("notification_analytics")
        .select("campaign_id, event_type")
        .not("campaign_id", "is", null);

      // Aggregate stats per campaign
      const statsMap: Record<string, { delivered: number; read: number; clicked: number }> = {};
      for (const a of analytics || []) {
        if (!statsMap[a.campaign_id]) {
          statsMap[a.campaign_id] = { delivered: 0, read: 0, clicked: 0 };
        }
        if (a.event_type === "delivered") statsMap[a.campaign_id].delivered++;
        if (a.event_type === "read") statsMap[a.campaign_id].read++;
        if (a.event_type === "clicked") statsMap[a.campaign_id].clicked++;
      }

      const enrichedCampaigns = (campaigns || []).map(c => ({
        ...c,
        stats: statsMap[c.id] || { delivered: 0, read: 0, clicked: 0 },
      }));

      return new Response(
        JSON.stringify({ campaigns: enrichedCampaigns }),
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
