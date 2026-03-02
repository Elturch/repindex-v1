

# Plan: Activar el Pipeline Multi-Experto E1-E6

## Que pasa ahora (el problema)

Las funciones E1-E6 (lineas 904-1561) estan escritas pero **nunca se ejecutan**. La funcion `handleStandardChat` (linea 4566) sigue usando:

- Regex antiguo para detectar empresas (linea 4587)
- 3.000 lineas de queries SQL duplicadas (lineas 4596-5750) que repiten lo que E2 ya hace
- Un system prompt monolitico de **500 lineas** (6551-7067) con instrucciones contradictorias
- Un user prompt (7069-7140) que pide "4.500-5.400 palabras" en un sitio y "2.500-4.000" en otro
- La regla "6 campos obligatorios por recomendacion" (linea 6662) que fuerza al LLM a inventar datos

El resultado: el LLM recibe ~15.000 tokens de instrucciones contradictorias y fabrica planes de remediacion con DOIs, convenios universitarios y KPIs inventados.

## Que vamos a hacer

Reemplazar el flujo monolitico dentro de `handleStandardChat` por llamadas secuenciales a los 6 expertos que ya estan escritos. Cada experto hace su trabajo especifico y el Orquestador Maestro (E5) compone la respuesta final con **razonamiento** y **narrativa comprensible**.

## Como funciona el pipeline

```text
Usuario pregunta
    |
    v
E1 (Clasificador) -- Entiende que pide el usuario, que empresa, que tipo de analisis
    |
    v
E2 (Datos SQL) -- Recoge TODOS los datos reales de la base de datos (cero invencion)
    |
    v
E3 (Lector) -- Lee los textos originales de las 6 IAs, extrae hechos con atribucion
    |
    v
E4 (Comparador) -- Cruza datos + hechos para encontrar fortalezas, debilidades, gaps
    |
    v
E5 (Orquestador Maestro) -- Recibe TODO lo anterior y redacta el informe final:
    - Resumen Ejecutivo claro y directo
    - Pilares cuando aporten valor (no forzados)
    - Comparacion de IAs cuando convenga
    - Consenso de modelos para dar consistencia
    - Recomendaciones ancladas en datos reales
    - Todo narrado para que cualquier persona lo entienda
    |
    v
E6 (Maquetador) -- Optimiza el formato para PDF profesional
```

## Cambios concretos en el archivo

### Archivo: `supabase/functions/chat-intelligence/index.ts`

**1. Reescribir el nucleo de handleStandardChat (~200 lineas vs ~3.000 actuales)**

Sustituir los bloques PASO 0 a PASO 6 + prompt monolitico por:

```text
// 1. E1: Clasificar intencion (reemplaza detectCompaniesInQuestion)
const classifier = await runClassifier(question, companiesCache, history, language)

// 2. E2: Construir DataPack determinista (reemplaza PASOs 0-5.5)
const dataPack = await buildDataPack(classifier, supabaseClient, companiesCache)

// 3. Contexto complementario (se mantiene lo valioso del sistema actual)
//    - Graph expansion: se inyecta como bloque extra en E5
//    - Vector search: se inyecta como bloque extra en E5
//    - Regression analysis: se inyecta como bloque extra en E5

// 4. E3: Extraer hechos cualitativos de los textos brutos
const facts = await extractQualitativeFacts(dataPack.raw_texts, dataPack)

// 5. E4: Comparador analitico (cruza datos + hechos)
const analysis = await runComparator(dataPack, facts, classifier)

// 6. E5: Construir prompt del Orquestador Maestro
const { systemPrompt, userPrompt } = buildOrchestratorPrompt(
  classifier, dataPack, facts, analysis, question, languageName, roleName, rolePrompt
)
// Inyectar graph/vector/regression como contexto complementario en userPrompt

// 7. Llamada LLM con streaming (misma infraestructura actual)
const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: userPrompt }]
// Streaming, compliance gate, auto-continuation -- todo se mantiene identico
```

**2. Mejorar el prompt de E5 (el Orquestador Maestro)**

El prompt actual de E5 (lineas 1429-1481) ya es bueno pero le faltan las mejores reglas del prompt antiguo. Se enriquecera con:

- Las reglas de estilo narrativo (frases cortas, parrafos de 4 lineas, didactico)
- La escala de consenso (5-6 IAs = hecho consolidado, 3-4 = senal fuerte, etc.)
- La explicacion de metricas con nombres descriptivos (no acronimos)
- Las reglas de tablas comparativas
- El protocolo de datos corporativos (memento con niveles de confianza)
- La justificacion metodologica "Radar Reputacional"
- Todas las reglas anti-alucinacion (ejecutivos, cifras financieras, empresas ficticias)
- La adaptacion a perspectivas/roles profesionales

