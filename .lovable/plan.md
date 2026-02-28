

# Tabulación y alineación de resultados con emojis en PDFs

## Problema

Cuando el agente genera líneas de resultados con emojis (ej. `✅ NVM: 78.2`, `🔴 CEM: 34.1`, `🟢 Gobierno: Sólido`), estas aparecen como párrafos sueltos o listas normales en el HTML exportado, sin alineación visual. Los emojis se quiebran, los valores no cuadran y el resultado pierde la presentación ejecutiva esperada.

## Solución

Detectar automáticamente bloques de líneas consecutivas con emoji al inicio y convertirlos en una cuadrícula CSS alineada, con el emoji, el label y el valor cada uno en su columna.

## Cambios

### 1. `src/lib/markdownToHtml.ts` -- Detección y conversión de bloques emoji

Añadir una función `processEmojiResultBlocks` que se ejecute antes de `wrapInParagraphs`:

- Detectar secuencias de 2+ líneas consecutivas que empiezan con emoji (unicode Emoji_Presentation o Extended_Pictographic).
- Cada línea se parsea en: **emoji** | **label** (texto antes de `:`) | **valor** (texto después de `:`).
- Se genera un `<div class="emoji-result-grid">` con cada fila como `<div class="emoji-result-row">`.
- Si no hay `:` separador, la línea entera va como label (sin columna de valor).

### 2. `src/lib/markdownToHtml.ts` -- CSS para la cuadrícula emoji

Añadir `emojiGridStyles` al export de estilos:

```text
.emoji-result-grid
  - display: grid
  - grid-template-columns: 28px 1fr auto
  - gap: 6px 12px
  - margin: 16px 0
  - padding: 16px
  - background: #f7f9fa
  - border: 1px solid #e5e7eb
  - border-radius: 8px

.emoji-result-row
  - display: contents (para que cada hijo ocupe su columna del grid)

.emoji-result-icon
  - text-align: center
  - font-size: 1.1em

.emoji-result-label
  - font-weight: 500
  - color: #0f1419

.emoji-result-value
  - text-align: right
  - font-weight: 600
  - font-variant-numeric: tabular-nums
  - color: #0f1419
```

### 3. `src/contexts/ChatContext.tsx` -- Incluir los nuevos estilos en el HTML de exportación

Importar `emojiGridStyles` desde `markdownToHtml.ts` y añadirlo dentro del bloque `<style>` del documento HTML exportado, junto a `premiumTableStyles` y `technicalSheetStyles`.

### 4. `src/lib/markdownToHtml.ts` -- Estilos de impresión

Añadir reglas `@media print` para `.emoji-result-grid`:
- `break-inside: avoid`
- Mantener colores con `-webkit-print-color-adjust: exact`

## Lógica de detección

Una línea se considera "emoji result" si:
1. Empieza con un carácter emoji (tras trim).
2. El resto tiene contenido textual (no es solo emoji).

Un bloque se forma con 2+ líneas consecutivas que cumplen este criterio. Las líneas sueltas con emoji siguen tratándose como párrafos normales (no se fuerza cuadrícula para una sola línea).

## Impacto

- 2 archivos modificados: `src/lib/markdownToHtml.ts`, `src/contexts/ChatContext.tsx`
- Los informes PDF/HTML existentes se benefician automáticamente sin cambio en el backend
- Compatible con todos los emojis que ya usa el agente (checkmarks, círculos de color, estrellas, flechas, etc.)

