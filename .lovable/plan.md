## Diagnóstico

Dos bugs distintos, ambos en `/visor`:

### Bug 1 — Botón "Descargar como informe" inalcanzable
El componente `ChatMessages` envuelve los mensajes en un `ScrollArea` con altura FIJA `h-[500px]` (línea 131 y 251 de `src/components/chat/ChatMessages.tsx`). Sobre `/visor` esto significa que el informe (que mide miles de px) queda atrapado dentro de una ventana interna de 500 px; el usuario hace scroll de la página y no llega al botón porque éste vive al final de un scroll interno que casi nadie descubre. En desktop sólo se ve el botón "Exportar" de la cabecera. Esto es el origen del "solo está arriba".

### Bug 2 — Las descargas no incluyen las fuentes (bibliografía vacía)
Tanto `downloadMessage` (botón inferior) como `downloadAsHtml` (botón superior) construyen la bibliografía leyendo `message.metadata.verifiedSources`. Pero la tabla `chat_intelligence_sessions` NO tiene columna `metadata` (verificado en `src/integrations/supabase/types.ts` líneas 453-523). Al guardar el mensaje del asistente (`ChatContext.tsx` líneas 1213, 1307, 1533) sólo se persisten `content`, `suggested_questions`, `documents_found`, `structured_data_found`. Al rehidratar la conversación al abrir un informe guardado (`loadHistory` líneas 628-672) el mensaje se reconstruye SIN `verifiedSources`, SIN `methodology` y SIN `reportContext`. Resultado: la bibliografía sale vacía y el período/contexto aparece nulo.

Por eso un informe recién generado (en la misma sesión) sí trae fuentes, pero cualquier informe abierto desde la "memoria de informes" sale sin bibliografía.

## Plan

### Cambio 1 — Migración de DB
Añadir columna `metadata JSONB NULL` a `chat_intelligence_sessions`. No requiere backfill (los informes antiguos seguirán sin fuentes, pero los nuevos las recuperarán).

```sql
ALTER TABLE public.chat_intelligence_sessions
  ADD COLUMN metadata JSONB NULL;
```

### Cambio 2 — Persistir metadata al guardar
En `src/contexts/ChatContext.tsx`:
- Líneas ~1213, ~1307 y ~1533 (los 3 `insert` de mensajes assistant): añadir `metadata: { verifiedSources, methodology, reportContext, type, guardKind, companyName, depthLevel, questionCategory, ... }`.

### Cambio 3 — Rehidratar metadata al cargar
En `src/contexts/ChatContext.tsx` líneas 640-644 (`loadHistory`):
- Leer `msg.metadata` y volcarlo en `message.metadata` con el shape que ya espera el resto del código (verifiedSources, methodology con periodFrom/periodTo/modelsUsed, reportContext, etc.).

### Cambio 4 — Botón inferior alcanzable en /visor
En `src/components/chat/ChatMessages.tsx`:
- Añadir prop opcional `unboundedHeight?: boolean`. Cuando es `true`, `scrollHeight` se sustituye por `min-h-0` (sin altura fija), de modo que el contenido fluye con la página y el botón inferior queda al final del scroll natural.
- En `src/pages/RixViewer.tsx` línea 499: pasar `unboundedHeight` al `<ChatMessages>`.
- Reemplazar `ScrollArea` por `<div className="w-full max-w-full min-w-0 overflow-x-hidden">` cuando `unboundedHeight` (Radix `ScrollArea` no funciona bien sin altura definida).
- `ChatIntelligence.tsx` y `FloatingChat.tsx` mantienen el comportamiento actual.

### Verificación
1. Generar un informe nuevo en `/informes` → abrirlo en `/visor` → comprobar que al hacer scroll de la página aparece el botón "Descargar como informe" al final.
2. Click en el botón → el HTML descargado debe traer la sección "Bibliografía" con las URLs.
3. Recargar la página, reabrir el informe desde la memoria lateral → repetir el test y comprobar que la bibliografía sigue ahí (metadata rehidratada).

## Fuera de alcance

- No modificar prompts ni edge functions.
- No retroactivar fuentes en informes anteriores.
- No tocar el botón "Exportar" superior (sigue funcionando idéntico).