Lo que NO se incluye (porque causaba fabricacion):
- "6 campos obligatorios" por recomendacion (Que, Por que, Responsable, KPI, Impacto IA)
- Extension "4.500-5.400 palabras" (contradecia los "2.500-4.000" de otro sitio)
- Cualquier instruccion que fuerce al LLM a rellenar cuando no tiene datos

**3. Preservar el graph expansion, vector search y regression**

Estos tres componentes complementarios del sistema actual aportan valor real. Se mantienen como queries independientes que se ejecutan en paralelo y se inyectan como bloques extra en el userPrompt de E5:

```text
userPrompt += "\n\n=== GRAFO DE CONOCIMIENTO ===\n" + graphContext
userPrompt += "\n\n=== CONTEXTO VECTORIAL ===\n" + vectorContext
userPrompt += "\n\n=== ANALISIS ESTADISTICO ===\n" + regressionData
```

**4. Eliminar codigo muerto**

- El system prompt monolitico de 500 lineas (6551-7067) se elimina
- El user prompt antiguo (7069-7140) se elimina
- `buildDepthPrompt` se elimina (E5 tiene extension clara: 2.500-4.000)
- Las queries SQL duplicadas (PASOs 0-5.5) se eliminan (E2 las hace)
- `detectCompaniesInQuestion` se mantiene solo como fallback de E1

**5. Mantener intacto**

- Streaming SSE (misma infraestructura, solo cambian los messages)
- Compliance gate (forbidden patterns, holdback buffer)
- Auto-continuation (con mejora: re-inyectar DataPack en continuaciones)
- Suggested questions + drumroll
- Guardado en BD (session save)
- Bulletin mode (flujo separado, no se toca)
- Toda la logica de companiesCache, roles, idiomas

## Que consigue cada experto

| Experto | Su trabajo | Que NO hace |
|---------|-----------|-------------|
| E1 Clasificador | Entiende la pregunta, detecta empresas, idioma, intencion | No analiza datos, no redacta |
| E2 DataPack | Recoge TODOS los datos reales de la BD | No interpreta, no usa LLM |
| E3 Lector | Lee textos de las 6 IAs, extrae hechos con atribucion | No inventa, no interpreta |
| E4 Comparador | Cruza cuanti + cuali, encuentra fortalezas/debilidades | No redacta, no fabrica recomendaciones sin datos |
| E5 Orquestador | Redacta el informe final con RAZONAMIENTO y narrativa | No busca datos, no clasifica -- todo le llega masticado |
| E6 Maquetador | Optimiza formato visual para PDF | No cambia contenido, solo formatea |

## Como el Orquestador Maestro (E5) compone la respuesta ideal

El Orquestador recibe los artefactos de E1-E4 como JSON y redacta un informe que:

1. **Resumen Ejecutivo** siempre -- titular claro, 3 KPIs principales, veredicto comprensible
2. **Pilares cuando aporten valor** -- si hay datos para Definir/Analizar/Prospectar, los incluye; si no, los omite sin disculpas
3. **Comparacion de IAs** -- tabla de scores por modelo cuando hay divergencia interesante
4. **Consenso de modelos** -- "5 de 6 IAs coinciden en..." da consistencia y credibilidad
5. **Perspectiva del usuario** -- adapta angulo segun rol (CEO, comunicacion, inversor, asuntos publicos)
6. **Recomendaciones ancladas en datos** -- "Mejorar Autoridad de Fuentes: gap de 18 pts vs sector" (no planes inventados con DOIs)
7. **Todo narrado con claridad** -- frases cortas, cada metrica explicada la primera vez, sin jerga

## Detalles tecnicos

- **Latencia estimada**: E1 (1s) + E2 (0.5s) + E3 (3s) + E4 (3s) + E5 streaming (15-20s) = ~25s total
- **Coste**: ~$0.064 por consulta (similar al actual)
- **Fallbacks**: Si E1 falla, usa regex. Si E3/E4 fallan, E5 trabaja solo con DataPack. Si E6 falla, se usa markdown de E5 tal cual.
- **Auto-continuacion mejorada**: Re-inyecta DataPack + pregunta original para que no pierda contexto

## Orden de implementacion

1. Reescribir el nucleo de `handleStandardChat` para llamar a E1-E6
2. Enriquecer el prompt de E5 con las mejores reglas del sistema antiguo
3. Preservar graph/vector/regression como contexto complementario
4. Eliminar el prompt monolitico y las queries duplicadas
5. Desplegar y verificar con una pregunta real

