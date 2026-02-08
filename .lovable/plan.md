
# Corrección: Límite de 1000 Filas en Dashboard de Sweep

## Cambio a Implementar

Añadir `.range(0, 1499)` a la query de `rix_runs_v2` en el hook `useUnifiedSweepMetrics.ts` para superar el límite default de PostgREST.

## Archivo a Modificar

**`src/hooks/useUnifiedSweepMetrics.ts`** (líneas 248-253)

```typescript
// ANTES:
supabase
  .from('rix_runs_v2')
  .select('05_ticker, 02_model_name, 09_rix_score, search_completed_at, analysis_completed_at')
  .eq('06_period_from', weekStart),

// DESPUÉS:
supabase
  .from('rix_runs_v2')
  .select('05_ticker, 02_model_name, 09_rix_score, search_completed_at, analysis_completed_at')
  .eq('06_period_from', weekStart)
  .range(0, 1499),
```

## Resultado Esperado

| Modelo | Antes (truncado) | Después (correcto) |
|--------|------------------|---------------------|
| ChatGPT | 167/167 | 178/178 |
| Deepseek | 167/167 | 178/178 |
| Gemini | 167/167 | 178/178 |
| Grok | 167/167 | 178/178 |
| Perplexity | 166/166 | 178/178 |
| Qwen | 166/166 | 178/178 |

## Impacto

- **Riesgo**: Ninguno - cambio de solo lectura para visualización
- **Procesos afectados**: Solo los dashboards de administración
- **Cron/Edge Functions**: No afectados
