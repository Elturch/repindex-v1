
# Plan: Corregir Tracking de Tipos de Informe

## Problemas Identificados

### 1. Bug Crítico: `depth_level` no se guarda en logs de chat
- El código fuente TIENE la lógica correcta (línea 3021 en `chat-intelligence/index.ts`)
- Pero los registros en `api_usage_logs` con `action_type = 'chat'` tienen `metadata: {}` vacío
- Esto indica que **el edge function desplegado es una versión anterior** sin esta funcionalidad

### 2. El fallback por tokens tiene umbrales incorrectos
El dashboard (`admin-api-data/index.ts` líneas 565-570) infiere:
```
>70,000 tokens → exhaustive
>40,000 tokens → complete  
≤40,000 tokens → quick
```

Pero la realidad es:
- Exhaustive: ~60-70k tokens (clasificado erróneamente como "complete")
- Complete: ~50-65k tokens
- Quick: ~20-25k tokens

---

## Solución Propuesta

### Paso 1: Re-desplegar el edge function `chat-intelligence`
El código fuente ya tiene la corrección. Solo necesita desplegarse para que los nuevos logs guarden `depth_level` correctamente.

### Paso 2: Ajustar umbrales del fallback (temporal)
Mientras se acumulan datos con `depth_level` correcto, ajustar los umbrales en `admin-api-data`:

```typescript
// ANTES (líneas 565-570)
if (totalTokens > 70000) depthLevel = 'exhaustive'
else if (totalTokens > 40000) depthLevel = 'complete'
else depthLevel = 'quick'

// DESPUÉS (más realista)
if (totalTokens > 55000) depthLevel = 'exhaustive'
else if (totalTokens > 30000) depthLevel = 'complete'
else depthLevel = 'quick'
```

### Paso 3: Agregar logging de depuración
Añadir console.log en el edge function para verificar que `depthLevel` está definido antes de llamar a `logApiUsage`:

```typescript
// Antes de logApiUsage en línea 3009
console.log(`${logPrefix} Logging API usage with depth_level: ${depthLevel}`);
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Añadir log de depuración antes de `logApiUsage` |
| `supabase/functions/admin-api-data/index.ts` | Ajustar umbrales de fallback por tokens |

---

## Verificación Post-Deploy

Después de desplegar, hacer un informe "exhaustivo" y verificar:

1. En logs del edge function: `Logging API usage with depth_level: exhaustive`
2. En base de datos:
```sql
SELECT metadata->>'depth_level', created_at 
FROM api_usage_logs 
WHERE action_type = 'chat' 
ORDER BY created_at DESC 
LIMIT 1;
```
Debería mostrar `exhaustive`, no `null`.

---

## Resultado Esperado

| Antes | Después |
|-------|---------|
| Chat logs: `metadata: {}` | Chat logs: `metadata: {depth_level: "exhaustive", role: ...}` |
| Dashboard infiere "complete" para ~64k tokens | Dashboard usa el valor real guardado |
| Fallback necesario siempre | Fallback solo para logs históricos |

---

## Tiempo Estimado
- Deploy del edge function: Automático al guardar
- Ajuste de umbrales: ~5 minutos
- Verificación: ~3 minutos
