
## ✅ HOTFIX IMPLEMENTADO (2026-02-08)

### Problema resuelto
El barrido W07 estaba bloqueado porque:
1. `getActiveSweepId()` derivaba el sweep desde `rix_runs_v2.06_period_from` (rolling dates)
2. Esto causaba que el orquestador apuntara a W05 mientras los datos se insertaban para W07
3. `rix-search-v2` actualizaba `sweep_progress` con un `currentSweepId` por calendario, causando desalineación

### Cambios implementados

#### A) `rix-batch-orchestrator/index.ts`
1. **`getActiveSweepId()` reescrita**: Ahora busca sweep activo desde `sweep_progress` (trabajo pendiente real), no desde `rix_runs_v2`
2. **Acepta `sweep_id` forzado**: Nuevo parámetro `sweep_id` en request con máxima prioridad
3. **Pasa `sweep_id` a `rix-search-v2`**: El fire-and-forget ahora incluye `sweep_id` en el body

#### B) `rix-search-v2/index.ts`
1. **Acepta `sweep_id` del request**: Nuevo parámetro `requestSweepId` 
2. **Usa `sweep_id` recibido para actualizar `sweep_progress`**: Si viene, lo usa; si no, fallback a calendario

### Estado actual del barrido W07
- **84 completed** → empresas procesadas antes del hotfix
- **84 pending** → en cola para procesar
- **6 processing** → PUIG, ROVI, IDR, MTS, GRF, LOG procesándose ahora
- **1 auto_continue pending** → continuará automáticamente

### Notas
- **Grok API**: Error 429 (créditos agotados) - requiere recargar en xAI
- Los otros 5 modelos (ChatGPT, Perplexity, Gemini, DeepSeek, Qwen) funcionan correctamente

---

## Hardening futuro (opcional)

### Tabla `rix_sweeps` (no implementada aún)
Para anclar `date_from/date_to/batch_execution_date` a un sweep específico:

```sql
CREATE TABLE public.rix_sweeps (
  sweep_id text PRIMARY KEY,
  batch_execution_date timestamptz NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'active' -- active/completed/archived
);

-- RLS
ALTER TABLE public.rix_sweeps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sweeps are publicly readable" ON public.rix_sweeps FOR SELECT USING (true);
CREATE POLICY "Service role can manage sweeps" ON public.rix_sweeps FOR ALL USING (true);
```

Esto eliminaría definitivamente el drift por rolling dates en sweeps que duran horas/días.
