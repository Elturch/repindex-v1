

# Plan: Permitir lanzar `auto_generate_newsroom` desde el proxy

## Problema

La edge function `admin-cron-triggers` tiene una lista cerrada de acciones permitidas (`ALLOWED_ACTIONS`) que no incluye `auto_generate_newsroom` ni `auto_sanitize`. Esto impide:
1. Que yo (Lovable) pueda insertar triggers directamente
2. Que el panel de Cron Monitor pueda lanzarlo manualmente
3. Que cualquier operacion administrativa lo dispare sin acceso directo a la BD

## Solucion

Agregar las acciones faltantes a la lista `ALLOWED_ACTIONS` en `admin-cron-triggers`.

## Cambio tecnico

**Archivo:** `supabase/functions/admin-cron-triggers/index.ts`

Linea 55, cambiar:

```typescript
// ANTES
type AllowedAction = 'repair_analysis' | 'auto_populate_vectors' | 'vector_store_continue' | 'repair_invalid_responses' | 'get_latest'

const ALLOWED_ACTIONS: AllowedAction[] = ['repair_analysis', 'auto_populate_vectors', 'vector_store_continue', 'repair_invalid_responses', 'get_latest']
```

```typescript
// DESPUES
type AllowedAction = 'repair_analysis' | 'auto_populate_vectors' | 'vector_store_continue' | 'repair_invalid_responses' | 'auto_generate_newsroom' | 'auto_sanitize' | 'get_latest'

const ALLOWED_ACTIONS: AllowedAction[] = ['repair_analysis', 'auto_populate_vectors', 'vector_store_continue', 'repair_invalid_responses', 'auto_generate_newsroom', 'auto_sanitize', 'get_latest']
```

## Despues del despliegue

Inmediatamente llamare al proxy para insertar el trigger `auto_generate_newsroom` con `attempt: 1` y verificare que el orquestador lo recoge en su siguiente ciclo.

