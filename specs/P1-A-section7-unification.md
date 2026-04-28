# P1-A — Sec.7 Recomendaciones priorizadas unificada cross-skill

## Objetivo
Garantizar que TODO informe emitido por la edge function `chat-intelligence-v2`
contenga una sección **`## 7. Recomendaciones priorizadas`** con formato
canónico (KPI actual → target + plazo + acciones), independientemente de la
skill activa (companyAnalysis, sectorRanking, comparison, modelDivergence,
periodEvolution).

Hoy sólo `companyAnalysis` y `sectorRanking` la incluyen — y sólo
`companyAnalysis` aplica safety net si el LLM la omite. Los demás skills
definen estructuras de 5–6 secciones SIN Sec.7. P1-A cierra ese gap.

## Contrato I/O (sin cambios externos)
No cambian ni el body request ni el SSE payload. Sólo se enriquece el
`finalContent` (texto streamed + `pre_rendered_tables[0]`) que cada skill
devuelve al orchestrator.

- INPUT: `SkillInput` ya existente.
- OUTPUT: `SkillOutput` ya existente. El campo
  `datapack.pre_rendered_tables[0]` (string markdown) DEBE contener
  `## 7. Recomendaciones priorizadas` cuando exista al menos una métrica
  agregable a partir de `raw_rows`. Si no hay métricas (skill sin datos
  numéricos: 0 obs), la sección no se inyecta y el output se considera
  válido sin Sec.7 (empty fallback path).

## Diseño
1. Centralizar el safety net en `datapack/reportAssembler.ts` exportando
   una función pura `ensureSection7(finalContent, metrics, opts)` que:
   - Detecta presencia de Sec.7 con la regex canónica ya en uso
     (`/(^|\n)\s*##\s*7\.|Recomendaciones\s+priorizadas/i`).
   - Si NO está: produce `renderRecommendationsBlock(metrics)` y lo
     concatena con título `\n\n## 7. Recomendaciones priorizadas\n\n` +
     bloque. Devuelve `{ content, appended: boolean, tail: string }`.
   - Si SÍ está: no-op, devuelve `{ content, appended: false, tail: "" }`.
   - Si `metrics` está vacío: no-op silencioso.

2. Cada skill, tras `streamOpenAIResponse`, llama a `ensureSection7` con
   las métricas que ya tiene (companyAnalysis: `datapack.metrics`;
   resto: `metricsFromRows(raw_rows)` ya disponible vía
   `reportAssembler.metricsFromRows`). Si la función append, hace
   `onChunk?.(tail)` para conservar streaming (paridad con
   companyAnalysis).

3. Skills tocados: `comparison.ts`, `modelDivergence.ts`,
   `periodEvolution.ts`, `sectorRanking.ts`. `companyAnalysis.ts`
   sustituye su safety net inline por la llamada a `ensureSection7`
   (refactor neutro para evitar drift).

## Archivos tocados
- `supabase/functions/chat-intelligence-v2/datapack/reportAssembler.ts`
  (+helper `ensureSection7`, ~30 LOC; total final ~195 LOC, dentro del
  límite 200).
- `supabase/functions/chat-intelligence-v2/skills/companyAnalysis.ts`
  (sustituir bloque inline por helper, ‑10/+5 LOC).
- `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts`
  (+5 LOC tras streaming).
- `supabase/functions/chat-intelligence-v2/skills/comparison.ts`
  (+5 LOC tras streaming).
- `supabase/functions/chat-intelligence-v2/skills/modelDivergence.ts`
  (+5 LOC tras streaming).
- `supabase/functions/chat-intelligence-v2/skills/periodEvolution.ts`
  (+5 LOC tras streaming).

## Archivos NO tocados
- `index.ts`, `orchestrator.ts`, parsers, prompts, guards, builder,
  citedSources, verifiedSourcesAdapter.
- Frontend (`src/**`).
- `agentVersion.ts`, `App.tsx`, `ProtectedRoute.tsx`, `AuthContext.tsx`,
  routing, RLS.

## Criterios de aceptación medibles
1. **AC-1 (cross-skill)**: para una respuesta no vacía de cualquier skill
   con `raw_rows.length > 0`, el output final contiene exactamente una
   ocurrencia de la cadena literal `"## 7. Recomendaciones priorizadas"`
   (idempotente: si el LLM ya la incluyó, no se duplica).
2. **AC-2 (formato KPI → target)**: cuando se hace append, el bloque
   incluye al menos una línea `Valor actual: <num> → Target: <num>`,
   exactamente la salida de `renderRecommendationsBlock`.
3. **AC-3 (idempotencia)**: ejecutar `ensureSection7` dos veces sobre el
   mismo input no añade dos secciones (la segunda llamada detecta la 7
   ya presente).
4. **AC-4 (streaming)**: cuando se hace append, `onChunk` recibe el
   `tail` para que el cliente SSE vea la sección sin esperar al final.
5. **AC-5 (no regresión)**: outputGuard sigue marcando
   `MISSING_SECTION_7` sólo cuando `metrics` está vacío y la skill
   tampoco la generó (caso "0 obs").

## Riesgos
- Bajo. Helper puro sin SQL. Refactor de companyAnalysis preservando
  semántica idéntica a la rama actual.