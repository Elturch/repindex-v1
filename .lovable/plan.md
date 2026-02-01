

# Plan: Estabilización del Pipeline en 2 Fases

## Diagnóstico del Problema

Tras analizar el código, identifico **3 problemas raíz** que causan las inconsistencias:

### Problema 1: Condiciones de encadenamiento no atómicas
El orquestador intenta hacer demasiadas cosas en un solo ciclo:
- Limpiar zombies
- Auto-completar duplicados  
- Contar estados
- Procesar triggers existentes
- Insertar nuevos triggers
- Procesar los triggers recién insertados

Si cualquier paso falla o toma demasiado tiempo, el siguiente ciclo CRON empieza antes de terminar, causando **condiciones de carrera**.

### Problema 2: Conteos inconsistentes entre tablas
- `sweep_progress` cuenta empresas (174)
- `rix_runs_v2` cuenta registros (174 x 6 = 1044 esperados)
- Los conteos de "missing data" usan `rix_runs_v2` pero el estado "failed" viene de `sweep_progress`
- Esto causa que `repair_search` calcule mal: `(missingDataCount || 0) + (failed * 6)`

### Problema 3: Falta de estado por modelo
El sistema actual trata a cada empresa como una unidad, pero:
- Una empresa puede tener 5/6 modelos con datos y 1 fallido
- No hay forma de reintentar SOLO ese modelo fallido sin tocar los demás
- El "repair_search" intenta buscar registros sin `20_res_gpt_bruto`, pero esa columna es específica de ChatGPT, no de todos los modelos

---

## Fase 1: Estabilización Inmediata (Sin cambiar arquitectura)

### Cambio 1: Unificar fuente de verdad para conteos
Actualmente hay 2 fuentes: `sweep_progress` y `rix_runs_v2`. Esto causa discrepancias.

**Solución**: Crear función única `getRealDataState()` que devuelva:
```typescript
{
  // Por empresa
  companiesComplete: number,     // Empresas con 6/6 modelos CON SCORE
  companiesPartial: number,      // Empresas con 1-5 modelos
  companiesEmpty: number,        // Empresas sin datos
  
  // Por registro
  recordsTotal: number,          // Total registros en rix_runs_v2
  recordsWithScore: number,      // Con 09_rix_score != null
  recordsWithDataNoScore: number,// Con respuesta bruta pero sin score
  recordsEmpty: number,          // Sin respuesta bruta
  
  // Por modelo (6 items)
  byModel: {
    ChatGPT: { total, withScore, withData, empty },
    Deepseek: { ... },
    Gemini: { ... },
    Grok: { ... },
    Perplexity: { ... },
    Qwen: { ... },
  }
}
```

### Cambio 2: Simplificar lógica de auto-recovery
En lugar de múltiples condiciones anidadas, usar **máquina de estados simple**:

```text
ESTADO 1: SWEEP_RUNNING
  Condición: sweep_progress.processing > 0 OR sweep_progress.pending > 0
  Acción: Esperar (el CRON ya está procesando)

ESTADO 2: SWEEP_DONE_CHECK_DATA
  Condición: sweep_progress.processing = 0 AND sweep_progress.pending = 0
  Acción: Consultar getRealDataState()

  2.1 Si recordsEmpty > 0:
      → Insertar repair_search (máx 10 modelos por batch)
      → Transición a ESTADO 3
      
  2.2 Si recordsWithDataNoScore > 0:
      → Insertar repair_analysis (máx 10 registros por batch)
      → Transición a ESTADO 3
      
  2.3 Si recordsTotal = recordsWithScore:
      → Insertar auto_sanitize
      → Transición a ESTADO 4

ESTADO 3: REPAIRS_PENDING
  Condición: Hay triggers pending en cron_triggers
  Acción: Procesar triggers, luego volver a ESTADO 2

ESTADO 4: COMPLETE
  Condición: Sanitización terminada sin errores
  Acción: Nada más
```

### Cambio 3: Corregir columnas de respuesta por modelo
El código actual busca `20_res_gpt_bruto IS NULL` para detectar "sin datos", pero cada modelo tiene su propia columna:

| Modelo | Columna |
|--------|---------|
| ChatGPT | `20_res_gpt_bruto` |
| Perplexity | `21_res_perplex_bruto` |
| Gemini | `22_res_gemini_bruto` |
| Deepseek | `23_res_deepseek_bruto` |
| Grok | `respuesta_bruto_grok` |
| Qwen | `respuesta_bruto_qwen` |

**Solución**: En `repair_search`, cambiar la consulta para detectar registros donde LA COLUMNA ESPECÍFICA DEL MODELO esté vacía.

### Cambio 4: Cadencia híbrida
- **Inicio del barrido (0-70% completado)**: 3 empresas simultáneas, 5s entre cada una
- **Final del barrido (>70% completado)**: 1 empresa a la vez, 10s entre cada una
- **Reparaciones**: Siempre 1 a la vez con 15s de pausa

