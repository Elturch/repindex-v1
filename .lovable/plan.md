
# Plan: Corregir Visualización de Datos en Evolución del Mercado

## Problema Identificado

Los gráficos muestran valores superiores a 100 porque usan **normalización Base 100** (índice relativo), donde:
- Primer valor de la serie = 100
- Cambios porcentuales se reflejan: si RIX sube 32%, el índice muestra 132

Esto confunde al usuario porque el RIX real siempre está entre 0-100 (en la práctica, 30-85).

### Datos reales (semana 25 ene 2026):
| Modelo | RIX Medio | RIX Mín | RIX Máx |
|--------|-----------|---------|---------|
| ChatGPT | 65 | 34 | 85 |
| Deepseek | 56 | 33 | 78 |
| Perplexity | 54 | 33 | 68 |

## Solución Propuesta

Cambiar de **Índice Base 100** (relativo) a **Puntuación RIX Absoluta** (0-100):

### Opción Recomendada: Mostrar Valores RIX Reales

| Aspecto | Antes (Índice) | Después (Absoluto) |
|---------|----------------|---------------------|
| Eje Y | 95-132 (variable) | 0-100 (fijo) |
| Mercado | 100 → 108 | 53 → 65 |
| Empresa | 100 → 125 | 48 → 72 |
| Etiqueta | "Índice Base 100" | "Puntuación RIX" |
| Interpretación | Confusa | Directa e intuitiva |

## Cambios Técnicos

### Cambio 1: Eliminar Normalización Base 100

**Archivo**: `src/pages/MarketEvolution.tsx`

Eliminar la función `normalizeToIndex` y simplificar `prepareChartData` para pasar valores RIX directos:

```typescript
// ANTES: Normalización relativa
const normalizeToIndex = (values: number[]): number[] => {
  const baseValue = values.find(v => Number.isFinite(v) && v !== 0);
  return values.map(v => (v / baseValue) * 100);
};

// DESPUÉS: Valores directos
const prepareChartData = (data, companies) => {
  return data.map(point => ({
    date: point.batchLabel,
    market: point.market, // Valor RIX directo (ej: 65)
    ...companyData        // Valores RIX directos
  }));
};
```

### Cambio 2: Actualizar ModelChart para Valores Absolutos

**Archivo**: `src/components/ModelChart.tsx`

1. Cambiar dataKeys de `market_index` → `market`, `ticker_rix_index` → `ticker_rix`
2. Fijar dominio del eje Y a [0, 100]
3. Actualizar etiqueta del eje Y: "Puntuación RIX"

```typescript
// ANTES
<YAxis 
  domain={indexDomain} // Dinámico: 95-132
  label={{ value: 'Índice Base 100' }}
/>
<Line dataKey="market_index" name="Media Mercado" />

// DESPUÉS
<YAxis 
  domain={[0, 100]} // Fijo: 0-100
  label={{ value: 'Puntuación RIX' }}
/>
<Line dataKey="market" name="Media Mercado (RIX)" />
```

### Cambio 3: Simplificar useTrendDataLight (opcional)

Los datos ya vienen con valores RIX absolutos, solo hay que asegurar que se pasan tal cual sin transformación.

## Resultado Visual

### Antes (confuso)
```
Eje Y: Índice Base 100
  132 ┤        ╭─
  116 ┤    ╭───╯
  100 ┼────╯
   84 ┤
```
Usuario piensa: "¿Cómo puede tener 132 si RIX máximo es 100?"

### Después (claro)
```
Eje Y: Puntuación RIX
  100 ┤
   75 ┤        ╭─
   65 ┤    ╭───╯
   53 ┼────╯
   25 ┤
    0 ┤
```
Usuario entiende: "El mercado pasó de RIX 53 a RIX 65 en 6 semanas"

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/MarketEvolution.tsx` | Eliminar `normalizeToIndex`, simplificar `prepareChartData` |
| `src/components/ModelChart.tsx` | Cambiar dataKeys, fijar dominio Y [0,100], actualizar etiqueta |

## Beneficios

1. **Claridad**: Los valores mostrados son puntuaciones RIX reales
2. **Consistencia**: Coincide con lo que el usuario ve en el Dashboard
3. **Interpretación directa**: No requiere entender normalización estadística
4. **Comparabilidad**: Se puede comparar entre modelos en escala común
