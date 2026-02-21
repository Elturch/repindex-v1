

# Plan: Limpiar zombie y prevenir recurrencia

## Paso 1 -- Limpieza inmediata

Ejecutar un UPDATE directo en la tabla `cron_triggers` para marcar el trigger zombie como `done` (no `pending`, porque si se pone en `pending` el orquestador lo volvera a procesar y podria quedarse atascado de nuevo antes del barrido de manana):

```sql
UPDATE cron_triggers 
SET status = 'done', 
    processed_at = now() 
WHERE id = '9b931903-80e7-4a89-a693-53ee202af248';
```

La vectorizacion se relanzara automaticamente tras el barrido de manana domingo (cadena autonoma: sweep 100% -> auto_sanitize -> auto_populate_vectors).

## Paso 2 -- Prevencion: ampliar la lista de zombie cleanup

En `supabase/functions/rix-batch-orchestrator/index.ts` (linea 842), el array de acciones con limpieza extendida de 10 minutos solo incluye `repair_search` y `repair_invalid_responses`. Falta `auto_populate_vectors` (y `auto_generate_newsroom`, `auto_sanitize`, `vector_store_continue`).

**Cambio**: Ampliar el array de la linea 842 para incluir TODAS las acciones que pueden tardar mas de 4 minutos:

```
Antes (linea 842):
for (const zombieAction of ['repair_search', 'repair_invalid_responses']) {

Despues:
for (const zombieAction of [
  'repair_search', 
  'repair_invalid_responses',
  'auto_populate_vectors',
  'vector_store_continue',
  'auto_generate_newsroom',
  'auto_sanitize'
]) {
```

Esto asegura que si cualquiera de estas acciones se queda en `processing` mas de 10 minutos, se resetea automaticamente a `pending` para reintento.

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| Tabla `cron_triggers` (SQL directo) | Marcar zombie como `done` |
| `supabase/functions/rix-batch-orchestrator/index.ts` (linea 842) | Ampliar lista de acciones con zombie cleanup extendido |

## Lo que NO cambia

- La logica del barrido dominical
- El Embudo Narrativo ni el chat-intelligence
- El frontend
- La cadena autonoma post-sweep

