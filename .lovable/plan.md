# Bug: el chat se queda "cacheado" en la primera pregunta

## Síntomas reportados (Maria)
1. La 2ª/3ª pregunta de la conversación devuelven el mismo informe que la 1ª.
2. Al abrir una conversación nueva, sigue mostrando el contenido anterior.

## Lo que confirmamos en el HTML adjunto

Las 4 consultas reales fueron:
1. "Analiza Ibex35 consenso entre IAs" → informe IBEX-35 completo (9 secciones).
2. "Analiza ibex35 en gemini" → **idéntico informe IBEX-35 multi-IA** (no filtra Gemini).
3. "por favor dame el ranking RIX de gemini de las ibex35" → informe distinto pero también de consenso.
4. "ranking RIX ibex35 en modelo gemini" → similar a la 3.

Es decir: el agente **ignora el filtro "en Gemini"** y reutiliza el datapack/intent de la consulta inicial. No es caché HTTP — es contaminación de contexto.

## Hipótesis de causa raíz (a verificar)

### A. Sticky follow-up agresivo (frontend, ChatContext.tsx L716-739, L876-910)
"Analiza ibex35 en gemini" tiene 4 palabras → `isFollowupClient` puede no dispararse, pero `previousContextPayload` se envía igual cuando hay `lastQueryContextRef` y la query no marca explícitamente "nueva entidad". El BE lo recibe como follow-up y reutiliza el alcance.

### B. Hidratación BE desde `user_conversations.last_report_context` (index.ts L120-155)
Cuando FE no manda previousContext, el BE lo recupera de la BD. Si la nueva conversación reutiliza un `conversationId` previo (race), inyecta el contexto IBEX-35 anterior y vuelve a generar el mismo informe.

### C. Skill `sector_ranking` no aplica `models` filter
La consulta "en gemini" debería forzar `models = ["Gemini"]`, pero el orchestrator quizá descarta ese filtro cuando ya hay un `previousContext` con los 6 modelos. Hay que revisar `orchestrator.ts` y `parsers/`.

### D. "Nueva conversación cacheada"
`clearConversation` rota `sessionId` y `conversationId=null`, pero el botón "Nueva" del UI puede no estar invocando `clearConversation` — posible confusión con `loadConversation`.

## Plan de trabajo (3 pasos cortos)

### Paso 1 — Auditoría dirigida (lectura, sin tocar nada)
- Revisar `orchestrator.ts` para ver cómo se fusionan `previousContext.models` con los modelos parseados de la nueva pregunta.
- Revisar el parser de modelos del BE (`parsers/`): confirmar que "en gemini" / "en modelo gemini" produce `models = ["Gemini"]` con `mode = inclusive`.
- Revisar logs de la última ejecución (Edge Function logs) de las 4 preguntas para ver `inheritedEntity` / `inheritedSource` y `models_used`.
- Verificar en `ChatMessages` / botón "Nueva" qué handler se ejecuta.

### Paso 2 — Fixes (estimados, ajustables tras auditoría)

**Fix 1 — FE: no enviar `previousContext` cuando la nueva pregunta tiene una entidad/sector explícito completo** (no solo "compara con X")  
En `ChatContext.tsx` ampliar `detectsExplicitNewEntity` para detectar también:
- consultas que incluyen el mismo sector/entidad anterior pero **añaden un filtro de modelo nuevo** ("en gemini", "solo chatgpt", "en deepseek")
- consultas que empiezan por verbo de acción completo ("analiza", "dame", "ranking", "compara") con sujeto explícito → tratar como nueva consulta, no follow-up.

**Fix 2 — BE: el filtro `models` de la pregunta nueva siempre gana sobre `previousContext.models`**  
En `orchestrator.ts` (merge de contexto): si `parsed.models.length > 0` Y `parsed.models ⊊ previousContext.models`, descartar `previousContext.models` y respetar el subset pedido. Loguear el override.

**Fix 3 — BE: la hidratación desde `last_report_context` solo se aplica si la nueva pregunta es claramente follow-up** (`isFollowup === true` o pregunta < 6 palabras sin sujeto). Hoy se aplica siempre que falte previousContext, lo que causa contaminación cuando el FE deliberadamente no lo manda.

**Fix 4 — UI: botón "Nueva conversación" debe llamar siempre a `clearConversation`** (verificar; si ya lo hace, descartar este fix). Añadir `console.log` de auditoría: sessionId antes/después.

### Paso 3 — Test manual + log
Reproducir el escenario:
1. "Analiza IBEX-35 consenso entre IAs" → informe multi-IA OK
2. "Analiza IBEX-35 en gemini" → **debe** devolver informe filtrado solo Gemini (no los 6)
3. Click "Nueva conversación" → estado completamente limpio
4. "Ranking sector banca en deepseek" → solo DeepSeek

Sin migraciones de BD. Sin cambios de UI más allá del botón.

## Entregables
- Cambios en `src/contexts/ChatContext.tsx` (Fix 1, Fix 4 si aplica)
- Cambios en `supabase/functions/chat-intelligence-v2/index.ts` (Fix 3)
- Cambios en `supabase/functions/chat-intelligence-v2/orchestrator.ts` (Fix 2)
- Notas en `specs/` documentando la regla "models de la pregunta nueva ganan"

## Tiempo estimado
1 iteración. El usuario valida con la misma batería de 4 preguntas del informe adjunto.

## Lo que NO hago en este plan
- No toco la auditoría de calidad (que ya quedó en `/admin → Quality Audit`).
- No refactorizo el orchestrator entero — solo el merge de contexto.
- No cambio prompts ni skills de informe.
