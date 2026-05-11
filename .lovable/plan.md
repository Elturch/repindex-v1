## Objetivo

Alinear el Dashboard con el Visor (informes) corrigiendo F1, F2, F3 y F5 — sin tocar el agente RIX ni el pipeline. Todo el cambio queda en hook + UI.

## Alcance (lo que SÍ entra)

**F1 — Agregación por periodo (multi-semana)**
- Nuevo modo "Periodo" en el filtro de fecha del Dashboard, además del modo actual "Semana" (snapshot). 
- Cuando el usuario elige rango (p.ej. 2026-04-10 → 2026-05-09), el hook agrega RIX y sub-métricas con la **misma lógica que `sectorRanking.ts`**: media simple por `(ticker, model)` sobre las semanas que caen en el rango (eje domingo, `07_period_to`).
- El modo "Semana" actual (un único `batchNumber`) queda intacto como default.

**F2 — Multi-modelo en UI**
- El selector actual (radio: Todos / ChatGPT / Gemini / …) pasa a soportar selección múltiple via toggles. "Todos" sigue disponible.
- Estado interno: `aiFilter: AIFilter[]` (array) en lugar de `AIFilter` (string). Compatibilidad: si solo hay 1 modelo, el render se comporta como hoy.
- El hook recibe `modelFilters: string[]` y filtra `02_model_name` por inclusión.

**F3 — Granularidad de subsector**
- Nuevo filtro **Subsector** (combobox) bajo el filtro de Sector. Lee de `repindex_root_issuers.subsector` (columna ya existente en BD).
- Hook acepta `subsectorFilter`. Cuando hay subsector elegido, el filtro de sector se respeta como ámbito superior pero el ranking/agregación se calcula sobre el subsector exacto.

**F5 — Compatibilidad de filtros (orden de precedencia)**
- Cuando el usuario combina IBEX-35 + un subsector que mezcla cotizadas/no-cotizadas, el Dashboard ya no devuelve vacío: aplica el subsector como filtro principal y muestra un badge "Universo ajustado: subsector tiene precedencia sobre índice" para que el usuario lo entienda.
- Documentado con tooltip; sin cambios silenciosos.

## Fuera de alcance (NO entra)

- No tocamos `chat-intelligence-v2` ni `sectorRanking.ts`.
- No tocamos RLS, migraciones, ni `rix_runs_v2`.
- Modo Consenso sigue operando exactamente como hoy (sólo se le pasan los filtros nuevos).
- Cards view se adapta de forma mínima — la prioridad es la vista Lista (es la que el usuario contrasta con el informe).

## Detalle técnico

### `src/hooks/useUnifiedRixRuns.ts`
- `UseUnifiedRixRunsOptions`: añadir `modelFilters?: string[]`, `subsectorFilter?: string`, `dateRange?: { from: Date; to: Date } | null`, `aggregationMode?: 'snapshot' | 'period'`.
- Mantener `modelFilter`/`sectorFilter` actuales para no romper otros consumidores; si llega `modelFilters` con length>0 tiene precedencia.
- Nueva rama de agregación cuando `aggregationMode === 'period'`: 
  1. Cargar todos los `rix_runs_v2` cuyo `07_period_to` ∈ `[from, to]`.
  2. Agrupar por `(ticker, model_name)`, calcular media de `rix_score` y de cada `*_score`.
  3. Devolver filas sintéticas con `id = 'agg-{ticker}-{model}-{from}-{to}'`, `batch_execution_date = to`.
- En el `select` del SELECT de `repindex_root_issuers` añadir `, subsector`.
- F5: si `ibexFamilyFilter !== 'all'` y `subsectorFilter !== 'all'` y la intersección queda vacía, emitir `aggregationOverride: 'subsector'` en el resultado y aplicar sólo el subsector.

### `src/pages/Dashboard.tsx`
- Estado: `aiFilters: AIFilter[]` (array). Selector pasa a multi-toggle (los botones se mantienen visualmente pero permiten click acumulativo). "Todos" reinicia al array vacío + `all`.
- Nuevo bloque de filtro de fecha con dos modos: "Semana" (Select actual) o "Periodo" (DateRangePicker con calendario rango).
- Nuevo combobox "Subsector" alimentado por hook nuevo `useSubsectorCategories` (mismo patrón que `useSectorCategories`).
- Badge informativo cuando F5 dispara la sobreescritura de universo.
- `setPageContext` se actualiza con los nuevos campos para que el chat los reciba.

### Hook nuevo: `src/hooks/useSubsectorCategories.ts`
- Lista distinct de `subsector` desde `repindex_root_issuers` (filtra null/empty).
- Refleja `useSectorCategories` salvo el campo.

## Validación

1. Repetir el informe **IBEX-35 · ChatGPT · 2026-04-10→2026-05-09** desde el Visor y desde el Dashboard (modo Periodo + ChatGPT seleccionado). Top 5 y media RIX deben coincidir al decimal.
2. Snapshot de 1 semana (2026-05-03) sin cambios — debe coincidir con el informe single-week.
3. Multi-modelo (ChatGPT + Gemini) en Dashboard: la lista debe mostrar 2 filas por ticker (una por modelo), no fusionarlas.
4. F5: IBEX-35 + Subsector "Hospitales" → badge visible + lista no vacía.

## Entregables

- 1 hook modificado, 1 hook nuevo, 1 página modificada. Sin migraciones, sin cambios de edge functions.
