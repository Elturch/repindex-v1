

# Plan: Activar el Flujo Completo de Barrido + Sanitización

## Diagnóstico del Problema

El sistema tiene las piezas correctas pero faltan conexiones:

| Componente | Estado Actual | Problema |
|------------|---------------|----------|
| Botón "Forzar Ahora" | Llama a `auto_recovery` | Solo dispara empresas pendientes, no ejecuta triggers |
| Triggers insertados | `repair_search`, `repair_analysis`, `auto_sanitize` | Se insertan pero esperan al CRON (5 min) para ejecutarse |
| Sanitización | Código existe en `rix-quality-watchdog` | Nunca se llama porque los triggers no se procesan |

## Solución: Botón "Completar Barrido"

Añadir un nuevo botón que ejecute el flujo completo:

```text
┌────────────────────────────────────────────────────────────────┐
│ FLUJO "COMPLETAR BARRIDO"                                       │
│                                                                  │
│  1. Limpiar zombies (empresas stuck en processing)             │
│  2. Reconciliar ghost companies (completed pero sin datos)      │
│  3. Procesar triggers pendientes (repair_search + analysis)     │
│  4. Si no hay más trabajo → insertar + ejecutar auto_sanitize   │
│  5. Refrescar métricas y mostrar resultado                      │
└────────────────────────────────────────────────────────────────┘
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/admin/SweepHealthDashboard.tsx` | Añadir botón "Completar Barrido" con flujo secuencial |
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir modo `complete_sweep` que ejecuta todo el ciclo |

## Cambios Técnicos

### Cambio 1: Nuevo modo `complete_sweep` en el orquestador

Este modo hace todo en secuencia sin esperar al CRON:

```typescript
// MODO COMPLETE_SWEEP: Ejecuta todo el ciclo hasta sanitización
if (mode === 'complete_sweep') {
  console.log('[complete_sweep] Starting full sweep completion...');
  
  // 1. Limpiar zombies
  const zombieReset = await resetStuckProcessingCompanies(supabase, sweepId, 5);
  
  // 2. Reconciliar ghosts
  // ... (código existente de reconciliación)
  
  // 3. Verificar estado de datos
  const dataState = await getRealDataState(supabase, periodFromStr);
  
  // 4. Si hay trabajo, procesar repair_search
  if (dataState.missingData > 0) {
    await executeRepairSearch(supabase, supabaseUrl, serviceKey, batchSize);
  }
  
  // 5. Si hay analizables, procesar repair_analysis
  if (dataState.analyzable > 0) {
    await executeRepairAnalysis(supabase, supabaseUrl, serviceKey, batchSize);
  }
  
  // 6. Si todo completo, ejecutar sanitización
  if (dataState.missingData === 0 && dataState.analyzable === 0) {
    await executeSanitization(supabase, supabaseUrl, serviceKey);
  }
  
  return { success: true, summary: {...} };
}
```

### Cambio 2: Nuevo botón en el Dashboard

```tsx
// Estado para el nuevo botón
const [completing, setCompleting] = useState(false);

const handleCompleteSweep = async () => {
  if (!metrics) return;
  setCompleting(true);
  
  try {
    // Llamar al modo complete_sweep
    const { data } = await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { mode: 'complete_sweep' },
    });
    
    toast({
      title: '✅ Barrido completado',
      description: data?.summary || 'Proceso finalizado',
    });
    
    refreshAllMetrics();
  } catch (e) {
    toast({ title: 'Error', description: e.message, variant: 'destructive' });
  } finally {
    setCompleting(false);
  }
};

// Nuevo botón en la UI
<Button 
  size="sm" 
  variant="default"
  onClick={handleCompleteSweep} 
  disabled={completing}
  className="bg-gradient-to-r from-green-600 to-blue-600"
>
  {completing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
  Completar Barrido
</Button>
```

## Alternativa Más Simple: Procesar Triggers Inmediatamente

Si no quieres añadir un modo nuevo, podemos modificar el botón "Forzar Ahora" para que:

1. Llame a `auto_recovery` (dispara empresas)
2. Luego llame a `process_triggers_only` (procesa triggers pendientes)
3. Repita hasta que no haya más trabajo

