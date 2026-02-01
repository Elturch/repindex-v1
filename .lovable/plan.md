
## Objetivo (lo que quieres conseguir)
Que **los análisis no se “paren” tras cada tanda** y que el sistema **encadene automáticamente el siguiente análisis**, sin depender de que tú vuelvas a pulsar “Forzar” (y sin esperar a que el cron “caiga” en la semana equivocada).

---

## Diagnóstico (por qué pasa)
He encontrado **dos causas** que juntas explican el comportamiento:

### 1) El cron de watchdog existe, pero a veces está apuntando al `sweep_id` equivocado
En la BD hay un cron activo:

- `jobid: 54`
- `schedule: */5 * * * *`
- llama a `rix-batch-orchestrator` con `body: {"trigger":"watchdog"}`

Pero `rix-batch-orchestrator` calcula `sweepId` con una función “manual” (`getCurrentSweepId`) basada en la fecha actual.  
Cuando cambia la semana (ej. hoy 2026-02-01), el `sweepId` calculado puede ser **2026-W05**, mientras que el barrido “real” de datos que sigues viendo es **2026-W04** (derivado de `06_period_from = 2026-01-25`).

Resultado: el watchdog entra, mira `sweep_progress` con el `sweepId` “nuevo”, no encuentra sweep (`sweepCount = 0`) y hace **skip**, por lo que **no continúa** el encadenamiento de triggers/análisis.

### 2) `repair_analysis` procesa una tanda y marca el trigger como `completed` aunque queden pendientes
En `processCronTriggers()`:
- `repair_search` ya está bien: si queda trabajo, deja el trigger en `pending` y sigue en el siguiente ciclo.
- `repair_analysis` en cambio **siempre marca `completed`** después de llamar a `rix-analyze-v2`, aunque la respuesta indique `remaining > 0`.

Eso hace que, si el orquestador no vuelve a invocarse “en el momento correcto”, parezca que “hace un análisis y se para”.

---

## Cambios propuestos (sin tocar tu flujo mental: solo hacerlo automático)

### A) Hacer que el orquestador use el “sweep activo” (derivado del dato real) en vez del calendario
**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

1. Añadir una función `getActiveSweepId()` que:
   - Lea el `06_period_from` más reciente en `rix_runs_v2`
   - Calcule ISO week/year (implementación pura en TS/JS para Deno; no dependemos de `date-fns` aquí)
   - Devuelva `YYYY-W##`

2. En los modos `watchdog/auto_recovery`, usar `activeSweepId`:
   - Para el `sweepCount` (evitar “skip”)
   - Para inserciones de triggers (`repair_search`, `repair_analysis`, `auto_continue`)
   - Para logs/telemetría

**Resultado:** aunque cambie el calendario, el watchdog de cada 5 min seguirá apuntando al sweep que realmente tiene datos y **no se detendrá**.

---

### B) Convertir `repair_analysis` en “auto-requeue” (igual que `repair_search`)
**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (dentro de `processCronTriggers()`)

1. Tras llamar a `rix-analyze-v2`, leer del JSON:
   - `processed`
   - `remaining`
   - `errors`
   - `skipped` (si aplica)

2. Si `remaining > 0`:
   - actualizar el mismo trigger a `status: 'pending'`
   - `processed_at: null`
   - guardar `result` con progreso (`processed`, `remaining`, `last`, `last_batch`…)

3. Si `remaining === 0`:
   - `status: 'completed'`
   - `processed_at: now`
   - `result` final

**Resultado:** el trigger de análisis **no desaparece** hasta que de verdad no quede nada por analizar.

---

### C) (Opcional pero recomendable) “Loop controlado” para procesar más de una tanda por invocación sin esperar 5 minutos
**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

En el modo `auto_recovery/watchdog`, después del primer `processCronTriggers()`:
- repetir `processCronTriggers()` en un bucle mientras:
  - haya triggers `pending`
  - y quede tiempo (time budget estricto, por ejemplo 120–150s)

Esto reduce la percepción de “se para” y acelera el vaciado de colas, sin arriesgar timeouts.

---

### D) Evitar que el dashboard se quede “ciego” por timeouts de PostgREST (muy importante para que veas progreso real)
Ahora mismo el hook está pidiendo columnas gigantes (`*_bruto`) y el servidor está devolviendo:
- `57014 canceling statement due to statement timeout`

**Archivo:** `src/hooks/useUnifiedSweepMetrics.ts`

1. Cambiar la query principal de `rix_runs_v2` para traer solo:
   - `05_ticker`
   - `02_model_name`
   - `09_rix_score`
   - `search_completed_at` (y si hace falta `analysis_completed_at`)

2. Redefinir `hasData` como:
   - `search_completed_at != null`  
   (y como ya tenemos el patrón “skip & reset” en `rix-analyze-v2` que pone `search_completed_at = null` cuando falta texto, esto se vuelve fiable y además ultra-barato de consultar)

**Resultado:** el panel deja de petar por timeout y verás si realmente “está parado” o está trabajando.

---

### E) Hardening de locking en `rix-analyze-v2` (para evitar errores silenciosos)
**Archivo:** `supabase/functions/rix-analyze-v2/index.ts`

Mejora defensiva:
- tratar `17_flags` como array solo si `Array.isArray(...)`
- al liberar lock en error, leer flags actuales (o al menos filtrar con seguridad) para no romper si `17_flags` es objeto/null

Esto evita que una excepción tonta en el locking haga que “parezca” que se para.

---

## Secuencia de implementación
1) **Backend crítico**
- Implementar `getActiveSweepId()` y usarlo en `watchdog/auto_recovery`
- Cambiar `repair_analysis` a “requeue if remaining > 0”

2) **Frontend observabilidad**
- Ajustar `useUnifiedSweepMetrics` para no seleccionar texto bruto y basarse en `search_completed_at`

3) **Hardening**
- Robustecer `17_flags` en `rix-analyze-v2`

---

## Cómo validaremos que ya es automático (pruebas)
1. Lanzar una sola vez el arranque (desde /admin “Forzar” o dejando que el cron lo haga).
2. Confirmar en `cron_triggers` que:
   - `repair_analysis` no termina en `completed` si `remaining > 0` (se queda/revuelve a `pending`)
   - `auto_continue` aparece cuando hay trabajo pendiente
3. Ver en el dashboard que `recordsWithScore` sube sin intervención manual.
4. Comprobar en `pipeline_logs` que hay heartbeats recientes cada pocos minutos.
5. Verificar que al cambiar de semana (fecha actual) el watchdog sigue atacando el sweep con datos (no “skip”).

---

## Archivos que tocaré
- `supabase/functions/rix-batch-orchestrator/index.ts`
- `supabase/functions/rix-analyze-v2/index.ts`
- `src/hooks/useUnifiedSweepMetrics.ts`
