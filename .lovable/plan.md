

## Diagnóstico definitivo: por qué "de Gemini" no se aplica

### Lo que ocurrió la semana pasada

Cuando hiciste "dame el top 5 y el bottom del ibex 35 según chatgpt", el sistema probablemente funcionó por una de estas dos razones:
1. El `normalize-query` falló o hizo timeout (3 segundos de límite) → graceful degradation → la consulta original (con "chatgpt") pasó intacta al backend → la función F2 (SQL Expert con GPT) generó un SQL con `WHERE "02_model_name" = 'ChatGPT'`.
2. O bien la landing page (selector de modelo) fue la fuente del dato para la noticia, no el chat.

### Lo que pasa ahora

```text
"Dame el ranking IBEX 35 top 5 de Gemini"
         ↓
  normalize-query (GPT-4o-mini)   ← FUNCIONA esta vez (no timeout)
         ↓
  "Top 5 del IBEX 35"            ← "de Gemini" ELIMINADO
         ↓
  body.question = "Top 5 del IBEX 35"
  body.originalQuestion = "Dame el ranking IBEX 35 top 5 de Gemini"
         ↓
  handleStandardChat(question="Top 5 del IBEX 35", ..., originalUserQuestion="...de Gemini")
         ↓
  buildDataPackFromSkills(question)  ← recibe la normalizada SIN "Gemini"
         ↓
  interpretQueryEdge → detecta ranking + IBEX ✓, modelo → NO MATCH ✗
         ↓
  executeSkillGetCompanyRanking({ibex: "IBEX-35", model_name: undefined})
         ↓
  Ranking con mediana de 6 modelos (NO Gemini)
```

El `originalUserQuestion` existe en `handleStandardChat` (línea 8803) pero **nunca se pasa** a `buildDataPackFromSkills` (línea 8820).

### Evidencia del informe

El informe exportado confirma el bug:
- Consulta: "Dame el ranking IBEX 35 top 5 de Gemini"
- Pero dice: "6 modelos: ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen"
- Y: "mediana consolidada de los seis modelos"
- Los scores (72, 67, 67, 67, 67) son medianas, no scores de Gemini

### Corrección (2 cambios mínimos)

**1. Pasar `originalUserQuestion` a `buildDataPackFromSkills`**

Archivo: `supabase/functions/chat-intelligence/index.ts`

- Línea 1896: añadir parámetro `originalQuestion?: string` a la firma
- Línea 1909: después de `interpretQueryEdge(enrichedQuestion)`, re-ejecutar detección de modelo contra `originalQuestion` si existe:
```ts
if (originalQuestion && !interpret.filters.model_name) {
  const origLower = originalQuestion.toLowerCase();
  const origModelMatch = origLower.match(MODEL_NAME_PATTERNS);
  if (origModelMatch) {
    const key = origModelMatch[1].toLowerCase().replace(/\s+/g, " ");
    interpret.filters.model_name = MODEL_MAP[key] || MODEL_MAP[key.replace(/\s/g, "")] || origModelMatch[1];
  }
}
```
- Línea 8820: pasar `originalUserQuestion` como 5o argumento

**2. Preservar modelos de IA en `normalize-query`**

Archivo: `supabase/functions/normalize-query/index.ts`

Añadir regla al `SYSTEM_PROMPT` (después de la regla 8):
```
9. Si el usuario menciona un modelo de IA (ChatGPT, Gemini, Perplexity, DeepSeek, Grok, Qwen),
   PRESERVA esa mención en la consulta normalizada añadiendo "según [modelo]".
   Ejemplo: "ranking IBEX 35 de Gemini" → "Top 5 del IBEX 35 según Gemini"
```

Esto es redundante con el fix 1 (belt & suspenders), pero evita depender solo del fallback al `originalQuestion`.

**3. Redesplegar ambas edge functions**

### Por qué esto NO rompe nada

- Solo añade un parámetro opcional a una función interna
- El `normalize-query` sigue siendo best-effort; el fix principal es el passthrough
- El ranking sin modelo sigue funcionando igual (mediana de 6 modelos)

