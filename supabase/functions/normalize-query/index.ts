import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Eres el normalizador de consultas de RepIndex.ai. Tu trabajo es reescribir la pregunta del usuario para que active correctamente los skills del sistema.

SKILLS DISPONIBLES:
- companyProfile: Análisis completo de reputación de UNA empresa. Trigger: 'Analiza la reputación de [EMPRESA]'
- sectorComparison: Comparar empresas de un sector. Trigger: 'Top [N] del [SECTOR/INDICE]'
- indexRanking: Ranking general de un índice o universo completo. Trigger: 'Ranking del [ÍNDICE]' o 'Qué empresa del [ÍNDICE] tiene mejor/peor [MÉTRICA]'
- companyComparison: Comparar dos empresas. Trigger: 'Compara [EMPRESA1] con [EMPRESA2]'
- evolution: Evolución temporal. Trigger: 'Evolución de [EMPRESA]'
- divergence: Divergencia entre IAs. Trigger: '¿Por qué las IAs divergen sobre [EMPRESA]?'
- metricDeepDive: Análisis de una métrica específica. Trigger: 'Analiza [METRICA] de [EMPRESA]'

MÉTRICAS VÁLIDAS: NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM

DICCIONARIO DE SINÓNIMOS MULTILINGÜE:

Antes de clasificar la consulta, normaliza estos conceptos:

1) Si el usuario menciona CUALQUIERA de estos términos, interpreta que pregunta sobre VALORACIÓN BURSÁTIL / CXM (stock price):

   ES: cotización, precio de mercado, capitalización bursátil, valor en bolsa, precio de la acción, valoración de mercado, valor bursátil, precio bursátil, tasación de mercado, valor de cotización, precio de negociación, valoración bursátil

   EN: stock price, market valuation, market capitalization, market cap, share price, equity valuation, stock valuation, market price, trading price, market worth, stock market value, equity price

   PT: cotação, preço de mercado, capitalização bolsista, valor em bolsa, preço da ação, avaliação de mercado, valor bolsista, preço bolsista, valor de cotação, preço de negociação

   CA: cotització, preu de mercat, capitalització borsària, valor en borsa, preu de l'acció, valoració de mercat

   -> Reescribe la consulta usando 'valoración bursátil' o 'CXM' en el trigger. Usa skill_hint: 'metricDeepDive' con métrica CXM.

2) Si el usuario menciona CUALQUIERA de estos términos, interpreta que pregunta sobre DESACOPLAMIENTO entre reputación y mercado:

   ES: desacoplamiento, divergencia, desconexión, desfase, disociación, brecha, descorrelación, desalineación, desvinculación, separación, distanciamiento, asimetría, discrepancia, desajuste, desequilibrio, falta de correspondencia

   EN: decoupling, divergence, disconnect, misalignment, gap, decorrelation, dislocation, detachment, discrepancy, mismatch, asymmetry, deviation, disparity, spread, imbalance, delinking

   PT: desacoplamento, divergência, desconexão, descorrelação, desalinhamento, desequilíbrio, discrepância, diferença, assimetria

   CA: desacoblament, divergència, desconnexió, desfasament, bretxa, desalineació

   -> Reescribe la consulta usando 'desacoplamiento' en el trigger. Usa skill_hint: 'divergence'.

3) Si el usuario menciona CUALQUIERA de estos términos, interpreta que pregunta sobre RESULTADOS FINANCIEROS:

   ES: cuentas anuales, presentación de resultados financieros, resultados trimestrales, resultados anuales, informe financiero, memoria anual, presentación a inversores, presentación de analistas, earnings, beneficio neto, ingresos, EBITDA, guidance, previsión de resultados, rendición de cuentas

   EN: financial results, annual accounts, earnings release, earnings call, quarterly results, annual report, investor presentation, results presentation, financial statements, accountability

   PT: contas anuais, resultados financeiros, demonstrações financeiras, relatório anual, apresentação de resultados, resultados trimestrais, prestação de contas

   CA: comptes anuals, resultats financers, presentació de resultats, rendició de comptes

   -> Reescribe la consulta mencionando 'resultados financieros' y la empresa. Usa skill_hint: 'companyProfile'.

4) Si el usuario menciona CUALQUIERA de estos términos, interpreta que pregunta sobre EQUITY STORY:

   ES: equity story, relato de equity, historia de inversión, tesis de inversión, narrativa de la compañía para el mercado, relato estratégico para inversores

   EN: equity story, investment thesis, equity narrative, company story for investors, strategic narrative

   PT: equity story, tese de investimento, narrativa para investidores, história de investimento

   CA: equity story, tesi d'inversió, narrativa per a inversors

   -> Reescribe la consulta mencionando 'equity story' y la empresa. Usa skill_hint: 'companyProfile'.

REGLA CLAVE: Si la consulta combina varios conceptos (ej: 'stock price vs reputación de Telefónica'), detecta AMBOS y usa el skill más apropiado (metricDeepDive para CXM, divergence para desacoplamiento).

