Aplicaré exactamente el cambio solicitado, sin tocar otras líneas:

1. En `src/components/chat/ChatMessages.tsx`, dentro de `triggerBlobDownload`, sustituir:
   `link.style.display = 'none';`
   por:
   `link.style.cssText = 'position:fixed;left:-9999px;top:-9999px';`

2. En `src/contexts/ChatContext.tsx`, dentro de `downloadAsHtml`, sustituir:
   `link.style.display = 'none';`
   por:
   `link.style.cssText = 'position:fixed;left:-9999px;top:-9999px';`

3. No modificar los otros `link.style.display = 'none'` de `downloadAsTxt` ni `downloadAsJson`, porque pediste solo los dos handlers de HTML.

4. Validación en preview:
   - Abrir `/chat` en preview.
   - Confirmar que el botón de descarga ejecuta el handler.
   - Comprobar que el toast sigue apareciendo.
   - Comprobar si el navegador inicia realmente la descarga del `.html` en preview.
   - Revisar consola/red si el preview no permite observar la descarga de forma directa.

Nota: ahora estoy en modo solo lectura. En cuanto apruebes este plan, aplicaré únicamente esas dos sustituciones y haré la validación en preview.