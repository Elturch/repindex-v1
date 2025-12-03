import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JOURNALISTIC_SYSTEM_PROMPT = `Eres un periodista económico de élite especializado en reputación corporativa e inteligencia artificial.
Tu misión es encontrar LAS HISTORIAS detrás de los datos del RepIndex, no solo reportarlos.

## Tu estilo periodístico:
1. **BUSCA LO INUSUAL**: Divergencias extremas entre IAs, cambios drásticos, patrones sospechosos, correlaciones inesperadas
2. **HAZ PREGUNTAS RETÓRICAS** que enganchen: "¿Qué saben las IAs que nosotros no?"
3. **USA METÁFORAS POTENTES**: "guerra de percepciones", "montaña rusa reputacional", "cortocircuito algorítmico", "tsunami de datos"
4. **PERSONALIZA**: Menciona sectores, contexto económico español, rivalidades empresariales
5. **GENERA DEBATE**: ¿Qué IA tiene razón cuando discrepan? ¿Por qué?
6. **DATOS CONCRETOS**: Cada párrafo debe incluir cifras específicas
7. **TITULARES DE IMPACTO**: Como un periódico, no como un informe corporativo
8. **CIERRA CON PREGUNTAS**: Invita a la reflexión

## Formato de respuesta (JSON estricto):
{
  "weekLabel": "Semana del X al Y de Mes 2025",
  "mainStory": {
    "headline": "Titular impactante de la noticia principal",
    "lead": "Primer párrafo enganchador con el dato más llamativo",
    "body": "Desarrollo de la historia con análisis y contexto (2-3 párrafos)",
    "dataHighlight": "Dato clave resumido para destacar visualmente"
  },
  "stories": [
    {
      "category": "divergencia|consenso|sector|modelo|privadas|subidas|bajadas",
      "headline": "Titular de la historia",
      "body": "Narrativa periodística (1-2 párrafos)",
      "dataHighlight": "Dato clave"
    }
  ]
}

## Reglas:
- SIEMPRE genera exactamente 5-6 historias además de la principal
- Categorías obligatorias: al menos una de divergencia, una de modelo IA, una sectorial
- Los titulares deben ser provocativos pero basados en datos reales
- NO inventes datos, usa SOLO los proporcionados
- Escribe en español de España, tono periodístico profesional pero accesible`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { weekData } = await req.json();
    
    if (!weekData) {
      throw new Error('No se proporcionaron datos de la semana');
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY no configurada');
    }

    // Build context for LLM
    const dataContext = `
## DATOS DE LA SEMANA: ${weekData.weekLabel}

### TOP 10 SUBIDAS (mayor incremento semanal de RIX):
${weekData.topRisers?.map((r: any, i: number) => 
  `${i+1}. ${r.company_name} (${r.ticker}) - ${r.model_name}: +${r.change} puntos (${r.previous_score}→${r.current_score})`
).join('\n') || 'Sin datos'}

### TOP 10 CAÍDAS (mayor descenso semanal de RIX):
${weekData.topFallers?.map((r: any, i: number) => 
  `${i+1}. ${r.company_name} (${r.ticker}) - ${r.model_name}: ${r.change} puntos (${r.previous_score}→${r.current_score})`
).join('\n') || 'Sin datos'}

### DIVERGENCIAS ENTRE IAs (empresas donde los modelos más discrepan):
${weekData.divergences?.map((d: any, i: number) => 
  `${i+1}. ${d.company_name} (${d.ticker}): Desviación ${d.std_dev.toFixed(1)} puntos
     - ${d.models.map((m: any) => `${m.model}: ${m.score}`).join(', ')}`
).join('\n') || 'Sin datos'}

### CONSENSOS (empresas donde todas las IAs coinciden):
${weekData.consensuses?.map((c: any, i: number) => 
  `${i+1}. ${c.company_name} (${c.ticker}): Desviación solo ${c.std_dev.toFixed(1)} puntos, media ${c.avg_score.toFixed(0)}`
).join('\n') || 'Sin datos'}

### RENDIMIENTO POR MODELO DE IA:
${weekData.modelStats?.map((m: any) => 
  `- ${m.model_name}: Promedio ${m.avg_score.toFixed(1)} (${m.company_count} empresas analizadas)
    ${m.change_vs_previous ? `Cambio vs semana anterior: ${m.change_vs_previous > 0 ? '+' : ''}${m.change_vs_previous.toFixed(1)}` : ''}`
).join('\n') || 'Sin datos'}

### ANÁLISIS SECTORIAL:
${weekData.sectorStats?.map((s: any) => 
  `- ${s.sector}: Promedio ${s.avg_score.toFixed(1)} (${s.company_count} empresas)`
).join('\n') || 'Sin datos'}

### TOP EMPRESAS PRIVADAS (no cotizadas):
${weekData.privateCompanies?.map((p: any, i: number) => 
  `${i+1}. ${p.company_name} (${p.ticker}): ${p.avg_score.toFixed(0)} puntos`
).join('\n') || 'Sin datos'}

### RANKING IBEX-35 (Top 5 y Bottom 5):
Top 5:
${weekData.ibexTop?.map((c: any, i: number) => 
  `${i+1}. ${c.company_name}: ${c.avg_score.toFixed(0)}`
).join('\n') || 'Sin datos'}

Bottom 5:
${weekData.ibexBottom?.map((c: any, i: number) => 
  `${i+1}. ${c.company_name}: ${c.avg_score.toFixed(0)}`
).join('\n') || 'Sin datos'}
`;

    console.log('Generating journalistic news with OpenAI o3...');
    console.log('Data context length:', dataContext.length);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'o3',
        messages: [
          { role: 'system', content: JOURNALISTIC_SYSTEM_PROMPT },
          { role: 'user', content: `Analiza estos datos y genera las noticias de la semana con olfato periodístico:\n\n${dataContext}` }
        ],
        max_completion_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    // Parse JSON from response
    let newsData;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                       content.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, content];
      newsData = JSON.parse(jsonMatch[1] || content);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', content);
      throw new Error('Failed to parse news data from AI response');
    }

    console.log('Successfully generated news stories');

    return new Response(JSON.stringify({ 
      success: true, 
      news: newsData,
      rawData: weekData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating news:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error generating news' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
