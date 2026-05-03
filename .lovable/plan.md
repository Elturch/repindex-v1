## Orden de ejecución (un único deploy)
Capa 3 → Capa 1 → smoke W17 (Paso 1) → reparación W17 (Paso 2) → Capa 2 → P1 → P2 (constraint hoy, purga diferida).

---

## Capa 3 — Contención inmediata (gate de auto_repair)

**Archivo:** `supabase/functions/rix-quality-watchdog/index.ts`
**Líneas:** 241, 257–266

```ts
// L241 (sustituir)
const autoRepair = body.auto_repair === true && body.force === true

// L258 (log adicional)
if (autoRepair && result.invalidFound > 0) {
  console.log(`[sanitize] Auto-repair gated; invalidFound=${result.invalidFound}, force=${body.force === true}`)
  ...
}
```

Compatible con el Paso 2 de la verificación W17 (que pasará `auto_repair:true, force:true` explícito).

Adicional en `rix-batch-orchestrator/index.ts` (búsqueda `action: 'sanitize'`): si la llamada CRON pasa `auto_repair:true`, eliminarlo. El CRON sólo debe sanitizar, no auto-reparar (la reparación se dispara manual o desde otro trigger explícito).

---

## Capa 1 — Fix root cause (validar la columna correcta por fila)

**Archivo:** `supabase/functions/rix-quality-watchdog/index.ts`
**Líneas:** 333–409 (función `sanitizeResponses`)

1. **L335:** añadir `"02_model_name"` al SELECT.
2. **L345:** añadir `.range(0, 9999)` (default 1.000 trunca el sweep de 1.050).
3. **L371–408:** sustituir el doble bucle por validación única por fila:

```ts
for (const record of records) {
  const ticker = record['05_ticker']
  const rawModelName = record['02_model_name']
  if (!ticker || !rawModelName) continue
  const model = normalizeModelName(rawModelName)
  const column = MODEL_RAW_COLUMNS[model]
  if (!column) continue

  scanned++
  const validation = validateResponse(record[column])
  if (validation.isValid) { byModel[model].valid++; continue }

  byModel[model].invalid++
  const errorType = validation.errorType || 'unknown'
  byModel[model].byErrorType[errorType] = (byModel[model].byErrorType[errorType] || 0) + 1
  details.push({ ticker, model, errorType, reason: validation.reason || 'Unknown' })
  reportsToInsert.push({
    sweep_id: sweepId, week_start: weekStart, ticker, model_name: model,
    status: 'invalid_response', error_type: errorType,
    original_error: validation.reason, repair_attempts: 0,
  })
}
```

Por construcción: cada fila V2 produce ≤1 report → imposible duplicar `(sweep_id, ticker, model_name)`.

---

## Capa 2 — Defensa en profundidad (dedupe en memoria)

**Archivo:** `supabase/functions/rix-quality-watchdog/index.ts`
**Líneas:** 411–428 (sanitize) y 589–606 (analyze)

```ts
function dedupeReports(reports: any[]): { unique: any[]; deduped: number } {
  const seen = new Set<string>()
  const unique: any[] = []
  for (const r of reports) {
    const key = `${r.sweep_id}|${r.ticker}|${r.model_name}`
    if (seen.has(key)) continue
    seen.add(key); unique.push(r)
  }
  return { unique, deduped: reports.length - unique.length }
}

// En cada upsert:
const { unique, deduped } = dedupeReports(reportsToInsert)
if (deduped > 0) console.warn(`[sanitize] Deduped ${deduped} duplicate reports`)
const { error: insertError } = await supabase
  .from('data_quality_reports')
  .upsert(unique, { onConflict: 'sweep_id,ticker,model_name', ignoreDuplicates: false })
if (!insertError) registered = unique.length
```

---

## P1 — repair_analysis IDLE_TIMEOUT 150s vs Qwen ~195s

**Archivos:** `supabase/functions/rix-batch-orchestrator/index.ts` L2562–2570 + `supabase/functions/rix-analyze-v2/index.ts` (función `reprocess_pending`).

