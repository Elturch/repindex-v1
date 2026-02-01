

# Plan: Corregir Detección de Empresas Sin Registros

## Problema Raíz

El sistema tiene **dos fuentes de verdad no sincronizadas**:

| Fuente | Cuenta | Estado |
|--------|--------|--------|
| `repindex_root_issuers` | 174 empresas | Censo maestro |
| `sweep_progress` | 174 empresas | 13 marcadas "completed" con 0 modelos |
| `rix_runs_v2` | 165 empresas únicas | **9 empresas FALTAN completamente** |

Las 13 empresas problemáticas:
- MAP, IZE, EY-PRIV, KPMG-PRIV, PWC-PRIV, EME-PRIV, FEVER-PRIV, IDEALISTA-PRIV, HOS, META-PRIV, SANITAS, VIA, VIT

Fueron marcadas como "completed" después de timeouts/errores 504, pero **nunca se crearon registros**.

## Solución: Cruzar sweep_progress con rix_runs_v2

Añadir un **paso de reconciliación** que detecte empresas en `sweep_progress` con `status='completed'` pero que NO tienen registros en `rix_runs_v2`, y las resetee a `pending`.

### Nuevo paso en auto_recovery:

```text
ANTES del conteo de estados:
  1. Obtener empresas con status='completed' + models_completed < 6
  2. Verificar si realmente tienen registros en rix_runs_v2
  3. Si NO tienen registros → resetear a 'pending'
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir reconciliación sweep_progress ↔ rix_runs_v2 |
| `src/hooks/useUnifiedSweepMetrics.ts` | Detectar "empresas fantasma" (completed pero sin registros) |
| `src/components/admin/SweepHealthDashboard.tsx` | Mostrar alerta cuando hay empresas sin datos |

## Cambios Técnicos

### Cambio 1: Reconciliación en rix-batch-orchestrator

Antes del conteo de estados (línea ~1276), añadir:

```typescript
// ============================================================
// RECONCILIACIÓN: Detectar empresas "completed" sin registros
// ============================================================
const { data: suspectCompanies } = await supabase
  .from('sweep_progress')
  .select('id, ticker, models_completed')
  .eq('sweep_id', sweepId)
  .eq('status', 'completed')
  .lt('models_completed', 6);  // Menos de 6 modelos

if (suspectCompanies && suspectCompanies.length > 0) {
  console.log(`[${triggerMode}] Checking ${suspectCompanies.length} suspect companies with <6 models`);
  
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const periodFrom = new Date(now);
  periodFrom.setDate(now.getDate() + mondayOffset - 7);
  const periodFromStr = periodFrom.toISOString().split('T')[0];
  
  let resetCount = 0;
  for (const company of suspectCompanies) {
    // Verificar si realmente tiene registros
    const { count } = await supabase
      .from('rix_runs_v2')
      .select('*', { count: 'exact', head: true })
      .eq('05_ticker', company.ticker)
      .gte('06_period_from', periodFromStr);
    
    // Si tiene 0 registros, resetear a pending
    if ((count || 0) === 0) {
      await supabase
        .from('sweep_progress')
        .update({ 
          status: 'pending', 
          error_message: `Reconciled: marked completed but had 0 records`,
          models_completed: 0
        })
        .eq('id', company.id);
      
      console.log(`[${triggerMode}] Reset ghost company: ${company.ticker} (was 'completed' with 0 records)`);
      resetCount++;
    }
  }
  
  if (resetCount > 0) {
    console.log(`[${triggerMode}] Reconciled ${resetCount} ghost companies back to pending`);
  }
}
```

### Cambio 2: Métricas unificadas mejoradas

En `useUnifiedSweepMetrics.ts`, añadir consulta para detectar "ghost companies":

```typescript
// Detectar empresas "fantasma" (completed en sweep_progress pero sin registros en rix_runs_v2)
const ghostCompaniesQuery = await supabase
  .from('sweep_progress')
  .select('ticker, models_completed')
  .eq('sweep_id', sweepId)
  .eq('status', 'completed')
  .lt('models_completed', 1);

const ghostCompanies = ghostCompaniesQuery.data || [];
```

Añadir al retorno:
```typescript
return {
  // ... existentes ...
  ghostCompanies: ghostCompanies.length,  // NUEVO
  ghostTickers: ghostCompanies.map(g => g.ticker),  // NUEVO
};
```

### Cambio 3: Alerta visual en dashboard

Cuando hay `ghostCompanies > 0`:
```tsx
{metrics.ghostCompanies > 0 && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Empresas sin datos detectadas</AlertTitle>
    <AlertDescription>
      {metrics.ghostCompanies} empresas marcadas como completadas pero sin registros: 
      {metrics.ghostTickers.slice(0, 5).join(', ')}
      {metrics.ghostTickers.length > 5 && ` y ${metrics.ghostTickers.length - 5} más`}
    </AlertDescription>
  </Alert>
)}
```

## Resultado Esperado

1. **Inmediato**: Las 13 empresas "fantasma" serán detectadas y reseteadas a `pending`
2. **En próximo CRON**: El sistema las procesará como empresas nuevas
3. **Dashboard**: Mostrará alerta cuando haya inconsistencias
4. **Futuro**: Este tipo de bug no volverá a ocurrir porque hay reconciliación automática

## Plan de Ejecución

1. Aplicar los 3 cambios
2. Desplegar edge function
3. El próximo ciclo CRON (o "Forzar Ahora") detectará y corregirá las 13 empresas
4. Verificar que el conteo sube de 165 a 174 en las siguientes horas

