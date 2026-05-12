# STRESS-MATRIX (SDD v1)

Spec maestra del cruce probabilístico que valida el agente `chat-intelligence-v2`
contra escenarios donde sabemos que falla (subsectores pequeños, hoteles, REITs)
y contra los 6 modelos individuales.

- Spec version: `v1`
- Runner edge function: `stress-matrix-runner`
- Report edge function: `stress-matrix-report`
- Tablas BD: `stress_runs`, `stress_results`

## Familias

- `hotels-reits` — Hoteles (MEL), SOCIMIs, Promotoras Residenciales
- `small`        — Todos los subsectores con ≤5 emisores cotizados (incluye `hotels-reits`)
- `sanity`      — IBEX-35 / IBEX-MC / IBEX-SC top-5 multi-modelo
- `all`         — `small ∪ sanity`

Cada subsector se ejecuta una vez en multi-modelo y una vez por cada uno de los 6 modelos
individuales (gemini, deepseek, grok, qwen, perplexity, chatgpt). Ventana fija: 4 semanas.

## Asserts deterministas

| ID | Descripción | Aplica si |
|----|-------------|-----------|
| `A1_scope_integrity`     | Toda URL en §6 referencia tickers del ranking. | sectorRanking |
| `A2_single_model_lang`   | Sin lenguaje multi-modelo cuando model_filter ≠ null. | model_filter ≠ null |
| `A3_anti_fabrication`    | 0 ocurrencias de Q1-2027/FY-20XX/AGM/target N/+x,x pts/data-room/white-paper/roadshow/protocolo/webinar/briefing/nota de prensa. | siempre |
| `A4_small_n`             | Si N≤3 en subsector, no decir "top-5" ni rellenar con peers de otro subsector. | N≤3 |
| `A5_hotels_edge`         | Si subsector hoteles con 1 emisor (MEL), declara "1 único emisor cotizado". | subsector=Hoteles |
| `A6_anti_mediana`        | 0 ocurrencias de la palabra "mediana". | siempre |
| `A7_period_coherence`    | No hay fechas anteriores a 2026-01-01. | siempre |
| `A8_models_coverage`     | Los 6 modelos son citados ≥1 vez (multi-modelo). | model_filter = null |
| `A9_ranking_enrichment`  | Las 8 sub-métricas (NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM) aparecen. | sectorRanking |
| `A10_biblio_min`         | §6 ≥1 URL por ticker rankeado. | sectorRanking |

Cada celda de salida tiene `asserts_passed[]` y `asserts_failed[{id,msg}]`.

## Consumo de la respuesta

El agente devuelve SSE. El runner acumula los frames `chunk.text` y captura el frame final
`done.metadata` (modelos, ticker, methodology). Los asserts se aplican al markdown completo
y a la metadata. Sin LLM-as-judge.