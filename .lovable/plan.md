

# Enforcement de longitud minima para informes corporativos

## Problema diagnosticado

El sistema prompt del Embudo Narrativo tiene una via de escape: la linea "Pregunta concreta (un dato, una metrica): respuesta focalizada -- solo lo pedido" (linea 1290). Cuando un usuario pregunta por una empresa pero con redaccion que parece "concreta" (ej. "analiza Telefonica", "como esta Inditex esta semana"), el LLM clasifica la consulta como "pregunta concreta" y produce respuestas de 800-2000 palabras en vez de las 4.500 minimas.

Ademas, no existe ningun mecanismo post-generacion que valide la longitud: la auto-continuacion solo se activa por truncacion (`finish_reason: "length"`) o patrones prohibidos, pero nunca por respuesta demasiado corta.

## Solucion: doble refuerzo (prompt + enforcement post-generacion)

### Cambio 1 -- Reforzar el prompt para eliminar la ambiguedad (lineas 1277-1291)

Reescribir la seccion "Extension y adaptacion" para que la regla sea binaria e inequivoca:

- Si se detecta al menos 1 empresa en la pregunta → SIEMPRE informe completo (4.500-5.400 palabras), sin excepciones. Incluso si la pregunta parece pedir "solo una metrica", el contexto de esa metrica requiere el informe completo.
- "Pregunta concreta → focalizada" se restringe EXCLUSIVAMENTE a preguntas que NO mencionan ninguna empresa (ej. "que es el RIX", "como funciona la metodologia", "cuantas empresas analizais").

Texto propuesto:
```
Escala de profundidad segun tipo de consulta:
- SI LA PREGUNTA MENCIONA UNA EMPRESA (nombre, ticker o sector con empresa implicita):
  SIEMPRE informe completo con Embudo Narrativo — RANGO OBJETIVO: 4.500-5.400 palabras.
  NO existe la opcion "respuesta corta" para consultas sobre empresas.
  Aunque la pregunta parezca pedir solo un dato o metrica, el analisis corporativo
  SIEMPRE requiere el contexto completo del Embudo Narrativo.
- Analisis sectorial: profundidad media — activa bloques relevantes (minimo 2.500 palabras)
- Comparativa entre empresas: estructura enfrentada — tabla vs. tabla (minimo 3.000 palabras)
- Pregunta sin empresa (metodologia, conceptos, datos generales): respuesta focalizada
```

### Cambio 2 -- Reforzar la misma regla en el user prompt (lineas 6136-6160)

En la seccion "INSTRUCCIONES PARA TU RESPUESTA", punto 7 dice: "Para preguntas concretas (un dato, una metrica): respuesta focalizada sin relleno". Modificar para que sea coherente:

```
7. Solo para preguntas SIN EMPRESA (metodologia, conceptos generales): respuesta
   focalizada sin relleno. Si la pregunta menciona cualquier empresa, SIEMPRE
   aplica el informe completo de 4.500-5.400 palabras.
```

### Cambio 3 -- Reforzar en la regla de prioridad del rol (lineas 6101-6105)

Cambiar:
```
2. PRIORIDAD 2 (PROFUNDIDAD): Si es analisis de empresa → minimo 2.500 palabras
```
A:
```
2. PRIORIDAD 2 (PROFUNDIDAD): Si menciona empresa → informe completo 4.500-5.400 palabras (OBLIGATORIO)
```

### Cambio 4 -- Enforcement post-generacion: auto-continuacion por respuesta corta

En la seccion de auto-continuacion (lineas 6338-6366), anadir una condicion adicional: si se detectaron empresas en la pregunta (`detectedCompanies.length > 0`) y la respuesta acumulada tiene menos de ~18.000 caracteres (~4.500 palabras en espanol), forzar auto-continuacion con un prompt especifico que diga "El informe esta incompleto. Faltan secciones del Embudo Narrativo. Continua desde donde lo dejaste."

Logica:
```
const MIN_CORPORATE_CHARS = 18000; // ~4500 palabras en espanol
const isCorporateQuery = detectedCompanies.length > 0;
const isTooShort = isCorporateQuery && accumulatedContent.length < MIN_CORPORATE_CHARS;

while (
  (streamFinishReason === "length" || forbiddenDetected || isTooShort) &&
  segmentsGenerated <= MAX_CONTINUATIONS
) {
  // ... continuacion existente + nuevo prompt para caso "too short"
}
```

El prompt de continuacion para respuestas cortas sera diferente al de truncacion: en lugar de "continua desde donde lo dejaste", dira "Tu respuesta es demasiado breve para un informe corporativo. Debes completar TODAS las secciones del Embudo Narrativo: Resumen Ejecutivo, Pilar 1, Pilar 2, Pilar 3 y Cierre. Continua anadiendo las secciones que faltan."

### Cambio 5 -- Mismo enforcement para modo no-streaming (lineas 6575-6600)

Aplicar la misma logica de longitud minima en el bloque de compliance gate no-streaming.

## Resumen de impacto

- 1 archivo modificado: `supabase/functions/chat-intelligence/index.ts`
- 3 cambios en el prompt (eliminar escape "pregunta concreta" para consultas con empresa)
- 2 cambios en logica de auto-continuacion (streaming + no-streaming)
- Sin cambios en frontend ni en la base de datos
- Requiere redespliegue de la edge function
