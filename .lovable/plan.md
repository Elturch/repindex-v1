## Diagnóstico

El sweep `2026-W18` muestra 170 / 175 porque hay **5 empresas huérfanas** (BBVA, ANA, FER, GIGA, EXOLUM-PRIV) atascadas desde hace ~17 horas en `status='pending'` con `started_at` puesto. Quedaron en una zona ciega:

- El cleanup `resetStuckProcessingCompanies` (orchestrator línea 609) solo busca filas con `status='processing'`. Como estas tienen `status='pending'` con `started_at` no nulo (raro, posiblemente crash del worker antes de marcar `processing`), nunca las recoge.
- `repair_search` y el `auto_recovery` buscan empresas con datos parciales en `rix_runs_v2`. Como estas 5 tienen 0 runs, tampoco entran en su criterio.
- Resultado: 18 horas de zombi sin reintentos.

## Plan B: reseteo + parche del watchdog

### 1. Reset SQL inmediato (vía herramienta de inserts/updates)

Ejecutar:
```sql
UPDATE sweep_progress
SET started_at = NULL,
    worker_id = NULL,
    fase = 0,
    retry_count = 0,
    error_message = 'Reset manual: huérfano pending+started_at sin worker durante 17h',
    updated_at = NOW()
WHERE sweep_id = '2026-W18'
  AND status = 'pending'
  AND ticker IN ('BBVA','ANA','FER','GIGA','EXOLUM-PRIV');
```

Esto los devuelve a la cola limpia. El orchestrator los recogerá en su siguiente ciclo (o se dispara manual).

### 2. Disparo manual del orchestrator

Insertar un trigger en `cron_triggers` con `action='auto_recovery'` y `params={"sweep_id":"2026-W18","forced":true}` para que el watchdog procese los 5 inmediatamente sin esperar al CRON.

### 3. Parche del orchestrator (`supabase/functions/rix-batch-orchestrator/index.ts`)

Modificar `resetStuckProcessingCompanies` para detectar también el caso huérfano:

- Renombrarla mentalmente a "stuck/orphan recovery".
- Añadir una segunda query que busque filas `status='pending' AND started_at IS NOT NULL AND started_at < NOW() - 30 min AND (worker_id IS NULL OR worker_id = '')`.
- Resetearlas igual que las `processing` zombi (started_at=null, worker_id=null, fase=0, error_message='Orphan reset: pending sin worker >30min').
- Llamarla desde el ciclo del watchdog (ya se invoca; basta con que ahora cubra ambos casos).

Esto cierra la zona ciega para futuros barridos. Sin tocar:
- Tablas `documents`, `scenarios`, `monitor_reputacional_events`
- Edge functions de scraping/ingesta
- Hotfix `interested_leads`
- Crones existentes
- Admin / RPCs de usuarios

### 4. Verificación

Tras desplegar y resetear:
- Consultar `sweep_progress` y comprobar que los 5 pasan por `processing → completed` en 10–20 min.
- Comprobar que `rix_runs_v2` recibe 6 modelos por ticker.
- Confirmar que el panel `/admin → Sweep` muestra 175/175.

## Detalles técnicos

- **Archivo a editar**: `supabase/functions/rix-batch-orchestrator/index.ts`, función `resetStuckProcessingCompanies` (líneas ~600–642). Añadir segundo bloque de detección huérfana antes del `return`.
- **Threshold huérfano**: 30 min (más conservador que los 5 min de los `processing` zombi, para no interferir con un worker que esté legítimamente arrancando).
- **No se requiere migración de schema** — solo data update + edit de edge function.
- **Despliegue**: la edge function se redeploya automáticamente al guardar.
- **Riesgo**: nulo. El nuevo cleanup solo toca filas que llevan >30 min sin worker — exactamente el patrón de fallo observado.

## Criterio de éxito

1. Los 5 tickers (BBVA, ANA, FER, GIGA, EXOLUM-PRIV) completan en `sweep_progress`.
2. Sweep W18 marca 175/175.
3. El watchdog en próximos barridos detecta y recupera huérfanos automáticamente sin intervención.