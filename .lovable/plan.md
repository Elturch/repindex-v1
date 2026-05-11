## Resumen del cotejo

He auditado el informe que subiste (10 mejores, 4 semanas, sólo ChatGPT) contra la base de datos real. **Hay dos problemas reales que mi último parche no resolvió completamente.**

### Top 10 real (IBEX-35, ChatGPT, media 2026-04-10 → 2026-05-09)

| # | Ticker | Avg ChatGPT | Max |
|---|---|---|---|
| 1 | TEF  | 64,75 | 72 |
| 2 | BBVA | 62,75 | 71 |
| 3 | MRL  | 61,75 | 67 |
| 4 | BKT  | 61,25 | 68 |
| 5 | FER  | 60,75 | 67 |
| 6 | CLNX | 60,75 | 60 |
| 7 | SAN  | 60,50 | 65 |
| 8 | MTS  | 60,00 | 62 |
| 9 | SAB  | 60,00 | 63 |
| 10 | SCYR | 59,75 | 70 |

### Lo que muestra tu informe

| # | Ticker | RIX ChatGPT |
|---|---|---|
| 1 | TEF  | 64,8 ✅ |
| 2 | BBVA | 62,8 ✅ |
| 3 | SCYR | 59,8 ❌ (debería ser MRL 61,8) |
| 4 | REP  | 56,3 ❌ (no entra en top 10 real) |
| 5 | IDR  | 55,5 ❌ (no entra) |
| 6 | BKT  | 61,3 ❌ (debería ser #4) |
| 7 | MRL  | 61,8 ❌ (debería ser #3) |
| 8 | FER  | 60,8 ❌ (debería ser #5) |
| 9 | COL  | 56,5 ❌ (no entra) |
| 10 | LOG  | 56,5 ❌ (no entra) |

**Diagnóstico**: el orden y la SELECCIÓN del top 10 siguen el campo `rix_max` (pico semanal), no `per_model[ChatGPT]` (promedio visible). Coincide perfectamente con el orden por `rix_max` que devuelve la BD: TEF 72, BBVA 71, SCYR 70, REP 69, IDR 69, BKT 68, MRL 67, COL 67, FER 67, LOG 66. Es decir, mi fix llega a `aggregateRanking` pero el LLM (o un paso intermedio) está re-ordenando con la lista vieja.

Además, la narrativa dice **"snapshot puntual"** aunque el log de orquestación reporta `mode=period` con 4 semanas reales.

### Plan correctivo

1. **Re-confirmar que `singleModelKey` se pasa a `aggregateRanking` y que el `slice(topN)` ocurre tras la nueva ordenación** (revisar que `parsed.models` en el momento de la llamada tiene exactamente `["ChatGPT"]`; si `extractModelNames` no detecta el "usando solo ChatGPT" emitido por `compileQuestion`, `models.length` será 6 → singleModelKey=undefined → ordena por `rix_max`).
2. **Forzar selección por columna visible en single-model**: si tras (1) sigue fallando, mover el sort por `per_model[singleModelKey]` también al criterio del `slice` y asegurar que las posiciones del LLM se ciñan a la tabla pre-renderizada (mismo orden, mismos tickers).
3. **Eliminar "snapshot puntual" del prompt cuando `mode=period`**: el resumen ejecutivo y el análisis empresa-por-empresa deben heredar `effectiveTemporal` y la cadena `period_label = "media de 4 semanas (10-abr → 9-may)"`.
4. **Test 1-semana solicitado**: ejecutar el mismo informe pidiendo `2026-05-03 → 2026-05-03` (única semana, snapshot puro, ChatGPT, IBEX-35, top 5) y cotejar con el Dashboard filtrado a esa misma semana + ChatGPT. El resultado esperado por BD es:
   - 1. MAP 63 · 2. SCYR 63 · 3. SAB 62 · 4. CLNX 61 · 5. MRL 60.

### Datos de cotejo del Dashboard (para tu vista lateral)

Para validar visualmente, abre el Dashboard con filtros: `Universo=IBEX-35`, `Modelos=Solo ChatGPT`, `Semana=2026-05-03`. Debe coincidir exactamente con la lista anterior. Cualquier valor distinto indica un problema en el shim del dashboard, no en el informe.

### Alcance del cambio

Sólo `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts` (parámetro `singleModelKey` y prompts de narrativa). No se toca dashboard, ni `compileQuestion`, ni `coherenceEngine`, ni el motor V2 fuera de este skill.
