
# Fase 1: Desconectar rix_runs del chat-intelligence — Solo V2

## Estado actual del código (confirmado leyendo el fuente)

La función `fetchUnifiedRixData` (líneas 86–164) hace dos queries en paralelo:
1. `rix_runs` (legacy) — devuelve datos pero NO tiene `respuesta_bruto_grok` ni `respuesta_bruto_qwen`
2. `rix_runs_v2` — devuelve los 6 modelos con todas las columnas

Cuando ambas queries se combinan en el `dedupeMap`, los registros de `rix_runs` (que carecen de las columnas nuevas) contaminan el resultado. Aunque V2 "gana" en la deduplicación para las filas que coinciden en clave `ticker_modelo_periodoFrom_periodoTo`, si las claves no coinciden exactamente (distinta `batch_execution_date` entre las dos tablas), los registros legacy permanecen en el resultado con `respuesta_bruto_grok = null`.

**Resultado:** El sistema mezcla registros de ambas fuentes, y los modelos clásicos (ChatGPT, Gemini, Perplexity, DeepSeek) aparecen sin cifras porque se carga su versión legacy sin los campos de categorías correctas.

---

## Cambio único a aplicar

### Refactor de `fetchUnifiedRixData` (líneas 86–164)

Eliminar completamente la query a `rix_runs` y toda la lógica de deduplicación. La función queda limpia, simple y sin riesgo de contaminación:

**Antes (80 líneas de lógica de combinación y deduplicación):**
```typescript
async function fetchUnifiedRixData(options) {
  // Dos queries paralelas
  let queryRix = supabaseClient.from('rix_runs').select(columns)...
  let queryV2 = supabaseClient.from('rix_runs_v2').select(columns)...
  // Deduplicación compleja con dedupeMap
  // 50+ líneas de lógica de combinación
}
```

**Después (20 líneas, solo V2):**
```typescript
async function fetchUnifiedRixData(options) {
  // Solo rix_runs_v2 — fuente única de verdad
  let query = supabaseClient
    .from('rix_runs_v2')
    .select(columns)
    .or('analysis_completed_at.not.is.null,09_rix_score.not.is.null')
    .order('batch_execution_date', { ascending: false })
    .order('"05_ticker"', { ascending: true });

  // Filtros de ticker
  if (tickerFilter) { ... }

  // Límite
  if (offset > 0) {
    query = query.range(offset, offset + limit - 1);
  } else {
    query = query.limit(Math.max(limit, 2500));
  }

  const { data, error } = await query;
  if (error) console.error(`${logPrefix} Error:`, error.message);
  console.log(`${logPrefix} V2-only: ${data?.length || 0} records`);
  return data || [];
}
```

---

## Qué se elimina

| Elemento eliminado | Motivo |
|---|---|
| `queryRix` (query a `rix_runs`) | No tiene `respuesta_bruto_grok` ni `respuesta_bruto_qwen` — contamina resultados |
| `dedupeMap` (Map de deduplicación) | Innecesario cuando hay una sola fuente |
| `rixData.forEach(...)` (primer pase) | Eliminado con la query legacy |
| `v2Data.forEach(...)` (segundo pase) | Simplificado: los datos ya vienen directos de V2 |
| `v2Count` y `analyzedCount` counters | Ya no son relevantes sin dos fuentes |

---

## Qué NO cambia

| Elemento | Estado |
|---|---|
| `fullDataColumns` (líneas 4009–4044) | Sin cambios — ya incluye `respuesta_bruto_grok` y `respuesta_bruto_qwen` |
| `limit: 120` (línea 4051) | Sin cambios — ya está correcto |
| Filtro por `latestDate` (líneas 4457–4465) | Sin cambios — ya usa `batch_execution_date` |
| `modelResponseMap` con Grok y Qwen (líneas 4489–4498) | Sin cambios — ya está correcto |
| `selectCanonicalPeriod` (líneas 4529+) | Sin cambios — lógica de domingo correcta |
| Dashboard, hooks frontend, otras edge functions | Intactos — esta función es exclusiva de `chat-intelligence` |
| La tabla `rix_runs` en la base de datos | NO se toca — sigue existiendo para la Fase 2 |

---

## Riesgo

**Muy bajo.** `rix_runs_v2` ya tiene todos los datos que el chat-intelligence necesita para el snapshot más reciente. El único sacrificio es el histórico de oct-2025 a dic-2025, que el chat de todas formas no necesita para los informes periciales (siempre piden "la última semana").

---

## Archivo a modificar

| Archivo | Líneas | Cambio |
|---|---|---|
| `supabase/functions/chat-intelligence/index.ts` | 86–164 | Reemplazar función `fetchUnifiedRixData` completa |

## Resultado esperado

- Informe pericial de AIRTIFICIAL: **6 modelos con cifras completas**
- Sin mezcla de tablas, sin deduplicación, sin contaminación de registros legacy
- Código más limpio, más rápido, más fácil de mantener
