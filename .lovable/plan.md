
# ✅ PLAN COMPLETADO

## Objetivo
Corregir que en /chat el Agente Rix "no conteste" y solo aparezca el botón "Descargar como informe", dejando un mensaje asistente vacío.

## Cambios implementados

### A) Backend (supabase/functions/chat-intelligence/index.ts)

1. **Pasado `streamMode` a `handleStandardChat`** (línea ~1797)
   - Añadido el parámetro `streamMode` a la llamada de la función

2. **Actualizada la firma de `handleStandardChat`** (línea ~2977)
   - Añadido parámetro `streamMode: boolean = false`

3. **Implementado SSE streaming real para chat estándar** (líneas ~4095-4320)
   - Nueva rama `if (streamMode)` que retorna `ReadableStream`
   - Usa `streamOpenAIResponse()` con fallback a `streamGeminiResponse()`
   - Emite eventos SSE: `start`, `chunk`, `fallback`, `done`, `error`
   - Incluye metadata de metodología en el evento `done`
   - Guarda en DB desde backend (evita duplicados)

### B) Frontend (src/contexts/ChatContext.tsx)

1. **Detección de Content-Type** (líneas ~407-425)
   - Si `Content-Type: application/json` → parsea como JSON (fallback)
   - Si `Content-Type: text/event-stream` → parsea como SSE (streaming)

2. **Manejo robusto de SSE**
   - Ignora líneas vacías y comentarios keep-alive (`:`)
   - Safety check: si stream termina sin contenido, muestra error y elimina mensaje vacío

3. **Eliminado guardado duplicado en DB**
   - El backend ahora es el único que guarda en `chat_intelligence_sessions` durante streaming

## Resultado esperado
- Al preguntar al Agente Rix en /chat, siempre habrá respuesta visible
- Streaming real cuando esté activo (texto incremental)
- JSON fallback cuando no haya SSE disponible
- El caso "solo aparece el botón de descargar sin contestación" está eliminado
