
# Plan: Conectar el Embudo Narrativo (buildDepthPrompt) al Pipeline E5

## Problema Identificado

La funcion `buildDepthPrompt()` (lineas 2646-2810) contiene la estructura detallada completa del Embudo Narrativo con **todas las subsecciones** (Titular-Diagnostico, 3 KPIs, 3 Hallazgos, Vision de las 6 IAs, Las 8 Metricas, Divergencia entre Modelos, etc.) pero **NUNCA se llama desde ninguna parte del codigo**.

El E5 (`buildOrchestratorPrompt`, lineas 2075-2190) solo tiene una version resumida de 7 lineas (lineas 2106-2111) que dice cosas como:
```
- Pilar 1 DEFINIR (cuando haya datos): vision de las 6 IAs...
- Pilar 2 ANALIZAR (cuando haya evolucion): evolucion temporal...
```

Esto explica por que las respuestas carecen de estructura rica: el LLM no recibe la guia detallada del Embudo. No sabe que debe incluir subsecciones como "Titular-Diagnostico", "3 KPIs con Delta", "5 Mensajes para la Direccion", "Divergencia entre Modelos", etc.

## Evidencia en los Logs

- `[E5] Prompt built. System: 7752 chars` — el system prompt es corto porque falta el Embudo (~4.000 chars adicionales)
- `[E4] Comparator: 4 strengths, 4 weaknesses, 4 recommendations` — E4 emite 4 recomendaciones (correcto, el max del prompt dice "Maximo 4 fortalezas, 4 debilidades, 6 recomendaciones" pero el LLM solo genera 4 de cada)
- El pipeline E1->E2->E3->E4->E5 SI se ejecuta correctamente, pero E5 no tiene suficiente guia estructural

## Solucion: 2 Cambios

### Cambio 1: Inyectar `buildDepthPrompt()` en el systemPrompt de E5

En `buildOrchestratorPrompt()` (linea ~2005), despues de construir el `systemPrompt`, concatenar el resultado de `buildDepthPrompt()`:

```text
Antes:
  const systemPrompt = `[IDIOMA OBLIGATORIO: ${languageName}]
  ... (reglas de integridad, tono, estructura resumida, metricas, formato) ...`;

Despues:
  const depthGuide = buildDepthPrompt("complete", languageName, language);
  const systemPrompt = `[IDIOMA OBLIGATORIO: ${languageName}]
  ... (reglas de integridad, tono, metricas, formato) ...
  
  ${depthGuide}`;
```

Esto requiere:
1. Pasar el parametro `language` a `buildOrchestratorPrompt()` (actualmente solo recibe `languageName`)
2. Llamar a `buildDepthPrompt("complete", languageName, language)` dentro de la funcion
3. Concatenar el resultado al `systemPrompt`
4. Eliminar las 7 lineas de estructura resumida (2106-2111) que quedan redundantes

### Cambio 2: Actualizar la firma y la llamada

En la definicion de `buildOrchestratorPrompt` (linea 2005), anadir `language: string = "es"` como parametro.

En la llamada (linea 5407), pasar el `language`:
```text
Antes:
  buildOrchestratorPrompt(classifier, dataPack, facts, analysis, question, languageName, roleName, rolePrompt)

Despues:
  buildOrchestratorPrompt(classifier, dataPack, facts, analysis, question, languageName, language, roleName, rolePrompt)
```

## Impacto Esperado

| Antes | Despues |
|-------|---------|
| System prompt E5: ~7.750 chars | System prompt E5: ~11.500 chars |
| Sin subsecciones detalladas | Con guia completa: Titular-Diagnostico, 3 KPIs, Vision 6 IAs, 8 Metricas, etc. |
| Estructura vaga que el LLM interpreta libremente | Estructura precisa que el LLM sigue con fidelidad |
| Cabeceras en espanol independientemente del idioma | Cabeceras traducidas via i18n (ya implementado en buildDepthPrompt) |

## Archivo modificado

Solo `supabase/functions/chat-intelligence/index.ts`:

1. **`buildOrchestratorPrompt` firma** (linea 2005): anadir parametro `language`
2. **`buildOrchestratorPrompt` cuerpo** (linea ~2075): llamar a `buildDepthPrompt()` y concatenar al systemPrompt
3. **Eliminar estructura resumida redundante** (lineas 2106-2111)
4. **Llamada a buildOrchestratorPrompt** (linea 5407): pasar `language`
