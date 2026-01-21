import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StockPrice {
  precio_cierre: string;
  minimo_52_semanas: string | null;
}

interface PriceResult {
  prices: Record<string, StockPrice>;
  errors: string[];
  source: string;
  fetchDate: string;
}

// Mapeo especial de tickers españoles a símbolos EODHD
const TICKER_MAPPING: Record<string, string> = {
  // Tickers que usan formato diferente en EODHD
  'REE': 'REE.MC',      // Red Eléctrica
  'NTGY': 'NTGY.MC',    // Naturgy
  'FER': 'FER.MC',      // Ferrovial
  'ACS': 'ACS.MC',      // ACS
  'CABK': 'CABK.MC',    // CaixaBank
  'BKT': 'BKT.MC',      // Bankinter
  'AENA': 'AENA.MC',    // AENA
  'LOG': 'LOG.MC',      // Logista
  'ELE': 'ELE.MC',      // Endesa
  'ENG': 'ENG.MC',      // Enagás
  'CLNX': 'CLNX.MC',    // Cellnex
  'FDR': 'FDR.MC',      // Fluidra
  'GRF': 'GRF.MC',      // Grifols
  'IAG': 'IAG.MC',      // IAG
  'IBE': 'IBE.MC',      // Iberdrola
  'ITX': 'ITX.MC',      // Inditex
  'MRL': 'MRL.MC',      // Merlin Properties
  'MTS': 'MTS.MC',      // ArcelorMittal
  'ROVI': 'ROVI.MC',    // Rovi
  'SAB': 'SAB.MC',      // Banco Sabadell
  'SAN': 'SAN.MC',      // Banco Santander
  'TEF': 'TEF.MC',      // Telefónica
  'BBVA': 'BBVA.MC',    // BBVA
  'MAP': 'MAP.MC',      // Mapfre
  'REP': 'REP.MC',      // Repsol
  'AMS': 'AMS.MC',      // Amadeus
  'COL': 'COL.MC',      // Inmobiliaria Colonial
  'SCYR': 'SCYR.MC',    // Sacyr
  'ACX': 'ACX.MC',      // Acerinox
  'CIE': 'CIE.MC',      // CIE Automotive
  'PHM': 'PHM.MC',      // PharmaMar
  'VIS': 'VIS.MC',      // Viscofan
  'SGR': 'SGR.MC',      // Segur (Grupo Catalana Occidente)
  'UNI': 'UNI.MC',      // Unicaja Banco
  'SOLR': 'SOLR.MC',    // Solaria
};

