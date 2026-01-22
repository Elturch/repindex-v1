import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Valid sector categories
const SECTOR_CATEGORIES = [
  'Banca y Servicios Financieros',
  'Construcción e Infraestructuras',
  'Energía y Gas',
  'Hoteles y Turismo',
  'Materias Primas y Siderurgia',
  'Moda y Distribución',
  'Salud y Farmacéutico',
  'Telecomunicaciones y Tecnología',
  'Otros Sectores'
];

// Valid IBEX family categories
const IBEX_FAMILY_CATEGORIES = [
  { code: 'IBEX-35', name: 'IBEX 35' },
  { code: 'IBEX-MC', name: 'IBEX Medium Cap' },
  { code: 'IBEX-SC', name: 'IBEX Small Cap' },
  { code: 'BME-GROWTH', name: 'Fuera de familia IBEX (BME Growth)' },
  { code: 'MC-OTHER', name: 'Fuera de familia IBEX (Mercado Continuo)' },
  { code: 'NO-COTIZA', name: 'No cotiza en bolsa' }
];

interface CompanyInput {
  name: string;
  cotiza_en_bolsa: boolean;
  ticker?: string | null;
}

interface GeneratedIssuer {
  issuer_id: string;
  issuer_name: string;
  ticker: string;
  include_terms: string[];
  exclude_terms: string[];
  sample_query: string;
  sector_category: string;
  ibex_family_code: string;
  ibex_family_category: string;
  geography: string[];
  languages: string[];
  fase: number;
  is_new_phase: boolean;
}

// Generate issuer metadata using OpenAI
async function generateIssuerMetadata(
  company: CompanyInput,
  openaiApiKey: string
): Promise<Omit<GeneratedIssuer, 'fase' | 'is_new_phase'>> {
  const prompt = `Genera los datos de búsqueda y clasificación para la siguiente empresa española:

EMPRESA: "${company.name}"
COTIZA EN BOLSA: ${company.cotiza_en_bolsa ? 'Sí' : 'No'}
${company.ticker ? `TICKER: ${company.ticker}` : ''}

SECTORES DISPONIBLES (elige UNO):
${SECTOR_CATEGORIES.map(s => `- ${s}`).join('\n')}

CATEGORÍAS IBEX DISPONIBLES (elige UNA):
${IBEX_FAMILY_CATEGORIES.map(c => `- ${c.code}: ${c.name}`).join('\n')}

Responde SOLO con un objeto JSON válido (sin markdown ni explicaciones):
{
  "issuer_id": "slug-en-minusculas-sin-acentos",
  "issuer_name": "Nombre Oficial de la Empresa",
  "ticker": "${company.ticker || (company.cotiza_en_bolsa ? 'XXX.MC' : 'NO-COTIZA')}",
  "include_terms": ["Nombre Oficial", "Variante 1", "Variante 2"],
  "exclude_terms": ["términos a excluir para desambiguar si es necesario"],
  "sample_query": "(query booleana de búsqueda con OR y AND NOT)",
  "sector_category": "uno de los sectores disponibles",
  "ibex_family_code": "${company.cotiza_en_bolsa ? 'código IBEX apropiado' : 'NO-COTIZA'}",
  "ibex_family_category": "nombre descriptivo de la categoría IBEX",
  "geography": ["ES"],
  "languages": ["es", "en"]
}

REGLAS:
1. issuer_id debe ser un slug único en minúsculas sin acentos (ej: "el-corte-ingles")
2. include_terms debe incluir variantes del nombre (con y sin acentos, abreviaturas)
3. exclude_terms debe incluir términos que podrían causar falsos positivos (desambiguación)
4. sample_query debe ser una query booleana válida para búsqueda
5. Si no cotiza en bolsa, usar ticker "NO-COTIZA" y ibex_family_code "NO-COTIZA"`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Eres un experto en empresas españolas y sus datos de búsqueda. Respondes SOLO con JSON válido sin markdown.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content?.trim();
  
  // Clean up potential markdown formatting
  let jsonContent = content;
  if (content.startsWith('```')) {
    jsonContent = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
  }
  
  try {
    const parsed = JSON.parse(jsonContent);
    
    // Override ticker if provided
    if (company.ticker) {
      parsed.ticker = company.ticker;
    }
    
    // Validate sector_category
    if (!SECTOR_CATEGORIES.includes(parsed.sector_category)) {
      parsed.sector_category = 'Otros Sectores';
    }
    
    // Validate ibex_family_code
    const validCodes = IBEX_FAMILY_CATEGORIES.map(c => c.code);
    if (!validCodes.includes(parsed.ibex_family_code)) {
      parsed.ibex_family_code = company.cotiza_en_bolsa ? 'MC-OTHER' : 'NO-COTIZA';
      parsed.ibex_family_category = company.cotiza_en_bolsa 
        ? 'Fuera de familia IBEX (Mercado Continuo)' 
        : 'No cotiza en bolsa';
    }
    
    return parsed;
  } catch (e) {
    console.error('Failed to parse OpenAI response:', content);
    throw new Error(`Failed to parse OpenAI response: ${e.message}`);
  }
}

