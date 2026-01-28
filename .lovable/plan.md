

## Auditoría Completa del Sistema de Recogida de Datos Semanal

### Estado Actual del Sistema

#### Arquitectura del Pipeline RIX V2

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PIPELINE RIX V2 SEMANAL                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐      │
│  │ CRON Watchdog│────>│ rix-batch-       │────>│ rix-search-v2      │      │
│  │ (cada 5 min) │     │ orchestrator     │     │ (6 modelos IA)     │      │
│  └──────────────┘     └──────────────────┘     └────────────────────┘      │
│         │                     │                        │                    │
│         │                     v                        v                    │
│         │            ┌──────────────────┐     ┌────────────────────┐       │
│         │            │ sweep_progress   │     │ rix_runs_v2        │       │
│         │            │ (estado empresa) │     │ (datos crudos)     │       │
│         │            └──────────────────┘     └────────────────────┘       │
│         │                     │                        │                    │
│         │                     v                        v                    │
│         │            ┌──────────────────┐     ┌────────────────────┐       │
│         └───────────>│ cron_triggers    │────>│ rix-analyze-v2     │       │
│                      │ (reparaciones)   │     │ (GPT-5 scoring)    │       │
│                      └──────────────────┘     └────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Fortalezas del Sistema Actual

| Fortaleza | Descripción | Impacto |
|-----------|-------------|---------|
| **Arquitectura 1-empresa-por-invocación** | Evita timeouts al procesar una empresa a la vez | Ninguna empresa puede bloquear el barrido completo |
| **Sistema "zombi" con reset automático** | Empresas atascadas en "processing" > 5 min se resetean automáticamente | Auto-recuperación sin intervención manual |
| **Persistencia en localStorage** | Estado de cascada se guarda localmente | Sobrevive a cierres de navegador |
| **MAX_RETRIES = 1000** | Reintentos muy altos por empresa | Sistema no se rinde ante fallos transitorios |
| **Sincronización dinámica de nuevos issuers** | Nuevas empresas se añaden al sweep automáticamente | No requiere configuración manual |
| **cron_triggers server-to-server** | Reparaciones ejecutadas sin pasar por el navegador | Evita bloqueos de extensiones |
| **Panel de monitoreo en /admin** | Visibilidad de estado por fase, modelo y errores | Diagnóstico inmediato de problemas |
| **Múltiples modelos IA con fallback** | 6 modelos independientes con aislamiento de fallos | Un modelo fallando no afecta a los demás |

---

### Debilidades Identificadas

| Debilidad | Severidad | Estado Actual | Impacto |
|-----------|-----------|---------------|---------|
| **Grok-3 HTTP 422 (100% fallos)** | CRITICA | 0/18 registros esta semana | Pérdida total de cobertura de un modelo |
| **Sin alertas proactivas** | ALTA | No hay notificaciones automáticas | Los problemas se descubren tarde |
| **Dependencia de CRON externo** | MEDIA | pg_cron + pg_net | Si falla el CRON, el barrido se detiene |
| **Sin dashboard de salud histórico** | MEDIA | Solo estado actual | No hay tendencias para detectar degradación |
| **Análisis V2 pendientes (34/108)** | ALTA | 31% sin RIX score | Datos incompletos para reportes |
| **Sin validación de calidad de respuesta** | MEDIA | Solo verifica longitud > 100 | Respuestas de baja calidad pasan desapercibidas |
| **Logs dispersos en múltiples funciones** | BAJA | Cada función loguea independiente | Difícil correlacionar fallos |
| **Sin métricas de tiempo de ejecución** | BAJA | Solo duración total | No se detectan degradaciones de APIs |

---

### Problemas Específicos Detectados Ahora

#### 1. Bug Crítico: Grok-3 HTTP 422

**Error**: `Failed to deserialize the JSON body into the target type: tools[0]: missing field 'parameters'`

**Causa**: El endpoint `/v1/responses` de xAI requiere un campo `parameters` en la definición de tools, pero el código actual no lo incluye.

**Ubicación**: `supabase/functions/rix-search-v2/index.ts` líneas 228-249

**Impacto**: 18/18 registros de Grok sin datos esta semana (100% fallo)

#### 2. Análisis Pendientes (GPT-5)

