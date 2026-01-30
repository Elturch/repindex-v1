

# Plan: Gráficos de Tendencia en Streaming + Fuentes Temporales Segmentadas

## Evaluación de Viabilidad: ✅ FACTIBLE (Dificultad Media-Alta)

### Análisis Técnico

**Lo que tenemos a favor:**
- Ya existen componentes de gráficos reutilizables (`MiniLineChart`, `MiniBarChart`, `ScoreBadge`, `ModelComparison` en `src/components/news/MiniCharts.tsx`)
- El sistema SSE ya envía metadatos estructurados en el evento `done`
- Los datos de tendencia ya se calculan en el backend (`period_from`, `period_to`, RIX por semana)
- El extractor de fuentes verificadas (`verifiedSourceExtractor.ts`) ya separa ChatGPT/Perplexity
- El sistema de streaming ya acumula contenido incrementalmente

**Complejidad principal:**
1. Los gráficos no pueden renderizarse "en streaming" (requieren datos completos)
2. Necesitamos enviar datos estructurados para gráficos ANTES o DESPUÉS del texto
3. La separación de fuentes por ventana temporal requiere análisis de fechas en el backend

---

## Arquitectura Propuesta

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO SSE MEJORADO                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. start     → metadata inicial + datos de gráfico (pre-calculados)        │
│  2. chunk     → texto streaming (igual que ahora)                           │
│  3. chunk     → texto streaming...                                          │
│  4. done      → metadata final + fuentes segmentadas + preguntas sugeridas  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fase 1: Gráficos de Tendencia en Respuestas

### 1.1 Ampliar Interfaz de Metadatos SSE

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

Añadir al evento `start`:

```typescript
interface SSEStartMetadata {
  // Existente
  language: string;
  languageName: string;
  depthLevel: string;
  detectedCompanies: string[];
  
  // NUEVO: Datos para gráficos
  chartData?: {
    type: 'trend' | 'comparison' | 'radar';
    data: TrendPoint[] | ComparisonPoint[] | RadarPoint[];
    title?: string;
    subtitle?: string;
  };
}

interface TrendPoint {
  week: string;       // "S1", "S2", etc.
  date: string;       // "2026-01-20"
  rixScore: number;
  marketAverage: number;
  delta?: number;     // vs semana anterior
}
```

### 1.2 Calcular Datos de Gráfico en Backend

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

En `handleStandardChat`, después de cargar datos RIX:

```typescript
// Calcular tendencia para empresa detectada
function buildTrendChartData(
  detectedCompanyData: any[],
  allRixData: any[],
  numWeeks: number = 4
): TrendPoint[] {
  // 1. Agrupar por semana
  // 2. Calcular media de mercado por semana
  // 3. Calcular RIX empresa por semana (promedio de 6 modelos)
  // 4. Retornar últimas N semanas ordenadas cronológicamente
}
```

### 1.3 Crear Componente de Gráfico Inline

**Archivo nuevo:** `src/components/chat/InlineChartRenderer.tsx`

```typescript
interface InlineChartRendererProps {
  chartData?: {
    type: 'trend' | 'comparison' | 'radar';
    data: any[];
    title?: string;
  };
  compact?: boolean;
}

export function InlineChartRenderer({ chartData, compact }: InlineChartRendererProps) {
  if (!chartData?.data?.length) return null;
  
  switch (chartData.type) {
    case 'trend':
      return (
        <Card className="my-4 p-4">
          <h4 className="text-sm font-semibold mb-2">{chartData.title || 'Evolución RIX'}</h4>
          <MiniLineChart 
            data={chartData.data.map(p => ({ name: p.week, value: p.rixScore }))} 
            width={compact ? 200 : 320}
            height={compact ? 80 : 120}
            showTrend
          />
        </Card>
      );
    case 'comparison':
      return <ModelComparison models={chartData.data} />;
    case 'radar':
      return <MiniRadarChart data={chartData.data} size={compact ? 160 : 220} />;
  }
}
```

### 1.4 Integrar en ChatMessages

**Archivo:** `src/components/chat/ChatMessages.tsx`

