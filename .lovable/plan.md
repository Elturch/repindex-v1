## Diagnóstico

El toast "Informe RepIndex descargado como HTML" se dispara pero el archivo no llega al disco. La causa es un patrón de descarga frágil en **4 funciones** (`downloadAsHtml`, `downloadAsTxt`, `downloadAsJson` en `ChatContext.tsx` y `downloadMessage` en `ChatMessages.tsx`):

```ts
const link = document.createElement('a');
link.href = url;
link.download = '...';
link.click();              // ← anchor NO está en el DOM
URL.revokeObjectURL(url);  // ← se revoca SÍNCRONO, antes de que el navegador inicie la descarga
```

Dos problemas:

1. **Anchor no anclado al DOM**. Chrome/Edge/Safari recientes — y especialmente cuando hay extensiones, modos de ahorro de datos, o el evento de click no procede de un gesto directo del usuario (estamos dentro del callback del DropdownMenu de Radix, que dispara el click en el siguiente tick) — pueden ignorar `click()` sobre anchors desconectados sin lanzar error.
2. **`revokeObjectURL` síncrono**. La descarga del blob URL es asíncrona; al revocar inmediatamente el navegador a veces aborta la transferencia. El HTML del informe pesa cientos de KB (premium styles + tabla técnica + bibliografía con 3.610 URLs), suficiente para que la condición de carrera se manifieste.

El informe del 30-abr 19:21 tenía 477 medios y la sesión replay confirma: el usuario hizo click en "Descargar como informe", apareció el toast, pero el archivo no aparece en `Descargas`. El patrón coincide exactamente con el bug.

## Fix

Patrón estándar y robusto en las 4 funciones:

```ts
const link = document.createElement('a');
link.href = url;
link.download = filename;
link.rel = 'noopener';
link.style.display = 'none';
document.body.appendChild(link);
link.click();
// Esperar al siguiente tick antes de limpiar
setTimeout(() => {
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}, 100);
```

## Archivos a modificar

| Archivo | Función | Líneas aprox |
|---|---|---|
| `src/contexts/ChatContext.tsx` | `downloadAsTxt` | 1647-1652 |
| `src/contexts/ChatContext.tsx` | `downloadAsJson` | 1670-1675 |
| `src/contexts/ChatContext.tsx` | `downloadAsHtml` | 2051-2057 |
| `src/components/chat/ChatMessages.tsx` | `downloadMessage` | 84-90 |

Cambio quirúrgico de ~6 líneas por función. Sin tocar la generación del HTML, ni el toast, ni nada más.

## Criterios de aceptación

1. Click en "Descargar como informe" → archivo `.html` aparece en `~/Descargas` consistentemente (Chrome, Safari, Firefox).
2. Toast sigue mostrándose tras click.
3. Funciona también con informes grandes (>500 KB de HTML, como los del grupo hospitalario con 3.610 URLs).
4. `downloadMessage` (botón individual del bubble) y los 3 formatos del dropdown (HTML/TXT/JSON) usan el mismo patrón.
5. Sin regresiones en streaming guard (sigue bloqueando descarga durante stream activo).

## Smoke test sugerido

1. Pedir un informe sectorial (e.g. "grupos hospitalarios T1").
2. Esperar a que termine.
3. Dropdown Export → "Descargar como informe" → verificar archivo en disco.
4. Repetir con "Descargar como TXT" y "Descargar como JSON".
5. Botón Download en el bubble del mensaje → verificar archivo.

No hace falta tocar `ChatContext.tsx` más allá de las 3 mini-edits aisladas (no es un refactor).
