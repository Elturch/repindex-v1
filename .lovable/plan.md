

# Plan: Pipeline Completo Auto-Encadenado

## Problema Actual

El pipeline tiene **3 tipos de registros incompletos** que no se procesan automáticamente:

| Tipo | Cantidad | Descripción | Acción Requerida |
|------|----------|-------------|------------------|
| Sin datos de búsqueda | 105 | `20_res_gpt_bruto = NULL` | Re-búsqueda (rix-search-v2) |
| Datos sin análisis | 19 | Tienen respuesta pero `09_rix_score = NULL` | Análisis (rix-analyze-v2) |
| Respuestas inválidas | ? | Rechazos, muy cortas, sin estructura | Re-búsqueda + re-análisis |

**El auto_recovery actual solo dispara sanitización cuando el sweep está "complete" (pending=0, processing=0, failed=0), pero NO verifica si los datos están realmente completos.**

---

## Solución: 4 Cambios Críticos

### Cambio 1: Corregir useUnifiedSweepMetrics.ts

**Problema:** Calcula `weekStart` incorrectamente, causando datos inconsistentes.

**Solución:** Obtener la fecha directamente del registro más reciente en `rix_runs_v2`.

```typescript
// ANTES: Calcular desde sweepId (erróneo)
const weekStart = getWeekStartFromSweepId(sweepId);

// DESPUÉS: Obtener directamente de la base de datos
const { data: latestPeriod } = await supabase
  .from('rix_runs_v2')
  .select('06_period_from')
  .order('06_period_from', { ascending: false })
  .limit(1);
  
const weekStart = latestPeriod?.[0]?.['06_period_from'];
```

---

### Cambio 2: Auto-Trigger de Re-Búsqueda para Registros Sin Datos

**En `rix-batch-orchestrator` → modo `auto_recovery`:**

Cuando el sweep de `sweep_progress` está "completo" pero hay registros sin datos en `rix_runs_v2`:

```typescript
// Después de verificar sweep complete (pending=0, processing=0, failed=0):

// Verificar registros SIN DATOS de búsqueda
const { count: missingData } = await supabase
  .from('rix_runs_v2')
  .select('*', { count: 'exact', head: true })
  .gte('06_period_from', periodFromStr)
  .is('20_res_gpt_bruto', null);

if (missingData && missingData > 0) {
  console.log(`[auto_recovery] Found ${missingData} records WITHOUT search data, triggering repair_search`);
  
  // Insertar trigger para repair_search
  await supabase.from('cron_triggers').insert({
    action: 'repair_search',  // NUEVO tipo de acción
    params: { sweep_id: sweepId, count: missingData },
    status: 'pending',
  });
}
```

---

### Cambio 3: Auto-Trigger de Análisis para Registros Analizables

**En `rix-batch-orchestrator` → modo `auto_recovery`:**

Cuando hay registros con datos pero sin score:

```typescript
// Verificar registros CON DATOS pero SIN SCORE
const { count: analyzable } = await supabase
  .from('rix_runs_v2')
  .select('*', { count: 'exact', head: true })
  .gte('06_period_from', periodFromStr)
  .is('09_rix_score', null)
  .not('20_res_gpt_bruto', 'is', null);

if (analyzable && analyzable > 0) {
  // Verificar que no haya trigger pendiente
  const { data: existingTrigger } = await supabase
    .from('cron_triggers')
    .select('id')
    .eq('action', 'repair_analysis')
    .eq('status', 'pending')
    .single();

  if (!existingTrigger) {
    console.log(`[auto_recovery] Found ${analyzable} analyzable records, triggering repair_analysis`);
    
    await supabase.from('cron_triggers').insert({
      action: 'repair_analysis',
      params: { sweep_id: sweepId, batch_size: 5 },
      status: 'pending',
    });
  }
}
```

---

### Cambio 4: Añadir Handler para `repair_search` en processCronTriggers

**En `rix-batch-orchestrator` → función `processCronTriggers`:**

```typescript
} else if (trigger.action === 'repair_search') {
  // ============================================================
  // REPAIR_SEARCH: Re-ejecuta búsqueda para registros sin datos
  // ============================================================
  console.log(`[cron_triggers] Processing repair_search trigger ${trigger.id}`);
  
  const triggerParams = trigger.params as { sweep_id?: string; batch_size?: number } | null;
  const batchSize = triggerParams?.batch_size || 5;
  
  // Obtener registros sin datos de búsqueda
  const { data: missingRecords } = await supabase
    .from('rix_runs_v2')
    .select('05_ticker, 02_model_name')
    .gte('06_period_from', periodFromStr)
    .is('20_res_gpt_bruto', null)
    .limit(batchSize);
  
  const results = [];
  
  for (const record of (missingRecords || [])) {
    try {
      // Re-ejecutar búsqueda para este modelo específico
      const response = await fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ 
          ticker: record['05_ticker'],
          single_model: record['02_model_name'],
          repair_mode: true,
        }),
      });
      
      results.push({ 
        ticker: record['05_ticker'], 
        model: record['02_model_name'], 
        success: response.ok 
      });
    } catch (e) {
      results.push({ 
        ticker: record['05_ticker'], 
        model: record['02_model_name'], 
        success: false, 
        error: e.message 
      });
    }
  }
  
  // Marcar como completado
  await supabase.from('cron_triggers')
    .update({ 
      status: 'completed',
      processed_at: new Date().toISOString(),
      result: { processed: results.length, results }
    })
    .eq('id', trigger.id);
}
```

