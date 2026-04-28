# P0-1 — Emitir `verifiedSources` estructurado en SSE `done`

## Objetivo
El PDF descargado desde `ChatMessages.tsx` debe incluir el bloque
"📚 Anexo: Referencias Citadas por las IAs" con URLs por modelo. Hoy ese
bloque depende de `message.metadata.verifiedSources`, pero
`chat-intelligence-v2/index.ts` nunca emite ese campo en el frame `done`
→ array vacío → `generateBibliographyHtml` retorna `''` → PDF sin
bibliografía.

## Causa raíz (forense)
- Skills (`companyAnalysis.ts`, `sectorRanking.ts`) ya construyen
  `citedSourcesReport: CitedSourcesReport` con `extractCitedSources()`
  pero lo dejan dentro del **markdown** del cuerpo (vía
  `renderCitedSourcesBlock`) — nunca lo exponen al canal de metadatos.
- `index.ts` líneas 278-302 emiten `done.metadata` pero no incluyen
  `verifiedSources`.
- `ChatContext.tsx:1162` y `:1249` ya leen `finalMetadata?.verifiedSources`
  → frontend listo, solo falta el backend.

## Contrato I/O

### Input (sin cambios)
SSE stream existente, skill expone `datapack` con `raw_rows`.

### Output (NUEVO)
En el frame `{type:"done", metadata:{...}}` se añade:
```ts
verifiedSources: VerifiedSource[]
```
donde:
```ts
interface VerifiedSource {
  url: string;
  domain: string;
  title?: string;
  sourceModel: 'ChatGPT' | 'Perplexity';   // STRICT — zero invention
  temporalCategory: 'window' | 'reinforcement' | 'unknown';
  extractedDate?: string;                   // ISO yyyy-mm-dd
}
```

### Reglas de mapeo `CitedSource → VerifiedSource[]`
1. Filtrar `models[]` a sólo `['ChatGPT','Perplexity']` (resto se descarta
   por política Zero-Invention del frontend).
2. Si tras el filtro `models` queda vacío → la URL no produce ninguna
   `VerifiedSource`.
3. Por cada modelo verificable que cita la URL, emitir una entrada
   `VerifiedSource` (la UI agrupa después por URL).
4. `temporalCategory`:
   - `window` si `detectedDate` ∈ `[period_from, period_to]`.
   - `reinforcement` si `detectedDate` existe y queda fuera de la ventana.
   - `unknown` si no hay `detectedDate`.
5. `extractedDate = detectedDate ?? undefined`.
6. `title = title ?? undefined` (no string vacío).

## Implementación

### Archivos NUEVOS
- `supabase/functions/chat-intelligence-v2/datapack/verifiedSourcesAdapter.ts`
  Pure function `toVerifiedSources(report, periodFrom, periodTo)`.

### Archivos MODIFICADOS
- `supabase/functions/chat-intelligence-v2/types.ts`
  - Añadir `cited_sources_report?: CitedSourcesReport` opcional al
    `DataPack` (transporte interno skill→orchestrator→index).
- `supabase/functions/chat-intelligence-v2/skills/companyAnalysis.ts`
  - Adjuntar `cited_sources_report: citedSourcesReport` al `enrichedDatapack`.
- `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts`
  - Idem (ya construye `citedSourcesReport`).
- `supabase/functions/chat-intelligence-v2/index.ts`
  - Importar adapter + tipo, calcular `verifiedSources` desde
    `result.datapack.cited_sources_report` y añadirlo a `done.metadata`.

### Archivos NO TOCADOS
- `getEdgeFunctionName`, `agentVersion.ts`, `App.tsx`,
  `ProtectedRoute.tsx`, `AuthContext.tsx`, `ChatContext.tsx`, routing,
  migración SQL RLS Hunk 3.
- `comparison.ts`, `modelDivergence.ts`, `periodEvolution.ts` — no
  construyen `citedSourcesReport` actualmente; quedan para P1.
- `verifiedSourceExtractor.ts` (frontend) — el contrato que emite el
  backend ya encaja con el shape esperado.

## Criterios de aceptación
| # | Criterio | Verificable mediante |
|---|----------|----------------------|
| 1 | El frame `done` de v2 incluye `metadata.verifiedSources: array` | `curl` directo + `grep verifiedSources` |
| 2 | Para query con datos reales (Mahou), `verifiedSources.length > 0` | `curl` + parse JSON |
| 3 | Cada item tiene `sourceModel ∈ {ChatGPT, Perplexity}` (estricto) | parse JSON |
| 4 | El PDF descargado en preview muestra "Anexo: Referencias Citadas" con URLs | smoke manual del usuario |
| 5 | `comparison`, `modelDivergence`, `periodEvolution` siguen funcionando sin regresión (no añadimos nada, solo tipo opcional) | smoke matrix |
| 6 | Constraints respetadas: ningún archivo > 500 LOC tras los cambios | `wc -l` |

## Smoke
1. `curl -N` a `chat-intelligence-v2` con `{"question":"analiza Mahou"}`
   y `grep -c '"verifiedSources"'` ≥ 1.
2. Inspeccionar el JSON: `verifiedSources[0].sourceModel` debe ser
   ChatGPT o Perplexity.
3. (Manual usuario) Abrir preview, lanzar Mahou, descargar PDF, verificar
   anexo bibliográfico.

## Riesgos
- Bajo. Adapter es pure function, campo nuevo opcional, no rompe nada
  existente.
- El skill `companyAnalysis.ts` queda en 391 LOC + ~2 líneas → 393.
  Sigue bajo el límite de 500.
