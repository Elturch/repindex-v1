# P1-C — Eliminar marker residual `<!--CITEDSOURCESHERE-->` del HTML final

## Objetivo
Garantizar que NINGUNA respuesta emitida por la edge function contenga el
marcador `<!--CITEDSOURCESHERE-->` (ni cualquier variante decorada por el
LLM) en su payload final. Defensa en profundidad: incluso si el skill no
lo sustituyó, el orquestador lo elimina antes de devolver al SSE.

## Contrato I/O (sin cambios externos)
- INPUT: `OrchestratorResponse` ya producido por la skill.
- OUTPUT: identico, con la garantía añadida de que `result.content` y
  `result.datapack.pre_rendered_tables[0]` no contienen el marker en
  ninguna de sus variantes.

## Diseño
1. Centralizar la regex tolerante (ya replicada 3 veces) en
   `guards/outputGuard.ts` exportando `MARKER_RE_TOLERANT` y
   `scrubCitedSourcesMarker(text)`.
2. En `orchestrator.ts`, tras el resultado de la skill y antes de
   devolver `OrchestratorResponse`, aplicar `scrubCitedSourcesMarker`
   sobre `content` y `pre_rendered_tables[0]`. Idempotente: si la skill
   ya hizo el scrub, no-op.
3. Logging: si el scrub eliminó algo, loguear
   `[outputGuard] marker_scrubbed_post_skill skill=<name>` para tracking.

## Archivos tocados
- `supabase/functions/chat-intelligence-v2/guards/outputGuard.ts`
  (+10 LOC: export de regex + helper).
- `supabase/functions/chat-intelligence-v2/orchestrator.ts`
  (+8 LOC: scrub post-skill).

## Archivos NO tocados
- Skills (la lógica del marker sigue donde está, sólo añadimos red de
  seguridad cross-cutting).
- index.ts, parsers, datapack, FE.

## Criterios de aceptación medibles
1. **AC-1**: para cualquier `finalContent` que contenga
   `<!--CITEDSOURCESHERE-->` (literal o decorado), el output del
   orquestador no contiene la cadena tras el scrub (`indexOf` literal y
   `MARKER_RE.test()` ambos negativos).
2. **AC-2 (idempotencia)**: ejecutar el scrub dos veces no cambia nada
   tras la primera pasada.
3. **AC-3 (no falsos positivos)**: la palabra "CITED" o "SOURCES" en
   texto narrativo NO se elimina (el matcher exige el wrapper de
   comentario HTML `<!-- ... -->`).

## Riesgos
- Bajo. Helper puro, no toca SQL ni LLM.