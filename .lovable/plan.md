# Plan: Rediseño del pipeline de barrido para escalar a 500 empresas en <3h

Ejecutado en 4 commits separados, en el orden estricto que pediste: **Robustez → Escala → Aislamiento → Observabilidad**. Sin tocar UI de cliente, sin cambios destructivos en `rix_runs_v2` ni `sweep_progress`.

---

## Commit 1 — ÁREA 3: Robustez ante fallos

### 1.1 Nueva tabla `sweep_queue` (cola precargada del barrido)

```text
sweep_queue
├── id uuid pk
├── sweep_id text          -- identificador del barrido dominical
├── ticker text
├── issuer_name text
├── status text            -- 'pending' | 'processing' | 'done' | 'skipped'
├── attempts int default 0
├── last_error text
├── locked_at timestamptz
├── lock_expires_at timestamptz  -- TTL duro = locked_at + 5min
├── worker_id text
├── created_at, updated_at, completed_at
└── UNIQUE(sweep_id, ticker)
```

- Índices: `(sweep_id, status)`, `(lock_expires_at)` para liberación rápida.
- GRANTs: solo `service_role` (no se expone al front).
- RLS activada con policy `service_role only`.

### 1.2 Funciones SQL (atómicas, SECURITY DEFINER)

- `claim_next_sweep_queue_item(p_sweep_id, p_worker_id)` — `FOR UPDATE SKIP LOCKED`, fija `locked_at=now()`, `lock_expires_at=now()+5min`, incrementa `attempts`, marca `processing`. Solo devuelve filas donde `status='pending'` o (`status='processing'` y `lock_expires_at < now()`).
- `release_expired_sweep_locks()` — devuelve a `pending` cualquier fila con `status='processing'` y `lock_expires_at < now()`.
- `complete_sweep_queue_item(p_id)` y `fail_sweep_queue_item(p_id, p_error)` — el segundo marca `skipped` si `attempts >= 3`.

### 1.3 Cleanup en `rix-analyze-v2`

- Envolver la lógica de procesamiento en `try / finally`.
- En `finally`: liberar el `analysis_lock` de `17_flags` y, si vino vía `sweep_queue`, llamar a `fail_sweep_queue_item` (con error) o `complete_sweep_queue_item`.
- Capturar `AbortError` (timeout 280s) explícitamente para que el `finally` se ejecute antes del 504 de la plataforma.
- Confirmar que `BATCH_SIZE=1` y `LOCK_TIMEOUT_MS=300000` están como constantes en la cabecera del fichero.

### 1.4 Skip automático a los 3 intentos

- Encapsulado dentro de `fail_sweep_queue_item`: incremento + decisión en una sola transacción.
- El orchestrator no decide skip; lo decide la función SQL.

---

## Commit 2 — ÁREA 2: Escala a 500 empresas

### 2.1 Precarga dominical de `sweep_queue`

- Nueva función edge `seed-sweep-queue` (o paso inicial del orchestrator dominical):
  - Lee universo (`repindex_root_issuers`).
  - Inserta una fila por ticker con `status='pending'`, `sweep_id` = domingo de inicio.
  - `ON CONFLICT (sweep_id, ticker) DO NOTHING` para idempotencia.

### 2.2 `rix-batch-orchestrator` — concurrencia real = 6

- En cada invocación:
  1. `release_expired_sweep_locks()`.
  2. `claim_next_sweep_queue_item` × 6 (loop secuencial reclamando 6 tickers).
  3. `Promise.allSettled` de 6 llamadas `fetch` a `rix-analyze-v2` (fire-and-forget con `keepalive`, no esperamos los 130s).
  4. Cada `rix-analyze-v2` procesa 1 ticker × 6 modelos secuencialmente (ya validado por experiencia W23).
- El orchestrator termina en <5s (solo lanza), nunca se le va a 504.

### 2.3 Watchdog `rix-sweep-watchdog` (cron cada 2 min)

- Pre-check: contar `cron_triggers` con `status='processing'`. Si `>= 3` → salir sin crear nuevos.
- Pre-check: contar `pending`. Si `>= 6` → salir.
- Si pasa los gates: crear 1 trigger `repair_analysis` → invoca al orchestrator.
- Llamar a `release_expired_sweep_locks()` antes de evaluar.