Renderizar gráfico ANTES del contenido markdown si hay `chartData`:

```tsx
{message.metadata?.chartData && !message.isStreaming && (
  <InlineChartRenderer 
    chartData={message.metadata.chartData} 
    compact={compact} 
  />
)}
<MarkdownMessage content={message.content} ... />
```

---

## Fase 2: Fuentes Segmentadas por Ventana Temporal

### 2.1 Ampliar Extractor de Fuentes

**Archivo:** `src/lib/verifiedSourceExtractor.ts`

```typescript
export interface TemporalSource extends VerifiedSource {
  temporalGroup: 'window' | 'reinforcement';
  mentionDate?: string;  // Fecha extraída del contexto si disponible
}

export interface SegmentedSources {
  windowSources: VerifiedSource[];      // Menciones en ventana (última semana)
  reinforcementSources: VerifiedSource[]; // Menciones históricas de refuerzo
  methodology: string;
}

export function segmentSourcesByWindow(
  sources: VerifiedSource[],
  windowStart: string,  // "2026-01-20"
  windowEnd: string     // "2026-01-27"
): SegmentedSources {
  // Analizar contexto de cada fuente para detectar fecha
  // Si la fecha está dentro de la ventana → windowSources
  // Si está fuera o es indeterminada → reinforcementSources
}
```

### 2.2 Modificar Backend para Segmentar Fuentes

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

Al extraer fuentes verificadas, añadir segmentación:

```typescript
// En el evento 'done' del SSE
const allSources = extractSourcesFromRixData(detectedCompanyFullData);
const periodFrom = detectedCompanyFullData[0]?.['06_period_from'];
const periodTo = detectedCompanyFullData[0]?.['07_period_to'];

const segmentedSources = segmentSourcesByWindow(allSources, periodFrom, periodTo);

// Incluir en metadata final
metadata: {
  ...existingMetadata,
  segmentedSources: {
    window: segmentedSources.windowSources,
    reinforcement: segmentedSources.reinforcementSources,
  }
}
```

### 2.3 Renderizar Fuentes Segmentadas en UI

**Archivo nuevo:** `src/components/chat/SegmentedSourcesFooter.tsx`

```typescript
interface SegmentedSourcesFooterProps {
  windowSources: VerifiedSource[];
  reinforcementSources: VerifiedSource[];
  periodLabel: string; // "20-27 enero 2026"
}

export function SegmentedSourcesFooter({ 
  windowSources, 
  reinforcementSources,
  periodLabel 
}: SegmentedSourcesFooterProps) {
  return (
    <Collapsible className="mt-4 border-t pt-3">
      <CollapsibleTrigger className="text-xs text-muted-foreground">
        📚 Ver fuentes citadas ({windowSources.length + reinforcementSources.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        {windowSources.length > 0 && (
          <div>
            <Badge variant="default" className="mb-2">
              🎯 Menciones en ventana ({periodLabel})
            </Badge>
            <ul className="text-xs space-y-1">
              {windowSources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" className="text-primary hover:underline">
                    {s.domain}
                  </a>
                  {s.title && <span className="text-muted-foreground"> — {s.title}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {reinforcementSources.length > 0 && (
          <div>
            <Badge variant="secondary" className="mb-2">
              📖 Menciones de refuerzo (históricas)
            </Badge>
            <ul className="text-xs space-y-1 opacity-80">
              {reinforcementSources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" className="text-primary hover:underline">
                    {s.domain}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

---

## Fase 3: Actualizar ChatContext para Nuevos Metadatos

**Archivo:** `src/contexts/ChatContext.tsx`

Ampliar interfaz `MessageMetadata`:

```typescript
export interface MessageMetadata {
  // Existentes...
  
  // NUEVO: Datos para gráficos inline
  chartData?: {
    type: 'trend' | 'comparison' | 'radar';
    data: any[];
    title?: string;
    subtitle?: string;
  };
  
