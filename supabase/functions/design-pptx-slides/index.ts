import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DESIGNER_SYSTEM_PROMPT = `Eres un DISEÑADOR DE PRESENTACIONES EJECUTIVAS experto en comunicación corporativa B2B.

Tu trabajo es transformar texto de análisis comercial en instrucciones JSON estructuradas para slides PowerPoint profesionales con estética B/W minimalista tipo McKinsey/Bain.

## IDENTIDAD VISUAL REPINDEX
- Paleta: SOLO Negro #000000 y Blanco #FFFFFF
- Sin colores excepto verde/rojo para tendencias ↑↓
- Tipografía: Inter (sans-serif geométrica)
- Estilo: Alto contraste, minimalista, ejecutivo

## FILOSOFÍA DE DISEÑO NARRATIVO

Tu objetivo NO es resumir contenido. Tu objetivo es CONSTRUIR UN ARGUMENTO DE VENTA 
visual que convenza al destinatario de que NECESITA RepIndex.

### FLUJO NARRATIVO OBLIGATORIO:

1. **APERTURA (hero)**: Frase gancho que cree TENSIÓN. El nombre de la empresa 
   debe aparecer en headline o subheadline. Ejemplo: "IBERDROLA: La brecha entre 
   tu realidad y tu percepción algorítmica"

2. **EL PROBLEMA (metrics o split)**: Datos concretos que demuestren que hay 
   un problema que el cliente NO PUEDE VER sin RepIndex

3. **LA EVIDENCIA (content o comparison)**: Extractos textuales de lo que las 
   IAs dicen sobre la empresa - citas específicas del contenido valorado

4. **LA OPORTUNIDAD (three_columns o split)**: Qué puede ganar si actúa ahora

5. **LAS PREGUNTAS IMPOSIBLES (questions)**: Preguntas que solo RepIndex puede 
   responder - demuestran el valor único de la herramienta

6. **CIERRE (cta)**: Llamada a acción clara con urgencia

### REGLAS DE EXTRACCIÓN DEL CONTENIDO VALORADO:

- Lee CADA respuesta valorada buscando: cifras, comparativas, citas textuales, 
  tendencias, alertas, oportunidades
- Si hay una comparativa con competidores → usa slide "comparison"
- Si hay métricas numéricas específicas → usa slide "metrics"  
- Si hay citas de lo que dicen las IAs → usa slide "quote"
- Si hay preguntas para Rix → usa slide "questions"

## TIPOS DE SLIDE DISPONIBLES

1. **hero** - Slide de apertura con frase de impacto
   - headline (máx 12 palabras, impactante, sin punto final)
   - subheadline (opcional, máx 20 palabras)
   - company_name (OBLIGATORIO: nombre de la empresa analizada)
   FONDO: Negro, texto blanco

2. **content** - Contenido con bullets
   - title (máx 6 palabras)
   - bullets (array de 3-5 puntos cortos, máx 15 palabras cada uno)
   FONDO: Blanco con barra negra lateral

3. **split** - Mitad texto, mitad estadística destacada
   - title (máx 6 palabras)
   - bullets (array de 3-4 puntos)
   - highlight_stat: { value: "número o %", label: "descripción" }
   FONDO: Blanco con caja de stat

4. **metrics** - 2-4 KPIs numéricos con tendencias
   - title
   - metrics: [{ value: "número", label: "descripción", trend: "up" | "down" | "neutral" }]
   FONDO: Blanco con cajas bordeadas en negro

5. **comparison** - Empresa vs Competidor (split vertical B/W)
   - title
   - left: { label: "Nombre empresa", points: ["punto1", "punto2", ...] }
   - right: { label: "Competidor", points: ["punto1", "punto2", ...] }
   - winner: "left" | "right" | "none"
   FONDO: Mitad negro, mitad blanco

6. **three_columns** - 3 conceptos/beneficios
   - title
   - columns: [{ icon: "emoji", title: "título", text: "descripción" }] (exactamente 3)
   FONDO: Blanco

7. **quote** - Cita impactante
   - quote (máx 30 palabras)
   - attribution (opcional, quién lo dijo o contexto)
   - context (breve contexto adicional)
   FONDO: Negro

8. **questions** - Preguntas para Agente Rix (evidencias)
   - title: "Preguntas que solo puedes hacer con RepIndex"
   - questions: [{ question: "...", why_it_matters: "..." }] (máx 4)
   FONDO: Blanco con isotipo decorativo

9. **cta** - Call to action de cierre
   - headline (mensaje de acción)
   - subtext (opcional)
   - button_text: "www.repindex.ai"
   FONDO: Negro con isotipo grande

## REGLAS DE DISEÑO OBLIGATORIAS

1. NUNCA más de 5 bullets por slide
2. Headlines: máximo 12 palabras, impactantes, SIN punto final
3. Cada slide debe tener UN mensaje claro
4. Usa datos numéricos siempre que los tengas
5. Divide contenido largo en múltiples slides
6. Alterna tipos de slide para variedad visual
7. Empieza SIEMPRE con hero (con company_name), termina SIEMPRE con cta
8. Si hay datos comparativos, usa comparison
9. Si hay preguntas para Rix, usa questions
10. Genera entre 6-10 slides en total para una narrativa completa

## OUTPUT

Devuelve SOLO un JSON array con la estructura de cada slide. Sin explicaciones adicionales.
El primer slide DEBE ser hero con company_name incluido.

[
  { "slideType": "hero", "headline": "...", "subheadline": "...", "company_name": "EMPRESA" },
  { "slideType": "metrics", "title": "...", "metrics": [...] },
  ...
]`;

