## Análisis del primer estudio (run `d47fd0e8…`)

21 casos · **0 passed / 21 failed** · 7 errors · 0 timeouts.

Distribución de fallos por assert (cobertura horizontal: afecta a 5–7 modelos y a 3/3 subsectores → **es sistémico, no temático de hoteles**):

| Assert | Hits | Modelos | Subsectores | Lectura |
|---|---|---|---|---|
| A10 biblio_min | 20 | 7 | 3 | §6 vacía o sin URL por ticker rankeado |
| A9 ranking_enrichment | 18 | 7 | 3 | Tabla de ranking pierde sub-métricas (sobre todo CXM) |
| A2 single_model_lang | 15 | 5 | 3 | Reportes single-model usan "rix medio" / "entre modelos" |
| A6 anti_mediana | 14 | 5 | 3 | Aparece "mediana" pese a la regla Anti-Mediana |
| A5 hotels_edge | 7 | 7 | 1 | El agente NO declara que Hoteles tiene 1 emisor cotizado |
| A3 anti_fabrication | 4 | 4 | 3 | Aparece "white-paper" en cuatro reportes |

Hallazgos cualitativos al revisar respuestas crudas:

1. **Hoteles → canonical group oculto.** El agente expande silenciosamente el subsector "Hoteles" (1 emisor: MEL) a un grupo "travel & hospitality" de 6 (BOOKING-PRIV, AIRBNB-PRIV, EDR, IAG, AENA). Rompe `verified_competitors` y `subsector strict`. Es la causa raíz de A5 y de fallos de scope cruzado.
2. **DeepSeek single-model devuelve stub** (~250 chars, 600–800 ms): "Sin datos suficientes". Mismo período en multi-modelo trae 144 filas. Bug en el filtro de modelo (probable mismatch `deepseek` vs `deepseek-chat`/`deepseek-v3`).
3. **Plantilla single-model heredada de multi-model**: el header "Ranking por consenso entre IAs", la columna "Dispersión entre IAs" y frases como "RIX de referencia" se imprimen aunque sólo haya 1 modelo activo.
4. **Bibliografía**: cuando aparece, agrupa URLs sin etiquetar por ticker; cuando no aparece, el render salta §6 entera.
5. **Tabla de ranking**: el LLM decide qué sub-métricas pinta; cuando no encuentra valores cae a "N/A textual" o las omite directamente.

## Plan de corrección (sistémico, no parche hoteles)

### B1 · Scope strict para subsectores (raíz de A5 + scope leak)

- En `chat-intelligence-v2`, cuando el intent es `sectorRanking` y la query menciona literalmente "subsector X" / "del subsector X":
  - Resolver scope por `repindex_root_issuers.subsector` (case-insensitive, normalizado).
  - **Prohibir fallback automático a canonical group.** Si N=1, devolver el ranking de 1 emisor + bloque "Contexto ampliado opcional" claramente etiquetado y opt-in (no entra en el ranking).
  - Si N=0, declarar "subsector sin emisores cotizados" sin inventar peers.
- En `skillGetSectorComparison` añadir flag `strict_subsector: true` cuando viene de query con la palabra "subsector".

### B2 · Pipeline single-model (raíz de A2, A6 parcial, DeepSeek stub)

- En el orquestador, cuando `model_filter ≠ null`:
  - Normalizar el nombre del modelo a las variantes reales en `rix_runs_v2."02_model_name"` (mapa `deepseek → deepseek-chat|deepseek-v3`, etc.). Hoy DeepSeek queda fuera del filtro y el dataset se vacía.
  - Inyectar un **prompt-mode "single-model"** que reemplaza:
    - "Ranking por consenso entre IAs" → `Ranking por <Modelo>`
    - elimina columna "Dispersión entre IAs" y todas las columnas de los otros 5 modelos
    - obliga a §5 con título `Fuentes citadas por <Modelo>`
  - Añadir post-scrubber regex (sanitizer) que sustituya/elimine en single-model: `entre modelos|consenso multi|RIX medio|los demás modelos|promedio entre IAs|mediana`.

