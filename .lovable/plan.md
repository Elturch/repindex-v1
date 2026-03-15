

## Diagnóstico real: GPT-5 está tardando ~3 minutos por análisis

### Causa raíz encontrada

Los logs de `rix-analyze-v2` muestran que cada llamada a GPT-5 tarda **162-183 segundos** (casi 3 minutos):

```text
Analysis completed for Grok in 183867ms. RIX: 49
Analysis completed for Grok in 162650ms. RIX: 51
```

Pero el orquestador tiene un **timeout de 120 segundos** (`AbortSignal.timeout(120_000)`) en la llamada a `rix-analyze-v2`. Como GPT-5 tarda más que el timeout:

```text
Trigger repair_analysis → llama a rix-analyze-v2 → GPT-5 tarda 180s → timeout a 120s → "Signal timed out"
→ Watchdog resetea trigger → se vuelve a intentar → mismo resultado → bucle infinito
```

Esto explica por qué lleva **11 horas** atascado con 83 registros pendientes. Solo consigue completar ~1 registro cada 5 minutos (cuando el watchdog resetea y la función alcanza a procesar algo antes del abort).

**La semana pasada no pasó** porque la API de OpenAI respondía más rápido. Hoy, tras la incidencia de cuota (429), los tiempos de respuesta de GPT-5 se han disparado.

### Estado actual del sweep W12
- **967/1050 analizados** (92.1%)
- **83 pendientes** en 15 empresas (12 con 6/6 pendientes, 3 parciales)
- Todas tienen `search_completed_at = true` → los datos de búsqueda están listos
- El cuello de botella es únicamente el análisis GPT-5

### Corrección propuesta

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

1. **Subir el timeout de 120s a 300s** (el máximo de Supabase Edge Functions es 300s/5min)
   - Línea 925: `AbortSignal.timeout(120_000)` → `AbortSignal.timeout(300_000)`

2. **Reducir batch_size de 5 a 2** para que cada invocación solo procese 2 registros en vez de 5, reduciendo la probabilidad de timeout
   - Línea 921: `batch_size: (trigger.params as any)?.batch_size || 5` → `|| 2`
   - Línea 753 (auto-trigger): `batch_size: 5` → `batch_size: 2`

3. **Reducir batch_size del auto_recovery** (donde inserta nuevos triggers)
   - Línea 2493: `batch_size: 5` → `batch_size: 2`

### Resultado esperado
- Con timeout 300s y batch_size 2, cada invocación puede completar 1-2 análisis (~180s cada uno) sin abortar
- Los 83 registros pendientes se completarían en ~2 horas en vez de quedarse atascados indefinidamente

### Nota
Esto no es un cambio de código del frontend. Solo modifica el orquestador backend (edge function) para adaptarse a la latencia actual de GPT-5.

