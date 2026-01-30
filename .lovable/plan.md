
# Plan: Bibliografía Dividida — Fuentes de Ventana vs Fuentes de Refuerzo

## Objetivo

Modificar el sistema de extracción de fuentes verificadas para clasificar las citas en dos categorías:

1. **Menciones de Ventana Temporal** — Fuentes que corresponden al período semanal analizado (ej: 18-25 enero 2026)
2. **Menciones de Refuerzo** — Fuentes históricas o contextuales que las IAs usan para enriquecer el análisis

Esta clasificación aumenta la transparencia metodológica y permite al lector distinguir entre información actual y contexto histórico.

---

## Análisis del Sistema Actual

### Flujo de Datos

```text
rix_runs (BD)
    ├── 20_res_gpt_bruto     → URLs con utm_source=openai
    ├── 21_res_perplex_bruto → JSON estructurado con citaciones
    ├── 06_period_from       → Inicio de ventana (ej: 2026-01-18)
    └── 07_period_to         → Fin de ventana (ej: 2026-01-25)
           │
           ▼
verifiedSourceExtractor.ts
    ├── extractChatGptSources()   → Extrae URLs verificadas
    ├── extractPerplexitySources() → Extrae citaciones [n]
    └── generateBibliographyHtml() → Genera sección de bibliografía
           │
           ▼
ChatContext.tsx (downloadAsHtml)
    └── Inserta bibliografía en el informe PDF/HTML
```

### Problema Detectado

El sistema actual:
- Extrae todas las fuentes sin clasificarlas temporalmente
- No aprovecha los campos `06_period_from` / `07_period_to` para contextualizar
- No diferencia entre fuentes contemporáneas y fuentes históricas

---

## Solución Propuesta

### Fase 1: Extender Interfaz de Fuentes Verificadas

**Archivo:** `src/lib/verifiedSourceExtractor.ts`

Añadir clasificación temporal a la interfaz:

```typescript
export interface VerifiedSource {
  url: string;
  domain: string;
  title?: string;
  sourceModel: 'ChatGPT' | 'Perplexity';
  citationNumber?: number;
  // NUEVOS CAMPOS:
  temporalCategory: 'window' | 'reinforcement' | 'unknown';
  extractedDate?: string; // Fecha detectada en el contexto
  contextSnippet?: string; // Fragmento donde aparece la mención
}
```

### Fase 2: Implementar Clasificación Temporal

**Estrategia de clasificación:**

1. **Perplexity (JSON estructurado):**
   - Si la cita está en `periodo_busqueda_especifico` → `window`
   - Si está en `informacion_general_relevante` / `contexto_reputacional_historico` → `reinforcement`

2. **ChatGPT (texto con URLs):**
   - Extraer la fecha más cercana a cada URL en el texto (regex: fechas en español)
   - Si la fecha está dentro del rango `period_from` - `period_to` → `window`
   - Si es anterior → `reinforcement`

**Nuevas funciones:**

```typescript
// Clasificador de fechas en español
function extractNearestDate(text: string, urlPosition: number): Date | null;

// Clasificador temporal
function classifyTemporally(
  source: VerifiedSource,
  periodFrom: Date,
  periodTo: Date
): 'window' | 'reinforcement' | 'unknown';

// Extractor mejorado con clasificación
export function extractVerifiedSourcesWithTemporal(
  chatGptRaw: string | null,
  perplexityRaw: string | null,
  periodFrom: string | null,
  periodTo: string | null
): VerifiedSource[];
```

### Fase 3: Actualizar Generador de Bibliografía HTML

**Archivo:** `src/lib/verifiedSourceExtractor.ts`

Modificar `generateBibliographyHtml()` para mostrar dos secciones:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│           📚 ANEXO: REFERENCIAS CITADAS POR LAS IAS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ▶ MENCIONES DE VENTANA (18-25 ene 2026)                                   │
│    Fuentes contemporáneas al período analizado                              │
│    ──────────────────────────────────────────────────────────────────────── │
│    [G] europapress.es — "Fluidra anuncia dividendo..." (22 ene 2026)       │
│    [P] expansion.com — "Resultados trimestrales..." (20 ene 2026)          │
│                                                                             │
│  ▶ MENCIONES DE REFUERZO                                                   │
│    Fuentes históricas o contextuales usadas por las IAs                    │
│    ──────────────────────────────────────────────────────────────────────── │
│    [G] infobae.com — "Fluidra gana 48M hasta marzo..." (may 2025)          │
│    [P] wikipedia.org — Perfil corporativo de Fluidra                       │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  📋 Nota metodológica:                                                      │
│  Solo se incluyen fuentes verificables de ChatGPT (utm_source=openai) y    │
│  Perplexity (citaciones estructuradas). Fuentes de otros modelos no se     │
│  listan por no poder verificar su procedencia documental.                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fase 4: Propagar Período Temporal al Contexto

