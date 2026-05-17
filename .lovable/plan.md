
## Diagnóstico

El barrido de hoy (domingo 17-may-2026, 09:00 UTC) ya está completo en `rix_runs_v2` con 1.050 filas (todas las empresas × 6 modelos). Sin embargo, los informes generados antes de las 09:00 UTC se anclan al domingo anterior (10-may-2026). Causa:

`supabase/functions/_shared/sundayResolver.ts` (y su gemelo `src/lib/skills/sundayResolver.ts`) decide `sweepInProgress = (dow === 0 && hourUTC < 9)` por reloj, **sin mirar la BD**. Luego filtra `lte("07_period_to", calendarSunday)` donde `calendarSunday = domingo anterior` cuando `sweepInProgress=true`. Resultado: la query nunca llega a ver el barrido del propio domingo aunque ya esté cerrado, y devuelve el domingo previo.

Esto:
- Afecta a Informes RIX y al Agente RIX (todo lo que pasa por `parseTemporal` o `resolveLastClosedSunday`).
- No afecta a `useLatestBatchDate` (devuelve correctamente el 17-may), por eso el panel de filtros muestra una fecha y luego el informe usa otra.

## Cambio propuesto

Hacer que `sweepInProgress` sea **empírico, no por reloj**: un domingo se considera "en curso" solo si **no hay aún ≥180 filas con `07_period_to = ese domingo`**. Si ya hay barrido cerrado en BD, se usa.

### Algoritmo nuevo (en `_shared/sundayResolver.ts` y su mirror `src/lib/skills/sundayResolver.ts`)

```text
1. calendarSunday = último domingo calendario (sin restar 7).
2. Consultar conteo de filas con 07_period_to = calendarSunday.
3. Si count >= 180  → devolver calendarSunday, sweepInProgress=false, source="db_max".
4. Si count <  180 y dow===0 → sweepInProgress=true; bajar a domingo anterior con ≥180.
5. Resto del flujo (loop por días con ≥180) se mantiene como red de seguridad.
```

El flag `SWEEP_HOUR_UTC` desaparece de la decisión (se queda solo como pista informativa para el label, opcional).

### Archivos a tocar

- `supabase/functions/_shared/sundayResolver.ts` — reescribir `computeLastClosedSundayPure` + `resolveLastClosedSunday` con la lógica empírica. Mantener firma pública intacta (`ResolvedSunday`, `formatSundayLabel`).
- `src/lib/skills/sundayResolver.ts` — espejo idéntico (la propia cabecera del archivo exige sincronía).
- `src/lib/skills/__tests__/sundayResolver.test.ts` — añadir 2 tests:
  - Domingo con ≥180 filas a las 06:00 UTC → devuelve hoy.
  - Domingo con 0 filas a las 06:00 UTC → devuelve domingo anterior.

### Lo que NO se toca

- `useLatestBatchDate` (ya correcto).
- `RixReports` re-ancla por defecto, sigue igual.
- `RegenerateDialog` y el botón "Actualizar al último barrido" (no relacionado).
- Parser temporal, scopedQuery, compileQuestion, filtros, coherence: ningún cambio.

## Validación

1. `bunx vitest run src/lib/skills/__tests__/sundayResolver.test.ts`.
2. Generar un informe nuevo desde `/informes` y verificar que la ventana del informe llega hasta `2026-05-17` (no `2026-05-10`).
3. Comprobar en logs de `chat-intelligence-v2` que `parseTemporal` resuelve `to = 2026-05-17`.
