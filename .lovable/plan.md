

# Plan: Edge function de limpieza de duplicados

## Problema

El SQL Editor de Supabase impone un timeout upstream de ~30s que no se puede sobreescribir con `SET statement_timeout`. Cualquier operacion que escanee las 1.12M filas de `documents` falla antes de completar, incluyendo `GROUP BY`, `ROW_NUMBER()`, y `CREATE TEMP TABLE`.

## Solucion: Edge function dedicada

Crear una edge function `cleanup-duplicate-documents` que:

1. Usa la funcion SQL `execute_sql` (que ya existe como RPC) para ejecutar queries pequenas
2. Trabaja en batches de ~5,000 IDs a la vez usando rangos de ID primario
3. Para cada batch: identifica duplicados y los elimina
4. Se auto-invoca si queda trabajo pendiente (o el usuario la llama varias veces)

### Logica de la edge function

```
Para cada rango de 5000 IDs:
  1. SELECT metadata->>'rix_run_id' as rid, MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as cnt
     FROM documents
     WHERE id BETWEEN batch_start AND batch_end
       AND metadata->>'rix_run_id' IS NOT NULL
       AND (metadata->>'source_table' IS NULL OR metadata->>'source_table' = 'rix_runs')
     GROUP BY metadata->>'rix_run_id'
     HAVING COUNT(*) > 1

  2. Para cada rix_run_id con duplicados:
     DELETE FROM documents
     WHERE metadata->>'rix_run_id' = :rid
       AND (metadata->>'source_table' IS NULL OR metadata->>'source_table' = 'rix_runs')
       AND id < (SELECT MAX(id) FROM documents WHERE metadata->>'rix_run_id' = :rid)

  3. Reportar progreso
```

Pero esto sigue teniendo el problema de que la subquery del DELETE escanea toda la tabla.

### Mejor estrategia: Dos fases via edge function

**Fase 1 - Construir lista de IDs a conservar** (multiples llamadas pequenas):
- Consultar en rangos de 5000 IDs: para cada rango, obtener el MAX(id) por rix_run_id
- Acumular en memoria un Map de rix_run_id -> max_id_to_keep
- Esto requiere ~230 llamadas (1.14M / 5000), cada una tarda <1s con el indice

**Fase 2 - Eliminar duplicados** (multiples llamadas pequenas):
- Para cada rango de 5000 IDs: DELETE WHERE id BETWEEN X AND Y AND id NOT IN (lista de IDs a conservar de ese rango)
- Cada DELETE toca como maximo 5000 filas, completa en <1s

### Edge function: detalles tecnicos

**Archivo:** `supabase/functions/cleanup-duplicate-documents/index.ts`

La funcion:
- Usa `supabaseClient` con service role key para acceso directo
- Fase 1: Itera por rangos de ID, construye el mapa de keepers
- Fase 2: Itera por rangos de ID, elimina todo lo que no esta en keepers
- Devuelve progreso en JSON
- Tiene un timeout de edge function de ~400s, suficiente para completar ambas fases

```text
Flujo:
  GET /cleanup-duplicate-documents
    |
    v
  [Fase 1: Scan por rangos de 5000 IDs]
    -> Para cada rango: SELECT metadata->>'rix_run_id', MAX(id) GROUP BY ...
    -> Acumular mapa: { rix_run_id: max_id }
    -> ~230 queries, <1s cada una
    |
    v
  [Fase 2: Delete por rangos de 5000 IDs]
    -> Para cada rango: DELETE WHERE id BETWEEN X AND Y
         AND rix_run_id IS NOT NULL
         AND source_table IS NULL/rix_runs
         AND id NOT IN (keepers del rango)
    -> ~230 queries, <1s cada una
    |
    v
  [Response: { deleted: N, kept: M, duration_ms: T }]
```

### Despues de la limpieza

Una vez que la edge function reporta exito:
1. Crear el indice secundario (manual en SQL Editor, ya no hay 1.12M filas):
   ```sql
   CREATE INDEX IF NOT EXISTS idx_documents_source_table ON documents ((metadata->>'source_table'));
   ```
2. Lanzar el newsroom:
   ```sql
   INSERT INTO cron_triggers (action, status) VALUES ('auto_generate_newsroom', 'pending');
   ```

## Cambios

| Archivo | Accion |
|---|---|
| `supabase/functions/cleanup-duplicate-documents/index.ts` | Nueva edge function para limpieza en batches |

## Resultado esperado

- La edge function completa en 2-4 minutos
- Tabla `documents` pasa de ~1.14M a ~18K filas
- Sin timeouts porque cada query individual toca maximo 5000 filas
- Se puede invocar con curl o desde el navegador

