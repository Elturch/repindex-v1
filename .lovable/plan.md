
# Plan: Corrección de Gráficos Inline para Cualquier Pregunta

## Diagnóstico del Problema

Se identificaron **3 problemas críticos** que causan que los gráficos no se generen:

### Problema 1: Mismatch entre Nombres de Sectores (CRÍTICO)

**Código actual (línea 429-444):**
```typescript
const SECTOR_KEYWORDS: Record<string, string[]> = {
  'Banca': ['banco', 'banca', 'bancario', ...],
  'Energía': ['energía', 'energético', ...],
  ...
};
```

**Valores reales en la BD (`sector_category`):**
- `'Banca y Servicios Financieros'`
- `'Energía y Gas'`
- `'Petróleo y Energía'`
- `'Telecomunicaciones y Tecnología'`
- `'Construcción e Infraestructuras'`
- etc.

**Impacto:** La función `buildSectorComparisonChartData` busca el sector `'Banca'` en el mapa, pero `sectorScores` tiene la clave `'Banca y Servicios Financieros'`. **Nunca coinciden**, por lo que `comparisonData` queda vacío.

### Problema 2: Frontend ignora evento SSE `start`

El parser SSE en `ChatContext.tsx` (líneas 589-607) solo maneja `chunk`, `done` y `error`. El evento `start` que envía `chartData` anticipadamente **es ignorado**.

Aunque el backend también envía `chartData` en el evento `done`, si la lógica del problema 1 falla, `chartData` será `null`.

### Problema 3: Sin fallback universal

No hay lógica de fallback para preguntas que:
- No mencionan empresas específicas
- No mencionan sectores reconocidos
- Son preguntas genéricas sobre "el mercado" o "las empresas"

---

## Solución Propuesta

### Fase 1: Alinear SECTOR_KEYWORDS con la BD

**Archivo:** `supabase/functions/chat-intelligence/index.ts` (líneas 429-444)

Cambiar el mapa para que las **keys** coincidan con los valores exactos de `sector_category` en la BD:

```typescript
const SECTOR_KEYWORDS: Record<string, string[]> = {
  'Banca y Servicios Financieros': ['banco', 'banca', 'bancario', 'bancos', 'banking', 'bank', 'financiero'],
  'Energía y Gas': ['energía', 'energético', 'energy', 'gas', 'utilities', 'eléctricas', 'electricas'],
  'Petróleo y Energía': ['petróleo', 'petroleo', 'oil', 'refinería'],
  'Telecomunicaciones': ['teleco', 'telecom', 'telecomunicaciones', 'telefonía', 'telefonia'],
  'Telecomunicaciones y Tecnología': ['tecnología', 'tecnologia', 'tech', 'software', 'it'],
  'Construcción e Infraestructuras': ['construcción', 'construccion', 'infraestructuras', 'inmobiliario'],
  'Alimentación': ['alimentación', 'alimentacion', 'comida', 'food'],
  'Hoteles y Turismo': ['turismo', 'hoteles', 'ocio', 'viajes', 'tourism'],
  'Seguros': ['seguros', 'aseguradoras', 'insurance'],
  'Salud y Farmacéutico': ['farmacia', 'salud', 'pharma', 'health', 'healthcare'],
  'Industria': ['industrial', 'industria', 'manufacturing', 'fabricación'],
  'Moda y Distribución': ['retail', 'moda', 'distribución', 'distribucion', 'comercio', 'tiendas'],
  'Transporte': ['transporte', 'logística', 'logistica', 'transport', 'aviación', 'aviacion'],
  'Automoción': ['automoción', 'automocion', 'coches', 'automotive', 'car'],
};
```

---

### Fase 2: Añadir Fallback Universal (Chart de Mercado)

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

Crear nueva función `buildMarketOverviewChart` que muestra el top 6 empresas del mercado por RIX:

