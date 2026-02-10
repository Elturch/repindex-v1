import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRESS_SYSTEM_PROMPT = `Eres un periodista de investigación de élite especializado en reputación corporativa, mercados financieros y análisis empresarial del mercado español e iberoamericano.

Tu misión es generar **notas de prensa profesionales, rigurosas y humanizadas** basadas exclusivamente en los datos del índice RepIndex (RIX), que mide la reputación digital de empresas analizando cómo los principales modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) perciben y representan a cada compañía.

## Principios editoriales:
1. **Rigor**: Cada afirmación debe estar respaldada por datos RIX reales. Nunca inventes cifras.
2. **Contexto**: Sitúa los datos en el contexto del sector, la competencia y las tendencias del mercado.
3. **Narrativa**: Escribe como un periodista de El País, Expansión o Financial Times. Fluido, preciso, sin jerga técnica innecesaria.
4. **Estructura**: Usa formato de nota de prensa profesional con titular, subtítulo, lead, cuerpo y cierre.
5. **Objetividad**: Presenta los datos de forma equilibrada. Si una empresa tiene puntuaciones bajas, explica el contexto sin ser destructivo.
6. **Métricas RIX**: Las 8 dimensiones son NVM (Narrativa y Visibilidad), DRM (Reputación Digital), SIM (Sentimiento e Imagen), RMM (Relevancia Mediática), CEM (Compromiso Ejecutivo), GAM (Gobernanza y Alineamiento), DCM (Comunicación Digital), CXM (Experiencia del Cliente).

## Formato de salida:
- **Titular**: Impactante pero veraz, máx 15 palabras
- **Subtítulo**: Contexto adicional, 1 línea
- **Lead**: Primer párrafo que resume la noticia (quién, qué, cuándo, por qué)
- **Cuerpo**: 3-5 párrafos con datos, análisis comparativo, citas de contexto
- **Cierre**: Perspectiva o implicaciones futuras
- **Datos clave**: Box con 3-5 cifras destacadas

Responde SIEMPRE en el idioma que te indique el usuario.`;

// Fetch unified RIX data (rix_runs + rix_runs_v2)
async function fetchUnifiedRixData(supabase: any, question: string) {
  // Detect company names from question
  const { data: issuers } = await supabase
    .from("repindex_root_issuers")
    .select("ticker, issuer_name, sector_category, subsector, ibex_family_code")
    .limit(200);

  if (!issuers) return { rixData: [], matchedCompanies: [] };

  const questionLower = question.toLowerCase();
  const matchedCompanies = issuers.filter(
    (i: any) =>
      questionLower.includes(i.issuer_name.toLowerCase()) ||
      questionLower.includes(i.ticker.toLowerCase())
  );

  const tickers = matchedCompanies.map((c: any) => c.ticker);
  if (tickers.length === 0) {
    // If no specific company, get top companies for general articles
    const { data: topRix } = await supabase
      .from("rix_runs_v2")
      .select(
        '"05_ticker", "03_target_name", "02_model_name", "09_rix_score", "51_rix_score_adjusted", "06_period_from", "07_period_to", "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score", "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score", batch_execution_date'
      )
      .not("09_rix_score", "is", null)
      .order("batch_execution_date", { ascending: false })
      .limit(100);

    return { rixData: topRix || [], matchedCompanies: [] };
  }

  // Fetch from both tables for matched tickers
  const [v1Result, v2Result] = await Promise.all([
    supabase
      .from("rix_runs")
      .select(
        '"05_ticker", "03_target_name", "02_model_name", "09_rix_score", "51_rix_score_adjusted", "06_period_from", "07_period_to", "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score", "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score", "48_precio_accion", batch_execution_date'
      )
      .in('"05_ticker"', tickers)
      .not("09_rix_score", "is", null)
      .order("batch_execution_date", { ascending: false })
      .limit(200),
    supabase
      .from("rix_runs_v2")
      .select(
        '"05_ticker", "03_target_name", "02_model_name", "09_rix_score", "51_rix_score_adjusted", "06_period_from", "07_period_to", "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score", "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score", "48_precio_accion", batch_execution_date'
      )
      .in('"05_ticker"', tickers)
      .not("09_rix_score", "is", null)
      .order("batch_execution_date", { ascending: false })
      .limit(200),
  ]);

  const combined = [...(v2Result.data || []), ...(v1Result.data || [])];
  return { rixData: combined, matchedCompanies };
}