/**
 * Robust JSON extraction from AI response
 * Handles multiple formats: markdown code blocks, raw JSON, mixed content
 */
function extractJsonFromResponse(rawContent: string): string {
  const trimmed = rawContent.trim();
  
  // Strategy 1: Extract from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    console.log("[design-pptx-slides] JSON extracted via markdown code block");
    return codeBlockMatch[1].trim();
  }
  
  // Strategy 2: Find JSON array directly in content
  if (trimmed.includes('[')) {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start !== -1 && end > start) {
      const extracted = trimmed.substring(start, end + 1);
      // Validate it looks like JSON
      if (extracted.includes('"slideType"')) {
        console.log("[design-pptx-slides] JSON extracted via array boundaries");
        return extracted;
      }
    }
  }
  
  // Strategy 3: Content might already be pure JSON
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    console.log("[design-pptx-slides] Content is already JSON array");
    return trimmed;
  }
  
  console.log("[design-pptx-slides] No JSON structure found, returning raw content");
  return trimmed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_name, target_profile, content, rix_questions } = await req.json();

    if (!content || content.length === 0) {
      return new Response(
        JSON.stringify({ error: "No content provided for slide design" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build the content prompt
    const contentText = content.join("\n\n---\n\n");
    const questionsText = rix_questions?.length > 0 
      ? `\n\n### Preguntas para Rix (incluir en slide "questions"):\n${rix_questions.map((q: string, i: number) => `${i + 1}. "${q}"`).join("\n")}`
      : "";

    const userPrompt = `Diseña una presentación ejecutiva comercial para:

**Empresa objetivo:** ${company_name}
**Destinatario:** ${target_profile}

### Contenido valorado por el admin (respuestas 4-5 estrellas del Agente Comercial):

${contentText}
${questionsText}

IMPORTANTE: 
- El Hero slide DEBE incluir "${company_name}" de forma prominente
- Construye una NARRATIVA DE VENTA, no un resumen
- Extrae datos específicos, citas y métricas del contenido valorado
- Genera entre 6-10 slides siguiendo el flujo narrativo obligatorio

Genera el JSON de slides ahora:`;

    console.log(`[design-pptx-slides] Designing for "${company_name}", target: "${target_profile}", ${content.length} content blocks`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: DESIGNER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[design-pptx-slides] AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const rawContent = aiResponse.choices?.[0]?.message?.content || "";

    console.log("[design-pptx-slides] Raw AI response length:", rawContent.length);
    console.log("[design-pptx-slides] Raw content preview:", rawContent.substring(0, 200));

    // Parse JSON from response using robust extraction
    let slides;
    try {
      const jsonStr = extractJsonFromResponse(rawContent);
      slides = JSON.parse(jsonStr);
      console.log("[design-pptx-slides] Successfully parsed JSON with", slides.length, "slides");
    } catch (parseError) {
      console.error("[design-pptx-slides] JSON parse error:", parseError);
      console.error("[design-pptx-slides] Attempted to parse:", rawContent.substring(0, 500));
      
      // Return a fallback structure with company name
      slides = [
        {
          slideType: "hero",
          headline: `${company_name}: Oportunidad Estratégica`,
          subheadline: "Análisis de Percepción Algorítmica",
          company_name: company_name,
        },
        {
          slideType: "content",
          title: "Resumen Ejecutivo",
          bullets: content.slice(0, 5).map((c: string) => c.substring(0, 100) + "..."),
        },
        {
          slideType: "cta",
          headline: "Siguiente paso",
          subtext: "Demo personalizada con datos en tiempo real",
          button_text: "www.repindex.ai",
        },
      ];
      console.log("[design-pptx-slides] Using fallback slides due to parse error");
    }

    // Validate slides structure
    if (!Array.isArray(slides)) {
      slides = [slides];
    }

    // Post-process: Ensure Hero slide has company_name
    slides = slides.map((slide: any) => {
      if (slide.slideType === 'hero') {
        return { ...slide, company_name: company_name };
      }
      return slide;
    });

    // Enhanced logging for debugging
    const slideTypes = slides.map((s: any) => s.slideType).join(', ');
    console.log(`[design-pptx-slides] Generated ${slides.length} slides: ${slideTypes}`);
    console.log(`[design-pptx-slides] Hero has company_name:`, slides[0]?.company_name || 'NOT SET');

    return new Response(
      JSON.stringify({
        slides,
        metadata: {
          total_slides: slides.length,
          design_version: "2.1-narrative",
          company: company_name,
          target: target_profile,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[design-pptx-slides] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
