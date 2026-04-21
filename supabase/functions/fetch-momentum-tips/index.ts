import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MomentumRequest {
  ticker: string;
  company_name: string;
  precio_cierre: string;
  minimo_52_semanas: string | null;
  rix_score: number;
}

interface MomentumResult {
  momentum_analysis: string;
  tips: string[];
  sources: string[];
}

function buildMomentumPrompt(
  ticker: string,
  companyName: string,
  precioCierre: string,
  minimo52s: string | null,
  rixScore: number
): string {
  const precioNum = parseFloat(precioCierre);
  const minimoNum = minimo52s ? parseFloat(minimo52s) : null;
  
  let pctRecuperacion = 'N/D';
  if (minimoNum && minimoNum > 0 && precioNum > 0) {
    const pct = ((precioNum - minimoNum) / minimoNum) * 100;
    pctRecuperacion = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  }

  return `Eres analista financiero especializado en el mercado español. Busca las últimas noticias (últimos 7-14 días) sobre ${companyName} (${ticker}) en medios financieros españoles e internacionales.

DATOS VERIFICADOS (no busques estos, ya los tengo):
- Precio cierre viernes: ${precioCierre}€
- Mínimo 52 semanas: ${minimo52s || 'N/D'}€
- Distancia desde mínimos: ${pctRecuperacion}
- RIX Score (reputación IA): ${rixScore}/100

GENERA UN ANÁLISIS BREVE Y VERIFICADO:

1. Un párrafo (3-4 frases máximo) analizando:
   - El momentum actual del precio vs el mínimo de 52 semanas
   - Catalizadores o riesgos recientes mencionados en prensa financiera española
   - Conexión entre la valoración bursátil y la reputación percibida por IAs (RIX score)

2. Lista de exactamente 2-3 tips verificables, cada uno con:
   - El dato o evento clave
   - Fuente y fecha aproximada (ej: "Expansión, 15/01/2025")

IMPORTANTE:
- Solo incluye información que puedas verificar con una fuente real
- Cita siempre el medio y la fecha
- Si no encuentras noticias recientes específicas, indícalo y enfócate en los datos de precio disponibles
- Sé conciso y directo, máximo 150 palabras en total
- Responde siempre en español

Formato de respuesta:
ANALISIS: [tu párrafo de análisis]
TIPS:
1. [tip 1 con fuente]
2. [tip 2 con fuente]
3. [tip 3 con fuente - opcional]
FUENTES: [lista de medios citados separados por coma]`;
}

function parsePerplexityResponse(content: string): MomentumResult {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  let analysis = '';
  const tips: string[] = [];
  const sources: string[] = [];
  
  let section = '';
  
  for (const line of lines) {
    if (line.startsWith('ANALISIS:') || line.startsWith('ANÁLISIS:')) {
      section = 'analysis';
      analysis = line.replace(/^AN[AÁ]LISIS:\s*/i, '');
    } else if (line.startsWith('TIPS:')) {
      section = 'tips';
    } else if (line.startsWith('FUENTES:')) {
      section = 'sources';
      const sourceLine = line.replace(/^FUENTES:\s*/i, '');
      sources.push(...sourceLine.split(',').map(s => s.trim()).filter(Boolean));
    } else if (section === 'analysis' && !line.startsWith('TIPS') && !line.startsWith('FUENTES')) {
      analysis += ' ' + line;
    } else if (section === 'tips' && /^\d+\./.test(line)) {
      tips.push(line.replace(/^\d+\.\s*/, ''));
    } else if (section === 'sources' && line.length > 2) {
      sources.push(...line.split(',').map(s => s.trim()).filter(Boolean));
    }
  }
  
  // Fallback if structured parsing failed
  if (!analysis && content.length > 50) {
    analysis = content.slice(0, 500);
  }
  
  return {
    momentum_analysis: analysis.trim(),
    tips: tips.slice(0, 3),
    sources: [...new Set(sources)].slice(0, 5),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, company_name, precio_cierre, minimo_52_semanas, rix_score } = await req.json() as MomentumRequest;

    if (!ticker || !company_name || !precio_cierre) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: ticker, company_name, precio_cierre' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[fetch-momentum-tips] Analyzing momentum for ${ticker} (${company_name})`);
    console.log(`[fetch-momentum-tips] Price: ${precio_cierre}€, 52w low: ${minimo_52_semanas || 'N/A'}€, RIX: ${rix_score}`);

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      console.error('[fetch-momentum-tips] Missing PERPLEXITY_API_KEY');
      return new Response(
        JSON.stringify({ error: 'Missing PERPLEXITY_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = buildMomentumPrompt(ticker, company_name, precio_cierre, minimo_52_semanas, rix_score);

    const startTime = Date.now();
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { 
            role: 'system', 
            content: 'Eres un analista financiero experto en el mercado bursátil español. Respondes siempre en español con datos verificados y fuentes citadas.' 
          },
          { role: 'user', content: prompt }
        ],
        search_recency_filter: 'week',
        search_domain_filter: [
          'expansion.com',
          'cincodias.elpais.com',
          'eleconomista.es',
          'reuters.com',
          'bloomberg.com',
          'ft.com',
          'bolsamadrid.es',
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[fetch-momentum-tips] Perplexity API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: 'Perplexity API error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    console.log(`[fetch-momentum-tips] Received response (${content.length} chars) in ${responseTime}ms`);

    const parsed = parsePerplexityResponse(content);
    
    // Add any citations from Perplexity to sources
    if (citations.length > 0) {
      const citationDomains = citations.map((url: string) => {
        try {
          return new URL(url).hostname.replace('www.', '');
        } catch {
          return url;
        }
      });
      parsed.sources = [...new Set([...parsed.sources, ...citationDomains])].slice(0, 5);
    }

    // Log API usage with accurate cost from api_cost_config
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(content.length / 3.5);

    // Get cost config from database for accurate pricing
    const { data: costConfig } = await supabase
      .from('api_cost_config')
      .select('input_cost_per_million, output_cost_per_million')
      .eq('provider', 'perplexity')
      .eq('model', 'sonar-pro')
      .single();

    const inputCost = costConfig ? (inputTokens / 1_000_000) * costConfig.input_cost_per_million : 0;
    const outputCost = costConfig ? (outputTokens / 1_000_000) * costConfig.output_cost_per_million : 0;
    const estimatedCost = inputCost + outputCost;

    await supabase.from('api_usage_logs').insert({
      edge_function: 'fetch-momentum-tips',
      provider: 'perplexity',
      model: 'sonar-pro',
      action_type: 'momentum_analysis',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost,
      pipeline_stage: 'momentum',
      ticker,
      metadata: {
        company_name,
        rix_score,
        response_time_ms: responseTime,
        citations_count: citations.length,
        prompt_length: prompt.length,
      },
    });

    console.log(`[fetch-momentum-tips] Success for ${ticker}: ${parsed.tips.length} tips, ${parsed.sources.length} sources`);

    return new Response(
      JSON.stringify({
        success: true,
        ticker,
        ...parsed,
        raw_content: content,
        citations,
        response_time_ms: responseTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[fetch-momentum-tips] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
