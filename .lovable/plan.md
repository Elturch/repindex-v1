
# Plan: Eliminar Pilares y Anclar el Relato a Datos SQL

## Diagnostico

El problema NO es un bug puntual. Es un **fallo de diseno arquitectonico** en el sistema de prompts:

1. La funcion `buildDepthPrompt` (lineas 2704-2868) instruye al LLM a escribir en formato "PILAR 1 / PILAR 2 / PILAR 3" con 4.500-5.400 palabras de objetivo
2. El LLM interpreta "Pilar" como libertad creativa e inventa sus propios nombres de pilares ("Deteccion Temprana de Eventos Negativos", "Consolidacion de Veracidad Documental")
3. El FORBIDDEN_PATTERNS (linea 1123) solo atrapa `pilar + definir/analizar/prospectar` pero NO atrapa pilares con nombres inventados
4. El resultado: informes de consultoria ficticia con sistemas inventados (Sent-Shift, GDELT, Fitch-Bot, Crisis-Ops)

El pipeline E1-E6 esta bien disenado. Los datos SQL de E2 son correctos y completos. El problema es que E5 (Orquestador) ignora los datos y fabrica un informe de consultoria porque el prompt lo alienta con la estructura de "Pilares".

## Cambios (3 archivos, 1 fichero)

Todo se hace en `supabase/functions/chat-intelligence/index.ts`.

---

### Cambio 1: Reemplazar `buildDepthPrompt` — eliminar Pilares, anclar a datos SQL

**Lineas afectadas:** 2700-2868

Sustituir toda la funcion `buildDepthPrompt` con una estructura anclada en datos reales, sin "Pilares". La nueva estructura:

```text
ESTRUCTURA DEL INFORME (guia flexible, no rigida):

## RESUMEN EJECUTIVO (~500 palabras)
- Titular-diagnostico: 1-2 frases que sinteticen la situacion con datos concretos
- 3 KPIs principales con delta vs periodo anterior (solo si existen en DATAPACK)
- 3 hallazgos principales derivados de los datos
- Veredicto: parrafo de 3-4 oraciones con valoracion del analista

## VISION DE LAS 6 IAs (~800 palabras)
Para cada modelo de IA que aparezca en DATAPACK.snapshot:
- Puntuacion RIX, fortaleza principal, debilidad principal
- Parrafo interpretativo de 3-4 oraciones

## LAS 8 METRICAS (~600 palabras)
Para cada metrica con datos en DATAPACK.snapshot:
- Nombre completo + puntuacion + semaforo
- Explicacion de POR QUE (usando EXPLICACIONES POR METRICA de E2)
- Comparacion con competidores verificados (si existen en DATAPACK)

## DIVERGENCIA ENTRE MODELOS (~400 palabras)
Solo si DATAPACK.divergencia muestra sigma > 8:
- Que modelos coinciden, cuales divergen
- Que implica para la empresa

## EVOLUCION TEMPORAL (~400 palabras)
Solo si DATAPACK.evolucion tiene >= 2 semanas:
- Tabla con deltas semanales (datos de E2, no inventados)

## CONTEXTO COMPETITIVO (~400 palabras)
Solo si DATAPACK.competidores_verificados tiene datos:
- Ranking de competidores verificados con RIX
- Gaps por metrica vs competidores

## RECOMENDACIONES BASADAS EN DATOS (~400 palabras)
Solo las que deriven del ANALISIS (E4):
- Cada recomendacion cita la metrica, el gap numerico y la evidencia
- PROHIBIDO inventar acciones sin dato que las respalde

## CIERRE — FUENTES Y METODOLOGIA
- Modelos consultados, fecha, periodo
```

**Diferencias clave vs el diseno actual:**
- NO hay "Pilares" numerados — cada seccion se llama por lo que describe
- Cada seccion tiene una referencia explicita a DE DONDE salen los datos (DATAPACK, E2, E4)
- El rango de palabras baja de 4.500-5.400 a 2.500-4.000
- Se eliminan las subsecciones que invitan a fabular ("Amenazas y Riesgos", "Gaps: Realidad vs Percepcion IA")

---

### Cambio 2: Reforzar el system prompt del orquestador E5

**Lineas afectadas:** 2140-2228 (dentro de `buildOrchestratorPrompt`)

Anadir reglas explicitas:

