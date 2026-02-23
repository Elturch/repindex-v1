

# Plan: Hacer resiliente la generación del Newsroom

## Problema

La edge function `generate-news-story` da timeout (HTTP 504) de forma consistente. Ha fallado 3 veces seguidas (20 Feb, 23 Feb x2). La función hace demasiadas operaciones secuenciales:
- ~20 llamadas a OpenAI Embeddings
- ~20 búsquedas vectoriales
- 1 llamada masiva a Gemini (65K tokens output)
- ~16 upserts a la BD

Todo esto excede el limite de ejecucion de las Edge Functions de Supabase (~400s).

## Solucion: Dos mejoras complementarias

### 1. Agregar reintento para 504 en el orquestador

Actualmente solo reintenta en 503. Agregar 504 a la logica de reintento, ya que ambos son errores transitorios de gateway.

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (lineas 1261-1276)

Cambio: Donde dice `if (response.status === 503)`, cambiar a `if (response.status === 503 || response.status === 504)`.

### 2. Reducir el tiempo de ejecucion de `generate-news-story`

La mayor perdida de tiempo esta en `fetchVectorStoreContext`: hace 20+ llamadas individuales a OpenAI Embeddings + 20+ RPCs de busqueda vectorial de forma secuencial. Esto puede tardar 30-60 segundos solo en este paso.

**Archivo:** `supabase/functions/generate-news-story/index.ts`

Cambios:
- Limitar el numero de empresas a buscar en el vector store de ~20 a 10 (las mas relevantes)
- Paralelizar las llamadas a embeddings y busquedas vectoriales usando `Promise.allSettled` en batches de 5
- Reducir `maxOutputTokens` de Gemini de 65536 a 32768 (suficiente para 15 historias)
- Esto deberia reducir el tiempo total de ~400s a ~200s

### 3. Mecanismo de auto-reintento con trigger persistente

Cuando el orquestador detecte un fallo 504 incluso despues de reintentar, en lugar de marcar como `failed` definitivamente, insertar un nuevo trigger `auto_generate_newsroom` con status `pending` para que el proximo ciclo de 5 minutos lo vuelva a intentar (maximo 3 intentos).

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

Cambio: Despues del bloque de reintento 503/504, si sigue fallando, verificar cuantos intentos previos ha habido. Si menos de 3, insertar nuevo trigger pending.

## Cambios tecnicos

| Archivo | Cambio |
|---|---|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Agregar reintento para 504; auto-reintento con maximo 3 intentos |
| `supabase/functions/generate-news-story/index.ts` | Reducir empresas en vector search a 10; paralelizar embeddings; reducir maxOutputTokens a 32768 |

## Resultado esperado

- El newsroom se genera de forma resiliente, reintentando automaticamente ante timeouts
- El tiempo de ejecucion se reduce un ~50%, cabiendo dentro del limite de Edge Functions
- Si persisten los timeouts, el sistema reintenta hasta 3 veces en intervalos de 5 minutos
