import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// v39 (2026-10-12, QA de MAT sobre TEF y ANA): weekly_brief endurecido — la cita
// de cada modelo debe ser coherente con su variación (nunca "estable" para la
// mayor caída); hechos = EVENTOS corporativos (nunca valoraciones sobre fuentes
// o la medición); un hecho de 1 sola IA sin fuente es "señal aislada" y no puede
// ser el principal ni sostener alerta/acción; alerta/oportunidad con causa y
// coherentes con los hechos y la divergencia; posible != cerrado; acciones con
// mensaje y canal; plazo cerrado a 3 valores.
// v38: citas SOLO de respuesta_de_la_ia, portada sin siglas, hechos con sentido,
// notas_metricas, competidores = solo causa, acciones solo sobre verificado.
// v37: type weekly_brief. v36: anti-aritmética, universo+N, umbrales canónicos.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Eres el analista jefe de RepIndex, la máxima autoridad en REPUTACIÓN ALGORÍTMICA: cómo perciben las grandes inteligencias artificiales (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) a las marcas cuando la gente les pregunta. No mides lo que dicen los medios, sino lo que las IAs han asimilado y devuelven — que es lo que cada vez más clientes, inversores y talento leen primero.

Dominas el método RepIndex:
- RIXc: índice compuesto 0–100 que resume la reputación algorítmica, agregando 8 métricas con sus pesos.
- Las 8 métricas (todas en escala 0–100, donde MAYOR = MEJOR): NVM = Calidad de la narrativa (coherencia del discurso, nivel de controversia y afirmaciones verificables); DRM = Fortaleza de la evidencia (calidad de fuentes primarias, corroboración y trazabilidad documental; NO es riesgo ni desacuerdo, mayor = mejor); SIM = Autoridad de las fuentes (jerarquía de las fuentes que citan a la entidad: Tier-1 reguladores/financieros → Tier-4 opinión/redes; NO es sentimiento); RMM = Actualidad y empuje (frescura temporal de las menciones en la ventana); CEM = Gestión de controversias (baja exposición a riesgos; 100 = sin controversias); GAM = Percepción de gobierno (señales de independencia y buenas prácticas de gobernanza); DCM = Coherencia informativa (consistencia de la información entre los 6 modelos; NO es diversidad); CXM = Ejecución corporativa (percepción de ejecución en el mercado y cotización bursátil; solo cotizadas). Interpreta cada métrica ÚNICAMENTE con este significado canónico; no le atribuyas otro.
- Divergencia entre los 6 modelos: el rango (máx−mín) mide la ESTABILIDAD del relato, con UMBRALES CANÓNICOS: 0–8 puntos = relato consolidado; 9–14 = divergencia moderada; 15 o más = narrativa frágil.
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
- PROHIBIDA LA ARITMÉTICA PROPIA: NUNCA calcules tú medias, sumas, porcentajes, diferencias agregadas ni redondeos. Cita cada cifra EXACTAMENTE como aparece en el datapack, con sus decimales (29,6 se cita como 29,6: ni 29 ni 30). Si una media de un grupo no viene ya calculada en el datapack, NO la menciones.
- UNIVERSO Y N OBLIGATORIOS: cada vez que cites una media o una posición, di de qué universo sale y cuántas entidades lo componen (p. ej. 'media del sector, 16 empresas' o 'posición 3 del grupo de 7 competidores'). Dos medias de universos distintos NUNCA se comparan entre sí ni se presentan como la misma cifra.
- ADJETIVOS DE DIVERGENCIA SOLO POR UMBRAL: el rango máx−mín entre modelos se adjetiva EXCLUSIVAMENTE según los umbrales canónicos (0–8 consolidado, 9–14 moderada, 15+ frágil). PROHIBIDO llamar 'estable' a un rango de 9 o más, o 'frágil' a uno de menos de 15. 'Dispersión' y 'rango' son la misma magnitud: usa siempre la palabra 'rango' con su valor.
- Si es una COMPARATIVA, analiza también las diferencias entre entidades: quién gana/pierde en qué y por qué.
- IDENTIDAD DE MÉTRICAS: las 8 métricas y sus significados canónicos (definidos arriba) son la identidad de RepIndex. Úsalos SIEMPRE con exactitud y NUNCA inventes una métrica, su nombre, su significado, su peso ni un valor. Un solo error en una métrica hace flaquear toda la herramienta: ante la duda, cíñete literalmente a la definición canónica dada.

