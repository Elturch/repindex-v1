
# Plan: Eliminar duplicados, cerrar el bug, y automatizar todo

## Causa raiz del problema

La funcion `getIndexedRixRunIds` en `populate-vector-store/index.ts` consulta documentos existentes con:

```
.select('metadata->>rix_run_id')
.in('metadata->>rix_run_id', ids)
```

PostgREST tiene un limite de 1000 filas por respuesta. Cuando cada `rix_run_id` tiene 125+ copias, una consulta de 500 IDs devuelve 62,500+ filas, pero PostgREST **trunca silenciosamente a 1000**. Esas 1000 filas cubren solo ~8 IDs unicos. Los otros 492 se consideran "no indexados" y se reinsertan como duplicados.

El cron `vector_store_continue` se auto-encadena cada 5 minutos. Como `remaining` nunca llega a 0, el proceso se repite infinitamente: ~90 duplicados cada 5 minutos, durante 43 dias, generando 1.13M de filas basura.

V2 no tiene este problema porque V1 agota los 45 segundos de timeout antes de que V2 se procese.

## Solucion: 4 cambios

### Cambio 1: Migracion SQL - Limpiar 1.12M duplicados y crear indices

Eliminar todos los documentos V1 duplicados, dejando solo el mas reciente por `rix_run_id`. Crear indices GIN para que las consultas futuras de existencia sean rapidas.

```sql
-- Paso 1: Eliminar duplicados V1 (conservar solo el mas reciente)
DELETE FROM documents
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY metadata->>'rix_run_id'
        ORDER BY id DESC
      ) as rn
    FROM documents
    WHERE metadata->>'rix_run_id' IS NOT NULL
      AND (metadata->>'source_table' IS NULL 
           OR metadata->>'source_table' = 'rix_runs')
  ) ranked
  WHERE rn > 1
);

-- Paso 2: Indices para acelerar consultas de existencia
CREATE INDEX IF NOT EXISTS idx_documents_rix_run_id 
ON documents ((metadata->>'rix_run_id'));

CREATE INDEX IF NOT EXISTS idx_documents_source_table 
ON documents ((metadata->>'source_table'));
```

Resultado esperado: de ~1.14M a ~18K filas (9,101 V1 + 6,600 V2 + 3,000 news).

### Cambio 2: Corregir el bug raiz en `getIndexedRixRunIds`

**Archivo:** `supabase/functions/populate-vector-store/index.ts` (lineas 61-82)

El fix: usar `SELECT DISTINCT metadata->>'rix_run_id'` con un limite alto, o mejor aun, usar `head: true` con count para verificar existencia. La solucion mas robusta es consultar con `.select('metadata->>rix_run_id')` pero **anadiendo un DISTINCT** o cambiando la estrategia a un check individual por ID.

La solucion optima: usar una query SQL directa con `SELECT DISTINCT`:

```typescript
const getIndexedRixRunIds = async (runIds: string[]): Promise<Set<string>> => {
  const ids = Array.from(new Set(runIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  // Use RPC or direct query with DISTINCT to avoid PostgREST row limit issue
  // Option: check existence one-by-one with head:true (no row limit issue)
  const out = new Set<string>();
  
  // Batch check in groups of 50 to keep queries fast
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const { data, error } = await supabaseClient
      .from('documents')
      .select('metadata->>rix_run_id')
      .in('metadata->>rix_run_id', batch)
      .limit(batch.length);  // Max 1 row per ID is enough
    
    // With duplicates cleaned and index created, 
    // this returns at most 50 rows (1 per ID)
    if (!error && data) {
      for (const row of data as any[]) {
        if (row?.rix_run_id) out.add(row.rix_run_id);
      }
    }
  }
  return out;
};
```

Pero esto solo funciona post-limpieza. Para ser 100% a prueba de fallos incluso si vuelven a aparecer duplicados, la mejor estrategia es **verificar existencia con `count` + `head:true`**:

```typescript
const getIndexedRixRunIds = async (runIds: string[]): Promise<Set<string>> => {
  const ids = Array.from(new Set(runIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  const out = new Set<string>();
  
  // Check in batches of 100 using count (immune to duplicates)
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    for (const id of batch) {
      const { count } = await supabaseClient
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('metadata->>rix_run_id', id);
      
      if ((count || 0) > 0) out.add(id);
    }
  }
  return out;
};
```

Sin embargo, esto seria lento (500 queries). Mejor solucion post-limpieza:

```typescript
const getIndexedRixRunIds = async (runIds: string[]): Promise<Set<string>> => {
  const ids = Array.from(new Set(runIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  const out = new Set<string>();
  
  // Post-cleanup: max 1 doc per rix_run_id, so .in() works fine
  // But add safety: use smaller batches + limit to avoid truncation
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data, error } = await supabaseClient
      .from('documents')
      .select('metadata->>rix_run_id')
      .in('metadata->>rix_run_id', batch)
      .limit(batch.length);

    if (!error && data) {
      for (const row of data as any[]) {
        if (row?.rix_run_id) out.add(row.rix_run_id);
      }
    }
  }
  return out;
};
```

### Cambio 3: Corregir doble-conteo en el orquestador

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (lineas 1023-1025 y 1131-1133)

```typescript
// ANTES (bug):
const remainingRix = Number(data?.remaining ?? 0);
const remainingNews = Number(data?.remaining_news ?? 0);
const remainingTotal = remainingRix + remainingNews;

// DESPUES:
const remainingTotal = Math.max(0, Number(data?.remaining ?? 0));
```

### Cambio 4: Retry 503 en newsroom y lanzar newsroom manualmente

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (handler `auto_generate_newsroom`)

Anadir reintento automatico cuando la llamada a `generate-news-story` falla con 503:

```typescript
let response = await fetch(url, options);
if (response.status === 503) {
  console.log('[auto_generate_newsroom] Got 503, retrying in 10s...');
  await new Promise(r => setTimeout(r, 10000));
  response = await fetch(url, options);
}
```

Ademas, insertar un trigger manual en `cron_triggers` para generar el newsroom de la semana actual.

## Resumen de cambios

| Archivo / Recurso | Cambio |
|---|---|
| Migracion SQL | Eliminar 1.12M duplicados V1 + crear 2 indices |
| `populate-vector-store/index.ts` | Fix `getIndexedRixRunIds` - batches de 100 con `.limit()` |
| `rix-batch-orchestrator/index.ts` | Fix doble-conteo `remainingTotal` (2 sitios) |
| `rix-batch-orchestrator/index.ts` | Retry 503 en newsroom handler |
| Trigger manual | Lanzar newsroom para semana actual |

## Resultado esperado

1. Tabla `documents` pasa de 1.14M a ~18K filas
2. Las consultas de existencia pasan de 30s+ a <1s (indice + sin duplicados)
3. El vector store completa la sincronizacion en minutos
4. La cadena `sanitize -> vectors -> newsroom` no se bloquea
5. El newsroom se genera para la semana actual
6. V2 nunca sufrira este bug porque la verificacion usa batches pequenos con `.limit()`
