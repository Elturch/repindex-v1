
# Plan: Corregir bug critico de auto-completado fantasma

## Diagnostico

El watchdog del orquestador tiene una logica de "auto-completar duplicados" (lineas 2148-2207 de `rix-batch-orchestrator/index.ts`) que confunde los datos de la semana ANTERIOR con datos del barrido actual.

La secuencia del fallo:
1. Domingo 00:00:05 UTC: Se inicializa el sweep W09 con 175 empresas en estado "pending"
2. Domingo 00:00:09: El watchdog ejecuta la limpieza de duplicados
3. Busca el `06_period_from` mas reciente en rix_runs_v2 -> obtiene `2026-02-15` (datos de W08)
4. Comprueba si cada empresa pending tiene >=5 registros con esa fecha -> SI, porque W08 ya los tiene
5. Auto-completa 49 empresas (limite de 50 por invocacion) como "duplicadas" con `models_completed: 6`
6. Las fases reales arrancan y procesan las 126 restantes normalmente

El mismo bug afecto a W08 (126 de 175 = 49 ghosts) porque la logica confundio datos de W07.

## Solucion

Anadir un filtro por `batch_execution_date` a la consulta de auto-completado. `batch_execution_date` se establece al domingo actual y es el UNICO campo que distingue datos de semanas distintas cuando `06_period_from` coincide (los periodos se solapan entre semanas consecutivas).

### Cambio 1: Corregir auto-completado de duplicados (lineas 2160-2185)

Reemplazar la consulta que usa `06_period_from` por una que use `batch_execution_date` del domingo actual:

```typescript
// ANTES (BUGGY): usa 06_period_from que coincide con la semana anterior
const { data: latestWeek } = await supabase
  .from('rix_runs_v2')
  .select('06_period_from')
  .order('06_period_from', { ascending: false })
  .limit(1)
  .maybeSingle();
// ... luego verifica con .eq('06_period_from', periodFromStr)

// DESPUES (CORRECTO): usa batch_execution_date del domingo actual
const now = new Date();
const dayOfWeek = now.getDay();
const currentSunday = new Date(now);
currentSunday.setDate(now.getDate() - dayOfWeek);
currentSunday.setHours(0, 0, 0, 0);
const currentBatchDate = currentSunday.toISOString();

// ... y verifica con .eq('batch_execution_date', currentBatchDate)
```

### Cambio 2: Corregir la reconciliacion (lineas 2225-2251)

La misma logica defectuosa se usa en la seccion de reconciliacion de empresas fantasma. Aplicar el mismo fix: usar `batch_execution_date` en vez de `06_period_from`.

### Cambio 3: Accion inmediata para el barrido de hoy

Resetear las 49 empresas fantasma de W09 a "pending" para que se procesen:

```sql
UPDATE sweep_progress 
SET status = 'pending', 
    models_completed = 0, 
    completed_at = NULL,
    error_message = 'Reset: ghost company from auto-complete bug'
WHERE sweep_id = '2026-W09' 
AND ticker IN ('A3M','ACS','ACX','AENA','ALM','AMS','ANA','ANE.MC','CABK','CAF','CIE','CLNX','COL','DOM','EDR','ELE','ENC','ENG','ENO','FDR','FER','GRF','HOME','IAG','IBE','IDR','ITX','LDA','LOG','LRE','MAP','MEL','MRL','MTS','NTGY','PUIG','RED','REP','ROVI','SAB','SAN','SCYR','SLR','TEF','TRE','TUB','UNI','VID','VIS');
```

Este SQL debe ejecutarse en el entorno Live (Cloud View > Run SQL > Live).

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Lineas 2160-2185: Usar `batch_execution_date` del domingo actual en vez de `06_period_from` mas reciente. Lineas 2225-2251: Mismo fix en reconciliacion. |
| SQL directo (Live) | Resetear 49 empresas fantasma de W09 a pending |

## Lo que NO cambia

- La logica de `hasCompanyDataThisWeek` (usa fechas calculadas que no coinciden, funciona correctamente)
- La verificacion de duplicados en `rix-search-v2` (usa `batch_execution_date` correctamente)
- Las funciones de busqueda y analisis
- El frontend
- La cadena autonoma post-sweep

## Resultado esperado

Tras el fix y el reset SQL:
1. Las 49 empresas vuelven a estado "pending"
2. El watchdog las detecta y las procesa en las proximas invocaciones (cada 5 min)
3. El auto-completado ya no confunde datos de semanas anteriores
4. Semanas futuras procesaran las 175 empresas completas
