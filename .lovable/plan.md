

# Plan: Sistema de Auto-Recuperación Sin Intervención Humana

## Diagnóstico del Problema

### Estado Actual
- 83 empresas pendientes
- 6 fallidas
- 1 zombie (stuck en processing)
- El watchdog CRON existe (`rix-sweep-watchdog-15min`) pero **no está procesando empresas**

### Por Qué Falla el Sistema Actual

```text
┌────────────────────────────────────────────────────────────────────────┐
│ PROBLEMA: El watchdog intenta ESPERAR a que termine rix-search-v2     │
│                                                                        │
│  1. CRON cada 15 min → llama watchdog                                 │
│  2. Watchdog reclama empresa → marca "processing"                     │
│  3. Watchdog llama rix-search-v2 (que tarda 2-3 min)                 │
│  4. ⚠️ Edge function timeout (30s) → watchdog MUERE                   │
│  5. Empresa queda en "processing" FOREVER = ZOMBIE                    │
│  6. rix-search-v2 sigue ejecutando pero nadie recoge el resultado    │
└────────────────────────────────────────────────────────────────────────┘
```

## Solución: Arquitectura "Fire-and-Forget" con Auto-Limpieza

### Principio Fundamental
El watchdog NO debe esperar. Debe:
1. Limpiar zombies
2. Disparar empresas (fire-and-forget)  
3. Terminar inmediatamente

La empresa se marca como "completed" por rix-search-v2 al finalizar, no por el watchdog.

### Arquitectura Propuesta

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ CRON cada 5 minutos (no 15)                                            │
│                                                                         │
│  rix-batch-orchestrator (modo: auto_recovery)                          │
│                                                                         │
│  Paso 1: LIMPIAR ZOMBIES (empresas en processing > 5 min)              │
│          UPDATE sweep_progress SET status='pending' WHERE stuck        │
│                                                                         │
│  Paso 2: VERIFICAR si hay trabajo                                      │
│          Si pending=0 AND processing=0 → sweep completo, salir         │
│                                                                         │
│  Paso 3: RECLAMAR 1 empresa (claim atómico con RPC)                   │
│          Si ya hay 3+ en processing → no reclamar más (evitar sobrecarga) │
│                                                                         │
│  Paso 4: DISPARAR rix-search-v2 SIN ESPERAR (fire-and-forget)         │
│          fetch(...).catch(() => {}) // Ignorar respuesta               │
│          EdgeRuntime.waitUntil() para background task                 │
│                                                                         │
│  Paso 5: RETORNAR INMEDIATAMENTE                                       │
│          El CRON terminó. rix-search-v2 sigue en background.          │
└─────────────────────────────────────────────────────────────────────────┘

Resultado por hora:
- CRON cada 5 min = 12 invocaciones/hora
- 1 empresa por invocación = 12 empresas/hora MÍNIMO
- Si el proceso es rápido, el siguiente CRON dispara otra
- 178 empresas ÷ 12/hora = ~15 horas PEOR CASO
- Con 3 paralelas: ~5 horas
```

## Cambios Técnicos

### 1. Nuevo Modo `auto_recovery` en Orquestador

```typescript
// NUEVO: Modo auto_recovery (fire-and-forget)
if (trigger === 'watchdog' || trigger === 'auto_recovery') {
  const MAX_CONCURRENT = 3; // Máximo 3 empresas procesando simultáneamente
  
  // 1. SIEMPRE limpiar zombies primero (> 5 min stuck)
  const stuckReset = await resetStuckProcessingCompanies(supabase, sweepId, 5);
  
  // 2. Contar estado actual
  const { data: statusData } = await supabase
    .from('sweep_progress')
    .select('status')
    .eq('sweep_id', sweepId);
  
  const processing = statusData?.filter(s => s.status === 'processing').length || 0;
  const pending = statusData?.filter(s => s.status === 'pending').length || 0;
  
  // 3. Si ya hay MAX_CONCURRENT procesando, no disparar más
  if (processing >= MAX_CONCURRENT) {
    return { action: 'throttled', processing, pending, stuckReset: stuckReset.count };
  }
  
  // 4. Si no hay pendientes, sweep completo
  if (pending === 0 && processing === 0) {
    return { action: 'complete', message: 'Sweep finished' };
  }
  
  // 5. Reclamar UNA empresa (atomic claim)
  const { data: claimed } = await supabase.rpc('claim_next_sweep_company', {
    p_sweep_id: sweepId,
    p_worker_id: Date.now() % 1000
  });
  
  if (!claimed || claimed.length === 0) {
    return { action: 'no_work', pending, processing };
  }
  
  const company = claimed[0];
  
  // 6. FIRE-AND-FORGET: Disparar rix-search-v2 SIN esperar
  EdgeRuntime.waitUntil(
    fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ ticker: company.ticker, issuer_name: company.issuer_name }),
    }).catch(e => console.error(`[auto_recovery] Fire error for ${company.ticker}:`, e))
  );
  
  // 7. Retornar INMEDIATAMENTE
  return {
    action: 'fired',
    ticker: company.ticker,
    processing: processing + 1,
    pending: pending - 1,
    stuckReset: stuckReset.count,
  };
}
```

### 2. Modificar rix-search-v2 para Auto-Completar

El problema es que `rix-search-v2` no actualiza `sweep_progress` al terminar. Necesita hacerlo:

```typescript
// Al FINAL de rix-search-v2, después de guardar resultados:

