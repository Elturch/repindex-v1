
# Hacer visible el botón "Descargar informe" en todos los mensajes del hilo

## Diagnóstico

El botón "Descargar como informe" existe en cada respuesta del asistente, dentro del componente `MarkdownMessage`. El problema tiene dos causas combinadas:

1. **Altura fija del ScrollArea**: El área de chat tiene altura fija (`h-[500px]`). Con 3 respuestas largas en el hilo, los botones de descarga de los mensajes anteriores quedan enterrados dentro del scroll y no son fáciles de localizar.

2. **El botón solo aparece al 70% de opacidad** (`opacity-70`) sin ningún indicador visual claro. No hay hover card ni tooltip que avise al usuario de su existencia.

3. **El botón está al final de cada burbuja de respuesta**, después del contenido de la metodología, el feedback y el rol de enriquecimiento. En respuestas largas, queda muy lejos del inicio del mensaje y el usuario no llega a verlo.

## Solución

Mover el botón de descarga a un lugar **siempre visible** junto a cada mensaje del asistente: como una acción en la cabecera/barra superior de la burbuja, no al final. Así el usuario puede descargar cualquier respuesta del hilo sin tener que hacer scroll hasta el final de cada una.

### Cambio 1 — `src/components/chat/ChatMessages.tsx`

Añadir una barra de acciones en la parte superior derecha de cada burbuja de respuesta del asistente (no en el mensaje del usuario). Esta barra contiene el botón de descarga y es siempre visible (no depende del hover).

El botón llama a la función de descarga de `MarkdownMessage`, pero para poder hacerlo desde fuera necesitamos o bien:
- **Opción A**: Pasar el contenido del mensaje y el handler de descarga directamente desde `ChatMessages`, generando el HTML de exportación con los mismos parámetros que ya tiene `MarkdownMessage`.
- **Opción B** (más limpia): Extraer la función `downloadMessage` de `MarkdownMessage` a un hook reutilizable o pasarla como `ref`.

Usaremos **Opción A**: en `ChatMessages`, para cada mensaje del asistente que no esté en streaming, mostrar un pequeño botón de descarga en la esquina superior derecha de la burbuja. El botón usa la misma lógica de exportación que ya existe en `MarkdownMessage` — importamos `generateExportHtml` (actualmente es una función privada, hay que exportarla) y lo invocamos desde `ChatMessages`.

### Cambio 2 — `src/components/ui/markdown-message.tsx`

- Exportar la función `generateExportHtml` para poder usarla desde `ChatMessages`.
- Eliminar el botón de descarga del interior de `MarkdownMessage` (para evitar duplicidad). O mantenerlo pero hacerlo `opacity-0` si el botón externo ya lo cubre.

### Cambio 3 — Diseño del botón

El botón de descarga en la cabecera de la burbuja:
- Icono `Download` + texto "Informe"
- `variant="ghost"` con `size="sm"`
- Siempre visible (sin `opacity-70`), alineado a la derecha del borde superior de la burbuja
- Solo aparece en mensajes del asistente que **no estén en streaming** (`!message.isStreaming`)

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/ui/markdown-message.tsx` | Exportar `generateExportHtml`; mover/eliminar el botón interno |
| `src/components/chat/ChatMessages.tsx` | Añadir botón de descarga visible en cabecera de cada burbuja del asistente |

## Lo que NO cambia

- Lógica de exportación HTML (idéntica a la actual)
- Lógica de streaming y renderizado de mensajes
- Componentes de feedback, metodología y rol de enriquecimiento
- Estilos del informe exportado
