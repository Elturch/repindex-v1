

## Plan: Solución Definitiva para Bloqueo de Extensiones del Navegador

### Diagnóstico Completo

**Problema identificado**: La extensión de Chrome `frame_ant` está interceptando y bloqueando **TODAS** las peticiones de red, incluyendo:
- `window.fetch` (usado por Supabase JS)
- `XMLHttpRequest` (nuestro intento de bypass)

**Evidencia**:
- La llamada directa desde el servidor funciona (HTTP 200)
- El Edge Function procesa correctamente (logs muestran análisis completados)
- El error `NetworkError` ocurre en `xhr.onerror` antes de que la petición salga del navegador

**Estado actual de análisis V2:**
| Modelo | Completados | Pendientes | % |
|--------|-------------|------------|---|
| ChatGPT | 14/18 | 4 | 78% |
| Deepseek | 17/18 | 1 | 94% |
| Google Gemini | 14/18 | 4 | 78% |
| **Grok** | 0/18 | 18 | **0%** |
| Perplexity | 12/18 | 6 | 67% |
| Qwen | 17/18 | 1 | 94% |

---

### Solución Propuesta

Dado que NO podemos controlar las extensiones del navegador del usuario, implementaremos **dos estrategias complementarias**:

#### Estrategia 1: CRON Automático para Análisis Pendientes

Añadir un job CRON que ejecute `rix-analyze-v2` con `action: reprocess_pending` automáticamente cada hora, eliminando la dependencia del botón del panel de administración.

**Archivo**: `supabase/config.toml`

```toml
[functions.rix-analyze-v2-cron]
schedule = "0 * * * *"  # Cada hora
```

**Nota**: Esto requiere configuración adicional en Supabase que puede no estar disponible directamente. Alternativa: usar el watchdog existente en `rix-batch-orchestrator`.

#### Estrategia 2: Integrar Reparación en el Orchestrator Existente

Modificar `rix-batch-orchestrator` para que durante sus ejecuciones automáticas (CRON) también verifique y reprocese análisis pendientes.

**Archivo**: `supabase/functions/rix-batch-orchestrator/index.ts`

Añadir al flujo del watchdog:

```typescript
// En el watchdog, después de verificar el sweep
if (sweepComplete) {
  // Verificar si hay análisis pendientes
  const { data: pending } = await supabase
    .from('rix_runs_v2')
    .select('id')
    .is('09_rix_score', null)
    .not('20_res_gpt_bruto', 'is', null)
    .limit(10);
  
  if (pending?.length > 0) {
    console.log(`[watchdog] Found ${pending.length} pending analyses, triggering repair...`);
    // Invocar rix-analyze-v2 server-to-server (sin bloqueo de extensiones)
    await supabase.functions.invoke('rix-analyze-v2', {
      body: { action: 'reprocess_pending', batch_size: 3 }
    });
  }
}
```

#### Estrategia 3: Añadir Opción de Ejecución Manual via CRON Trigger

Crear un botón alternativo que en lugar de llamar directamente a la Edge Function, inserte un registro en una tabla `cron_triggers` que el orchestrator lee y ejecuta.

**Nuevo flujo**:
1. Usuario pulsa "Reparar Análisis"
2. Se inserta registro en `cron_triggers` con `action: repair_analysis`
3. El próximo CRON del orchestrator (cada 5 min) lo detecta y ejecuta la reparación server-to-server
4. Usuario recibe notificación de que la reparación está programada

---

### Cambios Técnicos Detallados

#### 1. Nueva Tabla `cron_triggers` (Migración SQL)

```sql
CREATE TABLE IF NOT EXISTS public.cron_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  params jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  result jsonb
);

-- Índice para búsqueda de pendientes
CREATE INDEX idx_cron_triggers_pending ON cron_triggers(status) WHERE status = 'pending';
```

#### 2. Modificar `SweepMonitorPanel.tsx`

```typescript
const handleRepairAnalysis = async () => {
  setRepairingAnalysis(true);

  try {
    // Insertar trigger para que el CRON lo procese
    const { error } = await supabase
      .from('cron_triggers')
      .insert({
        action: 'repair_analysis',
        params: { batch_size: 3 }
      });

    if (error) throw error;

    toast({
      title: '📅 Reparación programada',
      description: 'El análisis pendiente se ejecutará automáticamente en los próximos minutos.',
    });

  } catch (error: any) {
    console.error('Error scheduling repair:', error);
    toast({
      title: 'Error',
      description: error.message || 'No se pudo programar la reparación',
      variant: 'destructive',
    });
  } finally {
    setRepairingAnalysis(false);
  }
};
```

#### 3. Modificar `rix-batch-orchestrator/index.ts`

```typescript
// Al inicio del watchdog
async function processCronTriggers(supabase: SupabaseClient) {
  const { data: triggers } = await supabase
    .from('cron_triggers')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  for (const trigger of triggers || []) {
    await supabase
      .from('cron_triggers')
      .update({ status: 'processing' })
      .eq('id', trigger.id);

    try {
      if (trigger.action === 'repair_analysis') {
        // Llamada server-to-server (sin extensiones bloqueando)
        const { data, error } = await supabase.functions.invoke('rix-analyze-v2', {
          body: { action: 'reprocess_pending', batch_size: trigger.params?.batch_size || 3 }
        });

        await supabase
          .from('cron_triggers')
          .update({ 
            status: error ? 'failed' : 'completed',
            processed_at: new Date().toISOString(),
            result: data || { error: error?.message }
          })
          .eq('id', trigger.id);
      }
    } catch (e: any) {
      await supabase
        .from('cron_triggers')
        .update({ 
          status: 'failed',
          processed_at: new Date().toISOString(),
          result: { error: e.message }
        })
        .eq('id', trigger.id);
    }
  }
}

// Añadir al handler del watchdog
await processCronTriggers(supabaseClient);
```

---

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| Migración SQL | Crear tabla `cron_triggers` |
| `src/components/admin/SweepMonitorPanel.tsx` | Cambiar botón para insertar trigger en lugar de llamada directa |
| `supabase/functions/rix-batch-orchestrator/index.ts` | Procesar triggers pendientes en cada ejecución CRON |

---

### Beneficios

1. **Independiente del navegador**: Las reparaciones se ejecutan server-to-server
2. **Sin bloqueo de extensiones**: El CRON no pasa por el navegador del usuario
3. **Feedback inmediato**: El usuario sabe que la reparación está programada
4. **Resiliente**: Si falla, el siguiente CRON lo reintenta
5. **Auditable**: Registro de todas las acciones con resultados

---

### Solución Temporal Inmediata

Mientras se implementa el sistema de triggers, puedes ejecutar el análisis manualmente desde esta herramienta de testing que uso yo (curl del servidor), o abrir Chrome en **Modo Incógnito** donde las extensiones no están activas por defecto.

