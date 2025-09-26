import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const insertPromises = validResults.map(async (result, originalIndex) => {
      console.log(`Processing result ${originalIndex} with run_id: ${result.meta.run_id}`)
      
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
              metricsMap["23_lns_score"] = subscore.score
              metricsMap["24_lns_peso"] = subscore.peso
              metricsMap["25_lns_categoria"] = subscore.categoria
              break
            case 'es':
              metricsMap["26_es_score"] = subscore.score
              metricsMap["27_es_peso"] = subscore.peso
              metricsMap["28_es_categoria"] = subscore.categoria
              break
            case 'sam':
              metricsMap["29_sam_score"] = subscore.score
              metricsMap["30_sam_peso"] = subscore.peso
              metricsMap["31_sam_categoria"] = subscore.categoria
              break
            case 'rm':
              metricsMap["32_rm_score"] = subscore.score
              metricsMap["33_rm_peso"] = subscore.peso
              metricsMap["34_rm_categoria"] = subscore.categoria
              break
            case 'clr':
              metricsMap["35_clr_score"] = subscore.score
              metricsMap["36_clr_peso"] = subscore.peso
              metricsMap["37_clr_categoria"] = subscore.categoria
              break
            case 'gip':
              metricsMap["38_gip_score"] = subscore.score
              metricsMap["39_gip_peso"] = subscore.peso
              metricsMap["40_gip_categoria"] = subscore.categoria
              break
            case 'kgi':
              metricsMap["41_kgi_score"] = subscore.score
              metricsMap["42_kgi_peso"] = subscore.peso
              metricsMap["43_kgi_categoria"] = subscore.categoria
              break
            case 'mpi':
              metricsMap["44_mpi_score"] = subscore.score
              metricsMap["45_mpi_peso"] = subscore.peso
              metricsMap["46_mpi_categoria"] = subscore.categoria
              break
          }
        }
      })

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
        "09_pari_score": result.tabla.pari,
        "10_resumen": result.relato_mini.resumen,
        "11_puntos_clave": Array.isArray(result.relato_mini.puntos_clave) 
          ? result.relato_mini.puntos_clave 
          : result.relato_mini.puntos_clave,
        "12_palabras": result.tabla.contadores.palabras,
        "13_num_fechas": result.tabla.contadores.num_fechas,
        "14_num_citas": result.tabla.contadores.num_citas,
        "15_temporal_alignment": result.tabla.contadores.temporal_alignment,
        "16_citation_density": result.tabla.contadores.citation_density,
        "17_flags": convertToArray(result.tabla.flags, "17_flags"),
        "18_subscores": result.tabla.subscores,
        "19_weights": result.meta.weights,
        "20_res_gpt_bruto": result.relato_mini['res-gpt-bruto'] || null,
        "21_res_perplex_bruto": result.relato_mini['res-perplex-bruto'] || null,
        "22_explicacion": processExplanationField(result.relato_mini.explicacion),
        "23_explicaciones_detalladas": detailedExplanations.length > 0 ? detailedExplanations : null,
        "47_fase": result.meta.target_type || null,
        ...metricsMap
      }

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
        console.error('Database insertion error:', error)
        console.error('Failed data:', insertData)
        throw error
      }
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