**Estado actual por modelo**:
| Modelo | Analizados | Pendientes | Completitud |
|--------|------------|------------|-------------|
| Grok | 0 | 18 | 0% |
| Perplexity | 12 | 6 | 67% |
| ChatGPT | 14 | 4 | 78% |
| Google Gemini | 14 | 4 | 78% |
| Deepseek | 17 | 1 | 94% |
| Qwen | 17 | 1 | 94% |

**Nota**: Grok tiene 18 registros con `has_raw_response=18` pero 0 analizados. Esto indica que las llamadas a Grok están fallando en la fase de búsqueda, no en el análisis.

#### 3. cron_triggers vacía

La tabla `cron_triggers` está vacía, lo que significa que el botón "Reparar Análisis" no ha insertado triggers exitosamente o ya fueron procesados.

---

### Plan de Mejora: Sistema de Recogida Sin Errores

#### Fase 1: Corrección Inmediata de Bugs (Prioridad: CRITICA)

##### 1.1 Corregir payload de Grok-3

**Archivo**: `supabase/functions/rix-search-v2/index.ts`

**Cambio**: El endpoint `/v1/responses` de xAI tiene un formato diferente. Opciones:
- **Opción A**: Usar endpoint legacy `/v1/chat/completions` que no requiere tools
- **Opción B**: Corregir el payload para incluir `parameters` vacío si se usan tools
- **Opción C**: Eliminar `tools` del request y usar solo `search: true`

**Recomendación**: Opción C (más simple y ya tiene búsqueda nativa)

```typescript
buildRequest: (prompt: string, apiKey: string) => ({
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: {
    model: 'grok-3',
    input: prompt,
    search: true,   // Búsqueda web nativa
    temperature: 0.1,
    // NO incluir 'tools' - causa el error 422
  },
}),
```

##### 1.2 Ejecutar reparación de análisis pendientes

Después de corregir Grok, re-ejecutar `rix-analyze-v2` con `action: reprocess_pending` para completar los 34 análisis pendientes.

---

#### Fase 2: Sistema de Alertas Proactivas (Prioridad: ALTA)

##### 2.1 Nueva tabla `pipeline_health_checks`

```sql
CREATE TABLE public.pipeline_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type text NOT NULL,  -- 'sweep_progress', 'analysis_completion', 'model_errors'
  sweep_id text,
  status text NOT NULL,      -- 'healthy', 'warning', 'critical'
  details jsonb,
  checked_at timestamptz DEFAULT now()
);
```

##### 2.2 Función de healthcheck en el orchestrator

Añadir al watchdog:

```typescript
async function performHealthCheck(supabase, sweepId) {
  const checks = [];
  
  // Check 1: Progreso del sweep
  const { data: progress } = await supabase
    .from('sweep_progress')
    .select('status')
    .eq('sweep_id', sweepId);
  
  const stuckCount = progress.filter(p => p.status === 'processing').length;
  if (stuckCount > 5) {
    checks.push({ type: 'sweep_stuck', status: 'warning', details: { stuck: stuckCount }});
  }
  
  // Check 2: Errores de modelo
  const { data: errors } = await supabase
    .from('rix_runs_v2')
    .select('02_model_name, model_errors')
    .not('model_errors', 'is', null);
  
  const errorsByModel = groupBy(errors, '02_model_name');
  Object.entries(errorsByModel).forEach(([model, errs]) => {
    if (errs.length > 10) {
      checks.push({ type: 'model_errors', status: 'critical', details: { model, count: errs.length }});
    }
  });
  
  // Check 3: Análisis pendientes
  const { data: pending } = await supabase
    .from('rix_runs_v2')
    .select('id')
    .is('09_rix_score', null)
    .not('20_res_gpt_bruto', 'is', null);
  
  if (pending.length > 20) {
    checks.push({ type: 'analysis_backlog', status: 'warning', details: { pending: pending.length }});
  }
  
  // Guardar checks
  for (const check of checks) {
    await supabase.from('pipeline_health_checks').insert({
      check_type: check.type,
      sweep_id: sweepId,
      status: check.status,
      details: check.details
    });
  }
  
  return checks;
}
```

##### 2.3 Panel de alertas en /admin

Añadir sección "Alertas del Sistema" en `SweepMonitorPanel.tsx` que muestre:
- Estado de salud por modelo
- Alertas activas con severidad
- Historial de incidencias

---

#### Fase 3: Redundancia y Auto-Reparación (Prioridad: MEDIA)

##### 3.1 Auto-trigger de análisis pendientes

