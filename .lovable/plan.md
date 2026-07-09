# Diagnóstico — ¿la ventana temporal se aplica en el chat V2?

**Modo plan, no toco código.** Rastreado el flujo `chat-intelligence-v2` skill por skill. Respuesta corta arriba, evidencias por skill abajo, y qué habría que tocar si quieres blindarlo.

## Respuesta directa

**(a)** El chat **NO comparte** la limitación de los RPCs `rix_*_datapack`. Esos RPCs (usados por `/informes` y por `report-analysis`) sí ignoran fechas; pero el agente de chat consulta `rix_runs_v2` **por su cuenta**, filtrando por rango de fechas en **todos** los skills (comparison, companyAnalysis, sectorRanking, periodEvolution) y agregando sobre el periodo completo con `computePeriodAggregation`. El único filtrado "a última semana" ocurre cuando el `mode` acaba resuelto como `snapshot` (from===to), y eso pasa cuando el parser temporal no reconoce una ventana amplia en la pregunta.

**(b)** El rango efectivo por skill se decide en un único punto: `parsers/temporalParser.ts::parseTemporal()`. Los skills reciben `parsed.temporal.{from,to}` y `parsed.mode` ya resueltos y los aplican tal cual al WHERE. `parsed.mode` lo pone `inferMode()` (línea 211-213): `period` si `snapshots_available > 1`, `snapshot` en otro caso.

**(c)** La causa realista del síntoma "solo refleja última semana" en comparativas es que la pregunta del usuario cae en una de estas rutas y el parser la resuelve a un snapshot puntual:
  - "esta semana" / "this week" → `resolveCurrentWeekWindow` fuerza `from===to = último domingo`.
  - "semana pasada" o una fecha ISO suelta → `resolveSnapshotByDate` idem.
  - Cualquier fecha ISO única sin "entre/desde/del…al…" cae en `explicit_date` y se colapsa a snapshot.
  - Si el parser NO reconoce el marker temporal en absoluto → `buildAdaptiveDefaultWindow` (13 semanas hasta el último domingo con datos). Esto sí es rango — pero si el usuario escribe algo tipo "en lo que llevamos del año" el regex `YTD_RE` lo pilla; si escribe algo raro ("año completo", "todo el ejercicio", "desde enero"), NO lo pilla y cae al default de 13 semanas.

Es decir: el chat **sí** respeta la ventana cuando el parser la entiende. Cuando el usuario dice "YTD" o "año completo", conviene verificar en logs si `parsed.temporal.from/to` sale como snapshot puntual o como rango — el bug, si existe, está en el parser, no en el WHERE de los skills.

---

## Detalle por skill (rutas y líneas)

### 1. COMPARISON — `skills/comparison.ts`

- **fetchEntity** (líneas 80-100): `rix_runs_v2` filtrado por `05_ticker`, `.gte("batch_execution_date", fromISO)`, `.lte("batch_execution_date", toISO)`. Trae **todas las filas del periodo**.
- **Agregación** (línea 299): `aggregateEntity(ticker, rows)` calcula per-metric sobre el conjunto completo devuelto → sí agrega sobre todo el periodo, no toma solo la última fila.
- **Mode que pasa al reportAssembler** (línea 314): `parsed.mode === "period" ? "periodMode" : "snapshotMode"`. Es decir, hereda directamente `parsed.mode` del parser.
- **Rango que se muestra al LLM** (líneas 316-321, 178-181): `parsed.temporal.from → parsed.temporal.to`. Los logs `[RIX-V2][comparison] fetchEntity ticker=… from=… to=…` (línea 84) permiten verificar en Edge Logs qué rango real recibe.
- **Nota**: comparison filtra por `batch_execution_date`, mientras que companyAnalysis y sectorRanking filtran por `07_period_to`. Con el sweep dominical actual las dos columnas suelen alinear en la misma fecha, pero no está garantizado — es una micro-inconsistencia entre skills.

**Veredicto**: comparativa SÍ aplica el rango de fechas al SQL y SÍ agrega sobre el periodo completo. Si el usuario ve "solo última semana" es porque `parsed.temporal.from == parsed.temporal.to` (snapshot).

### 2. COMPANY ANALYSIS — `skills/companyAnalysis.ts` + `datapack/builder.ts`

- **fetchRows** (`datapack/builder.ts` líneas 175-232): `rix_runs_v2` filtrado por `05_ticker`, y sobre `07_period_to`:
  - Si `fromISO === toISO` → `.eq("07_period_to", fromISO)` (snapshot puntual).
  - Si no → `.gte("07_period_to", fromISO).lte("07_period_to", toISO)` (rango).
  - Log clave: `[RIX-V2][datapack] SQL window | ticker=… | from=… | to=…` (línea 186-188).
