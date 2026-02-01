
# Plan: Corregir Bloqueo del Encadenamiento Automático

## Problema Raíz

El sistema muestra "Esperando - Sin actividad" porque:

1. **6 empresas fallidas bloquean todo el encadenamiento**
   - DOM, ROVI, AMS, MAP, LOG, IZE tienen status `failed` con error `HTTP 504`
   - La condición actual requiere `failed === 0` para disparar el encadenamiento
   - Como `failed = 6`, nunca entra al bloque que crea triggers de `repair_analysis`

2. **Los 19 registros analizables quedan en el limbo**
   - Tienen datos de búsqueda (`20_res_gpt_bruto` no es NULL)
   - Pero no tienen score (`09_rix_score` es NULL)
   - El sistema no dispara `repair_analysis` porque está bloqueado

## Lógica Actual (Incorrecta)

```typescript
// Línea 1248 en rix-batch-orchestrator/index.ts
if (pending === 0 && processing === 0 && failed === 0) {
  // Solo entra aquí si NO hay fallidos
  // Verificar datos y disparar encadenamiento...
}
```

## Solución Propuesta

Cambiar la lógica para que el encadenamiento se ejecute cuando:
- `pending === 0 && processing === 0` (independientemente de los `failed`)
- Los `failed` son empresas sin datos de búsqueda, pero no deben bloquear el análisis de las que SÍ tienen datos

### Nuevo Flujo

```text
┌───────────────────────────────────────────────────────────────────┐
│ auto_recovery detecta:                                            │
│   pending=0, processing=0, failed=6                               │
│                    ↓                                              │
│ ANTES: failed > 0 → NO entra al encadenamiento → BLOQUEADO       │
│                                                                   │
│ DESPUÉS: pending=0 && processing=0 → Entra al encadenamiento     │
│                    ↓                                              │
│ 1. ¿Hay registros sin datos? → repair_search (para los failed)   │
│ 2. ¿Hay registros analizables? → repair_analysis (los 19)        │
│ 3. ¿Todo listo? → auto_sanitize                                  │
└───────────────────────────────────────────────────────────────────┘
```

## Archivo a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Cambiar condición de `failed === 0` a permitir encadenamiento incluso con empresas fallidas |

## Cambio Específico

### Línea ~1248: Modificar condición de encadenamiento

```typescript
// ANTES:
if (pending === 0 && processing === 0 && failed === 0) {
  // Encadenamiento solo cuando todo está limpio
}

// DESPUÉS:
if (pending === 0 && processing === 0) {
  // Encadenamiento cuando no hay trabajo activo
  // Los "failed" no bloquean - serán manejados por repair_search
  console.log(`[${triggerMode}] Sweep progress complete (${completed} completed, ${failed} failed). Checking data state...`);
  
  // ... resto del código de encadenamiento igual ...
}
```

### Mejora Adicional: Priorizar repair_search para los failed

Cuando hay empresas `failed`, el sistema debe:
1. Contar cuántos registros faltan datos de búsqueda
2. Si hay registros sin datos → disparar `repair_search`
3. Simultáneamente, si hay registros analizables → disparar `repair_analysis`

```typescript
// Dentro del bloque de encadenamiento:

// PRIORIDAD 1: Si hay registros sin datos de búsqueda (incluye los failed)
if (missingDataCount && missingDataCount > 0) {
  // Insertar repair_search para re-intentar búsqueda
  await insertTriggerIfNotExists('repair_search', { count: missingDataCount, batch_size: 5 });
}

// PRIORIDAD 2: Si hay registros analizables (independiente de los failed)
// NOTA: Esto puede correr EN PARALELO con repair_search
if (analyzableCount && analyzableCount > 0) {
  await insertTriggerIfNotExists('repair_analysis', { count: analyzableCount, batch_size: 5 });
}

// PRIORIDAD 3: Solo sanitizar si no hay más trabajo pendiente
if ((missingDataCount || 0) === 0 && (analyzableCount || 0) === 0) {
  await insertTriggerIfNotExists('auto_sanitize', { sweep_id: sweepId, auto_repair: true });
}
```

## Resultado Esperado

| Estado Actual | Estado Después |
|---------------|----------------|
| 19 registros bloqueados | `repair_analysis` se dispara automáticamente |
| 6 empresas failed ignoradas | `repair_search` se dispara para reintentar |
| Botón "Forzar Ahora" no hace nada | Dispara encadenamiento completo |
| Panel muestra "Sin actividad" | Panel muestra progreso real |

## Validación

Tras el cambio, al presionar "Forzar Ahora":
1. Verás en logs: `Inserting repair_analysis trigger for 19 analyzable records`
2. En 5 minutos (próximo CRON): Se procesarán los 19 registros
3. El panel mostrará progreso: 866/990 → 885/990 → etc.

## Sección Técnica

### Detalle de la condición corregida

```typescript
// Línea ~1247-1250 en rix-batch-orchestrator/index.ts

// CAMBIO 1: Remover condición && failed === 0
if (pending === 0 && processing === 0) {  // Ya no requiere failed === 0
  console.log(`[${triggerMode}] Sweep ${sweepId} progress complete (${completed} completed, ${failed} failed)`);
  
  // CAMBIO 2: Disparar ambos triggers si corresponde (no son mutuamente excluyentes)
  const triggersInserted: string[] = [];
  
  // repair_search para empresas sin datos
  if (missingDataCount && missingDataCount > 0) {
    const { data: existing } = await supabase
      .from('cron_triggers')
      .select('id')
      .eq('action', 'repair_search')
      .eq('status', 'pending')
      .maybeSingle();
    
    if (!existing) {
      await supabase.from('cron_triggers').insert({
        action: 'repair_search',
        params: { sweep_id: sweepId, count: missingDataCount, batch_size: 5 },
        status: 'pending',
      });
      triggersInserted.push('repair_search');
    }
  }
  
  // repair_analysis para registros analizables (puede correr en paralelo)
  if (analyzableCount && analyzableCount > 0) {
    const { data: existing } = await supabase
      .from('cron_triggers')
      .select('id')
      .eq('action', 'repair_analysis')
      .eq('status', 'pending')
      .maybeSingle();
    
    if (!existing) {
      await supabase.from('cron_triggers').insert({
        action: 'repair_analysis',
        params: { sweep_id: sweepId, count: analyzableCount, batch_size: 5 },
        status: 'pending',
      });
      triggersInserted.push('repair_analysis');
    }
  }
  
  // auto_sanitize solo cuando ya no hay trabajo pendiente
  if ((missingDataCount || 0) === 0 && (analyzableCount || 0) === 0) {
    // ... insertar auto_sanitize ...
  }
  
  console.log(`[${triggerMode}] Auto-chain triggers inserted: ${triggersInserted.join(', ') || 'none'}`);
}
```
