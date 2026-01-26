

# Plan: Corrección del Gap 3% en Vector Store

## Diagnóstico

El gap del 3% no es real. Es un error de conteo causado por:

1. **Variables indefinidas** (`rixRunsOriginal`, `rixRunsV2`) que causan error fatal al terminar
2. **Límite de 1,000 filas** de Supabase que impide detectar los 11,262 documentos ya indexados

## Cambios Requeridos

### 1. Corregir Variables Indefinidas (líneas 690-691)

```typescript
// ANTES (error):
from_rix_runs: rixRunsOriginal.length,
from_rix_runs_v2: rixRunsV2.length,

// DESPUÉS (corregido):
from_rix_runs: pendingRuns.filter(r => r._source_table === 'rix_runs').length,
from_rix_runs_v2: pendingRuns.filter(r => r._source_table === 'rix_runs_v2').length,
```

### 2. Forzar Paginación Completa de Documentos Existentes

El bucle `while(true)` para escanear documentos existentes debe continuar hasta que realmente no haya más datos. El problema actual es que después de 1,000 registros el loop se detiene prematuramente.

Cambio necesario en líneas 60-84:

```typescript
// Aumentar paciencia y asegurar que el loop continúa
while (true) {
  const { data: existingDocs, error: existingError } = await supabaseClient
    .from('documents')
    .select('metadata->rix_run_id')
    .not('metadata->rix_run_id', 'is', null)
    .order('id', { ascending: true })  // <-- AÑADIR orden para paginación estable
    .range(docOffset, docOffset + docBatchSize - 1);

  if (existingError) {
    console.error('Error fetching existing docs:', existingError);
    return { success: false, error: existingError.message };
  }
  
  // Procesar datos
  existingDocs?.forEach(d => {
    const rixRunId = d.rix_run_id;
    if (rixRunId) existingRunIds.add(rixRunId);
  });
  
  console.log(`Scanned ${docOffset + (existingDocs?.length || 0)} existing docs...`);
  
  // Salir solo si no hay más datos
  if (!existingDocs || existingDocs.length < docBatchSize) break;
  docOffset += docBatchSize;
}
```

El problema es que sin `order()`, la paginación con `range()` puede devolver resultados inconsistentes.

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/populate-vector-store/index.ts` | Corregir variables y paginación |

## Resultado Esperado

- El sistema detectará los ~11,262 documentos RIX ya indexados
- El conteo de "pendientes" será correcto (cercano a 0)
- El gap del 3% desaparecerá
- No habrá errores fatales al final de la ejecución

## Tiempo Estimado

5-10 minutos para implementar y probar.