### 2.4 Targets matemáticos verificables

- Métrica esperada con C=6 tickers × 6 modelos paralelos por ticker = 36 análisis concurrentes.
- 500 tickers / 6 = 84 ciclos × ~130s = ~3,0h. Margen real con perplexity en paralelo intra-ticker.

---

## Commit 3 — ÁREA 1: Aislamiento total Front/Backend

### 3.1 Bandera global

- Reutilizar `app_config` (no crear `pipeline_mode` para no duplicar). Clave `sweep_in_progress` (boolean) + `sweep_started_at`.
- Setter desde el orchestrator: `true` al sembrar `sweep_queue`, `false` cuando `sweep_queue` no tenga `pending|processing` para el `sweep_id` activo.

### 3.2 Hooks del front en modo defensivo

- Solo hooks que leen `rix_runs_v2` en tiempo real (lista corta: `useRixRuns`, `useUnifiedRixRuns`, `useTrendData`, `useUnifiedSweepMetrics`).
- Si `sweep_in_progress=true`:
  - `staleTime` sube a 5 min, `refetchInterval` se desactiva.
  - `LIMIT` baja (p.ej. 200 filas máx en vistas resumidas).
- **No** se cambia ninguna página/visor; solo capa de fetching.

### 3.3 Separación de timeouts en DB

- Edge functions del barrido (`rix-analyze-v2`, `rix-batch-orchestrator`, `rix-sweep-watchdog`) usan un cliente Supabase con header `Prefer: statement_timeout=300s`.
- El cliente del front mantiene el `statement_timeout` por defecto.
- Implementación: helper `createBackendClient()` en cada función edge con ese header.

---

## Commit 4 — ÁREA 4: Observabilidad

### 4.1 Métricas en `SweepHealthDashboard` / `SweepMonitorPanel`

- **Tickers/hora** (media móvil 10 min) — query sobre `sweep_queue.completed_at`.
- **ETA finalización** — `pending / tasa_actual`.
- **Barra global** — `done / total` del `sweep_id` activo (las barras por modelo ya existen).

### 4.2 Indicador en el front

- Banner discreto en `Header` cuando `sweep_in_progress=true`: "Procesando barrido semanal". Color secundario, no bloqueante. Solo visible si la consulta a `app_config` lo confirma.

### 4.3 Alerta de bajo throughput

- Nueva fila en `pipeline_alerts` (o `cron_triggers.result`) si `tickers/hora < 5` durante >20 min.
- Detector: el propio watchdog calcula la tasa y, si dispara, escribe la alerta + `console.error` con tag `[SWEEP_SLOW]` para que aparezca en Edge Logs.

---

## Detalles técnicos clave

- **Sin cambios de esquema en `rix_runs_v2` ni `sweep_progress`** — toda la nueva lógica vive en `sweep_queue` y funciones SQL.
- **Compatibilidad hacia atrás**: si `sweep_queue` está vacía, `rix-analyze-v2` sigue funcionando contra `claim_next_rix_analysis_record` (camino legacy). Solo cuando el orchestrator siembra la cola se activa el flujo nuevo.
- **Reversión por commit**: cada área es independiente. Revertir Commit 4 no afecta a 1-3, etc.
- **Sin destrucción de locks existentes** — el `release_expired_sweep_locks` solo toca `sweep_queue`, no `17_flags`.

## Orden de implementación dentro del Commit 1 (el que ejecutamos primero)

1. Migration: `sweep_queue` + 3 funciones SQL + GRANTs + RLS.
2. Edit `supabase/functions/rix-analyze-v2/index.ts`: bloque `try/finally`, constantes `BATCH_SIZE=1` y `LOCK_TIMEOUT_MS=300000`, manejo explícito de `AbortError`.
3. Smoke: invocar `rix-analyze-v2` con un ticker conocido y verificar que el `analysis_lock` se libera incluso forzando un timeout.

¿Procedo con el Commit 1 al pasar a build mode, o quieres ajustar algo antes?
