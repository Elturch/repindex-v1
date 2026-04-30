import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Patterns that indicate "no aplica" or similar
const NO_APLICA_PATTERNS = [
  'no_aplica', 'no aplica', 'no-aplica', 'noapplica',
  'n/a', 'na', 'nc', 'null', 'undefined', 'none', 'not applicable'
];

/**
 * Check if a value matches "no aplica" patterns
 */
function isNoAplica(value: any): boolean {
  if (value === null || value === undefined) return false;
  const strValue = String(value).toLowerCase().trim();
  return NO_APLICA_PATTERNS.some(pattern => strValue.includes(pattern));
}

/**
 * Sanitize a score field - handle "no aplica" and convert to integer
 * Returns: { value: number | null, excluded: boolean }
 */
function sanitizeScore(value: any, fieldName?: string): { value: number | null, excluded: boolean } {
  // Log for debugging
  console.log(`[sanitizeScore] ${fieldName}: input = ${JSON.stringify(value)} (${typeof value})`);
  
  // Handle null/undefined
  if (value === null || value === undefined) {
    return { value: null, excluded: false };
  }
  
  // Check for "no aplica" patterns
  if (isNoAplica(value)) {
    console.log(`[sanitizeScore] ${fieldName}: detected "no aplica" pattern -> excluded`);
    return { value: 0, excluded: true };
  }
  
  // Handle numeric values
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      console.warn(`[sanitizeScore] ${fieldName}: invalid number (NaN/Infinity) -> null`);
      return { value: null, excluded: false };
    }
    return { value: Math.round(value), excluded: false };
  }
  
  // Handle string values - try to extract number
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return { value: null, excluded: false };
    }
    
    // Try to parse as number
    const numericMatch = trimmed.match(/-?\d+\.?\d*/);
    if (numericMatch) {
      const num = parseFloat(numericMatch[0]);
      if (!isNaN(num)) {
        return { value: Math.round(num), excluded: false };
      }
    }
    
    // Couldn't parse - treat as excluded
    console.warn(`[sanitizeScore] ${fieldName}: couldn't parse "${value}" -> excluded`);
    return { value: 0, excluded: true };
  }
  
  // Try generic conversion
  const parsed = Number(value);
  if (!isNaN(parsed) && isFinite(parsed)) {
    return { value: Math.round(parsed), excluded: false };
  }
  
  console.warn(`[sanitizeScore] ${fieldName}: unhandled type ${typeof value} -> null`);
  return { value: null, excluded: false };
}

/**
 * Sanitize a weight/peso field
 */
function sanitizeWeight(value: any, fieldName?: string): number | null {
  const result = sanitizeScore(value, fieldName);
  return result.value;
}

/**
 * Sanitize a categoria field (text)
 */
function sanitizeCategoria(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (isNoAplica(value)) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

/**
 * Sanitize a text field
 */
function sanitizeText(value: any): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

/**
 * Sanitize a numeric field (decimal)
 */
function sanitizeNumeric(value: any, fieldName?: string): number | null {
  if (value === null || value === undefined) return null;
  if (isNoAplica(value)) return null;
  
  if (typeof value === 'number') {
    return isNaN(value) || !isFinite(value) ? null : value;
  }
  
  const parsed = parseFloat(String(value).trim());
  return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
}

/**
 * Sanitize JSON/JSONB fields
 */
function sanitizeJson(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  
  // Try to parse string as JSON
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      // Return as-is if not valid JSON
      return value;
    }
  }
  
  return value;
}

/**
 * Validate and normalize stock prices
 */
