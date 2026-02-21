

# Plan: Enriquecer las respuestas del Agente Rix reforzando las instrucciones de profundidad

## Diagnostico

Los 5 cambios anteriores (textos brutos expandidos, categorias, explicaciones, resumenes, ranking inteligente) estan funcionando correctamente: el LLM recibe datos mucho mas ricos. Pero las respuestas salen mas cortas porque:

1. **El userPrompt no refuerza la profundidad**: Las 8 instrucciones finales (lineas 5373-5380) son genericas. Dicen "informe ejecutivo" pero nunca mencionan el minimo de 2.500 palabras, ni nombran los pilares del Embudo, ni dicen "usa TODOS los datos disponibles de los 6 modelos".

2. **Sesgo de recencia**: El LLM ve el Embudo Narrativo detallado en el system prompt (lineas 1119-1277), pero lo ultimo que procesa es el userPrompt con instrucciones vagas. El modelo prioriza las instrucciones mas recientes.

3. **Mas contexto, misma exigencia**: Al duplicar los datos de entrada sin reforzar la exigencia de output, el LLM interpreta que puede "resumir" el contexto expandido en lugar de explotarlo exhaustivamente.

## Solucion: Reforzar el userPrompt con instrucciones de explotacion de datos

Un unico cambio en el archivo `supabase/functions/chat-intelligence/index.ts`, en la seccion del `userPrompt` (lineas 5365-5388).

### Cambio: Reescribir las instrucciones del userPrompt

Las instrucciones actuales (lineas 5373-5380) son:

```
1. Produce un INFORME EJECUTIVO presentable a alta direccion
2. Prioriza HECHOS CONSOLIDADOS (datos en los que coinciden 5-6 IAs)
3. SIEMPRE explica cada metrica en su primera mencion
4. Usa TABLAS para presentar datos comparativos
5. Fundamenta cada afirmacion con datos del contexto
6. Construye una NARRATIVA coherente, no una lista de bullets
7. Si es un analisis completo de empresa, sigue la estructura de informe ejecutivo
8. Si es una pregunta simple, adapta la profundidad pero manten el rigor
```

Se reemplazan por instrucciones que explotan los datos enriquecidos y refuerzan la estructura:

```
INSTRUCCIONES DE PROFUNDIDAD:

1. EXPLOTACION DE DATOS: Tienes textos originales de 6 modelos de IA,
   explicaciones del analisis, categorias de metricas y resumenes completos.
   USA TODOS ESTOS DATOS en tu respuesta. Cruza lo que dice un modelo con 
   lo que dice otro. Cita hallazgos especificos de cada IA.

2. ESTRUCTURA OBLIGATORIA para analisis de empresa:
   RESUMEN EJECUTIVO (titular + 3 KPIs + hallazgos + recomendaciones + veredicto)
   -> PILAR 1 DEFINIR (vision de las 6 IAs + 8 metricas + divergencias)
   -> PILAR 2 ANALIZAR (evolucion + amenazas + gaps + contexto competitivo)
   -> PILAR 3 PROSPECTAR (3 activaciones + 3 tacticas + 3 lineas estrategicas)
   -> CIERRE (kit de gestion + fuentes)

3. EXTENSION MINIMA: Para analisis de empresa, minimo 2.500 palabras.
   No resumas cuando puedes desarrollar. Cada pilar debe aportar valor
   ejecutivo con datos concretos, no relleno.

4. EVIDENCIA CRUZADA: Cada afirmacion importante debe indicar cuantas
   IAs la respaldan. Usa las categorias de metricas (fortaleza/mejora/riesgo)
   que tienes en los datos para fundamentar la interpretacion.

5. TABLAS COMPARATIVAS: Incluye tablas de scores por modelo, tablas
   competitivas, y tablas de escenarios cuando corresponda.

6. NARRATIVA: Construye un relato coherente. Fundamenta con datos literales
   del contexto. Explica cada metrica en su primera mencion.

7. Para preguntas concretas (un dato, una metrica): respuesta focalizada
   sin relleno, pero siempre rigurosa y con evidencia.
```

### Detalle tecnico

| Linea(s) | Cambio |
|----------|--------|
| 5369-5381 | Reemplazar las 8 instrucciones genericas del userPrompt por las 7 instrucciones de explotacion de datos que refuerzan la estructura del Embudo, la extension minima y el uso exhaustivo de los datos enriquecidos |

### Lo que NO cambia

- El system prompt (Embudo Narrativo, metricas, reglas)
- Los datos inyectados (textos brutos, explicaciones, categorias)
- El max_completion_tokens (24.000 es suficiente)
- El modelo (o3 con fallback a Gemini 2.5 Flash)
- El ranking inteligente
- El frontend
- "Guia, no corse" (se mantiene la flexibilidad)

### Resultado esperado

El LLM recibira como ultima instruccion (recency bias) un recordatorio explicito de:
- Que tiene datos de 6 modelos y DEBE cruzarlos
- Que debe seguir la estructura de 5 bloques
- Que el minimo es 2.500 palabras para empresa
- Que tiene categorias y explicaciones y debe usarlas

Esto convierte los datos enriquecidos (que ya estan ahi) en respuestas enriquecidas (que ahora el LLM sabe que debe producir).

