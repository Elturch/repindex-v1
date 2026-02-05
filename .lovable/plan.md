

# Plan: Diseño PPTX Profesional con Identidad Visual RepIndex

## Elementos de Marca Identificados

| Elemento | Descripción | Uso en PPTX |
|----------|-------------|-------------|
| **Logotipo** | "RepIndex.ai" - "Rep" bold + "Index.ai" light | Header de todas las slides |
| **Isotipo** | Asterisco geométrico con triángulos radiantes (símbolo de "radar") | Elemento decorativo, slides de impacto |
| **Paleta** | Negro #000000 / Blanco #FFFFFF (alta contraste) | Fondos alternados B/W, sin púrpura |
| **Tipografía** | Sans-serif geométrica (Inter o similar) | Toda la presentación |

## Arquitectura de Diseño

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE DISEÑO PPTX REPINDEX                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SLIDE MASTERS                        ELEMENTOS GRÁFICOS                │
│  ──────────────                       ─────────────────                 │
│  ┌─────────────────┐                  ┌─────────────────┐              │
│  │ HERO_BLACK      │                  │ Isotipo blanco  │              │
│  │ Fondo negro     │                  │ grande (corner) │              │
│  │ Logo blanco     │                  └─────────────────┘              │
│  └─────────────────┘                  ┌─────────────────┐              │
│  ┌─────────────────┐                  │ Barras verticales│              │
│  │ CONTENT_WHITE   │                  │ negras (accent)  │              │
│  │ Fondo blanco    │                  └─────────────────┘              │
│  │ Logo negro      │                  ┌─────────────────┐              │
│  └─────────────────┘                  │ Líneas finas    │              │
│  ┌─────────────────┐                  │ de separación   │              │
│  │ SPLIT_BW        │                  └─────────────────┘              │
│  │ Mitad negro,    │                                                   │
│  │ mitad blanco    │                                                   │
│  └─────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Tipos de Slide Rediseñados para B/W

### 1. HERO (Portada)
- Fondo: **Negro 100%**
- Logo RepIndex.ai en blanco (esquina superior)
- Isotipo grande semitransparente como marca de agua
- Headline blanco, grande, centrado
- Subheadline gris claro

### 2. CONTENT (Contenido general)
- Fondo: **Blanco**
- Barra vertical negra en lateral izquierdo (accent)
- Logo negro en esquina superior derecha
- Texto negro sobre blanco
- Bullets con puntos negros sólidos

### 3. METRICS (KPIs)
- Fondo: **Blanco**
- Cajas de métricas con borde negro grueso
- Números grandes en negro
- Tendencias: ↑ verde / ↓ rojo (único color permitido)

### 4. COMPARISON (Empresa vs Competidor)
- Fondo: **Mitad negro, mitad blanco** (split vertical)
- Empresa analizada en lado negro (texto blanco)
- Competidor en lado blanco (texto negro)
- Crear contraste visual dramático

### 5. QUOTE (Cita impactante)
- Fondo: **Negro**
- Comillas gigantes en gris oscuro (watermark)
- Texto de cita en blanco
- Atribución en gris claro

### 6. QUESTIONS (Preguntas Rix)
- Fondo: **Blanco**
- Isotipo pequeño decorativo
- Preguntas numeradas con tipografía elegante
- "Por qué importa" en gris

### 7. CTA (Cierre)
- Fondo: **Negro**
- Isotipo grande centrado
- "www.repindex.ai" prominente
- Mensaje de acción

## Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/functions/design-pptx-slides/index.ts` | **CREAR** | Agente IA diseñador que transforma contenido en JSON estructurado |
| `src/lib/pptxDesigner.ts` | **CREAR** | Motor de renderizado con diseño B/W RepIndex |
| `src/lib/pptxTypes.ts` | **CREAR** | Tipos TypeScript para slides |
| `public/pptx/repindex-logo-white.png` | **COPIAR** | Logo blanco para fondos negros |
| `public/pptx/repindex-logo-black.png` | **COPIAR** | Logo negro para fondos blancos |
| `public/pptx/repindex-isotipo-white.png` | **COPIAR** | Isotipo blanco |
| `public/pptx/repindex-isotipo-black.png` | **COPIAR** | Isotipo negro |
| `src/components/admin/SalesIntelligencePanel.tsx` | **MODIFICAR** | Integrar nuevo generador PPTX |

## Paleta de Colores Exacta

```typescript
const REPINDEX_COLORS = {
  black: '000000',      // Fondo hero, textos principales
  white: 'FFFFFF',      // Fondos content, textos sobre negro
  grayDark: '1F2937',   // Textos secundarios sobre blanco
  grayMid: '6B7280',    // Atribuciones, labels
  grayLight: 'E5E7EB',  // Líneas, bordes sutiles
  grayBg: 'F9FAFB',     // Fondos de cajas en slides blancas
  green: '10B981',      // Solo para tendencias ↑
  red: 'EF4444',        // Solo para tendencias ↓
};
```

## Flujo de Generación

```text
1. Usuario hace clic en "Descargar PPTX"
2. Se recopila contenido valorado 4-5⭐
3. Se llama a edge function design-pptx-slides
4. El agente Gemini analiza contenido y decide layout
5. Devuelve JSON con estructura de slides
6. pptxDesigner.ts renderiza cada slide con diseño B/W
7. Se insertan logos/isotipos como imágenes base64
8. Se descarga archivo .pptx
```

## Detalles Técnicos

### Conversión de Logos a Base64
Los logos se incrustarán directamente en el código para evitar problemas de carga:

```typescript
// En pptxDesigner.ts
const LOGO_WHITE_BASE64 = 'data:image/png;base64,...'; // Logo blanco
const LOGO_BLACK_BASE64 = 'data:image/png;base64,...'; // Logo negro
const ISOTIPO_WHITE_BASE64 = 'data:image/png;base64,...';
const ISOTIPO_BLACK_BASE64 = 'data:image/png;base64,...';
```

### Tipografía
- pptxgenjs no puede cargar fuentes custom, pero Inter está disponible como fallback a Arial/Helvetica
- Se usará `fontFace: 'Inter'` que fallback a sans-serif del sistema

## Resultado Visual Esperado

Presentación ejecutiva con estética minimalista B/W tipo McKinsey/Bain, pero con el distintivo visual del isotipo de radar RepIndex como elemento diferenciador. Alta legibilidad, contraste máximo, diseño premium.

