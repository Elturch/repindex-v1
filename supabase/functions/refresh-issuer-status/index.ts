import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Valid IBEX family categories
const IBEX_FAMILY_CATEGORIES = [
  { code: 'IBEX-35', name: 'IBEX 35' },
  { code: 'IBEX-MC', name: 'IBEX Medium Cap' },
  { code: 'IBEX-SC', name: 'IBEX Small Cap' },
  { code: 'BME-GROWTH', name: 'Fuera de familia IBEX (BME Growth)' },
  { code: 'MC-OTHER', name: 'Fuera de familia IBEX (Mercado Continuo)' },
  { code: 'NO-COTIZA', name: 'No cotiza en bolsa' }
];

interface IssuerRecord {
  issuer_id: string;
  issuer_name: string;
  ticker: string;
  cotiza_en_bolsa: boolean;
  ibex_family_code: string | null;
  ibex_family_category: string | null;
}

interface StatusUpdate {
  issuer_id: string;
  issuer_name: string;
  old_status: {
    cotiza_en_bolsa: boolean;
    ibex_family_code: string | null;
    ticker: string;
  };
  new_status: {
    cotiza_en_bolsa: boolean;
    ibex_family_code: string;
    ibex_family_category: string;
    ticker: string;
  };
  change_type: 'started_trading' | 'stopped_trading' | 'index_change' | 'no_change';
  confidence: 'high' | 'medium' | 'low';
  verification_notes: string;
}

// Verify issuer status using Google Gemini API
async function verifyIssuerStatus(
  issuers: IssuerRecord[],
  geminiApiKey: string
): Promise<StatusUpdate[]> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-pro",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8000,
    }
  });

  // Build company list for verification
  const companyList = issuers.map(i => ({
    issuer_id: i.issuer_id,
    issuer_name: i.issuer_name,
    current_ticker: i.ticker,
    current_cotiza: i.cotiza_en_bolsa,
    current_ibex_code: i.ibex_family_code
  }));

  const prompt = `Eres un experto analista del mercado bursátil español con información actualizada de BME (Bolsas y Mercados Españoles) a enero 2026.

TAREA: Verifica el estado de cotización de las siguientes empresas españolas y detecta cambios.

DATOS ACTUALES EN SISTEMA:
${JSON.stringify(companyList, null, 2)}

CATEGORÍAS IBEX VÁLIDAS:
- IBEX-35: Las 35 empresas más líquidas del mercado español
- IBEX-MC: IBEX Medium Cap (~20 empresas medianas)
- IBEX-SC: IBEX Small Cap (~30 empresas pequeñas)
- BME-GROWTH: Mercado alternativo para pymes en crecimiento
- MC-OTHER: Mercado Continuo pero fuera de índices IBEX
- NO-COTIZA: No cotiza en bolsa española

INSTRUCCIONES:
1. Para cada empresa, verifica si su estado de cotización actual es correcto
2. Detecta si alguna empresa ha empezado a cotizar (OPV, salida a bolsa)
3. Detecta si alguna empresa ha dejado de cotizar (exclusión, OPA de exclusión, fusión)
4. Detecta cambios de índice (entrada/salida del IBEX 35, cambio a Medium Cap, etc.)
5. Para empresas que NO cotizan, el ticker debe ser sus INICIALES en mayúsculas (ej: Quirónsalud → QS)

REGLAS DE TICKER:
- Empresas cotizadas: XXX.MC (ej: ITX.MC, SAN.MC)
- Empresas no cotizadas: Iniciales en mayúsculas (ej: QS, HMH, VIT)
- NO usar "NO-COTIZA" como ticker

Responde ÚNICAMENTE con un array JSON de cambios detectados (solo incluye empresas con cambios o donde la confianza sea baja):
[
  {
    "issuer_id": "id-empresa",
    "issuer_name": "Nombre Empresa",
    "change_type": "started_trading|stopped_trading|index_change|no_change",
    "new_cotiza_en_bolsa": true/false,
    "new_ibex_family_code": "IBEX-35|IBEX-MC|IBEX-SC|BME-GROWTH|MC-OTHER|NO-COTIZA",
    "new_ibex_family_category": "descripción legible",
    "new_ticker": "XXX.MC o INICIALES",
    "confidence": "high|medium|low",
    "verification_notes": "explicación del cambio detectado"
  }
]

Si no hay cambios para ninguna empresa, responde con un array vacío: []`;

  console.log(`Verifying status for ${issuers.length} issuers...`);
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const content = response.text().trim();
  
  // Clean up potential markdown formatting
  let jsonContent = content;
  if (content.startsWith('```')) {
    jsonContent = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
  }
  
  try {
    const updates = JSON.parse(jsonContent);
    
    // Map to StatusUpdate format
    return updates.map((update: any) => {
      const originalIssuer = issuers.find(i => i.issuer_id === update.issuer_id);
      if (!originalIssuer) return null;
      
      // Validate ibex_family_code
      const validCodes = IBEX_FAMILY_CATEGORIES.map(c => c.code);
      let ibexCode = update.new_ibex_family_code;
      let ibexCategory = update.new_ibex_family_category;
      
      if (!validCodes.includes(ibexCode)) {
        ibexCode = update.new_cotiza_en_bolsa ? 'MC-OTHER' : 'NO-COTIZA';
        ibexCategory = update.new_cotiza_en_bolsa 
          ? 'Fuera de familia IBEX (Mercado Continuo)' 
          : 'No cotiza en bolsa';
      }
      
      return {
        issuer_id: update.issuer_id,
        issuer_name: update.issuer_name,
        old_status: {
          cotiza_en_bolsa: originalIssuer.cotiza_en_bolsa,
          ibex_family_code: originalIssuer.ibex_family_code,
          ticker: originalIssuer.ticker
        },
        new_status: {
          cotiza_en_bolsa: update.new_cotiza_en_bolsa,
          ibex_family_code: ibexCode,
          ibex_family_category: ibexCategory,
          ticker: update.new_ticker
        },
        change_type: update.change_type,
        confidence: update.confidence || 'medium',
        verification_notes: update.verification_notes || ''
      };
    }).filter(Boolean);
  } catch (e) {
    console.error('Failed to parse AI response:', content);
    throw new Error(`Failed to parse AI response: ${e.message}`);
  }
}

