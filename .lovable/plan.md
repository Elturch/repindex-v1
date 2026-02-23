

# Plan: Limpieza de duplicados con migracion optimizada

## El problema

Las queries anteriores fallan porque:
1. Cualquier `ROW_NUMBER() OVER(PARTITION BY ...)` escanea las 1.12M filas antes de aplicar el LIMIT
2. El timeout por defecto de Supabase (unos 30s) no es suficiente para procesar 1.12M filas
3. No se puede ejecutar DELETE desde la herramienta de lectura

## Solucion: Migracion SQL con timeout extendido y delete por rangos de ID

Crear una migracion que:

1. Suba el `statement_timeout` a 300 segundos
2. Primero cree el indice en `metadata->>'rix_run_id'` (acelera todo lo demas)
3. Luego elimine duplicados en un loop PL/pgSQL por rangos de 10,000 IDs
4. Cree el segundo indice en `metadata->>'source_table'`

### Migracion SQL

```sql
-- Extend timeout for this heavy operation
SET statement_timeout = '600s';
SET lock_timeout = '60s';

-- Step 1: Create index FIRST to speed up duplicate detection
CREATE INDEX IF NOT EXISTS idx_documents_rix_run_id 
ON documents ((metadata->>'rix_run_id'));

-- Step 2: Delete all V1 duplicates in one pass using the new index
-- Keep only the row with the highest id per rix_run_id
DELETE FROM documents d
USING (
  SELECT metadata->>'rix_run_id' as rid, MAX(id) as keep_id
  FROM documents
  WHERE metadata->>'rix_run_id' IS NOT NULL
    AND (metadata->>'source_table' IS NULL OR metadata->>'source_table' = 'rix_runs')
  GROUP BY metadata->>'rix_run_id'
) keepers
WHERE d.metadata->>'rix_run_id' = keepers.rid
  AND d.id < keepers.keep_id
  AND d.metadata->>'rix_run_id' IS NOT NULL
  AND (d.metadata->>'source_table' IS NULL OR d.metadata->>'source_table' = 'rix_runs');

-- Step 3: Create second index
CREATE INDEX IF NOT EXISTS idx_documents_source_table 
ON documents ((metadata->>'source_table'));

-- Step 4: Reclaim space
VACUUM (VERBOSE) documents;
```

La clave es que con `SET statement_timeout = '600s'` el indice se crea primero, y una vez que el indice existe, el DELETE con `USING` + `GROUP BY` es eficiente porque usa el indice para agrupar por `rix_run_id` en vez de escanear secuencialmente.

### Si el DELETE sigue siendo demasiado grande

Plan B: usar una funcion PL/pgSQL con loop que procese en batches:

```sql
SET statement_timeout = '600s';

CREATE INDEX IF NOT EXISTS idx_documents_rix_run_id 
ON documents ((metadata->>'rix_run_id'));

DO $$
DECLARE
  deleted_count INT := 1;
  total_deleted INT := 0;
BEGIN
  WHILE deleted_count > 0 LOOP
    WITH to_kill AS (
      SELECT d.id
      FROM documents d
      JOIN documents d2 
        ON d.metadata->>'rix_run_id' = d2.metadata->>'rix_run_id'
        AND d.id < d2.id
      WHERE d.metadata->>'rix_run_id' IS NOT NULL
        AND (d.metadata->>'source_table' IS NULL 
             OR d.metadata->>'source_table' = 'rix_runs')
      LIMIT 50000
    )
    DELETE FROM documents WHERE id IN (SELECT id FROM to_kill);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    RAISE NOTICE 'Deleted % rows (total: %)', deleted_count, total_deleted;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_source_table 
ON documents ((metadata->>'source_table'));
```

### Despues de la limpieza

Insertar el trigger manual para generar el newsroom:

```sql
INSERT INTO cron_triggers (action, status) 
VALUES ('auto_generate_newsroom', 'pending');
```

## Cambio tecnico

| Archivo | Accion |
|---|---|
| Nueva migracion SQL | Timeout extendido + indice + delete masivo + segundo indice |
| Trigger manual | Lanzar newsroom para semana actual |

## Resultado esperado

- Tabla `documents` de ~1.14M a ~18K filas
- Indices creados para que las queries futuras sean instantaneas
- Newsroom se genera para la semana actual
