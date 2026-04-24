import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserActivity {
  userId: string;
  email: string;
  fullName: string | null;
  companyName: string | null;
  totalConversations: number;
  totalMessages: number;
  avgMessagesPerConvo: number;
  totalEnrichments: number;
  favoriteRoles: { roleId: string; roleName: string; count: number }[];
  totalDocuments: number;
  documentTypes: { type: string; count: number }[];
  lastActivity: string | null;
  firstActivity: string | null;
  daysActive: number;
  avgSessionLength: number;
  questionPatterns: string[];
  companiesMentioned: string[];
  // Notification response tracking
  notificationsSent: number;
  notificationsRead: number;
  notificationsIgnored: number;
}

interface UserPersona {
  id: string;
  name: string;
  emoji: string;
  description: string;
  characteristics: string[];
  userIds: string[];
  userCount: number;
  avgMetrics: {
    conversations: number;
    enrichments: number;
    documents: number;
    sessionFrequency: number;
  };
  color: string;
}

// ============================================
// LEAD SCORING ALGORITHM (Explicit Weights)
// ============================================
const SCORING_WEIGHTS = {
  RECENCY: 0.30,      // 30% - How recent was last activity
  FREQUENCY: 0.25,    // 25% - Frequency of use
  DEPTH: 0.25,        // 25% - Depth of usage (enrichments, docs)
  RESPONSE: 0.20,     // 20% - Response to previous notifications
};