```text
REGLA DE ESTRUCTURA (PRIORIDAD MAXIMA):
- NUNCA uses encabezados de tipo "PILAR X — [nombre]". Esta estructura esta PROHIBIDA.
- NUNCA inventes nombres de fases, protocolos, algoritmos ni sistemas internos de la empresa.
- Cada seccion del informe debe empezar citando los datos del DATAPACK que la sustentan.
- Si una seccion no tiene datos en el DATAPACK, OMITE esa seccion entera. No la rellenes.
- El informe es un ANALISIS DE DATOS, no un plan estrategico ni un informe de consultoria.
```

---

### Cambio 3: Ampliar FORBIDDEN_PATTERNS para atrapar cualquier "Pilar" inventado

**Lineas afectadas:** 1078-1136

Anadir estos patrones nuevos:

```text
// Cualquier "PILAR X —" con CUALQUIER nombre (no solo definir/analizar/prospectar)
/pilar\s+\d+\s*[-–—:]\s*[A-ZÁÉÍÓÚÑ]/i,

// Frameworks y protocolos inventados
/roadmap\s+(?:correctivo|estrategico|de\s+mejora)/i,
/kpi\s+objetivo\s+trim\d/i,
/(?:sent-shift|crisis-?ops|gitreg|fitch-?bot|glassscan|auto-?publish)/i,
/algoritmo\s+de\s+ponderacion/i,
/firma\s+pgp/i,
/checksum\s+md5/i,
/hash\s+sha-?\d+/i,
/cobertura\s+24\s*\/?\s*7\s+de\s+\d+\s+fuentes/i,
/matriz\s+de\s+severidad/i,
/storytelling\s+compacto/i,
/portavocia\s+triple/i,
/equipo\s+(?:crisis|comunicacion)\s+con\s+sla/i,
/coef(?:iciente)?\.?\s+\d+[.,]\d+/i,
/\d+[.,]\d+\s*%\s+de\s+volatilidad/i,
/brecha\s+\d+\s*-\s*\d+\s*:\s*nucleo\s+causal/i,
```

---

### Cambio 4: Actualizar claves i18n — eliminar referencias a pilares

**Lineas afectadas:** 87-89, 190-192, 291-293, 392-394 (y equivalentes en fr/pt)

Reemplazar:

```text
// ANTES:
depth_pillar1: "PILAR 1 — DEFINIR (Que dice el dato)",
depth_pillar2: "PILAR 2 — ANALIZAR (Que significan)",
depth_pillar3: "PILAR 3 — PROSPECTAR (Que hacer)",

// DESPUES:
depth_section_data: "LOS DATOS",
depth_section_analysis: "EL ANALISIS",
depth_section_actions: "ACCIONES BASADAS EN DATOS",
```

Tambien actualizar `depth_format_title` para quitar "EMBUDO NARRATIVO":

```text
// ANTES:
depth_format_title: "FORMATO: EMBUDO NARRATIVO — La estructura es una guia, no un corse"

// DESPUES:
depth_format_title: "FORMATO: INFORME ANALITICO — Estructura anclada en datos SQL"
```

---

## Que NO se toca

| Componente | Estado |
|------------|--------|
| E1 Clasificador | Intacto — funciona bien |
| E2 DataPack SQL | Intacto — es la fuente de verdad |
| E3 Lector Cualitativo | Intacto — extrae hechos de textos reales |
| E4 Comparador Analitico | Intacto — cruza datos reales |
| E6 Layout Formatter | Intacto — solo reformatea |
| Streaming SSE | Intacto |
| Auto-continuation | Intacto |
| Bulletin handler | Intacto |
| Session save | Intacto |
| allRixData mapping | Intacto (ya arreglado) |

## Por que esto resuelve la alucinacion

1. **Sin "Pilares"** el LLM no tiene estructura creativa que rellenar
2. **Cada seccion cita su fuente** (DATAPACK, E2, E4) — si no hay datos, se omite
3. **FORBIDDEN_PATTERNS** atrapa cualquier "PILAR X —" con nombre inventado
4. **Rango de palabras reducido** (2.500-4.000) evita que el LLM necesite inventar para llenar
5. **Regla explicita** en el system prompt prohibe la estructura de pilares

## Riesgo

Bajo. Los cambios son exclusivamente en prompts y patrones regex. No se toca la logica de datos (E2), el streaming, ni las llamadas a la API. El peor caso es que el formato del informe cambie visualmente, pero siempre anclado en datos reales.
