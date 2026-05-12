# Plan — Fix bugs detectados en informe IBEX-35 / ChatGPT (5 semanas)

Tres bugs identificados, todos en `supabase/functions/chat-intelligence-v2`. No se toca UI ni base de datos.

---

## B1 — Bibliografía cita empresas fuera del ranking (CRÍTICO)

**Causa**: `fetchSectorSourceRows()` (línea 1109 de `skills/sectorRanking.ts`) trae las respuestas brutas de **todo el alcance** (IBEX-35 = 35 empresas). Cuando el `topN` efectivo es 5, las URLs de las 30 empresas restantes (Vitrinor, AENA, etc.) se cuelan en `extractCitedSources` y llegan al Anexo + al cuerpo.

**Fix** en `skills/sectorRanking.ts` (≈línea 1108-1113):
- Calcular `rankedTickers = ranking.map(r => r.ticker.toUpperCase())` antes de pedir source rows.
- Pasar `rankedTickers` (no `scopeTickers`) a `fetchSectorSourceRows()` cuando el ranking sea estrictamente menor que el alcance solicitado (top-N explícito).
- Añadir log: `cited_sources_scope=ranked|full | tickers=N`.
- Mismo `rankedTickers` se usa ya en `buildPerCompanySourceList` (verificar que filtre).

Resultado esperado: Anexo solo cita URLs de TEF/BBVA/MRL/BKT/CLNX. Total URLs caerá de ~599 a ~80-150.

---

## B2 — Lenguaje multi-modelo en informe single-model

**Causa A** (cuerpo): `renderCitedSourcesBlock()` en `datapack/citedSources.ts` siempre escribe "**N modelos** que los citan" y "Fuentes citadas por **los modelos de IA**" en plural, aunque haya 1 solo modelo.

**Fix A** en `datapack/citedSources.ts`:
- Añadir parámetro opcional `singleModelLabel?: string` a `renderCitedSourcesBlock`.
- Si está presente: cambiar título a `**Fuentes citadas por ${label}**`, suprimir "medidos por nº de modelos que los citan", omitir badges de modelos en cada línea (solo dominio + nº URLs).

**Causa B** (texto fijo en `buildSingleModelRankingRules`): la regla §5 dice "Fuentes citadas por ${model}" pero el bloque sustituido (`citedSourcesFull`) introduce el texto plural. Pasar `singleModelLabel = model` desde `sectorRanking.ts` cuando `isSingleModel === true`.

**Causa C** (LLM): el prompt single-model ya prohíbe mencionar otros modelos pero no veta literales tipo "Ningún dominio coincide entre modelos". Añadir bullet:
- `PROHIBIDO usar las frases "entre modelos", "ningún modelo coincide", "los demás modelos (Gemini, DeepSeek, Grok, Qwen)" o cualquier referencia a IAs ausentes; describe únicamente lo que ${model} cita.`

---

## B3 — Anti-fabricación en sección 4 (Recomendaciones)

**Causa**: `buildSingleModelRankingRules` §4 obliga a "(c) KPI cuantitativo: métrica + valor actual + **target** + **horizonte**" y "(d) verbo + entregable + **plazo**". Esto **fuerza** al LLM a inventar fechas (`Q4-2026`, `AGM-2027`), targets pseudo-precisos (`+7,7 pts`) y entregables ficticios ("5 white papers GSMA"). Lo mismo ocurre en `buildRankingRules` §7.

**Fix** en `prompts/rankingMode.ts` — reescribir las reglas de recomendaciones para alinear con `analytical-lens-and-anti-fabrication-logic`:

§7 (multi-modelo) y §4 (single-model) → nueva redacción:
- (a) ESPECÍFICA para una empresa concreta del ranking (ticker + nombre).
- (b) Diagnóstico cuantificado: métrica + valor actual exacto del DataPack + brecha respecto al techo del grupo (max-min observado).
- (c) Acción concreta vinculada a fuentes del DataPack (medio/dominio real ya citado).
- (d) Prioridad explícita (alta/media/baja) según magnitud de la brecha.
- **PROHIBIDO**: inventar fechas (`Q1-2027`, `FY-2026`, `AGM-2027`), horizontes temporales ("en 6 meses"), targets numéricos pseudo-precisos (`target 45`, `+7,7 pts`), entregables específicos no documentados ("5 white papers", "data-room", "dos consejeros ESG"), nombres de programas o protocolos.
- **PERMITIDO**: lenguaje accionable cualitativo ("reforzar cobertura en Tier 1", "publicar dossier técnico", "abrir diálogo con analistas ESG"), priorización por brecha métrica.

Añadir bullet duro al final de cada bloque:
- `Cualquier número en una recomendación debe existir LITERALMENTE en el DataPack. Si no aparece, usa lenguaje cualitativo.`

---

## B4 — Cosmético

En el LLM ya se pide en single-model `## 5. Fuentes citadas por ${model}`, pero al sustituir el marcador, el bloque inserta "Fuentes citadas por los modelos de IA" como subtítulo en negrita. Resuelto por **B2 Fix A** (parámetro `singleModelLabel`).

---

## Archivos afectados (3)

1. `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts` — filtrar source rows por `rankedTickers`; pasar `singleModelLabel` a `renderCitedSourcesBlock`.
2. `supabase/functions/chat-intelligence-v2/datapack/citedSources.ts` — parámetro opcional `singleModelLabel`; texto adaptativo singular/plural.
3. `supabase/functions/chat-intelligence-v2/prompts/rankingMode.ts` — reescribir §7 (multi) y §4 (single) eliminando obligación de fechas/targets/entregables; añadir veto explícito a "entre modelos" en single-model.

## Validación

Reproducir el mismo informe (IBEX-35 · ChatGPT · 2026-04-10→2026-05-09):
- B1: contar URLs del Anexo, esperar solo dominios que mencionen TEF/BBVA/MRL/BKT/CLNX. `total_urls` ≪ 599.
- B2: buscar "entre modelos", "Gemini", "DeepSeek", "Grok", "Qwen" en cuerpo → 0 ocurrencias. Subtítulo §5 = "Fuentes citadas por ChatGPT".
- B3: buscar `Q\d-20\d\d`, `target \d`, `+\d,\d pts`, "AGM", "FY-" en sección Recomendaciones → 0 ocurrencias.

## Fuera de alcance

- Dashboard / Visor (UI) — no se tocan.
- `recommendations.ts` (bloque determinista, ya cumple anti-mediana) — no se modifica.
- RLS, migraciones, schemas.
- Modos multi-modelo con ≥2 IAs (no afectados por B2).