function calculateEngagementScore(userActivity: UserActivity): {
  engagementScore: number;
  lifecycleStage: string;
  componentScores: {
    recencyScore: number;
    frequencyScore: number;
    depthScore: number;
    responseScore: number;
  };
} {
  // 1. RECENCY SCORE (0-100)
  // Day 0 = 100, Day 7 = 77, Day 14 = 53, Day 30 = 0
  const daysSinceActivity = userActivity.lastActivity 
    ? Math.ceil((Date.now() - new Date(userActivity.lastActivity).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const recencyScore = Math.max(0, Math.round(100 - (daysSinceActivity * 3.33)));

  // 2. FREQUENCY SCORE (0-100)
  // 0 convos = 0, 1-2 = 20, 3-5 = 50, 6-10 = 75, 10+ = 100
  const frequencyScore = Math.min(100, userActivity.totalConversations * 10);

  // 3. DEPTH SCORE (0-100)
  // Based on usage of advanced features
  const depthScore = Math.min(100, 
    (userActivity.totalEnrichments * 15) + 
    (userActivity.totalDocuments * 20) +
    (userActivity.avgMessagesPerConvo > 5 ? 20 : 0)
  );

  // 4. RESPONSE SCORE (0-100)
  // Based on interaction with previous notifications
  const totalNotifs = userActivity.notificationsSent || 0;
  const responseRate = totalNotifs > 0 
    ? userActivity.notificationsRead / totalNotifs 
    : 0.5; // Default 50% for new users
  const responseScore = Math.min(100, Math.round(responseRate * 100));

  // COMBINED SCORE
  const engagementScore = Math.round(
    (recencyScore * SCORING_WEIGHTS.RECENCY) +
    (frequencyScore * SCORING_WEIGHTS.FREQUENCY) +
    (depthScore * SCORING_WEIGHTS.DEPTH) +
    (responseScore * SCORING_WEIGHTS.RESPONSE)
  );

  // LIFECYCLE STAGE (determined by score and activity)
  let lifecycleStage = 'new';
  if (userActivity.totalConversations === 0 && daysSinceActivity > 30) {
    lifecycleStage = 'churned';
  } else if (daysSinceActivity > 14) {
    lifecycleStage = 'at_risk';
  } else if (engagementScore >= 80) {
    lifecycleStage = 'power_user';
  } else if (engagementScore >= 50) {
    lifecycleStage = 'engaged';
  } else if (engagementScore >= 20) {
    lifecycleStage = 'active';
  }

  return {
    engagementScore,
    lifecycleStage,
    componentScores: { recencyScore, frequencyScore, depthScore, responseScore }
  };
}

// ============================================
// NOTIFICATION WEIGHTS BY LIFECYCLE STAGE
// ============================================
const LIFECYCLE_WEIGHTS: Record<string, Record<string, number>> = {
  'power_user': {
    newsroom: 0.35, company_alert: 0.30, persona_tip: 0.15, 
    feature_discovery: 0.10, data_refresh: 0.10, inactivity: 0, engagement: 0
  },
  'engaged': {
    newsroom: 0.30, persona_tip: 0.25, company_alert: 0.20,
    data_refresh: 0.15, feature_discovery: 0.10, inactivity: 0, engagement: 0
  },
  'active': {
    persona_tip: 0.30, newsroom: 0.25, feature_discovery: 0.20,
    data_refresh: 0.15, company_alert: 0.10, inactivity: 0, engagement: 0
  },
  'new': {
    persona_tip: 0.35, feature_discovery: 0.30, newsroom: 0.20,
    engagement: 0.15, inactivity: 0, company_alert: 0, data_refresh: 0
  },
  'at_risk': {
    inactivity: 0.50, newsroom: 0.30, company_alert: 0.20,
    persona_tip: 0, feature_discovery: 0, data_refresh: 0, engagement: 0
  },
  'churned': {
    inactivity: 0.80, newsroom: 0.20,
    persona_tip: 0, feature_discovery: 0, data_refresh: 0, company_alert: 0, engagement: 0
  },
};

function calculateNotificationWeights(
  userActivity: UserActivity,
  lifecycleStage: string
): Record<string, number> {
  // Get base weights by lifecycle
  const baseWeights = { ...(LIFECYCLE_WEIGHTS[lifecycleStage] || LIFECYCLE_WEIGHTS['active']) };

  // Adjust weights based on user characteristics
  
  // If user has companies of interest → boost company_alert
  if (userActivity.companiesMentioned.length > 0) {
    baseWeights.company_alert = (baseWeights.company_alert || 0) * 1.5;
  }

  // If uses roles frequently → boost persona_tip
  if (userActivity.totalEnrichments > 3) {
    baseWeights.persona_tip = (baseWeights.persona_tip || 0) * 1.3;
  }

  // If generates many documents → boost newsroom and data_refresh
  if (userActivity.totalDocuments > 2) {
    baseWeights.newsroom = (baseWeights.newsroom || 0) * 1.2;
    baseWeights.data_refresh = (baseWeights.data_refresh || 0) * 1.2;
  }

  // Normalize to sum to 1
  const total = Object.values(baseWeights).reduce((a, b) => a + b, 0);
  if (total > 0) {
    Object.keys(baseWeights).forEach(k => {
      baseWeights[k] = baseWeights[k] / total;
    });
  }

  return baseWeights;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting user profile analysis with engagement scoring...");

    // Fetch all user data
    const { data: users, error: usersError } = await supabase
      .from("user_profiles")
      .select(`
        id, email, full_name, is_active, created_at, last_login,
        client_companies (id, company_name)
      `)
      .eq("is_active", true);

    if (usersError) throw usersError;

    // Fetch conversations
    const { data: conversations } = await supabase
      .from("user_conversations")
      .select("id, user_id, session_id, messages_count, created_at, last_message_at");

    // Fetch messages for content analysis
    const { data: messages } = await supabase
      .from("chat_intelligence_sessions")
      .select("user_id, session_id, role, content, company, created_at")
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);

    // Fetch role enrichments
    const { data: enrichments } = await supabase
      .from("role_enrichment_analytics")
      .select("user_id, role_id, role_name, original_question, created_at");

    // Fetch documents
    const { data: documents } = await supabase
      .from("user_documents")
      .select("user_id, document_type, company_name, created_at");

    // Fetch notification analytics for response tracking
    const { data: notificationAnalytics } = await supabase
      .from("notification_analytics")
      .select("user_id, event_type, created_at")
      .order("created_at", { ascending: false });

    // Fetch existing notifications for sent count
    const { data: notifications } = await supabase
      .from("user_notifications")
      .select("user_id, is_read, is_dismissed, created_at");

    // Build user activity profiles
    const userActivities: UserActivity[] = [];

    for (const user of users || []) {
      const userConvos = (conversations || []).filter(c => c.user_id === user.id);
      const userMessages = (messages || []).filter(m => m.user_id === user.id);
      const userEnrichments = (enrichments || []).filter(e => e.user_id === user.id);
      const userDocs = (documents || []).filter(d => d.user_id === user.id);
      const userNotifs = (notifications || []).filter(n => n.user_id === user.id);

      // Calculate role preferences
      const roleCount: Record<string, { name: string; count: number }> = {};
      userEnrichments.forEach(e => {
        if (!roleCount[e.role_id]) {
          roleCount[e.role_id] = { name: e.role_name, count: 0 };
        }
        roleCount[e.role_id].count++;
      });
      const favoriteRoles = Object.entries(roleCount)
        .map(([roleId, data]) => ({ roleId, roleName: data.name, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      // Calculate document types
      const docTypeCount: Record<string, number> = {};
      userDocs.forEach(d => {
        docTypeCount[d.document_type] = (docTypeCount[d.document_type] || 0) + 1;
      });
      const documentTypes = Object.entries(docTypeCount)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Extract companies mentioned
      const companiesMentioned = [...new Set(
        userMessages
          .filter(m => m.company)
          .map(m => m.company)
          .filter(Boolean)
      )].slice(0, 10);

      // Extract question patterns from user messages
      const userQuestions = userMessages
        .filter(m => m.role === "user")
        .map(m => m.content)
        .slice(0, 20);

      // Calculate days active and first activity
      const firstActivity = userConvos.length > 0 
        ? new Date(Math.min(...userConvos.map(c => new Date(c.created_at || 0).getTime())))
        : new Date();
      const daysActive = Math.ceil((Date.now() - firstActivity.getTime()) / (1000 * 60 * 60 * 24));

      // Get last activity
      const allDates = [
        ...userConvos.map(c => c.last_message_at || c.created_at),
        ...userEnrichments.map(e => e.created_at),
        ...userDocs.map(d => d.created_at)
      ].filter(Boolean);
      const lastActivity = allDates.length > 0 
        ? new Date(Math.max(...allDates.map(d => new Date(d!).getTime()))).toISOString()
        : null;

      // Calculate notification response metrics
      const notificationsSent = userNotifs.length;
      const notificationsRead = userNotifs.filter(n => n.is_read).length;
      const notificationsIgnored = userNotifs.filter(n => !n.is_read && n.is_dismissed).length;

      userActivities.push({
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
        companyName: (user.client_companies as any)?.company_name || null,
        totalConversations: userConvos.length,
        totalMessages: userMessages.length,
        avgMessagesPerConvo: userConvos.length > 0 ? userMessages.length / userConvos.length : 0,
        totalEnrichments: userEnrichments.length,
        favoriteRoles,
        totalDocuments: userDocs.length,
        documentTypes,
        lastActivity,
        firstActivity: firstActivity.toISOString(),
        daysActive,
        avgSessionLength: userConvos.length > 0 
          ? userConvos.reduce((sum, c) => sum + (c.messages_count || 0), 0) / userConvos.length 
          : 0,
        questionPatterns: userQuestions.slice(0, 5),
        companiesMentioned: companiesMentioned as string[],
        notificationsSent,
        notificationsRead,
        notificationsIgnored,
      });
    }

    console.log(`Analyzed ${userActivities.length} users`);

    // Calculate engagement scores for all users
    const engagementResults = userActivities.map(ua => {
      const { engagementScore, lifecycleStage, componentScores } = calculateEngagementScore(ua);
      const notificationWeights = calculateNotificationWeights(ua, lifecycleStage);
      
      return {
        userId: ua.userId,
        engagementScore,
        lifecycleStage,
        ...componentScores,
        weights: notificationWeights,
        activity: ua,
      };
    });

    // Use AI to analyze and create personas
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    let personas: UserPersona[] = [];

    if (userActivities.length > 0 && (OPENAI_API_KEY || GOOGLE_GEMINI_API_KEY)) {
      const activitySummary = userActivities.map(u => ({
        id: u.userId,
        convos: u.totalConversations,
        msgs: u.totalMessages,
        enrichments: u.totalEnrichments,
        docs: u.totalDocuments,
        roles: u.favoriteRoles.map(r => r.roleName).join(", "),
        companies: u.companiesMentioned.slice(0, 3).join(", "),
        daysActive: u.daysActive,
        lastActivity: u.lastActivity,
      }));

      const prompt = `Analiza estos datos de actividad de usuarios de una plataforma de inteligencia reputacional corporativa (RepIndex) y crea entre 3-6 PERSONAS/ESTEREOTIPOS de usuarios.

DATOS DE USUARIOS:
${JSON.stringify(activitySummary, null, 2)}

Crea personas basándote en patrones de uso como:
- Frecuencia de uso (usuarios activos vs esporádicos)
- Tipo de consultas (analistas vs ejecutivos)
- Uso de enriquecimiento por rol profesional
- Generación de documentos/boletines
- Número de empresas analizadas
- Profundidad de análisis (mensajes por conversación)

RESPONDE ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "personas": [
    {
      "id": "analyst_power_user",
      "name": "Analista Intensivo",
      "emoji": "📊",
      "description": "Breve descripción del perfil en 1-2 frases",
      "characteristics": ["característica 1", "característica 2", "característica 3"],
      "userIds": ["id1", "id2"],
      "color": "#3B82F6"
    }
  ]
}

Asigna cada usuario a la persona que mejor le corresponda según su comportamiento. Usa colores hex distintos para cada persona. Los IDs deben ser los reales de los usuarios.`;

      try {
        let aiResponse: string | null = null;

        // Try OpenAI first
        if (OPENAI_API_KEY) {
          const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: "Eres un experto en análisis de comportamiento de usuarios y segmentación. Responde SOLO con JSON válido." },
                { role: "user", content: prompt }
              ],
              max_tokens: 4000,
              temperature: 0.7,
            }),
          });

          if (openaiRes.ok) {
            const data = await openaiRes.json();
            aiResponse = data.choices?.[0]?.message?.content;
          }
        }

        // Fallback to Gemini
        if (!aiResponse && GOOGLE_GEMINI_API_KEY) {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${GOOGLE_GEMINI_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gemini-2.5-flash",
                messages: [
                  { role: "system", content: "Eres un experto en análisis de comportamiento de usuarios. Responde SOLO con JSON válido." },
                  { role: "user", content: prompt }
                ],
                max_tokens: 4000,
              }),
            }
          );

          if (geminiRes.ok) {
            const data = await geminiRes.json();
            aiResponse = data.choices?.[0]?.message?.content;
          }
        }

        if (aiResponse) {
          // Extract JSON from response
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            personas = (parsed.personas || []).map((p: any) => {
              const personaUsers = userActivities.filter(u => p.userIds?.includes(u.userId));
              return {
                ...p,
                userCount: personaUsers.length,
                avgMetrics: {
                  conversations: personaUsers.length > 0 
                    ? personaUsers.reduce((s, u) => s + u.totalConversations, 0) / personaUsers.length 
                    : 0,
                  enrichments: personaUsers.length > 0 
                    ? personaUsers.reduce((s, u) => s + u.totalEnrichments, 0) / personaUsers.length 
                    : 0,
                  documents: personaUsers.length > 0 
                    ? personaUsers.reduce((s, u) => s + u.totalDocuments, 0) / personaUsers.length 
                    : 0,
                  sessionFrequency: personaUsers.length > 0 
                    ? personaUsers.reduce((s, u) => s + (u.daysActive > 0 ? u.totalConversations / u.daysActive : 0), 0) / personaUsers.length 
                    : 0,
                }
              };
            });
          }
        }
      } catch (aiError) {
        console.error("AI analysis error:", aiError);
      }
    }

    // If no AI or failed, create rule-based personas
    if (personas.length === 0 && userActivities.length > 0) {
      const powerUsers = userActivities.filter(u => u.totalConversations >= 5 && u.totalEnrichments >= 3);
      const regularUsers = userActivities.filter(u => u.totalConversations >= 2 && u.totalConversations < 5);
      const casualUsers = userActivities.filter(u => u.totalConversations === 1);
      const dormantUsers = userActivities.filter(u => u.totalConversations === 0);
      const docGenerators = userActivities.filter(u => u.totalDocuments >= 2);

      if (powerUsers.length > 0) {
        personas.push({
          id: "power_user",
          name: "Usuario Intensivo",
          emoji: "🚀",
          description: "Usuarios muy activos que aprovechan todas las funcionalidades",
          characteristics: ["Alto volumen de consultas", "Usa enriquecimiento por rol", "Genera documentos"],
          userIds: powerUsers.map(u => u.userId),
          userCount: powerUsers.length,
          avgMetrics: {
            conversations: powerUsers.reduce((s, u) => s + u.totalConversations, 0) / powerUsers.length,
            enrichments: powerUsers.reduce((s, u) => s + u.totalEnrichments, 0) / powerUsers.length,
            documents: powerUsers.reduce((s, u) => s + u.totalDocuments, 0) / powerUsers.length,
            sessionFrequency: 0.5,
          },
          color: "#10B981",
        });
      }

      if (regularUsers.length > 0) {
        personas.push({
          id: "regular_user",
          name: "Usuario Regular",
          emoji: "👤",
          description: "Usuarios con uso moderado y constante de la plataforma",
          characteristics: ["Uso periódico", "Consultas específicas", "Exploración moderada"],
          userIds: regularUsers.map(u => u.userId),
          userCount: regularUsers.length,
          avgMetrics: {
            conversations: regularUsers.reduce((s, u) => s + u.totalConversations, 0) / regularUsers.length,
            enrichments: regularUsers.reduce((s, u) => s + u.totalEnrichments, 0) / regularUsers.length,
            documents: regularUsers.reduce((s, u) => s + u.totalDocuments, 0) / regularUsers.length,
            sessionFrequency: 0.2,
          },
          color: "#3B82F6",
        });
      }

      if (casualUsers.length > 0) {
        personas.push({
          id: "casual_user",
          name: "Usuario Casual",
          emoji: "🌱",
          description: "Usuarios nuevos o que están explorando la plataforma",
          characteristics: ["Una sesión", "Fase de descubrimiento", "Potencial de crecimiento"],
          userIds: casualUsers.map(u => u.userId),
          userCount: casualUsers.length,
          avgMetrics: {
            conversations: 1,
            enrichments: casualUsers.reduce((s, u) => s + u.totalEnrichments, 0) / casualUsers.length,
            documents: 0,
            sessionFrequency: 0.05,
          },
          color: "#F59E0B",
        });
      }

      if (dormantUsers.length > 0) {
        personas.push({
          id: "dormant_user",
          name: "Usuario Inactivo",
          emoji: "💤",
          description: "Usuarios registrados sin actividad en el chat",
          characteristics: ["Sin conversaciones", "Requiere activación", "Oportunidad de engagement"],
          userIds: dormantUsers.map(u => u.userId),
          userCount: dormantUsers.length,
          avgMetrics: { conversations: 0, enrichments: 0, documents: 0, sessionFrequency: 0 },
          color: "#6B7280",
        });
      }

      if (docGenerators.length > 0) {
        personas.push({
          id: "doc_generator",
          name: "Generador de Informes",
          emoji: "📄",
          description: "Usuarios enfocados en crear y exportar documentos",
          characteristics: ["Genera boletines", "Exporta contenido", "Uso ejecutivo"],
          userIds: docGenerators.map(u => u.userId),
          userCount: docGenerators.length,
          avgMetrics: {
            conversations: docGenerators.reduce((s, u) => s + u.totalConversations, 0) / docGenerators.length,
            enrichments: docGenerators.reduce((s, u) => s + u.totalEnrichments, 0) / docGenerators.length,
            documents: docGenerators.reduce((s, u) => s + u.totalDocuments, 0) / docGenerators.length,
            sessionFrequency: 0.3,
          },
          color: "#8B5CF6",
        });
      }
    }

    // Persist analysis to database
    const startTime = Date.now();
    
    // Create analysis batch
    const { data: batchData, error: batchError } = await supabase
      .from("profile_analysis_batches")
      .insert({
        total_users_analyzed: userActivities.length,
        total_personas_generated: personas.length,
        ai_provider: OPENAI_API_KEY ? "openai" : GOOGLE_GEMINI_API_KEY ? "gemini" : "rule-based",
      })
      .select("id")
      .single();

    if (batchError) {
      console.error("Error creating batch:", batchError);
    }

    const batchId = batchData?.id;

    if (batchId) {
      // Insert personas
      const personaInserts = personas.map(p => ({
        name: p.name,
        emoji: p.emoji,
        description: p.description,
        characteristics: p.characteristics,
        avg_conversations: p.avgMetrics.conversations,
        avg_enrichments: p.avgMetrics.enrichments,
        avg_documents: p.avgMetrics.documents,
        avg_session_frequency: p.avgMetrics.sessionFrequency,
        user_count: p.userCount,
        analysis_batch_id: batchId,
      }));

      const { data: insertedPersonas, error: personaError } = await supabase
        .from("user_personas")
        .insert(personaInserts)
        .select("id, name");

      if (personaError) {
        console.error("Error inserting personas:", personaError);
      }

      // Create persona ID mapping
      const personaIdMap: Record<string, string> = {};
      insertedPersonas?.forEach((ip, idx) => {
        personaIdMap[personas[idx].id] = ip.id;
      });

      // Insert user activity snapshots
      const activityInserts = userActivities.map(u => {
        // Find which persona this user belongs to
        const userPersona = personas.find(p => p.userIds.includes(u.userId));
        const dbPersonaId = userPersona ? personaIdMap[userPersona.id] : null;

        return {
          user_id: u.userId,
          user_email: u.email,
          user_name: u.fullName,
          total_conversations: u.totalConversations,
          total_messages: u.totalMessages,
          total_enrichments: u.totalEnrichments,
          total_documents: u.totalDocuments,
          favorite_roles: u.favoriteRoles.map(r => r.roleName),
          mentioned_companies: u.companiesMentioned,
          question_patterns: u.questionPatterns,
          last_activity: u.lastActivity,
          first_activity: u.firstActivity,
          activity_days: u.daysActive,
          persona_id: dbPersonaId,
          analysis_batch_id: batchId,
        };
      });

      const { error: activityError } = await supabase
        .from("user_activity_snapshots")
        .insert(activityInserts);

      if (activityError) {
        console.error("Error inserting activity snapshots:", activityError);
      }

      // ============================================
      // UPSERT ENGAGEMENT SCORES
      // ============================================
      console.log("Updating engagement scores...");
      
      for (const result of engagementResults) {
        const userPersona = personas.find(p => p.userIds.includes(result.userId));
        const dbPersonaId = userPersona ? personaIdMap[userPersona.id] : null;

        const { error: engagementError } = await supabase
          .from("user_engagement_scores")
          .upsert({
            user_id: result.userId,
            recency_score: result.recencyScore,
            frequency_score: result.frequencyScore,
            depth_score: result.depthScore,
            response_score: result.responseScore,
            engagement_score: result.engagementScore,
            lifecycle_stage: result.lifecycleStage,
            weight_newsroom: result.weights.newsroom || 0,
            weight_persona_tip: result.weights.persona_tip || 0,
            weight_data_refresh: result.weights.data_refresh || 0,
            weight_inactivity: result.weights.inactivity || 0,
            weight_company_alert: result.weights.company_alert || 0,
            weight_feature_discovery: result.weights.feature_discovery || 0,
            weight_engagement: result.weights.engagement || 0,
            current_persona_id: dbPersonaId,
            calculated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id',
          });

        if (engagementError) {
          console.error(`Error upserting engagement score for ${result.userId}:`, engagementError);
        }
      }

      // Update batch with duration
      await supabase
        .from("profile_analysis_batches")
        .update({ analysis_duration_ms: Date.now() - startTime })
        .eq("id", batchId);
    }

    // Calculate lifecycle distribution for response
    const lifecycleDistribution = engagementResults.reduce((acc, r) => {
      acc[r.lifecycleStage] = (acc[r.lifecycleStage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgEngagement = engagementResults.length > 0
      ? Math.round(engagementResults.reduce((s, r) => s + r.engagementScore, 0) / engagementResults.length)
      : 0;

    console.log("Analysis complete:", {
      usersAnalyzed: userActivities.length,
      personasGenerated: personas.length,
      avgEngagementScore: avgEngagement,
      lifecycleDistribution,
    });

    return new Response(
      JSON.stringify({
        success: true,
        userActivities,
        personas,
        engagementScores: engagementResults,
        summary: {
          totalUsers: userActivities.length,
          totalPersonas: personas.length,
          avgEngagementScore: avgEngagement,
          lifecycleDistribution,
        },
        batchId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-user-profiles:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
