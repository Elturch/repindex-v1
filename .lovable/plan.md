

# Plan: Prevenir duplicados en el Vector Store

## Problema raiz

La funcion `populate-vector-store` tiene una vulnerabilidad en su chequeo de existencia (`getIndexedRixRunIds`): usa `.limit(100)` al buscar documentos existentes. Si hay duplicados, la query devuelve menos IDs unicos de los esperados, causando que el sistema piense que faltan documentos y los vuelva a insertar, creando mas duplicados en un bucle infinito.

## Solucion: Doble proteccion (aplicacion + base de datos)

### 1. Corregir `getIndexedRixRunIds` en `populate-vector-store`

Cambiar la query de existencia para que use `SELECT DISTINCT` o un limite mas alto. La solucion mas limpia: eliminar el `.limit()` restrictivo y usar un approach que siempre devuelva IDs unicos.

Cambio concreto en lineas 71-89:
- En lugar de `select('metadata->>rix_run_id').in(...).limit(batch.length)`, usar un limite mucho mas alto (ej. 10000) para que incluso si hay duplicados residuales, todos los IDs unicos del batch sean detectados.
- Alternativa: contar por rix_run_id en vez de listar filas.

### 2. Aplicar la misma correccion a `getIndexedNewsUrls`

Mismo patron en lineas 98-118 para `article_url` de noticias corporativas.

### 3. Crear indice UNIQUE parcial en la base de datos (proteccion definitiva)

Crear un indice unico parcial que impida duplicados a nivel de base de datos:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique_rix_run_id 
ON documents ((metadata->>'rix_run_id'))
WHERE metadata->>'rix_run_id' IS NOT NULL;
```

Esto garantiza que aunque la aplicacion falle en detectar duplicados (por concurrencia, bugs, etc.), la base de datos rechaza el INSERT duplicado. La edge function ya maneja errores de insert, asi que un conflicto simplemente se registra como error y continua.

### 4. Crear indice UNIQUE para noticias corporativas

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique_article_url
ON documents ((metadata->>'article_url'))
WHERE metadata->>'type' = 'corporate_news';
```

## Cambios tecnicos

| Archivo | Cambio |
|---|---|
| `supabase/functions/populate-vector-store/index.ts` | Subir el `.limit()` de `getIndexedRixRunIds` a 10000 (o eliminarlo) para evitar truncamiento silencioso. Mismo fix en `getIndexedNewsUrls`. |
| Nueva migracion SQL | Crear indices UNIQUE parciales en `documents` para `rix_run_id` y `article_url` |

## Resultado esperado

- La funcion `populate-vector-store` detecta correctamente todos los documentos ya indexados, sin importar cuantos duplicados residuales existan.
- La base de datos rechaza cualquier intento de insertar un duplicado, actuando como red de seguridad definitiva.
- El problema no puede volver a ocurrir ni por bugs de aplicacion ni por ejecuciones concurrentes.

