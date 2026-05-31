Tienes razón. La hipótesis anterior fue demasiado optimista.

Diagnóstico real observado ahora:

- W23 sigue con 322 registros pendientes y 84 tickers incompletos.
- El ritmo reciente es mejor que antes, pero no suficiente: 81 registros completados en 30 minutos.
- `rix-analyze-v2` sigue devolviendo 504 cuando una invocación tarda más de 150s.
- Hay `shutdown` masivos en Edge Runtime.
- El “fire-and-forget” no elimina el límite real de plataforma: el worker sigue muriendo si excede 150s.
- El sistema creó 25 triggers `repair_analysis` en pocos minutos, aunque ya no quedan activos. Eso demuestra que el cap sobre `pending/processing` no representa trabajo real en curso, porque los triggers se marcan `completed` inmediatamente.
- El batch size lógico dice 1 ticker, pero los logs muestran `Processed: 2`, `3`, `4`. Esto ocurre porque el worker procesa modelos del mismo ticker en paralelo y varios modelos terminan antes del timeout, pero otros quedan colgados o mueren.
- Hay locks en `17_flags` de invocaciones antiguas. El desbloqueo actual de 30 minutos es demasiado largo para una plataforma que corta a 150s.

Conclusión profesional:

El problema principal ya no es solo la tormenta de triggers. Es que se está intentando procesar hasta 6 análisis por invocación dentro de una Edge Function con límite efectivo de 150s. Como varios modelos tardan 120-150s, una invocación por ticker completo no es fiable.

Plan correctivo:

1. Cambiar la unidad de trabajo real
   - Dejar de procesar 1 ticker completo por invocación.
   - Procesar 1 único registro modelo-ticker por invocación.
   - Esto reduce el trabajo máximo por invocación a una sola llamada GPT-5 de análisis.
   - Si un modelo tarda demasiado, solo se pierde ese registro, no todo el ticker.

2. Hacer la reserva realmente atómica a nivel registro
   - Crear una función SQL `claim_next_rix_analysis_record` con `FOR UPDATE SKIP LOCKED`.
   - La función seleccionará exactamente 1 registro pendiente de W23 con respuesta cruda disponible y sin score.
   - Marcará el lock en `17_flags` dentro de la misma transacción.
   - Esto elimina carreras entre workers y evita que varios workers lean el mismo pool.

3. Ajustar `rix-analyze-v2`
   - En modo `reprocess_pending`, llamar a `claim_next_rix_analysis_record`.
   - Procesar solo ese registro.
   - Eliminar el fan-out intra-ticker de 6 modelos.
   - Reducir lock stale a 3 minutos, coherente con el timeout real.
   - Al terminar, limpiar el `analysis_lock` del registro procesado.

4. Ajustar `rix-batch-orchestrator`
   - Mantener concurrencia, pero cada trigger representa 1 registro, no 1 ticker.
   - Subir concurrencia controlada a 10-15 workers, porque cada worker solo procesa una llamada.
   - Sustituir el cap actual por cap de locks activos recientes en `rix_runs_v2`, no por triggers `pending/processing`.
   - No crear más triggers si hay, por ejemplo, 15 locks frescos.
   - Crear solo los triggers necesarios para llenar ese cupo.

5. Parar la cola antes del cambio
   - Purgar `repair_analysis` pendientes/procesando.
   - Liberar locks de `17_flags` anteriores a 3 minutos en W23.
   - No tocar UI.

6. Validación posterior
   - Confirmar que ya no hay `Processed: 2/3/4` en `rix-analyze-v2`; debe ser `Processed: 1` o timeout de 1 registro.
   - Confirmar que no hay ráfagas de 25 triggers en pocos minutos.
   - Confirmar que los 504, si existen, afectan solo a 1 registro.
   - Medir registros completados por 10 minutos y proyectar ETA con datos reales, no con supuestos.

Resultado esperado realista:

- No voy a prometer 30 minutos.
- Con 322 pendientes y tiempos de 100-150s por registro, incluso con 10-15 workers el límite real dependerá de concurrencia efectiva del Edge Runtime y del proveedor AI.
- El objetivo inmediato es estabilizar throughput, eliminar trabajo fantasma y que cada timeout pierda como máximo 1 registro.