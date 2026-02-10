

# Plan: Corregir paginacion rota que pierde 74 empresas del contexto

## Causa raiz confirmada

El sistema pierde empresas (Endesa RIX 67, Banco Santander RIX 66, Iberdrola 62, Enagas 60, Ferrovial 52, Unicaja 62 y mas) por DOS bugs combinados:

### Bug 1: PostgREST limita a 1.000 filas

PostgREST (la API de Supabase) tiene un limite por defecto de 1.000 filas por consulta. El codigo pide `limit: 2000` pero PostgREST ignora todo lo que supere 1.000 y devuelve exactamente 1.000.

La semana actual tiene **1.074 registros** en `rix_runs_v2`. Solo se cargan 1.000. Las 74 filas restantes (incluyendo Endesa, Santander, Iberdrola, Enagas, Ferrovial, Unicaja) se pierden silenciosamente.

### Bug 2: La paginacion es ficticia

El bucle de paginacion (lineas 3896-3933) incrementa `rixOffset` pero **nunca lo pasa** a `fetchUnifiedRixData`. La funcion no tiene parametro de offset/range. Cada iteracion del bucle obtiene exactamente los mismos 1.000 registros.

Ademas, como `batch.length` (1.000) es menor que `rixBatchSize` (2.000), el bucle termina en la primera iteracion pensando que ya obtuvo todo.

```text
Evidencia de los logs:
"Total unified RIX records loaded: 1996 (depth: exhaustive)"
"Current period: 2026-02-01 to 2026-02-08 (1000 records)"

Realidad en la base de datos:
- rix_runs_v2 semana actual: 1.074 registros (179 empresas x 6 modelos)
- Registros cargados: 1.000
- Registros perdidos: 74 (incluye Endesa, Santander, Iberdrola...)
```

## Solucion: Implementar paginacion real con `.range()`

### Cambio 1 — Anadir parametro `offset` a `fetchUnifiedRixData`

Modificar la interfaz `FetchUnifiedRixOptions` (linea 77) para aceptar un `offset` y usar `.range(offset, offset + limit - 1)` en las consultas de Supabase en lugar de `.limit()`.

```text
// Antes (linea 93-116):
queryRix = queryRix.limit(limit);
queryV2 = queryV2.limit(limit);

// Despues:
const rangeFrom = offset || 0;
const rangeTo = rangeFrom + limit - 1;
queryRix = queryRix.range(rangeFrom, rangeTo);
queryV2 = queryV2.range(rangeFrom, rangeTo);
```

### Cambio 2 — Pasar el offset en el bucle de paginacion

Modificar el bucle (lineas 3896-3933) para pasar `rixOffset` como parametro:

```text
// Antes:
const batch = await fetchUnifiedRixData({
  supabaseClient,
  columns: `...`,
  limit: rixBatchSize,
  logPrefix
});

// Despues:
const batch = await fetchUnifiedRixData({
  supabaseClient,
  columns: `...`,
  limit: rixBatchSize,
  offset: rixOffset,
  logPrefix
});
```

### Cambio 3 — Reducir batchSize a 1000 para respetar PostgREST

Cambiar `rixBatchSize` de 2000 a 1000 (el maximo real de PostgREST) para que la paginacion funcione correctamente:

```text
// Antes:
const rixBatchSize = 2000;

// Despues:
const rixBatchSize = 1000;
```

Con `batchSize = 1000` y offset real:
- Iteracion 1: offset 0, obtiene filas 0-999 de cada tabla
- Iteracion 2: offset 1000, obtiene filas 1000-1999 de cada tabla
- Se repite hasta cubrir todas las filas

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | (1) Anadir campo `offset` a `FetchUnifiedRixOptions` (linea 77); (2) Usar `.range()` en vez de `.limit()` dentro de `fetchUnifiedRixData` (lineas 113-116); (3) Pasar `offset: rixOffset` en la llamada del bucle (linea 3897); (4) Cambiar `rixBatchSize` de 2000 a 1000 (linea 3893) |

## Resultado esperado

- Las 1.074 evaluaciones de la semana actual se cargaran completas
- Las 179 empresas x 6 modelos estaran TODAS en el contexto del LLM
- Endesa (67), Banco Santander (66), Iberdrola (62) ya no se perderan
- El ranking IBEX-35 tendra las 35 empresas con datos reales
- La solucion es estructural y funciona para cualquier tamano de censo futuro

## Impacto en rendimiento

Minimo. Antes: 1 llamada que perdia datos. Ahora: 2-3 llamadas de 1.000 filas cada una, ejecutadas secuencialmente. El incremento en tiempo es de ~200-400ms, despreciable frente a los 15-30 segundos de la llamada al LLM.
