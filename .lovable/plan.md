
# Auditoría del Sistema de Barrido RIX - Preparación Domingo 9 Febrero 2026

## Estado Actual del Sistema

### Resumen Ejecutivo

| Aspecto | Estado | Acción Requerida |
|---------|--------|-----------------|
| **CRONs de Fase** | 35 fases activas | OK |
| **Watchdog** | Activo (cada 5 min) | **BUG CRÍTICO** |
| **Empresas Activas** | 174 | OK |
| **Distribución Fases** | 5 por fase (fase 35: 4) | OK |
| **Semana Activa** | 2026-W07 (próximo domingo) | OK |

---

## BUG CRÍTICO DETECTADO

### Error: `triggersProcessed is not defined`

**Ubicación:** `rix-batch-orchestrator/index.ts` línea ~2207

**Impacto:** El orquestador falla silenciosamente cuando el sweep está "completo" (pending=0, processing=0). El watchdog de 5 minutos intenta verificar el estado pero crashea antes de poder encadenar las tareas de reparación.

**Causa:** En el bloque del watchdog que maneja "sweep complete", se usa `triggersProcessed.length` en varias respuestas JSON, pero esa variable nunca se declara en ese contexto. Solo se declara cuando se llama a `processCronTriggers()`.

**Corrección Necesaria:**
```typescript
// Línea ~2002 (antes de la sección "Sweep complete")
const triggersProcessed: any[] = [];  // Inicializar array vacío

// O mejor: usar cronTotalProcessed que sí existe
triggersProcessed: cronTotalProcessed,  // En las respuestas JSON
```

**Evidencia de los logs:**
```
[orchestrator] Fatal error: ReferenceError: triggersProcessed is not defined
    at Object.handler (file:///var/tmp/sb-compile-edge-runtime/rix-batch-orchestrator/index.ts:1790:30)
```

---

## Configuración de CRONs Verificada

### Horarios del Barrido (hora Madrid = UTC+1)

| Fase | Inicio CET | Empresas |
|------|-----------|----------|
| 01 | 01:00 | 5 |
| 02-12 | 01:05-01:55 | 55 |
| 13-24 | 02:00-02:55 | 60 |
| 25-34 | 03:00-03:45 | 50 |
| 35 | 03:50 | 4 |

**Total:** 174 empresas en 35 fases escalonadas

### Watchdogs Activos
- `rix-orchestrator-watchdog`: cada 5 minutos (procesa triggers y auto-recovery)
- `rix-sweep-watchdog-15min`: respaldo cada 5 minutos

---

## Estimación de Tiempos Basada en W05

### Datos Históricos de 2026-W05 (25-26 enero)

| Métrica | Valor |
|---------|-------|
| Inicio | 04:05 UTC (25/01) |
| Fin | 02:15 UTC (26/01) |
| **Duración Total** | ~22 horas |
| Fases más lentas | 9, 14, 26 (~20h cada una) |
| Reintentos | 7 empresas con HTTP 504 |
| Empresas completadas | 174/174 (100%) |

### Por qué tardó 22 horas (y no 3)

1. **Timeouts HTTP 504:** 7 empresas necesitaron reintentos automáticos
2. **Fases 9, 14, 26:** Acumularon retrasos por dependencias de API
3. **Procesamiento secuencial:** 10 segundos entre cada empresa por fase
4. **Auto-recovery:** El watchdog de 5 min eventualmente completó todo

---

## Estimación para 2026-W07 (9 febrero)

### Escenario Optimista (sin 504s)
- **Inicio:** 01:00 CET domingo
- **Fin búsquedas:** ~08:00 CET domingo
- **Fin análisis:** ~12:00 CET domingo
- **Total:** ~11 horas

### Escenario Realista (con algunos 504s)
- **Inicio:** 01:00 CET domingo
- **Fin búsquedas:** ~14:00 CET domingo
- **Fin análisis:** ~18:00 CET domingo
- **Total:** ~17 horas

### Escenario Pesimista (similar a W05)
- **Total:** ~22 horas
- **Fin:** lunes ~00:00 CET

---

## Lista de Verificación Pre-Barrido

### Correcciones Urgentes

- **FIX CRÍTICO:** Corregir error `triggersProcessed is not defined` en rix-batch-orchestrator
- Desplegar el orquestador corregido antes del domingo

### Verificaciones Manuales

- [ ] Confirmar que todos los CRONs de fase están activos (35/35)
- [ ] Verificar que las claves API (OpenAI, Perplexity, etc.) no han expirado
- [ ] Comprobar que no hay triggers pendientes antiguos que puedan interferir

### Monitorización Durante el Barrido

1. **Panel de Administración:** Verificar progreso en tiempo real
2. **Logs del Orquestador:** Buscar errores 504 o rate limits
3. **sweep_progress:** Consultar status de empresas
4. **pipeline_logs:** Telemetría de heartbeats

---

## Resumen de Cambios Técnicos Necesarios

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Declarar `triggersProcessed` antes de usarla (o usar `cronTotalProcessed`) | **CRÍTICO** |

### Código a Corregir

Ubicación aproximada: línea ~1935-2000

```typescript
// ANTES (problemático):
if (pending === 0 && processing === 0) {
  // ... código de auto-encadenamiento ...
  return new Response(JSON.stringify({
    triggersProcessed: triggersProcessed.length,  // ERROR: no definida
  }));
}

// DESPUÉS (corregido):
if (pending === 0 && processing === 0) {
  // Al inicio del bloque, antes del return
  const triggersProcessed: Array<{action: string}> = [];
  
  // O usar la variable que SÍ existe:
  return new Response(JSON.stringify({
    triggersProcessed: cronTotalProcessed,  // Esta sí está definida
  }));
}
```

---

## Resumen Final

El sistema está **casi listo** pero tiene un **bug crítico** que debe corregirse antes del domingo. Los CRONs y la distribución de fases están correctamente configurados. Basándose en la experiencia de W05:

- **Caso base:** 17 horas de duración
- **Riesgo principal:** Timeouts HTTP 504 en algunas APIs
- **Mitigación:** El watchdog de 5 min eventualmente completa todo

**Acción inmediata requerida:** Corregir el error de `triggersProcessed` y redesplegar el orquestador.
