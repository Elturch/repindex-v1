

# Plan: Cerrar los gaps del sistema de auto-reparacion

## Diagnostico

El sistema de reparacion autonoma tiene dos brechas que impiden la resolucion completa:

1. **Accion no reconocida**: El `auto_sanitize` detecta respuestas invalidas y crea triggers con `action: 'repair_invalid_responses'`, pero el orquestador (`rix-batch-orchestrator`) no tiene un handler para esa accion. Resultado: el trigger falla con "Unknown action".

2. **`repair_search` bloqueado**: Un trigger de repair_search lleva mas de 8 horas en estado `processing` sin completarse, bloqueando nuevos triggers de reparacion.

## Cambios propuestos

### 1. Orquestador: Anadir handler para `repair_invalid_responses`

**Archivo**: `supabase/functions/rix-batch-orchestrator/index.ts`

- Anadir `repair_invalid_responses` a la lista de prioridades (prioridad 15, entre repair_search y repair_analysis)
- Implementar el handler que llame a `rix-quality-watchdog` con `action: 'repair'` (que ya existe y funciona)
- Incluir auto-requeue si quedan reparaciones pendientes (mismo patron que repair_search y repair_analysis)

### 2. Orquestador: Limpiar triggers zombi de repair_search

**Archivo**: `supabase/functions/rix-batch-orchestrator/index.ts`

- En el health_check existente, anadir limpieza de triggers `repair_search` y `repair_invalid_responses` que lleven mas de 10 minutos en `processing`
- Resetearlos a `pending` para que se reintenten (mismo patron que ya existe para otros triggers zombi)

### 3. Registrar la nueva accion en admin-cron-triggers

**Archivo**: `supabase/functions/admin-cron-triggers/index.ts`

- Anadir `'repair_invalid_responses'` al array `ALLOWED_ACTIONS` para que pueda ser disparado manualmente desde el dashboard si fuese necesario

## Detalle tecnico del handler

```text
repair_invalid_responses handler:
  1. Leer params del trigger (sweep_id, max_repairs)
  2. Llamar a rix-quality-watchdog con action='repair'
  3. Si result.repaired > 0 y quedan pendientes:
     -> re-queue con status 'pending'
  4. Si no quedan pendientes:
     -> marcar como 'completed'
```

La cadena completa quedaria:

```text
Sweep 100% -> auto_sanitize -> detecta invalidos
  -> repair_invalid_responses -> llama watchdog repair
    -> auto-requeue si quedan pendientes
      -> cuando todo limpio -> auto_populate_vectors
        -> auto_generate_newsroom
```

## Impacto

- Sin nuevas tablas ni migraciones
- 3 archivos modificados (2 edge functions)
- Cierra el gap que impedia la reparacion completa automatica
- El trigger `repair_search` bloqueado se liberara en el siguiente ciclo del watchdog

