
# Plan: Actualizar Grok a grok-4-1-fast y Reparar Registros Fallidos

## Diagnóstico Confirmado

| Aspecto | Estado Actual | Problema |
|---------|---------------|----------|
| Modelo Grok | `grok-4` | Demasiado lento, causa timeouts de 180s |
| Registros fallidos | 51 empresas | Todos con "Timeout after 180s" |
| API endpoint | `/v1/responses` | Correcto |

## Cambios a Realizar

### 1. Actualizar modelo Grok → `grok-4-1-fast`

**Archivo:** `supabase/functions/rix-search-v2/index.ts`

**Líneas 311 y 325:** Cambiar de `grok-4` a `grok-4-1-fast`

```typescript
// Antes (línea 311):
name: 'grok-4',

// Después:
name: 'grok-4-1-fast',

// Antes (línea 325):
model: 'grok-4',

// Después:
model: 'grok-4-1-fast',
```

**Actualizar comentarios (líneas 305-309):**
```typescript
// 2. Grok (xAI) - ✅ Web Search via Responses API
// Actualizado febrero 2026: grok-4 → grok-4-1-fast (optimizado para baja latencia)
// grok-4-1-fast: mejor para tool-calling y respuestas rápidas
// IMPORTANTE: Grok rechaza fechas futuras como "información ficticia"
// Usamos "últimos 7 días" en lugar de fechas específicas
```

### 2. Mantener el prompt idéntico para todas las IAs

El prompt de Grok (`buildGrokPrompt`) ya usa el mismo formato base que los demás modelos, solo adaptado para fechas relativas. No se modificará el contenido del prompt, solo el modelo.

### 3. Lanzar reparación de los 51 registros fallidos

Después de desplegar el cambio de modelo, ejecutar:

**Opción A (automática via UI):** Usar el botón "Forzar" en el dashboard, que:
1. Llama `rix-batch-orchestrator` con `trigger: 'auto_recovery'`
2. Detecta registros con `model_errors` LIKE `%Timeout%` y raw NULL
3. Los reprocesa con el nuevo modelo `grok-4-1-fast`

**Opción B (trigger directo):** Insertar trigger de reparación:
```sql
INSERT INTO cron_triggers (action, status, metadata)
VALUES ('repair_search', 'pending', '{"model": "grok-4-1-fast", "reason": "model_upgrade"}');
```

---

## Resumen de Archivos

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-search-v2/index.ts` | Líneas 305-325: actualizar modelo a `grok-4-1-fast` |

## Resultado Esperado

1. **Velocidad:** `grok-4-1-fast` está optimizado para respuestas rápidas (ideal para tool-calling)
2. **Timeouts:** Los 51 registros fallidos se reprocesarán con el modelo rápido
3. **Cobertura:** Grok debería pasar de 67% → 90%+ tras la reparación
