## Diagnóstico — por qué el barrido va 5× más lento que hace 7 días

### Datos comparados (rix_runs_v2)

| Fecha | Filas | Duración | Throughput | Avg seg/fila (end-to-end) |
|---|---|---|---|---|
| 2026-05-31 (hoy) | 1049 (539 NULL) | 6h 47m (sigue corriendo) | ~75 filas/h | ChatGPT 5014s · Qwen 6441s · Grok 4438s |
| 2026-05-24 | 1050 | 2h 41m | 391 filas/h | ChatGPT 188s · Qwen 462s · Grok 118s |
| 2026-05-17 | 1050 | 3h 09m | 333 filas/h | ChatGPT 377s · Qwen 126s · Grok 181s |
| 2026-05-10 | 1050 | 2h 38m | 399 filas/h | — |

El tamaño de las respuestas brutas por modelo es **idéntico** entre semanas (ChatGPT ~6.2KB, Gemini ~19KB, Perplexity ~37-48KB, etc.). No es un problema de payload.

### Causa raíz — 3 factores combinados

**1. `batch_size:1` hardcoded en los triggers `repair_analysis` (causa principal).**
Inspección de `cron_triggers` activos hoy:
```
params: { batch_size:1, only_models:[ChatGPT], sweep_id:2026-W23 }
params: { batch_size:1, only_models:[Gemini],  sweep_id:2026-W23 }
…
```
Cada invocación de `rix-analyze-v2` procesa **1 fila** (~130-160s en gpt-5) y se re-encola. Con 6 triggers paralelos × 1 fila / 150s → techo teórico **144 filas/h** (coincide con los 75 observados, descontando ghost triggers y cierres).

La semana pasada los triggers no tenían `only_models` per-modelo + `batch_size:1`. Procesaban en bloque, así que un solo invoke drenaba 5-10 filas antes del IDLE_TIMEOUT.

**2. Triggers per-modelo (6) en vez de un pool único.**
Patch reciente del orchestrator dividió `ALL_MODELS` en 6 triggers separados (uno por modelo) para evitar starvation. Efecto colateral: paralelismo limitado a 6 y filas atascadas si un modelo es lento. Hasta la corrección de esta mañana, 2 de ellos (`Gemini`/`DeepSeek`) ni siquiera matcheaban nombre canónico en DB y devolvían "0 pending" → 2 triggers desperdiciados durante horas.

**3. `fetch-momentum-tips` añadido dentro de `rix-analyze-v2` (nuevo).**
Líneas 546-588 de `rix-analyze-v2/index.ts`: por cada fila analizada se hace una llamada HTTP server-to-server a `fetch-momentum-tips`, que a su vez llama a Perplexity (~4-5s observados en logs). Multiplicado por 1050 filas = **~70-90 min adicionales** sobre el coste base. No existía en barridos anteriores.

### Plan de acción (orden recomendado)

1. **Subir `batch_size` por trigger de 1 → 4** en `rix-batch-orchestrator`. El default de la propia función ya es 2 (`tParams.batch_size || 2`); el problema está en quien encola con `batch_size:1`. Buscar el sitio donde se crean los triggers per-modelo y eliminar el override, o forzar mínimo 4. Verificación: tras 10 min, NULLs deben bajar ≥40 (vs ~10 actual).

2. **Hacer `fetch-momentum-tips` no-bloqueante** (fire-and-forget con escritura asíncrona del campo `49_reputacion_vs_precio`) o moverlo a un trigger post-análisis aparte. Recorta ~5s por fila × 1050 = ~90 min.

3. **Reducir granularidad de triggers per-modelo** a 2-3 pools (rápidos vs lentos: ChatGPT+Grok+Perplexity / Gemini+Deepseek+Qwen) en vez de 6. Mantiene anti-starvation pero recupera paralelismo de batch.

4. **Validación final** (igual que el plan previo):
   - 0 filas con `09_rix_score IS NULL` para `batch_execution_date='2026-05-31'`.
   - Duración total comparable a 2026-05-24 (~3h).
   - Ningún `repair_analysis` con `batch_size:1` en `cron_triggers` futuros.

### Fuera de alcance

- Cambiar el modelo `gpt-5` por uno más rápido (riesgo de calidad, fuera de tu doctrina actual).
- Tocar la captura (orchestrator de búsqueda funciona bien: 175/175 completed).
- Refactor del sistema de cron_triggers.

### Notas técnicas

- `signal: AbortSignal.timeout(300_000)` en orchestrator permite hasta 5 min por invocación → cabe sobradamente un `batch_size:4` (4 × 150s = 600s NO, pero la propia plataforma corta a 150s IDLE_TIMEOUT igualmente; el resto se re-encola y no se pierde trabajo).
- Mejor combinación: `batch_size:3` + paralelismo interno (Promise.all dentro de `rix-analyze-v2` no existe hoy — análisis serial). Si quieres más, hay que paralelizar también dentro del worker (fuera de este plan).