// Formatear precio a máximo 3 decimales
function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined || isNaN(price)) {
    return 'NC';
  }
  // Máximo 3 decimales, sin trailing zeros
  return parseFloat(price.toFixed(3)).toString();
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tickers } = await req.json();
    
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un array de tickers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('EODHD_API_KEY');
    if (!apiKey) {
      throw new Error('EODHD_API_KEY no configurada');
    }

    console.log(`[fetch-stock-prices] Fetching prices for ${tickers.length} tickers`);

    // Usar Bulk API para obtener todos los precios del mercado español de una vez
    // Esto devuelve el último día de trading (que será viernes si llamamos en fin de semana)
    const bulkUrl = `https://eodhd.com/api/eod-bulk-last-day/MC?api_token=${apiKey}&fmt=json`;
    
    console.log(`[fetch-stock-prices] Calling EODHD Bulk API for MC exchange`);
    
    const response = await fetch(bulkUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[fetch-stock-prices] EODHD API error: ${response.status} - ${errorText}`);
      throw new Error(`EODHD API error: ${response.status}`);
    }

    const bulkData = await response.json();
    console.log(`[fetch-stock-prices] Received ${bulkData.length} records from EODHD`);

    // Crear mapa de código → datos para búsqueda rápida
    const priceMap = new Map<string, { close: number; adjusted_close: number; low?: number }>();
    
    for (const item of bulkData) {
      if (item.code) {
        priceMap.set(item.code.toUpperCase(), {
          close: item.close || item.adjusted_close,
          adjusted_close: item.adjusted_close || item.close,
          low: item.low
        });
      }
    }

    // Para obtener el mínimo de 52 semanas, necesitamos otra llamada por ticker
    // Pero podemos optimizar haciendo llamadas en paralelo (máx 10 concurrent)
    const results: PriceResult = {
      prices: {},
      errors: [],
      source: 'EODHD',
      fetchDate: new Date().toISOString()
    };

    // Procesar cada ticker solicitado
    for (const ticker of tickers) {
      const upperTicker = ticker.toUpperCase();
      
      // Buscar en el mapa de precios bulk
      const priceData = priceMap.get(upperTicker);
      
      if (priceData) {
        results.prices[ticker] = {
          precio_cierre: formatPrice(priceData.adjusted_close),
          minimo_52_semanas: null // Se llenará con llamada individual si es necesario
        };
      } else {
        // No encontrado en bulk, intentar nombre alternativo
        const mappedSymbol = TICKER_MAPPING[upperTicker];
        const altCode = mappedSymbol ? mappedSymbol.replace('.MC', '') : null;
        const altData = altCode ? priceMap.get(altCode) : null;
        
        if (altData) {
          results.prices[ticker] = {
            precio_cierre: formatPrice(altData.adjusted_close),
            minimo_52_semanas: null
          };
        } else {
          results.errors.push(`Ticker no encontrado: ${ticker}`);
          results.prices[ticker] = {
            precio_cierre: 'NC',
            minimo_52_semanas: null
          };
        }
      }
    }

    // Obtener mínimos de 52 semanas en paralelo (máx 5 concurrent para evitar rate limits)
    const tickersToFetch52Week = tickers.filter(t => 
      results.prices[t]?.precio_cierre !== 'NC'
    );

    if (tickersToFetch52Week.length > 0) {
      console.log(`[fetch-stock-prices] Fetching 52-week lows for ${tickersToFetch52Week.length} tickers`);
      
      // Calcular fecha hace 52 semanas
      const today = new Date();
      const yearAgo = new Date(today);
      yearAgo.setDate(yearAgo.getDate() - 365);
      const fromDate = yearAgo.toISOString().split('T')[0];
      const toDate = today.toISOString().split('T')[0];

      // Procesar en batches de 5 para evitar rate limits
      const batchSize = 5;
      for (let i = 0; i < tickersToFetch52Week.length; i += batchSize) {
        const batch = tickersToFetch52Week.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (ticker) => {
          try {
            const symbol = `${ticker.toUpperCase()}.MC`;
            const histUrl = `https://eodhd.com/api/eod/${symbol}?api_token=${apiKey}&fmt=json&from=${fromDate}&to=${toDate}`;
            
            const histResponse = await fetch(histUrl);
            if (!histResponse.ok) {
              console.warn(`[fetch-stock-prices] Failed to fetch history for ${ticker}: ${histResponse.status}`);
              return;
            }

            const histData = await histResponse.json();
            
            if (Array.isArray(histData) && histData.length > 0) {
              // Encontrar el mínimo de los 52 semanas
              const minLow = Math.min(...histData.map((d: { low: number }) => d.low).filter((l: number) => l > 0));
              if (minLow && minLow > 0 && results.prices[ticker]) {
                results.prices[ticker].minimo_52_semanas = formatPrice(minLow);
              }
            }
          } catch (err) {
            console.warn(`[fetch-stock-prices] Error fetching 52-week low for ${ticker}:`, err);
          }
        });

        await Promise.all(batchPromises);
        
        // Pequeña pausa entre batches para respetar rate limits
        if (i + batchSize < tickersToFetch52Week.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }

    console.log(`[fetch-stock-prices] Completed. Prices: ${Object.keys(results.prices).length}, Errors: ${results.errors.length}`);

    return new Response(
      JSON.stringify(results),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[fetch-stock-prices] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Error interno',
        prices: {},
        errors: [error.message]
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
