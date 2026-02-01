
# Plan: Procesamiento Paralelo del Barrido (Multi-Worker)

## Diagnóstico del Problema

El barrido actual procesa **1 empresa a la vez**:
- Cada empresa tarda 30-120 segundos (6 llamadas a APIs de IA)
- Con 174 empresas = **5-10 horas** de procesamiento secuencial
- El objetivo es completar en **~3 horas**

### Arquitectura Actual (Secuencial)
```text
[Watchdog CRON]
     │
     ▼
[Empresa 1] ─────────────────> 60s
     │
     ▼
[Empresa 2] ─────────────────> 60s
     │
     ...
     │
     ▼
[Empresa 174] ───────────────> 60s
     
Total: 174 x 60s = 2.9 horas (ideal)
Pero en realidad: timeouts, reintentos, delays = 6-10 horas
```

## Solución: Workers Paralelos

Lanzar **N workers simultáneos** que procesen empresas diferentes al mismo tiempo:

### Arquitectura Propuesta (Paralela)
```text
[Dashboard Admin]
     │
     ├── [Worker 1] ──> Empresa A ──> Empresa E ──> ...
     ├── [Worker 2] ──> Empresa B ──> Empresa F ──> ...
     ├── [Worker 3] ──> Empresa C ──> Empresa G ──> ...
     └── [Worker 4] ──> Empresa D ──> Empresa H ──> ...

Con 4 workers: 174 empresas ÷ 4 = ~44 por worker
Tiempo teórico: ~44 x 60s = 44 minutos por worker
Total paralelo: ~1-2 horas
```

## Implementación Técnica

### 1. Nuevo Endpoint: `parallel_batch` en rix-batch-orchestrator

El orquestador tendrá un nuevo modo que lanza múltiples invocaciones paralelas:

```typescript
// Modo parallel_batch: Lanza N workers simultáneamente
if (mode === 'parallel_batch') {
  const workerCount = params.workers || 4;
  const results = await Promise.allSettled(
    Array.from({ length: workerCount }, (_, i) => 
      runParallelWorker(supabase, supabaseUrl, serviceKey, i)
    )
  );
  return { success: true, workers: results.length, ... };
}
```

### 2. Función `runParallelWorker`

Cada worker:
1. Obtiene **1 empresa pendiente** (con lock optimista)
2. La procesa
3. Repite hasta que no haya más

```typescript
async function runParallelWorker(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  workerId: number
): Promise<{ workerId: number; processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  
  while (true) {
    // Obtener empresa pendiente (lock optimista)
    const company = await claimNextCompany(supabase, sweepId, workerId);
    if (!company) break; // No más empresas
    
    const result = await processCompany(supabase, company, ...);
    if (result.success) processed++;
    else errors++;
  }
  
  return { workerId, processed, errors };
}
```

### 3. Lock Optimista para Evitar Colisiones

Usamos una actualización atómica para que dos workers no procesen la misma empresa:

```sql
-- Cada worker "reclama" una empresa de forma atómica
UPDATE sweep_progress 
SET status = 'processing', 
    started_at = now(),
    worker_id = $workerId  -- Nuevo campo para tracking
WHERE id = (
  SELECT id FROM sweep_progress 
  WHERE sweep_id = $sweepId 
  AND status = 'pending'
  ORDER BY fase, ticker
  LIMIT 1
  FOR UPDATE SKIP LOCKED  -- ¡Clave! Salta registros bloqueados
)
RETURNING *;
```

### 4. UI: Botón "Lanzar Procesamiento Paralelo"

En `SweepHealthDashboard.tsx`:

```tsx
const handleLaunchParallel = async () => {
  setLaunchingParallel(true);
  const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
    body: { mode: 'parallel_batch', workers: 4 }
  });
  // Mostrar resultado...
};

// En el UI:
<Button onClick={handleLaunchParallel}>
  <Zap className="mr-2 h-4 w-4" />
  Lanzar 4 Workers Paralelos
</Button>
```

### 5. Visualización de Workers Activos

Añadir indicador de workers activos en el dashboard:

```text
┌─────────────────────────────────────────────────────────────────┐
│ 🟢 BARRIDO ACTIVO                        2026-W06              │
├─────────────────────────────────────────────────────────────────┤
│ [●●●●] 4 Workers activos                                       │
│ ├── Worker 1: BBVA (45s)                                       │
│ ├── Worker 2: Santander (32s)                                  │
│ ├── Worker 3: Telefónica (18s)                                 │
│ └── Worker 4: Inditex (61s)                                    │
│                                                                 │
│ 75/174 empresas (43%)    ⏱️ 1h 12m    📊 ETA: 45 min           │
└─────────────────────────────────────────────────────────────────┘
```

## Cambios en Archivos

### Archivo 1: `supabase/functions/rix-batch-orchestrator/index.ts`

| Cambio | Descripción |
|--------|-------------|
| Añadir función `claimNextCompany()` | Lock optimista con `FOR UPDATE SKIP LOCKED` |
| Añadir función `runParallelWorker()` | Loop de procesamiento por worker |
| Añadir modo `parallel_batch` | Handler para lanzar N workers |
| Modificar respuesta | Incluir estadísticas de workers |

### Archivo 2: `src/components/admin/SweepHealthDashboard.tsx`

| Cambio | Descripción |
|--------|-------------|
| Añadir botón "Lanzar Workers Paralelos" | Con selector de cantidad (2/4/6) |
| Añadir indicador de workers activos | Mostrar cuántos están procesando |
| Actualizar `HeartbeatIndicator` | Mostrar multi-procesamiento |

### Archivo 3: Migración SQL (opcional)

```sql
-- Añadir columna worker_id para tracking
ALTER TABLE sweep_progress 
ADD COLUMN IF NOT EXISTS worker_id INTEGER;
```

## Consideraciones de Rate Limits

Las APIs de IA tienen límites de requests/minuto:
- **OpenAI (ChatGPT)**: 60 RPM (tier básico)
- **Perplexity**: 20 RPM
- **xAI (Grok)**: 60 RPM
- **Gemini**: 60 RPM
- **DeepSeek/Qwen**: más flexibles

Con **4 workers paralelos**, cada uno haciendo 6 llamadas por empresa:
- 4 workers × 6 modelos = 24 requests simultáneos (posiblemente)
- Pero en realidad son secuenciales dentro de cada empresa

**Recomendación**: Empezar con **4 workers** y monitorizar errores de rate limit. Si hay muchos 429, reducir a 2-3.

## Resultado Esperado

| Métrica | Antes (Secuencial) | Después (4 Workers) |
|---------|-------------------|---------------------|
| Tiempo total | 6-10 horas | 1.5-3 horas |
| Empresas/hora | ~20 | ~60-80 |
| Utilización CPU | Baja | Media |
| Rate limit riesgo | Bajo | Medio (monitorizar) |

## Pasos de Implementación

1. **Modificar orquestador** con modo `parallel_batch`
2. **Añadir función de lock optimista** 
3. **Actualizar dashboard** con botón y visualización
4. **Probar con 2 workers** primero
5. **Escalar a 4-6** si no hay errores de rate limit
