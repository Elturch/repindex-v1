
# Plan: Sistema de Barrido Estable con Timeouts Amplios

## Diagnóstico Final

El problema actual tiene dos causas:

1. **Reclamación sin espera**: El bucle `while` en `parallel_batch` llama `claim_next_sweep_company` y luego `processCompany`, pero `processCompany` no bloquea porque `rix-search-v2` es una llamada `fetch` que devuelve inmediatamente y los 6 modelos tardan 60-180 segundos en responder.

2. **Sin timeouts por modelo**: La función `callSearchModel()` no tiene ningún límite de tiempo. Si DeepSeek o Qwen tardan 5 minutos, la función espera indefinidamente.

## Arquitectura Propuesta: "Concurrent-Await"

```text
CRON cada 5 minutos (domingos 01:00-09:00 CET)
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│ rix-batch-orchestrator (modo: concurrent_stable)               │
│                                                                │
│  1. Limpiar zombies (>5 min stuck)                            │
│  2. Claim 3 empresas atomicamente                              │
│  3. Procesar las 3 EN PARALELO con Promise.allSettled         │
│  4. ESPERAR a que TODAS terminen (max 3-4 min)                │
│  5. Responder con estadisticas                                 │
└────────────────────────────────────────────────────────────────┘

Resultado: 3 empresas cada 5 min = 36 empresas/hora = ~5 horas
Con optimizacion a 4 empresas = 48/hora = ~3.7 horas
```

## Cambios Tecnicos

### 1. Timeouts por Modelo en `rix-search-v2` (180 segundos)

Agregar `AbortController` con timeout de **180 segundos** por modelo:

```typescript
// En callSearchModel():
async function callSearchModel(config, prompt, tavilyContext?): Promise<...> {
  const startTime = Date.now();
  const TIMEOUT_MS = 180_000; // 180 segundos = 3 minutos por modelo
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const apiKey = Deno.env.get(config.apiKeyEnv);
    if (!apiKey) {
      return { success: false, error: `Missing ${config.apiKeyEnv}`, timeMs: 0 };
    }

    const { headers, body } = config.buildRequest(prompt, apiKey, tavilyContext);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,  // Nuevo: AbortSignal
    });

    clearTimeout(timeoutId);
    
    // ... resto del codigo
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.log(`[rix-search-v2] ${config.displayName} TIMEOUT after ${TIMEOUT_MS}ms`);
      return { 
        success: false, 
        error: `Timeout after ${TIMEOUT_MS/1000}s`, 
        timeMs: Date.now() - startTime 
      };
    }
    
    return { success: false, error: error.message, timeMs: Date.now() - startTime };
  }
}
```

**Resultado**: Cada modelo tiene maximo 3 minutos para responder. Si no responde, se marca como error y se continua con los demas.

### 2. Nuevo Modo `concurrent_stable` en Orquestrador

Reemplazar el bucle roto de `parallel_batch` con un patron que **espera** a que terminen:

```typescript
// NUEVO MODO: concurrent_stable
if (mode === 'concurrent_stable') {
  const CONCURRENT_COMPANIES = 3;  // Procesar 3 empresas simultaneamente
  
  console.log(`[concurrent] Starting concurrent_stable mode...`);
  
  // 1. Limpiar zombies
  const stuckReset = await resetStuckProcessingCompanies(supabase, sweepId, 5);
  
  // 2. Claim N empresas de una vez
  const claimedCompanies: Array<{id: string; ticker: string; issuer_name: string}> = [];
  
  for (let i = 0; i < CONCURRENT_COMPANIES; i++) {
    const { data: claimed } = await supabase.rpc('claim_next_sweep_company', {
      p_sweep_id: sweepId,
      p_worker_id: i
    });
    
    if (claimed && claimed.length > 0) {
      claimedCompanies.push(claimed[0]);
    }
  }
  
  if (claimedCompanies.length === 0) {
    return new Response(JSON.stringify({
      success: true,
      mode: 'concurrent_stable',
      message: 'No hay empresas pendientes',
      completed: true
    }), { headers: corsHeaders });
  }
  
  console.log(`[concurrent] Processing ${claimedCompanies.length} companies: ${claimedCompanies.map(c => c.ticker).join(', ')}`);
  
  // 3. Procesar TODAS en paralelo y ESPERAR a que terminen
  const results = await Promise.allSettled(
    claimedCompanies.map(company => 
      processCompany(
        supabase,
        company.id,
        company.ticker,
        company.issuer_name || company.ticker,
        supabaseUrl,
        supabaseServiceKey
      )
    )
  );
  
  // 4. Contar resultados
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failCount = results.length - successCount;
  
  return new Response(JSON.stringify({
    success: true,
    mode: 'concurrent_stable',
    sweepId,
    processed: claimedCompanies.length,
    succeeded: successCount,
    failed: failCount,
    tickers: claimedCompanies.map(c => c.ticker),
    zombiesReset: stuckReset.count,
  }), { headers: corsHeaders });
}
```

