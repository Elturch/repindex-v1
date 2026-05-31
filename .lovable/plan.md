
# Plan v2: cerrar W23 rápido + blindar W24 (con concurrencia real)

## Corrección aplicada

`batch_size=1` **secuencial** = 447 × 130 s ≈ 16 h. Inaceptable.
`batch_size=1` **+ 5 invocaciones concurrentes del orchestrator** = 447 / 5 / 60 ≈ **~20 min reales** para vaciar la cola. Aceptable.

La clave: una invocación = un ticker = 6 modelos en paralelo internamente. Cinco invocaciones a la vez = **30 análisis en vuelo**, con riesgo de timeout acotado a 1 ticker si una invocación cae a los 150 s.

---

## Parte A — Desbloqueo inmediato de W23

Ejecutar en este orden, sin saltar pasos:

1. **Pausar el watchdog** (cron que invoca `rix-batch-orchestrator?trigger=watchdog`) durante la maniobra para que no inyecte triggers nuevos.
2. **Purgar la cola**: en `cron_triggers`, marcar como `failed` (con `error_message='manual_purge_w23'`) los 5 `pending` + 1 `processing` de `repair_analysis`. Dejar la cola en cero.
3. **Liberar locks zombi** en `rix_runs_v2`:
   - Filtro: `sweep_id='2026-W23'` AND `analysis_completed_at IS NULL` AND `(17_flags->>'analysis_locked_at')::timestamptz < now() - interval '3 minutes'`.
   - Acción: borrar las claves `analysis_lock` y `analysis_locked_at` de `17_flags`.
4. **Parche puntual `rix-analyze-v2`**:
   - `BATCH_SIZE = 1` (1 ticker por invocación; los 6 modelos siguen en paralelo intra-ticker).
   - `LOCK_TIMEOUT_MS = 200_000` (mayor que 150 s del 504, holgura razonable).
   - Selección del ticker prioriza el que tenga más modelos pendientes.
5. **Parche `rix-batch-orchestrator`** (rama `repair_analysis`):
   - Procesar los triggers `pending` con `Promise.allSettled` y concurrencia **5** (no `for...of await`).
   - Cap absoluto: 5 invocaciones simultáneas, sin importar cuántos triggers haya.
6. **Sembrar 5 triggers `repair_analysis` iniciales** y desencadenar 1 invocación del orchestrator → arranca el procesamiento concurrente.
7. **Re-activar el watchdog** con la lógica corregida (ver B3-B4 abajo).
8. **Monitoreo 20 min**: cola debería bajar 447 → <50 sin 504 en cadena. Si OK, W23 cerrado.

---

## Parte B — Cambios permanentes para W24+

### B1. `rix-analyze-v2`
- `BATCH_SIZE = 1` por defecto (un timeout solo cuesta 1 ticker, no 15).
- `LOCK_TIMEOUT_MS = 200_000`.
- Selección "ticker con más pendientes primero".
- Release-on-error ya existente, sin cambios.

### B2. `rix-batch-orchestrator` — concurrencia real
- Rama `repair_analysis`: `Promise.allSettled` con **concurrencia 5** (semáforo simple o `Promise.all` sobre slices de 5).
- Importante: cada invocación dispara un único ticker, así que 5 invocaciones = 5 tickers distintos en paralelo, sin colisión de locks.

### B3. Deduplicación de triggers (anti-tormenta)
- Antes de crear un nuevo `repair_analysis`, el watchdog verifica: si ya hay ≥3 `pending` o `processing` del mismo `action` para el sweep activo → **no crea más**.
- Antes de procesar, deduplicar por `(sweep_id, action)` y marcar como `failed` los excedentes.

### B4. Watchdog menos agresivo
- Frecuencia: cada **3 min** en lugar de cada 1 min (suficiente con concurrencia 5).
- No re-emitir triggers mientras la cola tenga ≥3 pendientes vivos.

### B5. Observabilidad mínima
- En `sweep_progress`: contador `triggers_repair_count` y `last_504_at`.
- Banner en `/admin` si `triggers_repair_count > 10` en sweep activo → señal de tormenta.

---

## Aritmética esperada

- **W23 actual**: 447 pendientes, 7 881 s/registro promedio (cola atascada).
- **Tras Parte A**: 5 invocaciones × 1 ticker × ~130 s = ~26 s/registro efectivo (5 en paralelo) → **~20-25 min** para vaciar.
- **W24 estable**: ~175 tickers, 6 modelos cada uno = ~175 invocaciones × 130 s / 5 concurrencia = **~75 min** total de análisis, sin tormentas.

---

## Detalles técnicos

- **Archivos a tocar**: `supabase/functions/rix-analyze-v2/index.ts`, `supabase/functions/rix-batch-orchestrator/index.ts`. Sin migraciones de schema obligatorias (B5 opcional).
- **Sin tocar**: prompts, modelos, métricas, scoring, vector store, chat.
- **Rollback**: cada constante es un cambio de 1 línea; revertir en <5 min.
- **Validación post-W24**: cero 504 en cadena, mediana espera <150 s, `triggers_repair_count` <5.

---

## Riesgos y mitigación

- **Rate limit OpenAI**: 30 llamadas concurrentes (5 invocaciones × 6 modelos). GPT-5 tier 4+ admite >5 000 RPM. Margen 100×.
- **Edge function concurrency limit Supabase**: 5 invocaciones del mismo function es seguro (límite plataforma >20).
- **Race en selección de ticker**: el `UPDATE ... WHERE analysis_completed_at IS NULL` ya es atómico optimista; si dos invocaciones eligen el mismo ticker, la segunda hace SKIP limpio y termina rápido, sin gasto de IA.

¿Apruebas y paso a build con Parte A?
