
# Análisis Comparativo: Instrucciones Actuales vs. Propuesta Nueva

## Veredicto: Mejora clara. Sin deterioro. Con un matiz importante a decidir.

El nuevo relato no rompe nada de lo actual. Refina el tono, corrige un exceso de rigidez estructural y hace las respuestas más accesibles. A continuación el análisis línea a línea.

---

## Lo que el sistema actual hace bien (y la propuesta respeta)

- Embudo Narrativo en 5 bloques (Resumen → Pilar 1 → Pilar 2 → Pilar 3 → Cierre): idéntico en ambos.
- Formato de 6 campos para recomendaciones del Pilar 3: idéntico.
- Principio de consenso: ya está en el sistema actual (bloques "Hecho Consolidado / Señal Fuerte / Indicación / Dato Aislado").
- Prohibición de inventar datos, directivos o métricas: ya está.
- Uso de tablas y comparativas visuales: ya está.

---

## Lo que la propuesta mejora respecto al sistema actual

### 1. Flexibilidad estructural — MEJORA SIGNIFICATIVA

**Actual**: "NUNCA se altera el orden. Mínimo 2.500 palabras. TODAS las secciones son OBLIGATORIAS."

**Propuesta**: "La estructura es una guía, no un corsé. Activa solo los bloques que aporten valor a la consulta. Si un bloque no aplica, omítelo."

**Impacto**: El sistema actual fuerza 2.500 palabras aunque la pregunta sea "¿cuál es el RIX de Repsol esta semana?". La propuesta permite respuestas proporcionadas a la pregunta. Es un cambio funcional importante: más eficiente, menos artificial.

### 2. Acrónimos prohibidos → nombres descriptivos — MEJORA DE USABILIDAD

**Actual**: El sistema dice "SIEMPRE explica cada métrica en su primera mención, luego usa la sigla." Resultado: el modelo acaba escribiendo NVM, DRM, SIM repetidamente.

**Propuesta**: "Nunca uses acrónimos. Usa el nombre descriptivo." Y añade la regla de explicar entre rayas solo la primera vez.

**Impacto**: Beneficia directamente al usuario final que no conoce RepIndex. La propuesta es más estricta y más clara en este punto.

### 3. Reglas de escritura explícitas — MEJORA DE CONSISTENCIA

**Actual**: El sistema define tono (profesional, declarativo, narrativo, accesible) pero no da reglas de estilo concretas.

**Propuesta**: Añade reglas operativas ausentes hoy:
- Frases ≤25 palabras
- Párrafos ≤4 líneas
- "Ha subido 8 puntos, de 54 a 62" en lugar de "ha mejorado mucho"
- "Las IAs" como sujeto genérico; nombre propio cuando sea una concreta

**Impacto**: Aumenta la homogeneidad de las respuestas. Elimina respuestas verbosas o vagas.

### 4. Adaptación por tipo de consulta — MEJORA DE RELEVANCIA

**Actual**: No hay instrucción explícita de adaptar profundidad según el tipo de pregunta (empresa vs. sector vs. comparativa).

**Propuesta**: "Escalar profundidad: empresa → máxima · sector → media · comparativa → enfrentada · el resto → focalizada."

**Impacto**: Hace el comportamiento del agente más predecible y ajustado.

### 5. Aviso explícito sobre priorización de consenso — MEJORA DE TRANSPARENCIA

**Actual**: El sistema prioriza consenso pero no instruye al modelo a comunicarlo al usuario.

**Propuesta**: "Priorizar consenso (5-6 IAs coinciden) sobre menciones aisladas. Avisa explícitamente en texto que estás priorizando consenso y que es posible que estés dejando de mencionar acontecimientos con menciones aisladas."

**Impacto**: Mejora la honestidad epistémica del agente. El usuario entiende por qué algo no aparece mencionado.

---

## Lo que la propuesta cambia que requiere una decisión

### El mínimo de 2.500 palabras

**Actual**: Fijo en 2.500 palabras. Todas las secciones obligatorias.

**Propuesta**: Sin mínimo de palabras explícito. Estructura adaptable a la consulta.

Este es el único cambio con riesgo real: sin un mínimo, los modelos tienden a ser demasiado breves en preguntas simples. La propuesta compensa esto con "empresa → máxima profundidad", pero no hay un número concreto.

**Recomendación**: Mantener el mínimo de 2.500 palabras solo para análisis de empresa completo. Para el resto, dejar que la estructura adaptable lo regule.

---

## Lo que NO cambia (confirmado en el código actual)

| Elemento | Estado |
|---|---|
| Orden del embudo (5 bloques) | Sin cambios |
| Formato 6 campos Pilar 3 | Sin cambios |
| Anti-alucinación de directivos | Sin cambios |
| Pipeline SQL-to-Narrative | Sin cambios |
| Vector Store y Graph RAG | Sin cambios |
| Streaming SSE | Sin cambios |
| Glosario canónico de métricas | Sin cambios |
| Protocolo de datos corporativos | Sin cambios |

---

## Punto de atención: el Agente Comercial (sales-intelligence-chat)

El agente comercial también sigue el Embudo Narrativo, pero con ángulo de venta ("urgencia comercial", "riesgos invisibles", "preguntas imposibles"). La propuesta nueva no menciona este agente. Hay dos opciones:

1. Aplicar las mismas reglas de escritura (frases cortas, sin acrónimos, datos concretos) también al agente comercial.
2. Dejar el agente comercial con su prompt actual y aplicar la propuesta solo al Agente Rix.

---

## Plan de implementación

Si apruebas el plan, los cambios técnicos son **exclusivamente en `chat-intelligence/index.ts`**:

### Cambio 1 — `buildDepthPrompt` (línea 1162)
Eliminar el requisito "TODAS las secciones son OBLIGATORIAS" y "mínimo 2.500 palabras" como regla universal. Reemplazar por la escala de profundidad adaptable: empresa → máxima, sector → media, comparativa → enfrentada, resto → focalizada. Mantener 2.500 palabras solo para empresa completo.

### Cambio 2 — Reglas de métricas (línea 4601)
Reemplazar "SIEMPRE explica cada métrica en su primera mención, luego usa la sigla" por "Nunca uses acrónimos. Usa el nombre descriptivo. La primera vez, explica entre rayas qué mide."

### Cambio 3 — Reglas de escritura (línea ~4540)
En el bloque "TU TONO", añadir las reglas operativas:
- Frases ≤25 palabras
- Párrafos ≤4 líneas
- Datos concretos: nunca "ha mejorado mucho" → siempre la cifra exacta con delta
- "Las IAs" como sujeto genérico; nombre propio cuando sea una concreta

### Cambio 4 — Adaptación por tipo de consulta (línea ~4583)
Añadir la escala de profundidad por tipo de consulta en el bloque de Estructura del sistema.

### Cambio 5 — Aviso de priorización de consenso (línea ~4563)
Añadir la instrucción de avisar explícitamente al usuario cuando se prioriza consenso y se omiten menciones aisladas.

### Archivos modificados
| Archivo | Tipo de cambio |
|---|---|
| `supabase/functions/chat-intelligence/index.ts` | Refinamiento de tono, reglas de escritura, flexibilidad estructural, regla de acrónimos |
| `supabase/functions/sales-intelligence-chat/index.ts` | Opcional, según decisión del usuario |

### Lo que NO se toca
- Lógica de datos, SQL, Vector Store, streaming, anti-alucinación, formato 6 campos Pilar 3, orden del embudo.
