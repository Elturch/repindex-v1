## Problema

El botón **7d** calcula `from = hoy - 7` y `to = hoy`. Hoy es miércoles 2026-05-06 y el último barrido (canónico, dominical) es 2026-05-03. Aunque el rango contiene ese domingo, dependiendo de cómo el reconciliador alinea ventanas, la consulta puede:

- colapsar a un snapshot inexistente (fechas no-domingo),
- caer entre dos sundays sin solapar suficientes datos,
- o devolver 0 observaciones porque el agente espera un periodo cerrado en el último barrido real.

El usuario espera que **7d = la última semana con datos = el último barrido dominical**, no "los últimos 7 días naturales".

## Cambios

### 1. Nuevo hook `useLatestBatchDate`
`src/hooks/useLatestBatchDate.ts` — react-query que consulta:
```sql
select max(batch_execution_date) from rix_runs_v2
```
Devuelve el último sunday con datos (`2026-05-03` hoy). Cache 5 min.

### 2. `src/components/reports/FilterPanel.tsx` — recalcular presets contra `lastBatchDate`
En lugar de partir de `new Date()` (hoy):
- **anchor** = `lastBatchDate ?? hoy`.
- `7d` → `from = anchor - 6`, `to = anchor`. Es decir, la semana cuyo cierre es el último barrido.
- `30d` → `from = anchor - 29`, `to = anchor`.
- `90d` → `from = anchor - 89`, `to = anchor`.
- `YTD` → `from = 2026-01-01`, `to = anchor`.

Tooltip o `title` en el botón 7d: `"Última semana con datos (cierre {anchor})"`.

### 3. `createInitialFilterState()` — ventana por defecto
Hoy parte de "últimos 28 días desde hoy". Cambiar para que, una vez cargue `lastBatchDate`, se materialice como `last_month` anclado a `anchor`. Como el hook es asíncrono, mantener default offline y, cuando `lastBatchDate` llega y el usuario no ha tocado `window` (`origin === "free"`), reemplazar la ventana automáticamente desde `RixReports.tsx` (efecto al recibir el dato).

### 4. Validación
- Pulsar 7d con `lastBatchDate = 2026-05-03` → `from = 2026-04-27`, `to = 2026-05-03`. La pregunta compilada debe incluir ese rango y el agente devolver datos del barrido del 3-may.
- Comprobar consola/red: la respuesta del agente trae observaciones > 0 para IBEX-35.

## Fuera de alcance
- Lógica del reconciliador en backend.
- Otros componentes de chat (`ReportInfoBar`) que ya usan `last_batch_date`.
