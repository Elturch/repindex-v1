
# Plan: Disparo Automático del Vector Store tras 100% de Sweep

## Contexto

Actualmente el flujo de un barrido domingo es:
1. **Fases CRON (00:00-03:00)** → `rix-search-v2` para cada empresa
2. **Watchdog (cada 5 min)** → detecta pendientes y dispara `repair_search`, `repair_analysis`
3. **TRIGGER 3: `auto_sanitize`** → se dispara cuando 0 pendientes / 0 analizables / 0 failed
4. **CRON 23:00** → `populate-vector-store` (independiente del estado del sweep)

**Problema**: Si el sweep termina a las 5:00, el Vector Store no se actualiza hasta las 23:00 (18 horas de retraso).

**Solución**: Añadir un **TRIGGER 4: `auto_populate_vectors`** que se dispare automáticamente cuando `auto_sanitize` complete con éxito, **sin eliminar** el CRON de las 23:00 que actúa como red de seguridad.

---

## Cambios Propuestos

### 1. Modificar el handler de `auto_sanitize` (líneas ~1142-1153)

Después de que `auto_sanitize` complete exitosamente, insertar un nuevo trigger `auto_populate_vectors`:

```text
Lógica a añadir tras línea 1152:
- Verificar que el resultado de sanitize indica "sweep limpio" (0 missing, 0 invalid)
- Verificar que no existe ya un trigger `auto_populate_vectors` pendiente (evitar duplicados)
- Insertar trigger `auto_populate_vectors` con params del sweep_id
```

### 2. Añadir prioridad al action map (línea ~860)

```text
auto_populate_vectors: 40  // Después de auto_sanitize (30)
```

### 3. Handler de `auto_populate_vectors` ya existe (líneas 1054-1108)

El sistema ya tiene un handler para `vector_store_continue` que llama a `populate-vector-store`. Reutilizamos esa lógica o añadimos un case específico para `auto_populate_vectors`.

---

## Diagrama de Flujo Actualizado

```text
Sweep 100% completado
        │
        ▼
┌──────────────────────┐
│ TRIGGER 3:           │
│ auto_sanitize        │◄── Watchdog detecta sweep completo
└──────────────────────┘
        │
        ▼ (éxito: 0 missing, 0 invalid)
        │
┌──────────────────────┐
│ TRIGGER 4:           │
│ auto_populate_vectors│◄── NUEVO: Encadenamiento automático
└──────────────────────┘
        │
        ▼
┌──────────────────────┐
│ populate-vector-store│
│ (indexa documentos)  │
└──────────────────────┘

        ⋮

┌──────────────────────┐
│ CRON 23:00 UTC       │◄── RED DE SEGURIDAD (sin cambios)
│ populate-vector-store│    Captura cualquier registro que
└──────────────────────┘    haya quedado sin indexar
```

---

## Sección Técnica

### Archivo: `supabase/functions/rix-batch-orchestrator/index.ts`

#### Cambio 1: Action priority map (~línea 860)
```typescript
// Antes:
auto_sanitize: 30,

// Después:
auto_sanitize: 30,
auto_populate_vectors: 40,  // NUEVO: Poblado automático de Vector Store
```

#### Cambio 2: Handler de `auto_sanitize` (~líneas 1142-1153)
```typescript
// Después de marcar auto_sanitize como completed...

// NUEVO: Disparar auto_populate_vectors si el sweep está limpio
const sanitizeResult = data as { missing?: number; invalid?: number; repaired?: number } | null;
const sweepIsClean = 
  (sanitizeResult?.missing ?? 0) === 0 && 
  (sanitizeResult?.invalid ?? 0) === 0;

if (sweepIsClean) {
  // Verificar que no existe ya un trigger pendiente
  const { data: existingVectorTrigger } = await supabase
    .from('cron_triggers')
    .select('id')
    .eq('action', 'auto_populate_vectors')
    .in('status', ['pending', 'processing'])
    .limit(1)
    .maybeSingle();

  if (!existingVectorTrigger) {
    await supabase.from('cron_triggers').insert({
      action: 'auto_populate_vectors',
      params: { 
        sweep_id: triggerParams?.sweep_id, 
        triggered_by: 'auto_sanitize_chain',
        auto_chain: true
      },
      status: 'pending',
    });
    console.log(`[auto_sanitize] Sweep clean! Inserted auto_populate_vectors trigger`);
  }
}
```

#### Cambio 3: Handler de `auto_populate_vectors` (~después de línea 1108)
```typescript
} else if (trigger.action === 'auto_populate_vectors') {
  // ============================================================
  // AUTO_POPULATE_VECTORS: Dispara indexación del Vector Store
  // Se encadena automáticamente tras auto_sanitize exitoso
  // ============================================================
  console.log(`[cron_triggers] Processing auto_populate_vectors trigger ${trigger.id}`);
  
  const triggerParams = trigger.params as { sweep_id?: string } | null;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/populate-vector-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ 
      source: 'auto_chain',
      sweep_id: triggerParams?.sweep_id
    }),
  });

  const responseText = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${responseText}`);
  }

  await supabase
    .from('cron_triggers')
    .update({ 
      status: 'completed',
      processed_at: new Date().toISOString(),
      result: data as Record<string, unknown>
    })
    .eq('id', trigger.id);

  results.push({ id: trigger.id, action: trigger.action, success: true, result: data });
  console.log(`[cron_triggers] auto_populate_vectors trigger ${trigger.id} completed`);

  // NOTA: Si populate-vector-store necesita más batches, 
  // él mismo insertará un trigger vector_store_continue
```

---

## Resumen de Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir prioridad, handler y encadenamiento para `auto_populate_vectors` |

---

## Resultado Esperado

1. **Inmediatez**: El Vector Store se actualiza minutos después de que el sweep termine (no 18 horas)
2. **Red de seguridad**: El CRON de las 23:00 sigue activo para capturar cualquier hueco
3. **Idempotencia**: La verificación de triggers existentes evita duplicados
4. **Telemetría**: Los logs mostrarán `[auto_sanitize] Sweep clean! Inserted auto_populate_vectors trigger`