```typescript
function buildMarketOverviewChart(
  allRixData: any[],
  numCompanies: number = 6
): ChartData | null {
  if (!allRixData || allRixData.length === 0) return null;
  
  // Get latest week data
  const sortedData = [...allRixData].sort((a, b) => 
    (b.batch_execution_date || '').localeCompare(a.batch_execution_date || '')
  );
  const latestWeek = sortedData[0]?.batch_execution_date?.split('T')[0];
  if (!latestWeek) return null;
  
  // Aggregate scores by company
  const companyScores = new Map<string, { name: string; scores: number[] }>();
  sortedData.forEach(run => {
    const weekDate = run.batch_execution_date?.split('T')[0];
    if (weekDate !== latestWeek) return;
    const ticker = run['05_ticker'];
    const score = run['09_rix_score'];
    const name = run['03_target_name'];
    if (!ticker || score == null) return;
    if (!companyScores.has(ticker)) {
      companyScores.set(ticker, { name: name || ticker, scores: [] });
    }
    companyScores.get(ticker)!.scores.push(score);
  });
  
  // Build comparison
  const comparisonData: ComparisonPoint[] = [];
  companyScores.forEach((data) => {
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    comparisonData.push({
      name: data.name.length > 12 ? data.name.substring(0, 12) + '...' : data.name,
      score: Math.round(avgScore * 10) / 10,
    });
  });
  
  comparisonData.sort((a, b) => b.score - a.score);
  
  return {
    type: 'comparison',
    data: comparisonData.slice(0, numCompanies),
    title: '🏆 Top RIX del Mercado',
    subtitle: `Semana del ${latestWeek}`,
  };
}
```

Modificar la lógica de selección de charts (líneas 5140-5180) para añadir Case 5:

```typescript
// Case 5: FALLBACK - Show market overview for any other question
if (!chartData && allRixData && allRixData.length > 0) {
  chartData = buildMarketOverviewChart(allRixData, 6);
  console.log(`${logPrefix} Built market overview fallback chart: ${chartData ? 'yes' : 'no'}`);
}
```

---

### Fase 3: Manejar evento SSE `start` en Frontend

**Archivo:** `src/contexts/ChatContext.tsx` (líneas 586-610)

Añadir handler para el evento `start` que capture `chartData` anticipadamente:

```typescript
let startMetadata: any = null;  // Nueva variable

// Dentro del loop de parsing:
if (parsed.type === 'start') {
  // Capture initial metadata including chart data
  startMetadata = parsed.metadata || {};
  console.log('[ChatContext] Received start event with chartData:', !!startMetadata.chartData);
} else if (parsed.type === 'chunk' && parsed.text) {
  // ... existing chunk handling
}
```

Y modificar la asignación final de metadata para fusionar `startMetadata` con `finalMetadata`:

```typescript
// Chart data: prefer startMetadata (sent early) over finalMetadata
chartData: startMetadata?.chartData || finalMetadata?.chartData,
```

---

### Fase 4: Mejorar Logging para Debugging

Añadir logs más detallados en el backend para entender por qué los charts fallan:

```typescript
console.log(`${logPrefix} Chart generation context:
  - detectedCompanies: ${detectedCompanies.length}
  - detectedSectors: ${JSON.stringify(detectedSectors)}
  - allRixData available: ${allRixData?.length || 0}
  - companiesCache available: ${companiesCache?.length || 0}
`);
```

---

## Archivos a Modificar

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `supabase/functions/chat-intelligence/index.ts` | Alinear SECTOR_KEYWORDS con BD | CRÍTICA |
| `supabase/functions/chat-intelligence/index.ts` | Añadir `buildMarketOverviewChart` fallback | ALTA |
| `supabase/functions/chat-intelligence/index.ts` | Mejorar logging de chart generation | MEDIA |
| `src/contexts/ChatContext.tsx` | Manejar evento SSE `start` | ALTA |

---

## Flujo Corregido

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LÓGICA DE SELECCIÓN DE CHART                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pregunta del usuario                                                       │
│         ↓                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Case 1: ¿Empresas detectadas?                                       │   │
│  │         → Trend chart de la primera empresa                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         ↓ NO                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Case 2: ¿2+ sectores detectados?                                    │   │
│  │         → Comparison chart entre sectores                           │   │
│  │         (usando keys alineadas con sector_category de BD)           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         ↓ NO                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Case 3: ¿1 sector detectado?                                        │   │
│  │         → Top companies de ese sector                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         ↓ NO                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Case 4: ¿Datos de mercado disponibles?                              │   │
│  │         → Comparison chart de todos los sectores                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         ↓ NO                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Case 5: FALLBACK UNIVERSAL                                          │   │
│  │         → Top 6 empresas del mercado por RIX                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Resultado: SIEMPRE hay un chart para cualquier pregunta                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Impacto Esperado

1. **Cualquier pregunta genera un gráfico** - fallback universal garantizado
2. **Sectores detectados correctamente** - keys alineadas con BD
3. **Chart visible inmediatamente** - evento `start` procesado
4. **Debugging mejorado** - logs detallados para identificar problemas futuros

---

## Riesgo

**Bajo:** Los cambios son aditivos y retrocompatibles. No afectan el pipeline de recogida de datos ni la lógica de generación de texto.
