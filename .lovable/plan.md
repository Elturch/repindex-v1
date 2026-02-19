
# Diagnóstico definitivo: por qué solo aparece Qwen en el informe pericial de AIRTIFICIAL

## Lo que confirman los datos

La base de datos tiene los 6 modelos perfectamente para AIRTIFICIAL (ticker `ART`) en el snapshot del 15 de febrero (domingo canónico):
- ChatGPT: RIX 51
- Perplexity: RIX 47
- Google Gemini: RIX 66
- Deepseek: RIX 56
- Grok: RIX 43
- **Qwen: RIX 75**

Todos están en `rix_runs_v2`, no en `rix_runs` (legacy). Los datos son correctos. El fallo es 100% del código.

## Los dos bugs exactos

### Bug 1 (CRÍTICO) — Faltan columnas de Grok y Qwen en la carga de datos de empresa

En la línea 4009-4042, `fullDataColumns` (las columnas que se piden al cargar los datos completos de empresa) incluye los textos brutos de ChatGPT, Perplexity, Gemini y DeepSeek, **pero NO incluye `respuesta_bruto_grok` ni `respuesta_bruto_qwen`**:

```typescript
// Lo que hay ahora (incompleto):
"20_res_gpt_bruto",       // ChatGPT ✅
"21_res_perplex_bruto",   // Perplexity ✅  
"22_res_gemini_bruto",    // Google Gemini ✅
"23_res_deepseek_bruto",  // DeepSeek ✅
// respuesta_bruto_grok   ← FALTA ❌
// respuesta_bruto_qwen   ← FALTA ❌
```

Sin estas columnas, cuando el código llega a la sección 6.1 e intenta mostrar los textos de Grok y Qwen, los campos son `null` → el informe no incluye los análisis de Grok ni Qwen.

### Bug 2 (SECUNDARIO) — El `limit: 48` puede dejar fuera modelos del snapshot más reciente

La llamada de empresa usa `limit: 48` (línea 4049), calculado como "6 modelos × 8 semanas". El problema: `fetchUnifiedRixData` consulta `rix_runs` (legacy) Y `rix_runs_v2` por separado antes de deduplicar. Si `rix_runs_v2` para `ART` devuelve 18 registros (3 semanas × 6 modelos) y `rix_runs` devuelve otros 30, después de deduplicar pueden quedar más de 48 registros únicos en total. El `limit: 48` se aplica **antes** de la deduplicación en cada tabla individualmente, lo que puede truncar los registros del snapshot más reciente.

Solución: aumentar el limit a `120` (6 modelos × 20 semanas = margen generoso) para NUNCA perder datos del snapshot actual.

### Bug 3 (SECUNDARIO) — `records.slice(0, 6)` puede omitir modelos

En la línea 4460, la tabla de scores muestra `records.slice(0, 6)`. Los records de empresa vienen ordenados por `batch_execution_date DESC`. Si hay 48 registros (8 semanas × 6 modelos), los primeros 6 son las 6 IAs de la semana más reciente — eso está bien. Pero la sección de textos brutos (línea 4467) también usa `records.slice(0, 6)`. Si el snapshot más reciente tiene solo 5 registros cargados (porque Grok o Qwen quedaron truncados), el informe pericial mostrará incompleto.

## La corrección

### Cambio 1 — Añadir columnas de Grok y Qwen a `fullDataColumns` (línea 4040)

```typescript
// Añadir estas dos líneas al bloque fullDataColumns:
"respuesta_bruto_grok",
"respuesta_bruto_qwen",
```

### Cambio 2 — Aumentar el limit de carga de empresa (línea 4049)

```typescript
// De:
limit: 48, // 6 models × 8 weeks

// A:
limit: 120, // 6 models × 20 weeks - margen generoso para no truncar
```

### Cambio 3 — Filtrar el slice(0,6) para que muestre SOLO el snapshot canónico actual

En lugar de `records.slice(0, 6)` (que asume que los primeros 6 son siempre los del snapshot más reciente), filtrar explícitamente los records del canonicalDate antes de mostrar los scores y textos:

```typescript
// En vez de:
records.slice(0, 6).forEach(r => { ... })

// Usar:
const latestRecords = records
  .filter(r => r.batch_execution_date?.toString().split('T')[0] === canonicalDate)
  .sort((a, b) => a["02_model_name"].localeCompare(b["02_model_name"]));
const recordsToShow = latestRecords.length >= 1 ? latestRecords : records.slice(0, 6);
recordsToShow.forEach(r => { ... })
```

Esto garantiza que el informe pericial siempre muestre los 6 modelos del snapshot actual, nunca una mezcla de semanas distintas.

## Archivos a modificar

| Archivo | Líneas | Cambio |
|---|---|---|
| `supabase/functions/chat-intelligence/index.ts` | 4040-4041 (después de `44_cxm_categoria`) | Añadir `respuesta_bruto_grok` y `respuesta_bruto_qwen` a `fullDataColumns` |
| `supabase/functions/chat-intelligence/index.ts` | 4049 | Cambiar `limit: 48` a `limit: 120` |
| `supabase/functions/chat-intelligence/index.ts` | 4460 y 4467 | Cambiar `records.slice(0, 6)` por filtro explícito del canonicalDate |

## Lo que NO cambia

- La lógica de `selectCanonicalPeriod` (correcta).
- El system prompt con las reglas de snapshot dominical (correcto).
- El `fetchUnifiedRixData` (correcto).
- El streaming SSE y todos los roles (correctos).

## Resultado esperado

Tras estos tres cambios, el informe pericial de AIRTIFICIAL mostrará:
- Tabla con los 6 modelos y todos sus sub-métricas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM)
- Texto original (extracto) de cada uno de los 6 modelos incluyendo Grok y Qwen
- Referencia al snapshot del domingo 15 de febrero de 2026
