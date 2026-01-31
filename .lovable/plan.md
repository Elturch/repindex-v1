

# Plan: Actualizar CRONs con cron.alter_job()

## Diagnóstico

El error `permission denied for table job` ocurre porque:
1. La tabla `cron.job` pertenece al sistema pg_cron
2. El `UPDATE` directo está bloqueado incluso para postgres via PostgREST
3. La función `execute_sql` tampoco hereda permisos suficientes

## Solución: Usar cron.alter_job() nativo

pg_cron proporciona una función oficial `cron.alter_job()` que SÍ puede modificar los schedules sin necesidad de UPDATE directo.

## Cambios Técnicos

### 1. Modificar Edge Function `update-cron-schedules`

Cambiaré la estrategia para usar `cron.alter_job(job_id, schedule => '...')` en lugar de UPDATE:

```typescript
// Antes (no funciona):
const sql = `UPDATE cron.job SET schedule = '0 0 * * 0' WHERE jobname = 'rix-sweep-phase-01'`

// Después (usar función nativa):
const sql = `SELECT cron.alter_job(10, schedule => '0 0 * * 0')`
```

Usaré los `jobid` (10-43) que ya tenemos identificados para las 34 fases.

### 2. Mapping de jobid a nuevo schedule

| jobid | Fase | Nuevo Schedule | Hora CET |
|-------|------|----------------|----------|
| 10 | 01 | `0 0 * * 0` | 01:00 |
| 11 | 02 | `5 0 * * 0` | 01:05 |
| 12 | 03 | `10 0 * * 0` | 01:10 |
| ... | ... | ... | ... |
| 42 | 33 | `40 2 * * 0` | 03:40 |
| 43 | 34 | `45 2 * * 0` | 03:45 |

### 3. Archivos a Modificar

- `supabase/functions/update-cron-schedules/index.ts`
  - Reemplazar UPDATE por SELECT cron.alter_job()
  - Usar jobid directos (10-43) en lugar de jobname

## Resultado Esperado

- Los 34 CRONs se actualizan automáticamente
- Fase 01 empieza a las 01:00 CET (00:00 UTC)
- Fase 34 termina a las 03:45 CET (02:45 UTC)
- Total sweep: ~2h 45min cada domingo

## Pasos de Implementación

1. Actualizar la Edge Function con la nueva lógica
2. Desplegar la función
3. Ejecutar la función via curl
4. Verificar que los schedules cambiaron consultando cron.job

