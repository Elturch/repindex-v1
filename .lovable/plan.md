
# Corrección: Paginación para Superar Límite de 1000 Filas de PostgREST

## Problema Identificado

El cambio anterior (`.range(0, 1499)`) no funcionó porque **PostgREST tiene un límite máximo de servidor** de 1000 filas por request. Aunque el cliente solicita 1500 filas, el servidor solo devuelve 1000:

```text
Request:  &offset=0&limit=1500
Response: content-range: 0-999/*   ← TRUNCADO A 1000
```

Esto explica por qué el dashboard sigue mostrando 1000/1000 en vez de 1068/1068.

## Solución: Paginación en Dos Requests

Implementar paginación que haga múltiples requests y combine los resultados:

```text
ANTES (1 request truncado):
┌─────────────────────────────────────┐
│ supabase.from('rix_runs_v2')        │
│   .range(0, 1499)                   │ → 1000 filas (límite servidor)
└─────────────────────────────────────┘

DESPUÉS (2 requests paginados):
┌─────────────────────────────────────┐
│ Request 1: .range(0, 999)           │ → 1000 filas
├─────────────────────────────────────┤
│ Request 2: .range(1000, 1499)       │ → 68 filas (resto)
└─────────────────────────────────────┘
                 ↓
        Combinar: 1068 filas totales
```

## Cambios Técnicos

### Archivo: `src/hooks/useUnifiedSweepMetrics.ts`

Reemplazar la query única por paginación paralela (alrededor de líneas 248-255):

**Código actual (no funciona)**:
```typescript
supabase
  .from('rix_runs_v2')
  .select('05_ticker, 02_model_name, 09_rix_score, search_completed_at, analysis_completed_at')
  .eq('06_period_from', weekStart)
  .range(0, 1499),
```

**Código nuevo (paginación paralela)**:
```typescript
// Primera página: filas 0-999
const page1Promise = supabase
  .from('rix_runs_v2')
  .select('05_ticker, 02_model_name, 09_rix_score, search_completed_at, analysis_completed_at')
  .eq('06_period_from', weekStart)
  .range(0, 999);

// Segunda página: filas 1000-1499 (si hay más de 1000)
const page2Promise = supabase
  .from('rix_runs_v2')
  .select('05_ticker, 02_model_name, 09_rix_score, search_completed_at, analysis_completed_at')
  .eq('06_period_from', weekStart)
  .range(1000, 1499);

// Ejecutar en paralelo
const [page1Result, page2Result] = await Promise.all([page1Promise, page2Promise]);

// Combinar resultados
const records = [
  ...(page1Result.data || []),
  ...(page2Result.data || [])
];
```

## Consideraciones

| Aspecto | Valor |
|---------|-------|
| Requests adicionales | +1 (de 1 a 2 queries paralelas) |
| Latencia adicional | Mínima (paralelo) |
| Cobertura máxima | 1500 registros (250 empresas × 6 modelos) |
| Escalabilidad | Si crece a >250 empresas, añadir page3 |

## Resultado Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Registros obtenidos | 1000 | 1068 |
| ChatGPT | 167/167 | 178/178 |
| Deepseek | 167/167 | 178/178 |
| Gemini | 167/167 | 178/178 |
| Grok | 167/167 | 178/178 |
| Perplexity | 166/166 | 178/178 |
| Qwen | 166/166 | 178/178 |

## Archivo a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useUnifiedSweepMetrics.ts` | Implementar paginación paralela para superar límite de 1000 filas del servidor |
