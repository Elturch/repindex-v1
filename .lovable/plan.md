

# Plan: Implementar Procesamiento Paralelo del Barrido

## Estado Actual

El plan fue aprobado pero **no se implementó todavía**. El sistema sigue procesando **1 empresa a la vez** (máximo 10 en el modo watchdog, pero secuencialmente con delays).

## Cambios a Implementar

### 1. Nuevo Modo `parallel_batch` en el Orquestador

Añadir al archivo `supabase/functions/rix-batch-orchestrator/index.ts`:

**Nueva función para reclamar empresa con lock optimista:**
```typescript
async function claimNextPendingCompany(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  workerId: number
): Promise<{ id: string; ticker: string; issuer_name: string } | null> {
  // Usar transacción atómica: SELECT + UPDATE en una sola operación
  // Esto evita que 2 workers procesen la misma empresa
  
  const { data, error } = await supabase.rpc('claim_next_sweep_company', {
    p_sweep_id: sweepId,
    p_worker_id: workerId
  });
  
  if (error || !data || data.length === 0) return null;
  return data[0];
}
```

**Nueva función de worker paralelo:**
```typescript
async function runParallelWorker(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  sweepId: string,
  workerId: number,
  maxCompanies: number = 50
): Promise<{ workerId: number; processed: number; errors: number; tickers: string[] }> {
  let processed = 0;
  let errors = 0;
  const tickers: string[] = [];
  
  while (processed + errors < maxCompanies) {
    const company = await claimNextPendingCompany(supabase, sweepId, workerId);
    if (!company) break; // No más empresas pendientes
    
    tickers.push(company.ticker);
    const result = await processCompany(
      supabase, company.id, company.ticker, company.issuer_name || company.ticker,
      supabaseUrl, serviceKey
    );
    
    if (result.success) processed++;
    else errors++;
    
    // Pequeña pausa entre empresas (2s)
    await sleep(2000);
  }
  
  return { workerId, processed, errors, tickers };
}
```

**Nuevo handler de modo parallel_batch:**
```typescript
// En el handler principal, añadir:
if (mode === 'parallel_batch') {
  const workerCount = requestBody.workers || 4;
  const maxPerWorker = requestBody.max_per_worker || 50;
  
  console.log(`[parallel] Launching ${workerCount} parallel workers...`);
  
  // Lanzar N workers en paralelo
  const workerPromises = Array.from({ length: workerCount }, (_, i) =>
    runParallelWorker(supabase, supabaseUrl, supabaseServiceKey, sweepId, i, maxPerWorker)
  );
  
  const results = await Promise.allSettled(workerPromises);
  
  // Agregar estadísticas
  const summary = results.map((r, i) => 
    r.status === 'fulfilled' ? r.value : { workerId: i, processed: 0, errors: 0, tickers: [], error: r.reason }
  );
  
  return new Response(JSON.stringify({
    success: true,
    mode: 'parallel_batch',
    workerCount,
    workers: summary,
    totalProcessed: summary.reduce((acc, w) => acc + w.processed, 0),
    totalErrors: summary.reduce((acc, w) => acc + w.errors, 0),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
```

### 2. Función SQL para Lock Optimista

Crear función PostgreSQL que reclame una empresa atómicamente:

```sql
CREATE OR REPLACE FUNCTION claim_next_sweep_company(
  p_sweep_id TEXT,
  p_worker_id INTEGER
) 
RETURNS TABLE(id UUID, ticker TEXT, issuer_name TEXT) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT sp.id 
    FROM sweep_progress sp
    WHERE sp.sweep_id = p_sweep_id 
      AND sp.status = 'pending'
    ORDER BY sp.fase, sp.ticker
    LIMIT 1
    FOR UPDATE SKIP LOCKED  -- Clave: salta registros bloqueados por otros workers
  )
  UPDATE sweep_progress sp
  SET 
    status = 'processing',
    started_at = NOW(),
    worker_id = p_worker_id
  FROM claimed
  WHERE sp.id = claimed.id
  RETURNING sp.id, sp.ticker, sp.issuer_name;
END;
$$;
```

### 3. Columna worker_id (Migración SQL)

```sql
ALTER TABLE sweep_progress 
ADD COLUMN IF NOT EXISTS worker_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_sweep_progress_worker_id 
ON sweep_progress(sweep_id, worker_id) WHERE worker_id IS NOT NULL;
```

### 4. UI: Botón para Lanzar Workers Paralelos

Añadir al `SweepHealthDashboard.tsx`:

**Estado y handler:**
```typescript
const [launchingParallel, setLaunchingParallel] = useState(false);
const [workerCount, setWorkerCount] = useState(4);

const handleLaunchParallel = async () => {
  setLaunchingParallel(true);
  try {
    const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { mode: 'parallel_batch', workers: workerCount }
    });
    
    if (error) throw error;
    
    toast({
      title: `⚡ ${workerCount} Workers lanzados`,
      description: `Procesando: ${data.totalProcessed} empresas en paralelo`,
    });
    
    await fetchHealthData();
  } catch (error: any) {
    toast({ title: 'Error', description: error.message, variant: 'destructive' });
  } finally {
    setLaunchingParallel(false);
  }
};
```

**Botón en el UI:**
```tsx
<Button 
  variant="default"
  onClick={handleLaunchParallel}
  disabled={launchingParallel || data.healthStatus === 'completed'}
  className="bg-gradient-to-r from-purple-600 to-blue-600"
>
  {launchingParallel ? (
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  ) : (
    <Zap className="mr-2 h-4 w-4" />
  )}
  Lanzar {workerCount} Workers Paralelos
</Button>
```

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir `claimNextPendingCompany()`, `runParallelWorker()`, handler `parallel_batch` |
| `src/components/admin/SweepHealthDashboard.tsx` | Añadir botón "Lanzar Workers Paralelos" con selector de cantidad |
| **Migración SQL** | Añadir columna `worker_id` y función `claim_next_sweep_company()` |

## Resultado Esperado

- **Antes**: 1 empresa a la vez → 6-10 horas para 174 empresas
- **Después**: 4 empresas en paralelo → 1.5-3 horas

El botón aparecerá junto a los otros botones de acción en el dashboard:
```text
[🧟 Limpiar Zombis] [▶️ Reanudar Cascada] [⚡ Lanzar 4 Workers Paralelos]
```