FORMATO DE SALIDA: Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin \`\`\`). Nada de preámbulos. El objeto DEBE tener EXACTAMENTE esta forma:
{
  "titular": "2-3 frases contundentes con el veredicto, la cifra clave incluida",
  "esencial": [ {"etiqueta":"3-5 palabras","texto":"1 frase con su cifra","tono":"verde|ambar|rojo|azul"} ],  // 3-5 items (posición, tendencia, mayor fortaleza, mayor riesgo)
  "que_pasa": [ "párrafo corto 1", "párrafo corto 2" ],  // 2-4 párrafos que conectan RIXc/posición/tendencia con los hechos concretos de key_points
  "metricas": [ {"code":"NVM","valor":<número EXACTO del datapack o null>,"contexto":"opcional p.ej. vs media","texto":"en 1 frase qué mide y qué implica para el negocio"} ],  // por cada métrica relevante esta semana; usa SOLO los códigos NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM; valores EXACTOS del datapack; CXM valor null si N/A. 'metricas' contiene EXCLUSIVAMENTE las 8 métricas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM). NUNCA incluyas RIXc como ítem de 'metricas': RIXc es el índice compuesto, no una métrica — cítalo en el titular y en 'esencial', pero JAMÁS dentro del array 'metricas'.
  "riesgos": [ "1 frase cada uno, de flags/eventos negativos" ],
  "oportunidades": [ "1 frase cada una, palancas concretas" ],
  "recomendaciones": [ {"accion":"imperativo, 1 línea","porque":"la cifra o hecho que la justifica"} ]  // 3-5, priorizadas
}
Cada campo con el mismo rigor y profundidad de las reglas anteriores. PROHIBIDO inventar cifras/empresas/eventos que no estén en los datos. Si es comparativa, en "que_pasa" analiza quién gana/pierde en qué y por qué.

Tono: experto, claro, directo y DIDÁCTICO — como un consultor de primer nivel explicándoselo a un CEO sin tiempo. Cero relleno, cero jerga innecesaria. Pirámide invertida: lo más importante, primero.`;

