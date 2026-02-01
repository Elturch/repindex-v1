

# Plan: Corregir Detección de Ghost Companies

## Problema Raíz

La detección de "ghost companies" usa el campo `models_completed` de `sweep_progress`, pero **este campo nunca se actualiza** cuando los datos se guardan en `rix_runs_v2`.

Consultas que lo demuestran:
- 91 empresas en `sweep_progress` con `models_completed = 0`
- Las 91 empresas tienen datos completos en `rix_runs_v2` (6 registros cada una)

El hook actual hace:
```typescript
// INCORRECTO: Confía en un campo desactualizado
supabase
  .from('sweep_progress')
  .select('ticker, models_completed')
  .eq('status', 'completed')
  .lt('models_completed', 1)  // ← Este campo está en 0 pero HAY datos
```

## Solución: Cruzar con Datos Reales

Cambiar la detección de ghost companies para que **compare `sweep_progress` con `rix_runs_v2`** en lugar de confiar en `models_completed`.

### Nueva Lógica

```typescript
// CORRECTO: Verificar contra datos reales
// 1. Obtener tickers de sweep_progress marcados como completed
const { data: completedTickers } = await supabase
  .from('sweep_progress')
  .select('ticker')
  .eq('sweep_id', sweepId)
  .eq('status', 'completed');

// 2. Obtener tickers que realmente tienen datos en rix_runs_v2
const { data: realDataTickers } = await supabase
  .from('rix_runs_v2')
  .select('05_ticker')
  .eq('06_period_from', weekStart);

// 3. Ghost = completed en sweep_progress PERO sin registros en rix_runs_v2
const realTickersSet = new Set(realDataTickers.map(r => r['05_ticker']));
const ghostTickers = completedTickers
  .map(c => c.ticker)
  .filter(ticker => !realTickersSet.has(ticker));
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useUnifiedSweepMetrics.ts` | Cambiar detección de ghost companies para cruzar con rix_runs_v2 |

## Resultado Esperado

**Antes**: Dashboard muestra 91 empresas fantasma (falso positivo)
**Después**: Dashboard muestra 0-9 empresas fantasma (solo las que realmente no tienen datos)

## Cambio Técnico Específico

En `useUnifiedSweepMetrics.ts`, líneas 185-191, reemplazar la query de ghost companies:

```typescript
// ANTES (incorrecto - confía en models_completed que no se actualiza):
supabase
  .from('sweep_progress')
  .select('ticker, models_completed')
  .eq('sweep_id', sweepId)
  .eq('status', 'completed')
  .lt('models_completed', 1),

// DESPUÉS (correcto - calcula ghost companies en JavaScript):
// Eliminar esta query del Promise.all

// Y después, calcular ghost companies comparando:
const completedTickers = progressRecords
  .filter(p => p.status === 'completed')
  .map(p => p.ticker);  // Necesitamos incluir 'ticker' en el select de sweep_progress

const realDataTickers = new Set(records.map(r => r['05_ticker']));
const ghostTickers = completedTickers.filter(t => !realDataTickers.has(t));
```

### Cambios específicos:

1. **Línea 173-176**: Añadir `ticker` al select de sweep_progress
```typescript
supabase
  .from('sweep_progress')
  .select('status, ticker')  // ← Añadir ticker
  .eq('sweep_id', sweepId),
```

2. **Líneas 185-191**: Eliminar la query de ghostCompaniesResult del Promise.all

3. **Después del Promise.all** (alrededor de línea 200): Calcular ghost companies correctamente
```typescript
// Calcular ghost companies CRUZANDO con datos reales
const completedTickersInProgress = (sweepProgressResult.data || [])
  .filter(p => p.status === 'completed')
  .map(p => p.ticker);

const tickersWithRealData = new Set(records.map(r => r['05_ticker']));

const ghostTickersList = completedTickersInProgress
  .filter(ticker => ticker && !tickersWithRealData.has(ticker));
```

4. **En el return**, usar las nuevas variables:
```typescript
ghostCompanies: ghostTickersList.length,
ghostTickers: ghostTickersList,
```

## Beneficio Adicional: Simplificación

Esta corrección también simplifica el código al eliminar una query del Promise.all, ya que usamos los datos que ya tenemos de las otras queries.

