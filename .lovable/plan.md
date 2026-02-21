

# Plan: Desbloquear la profundidad narrativa del Agente Rix

## Diagnostico: Por que las respuestas salen cortas (4.997 caracteres = ~1.000 palabras)

El problema NO es el limite de tokens de salida (24.000 tokens = ~18.000 palabras, sobra espacio). El LLM esta **eligiendo** ser breve. Hay tres causas concretas:

### Causa 1 -- Instrucciones de estilo que promueven brevedad

En la linea 4922 del system prompt hay reglas de escritura que el LLM interpreta como "se breve":

```
REGLAS DE ESCRITURA OPERATIVAS (sin excepcion):
- Frases <=25 palabras. Parrafos <=4 lineas.
```

Estas reglas son correctas para ESTILO (claridad ejecutiva), pero el LLM las interpreta como "escribe poco". El resultado: parrafos de 4 lineas x 25 palabras = 100 palabras por parrafo. Para llegar a 2.500 palabras necesitaria 25 parrafos perfectos, y el LLM corta antes.

### Causa 2 -- El minimo de 2.500 palabras es insuficiente para el Embudo completo

El Embudo Narrativo tiene 5 bloques con subbloques:
- Resumen Ejecutivo: Titular + 3 KPIs + 3 Hallazgos + 3 Recomendaciones + Veredicto + 5 Mensajes = ~800 palabras minimo
- Pilar 1 Definir: Vision de 6 IAs (6 x 100 palabras) + 8 Metricas (8 x 80 palabras) + Divergencia = ~1.300 palabras minimo
- Pilar 2 Analizar: Evolucion + Amenazas + Gaps + Competitivo = ~800 palabras minimo
- Pilar 3 Prospectar: 3 Activaciones + 3 Tacticas + 3 Estrategicas + Escenarios = ~1.200 palabras minimo
- Cierre: Kit de Gestion + Fuentes = ~400 palabras minimo

**Total real necesario: ~4.500 palabras minimo**, no 2.500.

### Causa 3 -- Falta una instruccion explicita de narrar las 8 metricas individualmente

El prompt dice "para cada metrica relevante" y "solo si hay datos", lo que el LLM interpreta como permiso para saltarse metricas. Pero el usuario quiere ver las 8 metricas narradas con detalle: que significa cada puntuacion, que implica para la empresa, como se compara con los competidores.

## Solucion: 3 cambios en el userPrompt

Archivo: `supabase/functions/chat-intelligence/index.ts`

### Cambio 1 -- Subir el minimo de 2.500 a 4.500 palabras

En las instrucciones del userPrompt (linea 5387), cambiar:

```
Antes:
3. EXTENSION MINIMA: Para analisis de empresa, minimo 2.500 palabras.

Despues:
3. EXTENSION MINIMA: Para analisis de empresa, minimo 4.500 palabras.
   El Embudo Narrativo tiene 5 bloques con subbloques detallados.
   No resumas cuando puedes desarrollar.
```

### Cambio 2 -- Anadir instruccion explicita sobre las 8 metricas

Anadir un punto nuevo en el userPrompt que obligue a narrar cada metrica:

```
8. METRICAS INDIVIDUALES: Para analisis de empresa, dedica un parrafo
   COMPLETO (4-6 oraciones) a CADA una de las 8 metricas dimensionales.
   Para cada metrica explica: que puntuacion tiene, que categoria
   (fortaleza/mejora/riesgo), que significa en la practica para la empresa,
   y que dicen especificamente los diferentes modelos de IA sobre ella.
   Las metricas son el corazon del analisis -- no las reduzcas a una linea.
```

### Cambio 3 -- Clarificar que brevedad de estilo != brevedad de contenido

Anadir una instruccion que desambigue las reglas de escritura:

```
9. IMPORTANTE: Las reglas de estilo (frases cortas, parrafos de 4 lineas)
   se refieren a CLARIDAD, no a BREVEDAD de contenido. Escribe MUCHOS
   parrafos claros y concisos. Mas parrafos = mas profundidad.
   Un informe ejecutivo de 4.500 palabras tiene ~45 parrafos de 100 palabras.
```

## Detalle tecnico

| Linea(s) | Cambio |
|----------|--------|
| 5387-5389 | Cambiar minimo de 2.500 a 4.500 palabras y anadir justificacion |
| 5401-5402 | Anadir punto 8 sobre metricas individuales obligatorias |
| Despues de punto 8 | Anadir punto 9 desambiguando brevedad de estilo vs contenido |

## Lo que NO cambia

- El system prompt completo (Embudo Narrativo, reglas de escritura, "guia no corse")
- Los datos inyectados (textos brutos expandidos, explicaciones, categorias)
- El max_completion_tokens (24.000 tokens = ~18.000 palabras, sobra margen)
- El modelo (o3 con fallback a Gemini 2.5 Flash)
- Los 5 cambios anteriores de enriquecimiento de datos
- El ranking inteligente
- El frontend

## Resultado esperado

Con 4.500 palabras minimas y la instruccion explicita de narrar las 8 metricas, el LLM producira informes donde:
- Cada metrica dimensional tiene su propio parrafo narrativo detallado
- Se cruzan datos cualitativos de los 6 modelos por metrica
- Se usan las categorias (fortaleza/riesgo/mejora) para interpretar cada puntuacion
- El informe tiene la extension necesaria para cubrir los 5 bloques del Embudo con profundidad real

El token budget lo permite holgadamente: 4.500 palabras ~= 6.000 tokens de salida, frente al limite de 24.000 tokens.
