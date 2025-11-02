import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { toZonedTime, fromZonedTime } from 'https://deno.land/x/date_fns_tz@v3.2.0/index.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PariResult {
  meta: {
    run_id: string
    model_name: string
    target_name: string
    target_type: string
    ticker: string | null
    period_from: string
    period_to: string
    tz: string
    weights: Record<string, number>
  }
  relato_mini: {
    resumen: string
    puntos_clave: string[]
    explicacion?: string[]
    'res-gpt-bruto'?: string
    'res-perplex-bruto'?: string
  }
  tabla: {
    pari: number
    subscores: Array<{
      label: string
      label_en_sigla: string
      score: number
      peso: number
      categoria: string
      explicacion: string
    }>
    contadores: {
      palabras: number
      num_fechas: number
      num_citas: number
      temporal_alignment: number
      citation_density: number
    }
    flags: string[]
  }
}

// Helper function to safely convert any value to an integer, with robust validation
function ensureInteger(value: any, defaultValue: number = 0, fieldName?: string): number {
  // Log the incoming value for debugging
  if (fieldName) {
    console.log(`[ensureInteger] Processing ${fieldName}:`, typeof value, JSON.stringify(value));
  }
  
  // Handle null/undefined
  if (value === null || value === undefined) {
    if (fieldName) console.log(`[ensureInteger] ${fieldName}: null/undefined -> ${defaultValue}`);
    return defaultValue;
  }
  
  // Handle string values
  if (typeof value === 'string') {
    const trimmed = value.trim();
    
    // Handle empty strings
    if (trimmed === '') {
      if (fieldName) console.log(`[ensureInteger] ${fieldName}: empty string -> ${defaultValue}`);
      return defaultValue;
    }
    
    // Handle special text patterns
    const lowerTrimmed = trimmed.toLowerCase();
    const specialPatterns = ['no_aplica', 'no aplica', 'n/a', 'na', 'no-aplica', 'noapplica', 'nc', 'null', 'undefined', 'none'];
    if (specialPatterns.some(pattern => lowerTrimmed.includes(pattern))) {
      if (fieldName) console.warn(`[ensureInteger] ${fieldName}: special pattern detected "${value}" -> ${defaultValue}`);
      return defaultValue;
    }
    
    // Try to extract numeric part from mixed text
    const numericMatch = trimmed.match(/-?\d+\.?\d*/);
    if (numericMatch) {
      const extracted = parseFloat(numericMatch[0]);
      if (!isNaN(extracted)) {
        const result = Math.round(extracted);
        if (fieldName && trimmed !== numericMatch[0]) {
          console.warn(`[ensureInteger] ${fieldName}: extracted number from text "${value}" -> ${result}`);
        }
        return result;
      }
    }
  }
  
  // Handle number values
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      if (fieldName) console.warn(`[ensureInteger] ${fieldName}: invalid number (NaN/Infinity) -> ${defaultValue}`);
      return defaultValue;
    }
    return Math.round(value);
  }
  
  // Try to convert to number
  const parsed = Number(value);
  if (isNaN(parsed) || !isFinite(parsed)) {
    if (fieldName) console.warn(`[ensureInteger] ${fieldName}: conversion failed "${value}" (${typeof value}) -> ${defaultValue}`);
    return defaultValue;
  }
  
  const result = Math.round(parsed);
  if (fieldName) {
    console.log(`[ensureInteger] ${fieldName}: successfully converted "${value}" -> ${result}`);
  }
  return result;
}

