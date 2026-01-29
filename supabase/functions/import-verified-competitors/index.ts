import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mapping of tickers to their verified competitors (from Excel)
const VERIFIED_COMPETITORS: Record<string, string[]> = {
  'A3M': ['MFEB'],
  'ABERTIS-PRIV': ['FER', 'ACS', 'SCYR'],
  'ACCENTURE-PRIV': ['DELOITTE-PRIV', 'PWC-PRIV', 'EY-PRIV', 'KPMG-PRIV'],
  'ACS': ['FER', 'ANA', 'SCYR', 'FCC-PRIV', 'OHL'],
  'ACX': ['MTS'],
  'ADX': ['HLZ', 'IBE', 'ELE', 'NTGY'],
  'ADZ': ['ITX'],
  'AED': ['MVC', 'HOME'],
  'ALM': ['GRF', 'PHM', 'FAE'],
  'ALT': ['IZE', 'SER'],
  'ALTR': ['R4'],
  'AMAZON-PRIV': ['GOOGLE-PRIV', 'META-PRIV'],
  'AMP': ['IDR', 'EME-PRIV'],
  'ANA': ['ACS', 'FER', 'SCYR', 'FCC-PRIV', 'OHL'],
  'ANE': ['SLR', 'GRE', 'ECR'],
  'ANTOLIN-PRIV': ['CIE', 'GEST'],
  'ARM': ['MRL', 'COL'],
  'ATR': ['SANITAS', 'CBAV'],
  'BBVA': ['SAN', 'CABK', 'SAB', 'BKT', 'UNI'],
  'BIL': ['RIO'],
  'BKT': ['BBVA', 'SAN', 'CABK', 'SAB', 'UNI'],
  'BOOKING-PRIV': ['AIRBNB-PRIV', 'EDR'],
  'CABK': ['BBVA', 'SAN', 'SAB', 'BKT', 'UNI'],
  'CAF': ['TLG'],
  'CAST': ['LRE'],
  'CAT': ['MAP', 'LDA', 'MUTUA-PRIV'],
  'CBAV': ['ATR'],
  'CEPSA-PRIV': ['REP'],
  'CIE': ['ANTOLIN-PRIV', 'GEST'],
  'COL': ['MRL'],
  'CORREOS-PRIV': ['LOG'],
  'DAMM-PRIV': ['MAHOU-PRIV'],
  'DELOITTE-PRIV': ['ACCENTURE-PRIV', 'PWC-PRIV', 'EY-PRIV', 'KPMG-PRIV'],
  'DIA': ['MERC-PRIV', 'EROSKI-PRIV'],
  'EBR': ['VIS'],
  'ECR': ['GRE', 'EIDF', 'SLR'],
  'EDR': ['BOOKING-PRIV'],
  'EIDF': ['SLR', 'GRE', 'ECR'],
  'ELE': ['IBE', 'NTGY'],
  'EME-PRIV': ['IDR', 'AMP'],
  'ENG': ['RED'],
  'ENO': ['TRE'],
  'ENS': ['SLR', 'GRE'],
  'EROSKI-PRIV': ['MERC-PRIV', 'DIA'],
  'EY-PRIV': ['ACCENTURE-PRIV', 'DELOITTE-PRIV', 'PWC-PRIV', 'KPMG-PRIV'],
  'FAE': ['ROVI', 'RJF', 'ALM'],
  'FCC-PRIV': ['ACS', 'FER', 'ANA', 'SCYR', 'OHL'],
  'FER': ['ACS', 'ANA', 'SCYR', 'FCC-PRIV', 'OHL'],
  'GEST': ['CIE', 'ANTOLIN-PRIV'],
  'GOOGLE-PRIV': ['AMAZON-PRIV', 'META-PRIV'],
  'GRE': ['ANE', 'SLR', 'EIDF', 'ECR'],
  'GRF': ['PHM', 'ROVI', 'FAE', 'ALM'],
  'GSJ': ['ACS', 'SCYR', 'OHL'],
  'HLA': ['QS', 'HMH', 'VIT', 'VIA'],
  'HLZ': ['ADX', 'IBE', 'ELE'],
  'HMH': ['QS', 'HLA', 'VIT', 'VIA'],
  'HOME': ['MVC', 'AED'],
  'HOS': ['QS', 'VIT'],
  'IAG': ['RENFE-PRIV'],
  'IBE': ['ELE', 'NTGY', 'REP'],
  'IBG': ['MCM'],
  'IDR': ['AMP', 'EME-PRIV'],
  'INSUR': ['MVC', 'HOME'],
  'ITX': ['ADZ', 'PUIG'],
  'IZE': ['ALT', 'SER'],
  'KPMG-PRIV': ['ACCENTURE-PRIV', 'DELOITTE-PRIV', 'PWC-PRIV', 'EY-PRIV'],
  'LDA': ['MAP', 'CAT', 'MUTUA-PRIV'],
  'LLYC': ['MAKS'],
  'LOG': ['CORREOS-PRIV'],
  'LRE': ['MRL', 'CAST'],
  'MAHOU-PRIV': ['DAMM-PRIV'],
  'MAKS': ['LLYC'],
  'MAP': ['CAT', 'LDA', 'MUTUA-PRIV'],
  'MASOR-PRIV': ['TEF'],
  'MCM': ['IBG'],
  'MEL': ['AIRBNB-PRIV', 'BOOKING-PRIV'],
  'MERC-PRIV': ['EROSKI-PRIV', 'DIA'],
  'META-PRIV': ['GOOGLE-PRIV', 'AMAZON-PRIV'],
  'MFEB': ['A3M'],
  'MRL': ['COL', 'LRE'],
  'MTS': ['ACX'],
  'MUTUA-PRIV': ['MAP', 'CAT', 'LDA'],
  'MVC': ['HOME', 'AED'],
  'NET': ['PRO'],
  'NTGY': ['IBE', 'ELE', 'REP'],
  'OHL': ['ACS', 'FER', 'ANA', 'SCYR', 'FCC-PRIV'],
  'ORY': ['PHM'],
  'PAR': ['TEF', 'MASOR-PRIV'],
  'PHM': ['GRF', 'ALM', 'ORY'],
  'PRO': ['NET'],
  'PRS': ['VOC'],
  'PUIG': ['ITX', 'ADZ'],
  'PWC-PRIV': ['ACCENTURE-PRIV', 'DELOITTE-PRIV', 'EY-PRIV', 'KPMG-PRIV'],
  'QS': ['HMH', 'HLA', 'VIT', 'VIA', 'HOS', 'RS'],
  'R4': ['ALTR'],
  'RED': ['ENG'],
  'RENFE-PRIV': ['IAG'],
  'REP': ['CEPSA-PRIV', 'NTGY'],
  'RS': ['QS'],
  'RIO': ['BIL'],
  'RJF': ['FAE', 'ROVI'],
  'RLIA': ['MVC', 'HOME', 'AED'],
  'ROVI': ['GRF', 'FAE', 'RJF'],
  'SAB': ['BBVA', 'SAN', 'CABK', 'BKT', 'UNI'],
  'SAN': ['BBVA', 'CABK', 'SAB', 'BKT', 'UNI'],
  'SANITAS': ['MAP', 'ATR'],
  'SCYR': ['ACS', 'FER', 'ANA', 'FCC-PRIV', 'OHL'],
  'SER': ['ALT', 'IZE'],
  'SLR': ['ANE', 'GRE', 'EIDF', 'ECR'],
  'SOL': ['SLR'],
  'SQM': ['SEC', 'MAKS'],
  'TEF': ['MASOR-PRIV'],
  'TLG': ['CAF'],
  'TRE': ['ENO'],
  'TRG': ['TUB'],
  'TUB': ['TRG'],
  'UNI': ['BBVA', 'SAN', 'CABK', 'SAB', 'BKT'],
  'VIA': ['QS', 'HMH', 'VIT', 'HLA'],
  'VIS': ['EBR'],
  'VIT': ['QS', 'HMH', 'HLA', 'VIA'],
  'VOC': ['PRS'],
  'AIRBNB-PRIV': ['BOOKING-PRIV'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    console.log('[import-verified-competitors] Starting import...')
    
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const [ticker, competitors] of Object.entries(VERIFIED_COMPETITORS)) {
      const { error } = await supabaseAdmin
        .from('repindex_root_issuers')
        .update({ verified_competitors: competitors })
        .eq('ticker', ticker)

      if (error) {
        console.error(`[import-verified-competitors] Error updating ${ticker}:`, error.message)
        errors.push(`${ticker}: ${error.message}`)
        errorCount++
      } else {
        console.log(`[import-verified-competitors] Updated ${ticker} with ${competitors.length} competitors`)
        successCount++
      }
    }

    // Get stats on total issuers with competitors
    const { data: stats, error: statsError } = await supabaseAdmin
      .from('repindex_root_issuers')
      .select('ticker, verified_competitors')
    
    let withCompetitors = 0
    let withoutCompetitors = 0
    
    if (stats) {
      for (const row of stats) {
        const competitors = row.verified_competitors as string[] | null
        if (competitors && competitors.length > 0) {
          withCompetitors++
        } else {
          withoutCompetitors++
        }
      }
    }

    const result = {
      success: true,
      message: `Import completed: ${successCount} updated, ${errorCount} errors`,
      stats: {
        updated: successCount,
        errors: errorCount,
        totalIssuers: stats?.length ?? 0,
        withCompetitors,
        withoutCompetitors,
      },
      errorDetails: errors.length > 0 ? errors : undefined,
    }

    console.log('[import-verified-competitors] Import complete:', result)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[import-verified-competitors] Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