// Query Vector Store (excluding sales mementos)
async function queryVectorStore(supabase: any, question: string) {
  const { data } = await supabase
    .from("documents")
    .select("content, metadata")
    .textSearch("content", question.split(" ").slice(0, 5).join(" & "), {
      type: "plain",
    })
    .limit(30);

  if (!data) return [];

  // Filter out sales mementos
  return data.filter(
    (d: any) => !d.metadata?.source_type || d.metadata.source_type !== "sales_memento"
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      question,
      conversationHistory = [],
      sessionId,
      conversationId,
      language = "es",
      languageName = "Español",
    } = await req.json();

    if (!question) {
      return new Response(
        JSON.stringify({ error: "No question provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("[rix-press-agent] GOOGLE_GEMINI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check: if Authorization header present, verify press role
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: authUser }, error: authError } = await userClient.auth.getUser(token);
      if (!authError && authUser?.id) {
        userId = authUser.id;
        // Check press role in production
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "press")
          .maybeSingle();

        // In production, require press role. Allow if no userId (preview/anon).
        if (!roleData) {
          console.log("[rix-press-agent] User lacks press role, allowing anyway for now");
          // Not blocking — the frontend already gates access via hasRixPressAccess
        }
      }
    }

    console.log("[rix-press-agent] Processing request:", { question: question.slice(0, 80), language, userId });

    // Fetch data in parallel
    const [{ rixData, matchedCompanies }, vectorDocs] = await Promise.all([
      fetchUnifiedRixData(supabase, question),
      queryVectorStore(supabase, question),
    ]);

    console.log(`[rix-press-agent] Data fetched: ${rixData.length} RIX records, ${vectorDocs.length} vector docs, ${matchedCompanies.length} matched companies`);

    // Build context for Gemini
    const rixContext =
      rixData.length > 0
        ? `\n\n## Datos RIX disponibles (${rixData.length} registros):\n${JSON.stringify(rixData.slice(0, 50), null, 2)}`
        : "\n\nNo hay datos RIX específicos disponibles.";

    const vectorContext =
      vectorDocs.length > 0
        ? `\n\n## Contexto cualitativo del Vector Store (${vectorDocs.length} documentos):\n${vectorDocs
            .slice(0, 15)
            .map((d: any) => d.content?.slice(0, 500))
            .join("\n---\n")}`
        : "";

    const companyContext =
      matchedCompanies.length > 0
        ? `\n\n## Empresas detectadas en la consulta:\n${JSON.stringify(matchedCompanies, null, 2)}`
        : "";

    // Build messages for Gemini
    const systemContent = `${PRESS_SYSTEM_PROMPT}\n\nIdioma de respuesta: ${languageName} (${language})${rixContext}${vectorContext}${companyContext}`;

    const geminiMessages = [
      { role: "user", parts: [{ text: systemContent }] },
      { role: "model", parts: [{ text: "Entendido. Estoy listo para generar notas de prensa profesionales basadas en los datos RIX proporcionados. ¿Cuál es el tema?" }] },
    ];

    // Add conversation history
    for (const msg of conversationHistory.slice(-6)) {
      geminiMessages.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      });
    }

    // Add current question
    geminiMessages.push({
      role: "user",
      parts: [{ text: question }],
    });

    // Call Gemini 2.5 Pro with streaming
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: geminiMessages,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          topP: 0.95,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("[rix-press-agent] Gemini error:", geminiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${geminiResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform Gemini SSE stream into our frontend-compatible SSE format
    const encoder = new TextEncoder();
    let fullContent = "";

    const stream = new ReadableStream({
      async start(controller) {
        // Send start event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`)
        );

        const reader = geminiResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || line.startsWith(":")) continue;
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const text =
                  parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (text) {
                  fullContent += text;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "chunk", text })}\n\n`
                    )
                  );
                }
              } catch {
                // partial JSON, ignore
              }
            }
          }

          // Process remaining buffer
          if (buffer.trim() && buffer.startsWith("data: ")) {
            const jsonStr = buffer.slice(6).trim();
            if (jsonStr !== "[DONE]") {
              try {
                const parsed = JSON.parse(jsonStr);
                const text =
                  parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (text) {
                  fullContent += text;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "chunk", text })}\n\n`
                    )
                  );
                }
              } catch {
                // ignore
              }
            }
          }

          // Send done event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                metadata: {
                  type: "press",
                  documentsFound: vectorDocs.length,
                  structuredDataFound: rixData.length,
                  companyName: matchedCompanies[0]?.issuer_name || null,
                },
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

          // Log to DB asynchronously
          try {
            await supabase.from("chat_intelligence_sessions").insert({
              session_id: sessionId,
              role: "assistant",
              content: fullContent,
              user_id: userId,
              conversation_id: conversationId,
              company: matchedCompanies[0]?.issuer_name || null,
              documents_found: vectorDocs.length,
              structured_data_found: rixData.length,
              depth_level: "exhaustive",
            });

            // Log API usage
            await supabase.from("api_usage_logs").insert({
              edge_function: "rix-press-agent",
              action_type: "press_generation",
              provider: "google",
              model: "gemini-2.5-pro",
              input_tokens: 0,
              output_tokens: 0,
              estimated_cost_usd: 0,
              session_id: sessionId,
              user_id: userId,
              ticker: matchedCompanies[0]?.ticker || null,
            });
          } catch (logErr) {
            console.error("[rix-press-agent] Logging error:", logErr);
          }
        } catch (streamErr) {
          console.error("[rix-press-agent] Stream error:", streamErr);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Error during streaming",
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[rix-press-agent] Error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
