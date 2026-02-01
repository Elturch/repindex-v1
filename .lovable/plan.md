

# Plan: Feedback Visual y Procesamiento Inmediato de Triggers

## Problema Actual

Cuando presionas "Forzar Ahora":
1. ✅ El sistema detecta 916 registros sin datos + 23 analizables
2. ✅ Inserta triggers `repair_search` y `repair_analysis` en la BD
3. ❌ **NO los procesa inmediatamente** - esperan hasta el próximo CRON (5 min)
4. ❌ **La UI no muestra feedback** - solo dice "Auto-recovery disparado" sin detalles

El flujo actual en `rix-batch-orchestrator`:
```
processCronTriggers()  →  verificar encadenamiento  →  insertar nuevos triggers
                                                              ↓
                                    (triggers quedan pendientes para próximo CRON)
```

## Solución: 2 Cambios

### Cambio 1: Procesar Triggers Inmediatamente Después de Insertarlos

Añadir una **segunda llamada** a `processCronTriggers()` después de insertar los nuevos triggers:

```typescript
// DESPUÉS de insertar triggers (línea ~1340):
if (triggersInserted.length > 0) {
  console.log(`[${triggerMode}] Auto-chain triggers inserted: ${triggersInserted.join(', ')}`);
  
  // NUEVO: Procesar inmediatamente los triggers recién creados
  console.log(`[${triggerMode}] Processing newly inserted triggers...`);
  const immediateResults = await processCronTriggers(supabase, supabaseUrl, supabaseServiceKey);
  console.log(`[${triggerMode}] Immediate processing: ${immediateResults.length} triggers processed`);
}
```

### Cambio 2: Mostrar Estado de Triggers en la UI

En `SweepHealthDashboard.tsx`, añadir consulta y visualización de triggers pendientes:

```typescript
// Nueva query para obtener triggers pendientes
const { data: pendingTriggers } = await supabase
  .from('cron_triggers')
  .select('action, created_at, params')
  .eq('status', 'pending')
  .in('action', ['repair_search', 'repair_analysis', 'auto_sanitize'])
  .order('created_at', { ascending: false });

// Mostrar en la UI:
// 🔄 2 triggers pendientes: repair_search (952), repair_analysis (23)
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir segunda llamada a `processCronTriggers()` después de insertar triggers |
| `src/components/admin/SweepHealthDashboard.tsx` | Mostrar triggers pendientes y su estado |

## Resultado Esperado

### Antes (actual):
1. Presionar "Forzar Ahora" → Toast: "Auto-recovery disparado"
2. Esperar 5 minutos para que el CRON procese los triggers
3. No hay visibilidad del estado

### Después:
1. Presionar "Forzar Ahora" → Toast: "Auto-recovery disparado"
2. **Inmediatamente**: Los triggers se procesan
3. **UI muestra**: "🔄 Procesando: repair_search (5/952), repair_analysis (0/23)"
4. El progreso aumenta visiblemente cada 10 segundos (auto-refresh)

## Flujo Corregido

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Presionar "Forzar Ahora"                                                │
│                    ↓                                                    │
│ auto_recovery:                                                          │
│   1. processCronTriggers() - procesar existentes                       │
│   2. Verificar datos reales                                            │
│   3. Insertar repair_search + repair_analysis                          │
│   4. processCronTriggers() - NUEVO: procesar los recién insertados    │
│                    ↓                                                    │
│ UI muestra:                                                             │
│   "✅ Procesando 2 triggers: repair_search, repair_analysis"           │
│   Barra de progreso actualizada                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Sección Técnica

### Cambio en rix-batch-orchestrator (línea ~1345)

```typescript
// DESPUÉS del bloque de inserción de triggers:
if (triggersInserted.length > 0) {
  console.log(`[${triggerMode}] Auto-chain triggers inserted: ${triggersInserted.join(', ')}`);
  
  // ========== NUEVO: Procesar inmediatamente ==========
  // Esto evita esperar 5 minutos para el próximo CRON
  console.log(`[${triggerMode}] Executing immediate trigger processing...`);
  try {
    const immediateResults = await processCronTriggers(supabase, supabaseUrl, supabaseServiceKey);
    if (immediateResults.length > 0) {
      console.log(`[${triggerMode}] Immediate processing completed: ${immediateResults.map(r => r.action).join(', ')}`);
    }
  } catch (e) {
    console.error(`[${triggerMode}] Immediate processing error:`, e);
    // No fallar la request - el CRON lo procesará después
  }
}
```

### Cambio en SweepHealthDashboard.tsx

Añadir hook para consultar triggers pendientes:

```typescript
// Nueva query dentro del componente o en useUnifiedSweepMetrics
const [pendingTriggers, setPendingTriggers] = useState<Array<{
  action: string;
  created_at: string;
  params: { count?: number };
}>>([]);

useEffect(() => {
  const fetchTriggers = async () => {
    const { data } = await supabase
      .from('cron_triggers')
      .select('action, created_at, params')
      .eq('status', 'pending')
      .in('action', ['repair_search', 'repair_analysis', 'auto_sanitize']);
    setPendingTriggers(data || []);
  };
  fetchTriggers();
  const interval = setInterval(fetchTriggers, 10000);
  return () => clearInterval(interval);
}, []);
```

Añadir visualización:

```tsx
{pendingTriggers.length > 0 && (
  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg mb-4">
    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="font-medium">
        {pendingTriggers.length} trigger{pendingTriggers.length > 1 ? 's' : ''} en cola:
      </span>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      {pendingTriggers.map((t, i) => (
        <Badge key={i} variant="outline" className="bg-white dark:bg-gray-800">
          {t.action} ({(t.params as any)?.count || '?'} registros)
        </Badge>
      ))}
    </div>
  </div>
)}
```

