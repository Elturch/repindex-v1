

# Plan: Internacionalizar Todos los Textos del Agente Rix

## El Problema

El pipeline `chat-intelligence` recibe `language` y `languageName` del frontend, pero solo E5 (Orquestador) los usa parcialmente. Hay al menos **10 zonas con texto hardcoded en espanol** que se envian tal cual al usuario sin importar el idioma seleccionado:

### Zonas afectadas (todas en `supabase/functions/chat-intelligence/index.ts`)

| Zona | Lineas aprox. | Que esta en espanol |
|------|---------------|---------------------|
| 1. `getRedirectResponse()` | 3376-3431 | Respuestas completas de identity, personal, off_topic, test_limits (4 bloques) |
| 2. Bulletin prompt ("Perfecto! Puedo generar...") | 3230-3233 | Texto de bienvenida al modo boletin |
| 3. Bulletin suggested questions | 3233 | "Genera un boletin de X" |
| 4. Company not found error | 4039-4049 | "No encontre la empresa..." + suggested questions |
| 5. Bulletin post-generation suggestions | 4574-4578 | "Genera un boletin de...", "Como se compara..." |
| 6. Pericial follow-up questions | 3670-3673 | 3 preguntas sugeridas en espanol |
| 7. `buildDepthPrompt()` (Embudo Narrativo) | 2278-2433 | Toda la estructura: "RESUMEN EJECUTIVO", "PILAR 1 DEFINIR", "PILAR 2 ANALIZAR", "PILAR 3 PROSPECTAR", instrucciones |
| 8. Drumroll prompt | 2636-2694 | Instrucciones del generador de drumroll ("TU MISION", "REGLAS CRITICAS") y system message |
| 9. E3 (Lector) system message | 1429 | "Extractor de hechos cualitativos..." |
| 10. E4 (Comparador) prompts | 1571-1606, 1611 | "Cruza datos cuantitativos...", "Comparador analitico..." y etiquetas de seccion |

## La Solucion

Crear un diccionario de traducciones centralizado dentro del edge function y usar `languageName`/`language` en TODAS las zonas afectadas.

### Cambio 1: Crear diccionario de traducciones del pipeline

Al inicio del archivo (tras las interfaces), crear un objeto `PIPELINE_I18N` con traducciones para los 10 idiomas soportados. Para mantener el archivo manejable, solo se incluyen los 4 idiomas principales (es, en, fr, pt) con fallback a ingles para el resto:

```text
const PIPELINE_I18N: Record<string, Record<string, string>> = {
  es: {
    agent_identity_answer: "Soy el **Agente Rix**, un analista especializado en reputacion...",
    personal_query_answer: "Mi especialidad es el analisis de reputacion **corporativa**...",
    off_topic_answer: "Esa pregunta esta fuera de mi especializacion...",
    test_limits_answer: "Soy el Agente Rix, un analista de reputacion corporativa...",
    bulletin_welcome: "Perfecto! Puedo generar un **boletin ejecutivo** completo...",
    bulletin_suggest: "Genera un boletin de {company}",
    company_not_found: "No encontre la empresa \"{query}\" en la base de datos...",
    analyze_company: "Analiza la reputacion de {company}",
    // ... ~30 keys mas
  },
  en: {
    agent_identity_answer: "I'm **Agent Rix**, an analyst specialized in corporate algorithmic reputation...",
    // ... todas las traducciones
  },
  pt: { ... },
  fr: { ... },
}
```

Funcion helper: `function t(lang: string, key: string, vars?: Record<string, string>): string` que busca en el diccionario y aplica interpolacion de variables ({company}, {query}, etc).

### Cambio 2: Internacionalizar `getRedirectResponse()`

Reemplazar los 4 bloques hardcoded con llamadas a `t(language, "agent_identity_answer")`, etc. Las suggested questions tambien se traducen: "Analyze {company}'s reputation" en vez de "Analiza la reputacion de {company}".

### Cambio 3: Internacionalizar el mensaje de bienvenida al boletin

Linea 3232: reemplazar el texto fijo con `t(language, "bulletin_welcome")`.
Linea 3233: `suggestedCompanies.map(c => t(language, "bulletin_suggest", {company: c}))`.

### Cambio 4: Internacionalizar el error "empresa no encontrada"

Lineas 4039-4049: usar `t(language, "company_not_found", {query: companyQuery})` y traducir las suggested questions.

### Cambio 5: Internacionalizar sugerencias post-boletin

Lineas 4574-4578: traducir las 3 suggested questions.

### Cambio 6: Internacionalizar preguntas pericial

