
# Diagnóstico forense — 4 frentes en V2 (sin tocar nada)

## 1) "Cobertura 17% / 1 de 6 semanas esperadas" en una query snapshot

**Origen del bug:** colisión semántica entre dos campos que comparten nombre pero significan cosas distintas.

`supabase/functions/chat-intelligence-v2/parsers/temporalParser.ts`

```text
26:  const EXPECTED_MODELS_PER_SNAPSHOT = 6;
108: async function resolveCurrentWeekWindow(...)
117:    let qModels = supabase.from("rix_runs_v2")
118:      .select("02_model_name")
119:      .eq("07_period_to", closed.sundayISO);
...
141:    snapshots_expected: EXPECTED_MODELS_PER_SNAPSHOT,   // ← OJO: son MODELOS, no semanas
142:    snapshots_available: nModels,                        // ← MODELOS distintos en ese domingo
143:    coverage_ratio: ... nModels / EXPECTED_MODELS_PER_SNAPSHOT
144:    is_partial: nModels < EXPECTED_MODELS_PER_SNAPSHOT,
```

Para "esta semana" el resolver mete en los campos `snapshots_expected/available` el nº de **modelos** del domingo, no el nº de **semanas**. Eso es coherente para el caso "el barrido aún no ha completado los 6 modelos del domingo".

`supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts`

```text
720-741: recomputa effectiveTemporal:
  snapshots_available: realWeeksCount   // ← AHORA reinterpreta como "semanas únicas" (=1 en snapshot)
  snapshots_expected:  parsed.temporal.snapshots_expected  // ← se queda en 6 (eran modelos)
  coverage_ratio: 1/6 = 0.167
  is_partial: true
745-749 / 779: alimenta renderRankingTable + buildCoverageBanner con esos números
130: "${snapshots_available}/${snapshots_expected} snapshots, ~${pct}% del período pedido"
482: "durante las {weeksCount} semanas observadas (de {weeksExpected} esperadas)"
```

Resultado: el "6" que era *modelos esperados en el domingo* se reinterpreta como *semanas esperadas en el período*, y el ratio 1/6 = 17 % se publica en el banner y en el footnote como si faltaran 5 semanas. **No hay query sobre 42 días en ningún sitio**: la única SQL adicional que hace sectorRanking es `fetchRankingRows(sqlFrom, sqlTo, ...)` con `from === to === 2026-05-03`, que es snapshot puro.

**Datos en DB para 2026-05-03 (validados ahora):**

```text
max_period_to=2026-05-03 · rows=1050 · tickers=175 · models=6
```

Cobertura real del snapshot: **6/6 modelos**, 35/35 IBEX-35, completa. El "17 %" es 100 % artefacto del mismatch de unidades.

**Hipótesis confirmada:** no hay segunda query histórica defectuosa. Es **un solo bug semántico** en `sectorRanking.ts:720-741`: pisa `snapshots_available` (cambia unidades de modelos→semanas) sin pisar `snapshots_expected`, y todo el banner de cobertura se construye sobre una división con numerador y denominador en escalas distintas.

**Fix mínimo (a aplicar sólo si das luz verde):** cuando `parsed.temporal.window_reason` empieza por `current_week_*` y `from === to`, preservar las unidades originales del resolver (modelos/modelos) o, mejor, reescribir el banner para snapshots-puntuales como “Snapshot del {fecha} · {nModels}/6 modelos · cobertura completa” sin hablar de semanas. Cambio aislado a sectorRanking.ts (y el mismo patrón en periodEvolution / comparison / modelDivergence — los cuatro `buildCoverageBanner` viven en archivos paralelos).

---

## 2) Latencia 43 s — ¿se están re-llamando los 6 modelos?

**Respuesta corta: NO. Tu hipótesis arquitectural es falsa.**

Inventario de llamadas externas del endpoint (rg literal sobre `chat-intelligence-v2`):

```text
shared/streamOpenAI.ts:95   POST https://api.openai.com/v1/chat/completions   ← UNA sola llamada LLM
shared/streamOpenAI.ts:175  https://generativelanguage.googleapis.com/...     ← solo fallback si OpenAI cae
```

Los 6 modelos (ChatGPT/Perplexity/Gemini/DeepSeek/Grok/Qwen) se **leen** de `rix_runs_v2` — son los outputs ya guardados por el barrido dominical. Cero invocaciones online a Perplexity/Gemini/DeepSeek/Grok/Qwen desde el chat.

**Breakdown del coste real (de los logs y el código):**

- `duration_ms: 47293` (network log `log-chat-query`).
- Llamada única: `streamOpenAIResponse({ model: "o3", reasoning_effort: "medium", maxTokens: 32000 })` en `sectorRanking.ts:829`. Esto es **el 90 %+ del tiempo**: o3 con reasoning medium en una query sectorial es lento por diseño (memo `mem://infrastructure/estrategia-jerarquica-modelos-chat-intelligence` lo justifica para "complex forensic logic").
- Dos SQLs principales antes del LLM:
  - `fetchRankingRows` (RANKING_SELECT, 12 columnas) — ~1050 filas para IBEX‑35 snapshot.
  - `fetchSectorSourceRows` (SOURCE_SELECT con 7 columnas de texto bruto) — mismas 1050 filas pero con todo el `respuesta_bruto_*`. Esto sí es pesado en transferencia (las URLs salen de aquí: 1.925 únicas de 295 medios → corresponde a estas filas).
