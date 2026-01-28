
Objetivo
- Corregir que en /chat el Agente Rix “no conteste” y solo aparezca el botón “Descargar como informe”, dejando un mensaje asistente vacío.

Diagnóstico (causa real)
- El frontend (ChatContext) envía las preguntas a la edge function `chat-intelligence` con `streamMode: true` y entra en “STREAMING MODE” (SSE).
- Pero el backend `supabase/functions/chat-intelligence/index.ts` solo implementa SSE real para “bulletins” (boletines). Para el flujo estándar (handleStandardChat) devuelve JSON (`Content-Type: application/json`) siempre.
- Resultado: el frontend intenta parsear la respuesta como SSE (busca líneas `data: ...`), no encuentra chunks, `accumulatedContent` se queda vacío y termina mostrando un mensaje asistente sin contenido. Aun así, el botón de descarga aparece porque `showDownload` se activa cuando `isStreaming` es false.

Evidencia en el código
- Frontend (`src/contexts/ChatContext.tsx`): en modo streaming hace `fetch(.../chat-intelligence)` y parsea SSE esperando `data: { type: 'chunk' | 'done' | 'error' }`.
- Backend (`supabase/functions/chat-intelligence/index.ts`):
  - Si `streamMode` es true: solo hace log (“STREAMING MODE enabled…”) pero “cae” al flujo estándar sin devolver SSE.
  - `handleStandardChat` termina con `return new Response(JSON.stringify({ answer, ... }), { 'Content-Type': 'application/json' })`.

Solución (implementación)
Vamos a hacerlo robusto en dos capas para que no vuelva a pasar:
A) Backend: Streaming SSE real para el chat estándar cuando `streamMode === true`
B) Frontend: fallback automático si el backend devuelve JSON (para compatibilidad y resiliencia)

A) Cambios backend (chat-intelligence) — SSE para Standard Chat
1) Pasar `streamMode` al handler estándar
- En el `serve()` principal, al llamar a `handleStandardChat(...)`, añadir el parámetro `streamMode`.
- Ajustar la firma de `handleStandardChat` para recibir `streamMode: boolean`.

2) Implementar rama `if (streamMode)` dentro de `handleStandardChat`
- Crear un `ReadableStream` y usar `createSSEEncoder()` (ya existe).
- Emitir eventos SSE:
  - Opcional: `start` (metadata básica: idioma, depth, empresas detectadas).
  - Durante generación: eventos `chunk` con texto incremental (igual que en bulletins).
  - Al finalizar: evento `done` con `suggestedQuestions`, `drumrollQuestion` y `metadata` (incluyendo `methodology`).
  - En fallo: evento `error` con mensaje usable para UI.

3) Reutilizar el streaming ya existente
- Generación en streaming:
  - Intentar `streamOpenAIResponse(...)` con el mismo prompt/mensajes usados hoy (system + conversationHistory + userPrompt).
  - Si falla o no hay contenido: fallback a `streamGeminiResponse(...)` (ya está implementado).
- Después de completar el texto (ya con `accumulatedContent`):
  - Ejecutar la parte final existente: extracción de insights + drumroll + suggested questions.
  - Emitir el evento final `done`.

4) Headers SSE correctos
- Devolver `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` como ya se hace en bulletins.

5) Persistencia coherente
- Mantener el guardado en DB desde el backend (como ya hace hoy) para que:
  - El historial sea consistente incluso si el navegador recarga.
  - La metadata metodológica sea la “fuente de verdad”.

B) Cambios frontend (ChatContext) — fallback JSON + recuperación
1) Detectar Content-Type antes de parsear
- En el camino `useStreaming`:
  - Si `response.headers.get('content-type')` incluye `application/json`, no intentar SSE:
    - `const data = await response.json()`
    - Completar el mensaje asistente con `data.answer`
    - Asignar `suggestedQuestions`, `drumrollQuestion`, `metadata` como en el flujo no-streaming.

2) Mantener SSE cuando realmente sea SSE
- Si el content-type es `text/event-stream`, usar el parser actual.
- (Opcional mejora) Hacer el parser un poco más estricto:
  - Ignorar líneas vacías y comentarios `:` (keep-alive), para evitar falsos negativos.

3) Evitar “mensajes vacíos”
- Si al finalizar el “streaming” `accumulatedContent.trim()` es vacío:
  - Mostrar toast de error (“No se recibió contenido del asistente. Reintentando recuperación…”).
  - Recuperar desde DB el último mensaje asistente no vacío para ese `sessionId` y pintarlo (fallback de seguridad).
  - Esto cubre casos raros de proxies o cortes de stream.

4) Reducir duplicados en `chat_intelligence_sessions` (recomendado)
- Actualmente el cliente inserta el mensaje del usuario y el asistente en DB, y el backend también inserta. Esto puede duplicar el historial.
- Ajuste recomendado:
  - En modo streaming: no insertar en `chat_intelligence_sessions` desde el cliente (o al menos no insertar el asistente).
  - Dejar que el backend sea el único escritor de sesiones para el chat estándar.
- Nota: esto no es imprescindible para “ver la respuesta”, pero evita historial con entradas repetidas o vacías.

Validación / pruebas (lo que verificaremos)
1) Prueba manual en /chat:
- Enviar una pregunta “normal” (no boletín) con profundidad Exhaustivo.
- Ver que aparece respuesta en tiempo real (texto incremental) o, si no hay SSE por cualquier motivo, que aparece respuesta completa vía JSON fallback.
- Confirmar que el botón “Descargar como informe” exporta el HTML con contenido real.

2) Prueba de red:
- Confirmar que la llamada a `/functions/v1/chat-intelligence` devuelve:
  - `Content-Type: text/event-stream` cuando `streamMode: true`
  - `application/json` cuando `streamMode: false`

3) Prueba de regresión:
- Generación de boletines (que ya usa SSE) sigue funcionando.
- Enriquecimiento por rol (action=enrich) sigue devolviendo JSON y el frontend lo maneja (no usa stream ahí).

Archivos a modificar (exactos)
- `supabase/functions/chat-intelligence/index.ts`
  - Pasar `streamMode` a `handleStandardChat`
  - Añadir implementación SSE en Standard Chat
- `src/contexts/ChatContext.tsx`
  - Detectar `Content-Type` y fallback a JSON
  - (Opcional) recuperación desde DB si respuesta queda vacía
  - (Recomendado) evitar inserciones duplicadas en `chat_intelligence_sessions` en modo streaming

Riesgos y mitigaciones
- Riesgo: Al añadir SSE al chat estándar, algunos navegadores/proxies pueden cortar streams largos.
  - Mitigación: fallback automático a JSON y/o recuperación desde DB si el contenido queda vacío.
- Riesgo: “done event” tarda porque después del streaming se generan sugerencias/drumroll.
  - Mitigación: seguir streameando solo el cuerpo principal; el “done” puede llegar 1–3s después sin afectar la UX.

Resultado esperado
- Al preguntar al Agente Rix en /chat, siempre habrá respuesta visible:
  - En streaming real cuando esté activo, y
  - En modo JSON fallback cuando no haya SSE disponible,
  eliminando el caso “solo aparece el botón de descargar sin contestación”.
