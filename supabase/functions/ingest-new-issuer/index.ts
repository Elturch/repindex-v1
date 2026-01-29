import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

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
  confidence: 'high' | 'medium' | 'low';
  verification_notes: string;
}

// Normalize string for comparison (remove accents, lowercase, remove non-alphanumeric)
function normalizeForComparison(s: string): string {
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Check for duplicate companies by name
async function checkDuplicateByName(
  supabase: any,
  companyName: string
): Promise<{ isDuplicate: boolean; existingIssuer?: string; existingId?: string }> {
  const { data: issuers } = await supabase
    .from('repindex_root_issuers')
    .select('issuer_name, issuer_id, ticker');

  const normalizedInput = normalizeForComparison(companyName);
  
  for (const issuer of issuers || []) {
    const normalizedExisting = normalizeForComparison(issuer.issuer_name);
    
    // Exact match or high similarity
    if (normalizedExisting === normalizedInput || 
        normalizedExisting.includes(normalizedInput) ||
        normalizedInput.includes(normalizedExisting)) {
      return { 
        isDuplicate: true, 
        existingIssuer: issuer.issuer_name,
        existingId: issuer.issuer_id 
      };
    }
  }
  return { isDuplicate: false };
}

// Check for duplicate ticker to prevent conflicts
async function checkDuplicateTicker(
  supabase: any,
  ticker: string
): Promise<{ isDuplicate: boolean; existingIssuer?: string }> {
  const { data: existing } = await supabase
    .from('repindex_root_issuers')
    .select('issuer_name, ticker')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();

  if (existing) {
    return { 
      isDuplicate: true, 
      existingIssuer: existing.issuer_name 
    };
  }
  return { isDuplicate: false };
}

// Get existing issuers for context to AI
async function getExistingIssuersContext(supabase: any): Promise<string> {
  const { data: issuers } = await supabase
    .from('repindex_root_issuers')
    .select('issuer_name, ticker, sector_category, ibex_family_code')
    .order('issuer_name');

  if (!issuers || issuers.length === 0) return '';

  const grouped: Record<string, string[]> = {};
  for (const issuer of issuers) {
    const sector = issuer.sector_category || 'Otros Sectores';
    if (!grouped[sector]) grouped[sector] = [];
    grouped[sector].push(`${issuer.issuer_name} (${issuer.ticker})`);
  }

  let context = 'EMPRESAS YA REGISTRADAS EN EL SISTEMA (para referencia de clasificación):\n';
  for (const [sector, companies] of Object.entries(grouped)) {
    context += `\n${sector}:\n`;
    context += companies.slice(0, 10).join(', ');
    if (companies.length > 10) context += `, ... (${companies.length} total)`;
    context += '\n';
  }

  return context;
}

// Generate issuer metadata using Google Gemini API directly
async function generateIssuerMetadata(
  company: CompanyInput,
  geminiApiKey: string,
  existingIssuersContext: string
): Promise<Omit<GeneratedIssuer, 'fase' | 'is_new_phase'>> {
  const prompt = `Eres un experto analista del mercado bursátil español con acceso a información actualizada de BME (Bolsas y Mercados Españoles), IBEX 35, y el tejido empresarial español.

TAREA: Genera metadatos VERIFICADOS y PRECISOS para la siguiente empresa española.

${existingIssuersContext}

EMPRESA A PROCESAR: "${company.name}"
COTIZA EN BOLSA (según usuario): ${company.cotiza_en_bolsa ? 'Sí' : 'No'}
${company.ticker ? `TICKER PROPORCIONADO: ${company.ticker}` : ''}

DATOS A DETERMINAR CON PRECISIÓN:

1. **COTIZACIÓN EN BOLSA ESPAÑOLA** - Verifica si realmente cotiza:
   - IBEX-35: Las 35 empresas más líquidas (Inditex, Santander, Telefónica, etc.)
   - IBEX-MC: IBEX Medium Cap (~20 empresas medianas)
   - IBEX-SC: IBEX Small Cap (~30 empresas pequeñas)
   - BME-GROWTH: Mercado alternativo para pymes en crecimiento
   - MC-OTHER: Mercado Continuo pero fuera de índices IBEX
   - NO-COTIZA: No cotiza en bolsa española

2. **TICKER OFICIAL** - Formato XXX.MC para Bolsa de Madrid, o NO-COTIZA si no cotiza

3. **SECTOR DE ACTIVIDAD** - Usar EXACTAMENTE uno de estos:
   - Banca y Servicios Financieros (bancos, aseguradoras, gestoras)
   - Construcción e Infraestructuras (constructoras, inmobiliarias, concesionarias)
   - Energía y Gas (eléctricas, petroleras, renovables, gas)
   - Hoteles y Turismo (hoteleras, aerolíneas, agencias)
   - Materias Primas y Siderurgia (acero, minería, papel, química básica)
   - Moda y Distribución (textil, retail, supermercados, grandes almacenes)
   - Salud y Farmacéutico (farmacéuticas, hospitales, clínicas, dental, ópticas)
   - Telecomunicaciones y Tecnología (telecos, software, IT, medios digitales)
   - Otros Sectores (alimentación, bebidas, servicios diversos)

REGLAS CRÍTICAS DE VERIFICACIÓN:
- Grupos hospitalarios privados españoles (Quirónsalud, HM Hospitales, Vithas, Ribera Salud) → NO COTIZAN → NO-COTIZA
- Clínicas dentales y ópticas (Vitaldent, Sanitas Dental) → NO COTIZAN → NO-COTIZA
- El Corte Inglés → NO COTIZA (es privado) → NO-COTIZA
- Mercadona → NO COTIZA (es privado) → NO-COTIZA
- PharmaMar → SÍ COTIZA → IBEX-SC, PHM.MC
- Grifols → SÍ COTIZA → IBEX-35, GRF.MC
- Rovi → SÍ COTIZA → IBEX-MC, ROVI.MC
- Coca-Cola Europacific Partners cotiza en Amsterdam/Londres, no en BME → NO-COTIZA o verificar si tiene ticker español
- NO INVENTES DATOS: Si no estás seguro de que cotiza, usa NO-COTIZA

4. **TÉRMINOS DE BÚSQUEDA**:
   - include_terms: Variantes del nombre oficial, con/sin acentos, abreviaturas comunes, nombre grupo matriz
   - exclude_terms: Términos que pueden causar falsos positivos (desambiguación de nombres comunes)

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin explicaciones):
{
  "issuer_id": "slug-en-minusculas-sin-acentos-ni-espacios",
  "issuer_name": "Nombre Oficial Completo de la Empresa",
  "ticker": "XXX.MC o NO-COTIZA",
  "cotiza_verificado": true o false,
  "ibex_family_code": "IBEX-35|IBEX-MC|IBEX-SC|BME-GROWTH|MC-OTHER|NO-COTIZA",
  "ibex_family_category": "descripción legible de la categoría",
  "sector_category": "uno de los 9 sectores exactos listados arriba",
  "include_terms": ["Nombre Oficial", "Variante 1", "Variante sin acentos"],
  "exclude_terms": ["términos a excluir para desambiguar"],
  "sample_query": "(query booleana con OR y AND NOT)",
  "geography": ["ES"],
  "languages": ["es", "en"],
  "confidence": "high|medium|low",
  "verification_notes": "explicación breve de cómo verificaste los datos"
}`;

  // Use Google Gemini API directly
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-pro",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500,
    }
  });

  const systemPrompt = 'Eres un experto en el mercado bursátil español y empresas españolas. Tu conocimiento incluye qué empresas cotizan en BME, sus tickers oficiales, y su clasificación sectorial. Respondes SOLO con JSON válido, sin markdown ni explicaciones adicionales.';
  
  const fullPrompt = `${systemPrompt}\n\n${prompt}`;
  
  const result = await model.generateContent(fullPrompt);
  const response = await result.response;
  const content = response.text().trim();
  
  // Clean up potential markdown formatting
  let jsonContent = content;
  if (content.startsWith('```')) {
    jsonContent = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
  }
  
  try {
    const parsed = JSON.parse(jsonContent);
    
    // Override ticker if provided by user and verified by AI
    if (company.ticker && parsed.cotiza_verificado) {
      parsed.ticker = company.ticker;
    }
    
    // Validate sector_category
    if (!SECTOR_CATEGORIES.includes(parsed.sector_category)) {
      console.warn(`Invalid sector "${parsed.sector_category}", defaulting to Otros Sectores`);
      parsed.sector_category = 'Otros Sectores';
    }
    
    // Validate ibex_family_code
    const validCodes = IBEX_FAMILY_CATEGORIES.map(c => c.code);
    if (!validCodes.includes(parsed.ibex_family_code)) {
      console.warn(`Invalid IBEX code "${parsed.ibex_family_code}", using fallback`);
      parsed.ibex_family_code = parsed.cotiza_verificado ? 'MC-OTHER' : 'NO-COTIZA';
      parsed.ibex_family_category = parsed.cotiza_verificado 
        ? 'Fuera de familia IBEX (Mercado Continuo)' 
        : 'No cotiza en bolsa';
    }
    
    // Ensure confidence is valid
    if (!['high', 'medium', 'low'].includes(parsed.confidence)) {
      parsed.confidence = 'medium';
    }
    
    // Ensure verification_notes exists
    if (!parsed.verification_notes) {
      parsed.verification_notes = 'Verificación automática basada en conocimiento del modelo';
    }
    
    return parsed;
  } catch (e) {
    console.error('Failed to parse AI response:', content);
    throw new Error(`Failed to parse AI response: ${e.message}`);
  }
}