- Post‑proceso: `aggregateRanking`, `extractCitedSources`, `renderCitedSourcesBlock`, `buildPerCompanyDimensionsBlock`, `assembleReport`, scrub del marker. Todo CPU local, irrelevante en latencia.

**El "0.9 s" anterior no es comparable**: si fue la query con "0 documentos" probablemente fue un guard temprano (out_of_scope, needs_clarification o cache) que cortó antes de invocar o3. No es la misma ruta.

**Conclusión punto 2:** no hay regresión arquitectural. Hay coste alto de o3 en intent `sector_ranking` con datapack completo. Si quieres bajar latencia las palancas reales son:
- bajar `reasoning_effort` a `low` (companyAnalysis ya lo usa, ver `companyAnalysis.ts:383`),
- recortar `SOURCE_SELECT` a top-N empresas en lugar de las 175,
- cambiar `o3` por `gpt-4.1` para snapshots puntuales,
- o cachear el informe semanal por (índice, sunday) para que la 2ª consulta sea instantánea.

Ninguna se toca sin tu OK. Sólo lo reporto.

---

## 3) HTML descargable y toast "Exportar informe a PDF"

**No hay scope creep en el backend.** La generación HTML **no es automática**. Trazo:

```text
src/components/chat/ChatMessages.tsx:407   <Button onClick={() => downloadMessage(message)}>
src/components/chat/ChatMessages.tsx:78    downloadMessage = (message) => { ...generateExportHtml(...) ; triggerBlobDownload(... `repindex_informe_${timestamp}.html`) ; toast({ title: tr.pdfExported }) }
src/components/ui/markdown-message.tsx:46  variante equivalente para mensajes individuales
```

Búsqueda explícita de auto‑disparos (`useEffect` con download / onComplete / onDone) → **0 resultados**. La descarga ocurre única y exclusivamente cuando se hace click en el botón de descarga del mensaje (icono download en la fila de acciones, visible cuando `!message.isStreaming`).

**Lo que sí huele a UX confuso:**
1. El botón está siempre visible al lado de copiar/regenerar; un click accidental dispara descarga inmediata sin diálogo de confirmación.
2. El nombre del archivo es `repindex_informe_…html` y el toast usa la string `tr.pdfExported` ("Exportar informe a PDF"), aunque el contenido es HTML — promete PDF y entrega HTML. Etiqueta engañosa.
3. El botón está al mismo nivel jerárquico que copiar; no comunica "esto va a generar un informe descargable".

**Opciones (no aplicadas):**
- Mover el botón al overflow `⋯` para que sea acción explícita.
- Renombrar a `tr.downloadAsHtml` ("Descargar como HTML") y arreglar el nombre del archivo, o emitir realmente un PDF.
- Añadir confirmación tipo "¿Descargar este informe como HTML?".

---

## 4) "Volatilidad temporal (SD) = 0 pts" con un solo snapshot

`supabase/functions/_shared/periodAggregation.ts`

```text
110: function stddev(xs: number[]): number | null
177-178: subMetrics.push({ ...
         volatility: round1(stddev(weeklyValues)),
```

Con `weeklyValues.length === 1`, `stddev` devuelve `0` (no `null`), y `tableRenderer.ts:114` lo pinta como `0`. Sí, matemáticamente correcto, clínicamente falso.

**Fix mínimo (a aplicar si das luz verde):**
- En `periodAggregation.ts`, cuando `weeks_count <= 1` poner `volatility = null`.
- En `datapack/reportAssembler.ts:43` (`volatility: a.volatility ?? 0`) cambiar a `?? null` y propagarlo.
- En `tableRenderer.ts:114` y en el banner sectorRanking `"Volatilidad temporal (SD)..."`, renderizar `fmt(null) === "n/a"` con sufijo "(requiere ≥2 semanas)".

Cambio aislado, sin tocar lógica de período multi-semana.

---

## Guardrails reconfirmados

- Sin DELETE/UPDATE/INSERT/TRUNCATE/DROP.
- Sin tocar `orchestrator.ts` L2184 (no existe esa línea en la versión actual; el fichero tiene 696 líneas — si te referías a otra ubicación/versión, indícamelo).
- Sin tocar la tabla `documents`.
- W17 paso 2 / Opción C: sigue pausado.
- Modo de ranking AVG vs Gemini: abierto, no contestado, no asumido.

## Qué propondría hacer (sólo si das luz verde, una por una)

1. **Punto 1 — bug crítico de mensajería:** parche aislado en `sectorRanking.ts` (y los otros 3 `buildCoverageBanner`) para no llamar "semanas esperadas" a lo que son "modelos esperados" cuando `from === to`.
2. **Punto 4 — bug menor de UX:** `volatility = null` cuando `weeks_count <= 1` y render `n/a (requiere ≥2 snapshots)`.
3. **Punto 3 — opcional:** mover el botón de descarga al menú overflow y arreglar la etiqueta `pdfExported → downloadAsHtml`. Decisión tuya.
4. **Punto 2 — sin acción:** no hay bug. Si te interesa bajar latencia, propondría benchmark `o3@medium` vs `o3@low` vs `gpt-4.1` para sector_ranking en otra iteración separada.

Espero tu luz verde puntual sobre cada uno antes de cambiar una sola línea.
