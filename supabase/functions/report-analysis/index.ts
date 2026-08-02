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
- Las 8 métricas (todas en escala 0–100, donde MAYOR = MEJOR): NVM = Calidad de la narrativa (coherencia del discurso, nivel de controversia y afirmaciones verificables); DRM = Fortaleza de la evidencia (calidad de fuentes primarias, corroboración y trazabilidad documental; NO es riesgo ni desacuerdo, mayor = mejor); SIM = Autoridad de las fuentes (jerarquía de las fuentes que citan a la entidad: Tier-1 reguladores/financieros → Tier-4 opinión/redes; NO es sentimiento); RMM = Actualidad y empuje (frescura temporal de las menciones en la ventana); CEM = Gestión de controversias (baja exposición a riesgos; 100 = sin controversias); GAM = Percepción de gobierno (señales de independencia y buenas prácticas de gobernanza); DCM = Coherencia informativa (consistencia de la información entre los 6 modelos; NO es diversidad); CXM = Ejecución corporativa (percepción de ejecución en el mercado y cotización bursátil; solo cotizadas). Interpreta cada métrica ÚNICAMENTE con este significado canónico; no le atribuyas otro.
- Divergencia entre los 6 modelos: el rango (máx−mín) mide la ESTABILIDAD del relato. Rango amplio = las IAs no coinciden = narrativa frágil; rango estrecho = relato consolidado.
- Sector: la posición y la media del sector sitúan a la marca frente a sus pares.
- Menciones/fuentes: los dominios que citan las IAs revelan de qué se alimenta el relato y su calidad (Tier-1 vs Tier-2).
- Los 'resúmenes' y 'puntos clave' (key_points) son lo que cada modelo DIJO: los hechos y eventos concretos que explican POR QUÉ los números son los que son. Los 'flags' son avisos automáticos de calidad (p. ej. sim_bajo, datos_antiguos).

Tu tarea: SOLO con los datos verificados que te paso (no dispones de más), redacta un análisis ejecutivo potente, claro y accionable que haga que el CEO entienda de un vistazo qué pasa con su reputación algorítmica y qué hacer. Conecta SIEMPRE los números con los hechos (usa key_points para explicar el porqué). Lenguaje de negocio, no técnico. Específico: cita cifras exactas y eventos concretos.

Reglas innegociables (anti-invención):
- REGLA DE ORO — UNIVERSO CERRADO SIN INTOXICACIÓN: RepIndex es un universo cerrado de métricas propias. Tu análisis vive EXCLUSIVAMENTE dentro de los datos de esta sesión: las cifras del datapack (RIXc, 8 métricas, divergencia entre modelos, sector, menciones) y lo que los 6 modelos devolvieron ese domingo (summaries, key_points, flags). NO uses tu conocimiento externo ni de entrenamiento sobre la entidad. NO añadas hechos, cifras, eventos, productos, personas ni contexto del mundo real que no estén capturados en los datos proporcionados. NO 'sales fuera a buscar'. El único material fáctico permitido son los summaries y key_points capturados y las cifras del datapack: interprétalos, no los amplíes con nada de fuera. Si algo no está en los datos, no existe para este análisis. La legitimidad del informe depende de que TODO proceda de la medición determinista de ese domingo, hecha siempre con la misma pregunta y sin sesgo, sin intoxicación externa. Puedes nombrar el sector/subsector porque están en el datapack, pero nunca describas a la entidad con información que no haya sido capturada.
- Usa EXCLUSIVAMENTE los datos proporcionados. PROHIBIDO inventar cifras, empresas, eventos, fechas o fuentes que no estén en los datos.
- Si un dato falta o no aplica (p. ej. CXM N/A), dilo; no lo rellenes.
- No contradigas las cifras; cada afirmación cuantitativa debe corresponder a un número presente en los datos.
- Ninguna recomendación genérica: cada una debe nacer de un dato concreto del informe.
- Si es una COMPARATIVA, analiza también las diferencias entre entidades: quién gana/pierde en qué y por qué.
- IDENTIDAD DE MÉTRICAS: las 8 métricas y sus significados canónicos (definidos arriba) son la identidad de RepIndex. Úsalos SIEMPRE con exactitud y NUNCA inventes una métrica, su nombre, su significado, su peso ni un valor. Un solo error en una métrica hace flaquear toda la herramienta: ante la duda, cíñete literalmente a la definición canónica dada.