Plataforma: el `IDLE_TIMEOUT` 150s del runtime Edge **no es configurable por código**. Solución: aislar Qwen en su propio trigger con `batch_size=1` para que su única ejecución (~195s) entre en el margen, y separarlo del resto (5 modelos a `batch_size=2` ≤120s).

`rix-batch-orchestrator` L2562:
```ts
const baseParams = { sweep_id: sweepId }
await supabase.from('cron_triggers').insert([
  { action: 'repair_analysis', params: { ...baseParams, batch_size: 2, exclude_models: ['Qwen'] }, status: 'pending' },
  { action: 'repair_analysis', params: { ...baseParams, batch_size: 1, only_models: ['Qwen'] }, status: 'pending' },
])
```

`rix-analyze-v2` `reprocess_pending`: añadir lectura `params.only_models` / `params.exclude_models` y aplicar al WHERE sobre `02_model_name`. Verificaré en el deploy si la query ya soporta el filtro; si no, añado el `.in()` / `.not('in', …)` correspondiente.

**Commit msg documentado:** _"P1: aislamos Qwen (~195s) en su propio repair_analysis trigger con batch_size=1; los otros 5 modelos siguen en batch_size=2. IDLE_TIMEOUT 150s del runtime Edge Supabase no es configurable; este aislamiento es la solución correcta."_

No se modifica timeout de los otros 5 modelos.

---

## P2 — UNIQUE constraint en `documents` (HOY mismo)

**Auditoría del schema y dupes:**

Columnas reales: `id (bigint pk), content (text), metadata (jsonb), embedding`. **No hay** `content_hash` ni `(ticker,model_name,sweep_id)` físicas — esa info vive en `metadata`. Identificadores semánticos:
- Docs RIX (30.791): clave natural `(metadata->>'rix_run_id', metadata->>'ai_model')`.
- Docs corporate_news (754): no tienen `rix_run_id`; clave natural `(metadata->>'ticker', metadata->>'article_url', metadata->>'snapshot_date')`. No los tocamos en este turno (no hay evidencia de duplicación masiva ahí; 754 entradas únicas razonables).

**Dupes detectados:** 30.791 docs RIX − 26.254 pares distintos = **4.537 dupes** sobre `(rix_run_id, ai_model)`. Mayor que los 3.858 que asumías; he confirmado con SQL real.

**Estrategia que no rompe `populate-vector-store` ni la purga futura:** índice único parcial **filtrado por `id` futuro**, usando el `MAX(id)` actual como cota:

```sql
-- max(id) actual confirmado: 1.261.992. Usamos cota redondeada hacia arriba.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS documents_rix_run_model_future_uidx
  ON public.documents ((metadata->>'rix_run_id'), (metadata->>'ai_model'))
  WHERE metadata->>'rix_run_id' IS NOT NULL
    AND id > 1262000;
```

Por qué esta forma:
- `WHERE id NOT IN (lista de 4.537)` no es válido en partial index (Postgres exige `WHERE` IMMUTABLE; subqueries y listas explícitas largas no funcionan en `CREATE INDEX`).
- `id > 1262000` sí es IMMUTABLE y bloquea **toda** inserción futura duplicada (los IDs son monotónicos crecientes en `bigint pk`).
- Los 4.537 dupes existentes con `id ≤ 1.261.992` quedan intactos hasta la purga programada.
- `populate-vector-store` cuando intente insertar un `(rix_run_id, ai_model)` que ya exista **fallará con conflicto único** — pero esto es lo que queremos: corta la sangría inmediatamente. Riesgo evaluado: el cron está hoy en bucle de "CPU exceeded" insertando duplicados de los mismos 19 pendientes; el fallo del INSERT lo expondrá en logs en lugar de silenciar la duplicación.
- Si cualquier ráfaga de errores de `populate-vector-store` post-deploy supera el umbral, lo neutralizamos haciendo `DROP INDEX CONCURRENTLY documents_rix_run_model_future_uidx;` (rollback en 1 comando, sin pérdida de datos).

