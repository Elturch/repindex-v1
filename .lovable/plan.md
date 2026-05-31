## Auditoría barrido 2026-W23 (hoy, 31-may-2026)

### Estado real

- **Captura (raw responses):** OK. 1049 filas en `rix_runs_v2` para 175 emisores × 6 modelos. `sweep_progress` = 175 completed / 0 failed / 0 pending.
- **Análisis (RIX scoring):** **BLOQUEADO**. 573 de 1049 filas con `09_rix_score = NULL`. Distribución de NULLs por modelo:
  - ChatGPT 116, Grok 109, Gemini 102, Deepseek 99, Perplexity 83, Qwen 64.
- **Cobertura Perplexity:** 174/175 (falta `FCC-PRIV` — FCC). Probablemente fallo puntual de la API; reanalizable.
- **Newsroom auto:** 3/3 intentos fallidos con `Gemini API error 404: model "gemini-3-pro-preview" is no longer available`.

### Diagnóstico

**P1 — `rix-analyze-v2` no avanza.** El loop de `cron_triggers` (`repair_analysis`) procesa 1–2 filas por invocación y se cae con `HTTP 504 IDLE_TIMEOUT (150 s)` (visible en logs `rix-batch-orchestrator`). Cada llamada toma ~75–150 s en gpt-5 por respuesta de 6–17 KB → no le da tiempo a 2 filas por trigger. A este ritmo, 573 filas tardarán >24 h y compiten con el CRON dominical que arranca pronto.

**P2 — Newsroom roto por modelo retirado.** `supabase/functions/generate-news-story/index.ts` referencia `gemini-3-pro-preview` (líneas 252, 255, 449) que Google ya descatalogó. Fallo determinista, no transitorio.

**P3 — FCC-PRIV sin respuesta Perplexity.** 1 hueco aislado, no bloquea reporting pero contamina rankings que filtren por Perplexity.

### Plan de acción

1. **Acelerar `rix-analyze-v2`** para drenar las 573 filas antes del barrido dominical:
   - Subir el tamaño de lote por trigger de 1–2 a 4–6 registros (mantener concurrencia interna baja para no saturar gpt-5).
   - Subir el timeout efectivo del loop: cuando `remaining > 0` y la invocación lleva <120 s, hacer un segundo paso antes de re-encolar, en lugar de re-encolar tras una sola fila.
   - Verificación: tras 10 min, `SELECT COUNT(*) FILTER (WHERE 09_rix_score IS NULL)` debe caer de forma monótona.

2. **Arreglar newsroom (P2).** Sustituir `gemini-3-pro-preview` por `gemini-2.5-pro` (vigente) en las 3 referencias de `generate-news-story/index.ts`. Re-disparar `auto_generate_newsroom` manualmente y verificar 200 OK.

3. **Reparar FCC-PRIV Perplexity (P3).** Encolar un `repair_search` puntual para `ticker=FCC-PRIV, model=Perplexity, sweep=2026-W23`. Si vuelve a fallar, marcarlo como hueco aceptado (semana pasada también tuvo 1 hueco).

4. **Verificación final** antes del barrido dominical:
   - 0 filas con `09_rix_score IS NULL` para `batch_execution_date='2026-05-31'`.
   - 6 modelos × 175 emisores = 1050 filas (o 1049 si FCC-PRIV/Perplexity queda excluido).
   - Newsroom de la semana generado y `cron_triggers` sin `failed` recientes.

### Detalles técnicos

- No tocar la lógica del orchestrator (`rix-batch-orchestrator`) ni el `sundayResolver`: la captura va bien.
- No tocar `rix_runs_v2` directamente; todo via edge functions / triggers.
- `gemini-2.5-pro` ya se usa en otros pipelines del proyecto (ingestion), no se necesita nuevo secret.
- El IDLE_TIMEOUT de 150 s es límite de plataforma; la solución es procesar más por invocación, no pedir más tiempo.

### Fuera de alcance

- Cambios en frontend "Crear informe" (ya parcheados en el turno anterior).
- Refactor del sistema de `cron_triggers` (sólo ajuste de batch size).
- Cambios de modelo en `rix-analyze-v2` (gpt-5 sigue).
