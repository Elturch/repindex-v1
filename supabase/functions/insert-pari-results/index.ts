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

    const insertPromises = results.map(async (result) => {
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

      const insertData = {
        "01_run_id": result.meta.run_id,
        "02_model_name": result.meta.model_name,
        "03_target_name": result.meta.target_name,
        "04_target_type": result.meta.target_type,
        "05_ticker": result.meta.ticker,
        "06_period_from": result.meta.period_from,
        "07_period_to": result.meta.period_to,
        "08_tz": result.meta.tz,
        "09_pari_score": result.tabla.pari,
        "10_resumen": result.relato_mini.resumen,
        "11_puntos_clave": result.relato_mini.puntos_clave,
        "12_palabras": result.tabla.contadores.palabras,
        "13_num_fechas": result.tabla.contadores.num_fechas,
        "14_num_citas": result.tabla.contadores.num_citas,
        "15_temporal_alignment": result.tabla.contadores.temporal_alignment,
        "16_citation_density": result.tabla.contadores.citation_density,
        "17_flags": result.tabla.flags,
        "18_subscores": result.tabla.subscores,
        "19_weights": result.meta.weights,
        "20_res_gpt_bruto": result.relato_mini['res-gpt-bruto'] || null,
        "21_res_perplex_bruto": result.relato_mini['res-perplex-bruto'] || null,
        "22_explicacion": result.relato_mini.explicacion || null,
        "47_fase": result.meta.fase || result.meta.target_type || null,
        ...metricsMap
      }

      const { data, error } = await supabaseClient
        .from('pari_runs')
        .insert(insertData)
        .select()

      if (error) throw error
      return data
    })

    const insertedData = await Promise.all(insertPromises)

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted_count: insertedData.length,
        data: insertedData.flat()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error inserting PARI results:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})