// Find available phase slot or create new phase
async function findOrCreatePhase(
  supabase: any,
  maxCompaniesPerPhase: number = 5
): Promise<{ fase: number; isNewPhase: boolean }> {
  // Get current phase distribution
  const { data: issuers, error } = await supabase
    .from('repindex_root_issuers')
    .select('fase')
    .not('fase', 'is', null)
    .order('fase');

  if (error) {
    throw new Error(`Failed to fetch issuers: ${error.message}`);
  }

  // Count companies per phase
  const phaseCounts: Record<number, number> = {};
  let maxPhase = 0;
  
  for (const issuer of issuers || []) {
    const fase = issuer.fase;
    if (fase) {
      phaseCounts[fase] = (phaseCounts[fase] || 0) + 1;
      if (fase > maxPhase) maxPhase = fase;
    }
  }

  // Find first phase with available slot
  for (let i = 1; i <= maxPhase; i++) {
    if ((phaseCounts[i] || 0) < maxCompaniesPerPhase) {
      console.log(`Found available slot in phase ${i} (currently ${phaseCounts[i] || 0} companies)`);
      return { fase: i, isNewPhase: false };
    }
  }

  // All phases full, create new phase
  const newPhase = maxPhase + 1;
  console.log(`All phases full. Creating new phase ${newPhase}`);
  return { fase: newPhase, isNewPhase: true };
}

// Create CRON job for new phase
async function createCronForPhase(
  supabase: any,
  fase: number,
  supabaseUrl: string,
  anonKey: string
): Promise<void> {
  // Calculate schedule: each phase is 5 minutes apart, starting at 04:00 UTC
  const totalMinutesFromStart = (fase - 1) * 5;
  const hour = 4 + Math.floor(totalMinutesFromStart / 60);
  const minute = totalMinutesFromStart % 60;
  
  const cronName = `rix-sweep-phase-${fase}`;
  const cronSchedule = `${minute} ${hour} * * 0`; // Every Sunday

  console.log(`Creating CRON job: ${cronName} with schedule: ${cronSchedule}`);

  const sql = `
    SELECT cron.schedule(
      '${cronName}',
      '${cronSchedule}',
      $$SELECT net.http_post(
        url:='${supabaseUrl}/functions/v1/rix-batch-orchestrator',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
        body:='{"trigger": "cron", "fase": ${fase}}'::jsonb
      )$$
    );
  `;

  const { error } = await supabase.rpc('execute_sql', { sql_query: sql });
  
  if (error) {
    console.error(`Failed to create CRON for phase ${fase}:`, error);
    throw new Error(`Failed to create CRON job: ${error.message}`);
  }

  console.log(`Successfully created CRON job for phase ${fase}`);
}

