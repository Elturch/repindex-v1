

# Plan: Auto-Relanzamiento Inmediato del Orquestador

## Problema
Cuando el CRON dispara empresas, el ciclo termina y hay que esperar 5 minutos para el siguiente. Si hay trabajo pendiente y slots disponibles, se pierde tiempo valioso.

## Solución
Añadir **auto-relanzamiento** al final de cada ciclo `auto_recovery`: si quedan empresas pendientes y hay slots libres, el orquestador se llama a sí mismo inmediatamente usando `EdgeRuntime.waitUntil()`.

## Arquitectura Propuesta

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ CRON cada 5 minutos → rix-batch-orchestrator (auto_recovery)           │
│                                                                         │
│  1. Limpiar zombies                                                    │
│  2. Contar estados (pending, processing, completed)                    │
│  3. ¿Sweep completo? → Insertar auto_sanitize → FIN                   │
│  4. ¿Ya hay 3 procesando? → throttle → FIN                            │
│  5. Disparar N empresas (hasta completar 3 slots)                      │
│  6. ¿Quedan pendientes Y slots libres?                                 │
│      │                                                                  │
│      ├── NO → Esperar próximo CRON (5 min)                            │
│      │                                                                  │
│      └── SÍ → NUEVO: Auto-relanzar en 30 segundos                     │
│               EdgeRuntime.waitUntil(sleep(30s) → self-invoke)          │
│                                                                         │
│  El CRON sigue corriendo cada 5 min como respaldo, pero si hay        │
│  trabajo el sistema se auto-alimenta SIN esperar.                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Cambios Técnicos

### Modificación en `rix-batch-orchestrator/index.ts`

Después de disparar empresas (línea ~1260), añadir lógica de auto-relanzamiento:

```typescript
// 10. Retornar INMEDIATAMENTE
console.log(`[${triggerMode}] Fired ${firedCompanies.length} companies`);

// 11. AUTO-RELAUNCH: Si quedan pendientes y hay slots, auto-relanzar en 30s
const newPending = pending - firedCompanies.length;
const newProcessing = processing + firedCompanies.length;
const slotsAfterFire = MAX_CONCURRENT - newProcessing;

if (newPending > 0 && slotsAfterFire > 0) {
  console.log(`[${triggerMode}] Auto-relaunching in 30s (${newPending} pending, ${slotsAfterFire} slots free)`);
  
  EdgeRuntime.waitUntil(
    (async () => {
      await new Promise(r => setTimeout(r, 30000)); // Esperar 30s
      
      try {
        await fetch(`${supabaseUrl}/functions/v1/rix-batch-orchestrator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ trigger: 'auto_recovery' }),
        });
        console.log(`[${triggerMode}] Auto-relaunch executed successfully`);
      } catch (e) {
        console.error(`[${triggerMode}] Auto-relaunch failed:`, e);
      }
    })()
  );
}

return new Response(JSON.stringify({
  ...existingResponse,
  autoRelaunch: newPending > 0 && slotsAfterFire > 0,
  autoRelaunchIn: newPending > 0 && slotsAfterFire > 0 ? '30s' : null,
}));
```

### Por Qué 30 Segundos

- **Demasiado corto (5s)**: Podría crear bucles muy rápidos si hay errores
- **Demasiado largo (2min)**: Pierde eficiencia
- **30 segundos**: Balance perfecto - da tiempo a que las empresas en vuelo progresen, pero no espera innecesariamente

### Protección Anti-Bucle Infinito

Para evitar que un error cree bucles infinitos, añadir contador de relanzamientos:

```typescript
// Añadir al body del request
const relaunchCount = body.relaunch_count || 0;
const MAX_RELAUNCHES_PER_CYCLE = 20; // Máximo 20 relanzamientos consecutivos

// En la lógica de auto-relaunch
if (newPending > 0 && slotsAfterFire > 0 && relaunchCount < MAX_RELAUNCHES_PER_CYCLE) {
  EdgeRuntime.waitUntil(
    (async () => {
      await new Promise(r => setTimeout(r, 30000));
      await fetch(`${supabaseUrl}/functions/v1/rix-batch-orchestrator`, {
        method: 'POST',
        headers: { ... },
        body: JSON.stringify({ 
          trigger: 'auto_recovery',
          relaunch_count: relaunchCount + 1  // Incrementar contador
        }),
      });
    })()
  );
}
```

## Flujo Resultante

```text
Domingo 01:00:00 - CRON dispara fase 1 (5 empresas)
         01:00:30 - Auto-relaunch (quedan pendientes)
         01:01:00 - Auto-relaunch (sigue habiendo)
         ...
         01:10:00 - Max concurrent alcanzado, espera
         01:05:00 - CRON backup (cada 5 min)
         ...
Domingo ~06:00   - Sweep 100% completo
                   Auto-sanitización disparada
Lunes AM         - Sistema listo, 95%+ cobertura
```

## Resultado

| Métrica | Antes | Después |
|---------|-------|---------|
| Tiempo entre disparos | 5 minutos fijo | 30 segundos si hay trabajo |
| Velocidad teórica máx | 12 empresas/hora | ~120 empresas/hora |
| Tiempo para 174 empresas | ~15 horas | ~2-3 horas |
| Dependencia del CRON | 100% | Respaldo (el sistema se auto-alimenta) |

## Archivo a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir lógica de auto-relanzamiento después del paso de fire-and-forget |

