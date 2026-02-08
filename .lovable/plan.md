
## Objetivo (urgente)
1) Desbloquear el barrido de hoy para que continúe hasta completar las ~174 empresas (ahora está partido entre varios `sweep_id`).
2) Montar un mecanismo “a prueba de semanas/fechas” para que **watchdog / auto_continue / repair_search / repair_mode** siempre apunten al mismo barrido y no vuelva a ocurrir.

---

## Hallazgos de la auditoría (causa raíz)
### 1) Hay **desalineación de “qué es la semana”** entre funciones
- `rix-search-v2` genera el rango de fechas como **rolling last 7 days**:
  - `dateFrom = now - 7 días`, `dateTo = now`
  - Hoy está creando registros `rix_runs_v2` con:  
    - `06_period_from = 2026-02-01`, `07_period_to = 2026-02-08` (510 filas)
- `rix-batch-orchestrator` en `hasCompanyDataThisWeek()` calcula “esta semana” como **lunes-domingo de la semana anterior** (otra lógica distinta).
  - Resultado: el orquestador puede creer que “no hay datos” aunque `rix-search-v2` ya insertó para el batch actual.

### 2) El “sweep activo” del orquestador (watchdog/auto_recovery) se deriva de `rix_runs_v2.06_period_from`
- En `rix-batch-orchestrator`:
  - Para `trigger === watchdog || auto_recovery`: usa `getActiveSweepId()` basado en `rix_runs_v2.06_period_from`.
  - Para otros modos (fases CRON/manual): usa `getCurrentSweepId()` calendario.
- Esto provoca que **el watchdog/auto_continue trabaje otra semana distinta** a la que inicializan los CRONs de fase.
- Evidencia DB (test):
  - `sweep_progress`:
    - `2026-W07`: 84 completed / 90 pending (bloqueado aquí)
    - `2026-W05`: 49 completed / 122 pending / 3 processing (ruido/arrastre)
  - `pipeline_logs` recientes muestran `sweep_id: 2026-W04` en heartbeats → el orquestador está “viviendo” en un sweep incorrecto.

### 3) `rix-search-v2` actualiza `sweep_progress` con un `currentSweepId` calculado por calendario
- Cuando termina, hace:
  - `update sweep_progress set completed ... where sweep_id = currentSweepId and ticker = X`
- Si el orquestador está procesando otra semana, o si hay varios sweeps abiertos, esto **marca el registro equivocado o no marca ninguno**.

---

## Estrategia de arreglo (inmediato + definitivo)
### Principio: una sola “fuente de verdad” para el sweep activo
Para que no vuelva a pasar, hay que evitar derivar el sweep desde `06_period_from` (porque puede ser rolling y no representa “semana operativa” del barrido).  
La fuente correcta para “qué sweep estoy ejecutando” debe ser:

1) **`sweep_progress`** (es el estado real del barrido: pending/processing/completed/failed)  
y/o
2) una nueva tabla **`rix_sweeps`** (recomendado) que “ancla” el sweep: `sweep_id`, `batch_execution_date`, `date_from`, `date_to`.

---

## Cambios propuestos (código + DB)
### A) Hotfix inmediato (sin migración, para desbloquear ya)
1) **Cambiar `getActiveSweepId()` en `rix-batch-orchestrator`**:
   - En vez de mirar `rix_runs_v2`, seleccionar el sweep activo desde `sweep_progress`:
     - buscar `sweep_id` con `status in ('pending','processing','failed')`
     - ordenar por `sweep_id` DESC (formato `YYYY-WNN` con 0-pad permite orden lexicográfico correcto)
     - si no hay ninguno, fallback a `getCurrentSweepId()`.
   - Resultado: `auto_recovery/watchdog/auto_continue` pasan a apuntar a `2026-W07` (el sweep realmente pendiente).

2) **Permitir forzar sweep por request** en `rix-batch-orchestrator`:
   - aceptar `requestBody.sweep_id` (ya se pasa en auto_continue trigger params pero hoy se ignora en la elección principal)
   - prioridad: `requestBody.sweep_id` > sweep activo (por sweep_progress) > calendario.
   - Resultado: podemos “reanimar” W07 incluso si hay arrastre de W05.

3) **Pasar `sweep_id` desde el orquestador a `rix-search-v2`** en `processCompany()`:
   - body: `{ ticker, issuer_name, sweep_id: sweepId }`.

4) **Actualizar `rix-search-v2` para usar `sweep_id` recibido** al marcar `sweep_progress`:
   - si viene `sweep_id`, usarlo en el `update ... where sweep_id = sweep_id_recibido and ticker = X`.
   - si no viene, fallback al cálculo actual (para no romper llamadas existentes).

Con esto, aunque el rango `dateFrom/dateTo` siga siendo rolling, el sistema queda **consistente operacionalmente**: la “semana” del barrido es el `sweep_id` del `sweep_progress`, y watchdog/auto_continue dejan de irse a W04/W05.

