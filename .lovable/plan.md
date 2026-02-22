

# Plan: Sistema de barrido dominical a prueba de fallos

## Diagnostico: Por que cada domingo falla algo

El orquestador tiene **3 problemas estructurales** que causan fallos recurrentes:

### Problema 1: Multiples rutas de codigo usan `06_period_from` en vez de `batch_execution_date`

El fix anterior (auto-completado lineas 2160-2185 y reconciliacion 2225-2251) se aplico correctamente, pero hay **3 lugares mas** donde se sigue usando `06_period_from` para identificar "la semana actual":

- **`hasCompanyDataThisWeek()`** (lineas 87-124): Calcula fechas de periodo manualmente y busca por `06_period_from` + `07_period_to`. En domingo a las 00:00, esta funcion puede coincidir con datos de la semana anterior.
- **Auto-chain data check** (lineas 2354-2386): Cuando el sweep termina, busca `06_period_from` mas reciente para verificar completitud. Puede mezclar datos de semanas distintas.
- **`repair_search`** (lineas 1380-1395): Busca registros sin datos por `06_period_from`. Puede reparar registros de la semana equivocada.

### Problema 2: No hay periodo de gracia tras la inicializacion

El sweep se crea a las 00:00:05 UTC y el watchdog ejecuta el auto-complete a las 00:00:09. Solo 4 segundos despues. No hay ningun registro real todavia, pero la logica de auto-complete consulta `rix_runs_v2` y puede encontrar datos de semanas anteriores.

### Problema 3: `getCurrentSweepId()` usa calculo de semana no-estandar

La funcion (lineas 37-43) calcula el numero de semana con una formula propia que puede no coincidir con ISO 8601. Esto podria crear desalineaciones si el sweep_id no coincide con lo esperado.

---

## Solucion: 4 cambios defensivos

### Cambio 1: Reemplazar `hasCompanyDataThisWeek()` para usar `batch_execution_date`

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (lineas 87-124)

En lugar de calcular `periodFrom`/`periodTo` manualmente (propenso a errores en domingo), buscar por `batch_execution_date` del domingo actual. Esto es consistente con el fix anterior y con `rix-search-v2`.

```typescript
// ANTES: calculo manual de periodo (fragil)
const periodFromStr = periodFrom.toISOString().split('T')[0];
const { count } = await supabase
  .from('rix_runs_v2')
  .select('*', { count: 'exact', head: true })
  .eq('05_ticker', ticker)
  .eq('06_period_from', periodFromStr)
  .eq('07_period_to', periodToStr);

// DESPUES: batch_execution_date del domingo actual (robusto)
const { count } = await supabase
  .from('rix_runs_v2')
  .select('*', { count: 'exact', head: true })
  .eq('05_ticker', ticker)
  .eq('batch_execution_date', currentSundayISO);
```

### Cambio 2: Agregar periodo de gracia de 30 minutos

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (lineas 2148-2198)

Antes de ejecutar el auto-complete de duplicados, verificar que el sweep no es "nuevo" (creado hace menos de 30 minutos). Si es nuevo, saltar completamente la logica de auto-complete.

```typescript
// Obtener timestamp de creacion del sweep
const { data: sweepCreation } = await supabase
  .from('sweep_progress')
  .select('created_at')
  .eq('sweep_id', sweepId)
  .order('created_at', { ascending: true })
  .limit(1)
  .maybeSingle();

const sweepAgeMs = sweepCreation?.created_at 
  ? Date.now() - new Date(sweepCreation.created_at).getTime()
  : Infinity;

// No auto-completar si el sweep tiene < 30 min de vida
if (sweepAgeMs < 30 * 60 * 1000) {
  console.log(`[watchdog] Sweep ${sweepId} is only ${Math.round(sweepAgeMs/1000)}s old. Skipping auto-complete (grace period).`);
} else {
  // ... logica de auto-complete existente ...
}
```

### Cambio 3: Corregir auto-chain para usar `batch_execution_date`

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (lineas 2354-2386)

La seccion de encadenamiento automatico (cuando `pending === 0 && processing === 0`) aun usa `06_period_from` para verificar datos. Reemplazar por `batch_execution_date`.

```typescript
// ANTES (lineas 2355-2386):
const { data: latestWeek } = await supabase
  .from('rix_runs_v2')
  .select('06_period_from')
  .order('06_period_from', { ascending: false })
  .limit(1)
  .maybeSingle();
// ... usa periodFromStr para filtrar

// DESPUES:
const now = new Date();
const dayOfWeek = now.getDay();
const currentSunday = new Date(now);
currentSunday.setDate(now.getDate() - dayOfWeek);
currentSunday.setUTCHours(0, 0, 0, 0);
const chainBatchDate = currentSunday.toISOString();
// ... usa chainBatchDate con .eq('batch_execution_date', chainBatchDate)
```

### Cambio 4: Corregir `repair_search` para usar `batch_execution_date`

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (lineas 1380-1395)

Mismo patron: reemplazar la consulta por `06_period_from` con `batch_execution_date`.

---

## Resumen de archivos modificados

| Archivo | Lineas | Cambio |
|---------|--------|--------|
| `rix-batch-orchestrator/index.ts` | 87-124 | `hasCompanyDataThisWeek` usa `batch_execution_date` |
| `rix-batch-orchestrator/index.ts` | 2148-2198 | Periodo de gracia de 30 min tras init |
| `rix-batch-orchestrator/index.ts` | 2354-2386 | Auto-chain usa `batch_execution_date` |
| `rix-batch-orchestrator/index.ts` | 1380-1395 | `repair_search` usa `batch_execution_date` |

## Lo que NO cambia

- La logica de inicializacion del sweep (funciona correctamente)
- El fire-and-forget del watchdog (arquitectura validada)
- La cadena autonoma post-sweep (auto_sanitize -> vectors -> newsroom)
- El frontend
- Ninguna otra edge function

## Resultado esperado

Tras estos 4 cambios, el sistema:
1. No confundira datos de semanas anteriores con la actual (eliminacion total de `06_period_from` como filtro temporal)
2. No auto-completara empresas fantasma durante los primeros 30 minutos del barrido
3. Reparara solo registros de la semana correcta
4. Las 175 empresas se procesaran completas cada domingo sin intervencion manual