### B3 · Refuerzo Anti-Mediana global (A6)

- Añadir a `antiHallucination.ts` regla explícita: "PROHIBIDA la palabra 'mediana' en cualquier contexto. Usar 'referencia' o 'comparar todas las puntuaciones'".
- Añadir scrubber post-generación que reemplaza `mediana → referencia` y registra el evento en `response_meta.scrub_log[]`.

### B4 · Pre-render determinista de la tabla de ranking (A9)

- Mover la generación del ranking a `datapack/tableRenderer.ts` (ya es la regla del proyecto). Garantizar siempre las 8 columnas NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM.
- Para CXM aplicar la regla canónica (memoria): "N/A" si la empresa no está en CXM whitelist. Visible siempre como columna.

### B5 · Bibliografía §6 garantizada por ticker (A10)

- Tras ejecutar skills, builder de bibliografía recorre los `tickers_rankeados` y emite una fila por ticker con `[Issuer (TICKER)]: url1 · url2`. Si un ticker no tiene fuentes, escribir literal "Sin fuentes verificadas en el período".
- En DeepSeek/single-model con dataset vacío: aún así emitir §6 con disclaimer.

### B6 · Anti-fabricación "white-paper" + corpus extendido (A3)

- Añadir a la lista negra de `antiHallucination.ts`: `white-paper, whitepaper, libro blanco, hoja de ruta, tabla de seguimiento`.
- Scrubber registra el match y cae a "N/A".

### B7 · Asserts más justos (reducir falsos positivos sin relajar la doctrina)

- **A10**: aceptar coincidencia ticker O nombre del emisor en cualquier punto de §6 (no per-línea). Mantener obligatoriedad de la sección.
- **A5**: aceptar variantes textuales adicionales de declaración de unicidad (`MEL es el único hotelero cotizado`, `1 emisor en el subsector`, etc.).
- **A1**: tolerar dominios oficiales del emisor (cnmv.es / bolsasymercados / dominios issuer-owned) cuando el ticker no aparece en la línea pero sí el nombre.
- A2/A3/A6/A7/A8/A9 se mantienen estrictos (son la doctrina).

### B8 · Diagnóstico extra en `stress_results`

- Añadir `models_in_dataset` (modelos efectivamente presentes tras filtro) y `tickers_in_dataset` al `response_meta`. Permite distinguir "el agente lo pintó mal" de "el dataset estaba vacío".

### B9 · Validación

1. Re-correr `family=hotels-reits` (21 casos) → objetivo ≥ 17/21 pass.
2. Si pasa, correr `family=small` (≈100 casos) para detectar regresiones cruzadas (utilities, banca, farmacéuticas).
3. Anotar en `mem://features/chat/...` los nuevos invariantes (single-model scrubber, scope strict, biblio garantizada).

### Fuera de alcance

- LLM-as-judge, auto-fix automático, cron del runner, ajustes a las skills V1 deprecadas, cambios en datasets de entrada.

### Archivos previstos

- `supabase/functions/chat-intelligence-v2/orchestrator.ts` (single-model branch + strict subsector flag)
- `supabase/functions/chat-intelligence-v2/prompts/antiHallucination.ts` (mediana, white-paper)
- `supabase/functions/chat-intelligence-v2/prompts/singleModel.ts` (nuevo, ≤80 LOC)
- `supabase/functions/chat-intelligence-v2/datapack/tableRenderer.ts` (8 sub-métricas garantizadas)
- `supabase/functions/chat-intelligence-v2/postprocess/scrubber.ts` (nuevo)
- `supabase/functions/chat-intelligence-v2/postprocess/bibliographyBuilder.ts` (garantizar §6)
- `supabase/functions/_shared/modelNameNormalizer.ts` (deepseek/qwen/grok mapping)
- `supabase/functions/stress-matrix-runner/asserts.ts` (A10/A5/A1 más justos, sin relajar A2/A3/A6)
- `src/lib/skills/skillGetSectorComparison.ts` (flag strict_subsector)

Sin migraciones BD. Sin nuevas tablas.