  // NUEVO: Fuentes segmentadas
  segmentedSources?: {
    window: VerifiedSource[];
    reinforcement: VerifiedSource[];
    periodLabel?: string;
  };
}
```

---

## Fase 4: Tipos de Gráficos por Contexto

| Tipo de Pregunta | Gráfico Sugerido |
|------------------|------------------|
| "¿Cómo va Telefónica?" | `trend` (evolución 4 semanas) |
| "Compara Telefónica con Orange" | `comparison` (barras lado a lado) |
| "Analiza métricas de BBVA" | `radar` (8 dimensiones RIX) |
| "¿Quién lidera en banca?" | `comparison` (top 5 del sector) |
| Boletín ejecutivo | `trend` + `radar` + `comparison` |

---

## Archivos a Crear/Modificar

| Archivo | Acción | Complejidad |
|---------|--------|-------------|
| `src/components/chat/InlineChartRenderer.tsx` | CREAR | Baja |
| `src/components/chat/SegmentedSourcesFooter.tsx` | CREAR | Baja |
| `src/components/chat/ChatMessages.tsx` | Modificar (renderizar gráficos) | Media |
| `src/contexts/ChatContext.tsx` | Modificar (nuevos tipos) | Baja |
| `src/lib/verifiedSourceExtractor.ts` | Modificar (segmentación temporal) | Media |
| `supabase/functions/chat-intelligence/index.ts` | Modificar (calcular chartData, segmentar fuentes) | Alta |

---

## Consideraciones de Riesgo

### Bajo Riesgo
- Componentes de UI nuevos (no tocan lógica existente)
- Extensión de interfaces de metadatos (retrocompatible)

### Riesgo Medio
- Cálculo de chartData en backend (puede añadir latencia ~50-100ms)
- Segmentación de fuentes (depende de calidad de fechas extraídas)

### Mitigación
- Calcular chartData en paralelo con otras operaciones
- Cache de datos de tendencia por ticker
- Fallback: si no hay datos suficientes, no mostrar gráfico

---

## Impacto Visual Esperado

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  🤖 Respuesta del Agente Rix                                            │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐                │
│  │  📈 Evolución RIX - Telefónica (4 semanas)          │                │
│  │  ▲                                                  │                │
│  │  │    ╭──────╮                                      │                │
│  │  │   ╱        ╲     ╭───╮                           │                │
│  │  │  ╱          ╲   ╱     ╲                          │                │
│  │  │ ╱            ╰─╯       ──────                    │                │
│  │  └────────────────────────────────►                 │                │
│  │    S1    S2    S3    S4                             │                │
│  │                           ↗ +3.2 pts vs semana ant. │                │
│  └─────────────────────────────────────────────────────┘                │
│                                                                         │
│  ## Análisis de Telefónica                                              │
│                                                                         │
│  Telefónica cierra la semana con un RIX de 62 puntos, consolidando      │
│  una tendencia alcista que la sitúa 5 puntos por encima de la media...  │
│                                                                         │
│  [... resto del texto markdown ...]                                     │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  📚 Ver fuentes citadas (12)                                    [▼]    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 🎯 Menciones en ventana (20-27 ene 2026)                          │  │
│  │   • expansion.com — "Telefónica refuerza su apuesta por..."       │  │
│  │   • reuters.com — "Spanish telco posts quarterly results"         │  │
│  │   • bloomberg.com — "Telefonica CEO on AI investments"            │  │
│  │                                                                    │  │
│  │ 📖 Menciones de refuerzo (históricas)                             │  │
│  │   • elpais.com — "La transformación digital de Telefónica"        │  │
│  │   • cincodias.com — "Análisis del sector telecom español"         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Resumen Ejecutivo

**¿Es fácil?** 
- UI components: **Fácil** (reutilizamos MiniCharts existentes)
- Backend data preparation: **Medio** (requiere cálculos adicionales)
- Segmentación temporal de fuentes: **Medio-Alto** (depende de calidad de fechas)

**Estimación de esfuerzo:** 3-4 horas de desarrollo

**¿Hará los informes más contundentes?** 
**Sí, significativamente:**
- Gráfico de tendencia = impacto visual inmediato
- Fuentes segmentadas = credibilidad y trazabilidad
- Mantiene todo lo existente (footer metodológico, feedback, drumroll)

**Riesgo operacional:** Bajo (cambios aditivos, no destructivos)

