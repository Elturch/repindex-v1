## Diagnóstico actualizado

El sistema sí avanza, pero muy por debajo de la promesa de 30 minutos.

Datos vivos observados:

- W23: 688 completados, 361 pendientes.
- Últimos 30 min: 63 completados. Ritmo insuficiente.
- `cron_triggers`: 3 `pending` + 2 `processing` activos.
- Logs: varias invocaciones del orchestrator procesan los mismos IDs de trigger.
- Logs de `rix-analyze-v2`: `Processed: 0, Skipped: 3-5`, es decir, colisiones de locks.
- Analytics: `rix-batch-orchestrator` también cae en 504 a 150s porque espera síncronamente a `rix-analyze-v2`.

Conclusión: el blindaje anti-tormenta existe, pero la arquitectura sigue mal para cerrar W23 rápido.

## Causa raíz

Hay tres fallos operativos juntos:

1. **Claim de triggers no atómico**
   - El orchestrator selecciona triggers `pending`.
   - Luego los marca `processing` sin condición `status='pending'`.
   - Varias instancias pueden reclamar y ejecutar el mismo trigger.

2. **Selección de ticker no reservada antes del fan-out**
   - `rix-analyze-v2` elige ticker al azar desde un pool.
   - No reserva el ticker entero de forma atómica.
   - Varias invocaciones eligen el mismo ticker y hacen `SKIP locked`.

3. **El orchestrator espera al worker**
   - Aunque el worker tarde 90-150s, el orchestrator queda abierto.
   - Si procesa varios triggers, el propio orchestrator llega al 504.
   - Eso deja triggers en estados ambiguos.

## Plan de implementación

### 1. Parar la cola fantasma antes del cambio

Aplicar migración operativa:

- Marcar como `failed` todos los `repair_analysis` en `pending` o `processing`.
- Mensaje: `manual-purge-fire-and-forget-fix`.
- Liberar locks de análisis de W23 con más de 3 minutos, si existen.

### 2. Cambiar `rix-batch-orchestrator` a fire-and-forget real

Para `repair_analysis`:

- Reclamar triggers de forma atómica:
  - `UPDATE ... WHERE id=? AND status='pending'`.
  - Si no devuelve fila, la instancia lo ignora.
- Invocar `rix-analyze-v2` sin esperar el resultado completo.
- Marcar el trigger como `completed/dispatched` inmediatamente después de enviar la petición.
- No re-encolar el mismo trigger según `remaining`.
- El watchdog se encargará de crear nuevos triggers si hacen falta.

Resultado: el orchestrator deja de consumir 150s y no deja triggers colgados por esperar al análisis.

### 3. Cambiar `rix-analyze-v2` a claim atómico por ticker

Sustituir la selección aleatoria débil por reserva real:

- Elegir hasta 20 tickers candidatos con registros pendientes.
- Intentar reservar un ticker completo actualizando sus filas sin `analysis_lock` fresco.
- Añadir un `worker_id` común para ese ticker.
- Releer solo las filas que este worker ha reservado.
- Procesar solo esas filas.
- Si no reserva nada, devolver rápido con `skipped` y sin bloquear.

Esto evita que cinco invocaciones trabajen sobre LLYC o ART2 a la vez.

### 4. Ajustar el modelo de triggers

Mantener:

- `batch_size=1`.
- Máximo 5 triggers vivos.
- Cap anti-tormenta si hay 3 o más vivos.

Cambiar:

- Los triggers dejan de ser “trabajos largos”.
- Pasan a ser “señales de despacho”.
- Si una señal ya fue despachada, no se reutiliza.

### 5. Sembrar 5 triggers limpios después del deploy

Tras desplegar ambos cambios juntos:

- Insertar 5 `repair_analysis` limpios con `batch_size=1`.
- Lanzar una invocación del orchestrator.
- El watchdog continuará rellenando hasta 5 mientras haya pendientes.

### 6. Validación post-deploy

Comprobar en DB/logs:

- `cron_triggers` no acumula `processing` antiguos.
- No aparecen los mismos trigger IDs procesados varias veces.
- `rix-analyze-v2` muestra 5 tickers distintos por ventana.
- Desaparecen los `Processed: 0, Skipped: 5` repetidos.
- `function_edge_logs` del orchestrator pasa de 504 a 200 rápido.
- W23 sube a una velocidad cercana a 5 tickers por 90-150s.

## Resultado esperado

Con 361 registros pendientes, si cada ticker arrastra varios modelos, el cierre debería acelerarse mucho.

La garantía real ya no depende de reintentos ni de azar. Depende de reservas atómicas y dispatch corto.

## Archivos afectados

- `supabase/functions/rix-batch-orchestrator/index.ts`
- `supabase/functions/rix-analyze-v2/index.ts`
- Una migración SQL operativa para purga y liberación de locks.

No se tocará UI.