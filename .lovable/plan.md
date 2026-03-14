
Diagnóstico confirmado (revisando tu exportado):
- En el informe aparece exactamente “n/d” en deltas de RMM/CEM/SIM y la nota “Delta semanal disponible solo para RIX global”.
- En base de datos sí hay histórico para calcular deltas por métrica (ejemplo TEF semana 2026-03-08 vs 2026-03-01: NVM -1.00, DRM +7.50, SIM -5.00, CEM +9.00, etc.).
- Causa raíz en código: el pipeline calcula esos deltas (`metricasConDelta`) pero luego no los inyecta en el bloque JSON que ve el LLM (`dataPackBlock`). Además, el prompt fuerza “n/d” cuando no hay histórico por métrica; como ese histórico no se expone, el modelo actúa “correctamente” pero con salida incompleta.

Plan de corrección (sin tocar otras funcionalidades/roles):
1) Exponer deltas de métricas al orquestador
- Archivo: `supabase/functions/chat-intelligence/index.ts`
- En `buildOrchestratorPrompt` añadir al `dataPackBlock`:
  - `delta_rix`
  - `metricas_consolidadas` (con `mediano/min/max/categoria_dominante/delta`)
  - opcional: bloque explícito de “última semana vs anterior” para las 8 métricas.

2) Corregir semántica de delta “sin histórico”
- En `skillCompanyProfile`, cambiar `delta` de `0` a `null` cuando no exista semana previa.
- Añadir bandera de disponibilidad (`has_delta`) para evitar ambigüedad entre “0 real” y “no disponible”.

3) Paridad con fallback legacy
- En `buildDataPack` (ruta legacy), calcular y poblar la misma estructura de deltas por métrica para que no vuelva el problema si hay fallback.

4) Ajustar prompt para usar el nuevo bloque
- Mantener la regla de honestidad, pero indicar:
  - “si `metricas_consolidadas.*.delta` existe, mostrar delta numérico”
  - “usar n/d solo cuando `delta=null`”.
- Eliminar contradicciones que induzcan “solo RIX” cuando sí hay desglose.

5) Verificación de salida
- Ejecutar consulta “Evolución de Telefónica”.
- Validar que en “KPIs Principales con Delta” aparezcan deltas numéricos en métricas con histórico (no solo RIX).
- Exportar HTML/PDF y comprobar que desaparece la nota de “solo RIX” cuando sí hay datos.

Resultado esperado
- Deltas coherentes y no vacíos en métricas individuales cuando existe histórico semanal.
- “n/d” únicamente en casos realmente sin datos.
