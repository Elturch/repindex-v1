# Por qué el informe sigue mal y plan de corrección

## Diagnóstico del informe que has subido

Pregunta: "analiza ibex35 en Gemini" → ventana 2026-02-01→2026-05-03 (14 semanas), 1 modelo (Gemini), 476 observaciones.

Tres defectos visibles, todos en `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts`:

### 1. "Confunde modelos con empresas" — copy de cobertura mal redactado

El primer párrafo dice literalmente:

> *"Gemini solo dispone de datos para 1 de las 14 **modelos esperados** en este alcance."*

Es un period query (14 semanas) pero el aviso usa la palabra "modelos". El bug está en `prompts/rankingMode.ts:103` — el texto entero está mal pluralizado y mezcla unidades:

```ts
`${weeksCount} de las ${weeksExpected} ${isSnapshot ? "modelos esperados" : "semanas solicitadas"}`
```

Con `isSnapshot=false` debería salir "1 de las 14 semanas solicitadas", pero el LLM lo transcribe mal porque la frase está pegada a "perspectiva del resto de IAs" y se contagia. Hay que separar copy snapshot vs período en frases distintas y, en period, dejar claro que **son semanas, no modelos**, y que el filtro reduce los datos del modelo concreto, no de la ventana.

### 2. "Solo da 15" — top-N por defecto está en 15, no en el tamaño real del scope

`sectorRanking.ts:747`:
```ts
const topN = topMatch ? Math.max(3, Math.min(35, parseInt(topMatch[1], 10))) : 15;
```

Si la pregunta no contiene "top N" se aplica un cap mudo de 15. Para "analiza ibex35" el usuario espera **35 empresas** (todo el índice). Para grupos canónicos resueltos vía `scope_tickers` (p. ej. "grupos hospitalarios" con 4) el default debería ser `scope_tickers.length`. La regla correcta:

- Si hay `topMatch` → respeta N (clamp 3..50).
- Si no hay topMatch:
  - `scope_tickers` presente → `topN = scope_tickers.length`.
  - `ibexOnly=true` → `topN = 35`.
  - sector → `topN = 25`.
  - resto → `topN = 15` (mantener default actual).

### 3. "Sufrimos los límites de Supabase" — egreso desproporcionado

Para responder esta pregunta el skill hace **DOS** lecturas pesadas a `rix_runs_v2`:

1. `fetchRankingRows` con `RANKING_SELECT` (16 columnas) — hasta 15×1000 filas.
2. `fetchSectorSourceRows` con `SOURCE_SELECT` que incluye los **7 columnas `*_bruto`** completas (texto largo) — hasta 8×1000 filas. En IBEX-35 × 6 modelos × 14 semanas son ~2.900 filas con payload de cientos de KB cada una. Es la fuente principal de coste y latencia.

Optimizaciones localizadas, sin tocar la lógica de la tabla:

- **Aplicar el mismo `modelFilter` a `fetchSectorSourceRows`** que ya se aplica a `fetchRankingRows`. Si el usuario pidió solo Gemini, sobra leer las otras 6 columnas brutas. Pasar `dbModelFilter` y reducir `SOURCE_SELECT` a la columna bruta de ese modelo (mapping `Gemini→22_res_gemini_bruto`, `ChatGPT→20_res_gpt_bruto`, etc.). Recorte ~85% del payload de fuentes en single-model.
- **Reducir el cap de paginación de `fetchRankingRows`** de 15 páginas a 6 páginas cuando hay `modelFilter` con 1 modelo (con 1 modelo el techo real es 35×14 = 490 filas; 6×1000 deja margen 12×).
- **Cachear el listado de tickers de scope** (resultado de la query a `repindex_root_issuers`) entre las dos llamadas (`fetchRankingRows` + `fetchSectorSourceRows`) que hoy lo recalculan dos veces.
- **Inyectar un `.limit(N)` explícito** en cada `range()` para que PostgREST no escanee páginas vacías cuando la última página viene corta (fix menor de eficiencia).

## Cambios concretos

### A. `prompts/rankingMode.ts` — fix copy single-model
Reescribir `buildSingleModelRankingRules`:
- Separar el aviso en dos variantes (snapshot vs period) con frases enteras independientes, sin ternario interpolado.
- En period: "*Gemini cubrió N de M semanas de la ventana solicitada (Feb 1 → May 3). El resto de IAs no se incluyen en esta vista filtrada.*"
- En snapshot: "*Gemini es 1 de los 6 modelos posibles para el snapshot del DD/MM. Esta vista omite los otros 5.*"
- Añadir regla dura: "PROHIBIDO usar la palabra 'modelos esperados' al hablar de cobertura de un único modelo en una ventana de varias semanas."

### B. `skills/sectorRanking.ts` — top-N adaptativo
Modificar el bloque de `topN` (línea 746-747):
```ts
const topMatch = parsed.raw_question.match(/\btop\s*(\d{1,2})\b/i);
const explicitN = topMatch ? Math.max(3, Math.min(50, parseInt(topMatch[1], 10))) : null;
const topN = explicitN
  ?? (scopeTickers ? scopeTickers.length
    : ibexOnly ? 35
    : sector ? 25
    : 15);
```

### C. `skills/sectorRanking.ts` — egress optimization
1. Añadir parámetro `modelFilter` a `fetchSectorSourceRows` y proyección dinámica:
   ```ts
   const BRUTO_COL_BY_MODEL: Record<string,string> = {
     "Google Gemini": "22_res_gemini_bruto",
     "ChatGPT": "20_res_gpt_bruto",
     "Perplexity": "21_res_perplex_bruto",
     "DeepSeek": "23_res_deepseek_bruto",
     "Claude": "respuesta_bruto_claude",
     "Grok": "respuesta_bruto_grok",
     "Qwen": "respuesta_bruto_qwen",
   };
   ```
   Si `modelFilter.length===1`, `SOURCE_SELECT` solo incluye su columna bruta + las 5 columnas meta (ticker, name, period_from, period_to, batch).
2. Pasar `dbModelFilter` a `fetchSectorSourceRows` desde el `execute()` (línea 899).
3. Cap de paginación dinámico en `fetchRankingRows`: `MAX_PAGES = (modelFilter?.length === 1) ? 6 : 15`.
4. Extraer la resolución de tickers de scope a un helper compartido y reutilizarla entre las dos fetchs.

## Lo que NO se toca

- Lógica de `aggregateRanking`, `renderRankingTable`, `renderSingleModelRankingTable`.
- Parser temporal (la ventana de 14 semanas es correcta — Gemini empezó tarde, eso no es el bug).
- Pipeline multi-IA por defecto (siguen 6 modelos, esta rama solo afecta single-model y el default de top-N).

## Pruebas de aceptación

1. "analiza ibex35 en Gemini" → tabla con **35 empresas**, aviso "*Gemini cubrió 1 de las 14 semanas…*" (sin la palabra "modelos esperados"), egreso reducido (~1 columna bruta en lugar de 7).
2. "analiza ibex35" (sin modelo) → 35 empresas, comportamiento multi-IA actual intacto.
3. "top 10 ibex35 en Perplexity" → respeta N=10, single-model branch, payload single-bruto.
4. "compara Telefónica con Cellnex" → comparison skill intacta (no toca este path).