// Helper function to validate all numeric fields before insertion
function validateNumericFields(data: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const numericFields = [
    '09_pari_score', '12_palabras', '13_num_fechas', '14_num_citas',
    '23_lns_score', '24_lns_peso', '26_es_score', '27_es_peso',
    '29_sam_score', '30_sam_peso', '32_rm_score', '33_rm_peso',
    '35_clr_score', '36_clr_peso', '38_gip_score', '39_gip_peso',
    '41_kgi_score', '42_kgi_peso', '44_mpi_score', '45_mpi_peso',
    '51_pari_score_adjusted'
  ];
  
  numericFields.forEach(field => {
    const value = data[field];
    if (value !== null && value !== undefined) {
      if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
        errors.push(`${field} is not a valid number: ${JSON.stringify(value)} (type: ${typeof value})`);
      }
    }
  });
  
  return { valid: errors.length === 0, errors };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { results } = await req.json() as { results: PariResult[] }
    
    console.log(`Processing ${results.length} PARI results`)

    // Company name to ticker mapping function - queries database automatically
    const mapCompanyNameToTicker = async (targetName: string | null, originalTicker?: string | null): Promise<string | null> => {
      if (!targetName) return originalTicker && originalTicker !== '{TICKER}' ? originalTicker : null
      
      const name = targetName.toLowerCase().trim()
      console.log(`🔍 Querying database for company: "${targetName}" (normalized: "${name}")`)
      
      try {
        // First, try exact match on issuer_name
        let { data: companies, error } = await supabaseClient
          .from('repindex_root_issuers')
          .select('ticker, issuer_name')
          .ilike('issuer_name', targetName)
          .limit(5)
        
        if (error) {
          console.error('❌ Database query error:', error)
          throw error
        }
        
        console.log(`📊 Database query returned ${companies?.length || 0} results for "${targetName}"`)
        
        if (companies && companies.length > 0) {
          const exactMatch = companies.find(c => c.issuer_name.toLowerCase() === name)
          if (exactMatch) {
            console.log(`✅ Exact database match: "${targetName}" -> "${exactMatch.ticker}"`)
            return exactMatch.ticker
          }
          
          // If no exact match, take the first result
          console.log(`✅ Database fuzzy match: "${targetName}" -> "${companies[0].ticker}" (matched: "${companies[0].issuer_name}")`)
          return companies[0].ticker
        }
        
        // If no matches, try partial matching with LIKE patterns
        console.log(`🔄 No exact matches, trying partial matching for: "${targetName}"`)
        
        const searchTerms = [
          `%${name}%`,
          `${name}%`,
          `%${name}`
        ]
        
        for (const searchTerm of searchTerms) {
          const { data: partialMatches, error: partialError } = await supabaseClient
            .from('repindex_root_issuers')
            .select('ticker, issuer_name')
            .ilike('issuer_name', searchTerm)
            .limit(3)
          
          if (partialError) {
            console.error('❌ Partial search error:', partialError)
            continue
          }
          
          if (partialMatches && partialMatches.length > 0) {
            console.log(`✅ Partial database match: "${targetName}" -> "${partialMatches[0].ticker}" (matched: "${partialMatches[0].issuer_name}")`)
            return partialMatches[0].ticker
          }
        }
        
        // If still no matches, try with individual words
        const words = name.split(/\s+/).filter(word => word.length > 2)
        if (words.length > 0) {
          console.log(`🔄 Trying word-based search for: ${words.join(', ')}`)
          
          for (const word of words) {
            const { data: wordMatches, error: wordError } = await supabaseClient
              .from('repindex_root_issuers')
              .select('ticker, issuer_name')
              .ilike('issuer_name', `%${word}%`)
              .limit(3)
            
            if (wordError) {
              console.error('❌ Word search error:', wordError)
              continue
            }
            
            if (wordMatches && wordMatches.length > 0) {
              console.log(`✅ Word-based match: "${targetName}" -> "${wordMatches[0].ticker}" (matched on "${word}" -> "${wordMatches[0].issuer_name}")`)
              return wordMatches[0].ticker
            }
          }
        }
        
        // If original ticker exists and is not placeholder, use it
        if (originalTicker && originalTicker !== '{TICKER}' && originalTicker.trim().length > 0) {
          console.log(`⚠️  Using original ticker as fallback: "${originalTicker}" for company: "${targetName}"`)
          return originalTicker.trim()
        }
        
        // Final fallback: log all available companies for debugging
        console.error(`❌ CRITICAL: No ticker mapping found for company: "${targetName}". Checking database contents...`)
        
        const { data: allCompanies, error: listError } = await supabaseClient
          .from('repindex_root_issuers')
          .select('ticker, issuer_name')
          .limit(10)
        
        if (!listError && allCompanies) {
          console.log('📋 Available companies in database (first 10):')
          allCompanies.forEach(c => console.log(`  - "${c.issuer_name}" -> ${c.ticker}`))
        }
        
        return null
        
      } catch (error) {
        console.error(`❌ Error in mapCompanyNameToTicker for "${targetName}":`, error)
        
        // If original ticker exists and is not placeholder, use it as emergency fallback
        if (originalTicker && originalTicker !== '{TICKER}' && originalTicker.trim().length > 0) {
          console.log(`🆘 Emergency fallback to original ticker: "${originalTicker}" for company: "${targetName}"`)
          return originalTicker.trim()
        }
        
        return null
      }
    }

    // Helper function to normalize and validate strings
    const normalizeString = (value: any): string | null => {
      if (value === null || value === undefined) return null
      const trimmed = String(value).trim()
      return trimmed.length > 0 ? trimmed : null
    }

    // Helper function to process explanation fields (convert arrays to strings)
    const processExplanationField = (value: any): string | null => {
      if (value === null || value === undefined) return null
      
      // If it's an array, join with line breaks
      if (Array.isArray(value)) {
        const filtered = value
          .filter(item => item !== null && item !== undefined)
          .map(item => String(item).trim())
          .filter(item => item.length > 0)
        return filtered.length > 0 ? filtered.join('\n') : null
      }
      
      // If it's a string, return as is
      const stringValue = String(value).trim()
      return stringValue.length > 0 ? stringValue : null
    }

    // Helper function to safely convert any value to array for PostgreSQL
    const convertToArray = (value: any, fieldName?: string): string[] | null => {
      try {
        if (value === null || value === undefined) return null
        
        console.log(`Processing ${fieldName || 'field'}:`, typeof value, 'value preview:', String(value).substring(0, 100))
        
        // If it's already an array, validate and sanitize it
        if (Array.isArray(value)) {
          console.log(`${fieldName} is already an array with ${value.length} items`)
          const sanitized = value
            .map(item => {
              if (item === null || item === undefined) return ''
              return String(item).trim()
            })
            .filter(item => item.length > 0)
            // Remove any problematic characters that could break PostgreSQL array literals
            .map(item => item.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''))
          
          return sanitized.length > 0 ? sanitized : null
        }
        
        // Convert to string and sanitize
        let text = String(value).trim()
        if (text.length === 0) return null
        
        // Remove problematic characters that could break PostgreSQL
        text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        
        // Remove any PostgreSQL array literal syntax if present
        text = text.replace(/^\{|\}$/g, '')
        
        console.log(`Converting ${fieldName} string to array:`, text.substring(0, 100) + '...')
        
        // Try different splitting strategies
        let result: string[] = []
        
        // Strategy 1: Split by ". " (sentence endings)
        if (text.includes('. ')) {
          result = text.split('. ')
            .map(item => item.trim())
            .filter(item => item.length > 0)
            .map(item => item.endsWith('.') ? item : item + '.')
        }
        // Strategy 2: Split by comma followed by space (common array format)
        else if (text.includes(', ')) {
          result = text.split(', ')
            .map(item => item.trim())
            .filter(item => item.length > 0)
        }
        // Strategy 3: Split by semicolon patterns
        else if (text.includes(';\n') || text.includes(';')) {
          result = text.split(/[;\n]+/)
            .map(item => item.trim())
            .filter(item => item.length > 0)
        }
        // Strategy 4: Split by double newlines
        else if (text.includes('\n\n')) {
          result = text.split('\n\n')
            .map(item => item.trim())
            .filter(item => item.length > 0)
        }
        // Strategy 5: Split by single newlines if text is long
        else if (text.includes('\n') && text.length > 200) {
          result = text.split('\n')
            .map(item => item.trim())
            .filter(item => item.length > 0)
        }
        // Strategy 6: If no clear separators, treat as single item
        else {
          result = [text]
        }
        
        // Final sanitization of each item
        result = result.map(item => 
          item.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()
        ).filter(item => item.length > 0)
        
        console.log(`Successfully converted ${fieldName} to array with ${result.length} items`)
        return result.length > 0 ? result : null
        
      } catch (error) {
        console.error(`Error converting ${fieldName} to array:`, error, 'Original value:', value)
        // Return null instead of crashing
        return null
      }
    }

    // Validate and filter results before processing - allow empty target_name
    const validResults: PariResult[] = []
    const invalidResults: { index: number, errors: string[] }[] = []

    results.forEach((result, index) => {
      const errors: string[] = []
      
      // Normalize target_name but allow it to be null/empty
      const normalizedTargetName = normalizeString(result.meta?.target_name)
      
      // Log the normalization for debugging
      console.log(`Result ${index}: normalized target_name from "${result.meta?.target_name}" to "${normalizedTargetName}"`)
      
      // Apply normalization to the result data
      if (result.meta) {
        result.meta.target_name = normalizedTargetName || result.meta.target_name
      }
      
      // No strict validation - allow all results through
      if (errors.length > 0) {
        console.error(`Validation failed for result ${index}:`, errors)
        console.error(`Result metadata:`, JSON.stringify(result.meta, null, 2))
        invalidResults.push({ index, errors })
      } else {
        validResults.push(result)
      }
    })

    if (invalidResults.length > 0) {
      console.error(`Found ${invalidResults.length} invalid results:`, invalidResults)
      
      // Create detailed error message for the first few failures
      const errorDetails = invalidResults.slice(0, 3).map(invalid => 
        `Registro ${invalid.index + 1}: ${invalid.errors.join(', ')}`
      ).join('\n')
      
      const errorMessage = `${invalidResults.length} resultados fallaron la validación:\n${errorDetails}${invalidResults.length > 3 ? `\n... y ${invalidResults.length - 3} más` : ''}`
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          invalid_results: invalidResults,
          message: `${invalidResults.length} results failed validation` 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Calculate batch_execution_date based on Madrid timezone
    // All records from the same batch MUST have the exact same timestamp (normalized to Sunday 00:00:00 Madrid time)
    const calculateBatchExecutionDate = (): string => {
      const now = new Date();
      const madridTime = toZonedTime(now, 'Europe/Madrid');
      const dayOfWeek = madridTime.getDay(); // 0 = Sunday
      
      let batchDate: Date;
      
      if (dayOfWeek === 0) {
        // It's Sunday in Madrid: use that Sunday at 00:00:00
        batchDate = new Date(madridTime);
        batchDate.setHours(0, 0, 0, 0);
        console.log(`✅ Current day is Sunday in Madrid. Using ${batchDate.toISOString()}`);
      } else if (dayOfWeek === 6 && madridTime.getHours() >= 23) {
        // It's Saturday after 23:00 in Madrid: use next day (Sunday) at 00:00:00
        batchDate = new Date(madridTime);
        batchDate.setDate(madridTime.getDate() + 1);
        batchDate.setHours(0, 0, 0, 0);
        console.log(`✅ Saturday after 23:00 in Madrid. Using next Sunday ${batchDate.toISOString()}`);
      } else {
        // Any other day: calculate next Sunday at 00:00:00
        const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
        batchDate = new Date(madridTime);
        batchDate.setDate(madridTime.getDate() + daysUntilSunday);
        batchDate.setHours(0, 0, 0, 0);
        console.log(`✅ Not Sunday. Days until next Sunday: ${daysUntilSunday}. Using ${batchDate.toISOString()}`);
      }
      
      // Convert back to UTC maintaining the normalized date (Sunday 00:00:00 Madrid)
      const utcDate = fromZonedTime(batchDate, 'Europe/Madrid');
      console.log(`📅 Batch execution date (Madrid): ${batchDate.toISOString()}, UTC: ${utcDate.toISOString()}`);
      
      return utcDate.toISOString();
    };
    
    const batchExecutionDate = calculateBatchExecutionDate();
    console.log(`📅 Final batch execution date: ${batchExecutionDate}`);

    const insertPromises = validResults.map(async (result, originalIndex) => {
      console.log(`Processing result ${originalIndex} with run_id: ${result.meta.run_id}`)
      
      // Check for RM = 0 condition early for logging
      const rmScore = result.tabla.subscores.find(s => s.label_en_sigla.toLowerCase().includes('rm'))?.score || 0;
      if (rmScore === 0) {
        console.warn(`⚠️  WEEKLY READING ERROR: RM score is 0 for company "${result.meta.target_name}" (run_id: ${result.meta.run_id}). This indicates lack of recent information and will mark data as invalid.`);
      }
      
      // Log ticker mapping for debugging
      const mappedTicker = await mapCompanyNameToTicker(result.meta.target_name, result.meta.ticker);
      if (!mappedTicker) {
        const errorMsg = `❌ CRITICAL: No ticker found for company: "${result.meta.target_name}". Original ticker: "${result.meta.ticker}". This record will be SKIPPED to prevent constraint violation.`;
        console.error(errorMsg);
        
        // Return a rejected promise with detailed error info instead of throwing
        return Promise.reject({
          error: 'TICKER_MAPPING_FAILED',
          message: errorMsg,
          company: result.meta.target_name,
          originalTicker: result.meta.ticker,
          runId: result.meta.run_id
        });
      } else {
        console.log(`✅ Successfully mapped "${result.meta.target_name}" to ticker: "${mappedTicker}"`);
      }
      
      // Map subscores to individual metric columns
      const metricsMap: Record<string, any> = {}
      
      result.tabla.subscores.forEach(subscore => {
        const metric = subscore.label_en_sigla.split(' — ')[1] // Extract acronym after "—"
        if (metric) {
          const metricLower = metric.toLowerCase()
          // Map to numbered columns based on metric type
          switch(metricLower) {
            case 'lns':
              metricsMap["23_lns_score"] = ensureInteger(subscore.score, 0, "23_lns_score")
              metricsMap["24_lns_peso"] = ensureInteger(subscore.peso, 0, "24_lns_peso")
              metricsMap["25_lns_categoria"] = subscore.categoria
              break
            case 'es':
              metricsMap["26_es_score"] = ensureInteger(subscore.score, 0, "26_es_score")
              metricsMap["27_es_peso"] = ensureInteger(subscore.peso, 0, "27_es_peso")
              metricsMap["28_es_categoria"] = subscore.categoria
              break
            case 'sam':
              metricsMap["29_sam_score"] = ensureInteger(subscore.score, 0, "29_sam_score")
              metricsMap["30_sam_peso"] = ensureInteger(subscore.peso, 0, "30_sam_peso")
              metricsMap["31_sam_categoria"] = subscore.categoria
              break
            case 'rm':
              metricsMap["32_rm_score"] = ensureInteger(subscore.score, 0, "32_rm_score")
              metricsMap["33_rm_peso"] = ensureInteger(subscore.peso, 0, "33_rm_peso")
              metricsMap["34_rm_categoria"] = subscore.categoria
              break
            case 'clr':
              metricsMap["35_clr_score"] = ensureInteger(subscore.score, 0, "35_clr_score")
              metricsMap["36_clr_peso"] = ensureInteger(subscore.peso, 0, "36_clr_peso")
              metricsMap["37_clr_categoria"] = subscore.categoria
              break
            case 'gip':
              metricsMap["38_gip_score"] = ensureInteger(subscore.score, 0, "38_gip_score")
              metricsMap["39_gip_peso"] = ensureInteger(subscore.peso, 0, "39_gip_peso")
              metricsMap["40_gip_categoria"] = subscore.categoria
              break
            case 'kgi':
              metricsMap["41_kgi_score"] = ensureInteger(subscore.score, 0, "41_kgi_score")
              metricsMap["42_kgi_peso"] = ensureInteger(subscore.peso, 0, "42_kgi_peso")
              metricsMap["43_kgi_categoria"] = subscore.categoria
              break
            case 'mpi':
              console.log(`🔍 [MPI Processing] Raw data for company "${result.meta.target_name}":`, {
                score: subscore.score,
                scoreType: typeof subscore.score,
                peso: subscore.peso,
                pesoType: typeof subscore.peso,
                categoria: subscore.categoria
              });
              
              // Check if MPI score is "no aplica" or similar text
              const mpiScoreRaw = subscore.score;
              const mpiScoreStr = String(mpiScoreRaw).toLowerCase().trim();
              const mpiCategoria = subscore.categoria?.toLowerCase().trim() || '';
              
              // Check for "no aplica" text patterns
              const noAplicaPatterns = ['no_aplica', 'no aplica', 'n/a', 'na', 'no-aplica', 'noapplica'];
              const isMpiNoAplicaScore = noAplicaPatterns.some(pattern => mpiScoreStr.includes(pattern));
              const isMpiNoAplicaCategoria = noAplicaPatterns.some(pattern => mpiCategoria.includes(pattern));
              const isMpiNoAplica = isMpiNoAplicaScore || isMpiNoAplicaCategoria;
              
              if (isMpiNoAplica) {
                console.log(`⚠️  [MPI] "no aplica" detected (score: "${mpiScoreRaw}", categoria: "${subscore.categoria}") for company "${result.meta.target_name}". Setting MPI score to 0 and will recalculate PARI.`);
                metricsMap["44_mpi_score"] = 0;
                metricsMap["45_mpi_peso"] = ensureInteger(subscore.peso, 0, "45_mpi_peso");
                metricsMap["46_mpi_categoria"] = 'no aplica';
                metricsMap["52_mpi_excluded"] = true;
              } else {
                // Try to parse score as number, default to 0 if invalid
                const parsedScore = ensureInteger(mpiScoreRaw, 0, "44_mpi_score");
                if (parsedScore === 0 && mpiScoreRaw !== 0 && mpiScoreRaw !== '0') {
                  console.warn(`⚠️  [MPI] Invalid MPI score received: "${mpiScoreRaw}" (type: ${typeof mpiScoreRaw}) for company "${result.meta.target_name}". Converting to 0.`);
                }
                metricsMap["44_mpi_score"] = parsedScore;
                metricsMap["45_mpi_peso"] = ensureInteger(subscore.peso, 0, "45_mpi_peso");
                metricsMap["46_mpi_categoria"] = subscore.categoria;
                metricsMap["52_mpi_excluded"] = false;
              }
              
              console.log(`✅ [MPI] Final values:`, {
                "44_mpi_score": metricsMap["44_mpi_score"],
                "45_mpi_peso": metricsMap["45_mpi_peso"],
                "46_mpi_categoria": metricsMap["46_mpi_categoria"],
                "52_mpi_excluded": metricsMap["52_mpi_excluded"]
              });
              break
          }
        }
      })

      // Check if MPI "no aplica" and recalculate PARI if necessary
      const mpiScore = metricsMap["44_mpi_score"];
      const mpiCategoria = metricsMap["46_mpi_categoria"]?.toLowerCase().trim() || '';
      const isMpiNoAplica = mpiScore === 0 && (mpiCategoria === 'no aplica' || mpiCategoria === 'n/a' || mpiCategoria === 'na');
      
      let adjustedPariScore: number | null = null;
      let mpiExcluded = false;
      
      if (isMpiNoAplica) {
        console.log(`🔄 Recalculating PARI score without MPI for company "${result.meta.target_name}"`);
        
        // Extract all metric scores and weights (excluding MPI)
        const metrics = [
          { score: metricsMap["23_lns_score"], peso: metricsMap["24_lns_peso"] },
          { score: metricsMap["26_es_score"], peso: metricsMap["27_es_peso"] },
          { score: metricsMap["29_sam_score"], peso: metricsMap["30_sam_peso"] },
          { score: metricsMap["32_rm_score"], peso: metricsMap["33_rm_peso"] },
          { score: metricsMap["35_clr_score"], peso: metricsMap["36_clr_peso"] },
          { score: metricsMap["38_gip_score"], peso: metricsMap["39_gip_peso"] },
          { score: metricsMap["41_kgi_score"], peso: metricsMap["42_kgi_peso"] }
        ];
        
        // Calculate total weight without MPI
        const totalWeightWithoutMpi = metrics.reduce((sum, m) => sum + (m.peso || 0), 0);
        
        if (totalWeightWithoutMpi > 0) {
          // Calculate weighted average without MPI
          const weightedSum = metrics.reduce((sum, m) => {
            const score = m.score ?? 0;
            const peso = m.peso ?? 0;
            return sum + (score * peso);
          }, 0);
          
          adjustedPariScore = Math.round(weightedSum / totalWeightWithoutMpi);
          mpiExcluded = true;
          
          console.log(`✅ Adjusted PARI score (without MPI): ${adjustedPariScore} (original: ${result.tabla.pari})`);
        } else {
          console.warn(`⚠️  Could not calculate adjusted PARI - total weight is 0`);
        }
      }

      // Extract detailed explanations from subscores
      const detailedExplanations = result.tabla.subscores
        .map(subscore => subscore.explicacion)
        .filter(explicacion => explicacion && explicacion.trim().length > 0)

      const insertData: Record<string, any> = {
        "02_model_name": result.meta.model_name,
        "03_target_name": result.meta.target_name,
        "04_target_type": result.meta.target_type,
        "05_ticker": mappedTicker,
        "06_period_from": result.meta.period_from,
        "07_period_to": result.meta.period_to,
        "08_tz": result.meta.tz,
        "batch_execution_date": batchExecutionDate,
        "09_pari_score": ensureInteger(result.tabla.pari, 0, "09_pari_score"),
        "10_resumen": result.relato_mini.resumen,
        "11_puntos_clave": Array.isArray(result.relato_mini.puntos_clave) 
          ? result.relato_mini.puntos_clave 
          : result.relato_mini.puntos_clave,
        "12_palabras": ensureInteger(result.tabla.contadores.palabras, 0, "12_palabras"),
        "13_num_fechas": ensureInteger(result.tabla.contadores.num_fechas, 0, "13_num_fechas"),
        "14_num_citas": ensureInteger(result.tabla.contadores.num_citas, 0, "14_num_citas"),
        "15_temporal_alignment": result.tabla.contadores.temporal_alignment,
        "16_citation_density": result.tabla.contadores.citation_density,
        "17_flags": convertToArray(result.tabla.flags, "17_flags"),
        "18_subscores": result.tabla.subscores,
        "19_weights": result.meta.weights,
        "20_res_gpt_bruto": result.relato_mini['res-gpt-bruto'] || null,
        "21_res_perplex_bruto": result.relato_mini['res-perplex-bruto'] || null,
        "22_explicacion": processExplanationField(result.relato_mini.explicacion),
        "25_explicaciones_detalladas": detailedExplanations.length > 0 ? detailedExplanations : null,
        "47_fase": result.meta.target_type || null,
        "51_pari_score_adjusted": adjustedPariScore !== null ? ensureInteger(adjustedPariScore, 0, "51_pari_score_adjusted") : null,
        "52_mpi_excluded": mpiExcluded,
        ...metricsMap
      }
      
      // Validate all numeric fields before insertion
      const validation = validateNumericFields(insertData);
      if (!validation.valid) {
        const errorMsg = `❌ VALIDATION FAILED for "${result.meta.target_name}" (run_id: ${result.meta.run_id}):\n${validation.errors.join('\n')}`;
        console.error(errorMsg);
        console.error('Full insertData:', JSON.stringify(insertData, null, 2));
        
        return Promise.reject({
          error: 'NUMERIC_VALIDATION_FAILED',
          message: errorMsg,
          validationErrors: validation.errors,
          company: result.meta.target_name,
          runId: result.meta.run_id,
          insertData: insertData
        });
      }
      
      console.log(`✅ [Validation] All numeric fields validated for "${result.meta.target_name}"`)

      // Solo añadir 01_run_id si existe en los datos, sino usar el valor por defecto de la DB
      if (result.meta.run_id) {
        insertData["01_run_id"] = result.meta.run_id
      }

      // Log the data being inserted for debugging
      console.log('Inserting data for target:', insertData["03_target_name"] || insertData["01_run_id"])
      console.log('Array fields - flags:', insertData["17_flags"], 'explicacion:', insertData["22_explicacion"])
      
      const { data, error } = await supabaseClient
        .from('pari_runs')
        .insert(insertData)
        .select()

      if (error) {
        console.error('❌ [DB ERROR] Database insertion error for:', result.meta.target_name);
        console.error('Error details:', JSON.stringify(error, null, 2));
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error hint:', error.hint);
        console.error('Failed insertData:', JSON.stringify(insertData, null, 2));
        
        // Check for specific error types
        if (error.message?.includes('invalid input syntax for type integer')) {
          const match = error.message.match(/column "([^"]+)"/);
          const columnName = match ? match[1] : 'unknown';
          console.error(`❌ [DB ERROR] INTEGER TYPE ERROR detected in column: ${columnName}`);
          console.error(`Value that failed: ${JSON.stringify(insertData[columnName])}`);
        }
        
        throw error;
      }
      
      console.log(`✅ [DB] Successfully inserted data for "${result.meta.target_name}"`);
      return data
    })

    // Use Promise.allSettled to handle failures gracefully
    const insertResults = await Promise.allSettled(insertPromises)
    
    const successfulInserts: any[] = []
    const failedInserts: any[] = []
    
    insertResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulInserts.push(result.value)
      } else {
        console.error(`Failed to insert result ${index}:`, result.reason)
        failedInserts.push({
          index,
          error: result.reason,
          company: validResults[index]?.meta?.target_name || 'Unknown'
        })
      }
    })
    
    console.log(`Insertion summary: ${successfulInserts.length} successful, ${failedInserts.length} failed`)
    
    // Log details about failed inserts
    if (failedInserts.length > 0) {
      console.error('Failed inserts details:', failedInserts)
    }

    // Return response with both successful and failed inserts
    const responseData = {
      success: successfulInserts.length > 0,
      inserted_count: successfulInserts.length,
      failed_count: failedInserts.length,
      data: successfulInserts.flat(),
      failures: failedInserts.length > 0 ? failedInserts : undefined
    }
    
    // Return 207 (Multi-Status) if there were partial failures, 200 if all successful
    const statusCode = failedInserts.length > 0 ? 207 : 200
    
    return new Response(
      JSON.stringify(responseData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      },
    )

  } catch (error) {
    console.error('Error inserting PARI results:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})