## Estado del barrido 2026-W25 (domingo 14-jun 00:00 UTC, en ~3,5 h)

### ✅ Lo que está bien
- **175 issuers** activos · barrido W24 cerrado con 1.050 runs (175×6) y 175 `completed` en `sweep_progress`.
- **35 fases de cron** (`rix-sweep-phase-01..35`, 00:00→02:50 UTC domingo) activas, con anon key válido.
- Watchdogs `rix-orchestrator-watchdog` (j54) y `rix-sweep-watchdog-15min` (j49) ejecutándose `succeeded` cada 5 min.
- Edge functions `rix-batch-orchestrator` y `corporate-scrape-orchestrator` bootean OK en logs recientes.

### 🔴 Bloqueante — 2 cron jobs fallan cada ejecución
Ambos usan `current_setting('app.service_role_key', true)` que devuelve `NULL` en este proyecto, produciendo JSON inválido (`Bearer "}`) y fallo inmediato:

1. **`seed-sweep-queue-sunday`** (jobid 55, `0 7 * * 0`) — domingo 07:00 UTC.  
   Consecuencia: la tabla `sweep_queue` no se siembra para W25 (hoy ya está vacía para W24 y W25). El flujo principal por fases no la necesita (W24 cerró bien sin ella), pero el watchdog de cola y el banner "sweep in progress" pueden quedar ciegos.
2. **`rix-sweep-watchdog`** (jobid 56, `*/2 * * * *`) — fallando cada 2 min desde hace horas (ver `cron.job_run_details`). El watchdog de 15 min (j49) sí funciona, así que hay cobertura, pero perdemos la red de seguridad de 2 min durante el barrido.

### Fix propuesto
Reemplazar el header de ambos jobs por el anon key literal `Bearer eyJhbGciOiJIUzI1NiIs...` (mismo patrón que ya usan j10–j43, j49, j54), via `cron.unschedule` + `cron.schedule` en una inserción SQL (no migración, porque contiene claves del proyecto).

```sql
SELECT cron.unschedule('seed-sweep-queue-sunday');
SELECT cron.schedule('seed-sweep-queue-sunday', '0 7 * * 0', $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/seed-sweep-queue',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{"trigger":"cron-weekly"}'::jsonb
  );
$$);

SELECT cron.unschedule('rix-sweep-watchdog');
SELECT cron.schedule('rix-sweep-watchdog', '*/2 * * * *', $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-sweep-watchdog',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
$$);
```

Tras el cambio, verificar con un par de runs en `cron.job_run_details` que ambos vuelven a `status=succeeded` antes de medianoche UTC.

### Sin tocar
Código de edge functions, schema de BD, lógica de orquestación. Solo reescritura de 2 cron jobs.
