

# Plan: Fix Duplicados + Auto-Completion Garantizada

## Diagnóstico del Problema

### Causa Raíz Identificada

El bug está en `rix-search-v2/index.ts` líneas **1060-1076**:

```
Cuando detecta duplicado → return Response inmediatamente
                        → SIN actualizar sweep_progress a "completed"
                        → Empresa queda "pending" eternamente
                        → Se vuelve a intentar cada ciclo
                        → Bucle infinito de reintentos
```

### Evidencia Concreta

| Métrica | Valor |
|---------|-------|
| Empresas "pending" que ya tienen 6/6 modelos | **31** |
| Empresas procesándose repetidamente (ROBOT, NET, PAR) | Logs muestran 2+ intentos |
| Tiempo perdido por duplicado | ~1 min por empresa por ciclo |
| Velocidad actual | ~7 empresas/hora |
| Velocidad teórica (sin duplicados) | ~50-60 empresas/hora |

### Flujo Actual (Bugueado)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Orquestador selecciona empresa "pending"                               │
│                    ↓                                                    │
│ rix-search-v2 detecta 6 modelos ya existen                             │
│                    ↓                                                    │
│ return { skipped: true } ← SIN actualizar sweep_progress               │
│                    ↓                                                    │
│ Empresa sigue "pending"                                                 │
│                    ↓                                                    │
│ Siguiente ciclo: se vuelve a seleccionar                               │
│                    ↓                                                    │
│ BUCLE INFINITO                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Solución: 2 Cambios Críticos

### Cambio 1: Auto-Completion en DUPLICATE-SKIP-EARLY

Modificar `rix-search-v2/index.ts` líneas 1060-1076 para actualizar `sweep_progress` antes de retornar:

```typescript
if (!checkError && existingRecords && existingRecords.length >= 5) {
  console.log(`[DUPLICATE-SKIP-EARLY] ${ticker} - ${existingRecords.length} models already exist`);
  
  // NUEVO: Marcar como completed ANTES de retornar
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  const currentSweepId = `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;

  await supabase
    .from('sweep_progress')
    .update({ 
      status: 'completed', 
      completed_at: new Date().toISOString(),
      models_completed: existingRecords.length
    })
    .eq('sweep_id', currentSweepId)
    .eq('ticker', ticker);

  console.log(`[DUPLICATE-SKIP-EARLY] ${ticker} marked as completed in sweep_progress`);
  
  return new Response(...);
}
```

### Cambio 2: Pre-Limpieza de Duplicados en Orquestador

Añadir paso en `rix-batch-orchestrator` (en `auto_recovery`) para auto-completar empresas que ya tienen datos:

```typescript
// ANTES de seleccionar empresas pendientes:
// Auto-completar empresas que ya tienen 6 modelos pero siguen "pending"
const { data: alreadyComplete } = await supabase
  .from('sweep_progress')
  .select('ticker')
  .eq('sweep_id', sweepId)
  .eq('status', 'pending')
  .limit(50);

if (alreadyComplete?.length) {
  for (const sp of alreadyComplete) {
    const { count } = await supabase
      .from('rix_runs_v2')
      .select('*', { count: 'exact', head: true })
      .eq('05_ticker', sp.ticker)
      .gte('07_period_to', dateFrom);
    
    if ((count || 0) >= 5) {
      await supabase
        .from('sweep_progress')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('sweep_id', sweepId)
        .eq('ticker', sp.ticker);
      console.log(`[auto_recovery] Auto-completed duplicate: ${sp.ticker}`);
    }
  }
}
```

## Flujo Corregido

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Orquestador auto_recovery                                               │
│                    ↓                                                    │
│ PASO 0 (NUEVO): Auto-completar duplicados existentes                   │
│                    ↓                                                    │
│ PASO 1: Seleccionar empresas realmente pendientes                      │
│                    ↓                                                    │
│ rix-search-v2 procesa empresa                                          │
│      ├── Duplicado → Marcar "completed" → Return                       │
│      └── Nueva → Procesar → Marcar "completed" → Return                │
│                    ↓                                                    │
│ Auto-relaunch si hay más pendientes                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Impacto Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Empresas duplicadas bloqueando | 31 | 0 |
| Velocidad efectiva | ~7 emp/h | ~50-60 emp/h |
| Tiempo para completar 66 pendientes | ~10 horas | ~1.5 horas |
| Ciclos desperdiciados en duplicados | Infinitos | 0 |

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/rix-search-v2/index.ts` | Añadir actualización de `sweep_progress` en el bloque DUPLICATE-SKIP-EARLY (líneas 1060-1076) |
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir paso de pre-limpieza de duplicados al inicio de `auto_recovery` |

## Ejecución Inmediata

Tras implementar estos cambios, las 31 empresas duplicadas se auto-completarán en el primer ciclo, liberando slots para las ~35 empresas realmente pendientes. Con una velocidad real de ~50-60 emp/h, el barrido debería completarse en **~1-2 horas adicionales**.