Lineas 3670-3673: traducir las 3 preguntas de seguimiento pericial.

### Cambio 7: Internacionalizar `buildDepthPrompt()` (Embudo Narrativo)

Esta es la zona mas grande. Las etiquetas de estructura ("RESUMEN EJECUTIVO", "PILAR 1 DEFINIR", etc.) se traducen pero las INSTRUCCIONES internas para el LLM se mantienen en espanol — el LLM entiende ambos idiomas y la instruccion `[IDIOMA OBLIGATORIO]` de E5 ya fuerza el output. Lo que si se traduce:

- Los nombres de las secciones que el LLM replica en el output: "Resumen Ejecutivo" -> "Executive Summary", "Pilar 1 -- DEFINIR" -> "Pillar 1 -- DEFINE"
- Los ejemplos de output que el LLM imita
- Las etiquetas de subsecciones: "Titular-Diagnostico", "3 KPIs con Delta", etc.

Esto se logra pasando `languageName` (que ya recibe la funcion) al diccionario para seleccionar las etiquetas correctas.

### Cambio 8: Internacionalizar el drumroll

Lineas 2636-2694: Las instrucciones internas al LLM pueden quedarse en espanol (el LLM las entiende), pero la linea `IDIOMA: Genera TODO en ${languageName}` ya existe. El system message (linea 2693) se traduce para reforzar.

### Cambio 9: E3 y E4 — system messages

Los system messages de E3 y E4 son instrucciones internas al LLM (no llegan al usuario). Su output es JSON estructurado que luego procesa E5. **No necesitan traduccion** porque el usuario nunca ve esos textos. Solo se refuerza la instruccion de idioma donde el output pueda filtrarse al usuario (como en `diagnostico_resumen` de E4).

### Cambio 10: Pasar `language` a todas las funciones que lo necesitan

Actualmente `getRedirectResponse` recibe `languageName` pero no `language`. Anadir `language` como parametro a:
- `getRedirectResponse(category, question, language, languageName, companiesCache)`
- Pasar `language` al handler de bulletins
- Pasar `language` al handler de pericial

## Estructura del diccionario

El diccionario tendra ~40 claves organizadas en grupos:

```text
// Redirect responses (4 categories x 4 idiomas)
// Bulletin messages (welcome, suggest, not_found)
// Suggested questions templates (10 templates)
// Embudo section names (8 secciones)
// Embudo subsection names (15 subsecciones)
// Error messages (3 tipos)
// Pericial follow-ups (3 preguntas)
```

Total: ~40 claves x 4 idiomas = ~160 strings. Para los 6 idiomas restantes (de, it, ar, zh, ja, ko) se usa fallback a ingles.

## Archivo modificado

Solo `supabase/functions/chat-intelligence/index.ts`:

1. **Nuevo bloque**: `PIPELINE_I18N` diccionario + funcion `t()` (~200 lineas, tras las interfaces)
2. **`getRedirectResponse()`**: Reescribir con llamadas a `t()` (~30 lineas cambiadas)
3. **Bulletin welcome** (linea 3232): 1 linea
4. **Bulletin suggestions** (linea 3233): 1 linea
5. **Company not found** (lineas 4039-4049): ~10 lineas
6. **Post-bulletin suggestions** (lineas 4574-4578): 3 lineas
7. **Pericial follow-ups** (lineas 3670-3673): 3 lineas
8. **`buildDepthPrompt()`**: Internacionalizar etiquetas de seccion (~40 lineas)
9. **Firmas de funciones**: Anadir parametro `language` donde falte (~5 lineas)

## Resultado esperado

| Antes (usuario en ingles) | Despues |
|---------------------------|---------|
| "Soy el Agente Rix, un analista especializado..." | "I'm Agent Rix, an analyst specialized in corporate algorithmic reputation..." |
| "Genera un boletin de Telefonica" (suggested) | "Generate a report for Telefonica" |
| "No encontre la empresa..." | "Company not found in the RepIndex database..." |
| "## Resumen Ejecutivo" en el informe | "## Executive Summary" |
| "## Pilar 1 -- DEFINIR" | "## Pillar 1 -- DEFINE" |
| "Que empresas estan disponibles?" (suggested) | "Which companies are available?" |

## Principios

- El diccionario es estatico (no usa LLM para traducir) — rendimiento garantizado
- Fallback a ingles para idiomas sin traduccion especifica
- Las instrucciones internas al LLM (system prompts de E3, E4) NO se traducen — son instrucciones de procesamiento, no output al usuario
- E5 ya tiene `[IDIOMA OBLIGATORIO: ${languageName}]` que fuerza el output del informe