// Validate AI response for coherence (synchronous version - ticker duplicate check is async)
function validateAIResponse(
  data: any, 
  input: CompanyInput
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // If says it's listed but ticker is NO-COTIZA
  if (data.ibex_family_code !== 'NO-COTIZA' && data.ticker === 'NO-COTIZA') {
    issues.push('Incoherencia: tiene código IBEX pero ticker NO-COTIZA');
  }
  
  // If ticker exists but ibex_family_code is NO-COTIZA
  if (data.ticker !== 'NO-COTIZA' && data.ibex_family_code === 'NO-COTIZA') {
    issues.push('Incoherencia: tiene ticker pero ibex_family_code es NO-COTIZA');
  }
  
  // Validate ticker format for listed companies
  if (data.ticker !== 'NO-COTIZA' && !data.ticker.match(/^[A-Z0-9]+\.MC$/)) {
    issues.push(`Formato de ticker inválido: ${data.ticker} (debe ser XXX.MC)`);
  }
  
  // User said doesn't trade but AI says it does
  if (!input.cotiza_en_bolsa && data.ibex_family_code !== 'NO-COTIZA') {
    issues.push(`Usuario indicó que no cotiza, pero IA dice ${data.ibex_family_code}. Verificar.`);
  }
  
  // User said it trades but AI says it doesn't
  if (input.cotiza_en_bolsa && data.ibex_family_code === 'NO-COTIZA') {
    issues.push('Usuario indicó que cotiza, pero IA dice que no. Verificar.');
  }
  
  return { valid: issues.length === 0, issues };
}