// Apply updates to database
async function applyUpdates(
  supabase: any,
  updates: StatusUpdate[]
): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = [];
  let applied = 0;
  
  for (const update of updates) {
    if (update.change_type === 'no_change') continue;
    
    try {
      const { error } = await supabase
        .from('repindex_root_issuers')
        .update({
          cotiza_en_bolsa: update.new_status.cotiza_en_bolsa,
          ibex_family_code: update.new_status.ibex_family_code,
          ibex_family_category: update.new_status.ibex_family_category,
          ticker: update.new_status.ticker,
          ibex_status: update.new_status.cotiza_en_bolsa ? 'active_now' : 'no_cotiza',
          notes: `[${new Date().toISOString().split('T')[0]}] ${update.change_type}: ${update.verification_notes}`
        })
        .eq('issuer_id', update.issuer_id);
      
      if (error) {
        errors.push(`${update.issuer_name}: ${error.message}`);
      } else {
        applied++;
        console.log(`Updated ${update.issuer_name}: ${update.change_type}`);
      }
    } catch (e) {
      errors.push(`${update.issuer_name}: ${e.message}`);
    }
  }
  
  return { applied, errors };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!geminiApiKey) {
      throw new Error('Missing GOOGLE_GEMINI_API_KEY');
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse request body for optional parameters
    let batchSize = 30;
    let offset = 0;
    let dryRun = false;
    
    try {
      const body = await req.json();
      batchSize = body.batchSize || 30;
      offset = body.offset || 0;
      dryRun = body.dryRun || false;
    } catch {
      // No body provided, use defaults
    }

    console.log(`Starting issuer status refresh (batchSize: ${batchSize}, offset: ${offset}, dryRun: ${dryRun})`);

    // Fetch issuers to verify
    const { data: issuers, error: fetchError, count } = await supabase
      .from('repindex_root_issuers')
      .select('issuer_id, issuer_name, ticker, cotiza_en_bolsa, ibex_family_code, ibex_family_category', { count: 'exact' })
      .order('issuer_name')
      .range(offset, offset + batchSize - 1);

    if (fetchError) {
      throw new Error(`Failed to fetch issuers: ${fetchError.message}`);
    }

    if (!issuers || issuers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No issuers to verify',
          total_issuers: count || 0,
          processed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetched ${issuers.length} issuers (total: ${count})`);

    // Verify status with Gemini
    const updates = await verifyIssuerStatus(issuers, geminiApiKey);
    
    console.log(`Detected ${updates.length} potential changes`);

    // Filter to only actual changes
    const actualChanges = updates.filter(u => u.change_type !== 'no_change');
    
    let applyResult = { applied: 0, errors: [] as string[] };
    
    if (!dryRun && actualChanges.length > 0) {
      applyResult = await applyUpdates(supabase, actualChanges);
    }

    // Log to activity or separate table for tracking
    if (actualChanges.length > 0) {
      console.log('Changes detected:', JSON.stringify(actualChanges, null, 2));
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      mode: dryRun ? 'dry_run' : 'applied',
      total_issuers: count,
      batch_processed: issuers.length,
      offset,
      next_offset: offset + batchSize < (count || 0) ? offset + batchSize : null,
      changes_detected: actualChanges.length,
      changes_applied: applyResult.applied,
      errors: applyResult.errors,
      changes: actualChanges.map(c => ({
        issuer_id: c.issuer_id,
        issuer_name: c.issuer_name,
        change_type: c.change_type,
        old: c.old_status,
        new: c.new_status,
        confidence: c.confidence,
        notes: c.verification_notes
      }))
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in refresh-issuer-status:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
