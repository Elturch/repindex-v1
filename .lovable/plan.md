# Acelerar rix-analyze-v2 — análisis de las 6 IAs en paralelo

## Idea central

Cada fila de `rix_runs_v2` representa **una IA analizando un ticker**. Hoy el loop procesa esas filas en serie (`for...of` + `await` + `sleep 500ms`), así que las 6 IAs de un mismo ticker se analizan una detrás de otra (~9 min/ticker con gpt-5).

El cambio: **analizar las 6 IAs en paralelo** dentro de cada invocación. Para un ticker pasa de ~9 min a ~90 s.

## Cambio único

**Archivo:** `supabase/functions/rix-analyze-v2/index.ts` — solo el bloque REPROCESS (loop ~835-870).

1. Tras obtener `pendingRecords` (hasta BATCH_SIZE=15), **agrupar por ticker**.
2. Por cada ticker, lanzar las filas (1 por modelo) con `Promise.allSettled` → las 6 IAs corren simultáneas.
3. Procesar los tickers en serie dentro de la invocación (uno tras otro) hasta agotar el batch o el tiempo.
4. Mantener intactos: locking optimista, skip de zombies, take-over de locks viejos, release-on-error.
5. Eliminar el `setTimeout(500)` entre filas: la concurrencia limitada por ticker (6) ya regula la presión sobre OpenAI.

```text
ANTES (por ticker)              DESPUÉS (por ticker)
ChatGPT  ████████ 90s           ChatGPT  ████████ 90s
Gemini   ········ ████████      Gemini   ████████   } en paralelo
Deepseek ········ ········ ███  Deepseek ████████
Grok     ...                    Grok     ████████
Perplex  ...                    Perplex  ████████
Qwen     ...                    Qwen     ████████
Total: ~9 min                   Total: ~90 s  (6×)
```

## Aritmética

- Batch de 15 filas ≈ 2-3 tickers × 6 modelos.
- Antes: 15 × 90s = **22 min** (muere a los 10 min, procesa ~6).
- Después: 3 tickers × 90s = **~4.5 min** (cabe en los 10 min, procesa los 15).
- Sumado a los 5 triggers concurrentes del orchestrator → **15 IAs en vuelo simultáneas**.
- 530 pendientes: de ~13 h de cómputo serial a **~45 min reales**.

## Por qué es seguro

- **OpenAI rate limit**: gpt-5 tier 4-5 admite >5000 RPM. 15 llamadas concurrentes está muy por debajo.
- **Sin doble procesamiento**: el `UPDATE ... WHERE analysis_completed_at IS NULL` ya es optimista y atómico; dos workers compitiendo por la misma fila → solo uno gana.
- **Locks intactos**: cada worker hace su propio lock/release dentro de su `try/catch`.
- **Modelos independientes**: cada IA usa su propia API key y client, no comparten estado.

## Lo que NO se toca

- Front (`/admin`, hooks, componentes).
- Modo MISSING_ONLY ni STANDARD.
- `analyzeRecord`, prompts, sanitización.
- BATCH_SIZE=15, timeout 10 min del orchestrator, zombie cleanup 30 min.
- search-v2, orchestrator, otros edge functions.

## Validación tras deploy

1. Logs muestran 6 líneas `Processing: TICKER - <modelo>` con timestamps idénticos (±1s).
2. 6 líneas `Analysis completed` casi simultáneas por ticker.
3. Invocación REPROCESS con 15 pendientes completa en < 5 min.
4. Cero duplicados: `SELECT id FROM rix_runs_v2 WHERE analysis_completed_at > now() - interval '30 min' GROUP BY id HAVING count(*) > 1` → vacío.
5. Sin 429 de OpenAI en logs.

Un fichero, un cambio acotado al loop de REPROCESS.