### Cambio 5: Feedback visual mejorado
El dashboard mostrará:
- Estado actual del sistema (RUNNING / CHECK_DATA / REPAIRS / COMPLETE)
- Progreso por modelo (barra individual para cada IA)
- Histórico de últimos 10 eventos (con timestamp)

---

## Archivos a Modificar (Fase 1)

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Simplificar lógica de auto-recovery con máquina de estados, cadencia híbrida |
| `src/hooks/useUnifiedSweepMetrics.ts` | Añadir conteos por columna de modelo |
| `src/components/admin/SweepHealthDashboard.tsx` | Mostrar estado de máquina + progreso por modelo |

---

## Fase 2: Migración a 6 Escenarios (Opcional, si Fase 1 no es suficiente)

Si después de Fase 1 siguen habiendo problemas, implementamos el modelo Make-like:

### Arquitectura de 6 Workers Independientes

```text
┌─────────────────────────────────────────────────────────────────────┐
│ CRON Principal (cada 5 min)                                         │
│   → Llama a /rix-model-worker?model=ChatGPT                        │
│   → Llama a /rix-model-worker?model=Deepseek                       │
│   → Llama a /rix-model-worker?model=Gemini                         │
│   → Llama a /rix-model-worker?model=Grok                           │
│   → Llama a /rix-model-worker?model=Perplexity                     │
│   → Llama a /rix-model-worker?model=Qwen                           │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ /rix-model-worker (1 instancia por modelo)                          │
│                                                                      │
│ BUCLE INTERNO:                                                       │
│   1. Obtener siguiente empresa SIN datos para ESTE modelo           │
│   2. Llamar a la API de ESTE modelo                                 │
│   3. Guardar respuesta en la columna correcta                       │
│   4. Llamar a rix-analyze-v2 para ese registro                      │
│   5. Marcar como completado o mover a "slow_queue" si falla 3x      │
│   6. Repetir hasta timeout (50s) o sin trabajo                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Nueva tabla: `model_sweep_progress`

```sql
CREATE TABLE model_sweep_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  model_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, slow_queue
  retry_count INT DEFAULT 0,
  response_length INT,
  score INT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(sweep_id, ticker, model_name)
);
```

Esta tabla permite:
- Reintentar UN modelo específico para UNA empresa
- Ver progreso real por modelo
- Cola lenta para modelos problemáticos (Grok típicamente)

---

## Plan de Ejecución

### Ahora (sin tocar datos del barrido actual):
1. Aplicar Cambio 1, 2, 3 al orquestador
2. Actualizar hook de métricas
3. Mejorar dashboard

### Resultado esperado:
- El barrido de hoy continúa con los 866 registros existentes
- Los 19 analizables se procesan correctamente
- Los ~100 sin datos se reparan progresivamente
- Feedback visual claro en el panel

### Si después de 1-2 horas no hay mejora visible:
- Evaluar Fase 2 (6 workers independientes)

---

## Sección Técnica: Cambios Específicos

### En `rix-batch-orchestrator/index.ts`

```typescript
// NUEVA FUNCIÓN: Obtener estado real unificado
async function getRealDataState(supabase: any, periodFromStr: string) {
  // Query que agrupa por modelo y cuenta estados
  const { data: records } = await supabase
    .from('rix_runs_v2')
    .select('02_model_name, 09_rix_score, 20_res_gpt_bruto, 21_res_perplex_bruto, 22_res_gemini_bruto, 23_res_deepseek_bruto, respuesta_bruto_grok, respuesta_bruto_qwen')
    .gte('06_period_from', periodFromStr);
  
  // Mapeo de modelo a su columna de respuesta
  const modelColumns = {
    'ChatGPT': '20_res_gpt_bruto',
    'Perplexity': '21_res_perplex_bruto',
    'Gemini': '22_res_gemini_bruto',
    'Google Gemini': '22_res_gemini_bruto',
    'Deepseek': '23_res_deepseek_bruto',
    'Grok': 'respuesta_bruto_grok',
    'Qwen': 'respuesta_bruto_qwen',
  };
  
  const byModel = {};
  // ... procesar cada registro y clasificar por modelo/estado
  
  return { byModel, totals };
}
```

### En auto_recovery (simplificado)

```typescript
// REEMPLAZA la lógica compleja actual por:
const state = await getRealDataState(supabase, periodFromStr);

// Decisión simple basada en prioridad
if (state.totals.empty > 0) {
  await insertTriggerIfNotExists('repair_search', { 
    records: state.getEmptyRecordIds().slice(0, 10) // máx 10 por batch
  });
} else if (state.totals.withDataNoScore > 0) {
  await insertTriggerIfNotExists('repair_analysis', {
    records: state.getAnalyzableRecordIds().slice(0, 10)
  });
} else if (state.totals.recordsTotal === state.totals.withScore) {
  await insertTriggerIfNotExists('auto_sanitize', { sweep_id: sweepId });
}
```

