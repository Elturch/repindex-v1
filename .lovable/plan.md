
Objetivo: corregir de forma definitiva que en consultas tipo “Top/Bottom IBEX según [modelo]” salgan tablas vacías y métricas a 0/N/A, manteniendo el ranking correcto.

Diagnóstico auditado (causa real)
1) El problema principal NO es el barrido ni falta de datos en BD:
- En `rix_runs_v2` sí existen métricas completas por empresa/modelo (NVM…CXM) para IBEX.
2) El fallo está en el armado del DataPack del pipeline de skills:
- Logs reales de `chat-intelligence`: `snapshot:0, ranking:35`.
- Con `snapshot` vacío, E3/E4 se saltan y el LLM redacta informe con “sin desglose métrico”.
3) Además hay dos incoherencias funcionales:
- El bloque enviado al LLM corta `ranking` a 15 (`slice(0,15)`), dificultando Bottom real.
- `report_context` en skills fija siempre 6 modelos aunque el filtro sea “solo Gemini”.

Conclusión: ampliar diccionario ayuda, pero por sí sola NO arregla métricas vacías. Hay que corregir la ruta de datos del ranking.

Plan de implementación
Fase 1 — Estabilizar interpretación (diccionario + patrones)
- Archivo: `supabase/functions/chat-intelligence/index.ts`
1. Ampliar detección semántica para ranking Top/Bottom:
   - Añadir variantes: `bottom`, `botom`, `cola`, `últimos`, `colistas`, `peores`, `los más bajos`, etc.
   - Extraer cantidades (`top 5`, `bottom 5`) con regex robusta multilenguaje.
2. Guardar en filtros estructurados:
   - `filters.top_n`, `filters.bottom_n` (defaults seguros: 5/5 cuando se pidan ambos).

Fase 2 — Corregir DataPack de ranking para que nunca quede “ciego”
- Archivo: `supabase/functions/chat-intelligence/index.ts`
3. En `buildDataPackFromSkills`, cuando haya `ranking` y no haya `companyProfile/sectorSnapshot`:
   - Hacer un “ranking-enrichment” con `rix_runs_v2` (métricas + resúmenes + flags) para empresas Top/Bottom solicitadas.
   - Construir `pack.snapshot` con detalle por modelo (aunque sea 1 modelo filtrado).
   - Poblar `pack.metricas_consolidadas`, `pack.raw_texts`, `pack.explicaciones_metricas` y `pack.puntos_clave`.
4. Ajustar `report_context` dinámico en skills:
   - `models` y `models_count` reales según datos (si filtro Gemini => 1 modelo).
   - `sample_size` y `weeks_analyzed` reales del subconjunto usado.

Fase 3 — Evitar pérdida de Bottom y vacíos en generación del informe
- Archivo: `supabase/functions/chat-intelligence/index.ts`
5. En `buildOrchestratorPrompt`:
   - Dejar de enviar solo `ranking.slice(0,15)` para consultas Top/Bottom.
   - Enviar explícitamente `ranking_top` y `ranking_bottom` (o ranking completo limitado por query).
6. Añadir regla de redacción:
   - Si consulta pide Top+Bottom, es obligatorio incluir ambas tablas.
   - Si hay `snapshot`, es obligatorio completar sección de 8 métricas con datos reales (no “n/d”).

Fase 4 — Hardening opcional del fallback LLM
- Archivo: `supabase/functions/chat-intelligence/index.ts`
7. Mantener diccionario como primera capa determinística.
8. Solo si la interpretación queda en baja confianza, usar fallback LLM más robusto (sin sustituir capa determinística), para no romper latencia/coste.

Validación (criterios de aceptación)
A) Query: “Dame el ranking IBEX 35 top 5 y bottom 5 de Gemini”
- Debe devolver Top 5 y Bottom 5.
- Debe mostrar métricas no vacías (NVM..CXM) en informe.
- `report_context.models_count` = 1 y modelo = Gemini.
B) Query: “Top 5 y bottom 5 del IBEX 35” (sin modelo)
- Debe devolver Top/Bottom con consolidado 6 modelos.
- Métricas no vacías (consolidado).
C) Log técnico esperado en `chat-intelligence`:
- Pasar de `snapshot:0` a `snapshot>0` en estas consultas.
- Sin mensajes de “No snapshot data, skipping comparator” para estos casos.

Archivos a tocar
- `supabase/functions/chat-intelligence/index.ts` (principal: parser, enrichment, prompt, report_context).
- (Opcional de consistencia) `src/lib/skills/skillInterpretQuery.ts` para alinear semántica frontend/backend de top/bottom y aliases.

Resultado esperado
- Se elimina la incoherencia actual (ranking correcto pero métricas vacías).
- El sistema queda más estable para phrasing real de usuarios (incluyendo typos como “botom”).
- No depende únicamente de “modelo más potente”; prioriza datos estructurados correctos.
