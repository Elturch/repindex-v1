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
          metricsMap[`${metric.toLowerCase()}_score`] = subscore.score
          metricsMap[`${metric.toLowerCase()}_peso`] = subscore.peso
          metricsMap[`${metric.toLowerCase()}_categoria`] = subscore.categoria
        }
      })

      const insertData = {
        run_id: result.meta.run_id,
        model_name: result.meta.model_name,
        target_name: result.meta.target_name,
        target_type: result.meta.target_type,
        ticker: result.meta.ticker,
        period_from: result.meta.period_from,
        period_to: result.meta.period_to,
        tz: result.meta.tz,
        pari_score: result.tabla.pari,
        resumen: result.relato_mini.resumen,
        puntos_clave: result.relato_mini.puntos_clave,
        palabras: result.tabla.contadores.palabras,
        num_fechas: result.tabla.contadores.num_fechas,
        num_citas: result.tabla.contadores.num_citas,
        temporal_alignment: result.tabla.contadores.temporal_alignment,
        citation_density: result.tabla.contadores.citation_density,
        flags: result.tabla.flags,
        weights: result.meta.weights,
        subscores: result.tabla.subscores,
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