

# Fix: Banco Santander desaparece del Top 5 -- Truncamiento silencioso por LIMIT

## Diagnostico confirmado

### Causa raiz
La funcion `fetchUnifiedRixData` (linea 86) consulta `rix_runs_v2` con `LIMIT 2000` ordenado por `batch_execution_date DESC`. La semana actual (2026-02-01) tiene **1050 registros**, pero todos comparten el **mismo** `batch_execution_date` (2026-02-08). Cuando PostgreSQL ordena 1050 registros con el mismo valor de orden, el desempate es **arbitrario**. Esto significa que las 50 empresas que quedan fuera del limite cambian entre ejecuciones -- a veces es Santander, a veces otra empresa del IBEX-35.

Los logs confirman el problema: `"Pre-filter: index=IBEX-35, 29 records remain"` -- solo 29 de las 35 empresas IBEX-35 sobreviven al filtro porque 6 fueron truncadas silenciosamente en la carga.

### Por que es grave
- Es un error **no-determinista**: a veces Santander aparece y a veces no
- Afecta a cualquier empresa del IBEX-35, no solo a Santander
- El sistema no genera ningun error ni warning -- los datos simplemente desaparecen
- Los informes ejecutivos basados en datos incompletos son peor que no tener informe

## Plan de correccion

### Cambio 1: Ordenamiento determinista en fetchUnifiedRixData (lineas 90-98)

Anadir un ORDER BY secundario por `"05_ticker"` para que el desempate en `batch_execution_date` sea determinista. Esto no soluciona el truncamiento, pero asegura que siempre se truncan los mismos registros (los ultimos alfabeticamente).

```typescript
// ANTES:
.order('batch_execution_date', { ascending: false })

// DESPUES:
.order('batch_execution_date', { ascending: false })
.order('"05_ticker"', { ascending: true })
```

### Cambio 2: Aumentar batch size para cubrir el censo completo (linea 3848)

El censo actual es de 174 empresas x 6 modelos = **1044 registros por semana**. Con un batch de 2000, solo cabe 1 semana completa con margen justo. Aumentar a 3000 para garantizar 2 semanas completas sin truncamiento:

```typescript
// ANTES:
const rixBatchSize = 2000;

// DESPUES:
const rixBatchSize = 3000;
```

### Cambio 3: Validacion post-carga para IBEX-35 (nuevo, despues de linea 4250)

Anadir un guardrail que detecte si la carga de datos esta incompleta para el IBEX-35 y dispare una recarga con un batch mas grande:

```typescript
// Despues del pre-filtrado por indice (linea 4250)
if (requestedIndex === 'IBEX-35' && companiesCache) {
  const expectedIbexCount = companiesCache.filter((c: any) => c.ibex_family_code === 'IBEX-35').length;
  const uniqueIbexTickers = new Set(currentWeekData.map(r => r["05_ticker"]));
  
  if (uniqueIbexTickers.size < expectedIbexCount) {
    console.log(`${logPrefix} WARNING: IBEX-35 incomplete! Found ${uniqueIbexTickers.size}/${expectedIbexCount} companies. Reloading with targeted query...`);
    
    // Identify missing tickers
    const missingTickers = companiesCache
      .filter((c: any) => c.ibex_family_code === 'IBEX-35' && !uniqueIbexTickers.has(c.ticker))
      .map((c: any) => c.ticker);
    
    if (missingTickers.length > 0) {
      // Fetch missing data with targeted ticker filter
      const missingBatch = await fetchUnifiedRixData({
        supabaseClient,
        columns: `...same columns...`,
        tickerFilter: missingTickers,
        limit: 500,
        logPrefix: `${logPrefix} [IBEX-REPAIR]`
      });
      
      if (missingBatch.length > 0) {
        // Add to allRixData and re-filter
        allRixData.push(...missingBatch);
        // Re-apply period + model + index filters
        currentWeekData = allRixData
          .filter(run => getPeriodKey(run) === currentPeriod)
          .filter(r => !requestedModel || r["02_model_name"] === requestedModel)
          .filter(r => indexTickers.has(r["05_ticker"]));
        
        console.log(`${logPrefix} IBEX-35 repaired: now ${new Set(currentWeekData.map(r => r["05_ticker"])).size}/${expectedIbexCount} companies`);
      }
    }
  }
}
```

### Cambio 4: Aumentar limite de fetchUnifiedRixData para v2 (linea 116-117)

Cuando la tabla v2 tiene mas de 1000 registros para la semana actual, el limite de 2000 se queda corto si ademas queremos semanas anteriores. Asegurar que el primer batch traiga al menos 2 semanas completas:

```typescript
// En fetchUnifiedRixData, linea 116:
// Usar limite mas alto para v2 ya que es la fuente autoritativa
queryV2 = queryV2.limit(Math.max(limit, 2500));
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | 4 cambios: orden determinista, batch size, guardrail IBEX-35, limite v2 |

## Resultado esperado

- Las 35 empresas del IBEX-35 siempre apareceran en el ranking, sin excepcion
- Banco Santander se mostrara correctamente en el Top 5 (RIX 66, posicion 4)
- El guardrail detectara y reparara automaticamente cualquier truncamiento futuro
- Los logs mostraran un warning si el guardrail se activa, permitiendo monitoreo

