# P0-2 — Bloquear descarga durante streaming

## Estado actual (forense)
`ChatMessages.tsx` ya implementa el guard en dos puntos:

1. **Línea 364** — el botón "Download" del bubble del asistente está
   envuelto en `{message.role === 'assistant' && !message.isStreaming && (...)}`.
   Mientras `isStreaming === true` el botón **no se renderiza en el DOM**.
2. **Línea 295** — `<MarkdownMessage showDownload={!message.isStreaming} />`
   propaga el flag al sub-componente que tiene su propio botón embebido.

`message.isStreaming` se pone a `false` en `ChatContext.tsx:1141` justo
después de cerrar el stream, lo que cubre los apéndices simétricos del
skill (Recomendaciones + Fuentes citadas) ya que estos se emiten **antes
de que el orquestador devuelva control** a `index.ts` y por tanto antes
del frame `done`.

## Por qué el smoke test del 28-04 12:46 falló igualmente
No fue race condition contra el botón. Fue **falta de
`verifiedSources` en metadata** (causa raíz P0-1). El usuario descargó
después de que `isStreaming` ya era `false`, pero
`generateBibliographyHtml([], …)` retorna `''` cuando no hay sources →
sección vacía. P0-1 lo arregla.

## Cambio propuesto
**Defensa en profundidad mínima** dentro de `downloadMessage()`: abort
seguro si por cualquier path (atajo, futuro botón, evento programático)
se invoca con `message.isStreaming === true`. Mostrar toast informativo.
Esto NO cambia el flujo normal — solo añade una salvaguarda.

## Archivos
- MODIFICADO: `src/components/chat/ChatMessages.tsx` (función
  `downloadMessage`, +5 líneas).
- NO TOCADO: `ChatContext.tsx` (no hace falta — el flag ya está expuesto
  y el botón ya respeta el guard).
- NO TOCADO: routing, AuthContext, ProtectedRoute, App.tsx, etc.

## Criterios de aceptación
| # | Criterio | Verificable |
|---|----------|-------------|
| 1 | Botón Download oculto durante stream activo | inspección manual + grep `!message.isStreaming` |
| 2 | `downloadMessage(streamingMsg)` aborta sin lanzar excepción y muestra toast | code review |
| 3 | Flujo normal (post-stream) sigue funcionando | smoke matrix |
| 4 | `ChatContext.tsx` no tocado (regla de protección) | git diff |

## Smoke
- Llamar la función a mano (consola browser) con un mensaje cuyo
  `isStreaming === true` no debe descargar nada.
- Smoke matrix normal valida flujo nominal.