// Insert issuer into database
async function insertIssuer(
  supabase: any,
  issuer: GeneratedIssuer
): Promise<void> {
  const { error } = await supabase
    .from('repindex_root_issuers')
    .insert({
      ticker: issuer.ticker,
      issuer_name: issuer.issuer_name,
      issuer_id: issuer.issuer_id,
      include_terms: issuer.include_terms,
      exclude_terms: issuer.exclude_terms,
      sample_query: issuer.sample_query,
      status: 'active',
      languages: issuer.languages,
      geography: issuer.geography,
      cotiza_en_bolsa: issuer.ticker !== 'NO-COTIZA',
      ibex_family_category: issuer.ibex_family_category,
      ibex_family_code: issuer.ibex_family_code,
      sector_category: issuer.sector_category,
      verification_status: 'active',
      fase: issuer.fase,
      created_at: new Date().toISOString()
    });

  if (error) {
    throw new Error(`Failed to insert issuer: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !serviceKey || !anonKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!openaiApiKey) {
      throw new Error('Missing OpenAI API key');
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { companies, mode = 'preview' } = body as { 
      companies: CompanyInput[]; 
      mode: 'preview' | 'confirm' 
    };

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No companies provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${companies.length} companies in ${mode} mode`);

    const results: GeneratedIssuer[] = [];
    const errors: { company: string; error: string }[] = [];
    let currentPhaseSlots: Record<number, number> = {};
    const newPhasesCreated: number[] = [];

    // Get current phase distribution for tracking
    const { data: existingIssuers } = await supabase
      .from('repindex_root_issuers')
      .select('fase, ticker')
      .not('fase', 'is', null);

    for (const issuer of existingIssuers || []) {
      if (issuer.fase) {
        currentPhaseSlots[issuer.fase] = (currentPhaseSlots[issuer.fase] || 0) + 1;
      }
    }

    // Check for duplicates
    const existingTickers = new Set((existingIssuers || []).map(i => i.ticker));

    for (const company of companies) {
      try {
        console.log(`Processing: ${company.name}`);

        // Check for duplicate ticker
        if (company.ticker && existingTickers.has(company.ticker)) {
          errors.push({ 
            company: company.name, 
            error: `Ticker ${company.ticker} already exists` 
          });
          continue;
        }

        // Generate metadata using AI
        const metadata = await generateIssuerMetadata(company, openaiApiKey);
        console.log(`Generated metadata for ${company.name}:`, JSON.stringify(metadata));

        // Find available phase
        const { fase, isNewPhase } = await findOrCreatePhase(supabase);

        // Track this assignment
        currentPhaseSlots[fase] = (currentPhaseSlots[fase] || 0) + 1;

        const issuerData: GeneratedIssuer = {
          ...metadata,
          fase,
          is_new_phase: isNewPhase
        };

        if (isNewPhase && !newPhasesCreated.includes(fase)) {
          newPhasesCreated.push(fase);
        }

        if (mode === 'confirm') {
          // Insert into database
          await insertIssuer(supabase, issuerData);
          existingTickers.add(issuerData.ticker);
          console.log(`Inserted issuer: ${issuerData.issuer_name} in phase ${fase}`);

          // Create CRON for new phases
          if (isNewPhase) {
            await createCronForPhase(supabase, fase, supabaseUrl, anonKey);
          }
        }

        results.push(issuerData);

      } catch (error) {
        console.error(`Error processing ${company.name}:`, error);
        errors.push({ 
          company: company.name, 
          error: error.message 
        });
      }
    }

    // Get phase summary
    const phaseSummary = Object.entries(currentPhaseSlots)
      .map(([fase, count]) => ({ fase: parseInt(fase), count }))
      .sort((a, b) => a.fase - b.fase);

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        processed: results.length,
        errors: errors.length,
        results,
        errorDetails: errors,
        newPhasesCreated,
        phaseSummary
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Ingest error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
