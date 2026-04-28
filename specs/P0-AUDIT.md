# P0 — Audit SDD

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| P0-1.1 | `done` incluye `metadata.verifiedSources: array` | 🟢 verde | code path: `index.ts` líneas ~298-306 invocan `toVerifiedSources(...)` y lo añaden al frame done |
| P0-1.2 | Mahou produce `verifiedSources.length > 0` | 🟡 ámbar | curl smoke confirmó stream + bloque de fuentes con URLs reales y badges por modelo en línea 5560 (>400KB de bibliografía); frame done no capturado por límite del tool — pendiente verificación manual en preview |
| P0-1.3 | `sourceModel ∈ {ChatGPT, Perplexity}` estricto | 🟢 verde | adapter filtra por `VERIFIED_MODELS` set |
| P0-1.4 | PDF muestra "Anexo: Referencias Citadas" | ⏳ pendiente | requiere smoke manual del usuario |
| P0-1.5 | `comparison/modelDivergence/periodEvolution` sin regresión | 🟢 verde | campo opcional, retorna `[]` si el skill no aporta report |
| P0-1.6 | Constraints: ningún archivo NUEVO > 500 LOC | 🟢 verde | adapter 59, outputGuard 105 |
| P0-2.1 | Botón Download oculto durante stream | 🟢 verde | `!message.isStreaming` en línea 364 + 295 |
| P0-2.2 | `downloadMessage(streamingMsg)` aborta con toast | 🟢 verde | guard nuevo en líneas 65-74 |
| P0-2.3 | `ChatContext.tsx` no tocado | 🟢 verde | git diff vacío en ese archivo |
| P0-3.1 | `validateSkillOutput` exportada pure | 🟢 verde | `outputGuard.ts` |
| P0-3.2 | orchestrator loguea issues | 🟢 verde | hook tras línea 609 |
| P0-3.3 | Detección EMPTY_OUTPUT, MARKER_LEAK, MISSING_SECTION_7 | 🟢 verde | regex + minLength en outputGuard |
| P0-3.4 | Sin regresión funcional | 🟢 verde | observabilidad pura, no muta contenido |

## Veredicto global
- 11 verdes, 1 ámbar (smoke automatizado parcial), 1 pendiente (smoke manual de PDF).
- **Listo para smoke manual** del usuario. NO Publish hasta validación del PDF.

## Constraints preexistentes (NO regresión, deuda heredada)
- `index.ts` 352 LOC (límite 150) — preexistente, candidato a P1.
- `orchestrator.ts` 680 LOC (límite 300) — preexistente.
- `sectorRanking.ts` 664 LOC (límite 500) — preexistente.
