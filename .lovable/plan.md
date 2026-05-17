## Problema

En `/visor`, al final del informe hay un botón **"Descargar como informe"** (en `src/components/chat/ChatMessages.tsx`, dentro de la burbuja del asistente, fila `flex justify-end`). En escritorio (≥1440px) se ve correctamente, pero en móvil (375), tablet y portátiles ~1280–1366px se sale por la derecha porque:

1. La cabecera de `/visor` (`Editar filtros`, `Regenerar informe`, `Exportar`) usa `flex items-center justify-between` sin `flex-wrap`, lo que empuja el contenido y crea overflow horizontal de la página.
2. La fila del botón de descarga dentro de la burbuja (`mt-3 pt-3 border-t flex justify-end`) queda anclada al borde derecho de la burbuja, que en viewports estrechos cae fuera del área visible.

Reproducido en 375×812: el card del informe aparece desplazado y la columna derecha (donde vive el botón) queda cortada.

## Cambios (solo presentación)

### 1. `src/pages/RixViewer.tsx` — cabecera responsive
- En la fila título + acciones (línea ~396), añadir `flex-wrap gap-3` y permitir que el bloque de botones (línea ~408) se envuelva: `flex flex-wrap items-center gap-2`.
- Así en ~768–1024px los botones bajan a una segunda línea en lugar de provocar overflow.

### 2. `src/components/chat/ChatMessages.tsx` — botón de descarga siempre visible
- En la fila del botón de descarga (línea ~403), cambiar `flex justify-end` por `flex justify-end flex-wrap gap-2`.
- Añadir al contenedor de la burbuja (línea ~257) la clase `min-w-0` para que las tablas anchas no fuercen la burbuja a expandirse más allá del card padre.
- En la burbuja del asistente, asegurar `overflow-hidden` (o `overflow-x-auto` en el wrapper de `MarkdownMessage` solamente, no en toda la burbuja) para que el contenido de tablas no empuje al botón fuera de pantalla.

### 3. Verificación
- Re-test visual en 375, 768, 1024, 1280, 1366 y 1920 px.
- Confirmar que el botón "Descargar como informe" aparece en la esquina inferior derecha del último mensaje en todos los breakpoints, sin scroll horizontal de página.

## Fuera de alcance

- No tocar lógica de descarga (`downloadMessage`, `triggerBlobDownload`).
- No tocar prompts ni edge functions.
- No cambiar el botón "Exportar" de la cabecera (solo permitir wrap).