Modificar el watchdog para que automáticamente dispare reparación de análisis cuando:
- El sweep de búsqueda está completo (100%)
- Hay > 10 registros sin `09_rix_score`

```typescript
// En el watchdog, después de verificar progreso
if (sweepComplete && pendingAnalysis > 10) {
  console.log(`[watchdog] Auto-triggering analysis repair for ${pendingAnalysis} pending`);
  await supabase.from('cron_triggers').insert({
    action: 'repair_analysis',
    params: { batch_size: 5, auto_triggered: true }
  });
}
```

##### 3.2 Retry inteligente por modelo

Implementar backoff exponencial específico por modelo:

```typescript
const MODEL_RETRY_CONFIG = {
  'Grok': { maxRetries: 3, backoffMs: 30000 },      // Grok tiene rate limits estrictos
  'Perplexity': { maxRetries: 5, backoffMs: 10000 },
  'ChatGPT': { maxRetries: 5, backoffMs: 5000 },
  'Deepseek': { maxRetries: 5, backoffMs: 10000 },
  'Google Gemini': { maxRetries: 5, backoffMs: 5000 },
  'Qwen': { maxRetries: 5, backoffMs: 10000 },
};
```

---

#### Fase 4: Monitoreo y Métricas (Prioridad: BAJA)

##### 4.1 Dashboard de tendencias

Añadir gráficos de:
- Tiempo promedio de ejecución por modelo (últimas 4 semanas)
- Tasa de errores por modelo (tendencia)
- Cobertura de análisis por semana

##### 4.2 Logs centralizados

Crear una tabla `pipeline_logs` para correlacionar eventos:

```sql
CREATE TABLE public.pipeline_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id text,
  ticker text,
  model_name text,
  stage text,          -- 'search', 'analyze', 'vectorize'
  status text,         -- 'started', 'completed', 'failed'
  duration_ms integer,
  error_message text,
  created_at timestamptz DEFAULT now()
);
```

---

### Comparativa con Make.com

| Aspecto | Make.com | Lovable/Supabase Actual | Mejora Propuesta |
|---------|----------|-------------------------|------------------|
| **Visibilidad de errores** | Dashboard visual | Panel /admin (bueno) | +Alertas proactivas |
| **Reintentos automáticos** | Configurable por módulo | MAX_RETRIES=1000 (excesivo) | Backoff por modelo |
| **Notificaciones** | Email/Slack integrado | No existe | +Webhooks/Email |
| **Logs centralizados** | Historial por ejecución | Dispersos en funciones | +pipeline_logs |
| **Monitoreo de salud** | Panel de ejecuciones | Solo estado actual | +health_checks |
| **Recuperación de fallos** | Replay manual | Auto-reset zombis (bueno) | +Auto-repair analysis |

---

### Archivos a Modificar

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `supabase/functions/rix-search-v2/index.ts` | Corregir payload de Grok-3 | CRITICA |
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir healthchecks + auto-repair | ALTA |
| `src/components/admin/SweepMonitorPanel.tsx` | Panel de alertas | ALTA |
| Migración SQL | Crear `pipeline_health_checks` y `pipeline_logs` | MEDIA |

---

### Progreso de Implementación (28 Enero 2026)

| Tarea | Estado | Notas |
|-------|--------|-------|
| Corregir bug Grok-3 HTTP 422 | ✅ COMPLETADO | Cambiado `search: true` → `tools: [{type: 'web_search_preview'}]` |
| Crear tablas `pipeline_health_checks` y `pipeline_logs` | ✅ COMPLETADO | Migración ejecutada con RLS |
| Añadir healthchecks al orchestrator | ✅ COMPLETADO | Función `performHealthChecks()` añadida |
| Auto-trigger de análisis pendientes | ✅ COMPLETADO | Se activa cuando hay >20 pendientes |
| Panel de alertas en /admin | ✅ COMPLETADO | Nueva pestaña "Alertas" con `PipelineAlertsPanel` |
| Desplegar edge functions | ✅ COMPLETADO | `rix-search-v2` y `rix-batch-orchestrator` desplegados |

### Próximos Pasos

1. **Verificar** que Grok funciona correctamente en el próximo barrido
2. **Ejecutar** reparación de análisis pendientes desde /admin → Barrido V2 → "Reparar Análisis"
3. **Monitorear** la pestaña "Alertas" para detectar problemas automáticamente