```tsx
const handleForce = async () => {
  setForcing(true);
  try {
    // 1. Disparar auto_recovery
    await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { trigger: 'auto_recovery' },
    });
    
    // 2. Procesar triggers pendientes inmediatamente
    await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { process_triggers_only: true },
    });
    
    toast({ title: '⚡ Procesado' });
    refreshAllMetrics();
  } catch (e) {
    toast({ title: 'Error', description: e.message, variant: 'destructive' });
  } finally {
    setForcing(false);
  }
};
```

## Recomendación

**Implementar la alternativa simple primero** (modificar el botón existente) porque:
- Usa código existente (`process_triggers_only` ya existe)
- No requiere nuevo modo en el orquestador
- Resuelve el problema de forma inmediata

Si después de probarlo sigue sin funcionar, entonces añadimos el modo `complete_sweep` más robusto.

## Cambios Específicos

### En `SweepHealthDashboard.tsx`

```typescript
// MODIFICAR handleForce para que también procese triggers
const handleForce = async () => {
  if (!metrics) return;
  setForcing(true);
  try {
    // PASO 1: Disparar auto_recovery (limpia zombies, reconcilia ghosts, dispara empresas)
    const { data: recoveryData } = await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { trigger: 'auto_recovery' },
    });
    
    console.log('[handleForce] Recovery:', recoveryData);
    
    // PASO 2: Procesar triggers pendientes inmediatamente (no esperar al CRON)
    const { data: triggersData } = await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { process_triggers_only: true },
    });
    
    console.log('[handleForce] Triggers:', triggersData);
    
    // Mostrar resultado combinado
    const firedCount = recoveryData?.firedCount || 0;
    const triggersProcessed = triggersData?.triggersProcessed || 0;
    
    if (firedCount > 0 || triggersProcessed > 0) {
      toast({ 
        title: '⚡ Procesado', 
        description: `${firedCount} empresas + ${triggersProcessed} triggers ejecutados`
      });
    } else {
      toast({ 
        title: '✅ Sin trabajo pendiente', 
        description: recoveryData?.action || 'El barrido está al día'
      });
    }
    
    refreshAllMetrics();
  } catch (e: any) {
    toast({ title: 'Error', description: e.message, variant: 'destructive' });
  } finally {
    setForcing(false);
  }
};
```

### Añadir botón "Procesar Triggers" (opcional, para debugging)

```tsx
// Estado
const [processingTriggers, setProcessingTriggers] = useState(false);

const handleProcessTriggers = async () => {
  setProcessingTriggers(true);
  try {
    const { data } = await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { process_triggers_only: true },
    });
    toast({ 
      title: '🔧 Triggers procesados', 
      description: data?.triggersProcessed 
        ? `${data.triggersProcessed} ejecutados: ${data.triggers?.map(t => t.action).join(', ')}`
        : 'No hay triggers pendientes'
    });
    refreshAllMetrics();
  } catch (e: any) {
    toast({ title: 'Error', description: e.message, variant: 'destructive' });
  } finally {
    setProcessingTriggers(false);
  }
};

// Botón en UI (junto a los otros)
{pendingTriggers.length > 0 && (
  <Button 
    size="sm" 
    variant="secondary"
    onClick={handleProcessTriggers} 
    disabled={processingTriggers}
  >
    {processingTriggers ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Timer className="mr-1 h-3 w-3" />}
    Procesar {pendingTriggers.length} Triggers
  </Button>
)}
```

## Resultado Esperado

1. **Al pulsar "Forzar Ahora"**:
   - Limpia zombies
   - Reconcilia empresas fantasma
   - Dispara empresas pendientes
   - **NUEVO**: Procesa inmediatamente los triggers (repair_search, repair_analysis, auto_sanitize)
   
2. **Visibilidad en Dashboard**:
   - Si hay triggers pendientes, se muestra un botón adicional "Procesar N Triggers"
   - El estado cambia a "REPAIRS_PENDING" → "CHECKING_DATA" → "COMPLETE" de forma visible

3. **Ciclo completo**:
   - Pulsando "Forzar Ahora" varias veces (o una vez si no hay trabajo) el barrido llegará a "COMPLETE" y se ejecutará la sanitización automáticamente

