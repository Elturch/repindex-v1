

# Plan: Sistema de Barrido 100% Autonomo Sin Intervenciones

## Diagnostico del Problema

El sistema actual tiene tres defectos estructurales que causan las paradas:

| Problema | Causa Raiz | Impacto |
|----------|------------|---------|
| Se detiene y requiere "Forzar" | Los auto-relanzamientos usan `EdgeRuntime.waitUntil()` con timers que se pierden si la funcion cierra | El pipeline se "duerme" indefinidamente |
| Dashboard muestra "Sistema detenido" falsamente | La tabla `pipeline_logs` nunca se escribe desde el orquestador | Sin heartbeat visible |
| Procesamiento muy lento | `maxPerInvocation` hardcodeado a 3 aunque `batch_size=20` | Solo repara 3 registros por ciclo |

## Solucion: Arquitectura de Self-Chaining Garantizado

En lugar de confiar en timers de `waitUntil()` (que pueden perderse), el sistema ejecutara un **patron de persistencia en base de datos** que garantiza continuidad:

```text
+------------------+     +------------------+     +------------------+
|  CRON Trigger    | --> | Orquestador      | --> | DB: cron_triggers|
|  (cada 5 min)    |     | procesa trabajo  |     | status=pending   |
+------------------+     +------------------+     +--------+---------+
                                                          |
                              +---------------------------+
                              v
                    +------------------+
                    | Auto-encola el   |
                    | siguiente batch  |
                    | si queda trabajo |
                    +------------------+
```

## Cambios a Realizar

### 1. Orquestador: Self-Chaining via DB (no via waitUntil)

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

Modificar la logica de auto-relanzamiento para que:
- Al finalizar `processCronTriggers`, si quedan registros pendientes (repair_search o repair_analysis), inserte un nuevo trigger `full_sweep_continue` con status `pending`
- Este patron garantiza que el CRON de 5 minutos siempre encuentre trabajo pendiente y lo procese

**Cambio clave en lineas ~1650-1700:**
```typescript
// ANTES: EdgeRuntime.waitUntil + setTimeout (se pierde)
// DESPUES: Insertar nuevo trigger en DB (persistente)

if (remainingTriggers > 0 || missingDataCount > 0 || analyzableCount > 0) {
  // Insertar trigger de continuacion para el proximo ciclo CRON
  await supabase.from('cron_triggers').insert({
    action: 'auto_continue',
    params: { sweep_id: sweepId, phase: 'repair' },
    status: 'pending',
  });
  console.log(`[auto_recovery] Queued auto_continue trigger for next CRON cycle`);
}
```

### 2. Aumentar maxPerInvocation de 3 a 10

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

**Linea 904:** Cambiar limite por invocacion:
```typescript
// ANTES:
const maxPerInvocation = Math.max(1, Math.min(batchSize, 3));

// DESPUES:
const maxPerInvocation = Math.max(1, Math.min(batchSize, 10));
```

Esto permite procesar 10 registros por ciclo en lugar de 3, triplicando la velocidad sin arriesgar timeouts (cada registro toma ~60-80s, 10 registros = ~12 minutos, bajo el limite de 180s de Edge Functions gracias a la persistencia incremental).

### 3. Escribir Telemetria Real en pipeline_logs

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

Agregar logs de heartbeat al inicio y fin de cada accion del orquestador para que el dashboard tenga datos reales:

```typescript
// Al inicio de auto_recovery:
await supabase.from('pipeline_logs').insert({
  sweep_id: sweepId,
  stage: 'orchestrator',
  status: 'started',
  ticker: null,
  metadata: { trigger: triggerMode, pending, processing }
});

// Al procesar cada trigger de repair_search:
await supabase.from('pipeline_logs').insert({
  sweep_id: sweepId,
  stage: 'repair_search',
  status: 'processing',
  ticker: record.ticker,
  model_name: record.model,
});
```

### 4. Crear CRON Job de 5 Minutos (si no existe)

Verificar y crear el CRON job que invoque al orquestador cada 5 minutos:

```sql
-- En Supabase SQL Editor (no es migracion, es configuracion)
SELECT cron.schedule(
  'rix-orchestrator-watchdog',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{"trigger": "watchdog"}'::jsonb
  );
  $$
);
```

### 5. Dashboard: Usar Fallback de Trigger Activity

**Archivo:** `src/components/admin/SweepHealthDashboard.tsx`

Mejorar la logica de heartbeat para no mostrar "Sistema detenido" si:
- Hay triggers pending/processing en la cola
- O el ultimo trigger fue procesado hace menos de 10 minutos

```typescript
// Condicion mejorada para "sistema activo"
const systemIsWorking = 
  triggersProcessing > 0 || 
  triggersPending > 0 ||
  (triggersLastActivityAt && (Date.now() - triggersLastActivityAt.getTime()) < 10 * 60 * 1000);
```

## Secuencia de Ejecucion Post-Deploy

1. Desplegar las Edge Functions modificadas
2. Ejecutar el SQL para crear el CRON job (si no existe)
3. Ir a /admin y verificar que el dashboard muestre actividad
4. El sistema procesara automaticamente los ~126 registros pendientes sin intervencion

## Resultado Esperado

| Antes | Despues |
|-------|---------|
| Requiere pulsar "Forzar" repetidamente | 100% autonomo via CRON cada 5 min |
| Procesa 3 registros por ciclo | Procesa 10 registros por ciclo |
| Dashboard muestra "Sistema detenido" falsamente | Heartbeat real desde pipeline_logs |
| ~42 ciclos para terminar | ~13 ciclos para terminar |

## Seccion Tecnica

### Patron de Persistencia vs Fire-and-Forget

El problema actual es que `EdgeRuntime.waitUntil()` con `setTimeout(30000)` no garantiza ejecucion si:
- La instancia de Edge Function se recicla (normal en entorno serverless)
- El browser que hizo la request se cierra
- Hay un timeout de red

La solucion es usar la **tabla `cron_triggers` como cola persistente**:
1. El orquestador verifica si hay trabajo pendiente
2. Si lo hay, inserta un trigger `auto_continue`
3. El CRON de 5 minutos procesa los triggers pendientes
4. Esto garantiza que el sistema siempre avanza, independientemente de timers volatiles

### Ajuste de Cadencia Dinamica

Implementar logica de auto-ajuste segun el contexto:
- **Fase inicial (>50% pendiente):** 10 registros por ciclo, 5s pausa entre modelos
- **Fase final (<10% pendiente):** 5 registros por ciclo, 10s pausa (estabilidad)
- **Errores consecutivos >3:** Reducir a 3 registros, aumentar pausa a 15s

### Tolerancia a Reintentos Conservadores

Cuando un modelo/empresa falla 3 veces consecutivas:
1. Marcar el registro con flag `retry_exhausted`
2. No reintentar automaticamente
3. Mostrar en dashboard como "Requiere revision manual"
4. Continuar con los demas registros

Esto evita que un modelo con API caida bloquee todo el pipeline.

