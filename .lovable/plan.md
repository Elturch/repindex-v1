
# Plan: Desbloquear Pipeline de Análisis y Actualizar Dashboard

## Problema Identificado

El sistema está **atrapado en un bucle infinito** porque:

| Problema | Detalle |
|----------|---------|
| 5 registros corruptos | De semanas anteriores (2026-01-17/18), tienen `search_completed_at` pero sin datos reales |
| Filtro incorrecto | `reprocess_pending` ordena por `created_at ASC` y procesa los antiguos primero |
| Los 126 válidos | Semana 2026-01-25, tienen datos pero nunca se procesan |
| Dashboard | Posible desfase en la detección de semana activa |

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO ACTUAL (ROTO)                          │
├─────────────────────────────────────────────────────────────────┤
│  repair_analysis → toma 5 registros antiguos → todos fallan     │
│         ↓                                                       │
│  auto_continue → detecta 126 pendientes → lanza repair_analysis │
│         ↓                                                       │
│  repair_analysis → toma los MISMOS 5 → fallan de nuevo          │
│         ↓                                                       │
│      (bucle infinito - los 126 válidos nunca se procesan)       │
└─────────────────────────────────────────────────────────────────┘
```

## Solución Propuesta

### 1. Corregir `rix-analyze-v2` (Edge Function)

**Archivo:** `supabase/functions/rix-analyze-v2/index.ts`

Cambiar el filtro de `reprocess_pending` para:
- Filtrar por la semana más reciente con datos (06_period_from)
- Agregar validación de datos antes de procesar

```typescript
// ANTES (líneas 724-730):
const { data: pendingRecords } = await supabase
  .from('rix_runs_v2')
  .select('*')
  .is('analysis_completed_at', null)
  .not('search_completed_at', 'is', null)
  .order('created_at', { ascending: true })
  .limit(batch_size);

// DESPUÉS:
// 1. Encontrar la semana activa
const { data: latestWeek } = await supabase
  .from('rix_runs_v2')
  .select('06_period_from')
  .order('06_period_from', { ascending: false })
  .limit(1)
  .maybeSingle();

const activePeriod = latestWeek?.['06_period_from'];

// 2. Filtrar por semana activa
const { data: pendingRecords } = await supabase
  .from('rix_runs_v2')
  .select('*')
  .is('analysis_completed_at', null)
  .not('search_completed_at', 'is', null)
  .eq('06_period_from', activePeriod)
  .order('created_at', { ascending: true })
  .limit(batch_size);
```

### 2. Agregar Validación en `analyzeRecord`

**Archivo:** `supabase/functions/rix-analyze-v2/index.ts`

Antes de procesar, verificar que el registro tiene datos en su columna específica. Si no, marcarlo como fallido y continuar:

```typescript
// En la función analyzeRecord (línea ~431):
if (!rawResponse || rawResponse.length < 100) {
  // EN LUGAR DE THROW: actualizar el registro y saltar
  await supabase
    .from('rix_runs_v2')
    .update({ 
      search_completed_at: null,  // Reset para que repair_search lo recoja
      model_errors: { missing_data: true, column: responseColumn }
    })
    .eq('id', record_id);
  
  return {
    success: false,
    record_id,
    model_name: modelName,
    error: 'No data - reset for repair_search',
    skipped: true,
  };
}
```

### 3. Corregir Dashboard `useUnifiedSweepMetrics`

**Archivo:** `src/hooks/useUnifiedSweepMetrics.ts`

Usar `getISOWeek` de date-fns para calcular correctamente la semana ISO:

```typescript
// Agregar import:
import { getISOWeek, getISOWeekYear } from 'date-fns';

// Reemplazar cálculo manual (líneas 203-210):
const weekDate = new Date(weekStart + 'T00:00:00');
const isoWeek = getISOWeek(weekDate);
const isoYear = getISOWeekYear(weekDate);
const derivedSweepId = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
```

### 4. Limpiar Registros Corruptos

Ejecutar SQL manualmente para resetear los 5 registros problemáticos:

```sql
-- Resetear search_completed_at para registros sin datos
UPDATE rix_runs_v2
SET search_completed_at = NULL
WHERE id IN (
  '594dd6ff-dc63-4f43-a802-5b6d25f8e017',
  '26123606-1676-4914-b576-9b00ea11ee36',
  '343fd9ff-7d27-44aa-97f3-dbcd2d8ed1d3',
  '90f57442-a6c1-4505-9f4e-062b8fa03e7f',
  'ce94b8b7-0e99-431a-8e17-0f017b1be49c'
);
```

## Secuencia de Implementación

1. Ejecutar SQL de limpieza (inmediato, desbloquea pipeline)
2. Modificar `rix-analyze-v2` con filtro por semana y validación
3. Corregir `useUnifiedSweepMetrics` con date-fns
4. Redesplegar edge function
5. El pipeline debería procesar los 126 registros válidos automáticamente

## Sección Técnica

### Por qué el filtro actual falla

El query original:
```sql
SELECT * FROM rix_runs_v2
WHERE analysis_completed_at IS NULL
  AND search_completed_at IS NOT NULL
ORDER BY created_at ASC
LIMIT 10
```

Esto devuelve registros de CUALQUIER semana, priorizando los más antiguos. Los 5 registros corruptos de enero 17-18 siempre aparecen primero.

### Cambio arquitectónico

El nuevo filtro garantiza que solo se procesan registros de la semana activa:
```sql
SELECT * FROM rix_runs_v2
WHERE analysis_completed_at IS NULL
  AND search_completed_at IS NOT NULL
  AND "06_period_from" = (
    SELECT "06_period_from" FROM rix_runs_v2 
    ORDER BY "06_period_from" DESC LIMIT 1
  )
ORDER BY created_at ASC
LIMIT 10
```

### Validación defensiva

El patrón de "skip and reset" evita bucles infinitos:
- Si un registro no tiene datos, se marca para `repair_search`
- El análisis continúa con el siguiente registro
- No se lanza error que bloquee todo el batch
