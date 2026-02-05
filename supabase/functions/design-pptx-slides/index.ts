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

## TIPOS DE SLIDE DISPONIBLES

1. **hero** - Slide de apertura con frase de impacto
   - headline (máx 12 palabras, impactante, sin punto final)
   - subheadline (opcional, máx 20 palabras)
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
7. Empieza SIEMPRE con hero, termina SIEMPRE con cta
8. Si hay datos comparativos, usa comparison
9. Si hay preguntas para Rix, usa questions
10. Máximo 8-10 slides en total

## ESTRUCTURA RECOMENDADA

1. hero: Apertura con frase gancho
2. metrics o split: Los datos clave
3. content o three_columns: El problema/oportunidad
4. comparison: Empresa vs competencia (si aplica)
5. quote: Insight o cita impactante (opcional)
6. questions: Preguntas para Rix
7. cta: Cierre con llamada a acción

## OUTPUT

Devuelve SOLO un JSON array con la estructura de cada slide. Sin explicaciones adicionales.

[
  { "slideType": "hero", "headline": "...", "subheadline": "..." },
  { "slideType": "metrics", "title": "...", "metrics": [...] },
  ...
]`;

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

    const userPrompt = `Diseña una presentación ejecutiva para:

**Empresa:** ${company_name}
**Destinatario:** ${target_profile}

### Contenido valorado por el admin (4-5 estrellas):

${contentText}
${questionsText}

Genera el JSON de slides siguiendo las reglas de diseño B/W.`;

    console.log(`[design-pptx-slides] Designing for ${company_name}, ${content.length} content blocks`);

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

    // Parse JSON from response (handle markdown code blocks)
    let slides;
    try {
      // Try to extract JSON from markdown code block
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
      slides = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[design-pptx-slides] JSON parse error:", parseError);
      console.error("[design-pptx-slides] Raw content:", rawContent.substring(0, 500));
      
      // Return a fallback structure
      slides = [
        {
          slideType: "hero",
          headline: `${company_name}: Oportunidad Estratégica`,
          subheadline: "Análisis de Percepción Algorítmica",
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
    }

    // Validate slides structure
    if (!Array.isArray(slides)) {
      slides = [slides];
    }

    console.log(`[design-pptx-slides] Generated ${slides.length} slides`);

    return new Response(
      JSON.stringify({
        slides,
        metadata: {
          total_slides: slides.length,
          design_version: "2.0-bw",
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
