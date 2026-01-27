
# Plan: Corregir Rankings de Movers Duplicados

## Problema Identificado

La lógica actual (líneas 152-168) calcula cambios por **ticker + modelo de IA**:

```typescript
const prev = previousData.find(
  p => p.ticker === curr.ticker && p.model_name === curr.model_name
);
```

Esto genera múltiples entradas por empresa. Si Acciona tiene:
- ChatGPT: +5 puntos → aparece en Movers UP
- Gemini: -3 puntos → aparece en Movers DOWN

## Solución

Agregar los cambios de puntuación **por empresa** (ticker), calculando el promedio de variaciones de todos los modelos de IA.

## Cambio Requerido

**Archivo**: `src/hooks/useLandingTopFives.ts` (líneas 150-179)

**Lógica actual:**
```typescript
const changes = currentData
  .map(curr => {
    const prev = previousData.find(
      p => p.ticker === curr.ticker && p.model_name === curr.model_name
    );
    // ... retorna entrada por cada ticker+modelo
  })
```

**Nueva lógica:**
```typescript
// 1. Calcular cambios por ticker+modelo
const rawChanges = currentData.map(curr => {
  const prev = previousData.find(
    p => p.ticker === curr.ticker && p.model_name === curr.model_name
  );
  if (!prev) return null;
  return {
    ticker: curr.ticker,
    empresa: curr.company_name,
    ibex_family_code: curr.ibex_family_code,
    change: curr.rix_score - prev.rix_score,
    currentScore: curr.rix_score
  };
}).filter(Boolean);

// 2. Agregar por ticker (promedio de cambios de todos los modelos)
const tickerMap = new Map();
rawChanges.forEach(item => {
  if (!tickerMap.has(item.ticker)) {
    tickerMap.set(item.ticker, {
      ticker: item.ticker,
      empresa: item.empresa,
      ibex_family_code: item.ibex_family_code,
      changes: [],
      scores: []
    });
  }
  tickerMap.get(item.ticker).changes.push(item.change);
  tickerMap.get(item.ticker).scores.push(item.currentScore);
});

// 3. Calcular promedio y crear lista final
const aggregatedChanges = Array.from(tickerMap.values()).map(item => ({
  empresa: item.empresa,
  ticker: item.ticker,
  rix: Math.round(item.scores.reduce((a, b) => a + b, 0) / item.scores.length),
  ai: "Promedio", // Indica que es un agregado
  ibex_family_code: item.ibex_family_code,
  change: item.changes.reduce((a, b) => a + b, 0) / item.changes.length
}));

// 4. Separar IBEX y non-IBEX, ordenar por cambio
const ibexChanges = aggregatedChanges.filter(c => c.ibex_family_code === "IBEX-35");
ibexMoversUp = ibexChanges.sort((a, b) => b.change - a.change).slice(0, 5);
ibexMoversDown = ibexChanges.sort((a, b) => a.change - b.change).slice(0, 5);

const nonIbexChanges = aggregatedChanges.filter(c => c.ibex_family_code !== "IBEX-35");
topMoversUp = nonIbexChanges.sort((a, b) => b.change - a.change).slice(0, 5);
topMoversDown = nonIbexChanges.sort((a, b) => a.change - b.change).slice(0, 5);
```

## Resultado Esperado

| Antes | Después |
|-------|---------|
| Acciona en Movers UP (ChatGPT +5) | Acciona aparece **solo una vez** |
| Acciona en Movers DOWN (Gemini -3) | Ubicación basada en promedio: (+5 + -3) / 2 = +1 → Movers UP |

Cada empresa aparecerá en **un solo ranking** basándose en su rendimiento promedio consolidado de todos los modelos de IA.
