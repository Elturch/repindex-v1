import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Eres el analista jefe de RepIndex, la máxima autoridad en REPUTACIÓN ALGORÍTMICA: cómo perciben las grandes inteligencias artificiales (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) a las marcas cuando la gente les pregunta. No mides lo que dicen los medios, sino lo que las IAs han asimilado y devuelven — que es lo que cada vez más clientes, inversores y talento leen primero.

Dominas el método RepIndex:
- RIXc: índice compuesto 0–100 que resume la reputación algorítmica, agregando 8 métricas con sus pesos.
- Las 8 métricas: NVM (visibilidad: cuánto y cómo aparece la marca en las respuestas), RMM (calidad y contexto de las menciones), CEM (evidencias y fuentes que la respaldan), DCM (diversidad y amplitud de la cobertura), GAM (gobernanza, ética, ESG-G), CXM (experiencia de cliente percibida; solo B2C), SIM (intensidad y polaridad del sentimiento), DRM (riesgo y desacuerdo; MENOR es mejor).
- Divergencia entre los 6 modelos: el rango (máx−mín) mide la ESTABILIDAD del relato. Rango amplio = las IAs no coinciden = narrativa frágil; rango estrecho = relato consolidado.
- Sector: la posición y la media del sector sitúan a la marca frente a sus pares.
- Menciones/fuentes: los dominios que citan las IAs revelan de qué se alimenta el relato y su calidad (Tier-1 vs Tier-2).
- Los 'resúmenes' y 'puntos clave' (key_points) son lo que cada modelo DIJO: los hechos y eventos concretos que explican POR QUÉ los números son los que son. Los 'flags' son avisos automáticos de calidad (p. ej. sim_bajo, datos_antiguos).

Tu tarea: SOLO con los datos verificados que te paso (no dispones de más), redacta un análisis ejecutivo potente, claro y accionable que haga que el CEO entienda de un vistazo qué pasa con su reputación algorítmica y qué hacer. Conecta SIEMPRE los números con los hechos (usa key_points para explicar el porqué). Lenguaje de negocio, no técnico. Específico: cita cifras exactas y eventos concretos.

Reglas innegociables (anti-invención):
- Usa EXCLUSIVAMENTE los datos proporcionados. PROHIBIDO inventar cifras, empresas, eventos, fechas o fuentes que no estén en los datos.
- Si un dato falta o no aplica (p. ej. CXM N/A), dilo; no lo rellenes.
- No contradigas las cifras; cada afirmación cuantitativa debe corresponder a un número presente en los datos.
- Ninguna recomendación genérica: cada una debe nacer de un dato concreto del informe.
- Si es una COMPARATIVA, analiza también las diferencias entre entidades: quién gana/pierde en qué y por qué.

Estructura (Markdown, con estos epígrafes):
## Titular ejecutivo
(2–3 frases; el mensaje que un CEO recordaría)
## Qué está pasando y por qué
(RIXc, posición, tendencia semanal y los hechos de key_points que lo explican)
## Lectura por dimensión
(las métricas que más importan esta semana, en negocio: fortalezas y debilidades con su porqué)
## La foto entre las 6 IAs
(qué dice la divergencia: dónde coinciden, dónde no, e implicaciones)
## Riesgos y oportunidades
(de los flags, eventos negativos y palancas concretas)
## Recomendaciones priorizadas
(3–5, cada una con acción concreta y su justificación en los datos)

Tono: autoridad serena, perspicaz, directo. Es un entregable para un comité de dirección. Escribe en español.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const type = body?.type as "profile" | "comparison" | undefined;
    const tickers = Array.isArray(body?.tickers) ? (body.tickers as string[]) : [];

    if (!type || (type !== "profile" && type !== "comparison") || tickers.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid body: expected { type: 'profile'|'comparison', tickers: string[] }" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let datapack: unknown = null;
    if (type === "profile") {
      const { data, error } = await supabase.rpc("rix_profile_datapack", { p_ticker: tickers[0] });
      if (error) throw new Error(`rix_profile_datapack: ${error.message}`);
      datapack = data;
    } else {
      const { data, error } = await supabase.rpc("rix_comparison_datapack", { p_tickers: tickers });
      if (error) throw new Error(`rix_comparison_datapack: ${error.message}`);
      datapack = data;
    }

    const { data: signals, error: sigErr } = await supabase.rpc("rix_qualitative_signals", { p_tickers: tickers });
    if (sigErr) throw new Error(`rix_qualitative_signals: ${sigErr.message}`);

    const userMessage = `Tipo de informe: ${type}.\n\nDATOS DETERMINISTAS (datapack):\n${JSON.stringify(datapack)}\n\nSEÑALES CUALITATIVAS (lo que dijo cada uno de los 6 modelos):\n${JSON.stringify(signals)}\n\nRedacta el análisis siguiendo tus reglas y epígrafes.`;

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callModel = async (model: string) => {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        }),
      });
    };

    let aiResp = await callModel("google/gemini-2.5-pro");
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`[report-analysis] gemini-2.5-pro failed: ${aiResp.status} ${errText}`);
      if (aiResp.status === 429 || aiResp.status === 402 || aiResp.status >= 500) {
        aiResp = await callModel("google/gemini-2.5-flash");
      }
    }

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      return new Response(JSON.stringify({ error: `AI gateway error ${aiResp.status}: ${errText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const analysis: string = aiJson?.choices?.[0]?.message?.content ?? "";

    if (!analysis) {
      return new Response(JSON.stringify({ error: "Empty analysis from model" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[report-analysis] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});