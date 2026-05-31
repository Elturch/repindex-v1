## Cambio único

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts` (línea 975)

**Acción:** Subir el `AbortSignal.timeout` de la llamada a `rix-analyze-v2` (acción `repair_analysis`) de `300_000` ms (5 min) a `600_000` ms (10 min).

### Diff

```ts
-          signal: AbortSignal.timeout(300_000),
+          signal: AbortSignal.timeout(600_000),
```

### Por qué

Con `batch_size=2-3` y gpt-5 tardando 90-180s/fila, una invocación de `reprocess_pending` puede superar 5 min antes de devolver respuesta. El orchestrator aborta, el trigger queda como "processing" zombi y hay que pulsar "Resetear Zombis" para reanudar. Subir a 10 min cubre el peor caso real observado en los logs y deja margen.

### Lo que NO se toca

- `rix-analyze-v2/index.ts` — sin cambios.
- Plan W24 — sigue guardado para el sábado.
- Lógica de zombie cleanup (5 min) — sin cambios; sigue protegiendo si la función realmente se cuelga, porque el zombie reset mira `started_at` del registro, no este timeout HTTP.
- Auto-requeue, batch_size, orquestación — sin cambios.

### Validación tras deploy

1. Próxima invocación de `repair_analysis` debe completar sin `HTTP 504: IDLE_TIMEOUT` ni `AbortError` en logs del orchestrator.
2. El trigger pasa de `processing` → `pending` (con `remaining > 0`) o → `completed`, sin quedarse atascado.
3. NULLs de `49_reputacion_vs_precio` siguen bajando al mismo ritmo que ahora (este cambio no toca análisis, solo el timeout del caller).

Sin migraciones. Sin cambios de UI. Un fichero, una línea.
