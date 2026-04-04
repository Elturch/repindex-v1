

## Plan revisado: Arreglar WORKER_LIMIT sin acotar datos

### Por qué tu preocupación es correcta

El plan anterior proponía:
- Reducir `MAX_RAW_RESPONSE_LENGTH` de 8000 a 4000 → **PELIGROSO**: las respuestas brutas de las 6 IAs se truncarían, perdiendo contexto semántico para los embeddings
- Seleccionar solo columnas específicas en vez de `SELECT *` → **PELIGROSO**: si mañana se añade un campo nuevo que se use en el content builder, no se incluiría y habría datos fantasma

Eso ya os causó problemas antes. **No se toca el contenido**.

### Causa raíz real

El CPU se agota por dos motivos:
1. **Escanear 500 filas por página** para buscar cuáles NO están indexadas (comparando IDs)
2. **Procesar 100 documentos** por invocación (cada uno requiere llamada a OpenAI + insert)

Pero las llamadas a OpenAI son I/O (no consumen CPU de Supabase). El CPU se gasta en:
- Deserializar 500 filas con `SELECT *` (lectura)
- Concatenar strings grandes para construir `content`
- Serializar JSON para metadata

### Solución conservadora (sin tocar contenido)

**Archivo**: `supabase/functions/populate-vector-store/index.ts`

**Cambio 1 — Reducir solo los tamaños de lote de procesamiento**

| Constante | Antes | Después | Motivo |
|---|---|---|---|
| `BATCH_SIZE` | 100 | **20** | Procesar 20 docs por invocación en vez de 100 |
| `NEWS_BATCH_SIZE` | 50 | **15** | Idem para noticias |
| `MAX_EXECUTION_TIME` | 45000 | **30000** | Margen más conservador |

**NO se toca**: `MAX_RAW_RESPONSE_LENGTH` (sigue en 8000), ni `SELECT *` (sigue trayendo todas las columnas).

**Cambio 2 — Reducir las páginas de escaneo**

| Línea | Antes | Después |
|---|---|---|
| 174 (`v1BatchSize`) | 500 | **200** |
| 239 (`v2BatchSize`) | 500 | **200** |
| 596 (`newsScanBatchSize`) | 500 | **200** |

Esto reduce la carga de deserialización en cada página sin perder datos — simplemente escanea en páginas más pequeñas.

**Cambio 3 — Delay entre documentos**

Línea 572: cambiar el delay de `100ms` a `200ms` para dar más margen al runtime de Deno y evitar picos de CPU.

### Qué NO se cambia (garantía de integridad)

- `MAX_RAW_RESPONSE_LENGTH` → sigue en 8000 (respuestas completas de las 6 IAs)
- `SELECT *` → sigue trayendo TODAS las columnas (sin riesgo de campos faltantes)
- La lógica de construcción de `content` → idéntica, sin truncamientos
- La lógica de `metadata` → idéntica, todos los scores y categorías

### Resultado esperado

- Cada invocación procesa **20 docs** en vez de 100, escaneando páginas de **200** en vez de 500
- El mecanismo `vector_store_continue` ya existente re-lanza automáticamente hasta completar todo
- Tras un barrido semanal (1.050 registros): ~53 lotes de 20 en vez de ~11 de 100
- **Cero pérdida de datos, cero truncamiento, cero campos omitidos**

