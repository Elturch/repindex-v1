

# Rediseno completo del sistema de estilos PDF/HTML

## Objetivo

Adaptar los 3 archivos de estilos de exportacion (markdownToHtml.ts, markdown-message.tsx, ChatContext.tsx) y el technical sheet (technicalSheetHtml.ts) al nuevo sistema de diseno editorial proporcionado. Tambien se actualiza la bibliografia (verifiedSourceExtractor.ts).

## Nuevo sistema de diseno

- **Fuente principal**: DM Sans (reemplaza Inter)
- **Fuente monoespaciada**: JetBrains Mono (solo formulas como `RIX = ...`)
- **Paleta de colores**:
  - Body text: `#0f1419`
  - Texto secundario/muted: `#536471`
  - Texto terciario: `#8899a6`
  - Acento global: `#1a73e8`
  - Subtitulo oscuro: `#1a3a5c`
  - Fondo header: `#f0f4f8`
  - Fondo veredicto: `#1e3a5f`
  - Fondo action cards: `#f7f9fa`
  - URLs bibliografia: `#a16207` / `#6b7280`
  - Disclaimer: `#8899a6`

## Archivos a modificar

### 1. `src/lib/markdownToHtml.ts` — Estilos base de exportacion

Reescritura completa de `baseExportStyles` y `premiumTableStyles`:

- **CSS Variables**: Reemplazar la paleta azul (#3b82f6) por la nueva paleta (#1a73e8, #0f1419, #536471, etc.)
- **Google Fonts**: Cargar DM Sans (400, 500, 600, 700) + JetBrains Mono (400, 500) en lugar de Inter
- **Body**: font-family DM Sans, font-size 14.5px, color #0f1419, line-height 1.75
- **Headings**:
  - h1 (section title): 20px, weight 700, color #0f1419, borde inferior con #1a73e8
  - h2: 19px, weight 600, color #0f1419
  - h3: 17px, weight 600, color #0f1419
  - h4: 14.5px, weight 600, color #1a3a5c
  - h5 (section label): 11px, uppercase, weight 600, color #1a73e8, letter-spacing 1.5px
  - h6: 11px, uppercase, weight 500, color #8899a6
- **Eliminar** pseudo-elementos decorativos (::before en h1, h2, h3) — diseno mas limpio
- **Blockquotes**: border-left #1a73e8, background transparente, font-style italic, color #536471, font-size 13.8px
- **Code/formulas**: font-family JetBrains Mono, background #f0f4f8
- **Tablas**:
  - th: 10px uppercase, weight 600, color #536471, background #f0f4f8
  - td: 13px, weight 400, color #0f1419
  - td:first-child: weight 500
  - Border radius reducido a 8px (menos burbuja)
  - Zebra mas sutil con #f7f9fa
- **Links**: color #1a73e8, weight 600
- **Listas**: bullet con acento #1a73e8, ol counters en #1a73e8
- **Lead paragraph** (primer p tras seccion): 15.2px, weight 400
- **hr**: linea solida #e5e7eb, sin gradiente

### 2. `src/components/ui/markdown-message.tsx` — Exportacion single-message

Actualizar los estilos inline del HTML template (lineas ~250-830):

- **Google Fonts link**: DM Sans + JetBrains Mono
- **CSS Variables**: nueva paleta
- **Header (.report-header)**:
  - Fondo: `#f0f4f8` (claro, no oscuro)
  - Color texto: `#0f1419`
  - Logo: 28px, weight 700, color #0f1419, con "Index" en #8899a6
  - Tagline: 11px, uppercase, weight 500, color #8899a6
  - Badge "DOCUMENTO CONFIDENCIAL": 10px, uppercase, weight 600, color #1a73e8, borde #1a73e8
  - Titulo informe: 20px, weight 600, color #0f1419
  - Subtitulo: 13px, weight 400, color #536471
  - Meta items: 12px, weight 400, color #536471
  - Eliminar gradientes oscuros y pseudo-elementos radiales
- **Typography del body**: mismos valores que markdownToHtml
- **Footer**:
  - Logo: 16px, weight 700, color #0f1419
  - Tagline: 11px, weight 400, color #536471
  - URL: 12px, weight 600, color #1a73e8
  - Disclaimer: 10px, weight 400, color #8899a6

### 3. `src/contexts/ChatContext.tsx` — Exportacion full-conversation

Actualizar los estilos inline del HTML template (lineas ~940-1206):

- Mismos cambios de paleta, fuentes y header que markdown-message.tsx
- **Message bubbles**:
  - User: background #1a73e8 (acento), texto blanco
  - Assistant: background #f7f9fa, borde #e5e7eb
  - Role label: 11px, uppercase, weight 600, color #536471
- **Footer y disclaimer**: mismos valores que markdown-message

### 4. `src/lib/technicalSheetHtml.ts` — Ficha tecnica legal

- **Font-family**: DM Sans (body), JetBrains Mono (formulas)
- **Header**: color #8899a6 (no #9ca3af)
- **h4**: 9px, uppercase, weight 700, color #0f1419 (no #4b5563)
- **Body text**: 9px, weight 400, color #536471 (no #6b7280)
- **Tablas**: th background #f0f4f8, th color #536471, td 8px
- **Formula (.formula)**: font-family JetBrains Mono, background #f0f4f8
- **Disclaimer box**: background #f7f9fa, border #e5e7eb
- **Report-specific box**: background `rgba(26, 115, 232, 0.05)`, border `rgba(26, 115, 232, 0.2)`, h4 color #1a73e8

### 5. `src/lib/verifiedSourceExtractor.ts` — Bibliografia

- **Seccion container**: background #f7f9fa (no gradiente)
- **Titulo (h2)**: 19px, weight 600, color #0f1419
- **Subtitulo (h3)**: 17px, weight 600, color #0f1419
- **Items de bibliografia**: 11px, weight 500
- **URLs**: color #a16207 (dorado) para window, #6b7280 para reinforcement
- **Domain badges**: color #536471

### 6. HTML Templates (markup)

Actualizar los `<link>` de Google Fonts en los dos templates HTML:
```text
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

## Resumen de impacto

- **6 archivos** modificados
- **0 archivos** nuevos o eliminados
- **Sin cambios funcionales** — solo estilos CSS y markup de templates HTML
- El resultado es un sistema de diseno editorial unificado con tipografia DM Sans, paleta de colores frios corporativos (#0f1419, #1a73e8, #536471) y header claro (#f0f4f8) en lugar del header oscuro actual