**Resultado**: Cada invocacion procesa **exactamente 3 empresas** en paralelo y **espera** a que todas terminen antes de responder.

### 3. Dashboard Simplificado ("Semaforo de Salud")

Reemplazar el panel complejo por una vista de un vistazo:

```text
+-----------------------------------------------------------------------+
| BARRIDO SEMANAL                                              2026-W06 |
+-----------------------------------------------------------------------+
|                                                                       |
|     [CIRCULO VERDE]    [CIRCULO AMARILLO]    [CIRCULO ROJO]          |
|          112                  63                   3                  |
|      Completados          Pendientes           Fallidos               |
|                                                                       |
|  [========================================                ] 63%       |
|                                                                       |
|  Velocidad: ~40 emp/hora  |  Tiempo restante: ~1.5 horas             |
|                                                                       |
|  [ Limpiar Zombis ]  [ Reanudar ]  [ Pausar ]  [ Reset ]             |
|                                                                       |
|  Estado: Funcionando normalmente                                      |
+-----------------------------------------------------------------------+
```

Eliminar:
- Tarjetas de workers individuales
- Metricas de "analizables" vs "sin datos"
- Graficos complejos

Mantener solo:
- 3 numeros grandes: Completados / Pendientes / Fallidos
- Barra de progreso
- Velocidad estimada y ETA
- 4 botones de accion

### 4. CRON Automatico para Barrido Dominical

Mantener el sistema de fases existente pero usar `concurrent_stable`:

| Fase | Hora CET | Empresas |
|------|----------|----------|
| 1-10 | 01:00-01:45 | 50 |
| 11-20 | 01:50-02:35 | 50 |
| 21-30 | 02:40-03:25 | 50 |
| 31-35 | 03:30-03:55 | 28 |

Total: ~3 horas para 178 empresas.

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/rix-search-v2/index.ts` | Agregar `AbortController` con timeout de 180s por modelo en `callSearchModel()` |
| `supabase/functions/rix-batch-orchestrator/index.ts` | Nuevo modo `concurrent_stable` que procesa N empresas en paralelo ESPERANDO resultados |
| `src/components/admin/SweepHealthDashboard.tsx` | Simplificar UI a semaforo con 3 numeros + barra de progreso + 4 botones |

## Resultado Esperado

| Metrica | Sistema Actual | Despues |
|---------|----------------|---------|
| Timeout por modelo | Ninguno | 180 segundos |
| Empresas reclamadas vs procesadas | Desequilibrado | Equilibrado |
| Zombies | 92 ahora | 0 (auto-cleanup) |
| Tiempo total barrido | 6-10h + intervencion | ~3-4h automatico |
| Comprension dashboard | Baja | Alta |

## Accion Inmediata (SQL para desbloquear)

Antes de implementar, limpiar los zombies actuales:

```sql
UPDATE sweep_progress 
SET status = 'pending', 
    started_at = NULL, 
    worker_id = NULL 
WHERE sweep_id = '2026-W06' 
AND status = 'processing';
```

Esto liberara las ~92 empresas bloqueadas para que el sistema normal continue.