**Archivo:** `src/contexts/ChatContext.tsx`

Modificar para pasar los períodos temporales a la función de extracción:

```typescript
// En la función que genera bibliografía
const sources = extractVerifiedSourcesWithTemporal(
  msg.metadata?.rawGptResponse,
  msg.metadata?.rawPerplexityResponse,
  msg.metadata?.periodFrom,
  msg.metadata?.periodTo
);
```

### Fase 5: Actualizar Edge Function (Opcional)

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

Si el metadata de los mensajes no incluye actualmente los campos `periodFrom`/`periodTo`, añadirlos al extraer datos de `rix_runs`:

```typescript
verifiedSources: extractedSources,
periodFrom: rixRun['06_period_from'],
periodTo: rixRun['07_period_to'],
```

---

## Archivos a Modificar

| Archivo | Cambios | Prioridad |
|---------|---------|-----------|
| `src/lib/verifiedSourceExtractor.ts` | Extender interfaz, añadir clasificación temporal, modificar HTML | Alta |
| `src/contexts/ChatContext.tsx` | Pasar períodos a extractor (si aplica) | Alta |
| `supabase/functions/chat-intelligence/index.ts` | Añadir `periodFrom`/`periodTo` al metadata | Media |

---

## Reglas de Clasificación Temporal

### Para Perplexity (JSON estructurado)

```typescript
const perplexityClassification = {
  // Secciones que indican ventana temporal
  'periodo_busqueda_especifico': 'window',
  'menciones_recientes': 'window',
  'noticias_semana': 'window',
  
  // Secciones que indican refuerzo
  'informacion_general_relevante': 'reinforcement',
  'contexto_reputacional_historico': 'reinforcement',
  'perfil_corporativo': 'reinforcement',
  'datos_basicos': 'reinforcement',
};
```

### Para ChatGPT (texto con fechas)

```typescript
// Patrones de fecha en español
const spanishDatePatterns = [
  /(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de (\d{4})/gi,
  /(enero|febrero|...) de (\d{4})/gi,
  /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,
];

// Clasificación
if (extractedDate >= periodFrom && extractedDate <= periodTo) {
  return 'window';
} else if (extractedDate < periodFrom) {
  return 'reinforcement';
} else {
  return 'unknown';
}
```

---

## Diseño Visual de la Bibliografía Dividida

### Sección "Menciones de Ventana"

- Fondo: `#f0fdf4` (verde muy claro)
- Borde: `#22c55e` (verde)
- Icono: 🗓️ Calendario
- Encabezado: "Menciones de Ventana (DD-DD mes AAAA)"

### Sección "Menciones de Refuerzo"

- Fondo: `#fef9c3` (amarillo muy claro)
- Borde: `#eab308` (amarillo)
- Icono: 📚 Libros
- Encabezado: "Menciones de Refuerzo"

### Disclaimer Metodológico

Texto actualizado:

> "**Política de Cero Invención**: Esta bibliografía incluye únicamente fuentes con URLs verificables provenientes de modelos con búsqueda web activa (ChatGPT, Perplexity). Las **Menciones de Ventana** corresponden al período analizado; las **Menciones de Refuerzo** son citas históricas o contextuales. Las afirmaciones de otros modelos (Gemini, DeepSeek, Grok, Qwen) no se incluyen por no poder verificar su procedencia documental."

---

## Beneficios

1. **Transparencia metodológica**: El lector sabe qué información es contemporánea vs histórica
2. **Credibilidad aumentada**: Demuestra rigor en la clasificación de fuentes
3. **Valor añadido para clientes**: Pueden citar fuentes recientes con confianza
4. **Defensa ante auditoría**: Evidencia de que el sistema distingue entre tipos de menciones
5. **Consistencia con memoria**: Implementa el concepto documentado en `chat-intelligence-verified-bibliography`
