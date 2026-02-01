# Plan: Procesamiento Paralelo del Barrido

## ✅ Estado: IMPLEMENTADO

El sistema de procesamiento paralelo multi-worker está **completamente implementado**.

## Cambios Realizados

### 1. Migración SQL ✅
- Columna `worker_id` añadida a `sweep_progress`
- Índice `idx_sweep_progress_worker_id` creado
- Función `claim_next_sweep_company()` con `FOR UPDATE SKIP LOCKED`

### 2. Orquestador (`rix-batch-orchestrator`) ✅
- Modo `parallel_batch` que lanza N workers simultáneos
- Cada worker usa `claim_next_sweep_company` para lock atómico
- Parámetros: `workers` (default 4), `max_per_worker` (default 50)

### 3. Dashboard (`SweepHealthDashboard.tsx`) ✅
- Selector de workers (2/4/6)
- Botón "Lanzar Workers Paralelos" con gradiente purple-blue
- Handler `handleLaunchParallel` conectado al modo `parallel_batch`

## Uso

```typescript
// Desde el dashboard: Botón "Lanzar Workers Paralelos"

// Programáticamente:
await supabase.functions.invoke('rix-batch-orchestrator', {
  body: { mode: 'parallel_batch', workers: 4 }
});
```

## Resultado Esperado

| Métrica | Antes (Secuencial) | Después (4 Workers) |
|---------|-------------------|---------------------|
| Tiempo total | 6-10 horas | 1.5-3 horas |
| Empresas/hora | ~20 | ~60-80 |
