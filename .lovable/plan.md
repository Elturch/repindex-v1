# Por qué hemos retrocedido y cómo corregirlo

## Razones del paso atrás (diagnóstico honesto)

Durante el puente del 1 de mayo se hicieron muchos cambios encadenados (sticky entity, AuthCallback, ChatContext, dashboard default Gemini, etc.). Ninguno de esos cambios tocó la rama **single-model** del orquestador, pero introdujeron regresiones laterales porque:

1. **Nunca existió una rama "single-model" en `sectorRankingSkill`.** El skill siempre renderiza la tabla con N modelos (`renderRankingTable(ranking, models, …)`) y siempre inyecta `rankingMode + coverageRules` con vocabulario multi-IA ("RIX rango", "Consenso", "Divergencia"). Cuando `parseModels("…en Gemini")` devuelve `["Gemini"]`, `models.length === 1` pero el prompt sigue siendo el mismo → el LLM (o3) inventa rangos y consenso a partir de un solo modelo.

2. **Cobertura parcial silenciada.** Los logs muestran `coverage partial detected | ratio=0.071 | available=1/14`. El orquestador detecta el problema pero el prompt `rankingMode` no recibe esa señal de forma vinculante; el LLM presenta las 15 empresas como universo completo en vez de avisar "solo 1 de 14 semanas con datos para Gemini".

3. **`strongest/weakest` viene del agregado 6-IA, no del modelo filtrado.** Logs `[companyAnalysis] strongest=CEM (86.4) | weakest=SIM (37.1)` — esos valores son la media de los 6 modelos. Para Gemini puro habría que recalcular sobre el subset.

4. **Parser temporal cae a fallback ancho.** "analiza ibex35 en Gemini" no contiene período → `buildAdaptiveDefaultWindow` busca el último `period_to` global (no por modelo Gemini) y abre 13 semanas. Para Gemini (que sólo tiene 1 semana cubierta) eso da `available=1/14` en vez de "última semana cerrada de Gemini".

5. **Anti-mediana mal aplicado.** Las reglas anti-mediana siguen activas con un solo modelo, generando frases como "rango 27→83" que no tienen sentido (un solo punto, no hay rango).

**Causa raíz común:** el filtro `models` se propaga al `datapack` y a la SQL, pero **no al renderer del prompt ni a las reglas de consenso**. Es una fuga de "modo multi-IA" en una consulta single-model.

## Plan de corrección (3 cambios localizados)

### 1. `skills/sectorRanking.ts` — branch single-model
Cuando `parsed.models.length === 1`:
- Saltar `buildRankingRules` multi-IA y usar variante `buildSingleModelRankingRules({ model, scopeLabel, weeksCount })`.
- En `renderRankingTable`, omitir las columnas "RIX rango" y "Consenso"; mostrar solo `#, Empresa, ${model}, Obs.`
- No emitir Sección 4 (divergencia/consenso entre IAs).
- Inyectar disclaimer obligatorio si `coverage_ratio < 0.5`: "Datos disponibles solo para X/Y semanas en {model}".

### 2. `prompts/rankingMode.ts` — variante single-model
Crear `buildSingleModelRankingRules()` que reemplaza:
- "Compara los 6 modelos" → "Análisis exclusivo desde la perspectiva de {model}"
- Elimina secciones de consenso/divergencia
- Elimina lenguaje "anti-mediana" (no aplica con 1 modelo)
- Añade obligación de citar cobertura real ("Gemini cubrió N empresas en la semana X")

### 3. `parsers/temporalParser.ts` — `buildAdaptiveDefaultWindow` model-aware
Cuando se pasa un único modelo, filtrar el probe `rix_runs_v2` por `02_model_name = model` para encontrar la última semana cerrada **de ese modelo**, no la global. Si Gemini solo tiene 1 semana, el default debe ser esa semana, no 13 semanas vacías.

## Detalles técnicos

```text
Punto de fuga actual:
  parseModels("…en Gemini") → ["Gemini"]
       ↓
  sectorRankingSkill.execute({ parsed })
       ↓
  fetchRankingRows(…, no model filter)        ← no filtra por modelo en SQL
       ↓
  renderRankingTable(ranking, ["Gemini"], …)  ← columnas correctas
       ↓
  buildRankingRules({ modelsCount: 1 })       ← prompt sigue diciendo "compara modelos"
       ↓
  o3 sintetiza con vocabulario 6-IA           ← respuesta incoherente
```

Verificar también que `fetchRankingRows` aplica `.in("02_model_name", parsed.models)` cuando `parsed.models.length < 6` (probablemente no lo hace; es la causa de que strongest/weakest venga del agregado 6-IA).

## Lo que NO voy a tocar

- `AuthCallback.tsx`, `ChatContext.tsx`, `Dashboard.tsx`, `stickyEntityOverride.ts` — esos fixes están bien, no son la causa de esta regresión.
- El pipeline multi-IA por defecto sigue intacto; solo añadimos una rama cuando el usuario filtra explícitamente a 1 modelo.

## Pruebas de aceptación

1. "analiza ibex35 en Gemini" → tabla solo con columna Gemini, sin "consenso", disclaimer si cobertura<100%.
2. "analiza ibex35" (sin modelo) → comportamiento actual intacto (6 modelos, anti-mediana, divergencia).
3. "compara TEF en ChatGPT y Perplexity" → 2 modelos, sigue rama multi-IA pero limitada a esos 2.
