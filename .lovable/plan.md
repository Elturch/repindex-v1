

## Auditoría: Por qué el Agente Rix da rankings incorrectos

### Incoherencias detectadas

Hay **3 bugs** en el pipeline de skills que explican las discrepancias entre la landing page y el chat. Ninguno requiere un cambio reciente para manifestarse: basta con que el usuario haga una consulta de ranking con filtro de modelo (algo que antes quizás no se probaba con frecuencia).

---

### Bug 1: El filtro IBEX nunca se aplica en consultas de ranking

**Causa**: En `interpretQueryEdge` (línea 1842-1849), el `if/else if` chain evalúa `hasRanking` **antes** que `hasIbex`. Cuando el usuario dice "ranking IBEX 35 top 5", la palabra "ranking" activa `hasRanking` en línea 1842, y el branch de IBEX (línea 1848) **nunca se ejecuta**.

Resultado: el ranking se ejecuta sobre las **175 empresas del censo completo**, no solo las 35 del IBEX.

**Fix**: Cuando `hasRanking && hasIbex`, asignar `filters.ibex_family_code = "IBEX-35"` dentro del branch de ranking.

### Bug 2: IBEX35 vs IBEX-35 (sin guion)

**Causa**: Línea 1849 asigna `filters.ibex_family_code = "IBEX35"` (sin guion), pero la base de datos usa `"IBEX-35"` (con guion). Incluso si el Bug 1 se corrige, el filtro devuelve 0 empresas porque `.eq("ibex_family_code", "IBEX35")` no coincide con ningún registro.

**Fix**: Cambiar a `"IBEX-35"`.

### Bug 3: No hay filtrado por modelo de IA

**Causa**: `executeSkillGetCompanyRanking` no acepta un parámetro `model_name`. Siempre descarga los 6 modelos y calcula la mediana. Cuando el usuario pide "ranking de Gemini", obtiene la mediana de los 6 modelos, no los scores de Gemini.

La landing page usa `rix_trends` con `.eq("model_name", "Google Gemini")`, así que muestra datos correctos por modelo. El chat ignora completamente el filtro de modelo.

**Fix**: 
- Detectar el modelo mencionado en la consulta (Gemini, ChatGPT, etc.) en `interpretQueryEdge` y guardarlo en `filters.model_name`.
- Añadir parámetro `model_name` a `executeSkillGetCompanyRanking`. Cuando se pasa, filtrar `.eq("02_model_name", model_name)` y usar el score directo (sin mediana).

---

### Por qué se manifiesta ahora

Estos bugs existían antes, pero:
- Los usuarios ahora usan más el filtro por modelo (Gemini, Grok, etc.) en la landing y esperan lo mismo en el chat.
- La semana W13 completó 175 empresas, así que el ranking sin filtro IBEX devuelve un top 5 de todo el censo (donde empresas no-IBEX pueden liderar).

### Cambios concretos

**Archivo**: `supabase/functions/chat-intelligence/index.ts`

1. **Línea 1842-1849**: Refactorizar el branch de ranking para detectar IBEX dentro del mismo:
```ts
} else if (hasRanking) {
    intent = "ranking"; 
    recommended_skills.push("skillGetCompanyRanking", "skillGetCompanyEvolution");
    if (hasIbex) filters.ibex_family_code = "IBEX-35";
    if (filters.sector_category) recommended_skills.push("skillGetSectorComparison");
    confidence = 0.85;
}
```

2. **Línea 1849**: Corregir `"IBEX35"` → `"IBEX-35"` (para el branch `else if (hasIbex)` que queda como fallback).

3. **Detección de modelo** (~línea 1807-1862): Añadir detección de modelo mencionado:
```ts
const MODEL_PATTERNS = /\b(chatgpt|perplexity|gemini|deepseek|grok|qwen)\b/i;
const modelMatch = lower.match(MODEL_PATTERNS);
if (modelMatch) {
    const MODEL_MAP = { chatgpt: "ChatGPT", perplexity: "Perplexity", gemini: "Google Gemini", deepseek: "DeepSeek", grok: "Grok", qwen: "Qwen" };
    filters.model_name = MODEL_MAP[modelMatch[1].toLowerCase()];
}
```

4. **executeSkillGetCompanyRanking** (~línea 110-160): Añadir parámetro `model_name?` y, cuando se pasa, filtrar con `.eq("02_model_name", model_name)` y devolver scores directos en vez de medianas.

5. **Línea 1970-1975**: Propagar `interpret.filters.model_name` al skill call.

6. Redesplegar `chat-intelligence`.