---

### B) Hardening (para que no vuelva a pasar, incluso con reparaciones históricas)
Recomendado añadir una tabla de control (mínima, sin tocar `auth`, sin SQL crudo en edge):

**Migración DB: crear `rix_sweeps`**
- columnas sugeridas:
  - `sweep_id text primary key`
  - `batch_execution_date timestamptz not null`
  - `date_from date not null`
  - `date_to date not null`
  - `created_at timestamptz default now()`
  - `status text default 'active'` (active/completed/archived)
- RLS:
  - lectura para usuarios autenticados (o admins) según vuestro patrón (en admin panel ya hay áreas restringidas)
  - escritura solo service_role (edge functions).

**Cambios de código asociados**
1) En `rix-batch-orchestrator`:
   - Al inicializar un sweep (cuando crea `sweep_progress`), crear/asegurar un registro en `rix_sweeps` con:
     - `batch_execution_date` fijo para ese sweep (anclado)
     - `date_from/date_to` fijos
   - Para elegir sweep activo en watchdog:
     - preferir `rix_sweeps` con `status='active'` y que tenga pendientes en `sweep_progress`.

2) En `rix-search-v2`:
   - Si llega `sweep_id`, leer `rix_sweeps` y usar **siempre** sus `date_from/date_to/batch_execution_date`:
     - Esto elimina definitivamente el riesgo de que el mismo sweep inserte en batches distintos si dura horas/días.
   - En `repair_mode`:
     - permitir `batch_execution_date` (o `sweep_id`) para reparar el batch correcto aunque sea histórico.

3) En `rix-quality-watchdog` y `rix-analyze-v2`:
   - Donde hoy se usa `latest 06_period_from` o `latest batch_execution_date` de manera inconsistente, cambiar a:
     - “último sweep activo” de `rix_sweeps` (o `batch_execution_date` explicitado).
   - Esto asegura que sanitización/repairs/análisis se aplican al sweep correcto.

---

## Plan de ejecución inmediata (para “hoy”)
1) Implementar Hotfix A (sin migración) en:
   - `supabase/functions/rix-batch-orchestrator/index.ts`
   - `supabase/functions/rix-search-v2/index.ts`
2) Deploy edge functions.
3) Acciones de reanimación:
   - Ejecutar `rix-batch-orchestrator` en `trigger=auto_recovery` y/o insertar un `cron_triggers:auto_continue` con `params.sweep_id='2026-W07'`.
   - Ejecutar `reset_stuck` si hay `processing` atascados.
4) Verificación:
   - Confirmar que `pipeline_logs.sweep_id` pasa a ser `2026-W07` en heartbeats.
   - Confirmar que `sweep_progress (2026-W07)` baja `pending` de 90 → 0.
   - Confirmar que `cron_triggers` se procesan y no se quedan en “processing”.

---

## Pruebas (mínimas pero obligatorias)
1) Test funcional:
   - Llamar a `rix-batch-orchestrator` (auto_recovery) y ver que reclama empresas de `2026-W07`.
2) Test de consistencia:
   - Forzar un `process_one` y comprobar que:
     - `rix-search-v2` marca completed **en el mismo `sweep_id`**.
3) Test de reparación:
   - Lanzar un `repair_search` para 1 registro y verificar que actualiza el batch correcto (con sweep_id).
4) Observabilidad:
   - Revisar logs de `rix-batch-orchestrator` y `rix-search-v2` durante 5-10 min para confirmar que no aparecen desalineaciones (“Derived from data → W0X” desaparece del flujo).

---

## Archivos a tocar (resumen)
- `supabase/functions/rix-batch-orchestrator/index.ts`
  - Cambiar selección de sweepId en watchdog/auto_recovery
  - Aceptar `requestBody.sweep_id`
  - Pasar `sweep_id` a `rix-search-v2`
- `supabase/functions/rix-search-v2/index.ts`
  - Aceptar `sweep_id` (y luego en hardening: batch/date_from/date_to anclados)
  - Usar `sweep_id` recibido para actualizar `sweep_progress`

**Fase “Hardening” adicional**
- Nueva migración SQL: tabla `rix_sweeps` + RLS
- Ajustes en:
  - `supabase/functions/rix-analyze-v2/index.ts`
  - `supabase/functions/rix-quality-watchdog/index.ts`

---

## Resultado esperado
- El barrido de hoy se desbloquea porque `auto_continue/watchdog` vuelve a operar sobre `2026-W07`.
- Cada empresa procesada por el orquestador marca `sweep_progress` en el sweep correcto (sin week mismatch).
- La arquitectura queda anclada (con `rix_sweeps`) para que ni cambios de día, ni repairs históricos, ni rolling dates vuelvan a romper el sistema.