// Marcar empresa como completada en sweep_progress
const currentSweepId = getCurrentSweepId(); // Misma función que el orquestador

const { error: updateError } = await supabase
  .from('sweep_progress')
  .update({ 
    status: 'completed', 
    completed_at: new Date().toISOString(),
    models_completed: successfulModels.length
  })
  .eq('sweep_id', currentSweepId)
  .eq('ticker', ticker);

if (updateError) {
  console.error(`[rix-search-v2] Failed to update sweep_progress for ${ticker}:`, updateError);
}
```

### 3. Aumentar Frecuencia del CRON a 5 Minutos

El CRON actual es cada 15 minutos. Con el nuevo modelo fire-and-forget, necesitamos más frecuencia:

```sql
-- Actualizar el CRON existente
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'rix-sweep-watchdog-15min'),
  schedule := '*/5 * * * *'  -- Cada 5 minutos, TODO EL DÍA, TODOS LOS DÍAS
);

-- Renombrar para reflejar el cambio
UPDATE cron.job SET jobname = 'rix-auto-recovery-5min' 
WHERE jobname = 'rix-sweep-watchdog-15min';
```

### 4. Dashboard Ultra-Simplificado con Indicador de Salud

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ BARRIDO SEMANAL 2026-W06                                    [AUTO-ON] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│     ████████████████████████░░░░░░░░░░░░░░░░░░  50%                   │
│                                                                         │
│     ✓ 88 completadas        ⏳ 83 pendientes        ✗ 6 fallidas      │
│                                                                         │
│     Estado: 🟢 FUNCIONANDO                                             │
│     Última actividad: hace 2 minutos                                   │
│     Próximo CRON: en 3 minutos                                         │
│     Velocidad: ~12 empresas/hora                                       │
│     Tiempo restante estimado: ~7 horas                                 │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ ACCIONES MANUALES (solo si es necesario)                               │
│                                                                         │
│ [ Limpiar Zombies ]  [ Forzar Procesamiento ]  [ Pausar Auto ]        │
└─────────────────────────────────────────────────────────────────────────┘
```

Indicadores de estado:
- 🟢 FUNCIONANDO: Hay actividad en los últimos 5 minutos
- 🟡 LENTO: Última actividad hace 5-15 minutos
- 🔴 ATASCADO: Sin actividad en 15+ minutos

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Nuevo modo `auto_recovery` con fire-and-forget usando `EdgeRuntime.waitUntil()` |
| `supabase/functions/rix-search-v2/index.ts` | Auto-actualizar `sweep_progress` al completar cada empresa |
| `src/components/admin/SweepHealthDashboard.tsx` | Simplificar UI, mostrar indicador AUTO-ON, tiempo restante estimado |
| SQL | Actualizar CRON a cada 5 minutos y renombrar |

## Resultado Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Intervención manual requerida | Sí, constante | No |
| Frecuencia de auto-recuperación | Cada 15 min (rota) | Cada 5 min (funciona) |
| Zombies acumulados | Muchos | 0 (limpieza automática) |
| Tiempo para completar 178 empresas | Indefinido | ~5-7 horas |
| Visibilidad del estado | Confusa | Clara (semáforo simple) |

## Flujo Completo

```text
Domingo 01:00 CET
     │
     ▼
CRON rix-sweep-phase-01 → Inicializa sweep → Procesa fase 1 (5 empresas)
     │
     ▼
CRON rix-sweep-phase-02 → Procesa fase 2
     │
     ▼
... (35 fases, ~3 horas)
     │
     ▼
CRON auto-recovery (cada 5 min TODO EL DÍA)
     │
     ├── ¿Hay zombies? → Limpiar
     ├── ¿Hay < 3 procesando? → Disparar 1 más
     ├── ¿Sweep completo? → No hacer nada
     │
     ▼
Lunes 06:00: Sweep 100% completo automáticamente
     │
     ▼
CRON lunes AM: Sanificación automática de respuestas
```