---

### Cambio 5: Auto-Sanitización Mejorada

**En `rix-batch-orchestrator` → cuando sweep está "complete":**

El código actual YA dispara `auto_sanitize` cuando el sweep termina, pero necesita:
1. Verificar también que no hay registros sin datos
2. Verificar que no hay registros analizables pendientes
3. Solo entonces ejecutar sanitización final

```typescript
// Solo sanitizar si:
// 1. Sweep progress está 100% (pending=0, processing=0, failed=0)
// 2. No hay registros sin datos de búsqueda
// 3. No hay registros analizables pendientes

const { count: missingData } = await supabase
  .from('rix_runs_v2')
  .select('*', { count: 'exact', head: true })
  .gte('06_period_from', periodFromStr)
  .is('20_res_gpt_bruto', null);

const { count: analyzable } = await supabase
  .from('rix_runs_v2')
  .select('*', { count: 'exact', head: true })
  .gte('06_period_from', periodFromStr)
  .is('09_rix_score', null)
  .not('20_res_gpt_bruto', 'is', null);

// Encadenar según lo que falte:
if (missingData && missingData > 0) {
  // Prioridad 1: Hay registros sin datos → repair_search
  await insertTrigger('repair_search', { count: missingData });
  
} else if (analyzable && analyzable > 0) {
  // Prioridad 2: Hay registros analizables → repair_analysis
  await insertTrigger('repair_analysis', { batch_size: 5 });
  
} else {
  // Prioridad 3: Todo listo → auto_sanitize (validar respuestas inválidas)
  await insertTrigger('auto_sanitize', { sweep_id: sweepId, auto_repair: true });
}
```

---

## Flujo Completo Encadenado

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ rix-batch-orchestrator (CRON cada 5 min)                               │
│                    ↓                                                    │
│ 1. Reset zombies (>5 min processing)                                   │
│ 2. Auto-completar duplicados                                           │
│ 3. Lanzar búsquedas pendientes (max 3 slots)                          │
│                    ↓                                                    │
│ ¿Sweep progress 100% completado?                                       │
│      ├── NO → Continuar ciclo                                          │
│      └── SÍ → Verificar datos reales                                   │
│                    ↓                                                    │
│ ¿Hay registros SIN DATOS (20_res_gpt_bruto = NULL)?                    │
│      ├── SÍ → Insertar trigger "repair_search"                         │
│      └── NO → Verificar análisis                                       │
│                    ↓                                                    │
│ ¿Hay registros CON DATOS pero SIN SCORE?                               │
│      ├── SÍ → Insertar trigger "repair_analysis"                       │
│      └── NO → Verificar calidad                                        │
│                    ↓                                                    │
│ Insertar trigger "auto_sanitize"                                       │
│                    ↓                                                    │
│ auto_sanitize detecta respuestas inválidas                             │
│      ├── Rechazos de IA                                                │
│      ├── Respuestas muy cortas                                         │
│      └── Sin estructura markdown                                       │
│                    ↓                                                    │
│ auto_repair = true → Insertar trigger "repair_invalid_responses"       │
│                    ↓                                                    │
│ Ciclo se repite hasta 100% completado y validado                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/hooks/useUnifiedSweepMetrics.ts` | Obtener `weekStart` directamente de la BD en lugar de calcularlo |
| `supabase/functions/rix-batch-orchestrator/index.ts` | (1) Añadir verificación de registros sin datos después del sweep complete, (2) Añadir verificación de registros analizables, (3) Añadir handler `repair_search` en `processCronTriggers`, (4) Encadenar triggers según prioridad |

---

## Resultado Esperado

| Antes | Después |
|-------|---------|
| 105 registros sin datos → ignorados | 105 registros → `repair_search` automático |
| 19 registros analizables → ignorados | 19 registros → `repair_analysis` automático |
| Respuestas inválidas → no detectadas | Respuestas → `auto_sanitize` → `repair_invalid_responses` |
| Pipeline se detiene al terminar sweep | Pipeline continúa hasta 100% datos válidos |

---

## Sección Técnica: Orden de Prioridad

El encadenamiento sigue este orden estricto:

1. **`repair_search`** (máxima prioridad): Sin datos = no hay nada que analizar
2. **`repair_analysis`**: Hay datos pero no score = puede analizarse
3. **`auto_sanitize`**: Todo analizado = verificar calidad de respuestas
4. **`repair_invalid_responses`**: Respuestas inválidas = re-ejecutar búsqueda

Cada acción se ejecuta solo cuando la anterior ya no tiene trabajo pendiente, garantizando que el pipeline avanza hacia el 100% de forma determinista.