function sanitizeStockPrice(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (isNoAplica(value)) return null;
  
  const strValue = String(value).trim();
  if (strValue === '' || strValue === 'NC' || strValue === 'N/A') return null;
  
  // Clean format
  const cleanPrice = strValue.replace(/[€,\s]/g, '');
  const price = parseFloat(cleanPrice);
  
  if (isNaN(price) || price <= 0) return null;
  
  // Auto-normalize by ranges
  let normalizedPrice = price;
  const MIN_VALID = 0.01;
  const MAX_VALID = 1000;
  
  if (price >= 1000000) {
    normalizedPrice = price / 1000000;
  } else if (price >= 100000) {
    const opt1 = price / 100000;
    const opt2 = price / 1000;
    normalizedPrice = (opt1 >= MIN_VALID && opt1 <= MAX_VALID) ? opt1 : opt2;
  } else if (price >= 10000) {
    normalizedPrice = price / 1000;
  } else if (price >= 1000) {
    normalizedPrice = price / 100;
  }
  
  return normalizedPrice.toFixed(2);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    
    // Support both single record and array of records
    const records = Array.isArray(body) ? body : (body.results || body.data || [body]);
    
    console.log(`[sanitize-rix-insert] Processing ${records.length} records`);

    const insertedResults: any[] = [];
    const failedResults: any[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      try {
        console.log(`\n========== Processing record ${i + 1}/${records.length} ==========`);
        console.log(`Target: ${record['03_target_name'] || record.meta?.target_name || 'unknown'}`);
        
        // Sanitize CXM fields with special "no aplica" handling
        const cxmScore = sanitizeScore(
          record['44_cxm_score'] ?? record.tabla?.subscores?.find((s: any) => s.label_en_sigla === 'CXM')?.score,
          '44_cxm_score'
        );
        
        // Build sanitized record
        const sanitizedRecord: Record<string, any> = {
          // Meta fields
          '01_run_id': sanitizeText(record['01_run_id'] ?? record.meta?.run_id) || crypto.randomUUID(),
          '02_model_name': sanitizeText(record['02_model_name'] ?? record.meta?.model_name),
          '03_target_name': sanitizeText(record['03_target_name'] ?? record.meta?.target_name),
          '04_target_type': sanitizeText(record['04_target_type'] ?? record.meta?.target_type),
          '05_ticker': sanitizeText(record['05_ticker'] ?? record.meta?.ticker),
          '06_period_from': record['06_period_from'] ?? record.meta?.period_from ?? null,
          '07_period_to': record['07_period_to'] ?? record.meta?.period_to ?? null,
          '08_tz': sanitizeText(record['08_tz'] ?? record.meta?.tz) || 'UTC',
          
          // RIX score
          '09_rix_score': sanitizeScore(record['09_rix_score'] ?? record.tabla?.pari, '09_rix_score').value,
          
          // Narrative fields
          '10_resumen': sanitizeText(record['10_resumen'] ?? record.relato_mini?.resumen),
          '11_puntos_clave': sanitizeJson(record['11_puntos_clave'] ?? record.relato_mini?.puntos_clave),
          
          // Counters
          '12_palabras': sanitizeScore(record['12_palabras'] ?? record.tabla?.contadores?.palabras, '12_palabras').value,
          '13_num_fechas': sanitizeScore(record['13_num_fechas'] ?? record.tabla?.contadores?.num_fechas, '13_num_fechas').value,
          '14_num_citas': sanitizeScore(record['14_num_citas'] ?? record.tabla?.contadores?.num_citas, '14_num_citas').value,
          '15_temporal_alignment': sanitizeNumeric(record['15_temporal_alignment'] ?? record.tabla?.contadores?.temporal_alignment, '15_temporal_alignment'),
          '16_citation_density': sanitizeNumeric(record['16_citation_density'] ?? record.tabla?.contadores?.citation_density, '16_citation_density'),
          
          // Flags, subscores, weights
          '17_flags': sanitizeJson(record['17_flags'] ?? record.tabla?.flags),
          '18_subscores': sanitizeJson(record['18_subscores'] ?? record.tabla?.subscores),
          '19_weights': sanitizeJson(record['19_weights'] ?? record.meta?.weights),
          
          // Raw responses
          '20_res_gpt_bruto': sanitizeText(record['20_res_gpt_bruto'] ?? record.relato_mini?.['res-gpt-bruto']),
          '21_res_perplex_bruto': sanitizeText(record['21_res_perplex_bruto'] ?? record.relato_mini?.['res-perplex-bruto']),
          '22_explicacion': sanitizeText(record['22_explicacion']),
          '22_res_gemini_bruto': sanitizeText(record['22_res_gemini_bruto']),
          '23_res_deepseek_bruto': sanitizeText(record['23_res_deepseek_bruto']),
          
          // NVM (News Volume Metric)
          '23_nvm_score': sanitizeScore(record['23_nvm_score'], '23_nvm_score').value,
          '24_nvm_peso': sanitizeWeight(record['24_nvm_peso'], '24_nvm_peso'),
          '25_nvm_categoria': sanitizeCategoria(record['25_nvm_categoria']),
          '25_explicaciones_detalladas': sanitizeJson(record['25_explicaciones_detalladas']),
          
          // DRM (Digital Reach Metric)
          '26_drm_score': sanitizeScore(record['26_drm_score'], '26_drm_score').value,
          '27_drm_peso': sanitizeWeight(record['27_drm_peso'], '27_drm_peso'),
          '28_drm_categoria': sanitizeCategoria(record['28_drm_categoria']),
          
          // SIM (Social Impact Metric)
          '29_sim_score': sanitizeScore(record['29_sim_score'], '29_sim_score').value,
          '30_sim_peso': sanitizeWeight(record['30_sim_peso'], '30_sim_peso'),
          '31_sim_categoria': sanitizeCategoria(record['31_sim_categoria']),
          
          // RMM (Reputation & Media Metric)
          '32_rmm_score': sanitizeScore(record['32_rmm_score'], '32_rmm_score').value,
          '33_rmm_peso': sanitizeWeight(record['33_rmm_peso'], '33_rmm_peso'),
          '34_rmm_categoria': sanitizeCategoria(record['34_rmm_categoria']),
          
          // CEM (Corporate Excellence Metric)
          '35_cem_score': sanitizeScore(record['35_cem_score'], '35_cem_score').value,
          '36_cem_peso': sanitizeWeight(record['36_cem_peso'], '36_cem_peso'),
          '37_cem_categoria': sanitizeCategoria(record['37_cem_categoria']),
          
          // GAM (Governance & Accountability Metric)
          '38_gam_score': sanitizeScore(record['38_gam_score'], '38_gam_score').value,
          '39_gam_peso': sanitizeWeight(record['39_gam_peso'], '39_gam_peso'),
          '40_gam_categoria': sanitizeCategoria(record['40_gam_categoria']),
          
          // DCM (Digital Communication Metric)
          '41_dcm_score': sanitizeScore(record['41_dcm_score'], '41_dcm_score').value,
          '42_dcm_peso': sanitizeWeight(record['42_dcm_peso'], '42_dcm_peso'),
          '43_dcm_categoria': sanitizeCategoria(record['43_dcm_categoria']),
          
          // CXM (Corporate Execution Metric) - WITH "NO APLICA" HANDLING
          '44_cxm_score': cxmScore.value,
          '45_cxm_peso': sanitizeWeight(record['45_cxm_peso'], '45_cxm_peso'),
          '46_cxm_categoria': sanitizeCategoria(record['46_cxm_categoria']),
          
          // Additional fields
          '47_fase': sanitizeText(record['47_fase']),
          '48_precio_accion': sanitizeStockPrice(record['48_precio_accion']),
          '49_reputacion_vs_precio': sanitizeText(record['49_reputacion_vs_precio']),
          '50_precio_accion_interanual': sanitizeText(record['50_precio_accion_interanual']),
          '51_rix_score_adjusted': sanitizeScore(record['51_rix_score_adjusted'], '51_rix_score_adjusted').value,
          '52_cxm_excluded': cxmScore.excluded || record['52_cxm_excluded'] === true,
          '59_precio_minimo_52_semanas': sanitizeText(record['59_precio_minimo_52_semanas']),
          
          // Batch execution date
          'batch_execution_date': record['batch_execution_date'] || new Date().toISOString(),
        };
        
        // Log CXM handling
        if (cxmScore.excluded) {
          console.log(`⚠️ CXM excluded for ${sanitizedRecord['03_target_name']}: original value was "no aplica" or similar`);
        }
        
        // Remove null values to use database defaults
        const cleanRecord: Record<string, any> = {};
        for (const [key, value] of Object.entries(sanitizedRecord)) {
          if (value !== null && value !== undefined) {
            cleanRecord[key] = value;
          }
        }
        
        console.log(`Inserting sanitized record for: ${cleanRecord['03_target_name']} (ticker: ${cleanRecord['05_ticker']})`);
        console.log(`CXM: score=${cleanRecord['44_cxm_score']}, excluded=${cleanRecord['52_cxm_excluded']}`);
        
        // FASE 1 — rix_runs DEPRECATED. Pipeline legacy de Make.com desactivado.
        // Cualquier insert se redirige a rix_runs_v2 para preservar continuidad
        // de datos si alguna integración externa sigue llamando a esta función.
        const { data, error } = await supabaseClient
          .from('rix_runs_v2')
          .insert(cleanRecord)
          .select('id, "03_target_name", "05_ticker", "09_rix_score", "52_cxm_excluded"');
        
        if (error) {
          console.error(`❌ Insert failed for ${cleanRecord['03_target_name']}:`, error);
          failedResults.push({
            index: i,
            target_name: cleanRecord['03_target_name'],
            ticker: cleanRecord['05_ticker'],
            error: error.message,
            details: error.details,
          });
        } else {
          console.log(`✅ Successfully inserted: ${cleanRecord['03_target_name']}`);
          insertedResults.push({
            index: i,
            target_name: cleanRecord['03_target_name'],
            ticker: cleanRecord['05_ticker'],
            id: data?.[0]?.id,
            cxm_excluded: cleanRecord['52_cxm_excluded'],
          });
        }
        
      } catch (recordError) {
        console.error(`❌ Error processing record ${i}:`, recordError);
        failedResults.push({
          index: i,
          target_name: record['03_target_name'] || record.meta?.target_name || 'unknown',
          error: recordError instanceof Error ? recordError.message : String(recordError),
        });
      }
    }

    // Summary
    console.log(`\n========== SUMMARY ==========`);
    console.log(`Total: ${records.length}`);
    console.log(`Inserted: ${insertedResults.length}`);
    console.log(`Failed: ${failedResults.length}`);
    
    const cxmExcludedCount = insertedResults.filter(r => r.cxm_excluded).length;
    if (cxmExcludedCount > 0) {
      console.log(`CXM excluded (no aplica): ${cxmExcludedCount}`);
    }

    // Determine response status
    const status = failedResults.length === 0 ? 200 : 
                   insertedResults.length === 0 ? 400 : 207;

    return new Response(
      JSON.stringify({
        success: failedResults.length === 0,
        total: records.length,
        inserted: insertedResults.length,
        failed: failedResults.length,
        cxm_excluded_count: cxmExcludedCount,
        results: insertedResults,
        errors: failedResults.length > 0 ? failedResults : undefined,
      }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[sanitize-rix-insert] Fatal error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
