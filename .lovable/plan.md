

# Nuevo agente independiente: rix-press-agent

## Por que una Edge Function separada

El modo Rix Press esta actualmente metido dentro de `chat-intelligence` (6000 lineas), y los guardrails de categorizacion de preguntas lo bloquean antes de que el codigo llegue al handler de Press. Mover el bloque de sitio dentro de la misma funcion es fragil: cualquier cambio futuro en los guardrails puede volver a romperlo.

La solucion correcta es crear una Edge Function independiente (`rix-press-agent`) que:

- No tiene guardrails de categorizacion (no los necesita)
- No comparte logica con el agente de reputacion
- Se conecta directamente a Google Gemini API con `GOOGLE_GEMINI_API_KEY`
- Accede al Vector Store y a los datos RIX para nutrir al periodista con datos reales
- Tiene su propio prompt de periodista de investigacion

## Arquitectura

```text
Frontend (ChatContext.tsx)
  |
  |-- isRixPressMode = false --> POST /chat-intelligence  (agente reputacion)
  |-- isRixPressMode = true  --> POST /rix-press-agent    (agente periodista)
```

Dos agentes independientes, un unico punto en comun: los datos del Vector Store y RIX.

## Cambios

### 1. Nueva Edge Function: `supabase/functions/rix-press-agent/index.ts`

Funcion ligera (~200 lineas) que extrae de `chat-intelligence` solo lo necesario:

- **CORS headers** (copiados del patron existente)
- **`fetchUnifiedRixData()`** — reutiliza la misma logica para obtener datos de `rix_runs` + `rix_runs_v2`
- **Vector Store query** — busqueda textual en tabla `documents` filtrando `sales_memento`
- **`PRESS_SYSTEM_PROMPT`** — el prompt de periodista de elite (copiado tal cual)
- **Llamada directa a Gemini** — `gemini-2.5-pro` via `GOOGLE_GEMINI_API_KEY`
- **Streaming SSE** — mismo formato que ya parsea el frontend (`type: start/chunk/done/error`)
- **Logging** — guarda mensajes en `chat_intelligence_sessions` y registra uso en `api_usage_logs`
- **Auth**: Si hay userId, verifica rol `press`. Si no hay userId, permite acceso (preview/dev)

### 2. `supabase/config.toml`

Anadir:
```toml
[functions.rix-press-agent]
verify_jwt = false
```

### 3. `src/contexts/ChatContext.tsx`

Cambiar el `sendMessage` para que cuando `pressMode === true`, llame a `/functions/v1/rix-press-agent` en lugar de `/functions/v1/chat-intelligence`. El body sera mas simple (solo `question`, `conversationHistory`, `sessionId`, `conversationId`, `language`, `languageName`).

Mantener el `toggleRixPressMode` que auto-configura sesion como 'journalist'.

### 4. `src/components/chat/ChatInput.tsx`

Ya esta corregido (`canSend` permite `isRixPressMode`). Sin cambios adicionales.

### 5. Limpiar `chat-intelligence/index.ts`

Eliminar todo el bloque de Press Mode (lineas 2039-2079 + funcion `handlePressMode` lineas 5695-5962 + constante `PRESS_SYSTEM_PROMPT`). Esto reduce la funcion en ~270 lineas y elimina codigo muerto.

## Archivos

| Archivo | Accion |
|---------|--------|
| `supabase/functions/rix-press-agent/index.ts` | CREAR — nuevo agente periodista independiente |
| `supabase/config.toml` | EDITAR — anadir `[functions.rix-press-agent]` |
| `src/contexts/ChatContext.tsx` | EDITAR — routing condicional segun `pressMode` |
| `supabase/functions/chat-intelligence/index.ts` | EDITAR — eliminar codigo Press Mode (limpieza) |

## Resultado esperado

- En Preview: activar Rix Press y enviar pregunta llama directamente al nuevo agente sin pasar por guardrails
- El periodista recibe todos los datos RIX + Vector Store y genera notas de prensa con Gemini 2.5 Pro
- En produccion: solo usuarios con rol `press` pueden acceder
- `chat-intelligence` queda mas limpio y enfocado en su mision de reputacion