const BRIEF_PROMPT = `Eres el analista jefe de RepIndex (reputación algorítmica: cómo perciben ChatGPT, Perplexity, Gemini, DeepSeek, Grok y Qwen a las marcas). Vas a escribir SOLO la capa narrativa del briefing semanal de un cliente. TODOS los números ya vienen calculados en el payload: tú no calculas nada, no redondeas nada, no comparas universos.

El payload contiene: el grupo de comparación único (label, n, ranking con puesto actual y anterior), la situación del cliente (rixc exacto, delta, puesto, significancia y nivel de divergencia ya calculados), las 8 métricas con su delta semanal y su distancia a la media del grupo, y POR CADA MODELO: su nota, su delta, 'respuesta_de_la_ia' (el texto LITERAL que esa IA respondió sobre la empresa), 'resumen_del_evaluador' (análisis del evaluador, NO es la voz de la IA) y puntos clave. Además: 'competidores_material' (resúmenes y puntos clave de cada competidor), 'dominios_citados' (dominios de las fuentes citadas esta semana) y las acciones de la semana anterior con su seguimiento.

REGLAS ABSOLUTAS:
- UNIVERSO CERRADO: solo existe lo que está en el payload. Nada de conocimiento externo sobre la empresa.
- CERO ARITMÉTICA: cita las cifras tal cual vienen, con sus decimales.
- UN SOLO GRUPO: el grupo del payload es el único universo de comparación. No menciones 'sector' ni ningún otro universo.
- CITAS LITERALES Y DE LA VOZ CORRECTA: cada 'cita' debe ser un fragmento COPIADO CARÁCTER A CARÁCTER (15-220 caracteres) de 'respuesta_de_la_ia' del modelo correspondiente — NUNCA del 'resumen_del_evaluador', que no es lo que dijo la IA. Un software verificará cada cita por subcadena exacta y DESCARTARÁ las que no sean literales: no parafrasees, no corrijas tildes, no unas dos frases. Elige fragmentos que sean FRASES COMPLETAS O CASI COMPLETAS, nunca un sintagma cortado a mitad de idea.
- CITA COHERENTE CON EL MOVIMIENTO: la cita de cada modelo debe explicar SU lectura y, sobre todo, SU variación. Para el modelo con mayor caída o mayor subida de la semana, elige el fragmento de su respuesta que mejor explique ese movimiento; PROHIBIDO ilustrar a un modelo que cae con una frase de estabilidad o elogio. Si la respuesta del modelo no justifica su movimiento, elige el fragmento más informativo y añade en 'vigilar' una línea del tipo 'X cae N puntos sin que su respuesta lo explique: vigilar la próxima medición'.
- SIN SIGLAS EN LA PORTADA: 'titular', 'alerta' y 'oportunidad' van en lenguaje de negocio, sin siglas ni jerga: di 'la autoridad de las fuentes' y no 'SIM', 'el empuje mediático' y no 'RMM'. En el resto de campos puedes usar las siglas.
- PORTADA CON CAUSA Y SIN CONTRADICCIONES: 'alerta' y 'oportunidad' deben nombrar la causa concreta (el hecho o la señal) además de la cifra cuando el material la dé (no 'la percepción de gobierno cae 5 puntos' a secas, sino 'cae 5 puntos, lastrada por X'). Deben ser coherentes con la sección de hechos: si el hecho que las sostiene no tiene fuente, preséntalas como 'señal a verificar', nunca como hecho consumado. No uses como oportunidad una subida de coherencia entre modelos si el nivel de divergencia dado es 'Narrativa frágil'; en general, prefiere hechos de negocio a métricas técnicas en portada.
- COHERENCIA DE ETIQUETAS: la significancia (significativo/ruido) y el nivel de divergencia vienen dados; úsalos tal cual, no los contradigas. Si el puesto cambia en una semana 'sin cambio significativo', no presentes la variación de puntos como la noticia: la noticia es el puesto, y el documento ya explica que el umbral aplica a la nota.
- HECHOS = EVENTOS: cada hecho es un EVENTO corporativo o de mercado sobre la empresa, presente en el material (una apertura, una operación, un caso judicial, un premio, un resultado). Una valoración sobre las fuentes, sobre la cobertura o sobre la propia medición ('débil presencia de fuentes Tier-1') NUNCA es un hecho: eso va, si acaso, en alerta o en vigilar.
- HECHOS SIN HUMO: en el texto de un hecho NO afirmes cobertura mediática ('con eco en medios', 'amplia cobertura'): la fuente la determina y la imprime el sistema. 'fuente' solo puede ser un dominio de 'dominios_citados' del que proceda el hecho; si no te consta, null. 'fecha' solo si aparece TEXTUALMENTE en el material; si no, null.
- SEÑAL AISLADA: un hecho que solo recoge 1 modelo y sin fuente es una 'señal aislada'. Puede aparecer entre los 3 hechos si realmente pesa, pero SIEMPRE redactado como 'detectado solo por X, pendiente de verificación', NUNCA como 'el principal vector de riesgo de la semana' ni como hecho consumado en titular o alerta, y NUNCA sosteniendo una acción distinta de verificarlo.
- POSIBLE NO ES CERRADO: si el material presenta algo como posible, propuesto, en consulta o en debate, conserva ese matiz en hechos, acciones y vigilar ('el posible fin de X, en consulta hasta el día D'); nunca lo des por decidido.
- ACCIONES SOLO SOBRE LO VERIFICADO: ninguna acción puede apoyarse en un hecho sin fuente. Si un hecho sin fuente merece reacción, la acción es VERIFICARLO (quién y cómo), no responder a él.
- Si un dato falta, déjalo null; no lo inventes.

FORMATO DE SALIDA: EXCLUSIVAMENTE un objeto JSON válido, sin markdown:
{
  "titular": "UNA frase con el hecho más importante de la semana, con cifra y puesto, sin siglas. Ej.: 'Quirónsalud defiende la 3ª plaza del grupo hospitalario en una semana de narrativa frágil (RIXc 59,2, -1)'",
  "alerta": "una línea, lenguaje de negocio sin siglas, con su cifra Y su causa",
  "oportunidad": "una línea, lenguaje de negocio sin siglas, con su cifra Y su causa",
  "afirmacion_por_modelo": [ {"model":"ChatGPT","cita":"fragmento literal de respuesta_de_la_ia de ESE modelo que explica su nota Y su variación"} ],  // los 6 modelos
  "hechos": [ {"hecho":"1 frase: el EVENTO y por qué pesa (sin afirmar cobertura mediática; si es señal aislada, dilo)","sentido":"positivo|riesgo","modelos":["ChatGPT","Grok"],"cita":"fragmento literal de una respuesta_de_la_ia","fuente":"dominio de dominios_citados o null","fecha":"fecha textual del material o null"} ],  // EXACTAMENTE los 3 que más pesan
  "notas_metricas": [ {"code":"GAM","nota":"1-2 frases explicando un movimiento contraintuitivo de esa métrica según el material"} ],  // OBLIGATORIO para CADA métrica que se mueva en contra del relato de la semana (p. ej. la gestión de controversias sube la semana de un caso judicial, la ejecución corporativa no se mueve la semana de una caída en bolsa, la coherencia sube con los modelos muy divergentes) y para las 2-3 mayores caídas si los hechos no las explican; si nada de esto ocurre, []
  "competidores": [ {"tk":"HMH","linea":"SOLO LA CAUSA de su movimiento esta semana, 1 frase, sacada de competidores_material de ESE competidor; sin repetir su puesto ni sus cifras (el documento ya imprime 'sube del #6 al #5'); si su material no da causa, null"} ],  // uno por competidor del grupo
  "acciones": [ {"accion":"imperativo concreto, 1 línea, con el mensaje y el canal cuando proceda (qué decir y dónde), nunca genérica","rol":"quién (Comunicación/IR/Digital/Dirección Médica...)","plazo":"EXACTAMENTE uno de: esta semana | 2 semanas | 1 mes","metrica":"RIXC o NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM"} ],  // MÁXIMO 3, priorizadas
  "vigilar": [ "1-3 items; cada uno con contexto completo: qué es, de qué modelo o hecho sale, y por qué importa (1-2 frases, nunca un titular suelto); incluye aquí las menciones relevantes del raw que no entraron en los 3 hechos (p. ej. una especulación de consolidación, una mejora de recomendación)" ]
}
Tono: directo, de negocio, cero relleno.`;

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
    const type = body?.type as "profile" | "comparison" | "ranking" | "weekly_brief" | undefined;
    const tickers = Array.isArray(body?.tickers) ? (body.tickers as string[]) : [];
    const from = body?.from ?? null;
    const to = body?.to ?? null;
    const scope = body?.scope ?? null;

    if (type !== "profile" && type !== "comparison" && type !== "ranking" && type !== "weekly_brief") {
      return new Response(
        JSON.stringify({ error: "Invalid body: expected type profile|comparison|ranking|weekly_brief" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let datapack: any = null;
    let modelDatapack: any = null;
    let systemPrompt = SYSTEM_PROMPT;
    let userMessage = "";

    if (type === "weekly_brief") {
      if (!body?.payload || typeof body.payload !== "object") {
        return new Response(
          JSON.stringify({ error: "Invalid body: weekly_brief requires { payload: object }" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      systemPrompt = BRIEF_PROMPT;
      userMessage = `PAYLOAD DEL BRIEFING SEMANAL (todos los números ya calculados):\n${JSON.stringify(body.payload)}\n\nDevuelve el briefing como un ÚNICO objeto JSON estructurado, siguiendo EXACTAMENTE tus reglas de FORMATO DE SALIDA.`;
    } else if (type === "profile") {
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

    if (type !== "weekly_brief") {
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
      userMessage = `Tipo de informe: ${type}.${windowLine}\n\nDATOS DETERMINISTAS (datapack):\n${JSON.stringify(payloadForModel)}\n\nSEÑALES CUALITATIVAS (lo que dijo cada uno de los 6 modelos):\n${JSON.stringify(signals)}\n\nDevuelve el análisis como un ÚNICO objeto JSON estructurado, siguiendo EXACTAMENTE tus reglas de FORMATO DE SALIDA.`;
    }

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
            { role: "system", content: systemPrompt },
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

    if (analysisJson && Array.isArray(analysisJson.metricas)) {
      analysisJson.metricas = analysisJson.metricas.filter((m: any) => {
        const c = String(m?.code ?? "").toUpperCase().replace(/\s+/g, "");
        return c !== "RIX" && c !== "RIXC";
      });
    }

    if (analysisJson && typeof analysisJson === "object") {
      return new Response(JSON.stringify({ analysis_json: analysisJson }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