// Validate ticker is not already used (async check)
async function validateTickerAvailability(
  supabase: any,
  ticker: string
): Promise<{ valid: boolean; issue?: string }> {
  if (ticker === 'NO-COTIZA') {
    return { valid: true };
  }
  
  const { isDuplicate, existingIssuer } = await checkDuplicateTicker(supabase, ticker);
  
  if (isDuplicate) {
    return { 
      valid: false, 
      issue: `⚠️ TICKER DUPLICADO: "${ticker}" ya está asignado a "${existingIssuer}". Asignar un ticker único.`
    };
  }
  
  return { valid: true };
}

// Find available phase slot or create new phase
async function findOrCreatePhase(
  supabase: any,
  maxCompaniesPerPhase: number = 5
): Promise<{ fase: number; isNewPhase: boolean }> {
  const { data: issuers, error } = await supabase
    .from('repindex_root_issuers')
    .select('fase')
    .not('fase', 'is', null)
    .order('fase');

  if (error) {
    throw new Error(`Failed to fetch issuers: ${error.message}`);
  }

  const phaseCounts: Record<number, number> = {};
  let maxPhase = 0;
  
  for (const issuer of issuers || []) {
    const fase = issuer.fase;
    if (fase) {
      phaseCounts[fase] = (phaseCounts[fase] || 0) + 1;
      if (fase > maxPhase) maxPhase = fase;
    }
  }

  for (let i = 1; i <= maxPhase; i++) {
    if ((phaseCounts[i] || 0) < maxCompaniesPerPhase) {
      console.log(`Found available slot in phase ${i} (currently ${phaseCounts[i] || 0} companies)`);
      return { fase: i, isNewPhase: false };
    }
  }

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
  const totalMinutesFromStart = (fase - 1) * 5;
  const hour = 4 + Math.floor(totalMinutesFromStart / 60);
  const minute = totalMinutesFromStart % 60;
  
  const cronName = `rix-sweep-phase-${fase}`;
  const cronSchedule = `${minute} ${hour} * * 0`;

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
      ibex_status: issuer.ticker === 'NO-COTIZA' ? 'no_cotiza' : 'active_now',
      languages: issuer.languages,
      geography: issuer.geography,
      cotiza_en_bolsa: issuer.ticker !== 'NO-COTIZA',
      ibex_family_category: issuer.ibex_family_category,
      ibex_family_code: issuer.ibex_family_code,
      sector_category: issuer.sector_category,
      fase: issuer.fase,
      notes: issuer.verification_notes || null,
      verified_competitors: [] // Initialize as empty array - will be populated later from curated list
    });

  if (error) {
    throw new Error(`Failed to insert issuer: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');

    if (!supabaseUrl || !serviceKey || !anonKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!geminiApiKey) {
      throw new Error('Missing GOOGLE_GEMINI_API_KEY');
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { companies, mode = 'preview', editedData } = body as { 
      companies: CompanyInput[]; 
      mode: 'preview' | 'confirm';
      editedData?: GeneratedIssuer[];
    };

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No companies provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${companies.length} companies in ${mode} mode`);

    // In confirm mode with edited data, use the edited data directly
    if (mode === 'confirm' && editedData && Array.isArray(editedData)) {
      console.log('Using edited data for insertion');
      const results: GeneratedIssuer[] = [];
      const errors: { company: string; error: string }[] = [];
      const newPhasesCreated: number[] = [];

      for (const issuer of editedData) {
        try {
          await insertIssuer(supabase, issuer);
          results.push(issuer);
          
          if (issuer.is_new_phase && !newPhasesCreated.includes(issuer.fase)) {
            newPhasesCreated.push(issuer.fase);
            await createCronForPhase(supabase, issuer.fase, supabaseUrl, anonKey);
          }
          
          console.log(`Inserted issuer: ${issuer.issuer_name} in phase ${issuer.fase}`);
        } catch (error) {
          console.error(`Error inserting ${issuer.issuer_name}:`, error);
          errors.push({ company: issuer.issuer_name, error: error.message });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode,
          processed: results.length,
          errors: errors.length,
          results,
          errorDetails: errors,
          newPhasesCreated,
          phaseSummary: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get existing issuers context for AI
    const existingIssuersContext = await getExistingIssuersContext(supabase);

    const results: GeneratedIssuer[] = [];
    const errors: { company: string; error: string }[] = [];
    let currentPhaseSlots: Record<number, number> = {};
    const newPhasesCreated: number[] = [];

    // Get current phase distribution
    const { data: existingIssuers } = await supabase
      .from('repindex_root_issuers')
      .select('fase, ticker')
      .not('fase', 'is', null);

    for (const issuer of existingIssuers || []) {
      if (issuer.fase) {
        currentPhaseSlots[issuer.fase] = (currentPhaseSlots[issuer.fase] || 0) + 1;
      }
    }

    const existingTickers = new Set((existingIssuers || []).map(i => i.ticker));

    for (const company of companies) {
      try {
        console.log(`Processing: ${company.name}`);

        // Check for duplicate by name
        const duplicateCheck = await checkDuplicateByName(supabase, company.name);
        if (duplicateCheck.isDuplicate) {
          errors.push({ 
            company: company.name, 
            error: `Ya existe empresa similar: "${duplicateCheck.existingIssuer}" (${duplicateCheck.existingId})` 
          });
          continue;
        }

        // Check for duplicate ticker
        if (company.ticker && existingTickers.has(company.ticker)) {
          errors.push({ 
            company: company.name, 
            error: `Ticker ${company.ticker} ya existe en el sistema` 
          });
          continue;
        }

        // Generate metadata using Google Gemini API
        const metadata = await generateIssuerMetadata(company, geminiApiKey, existingIssuersContext);
        console.log(`Generated metadata for ${company.name}:`, JSON.stringify(metadata));

        // Validate AI response (synchronous checks)
        const validation = validateAIResponse(metadata, company);
        if (!validation.valid) {
          console.warn(`Validation issues for ${company.name}:`, validation.issues);
          // Add issues to verification_notes instead of failing
          metadata.verification_notes += ` [ADVERTENCIAS: ${validation.issues.join('; ')}]`;
          if (metadata.confidence === 'high') {
            metadata.confidence = 'medium';
          }
        }

        // Check for duplicate ticker (async check - prevents SAN conflict like Santander/Sanitas)
        const tickerValidation = await validateTickerAvailability(supabase, metadata.ticker);
        if (!tickerValidation.valid) {
          console.warn(`Ticker conflict for ${company.name}:`, tickerValidation.issue);
          metadata.verification_notes += ` [${tickerValidation.issue}]`;
          metadata.confidence = 'low'; // Force low confidence to require manual review
        }

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
          await insertIssuer(supabase, issuerData);
          existingTickers.add(issuerData.ticker);
          console.log(`Inserted issuer: ${issuerData.issuer_name} in phase ${fase}`);

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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
