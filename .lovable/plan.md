
# Fallos Detectados Antes de Probar

He auditado todo el codigo y encontrado **6 fallos concretos** que afectan la experiencia multiidioma y funcionalidad:

---

## Fallo 1: Pericial hardcodea `t("es", ...)` — ignora el idioma del usuario

**Archivo:** `supabase/functions/chat-intelligence/index.ts` (linea 4025-4029)

Las preguntas sugeridas del dictamen pericial SIEMPRE salen en espanol porque `handlePericialEnrichRequest` no recibe el parametro `language` y usa `t("es", ...)` con un comentario que dice "language not available here".

**Solucion:** Anadir `language: string = "es"` a la firma de `handlePericialEnrichRequest` y `handleEnrichRequest`, pasarlo desde la llamada (linea 3496/4067), y usar `t(language, ...)` en vez de `t("es", ...)`.

---

## Fallo 2: Bulletin post-suggestions hardcodean `t("es", ...)`

**Archivo:** `supabase/functions/chat-intelligence/index.ts` (lineas 5107-5111)

Mismo patron: `handleBulletinRequest` no recibe `language` y las sugerencias post-boletin siempre salen en espanol. El comentario dice "language not available in bulletin handler".

**Solucion:** Anadir `language: string = "es"` a la firma de `handleBulletinRequest`, pasarlo desde la llamada (linea 3622), y usar `t(language, ...)`.

---

## Fallo 3: "Preguntas sugeridas:" hardcoded en espanol en el frontend

**Archivo:** `src/components/chat/ChatMessages.tsx` (linea 265)

El label "Preguntas sugeridas:" esta hardcoded en espanol. Deberia usar `tr.suggestedQuestionsLabel` o similar del sistema de traducciones.

**Solucion:** Anadir clave `suggestedQuestionsLabel` a `chatTranslations.ts` para los 10 idiomas, y usar `{tr.suggestedQuestionsLabel}` en el JSX.

---

## Fallo 4: "Descargar informe" hardcoded en espanol en ChatMessages

**Archivo:** `src/components/chat/ChatMessages.tsx` (linea 355)

El boton de descarga en ChatMessages dice "Descargar informe" hardcoded, aunque en `markdown-message.tsx` SI usa `{tr.downloadReport}`. Este es el boton de la burbuja del chat (distinto del de markdown-message).

**Solucion:** Usar `{tr.downloadReport}` en vez del string fijo. El componente ya recibe `languageCode` y tiene acceso a `tr`.

---

## Fallo 5: `generateRoleSpecificQuestions` genera preguntas en espanol

**Archivo:** `supabase/functions/chat-intelligence/index.ts` (lineas 4252-4340)

Esta funcion usa un prompt LLM en espanol ("Genera 3 preguntas de seguimiento para un...") y los `roleQuestionHints` estan en espanol ("impacto en negocio", "decisiones estrategicas"...). Los fallback questions (lineas 4311-4340) tambien estan hardcoded en espanol.

**Solucion:** Pasar `language`/`languageName` a esta funcion, inyectar `[IDIOMA: ${languageName}]` al inicio del system prompt, y traducir los fallback questions con claves i18n o al menos pedir al LLM que genere en el idioma correcto.

---

## Fallo 6: El enrich handler tiene headers del Embudo en espanol

**Archivo:** `supabase/functions/chat-intelligence/index.ts` (lineas 4120-4170)

El system prompt de `handleEnrichRequest` tiene la estructura del Embudo Narrativo con cabeceras hardcoded en espanol: "RESUMEN EJECUTIVO", "PILAR 1 -- DEFINIR", etc. A diferencia de E5 (que ya usa `buildDepthPrompt` con i18n), el enrich handler no llama a `buildDepthPrompt` y tiene su propia copia de la estructura.

**Solucion:** Reemplazar la estructura hardcoded con una llamada a `buildDepthPrompt("complete", languageName, language)` (igual que E5), o como minimo usar las claves `t(language, "depth_...")` para las cabeceras.

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `chat-intelligence/index.ts` | Pasar `language` a `handlePericialEnrichRequest`, `handleEnrichRequest`, `handleBulletinRequest`, `generateRoleSpecificQuestions` |
| `chat-intelligence/index.ts` | Usar `t(language, ...)` en vez de `t("es", ...)` en pericial y bulletin |
| `chat-intelligence/index.ts` | Inyectar idioma en `generateRoleSpecificQuestions` prompt |
| `chat-intelligence/index.ts` | Usar `buildDepthPrompt` o claves i18n en enrich handler |
| `src/components/chat/ChatMessages.tsx` | Usar `tr.suggestedQuestionsLabel` y `tr.downloadReport` |
| `src/lib/chatTranslations.ts` | Anadir clave `suggestedQuestionsLabel` en los 10 idiomas |

Todos los cambios son compatibles hacia atras (default `"es"` para language).