FORMATO DE SALIDA: Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin \`\`\`). Nada de preámbulos. El objeto DEBE tener EXACTAMENTE esta forma:
{
  "titular": "2-3 frases contundentes con el veredicto, la cifra clave incluida",
  "esencial": [ {"etiqueta":"3-5 palabras","texto":"1 frase con su cifra","tono":"verde|ambar|rojo|azul"} ],  // 3-5 items (posición, tendencia, mayor fortaleza, mayor riesgo)
  "que_pasa": [ "párrafo corto 1", "párrafo corto 2" ],  // 2-4 párrafos que conectan RIXc/posición/tendencia con los hechos concretos de key_points
  "metricas": [ {"code":"NVM","valor":<número EXACTO del datapack o null>,"contexto":"opcional p.ej. vs media","texto":"en 1 frase qué mide y qué implica para el negocio"} ],  // por cada métrica relevante esta semana; usa SOLO los códigos NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM; valores EXACTOS del datapack; CXM valor null si N/A
  "riesgos": [ "1 frase cada uno, de flags/eventos negativos" ],
  "oportunidades": [ "1 frase cada una, palancas concretas" ],
  "recomendaciones": [ {"accion":"imperativo, 1 línea","porque":"la cifra o hecho que la justifica"} ]  // 3-5, priorizadas
}
Cada campo con el mismo rigor y profundidad de las reglas anteriores. PROHIBIDO inventar cifras/empresas/eventos que no estén en los datos. Si es comparativa, en "que_pasa" analiza quién gana/pierde en qué y por qué.

Tono: experto, claro, directo y DIDÁCTICO — como un consultor de primer nivel explicándoselo a un CEO sin tiempo. Cero relleno, cero jerga innecesaria. Pirámide invertida: lo más importante, primero.`;

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

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isAnonKey = token === Deno.env.get("SUPABASE_ANON_KEY");
    const isInternalKey = isServiceRole || isAnonKey;

    if (!isInternalKey) {
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
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const type = body?.type as "profile" | "comparison" | "ranking" | undefined;
    const tickers = Array.isArray(body?.tickers) ? (body.tickers as string[]) : [];
    const from = body?.from ?? null;
    const to = body?.to ?? null;
    const scope = body?.scope ?? null;

    if (type !== "profile" && type !== "comparison" && type !== "ranking") {
      return new Response(
        JSON.stringify({ error: "Invalid body: expected type profile|comparison|ranking" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let datapack: any = null;
    let modelDatapack: any = null;
    if (type === "profile") {
      if (tickers.length === 0) {
        return new Response(
          JSON.stringify({ error: "Invalid body: profile requires { tickers: string[] }" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data, error } = await db.rpc("rix_profile_datapack", { p_ticker: tickers[0], p_from: from, p_to: to });
      if (error) throw new Error(`rix_profile_datapack: ${error.message}`);
      datapack = data;
    } else if (type === "comparison") {
      if (tickers.length === 0) {
        return new Response(
          JSON.stringify({ error: "Invalid body: comparison requires { tickers: string[] }" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data, error } = await db.rpc("rix_comparison_datapack", { p_tickers: tickers, p_from: from, p_to: to });
      if (error) throw new Error(`rix_comparison_datapack: ${error.message}`);
      datapack = data;
    } else {
      const { data, error } = await db.rpc("rix_ranking_datapack", {
        p_sector: scope?.sector ?? null,
        p_subsector: scope?.subsector ?? null,
        p_universe: (Array.isArray(scope?.universe) && scope.universe.filter(Boolean).length ? scope.universe.filter(Boolean) : null),
        p_tickers: (Array.isArray(scope?.tickers) && scope.tickers.filter(Boolean).length ? scope.tickers.filter(Boolean) : null),
        p_from: scope?.from ?? null,
        p_to: scope?.to ?? null,
        p_models: (Array.isArray(scope?.models) && scope.models.filter(Boolean).length ? scope.models.filter(Boolean) : null),
        p_order_by: scope?.orderBy ?? "rixc",
        p_limit: scope?.limit ?? null,
      });
      if (error) throw new Error(`rix_ranking_datapack: ${error.message}`);
      datapack = data;

      const slim = {
        scope: datapack?.scope ?? null,
        window: datapack?.window ?? null,
        latest_week: datapack?.latest_week ?? null,
        prev_week: datapack?.prev_week ?? null,
        order_by: datapack?.order_by ?? null,
        ranking: Array.isArray(datapack?.ranking) ? datapack.ranking : [],
        sector_avg: datapack?.sector_avg ?? null,
        distribution: datapack?.distribution ?? null,
      };
      modelDatapack = slim;
    }

    const tickersForSignals: string[] = type === "ranking"
      ? (Array.isArray(datapack?.ranking) ? datapack.ranking.slice(0, 10).map((r: any) => r.tk) : [])
      : tickers;

    let signals: any = null;
    if (tickersForSignals.length > 0) {
      const { data: sigData, error: sigErr } = await db.rpc("rix_qualitative_signals", { p_tickers: tickersForSignals });
      if (!sigErr) {
        signals = sigData;
      } else {
        console.error(`[report-analysis] rix_qualitative_signals (best-effort): ${sigErr.message}`);
      }
    }

    const effFrom = type === "ranking" ? (scope?.from ?? null) : from;
    const effTo = type === "ranking" ? (scope?.to ?? null) : to;
    const windowLine = (effFrom && effTo)
      ? `\n\nVENTANA TEMPORAL: período ${effFrom} → ${effTo}. Las cifras del datapack son MEDIA DEL PERÍODO. NO hables de 'esta semana'.`
      : "";

    const payloadForModel = type === "ranking" ? modelDatapack : datapack;
    const userMessage = `Tipo de informe: ${type}.${windowLine}\n\nDATOS DETERMINISTAS (datapack):\n${JSON.stringify(payloadForModel)}\n\nSEÑALES CUALITATIVAS (lo que dijo cada uno de los 6 modelos):\n${JSON.stringify(signals)}\n\nDevuelve el análisis como un ÚNICO objeto JSON estructurado, siguiendo EXACTAMENTE tus reglas de FORMATO DE SALIDA.`;

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
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        }),
      });
    };

    const primaryModel = "google/gemini-2.5-pro";
    const fallbackModel = "google/gemini-2.5-flash";
    let aiResp = await callModel(primaryModel);
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`[report-analysis] ${primaryModel} failed: ${aiResp.status} ${errText}`);
      if (aiResp.status === 429 || aiResp.status === 402 || aiResp.status >= 500) {
        aiResp = await callModel(fallbackModel);
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
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";

    if (!raw) {
      return new Response(JSON.stringify({ error: "Empty analysis from model" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the model output as a structured JSON object.
    // Strip ``` fences if present, then extract from the first { to the last }.
    let analysisJson: any = null;
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
      }
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      const jsonStr = (first !== -1 && last !== -1 && last > first) ? cleaned.slice(first, last + 1) : cleaned;
      analysisJson = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("[report-analysis] JSON parse failed, returning raw text fallback:", parseErr instanceof Error ? parseErr.message : String(parseErr));
      analysisJson = null;
    }

    if (analysisJson && typeof analysisJson === "object") {
      return new Response(JSON.stringify({ analysis_json: analysisJson }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: return the raw text so the front can still render markdown and never break.
    return new Response(JSON.stringify({ analysis: raw }), {
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