Se entrega como **migración** (DDL → migration tool, no insert tool).

**Purga del backlog (4.537 dupes) — DIFERIDA, NO HOY**, en pasada aparte esta semana:
```sql
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY metadata->>'rix_run_id', metadata->>'ai_model'
    ORDER BY id ASC
  ) rn
  FROM documents WHERE metadata->>'rix_run_id' IS NOT NULL
)
DELETE FROM documents WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
-- Tras purga, recrear índice global sin filtro id:
DROP INDEX CONCURRENTLY documents_rix_run_model_future_uidx;
CREATE UNIQUE INDEX CONCURRENTLY documents_rix_run_model_uidx
  ON public.documents ((metadata->>'rix_run_id'), (metadata->>'ai_model'))
  WHERE metadata->>'rix_run_id' IS NOT NULL;
```

---

## Verificación W17 — DOS pasos

Resolución del `sweep_id` real para W17 antes de los curls:
```sql
SELECT DISTINCT batch_execution_date FROM rix_runs_v2
WHERE "06_period_from" = '2026-04-19' LIMIT 1;
```
(usar el valor devuelto literal en `sweep_id` de los dos curls; placeholder a continuación: `<W17_SWEEP_ID>`).

### Paso 1 — smoke sin reparar
```bash
curl -X POST \
  "https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-quality-watchdog" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"sanitize","sweep_id":"<W17_SWEEP_ID>","auto_repair":false}'
```
Esperado en logs (los recogeré literales con `supabase--edge_function_logs`):
```
[sanitize] Found 175 records to scan
[sanitize] Complete: scanned=175, invalidFound=<N>, registered=<N>
[sanitize] Deduped 0 duplicate reports         ← Capa 2 activa, 0 dupes esperados con Capa 1
```

### Paso 2 — reparar el backlog W17 (sólo si Paso 1 OK)
```bash
curl -X POST \
  "https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-quality-watchdog" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"sanitize","sweep_id":"<W17_SWEEP_ID>","auto_repair":true,"force":true,"max_repairs":50}'
```
Esto inserta **un** trigger `repair_invalid_responses` para los inválidos detectados (no los 5.042 falsos del bug anterior, sino los reales — esperamos un número mucho menor, posiblemente <50). El cron lo ejecutará en cascada con la nueva división Qwen/no-Qwen de P1.

Te paso logs literales de ambos pasos.

---

## Sanidad W19 / W20

- **W19 (hoy 2026-05-03):** orchestrator log confirma `pending=0, processing=0, completed=175, failed=0`. ✅
- **W20 (próximo 2026-05-10):** los cambios de Capa 1, 2, 3 son **read/report-side** (sólo afectan `data_quality_reports`). P1 sólo divide el trigger `repair_analysis` en dos del mismo `action`. P2 añade un índice parcial que sólo afecta inserciones futuras en `documents`. **Cero impacto sobre `rix-batch-orchestrator` en su fase de barrido (`fase: auto`, `mode: resume`)**. Reconfirmaré con `sweep_progress` justo tras el deploy.

---

## Lo que NO se toca
- Ranking marker fix, footnote, `temporalEvolution.ts` (fixes anteriores intactos).
- `chat-intelligence-v2`, frontend, skills.
- Los 5 modelos no-Qwen.
- `getActiveSweepId` (fallback calendario confirmado seguro).
- Purga del backlog de 4.537 dupes en `documents` (diferida a esta semana, sólo se entrega script).

---

## Entregables que recibirás tras el deploy en este mismo turno
1. Diffs aplicados (Capa 3, Capa 1, Capa 2, P1, P2-constraint).
2. Migración SQL del índice parcial `documents_rix_run_model_future_uidx` ejecutada.
3. `<W17_SWEEP_ID>` resuelto.
4. Logs literales `Deduped N`, `registered=N`, `invalidFound=N` de Paso 1 y Paso 2.
5. Confirmación `sweep_progress` W19 sano + W20 sin riesgos detectados.