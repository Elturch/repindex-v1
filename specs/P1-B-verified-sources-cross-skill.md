# P1-B — verifiedSources reales por modelo en SSE done.metadata

## Objetivo
Asegurar que `done.metadata.verifiedSources` (consumido por
`generateBibliographyHtml` en el FE para el PDF/HTML export) se rellene con
URLs reales por modelo en TODAS las skills que disponen de respuestas
brutas, no sólo en `companyAnalysis` y `sectorRanking`.

Estado actual:
- `verifiedSourcesAdapter.toVerifiedSources()` mapea correctamente
  `CitedSourcesReport` → `VerifiedSourceWire[]` filtrando por
  ChatGPT/Perplexity (zero-invention policy del FE).
- `index.ts` lee `result.datapack.cited_sources_report` y lo pasa al
  adapter — ya correcto.
- **Sólo** `companyAnalysis.ts` y `sectorRanking.ts` setean
  `cited_sources_report` en su DataPack devuelto.
- `comparison.ts` y `modelDivergence.ts` SÍ extraen `*_bruto` (vía
  hydrateBrutoColumns o SELECT directo) pero NO ejecutan
  `extractCitedSources` ni publican el report.
- `periodEvolution.ts` no extrae `*_bruto` (SELECT light); queda fuera de
  scope hasta P1+ (su intent ya es un timeline puro).

## Contrato I/O
- Sin cambios en el wire del SSE. La forma `VerifiedSourceWire` ya está
  estabilizada y consumida por el FE: `{ url, domain, title?,
  sourceModel: 'ChatGPT'|'Perplexity', temporalCategory, extractedDate? }`.
- Sin cambios en `verifiedSourcesAdapter.ts` (su lógica ya es correcta
  end-to-end).

## Diseño
1. En `comparison.ts`: tras agregar `flatRows = rowsPerEntity.flat()` y
   ANTES del return, ejecutar
   `extractCitedSources(flatRows)` y poblar
   `cited_sources_report` en el DataPack.
2. En `modelDivergence.ts`: tras `workingRows`, ejecutar el mismo
   extract sobre `workingRows` y poblar `cited_sources_report`.
3. NO se cambia `periodEvolution.ts` en P1-B — su SELECT no incluye
   columnas brutas. Documentado como exclusión consciente.

## Archivos tocados
- `supabase/functions/chat-intelligence-v2/skills/comparison.ts`
  (+3 LOC: import + extract + asignación).
- `supabase/functions/chat-intelligence-v2/skills/modelDivergence.ts`
  (+3 LOC: idem).

## Archivos NO tocados
- `verifiedSourcesAdapter.ts` (correcto).
- `index.ts`, `orchestrator.ts`, FE bibliography renderer.
- `periodEvolution.ts` (excluido por SELECT light, no rompe contrato:
  empty array pasa el filtro del FE igual que hoy).
- Resto de protección no negociable.

## Criterios de aceptación medibles
1. **AC-1**: tras una consulta `comparison` con ≥1 URL marcada por
   ChatGPT/Perplexity en `*_bruto`, el SSE `done.metadata.verifiedSources`
   contiene ≥1 entrada con `sourceModel ∈ {'ChatGPT','Perplexity'}` y
   `url` presente y empieza por `http`.
2. **AC-2**: idem para `modelDivergence`.
3. **AC-3 (no regresión)**: companyAnalysis y sectorRanking siguen
   poblando `verifiedSources` exactamente igual que en P0 (no se cambia
   su pipeline).
4. **AC-4 (FE renderer)**: `generateBibliographyHtml(sources)` recibe
   ahora arrays no vacíos para los 4 skills cubiertos y renderiza la
   bibliografía agrupada por modelo (G/P) en el PDF export.

## Riesgos
- Bajo. `extractCitedSources` es función pura ya en uso. El payload del
  SSE crece linealmente con el número de URLs únicas (~docenas), muy por
  debajo del umbral.