REGLAS:
1. Si detectas una empresa, reescribe usando el nombre EXACTO (no abreviaturas)
2. Si la consulta es en inglés/portugués/catalán, reescríbela en ESE idioma pero con el formato de trigger correspondiente
3. Si la consulta es vaga (ej: 'qué tal Repsol'), reescribe como 'Analiza la reputación de Repsol'
4. Si detectas intención de comparar, usa el trigger de comparación
5. Si NO puedes identificar qué empresa o acción quiere el usuario, marca needs_clarification=true. EXCEPCIÓN: preguntas sobre índices (IBEX 35, IBEX Medium Cap, etc.), rankings generales o el universo completo de empresas son SIEMPRE válidas — usa indexRanking o sectorComparison
6. Nunca inventes empresas. Si no reconoces el nombre, déjalo tal cual
7. Si el usuario pregunta algo completamente fuera de tema (clima, deportes, cocina, etc. — nada relacionado con reputación corporativa o empresas), marca needs_clarification=true con mensaje: 'Solo puedo analizar la reputación de empresas monitorizadas por RepIndex'
8. Preguntas sobre rankings, consenso, mejores/peores empresas, alertas reputacionales o cualquier tema de reputación corporativa son SIEMPRE válidas, aunque no mencionen una empresa específica

EJEMPLOS de consultas válidas que NO deben rechazarse:
- "¿Qué empresa del ibex 35 tiene más consenso entre las IAs?" → indexRanking
- "¿Cuál es la empresa con mejor reputación?" → indexRanking
- "Ranking de las 10 mejores" → indexRanking
- "Top 5 del sector energía" → sectorComparison
- "¿Qué empresa tiene peor reputación digital?" → indexRanking

Responde SIEMPRE en JSON con este formato exacto:
{"normalized_query": "...", "skill_hint": "companyProfile|sectorComparison|indexRanking|companyComparison|evolution|divergence|metricDeepDive|null", "detected_company": "nombre o null", "detected_ticker": "ticker o null", "confidence": 0.0-1.0, "needs_clarification": false, "clarification_message": null}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, language } = await req.json();

    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(
        JSON.stringify({
          normalized_query: query || "",
          original_query: query || "",
          skill_hint: null,
          detected_company: null,
          detected_ticker: null,
          confidence: 0,
          needs_clarification: true,
          clarification_message: "Por favor, escribe una pregunta.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("[normalize-query] OPENAI_API_KEY not set, returning raw query");
      return new Response(
        JSON.stringify({
          normalized_query: query,
          original_query: query,
          skill_hint: null,
          detected_company: null,
          detected_ticker: null,
          confidence: 0,
          needs_clarification: false,
          clarification_message: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call GPT-4o-mini with 3s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    let llmResult: Record<string, unknown> | null = null;

    try {
      const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 200,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Idioma del usuario: ${language || "es"}\nConsulta: ${query}` },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (openaiResp.ok) {
        const data = await openaiResp.json();
        const raw = data.choices?.[0]?.message?.content || "";
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          llmResult = JSON.parse(jsonMatch[0]);
        }
      } else {
        console.error("[normalize-query] OpenAI error:", openaiResp.status);
      }
    } catch (err) {
      clearTimeout(timeout);
      console.warn("[normalize-query] LLM call failed (timeout or error):", err);
    }

    // If LLM failed, return raw query (graceful degradation)
    if (!llmResult) {
      return new Response(
        JSON.stringify({
          normalized_query: query,
          original_query: query,
          skill_hint: null,
          detected_company: null,
          detected_ticker: null,
          confidence: 0,
          needs_clarification: false,
          clarification_message: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate detected company against repindex_root_issuers
    const detectedCompany = llmResult.detected_company as string | null;
    const detectedTicker = llmResult.detected_ticker as string | null;
    let validatedCompany = detectedCompany;
    let validatedTicker = detectedTicker;

    if (detectedCompany || detectedTicker) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const searchTerm = detectedCompany || detectedTicker || "";
        const { data: issuers } = await sb
          .from("repindex_root_issuers")
          .select("issuer_id, issuer_name, ticker")
          .or(
            `issuer_name.ilike.%${searchTerm}%,ticker.ilike.%${searchTerm}%`
          )
          .limit(1);

        if (issuers && issuers.length > 0) {
          validatedCompany = issuers[0].issuer_name;
          validatedTicker = issuers[0].ticker;

          // Replace detected name with validated name in normalized_query
          let nq = (llmResult.normalized_query as string) || query;
          if (detectedCompany && detectedCompany !== validatedCompany) {
            nq = nq.replace(new RegExp(detectedCompany, "gi"), validatedCompany);
          }
          llmResult.normalized_query = nq;
        }
      } catch (dbErr) {
        console.warn("[normalize-query] DB validation failed:", dbErr);
      }
    }

    return new Response(
      JSON.stringify({
        normalized_query: (llmResult.normalized_query as string) || query,
        original_query: query,
        skill_hint: llmResult.skill_hint || null,
        detected_company: validatedCompany,
        detected_ticker: validatedTicker,
        confidence: llmResult.confidence ?? 0.5,
        needs_clarification: llmResult.needs_clarification ?? false,
        clarification_message: llmResult.clarification_message || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[normalize-query] Unexpected error:", err);
    // Try to extract original query for graceful fallback
    let fallbackQuery = "";
    try {
      const body = await req.clone().json();
      fallbackQuery = body.query || "";
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({
        normalized_query: fallbackQuery,
        original_query: fallbackQuery,
        skill_hint: null,
        detected_company: null,
        detected_ticker: null,
        confidence: 0,
        needs_clarification: false,
        clarification_message: null,
      }),
      {
        status: 200, // Return 200 even on error for graceful degradation
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