- **buildDataPack** (líneas 286-296, 322-343): agrega vía `computePeriodAggregation(workingRows)` sobre TODAS las filas devueltas, no solo la última. `period_summary` incluye `rix_trend`, `rix_range`, `submetrics_range` etc.
- **Mode** (línea 351): idéntico al de comparison — hereda `parsed.mode`.

**Veredicto**: perfil SÍ aplica el rango y SÍ agrega sobre el periodo completo. Mismo comportamiento que comparison.

### 3. SECTOR RANKING — `skills/sectorRanking.ts`

- **Filtro fechas** (líneas 559-561 y 627-629): patrón idéntico a companyAnalysis, sobre `07_period_to`. Snapshot vs rango según `fromISO === toISO`.
- **Log** (línea 1211-1213): `SQL window | requested=…→… | reconciled=…→…` — expone explícitamente el rango efectivo.

**Veredicto**: ranking SÍ aplica el rango.

### 4. PERIOD EVOLUTION — `skills/periodEvolution.ts`

- **fetchRows** (líneas 67-69): `.gte("batch_execution_date", fromISO).lte("batch_execution_date", toISO)`. Rango puro, con `order("batch_execution_date", { ascending: true })` para pintar la serie.

**Veredicto**: evolution SÍ aplica el rango (y necesariamente — es su razón de ser).

### Origen único del rango efectivo

`parsers/temporalParser.ts::parseTemporal()` (líneas 222-328) es el ÚNICO punto de decisión. Orden de prioridad:

1. **Regex `explicitRange`** (líneas 235-270): solo matchea "entre YYYY-MM-DD y YYYY-MM-DD", "desde YYYY-MM-DD hasta YYYY-MM-DD", "del YYYY-MM-DD al YYYY-MM-DD". Requiere fechas ISO literales.
2. **`parseTemporalIntent`** (`_shared/temporalGuard.ts`): reconoce Q1/Q2/…, semestres, YTD (`YTD_RE` línea 163: `ytd | lo que va de a[nñ]o | lo que llevamos de | este a[nñ]o hasta hoy | year to date | hasta hoy`), "últimas N semanas/días/meses", "esta semana", "semana pasada", fechas ISO sueltas.
3. **`current_iso_week`** → `resolveCurrentWeekWindow` → snapshot puntual (from===to).
4. **`last_iso_week` / `explicit_date`** → `resolveSnapshotByDate` → snapshot puntual.
5. Si `intent.primary == null` → `buildAdaptiveDefaultWindow` = últimas 13 semanas (rango).

`inferMode(temporal)` (línea 211): `snapshots_available > 1 ? "period" : "snapshot"`. Si el parser devuelve snapshot puntual, mode="snapshot" y downstream se aplica `buildSnapshotRules` en vez de `buildPeriodRules`.

### Los RPCs `rix_*_datapack` que mencionas

Confirmado en `src/hooks/useComparisonDatapack.ts`, `useProfileDatapack.ts`, `useRankingDatapack.ts`, `src/lib/reports/downloadReportPdf.ts`, `supabase/functions/report-analysis/index.ts`. **Ningún skill del chat V2 los llama.** El chat va directo a `rix_runs_v2`. Por tanto la limitación de esos RPCs (comparación/perfil sin fechas) **no contamina** al chat.

---

## Qué habría que tocar (si tras revisar logs se confirma que el bug está en el parser)

Nada en los skills — ya filtran bien. La palanca es una sola:

**`supabase/functions/_shared/temporalGuard.ts`** — ampliar patrones reconocidos:
- Añadir "año completo", "todo el año", "el año", "todo el ejercicio", "desde enero" (con año implícito) al bloque YTD o crear un patrón `WHOLE_YEAR_RE` que devuelva `{start_t: "${año}-01-01", end_t: hoy, kind: "ytd"}`.
- Considerar "desde X" abierto (sin "hasta") → interpretar como "desde X hasta hoy".
- "los últimos N meses" ya está cubierto (`RELATIVE_MONTHS_RE`/`HACE_MONTHS_RE`, líneas 355-360).

**Verificación operativa (sin tocar código)**:
1. Reproducir la pregunta del usuario en Edge Function Logs de `chat-intelligence-v2` y buscar la línea `[RIX-V2][datapack] SQL window | ticker=… | from=X | to=Y` (o el equivalente `[RIX-V2][comparison] fetchEntity`).
2. Si `from === to` → confirma que el parser degradó a snapshot; el fix es en el parser.
3. Si `from ≠ to` y aun así el informe habla solo de la última semana → el fallo está en la agregación / prompt (no en el filtro), y hay que mirar `computePeriodAggregation` y `buildComparisonRules` / `periodMode`. Este segundo escenario es menos probable pero conviene descartarlo con los logs antes de tocar el parser.

**No cambio código en esta ronda.** Con el diagnóstico validado, si quieres, en un siguiente plan propongo la ampliación puntual del parser temporal.
