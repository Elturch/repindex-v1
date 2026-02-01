
# Plan: Auto-Sanitización al 100% de Completitud

## Problema
Cuando el barrido alcanza el 100% de completitud, el sistema no hace nada más. La sanitización de respuestas inválidas (rechazos de IA, respuestas cortas, etc.) requiere intervención manual.

## Solución
Modificar el `rix-batch-orchestrator` para que **automáticamente dispare la sanitización** cuando detecta que el sweep está 100% completo.

## Flujo Propuesto

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ CRON auto_recovery (cada 5 minutos)                                    │
│                                                                         │
│  Paso 1: Limpiar zombies                                               │
│  Paso 2: Contar estados                                                │
│  Paso 3: ¿Sweep completo (pending=0, processing=0)?                    │
│          │                                                             │
│          ├── NO → Disparar más empresas (fire-and-forget)             │
│          │                                                             │
│          └── SÍ → NUEVO: Verificar si ya se sanitizó                  │
│                   │                                                    │
│                   ├── YA SANITIZADO → No hacer nada                   │
│                   │                                                    │
│                   └── NO SANITIZADO → Insertar trigger "sanitize"     │
│                        en cron_triggers para que se procese           │
│                        automáticamente                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Cambios Técnicos

### 1. Nuevo Trigger en cron_triggers: `auto_sanitize`

Añadir soporte en `processCronTriggers` para el action `auto_sanitize`:

```typescript
// En processCronTriggers()
if (trigger.action === 'auto_sanitize') {
  console.log(`[cron_triggers] Processing auto_sanitize trigger ${trigger.id}`);
  
  const response = await fetch(`${supabaseUrl}/functions/v1/rix-quality-watchdog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ 
      action: 'sanitize',
      auto_repair: true  // Si encuentra inválidos, dispara reparación
    }),
  });
  
  // ... resto del procesamiento
}
```

### 2. Auto-Trigger al Detectar Sweep Completo

Modificar la sección de detección de sweep completo (línea ~1077):

```typescript
// 5. Si no hay empresas pendientes ni en procesamiento, el sweep está completo
if (pending === 0 && processing === 0 && failed === 0) {
  console.log(`[${triggerMode}] Sweep ${sweepId} is complete (${completed}/${total})`);
  
  // NUEVO: Verificar si ya se sanitizó este sweep
  const { data: existingSanitize } = await supabase
    .from('cron_triggers')
    .select('id')
    .eq('action', 'auto_sanitize')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();
  
  if (!existingSanitize) {
    // Insertar trigger de sanitización automática
    console.log(`[${triggerMode}] Inserting auto_sanitize trigger for sweep ${sweepId}`);
    await supabase.from('cron_triggers').insert({
      action: 'auto_sanitize',
      params: { sweep_id: sweepId },
      status: 'pending',
    });
  }
  
  return new Response(...);
}
```

### 3. Tabla de Estado de Sanitización (Opcional pero Recomendado)

Para evitar disparar la sanitización múltiples veces, se puede usar `data_quality_reports` para verificar:

```typescript
// Verificar si ya hay reportes de calidad para este sweep
const { count: existingReports } = await supabase
  .from('data_quality_reports')
  .select('*', { count: 'exact', head: true })
  .eq('sweep_id', sweepId);

if ((existingReports || 0) === 0) {
  // No hay reportes → necesita sanitización
  await supabase.from('cron_triggers').insert({
    action: 'auto_sanitize',
    params: { sweep_id: sweepId },
    status: 'pending',
  });
}
```

## Archivo a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | 1. Añadir handler para `auto_sanitize` en `processCronTriggers()`. 2. Insertar trigger automático cuando sweep está completo. |

## Resultado

| Escenario | Antes | Después |
|-----------|-------|---------|
| Sweep completa 100% | Espera intervención manual | Auto-dispara sanitización |
| Sanitización encuentra rechazos | Espera intervención manual | Auto-dispara reparación |
| Reparación completa | Fin | Sistema listo para la semana |

## Flujo Completo Automatizado

```text
Domingo 01:00    → Comienza barrido
     ↓
~ 5-7 horas      → CRON auto_recovery cada 5 min
     ↓
Sweep 100%       → auto_recovery detecta completitud
     ↓              Inserta trigger "auto_sanitize"
     ↓
Siguiente CRON   → processCronTriggers ejecuta sanitización
     ↓
Sanitización     → Encuentra 39 rechazos de Grok
     ↓              Inserta trigger "repair_invalid_responses"
     ↓
Siguiente CRON   → processCronTriggers ejecuta reparación
     ↓
Lunes AM         → Sistema listo, 95%+ cobertura
```

Sin intervención humana en ningún paso.
