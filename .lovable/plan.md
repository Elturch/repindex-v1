

# Arquitectura Multi-Experto Completa para Agente Rix (con Maquetador Adaptativo)

## Problema ampliado

El prompt monolitico actual intenta ser simultaneamente analista de datos, interprete cualitativo, comparador competitivo, prospectivista, validador anti-alucinacion Y redactor editorial. Pero ademas, la salida final debe ser un documento **exportable como PDF/HTML** de calidad ejecutiva, usando el sistema de estilos de `markdownToHtml.ts` (section-bands, emoji-metrics-tables, keyword highlighting, subsection-titles). Actualmente el LLM produce markdown "a ciegas" sin saber como sera renderizado, lo que genera inconsistencias visuales: tablas mal formadas, headers decorativos rotos, listas que no se alinean.

La solucion es anadir un **sexto experto maquetador** que conozca el sistema de renderizado y adapte la estructura visual al contenido real de cada respuesta, en vez de forzar una plantilla rigida.

---

## Pipeline de 6 Expertos

```text
PREGUNTA DEL USUARIO
        |
        v
+-------------------+
| E1: CLASIFICADOR  |  gpt-4o-mini (~200 tokens out, ~1s)
| Detecta empresa,  |  Artefacto: { tipo, empresa, ticker, intencion,
| tipo, intencion,  |    idioma, metricas_mencionadas, periodo }
| idioma             |
+-------------------+
        |
   [E1 + SQL en paralelo]
        |
        v
+-------------------+
| E2: ANALISTA SQL  |  Determinista (sin LLM, ~0.5s)
| DataPack completo |  Artefacto: JSON con snapshot 6 modelos x 8 metricas,
| desde rix_runs_v2 |  sector averages, ranking top/bottom 5, evolucion
|                   |  4 semanas, divergencia sigma, memento corporativo
+-------------------+
        |
        v
+-------------------+
| E3: LECTOR CUALIT.|  gpt-4o-mini (~1.000 tokens out, ~3s)
| Extrae hechos de  |  Artefacto: { temas_clave[], menciones_concretas[],
| los 6 textos      |    narrativa_dominante, divergencias_narrativas[],
| brutos de las IAs |    consensos[] }
+-------------------+
        |
        v
+-------------------+
| E4: COMPARADOR    |  gpt-4o-mini (~500 tokens out, ~3s)
| Cruza DataPack +  |  Artefacto: { diagnostico_resumen, fortalezas[],
| hechos cualitativos|   debilidades[], posicion_competitiva,
| -> diagnostico    |   recomendaciones[], gaps_percepcion[] }
+-------------------+
        |
        v
+-------------------+
| E5: ORQUESTADOR   |  o3 o gemini-2.5-flash (~4.000 tokens out, ~15-20s)
| MAESTRO           |  Recibe artefactos E1-E4.
| Redacta informe   |  Produce: markdown plano con datos trazables.
| ejecutivo         |  NO se preocupa de formato visual.
+-------------------+
        |
        v
+-------------------+
| E6: MAQUETADOR    |  gpt-4o-mini (~800 tokens out, ~3s)
| Adapta formato    |  Recibe: texto E5 + esquema de secciones + reglas CSS.
| visual al         |  Produce: markdown optimizado para renderizado PDF
| contenido real    |  con section-bands, tablas, emoji-grids, subsections.
+-------------------+
        |
        v
  RESPUESTA AL USUARIO
  (renderizada en chat + exportable como PDF/HTML)
```

---

## Detalle de cada Experto

### E1 -- Clasificador de Intencion (gpt-4o-mini)

**Input:** Pregunta del usuario + lista de empresas del cache + historial reciente
**Output JSON:**
```text
{
  "tipo": "empresa" | "sector" | "comparativa" | "metodologia" | "general",
  "empresas_detectadas": [{ ticker, nombre, confianza }],
  "intencion": "diagnostico" | "ranking" | "evolucion" | "metrica_especifica" | "prospectiva",
  "metricas_mencionadas": ["NVM", "CEM"],
  "periodo_solicitado": "ultima_semana" | "ultimo_mes" | "custom",
  "idioma": "es" | "en",
  "requiere_bulletin": boolean
}
```
**Prompt:** ~300 palabras. Solo clasificacion semantica. Sin analisis.

Reemplaza `detectCompaniesInQuestion` y `categorizeQuestion` (regex fragil). Elimina falsos positivos como "energia" activando "Acciona Energia".

---

### E2 -- Analista SQL (Determinista, sin LLM)

**Input:** Resultado de E1 (ticker, tipo, periodo)
**Output JSON:** DataPack estructurado
**Logica:** TypeScript puro, sin llamada a LLM.

| Query | Descripcion | Fuente |
|-------|-------------|--------|
| A | Snapshot canonico: 6 modelos x 8 metricas, ultima semana | rix_runs_v2 |
| B | Promedios sectoriales: media RIX y por metrica del sector | rix_runs_v2 + cache |
| C | Ranking competitivo: top/bottom 5 del sector o verificados | rix_runs_v2 |
| D | Evolucion temporal: 4 semanas canonicas con deltas | rix_runs_v2 |
| E | Divergencia inter-modelo: sigma, outlier alto/bajo | Derivado de A |
| F | Memento corporativo: directivos, sede, sector | repindex_root_issuers |
| G | Noticias recientes | news_articles |

Cero alucinacion posible. Los datos son lo que son.

---

### E3 -- Lector Cualitativo (gpt-4o-mini)

**Input:** Textos brutos de las 6 IAs + DataPack como referencia
**Output JSON:**
```text
{
  "temas_clave": [
    { "tema": "Transicion energetica", "mencionado_por": ["chatgpt","gemini","grok"], "consenso": 3 }
  ],
  "menciones_concretas": [
    { "modelo": "perplexity", "cita_textual": "...", "relevancia": "alta" }
  ],
  "narrativa_dominante": "La empresa es percibida como lider en X con debilidad en Y",
  "divergencias_narrativas": [
    { "tema": "Gobernanza", "chatgpt": "positivo", "deepseek": "critico" }
  ],
  "consensos": [
    { "tema": "Liderazgo renovable", "modelos_coincidentes": 5, "fuerza": "muy_alto" }
  ]
}
```
**Prompt:** ~400 palabras. "Extrae hechos. No interpretes. No inventes. Si un modelo no menciona un tema, no lo incluyas. Atribuye cada hecho al modelo que lo dice."

Convierte 6 textos largos y ruidosos en hechos estructurados con atribucion. El consenso entre IAs da consistencia.

---

### E4 -- Comparador Analitico (gpt-4o-mini)

**Input:** DataPack de E2 + hechos de E3
**Output JSON:**
```text
{
  "diagnostico_resumen": "Empresa X tiene RIX 62, 5 pts bajo media sectorial...",
  "fortalezas": [
    { "metrica": "NVM", "score": 75, "vs_sector": "+12", "evidencia_cualitativa": "5/6 IAs destacan narrativa clara" }
  ],
  "debilidades": [
    { "metrica": "SIM", "score": 35, "vs_sector": "-18", "evidencia_cualitativa": "Solo Perplexity cita fuentes tier-1" }
  ],
  "posicion_competitiva": { "ranking": 3, "de": 8, "lider": "EmpresaY", "distancia": -8 },
  "recomendaciones": [
    { "accion": "Mejorar trazabilidad documental", "metrica_objetivo": "DRM", "basado_en": "gap de 18 pts vs sector" }
  ],
  "gaps_percepcion": [
    { "tema": "ESG", "dato_real": "CEM 42", "narrativa_ia": "4 modelos positivos", "riesgo": "desconexion" }
  ]
}
```
**Prompt:** ~500 palabras. "Cruza datos cuantitativos con cualitativos. Solo conclusiones trazables. Cada recomendacion debe citar la metrica y el gap numerico que la justifica."

---

### E5 -- Orquestador Maestro (o3 o gemini-2.5-flash)

**Input:** Artefactos JSON de E1, E2, E3, E4 + pregunta original + rol del usuario
**Output:** Markdown plano con el informe completo

**Prompt reducido (~80 lineas vs ~500 actuales):**

```text
Eres el Agente Rix de RepIndex. Redacta un informe ejecutivo usando EXCLUSIVAMENTE
los datos de los bloques DATAPACK, HECHOS y ANALISIS que recibes.

REGLAS DE INTEGRIDAD:
1. Toda cifra debe existir en DATAPACK. Si no esta, escribe "dato no disponible".
2. Toda mencion tematica debe existir en HECHOS. Indica cuantas IAs coinciden.
3. Toda recomendacion debe existir en ANALISIS. No inventes nuevas.
4. NUNCA inventes empresas ficticias, cifras financieras, ni metodologias.
5. Si no hay datos suficientes, dilo con transparencia.

ESTRUCTURA (adapta segun contenido disponible):
- Resumen Ejecutivo: titular + 3 KPIs + veredicto en 1 parrafo
- Pilar 1 DEFINIR: vision de las 6 IAs (de mayor a menor RIX), las 8 metricas
  con interpretacion, divergencia entre modelos. Incluye tabla de scores.
- Pilar 2 ANALIZAR: evolucion temporal con deltas, gaps realidad vs percepcion,
  contexto competitivo con ranking. Incluye tabla comparativa.
- Pilar 3 PROSPECTAR: 3 metricas a mejorar, 3 fortalezas a proteger, posicion
  competitiva accionable. TODO basado en datos reales del ANALISIS.
- Cierre: modelos consultados, periodo, metodologia RepIndex.

OMISION INTELIGENTE: Si un pilar no tiene datos suficientes, omitelo limpiamente.
No rellenes con ficcion. La calidad esta en la trazabilidad, no en el volumen.

CONSENSO DE IAs: Cuando multiples modelos coinciden en un tema, destaca el nivel
de consenso (ej: "5 de 6 IAs coinciden en..."). El consenso refuerza la señal.
Cuando hay divergencia significativa, analizala como incertidumbre epistemica.

EXTENSION: 2.500-4.000 palabras para empresa. Focalizado para otros tipos.
TONO: Profesional, analitico, presentable a alta direccion.
ANGULO: Adapta al rol [roleName] si esta especificado.

FORMATO MARKDOWN:
- Usa ## para secciones principales y ### para subsecciones
- Usa tablas markdown para datos comparativos
- Usa blockquotes (>) para notas metodologicas
- Usa emojis de semaforo: verde >70, amarillo 50-70, rojo <50
- NO uses headers decorativos (═══). Usa ## y ### solamente.
```

El Orquestador se dedica SOLO a redactar bien con datos reales. No clasifica, no busca datos, no analiza. Todo le llega masticado.

---

### E6 -- Maquetador Adaptativo (gpt-4o-mini) -- NUEVO

Este es el experto que resuelve la preocupacion principal: que la salida final se "pinte" perfectamente como PDF ejecutivo, adaptada al contenido real de cada respuesta.

**Input:**
- Texto markdown de E5
- Esquema de secciones disponibles en el CSS (`section-band`, `emoji-metrics-table`, `subsection-title`, `table-wrapper`, `emoji-result-grid`)
- Tipo de consulta (de E1)
- Lista de metricas presentes en el informe

**Output:** Markdown optimizado para el renderizador `markdownToHtml.ts`

**Prompt (~600 palabras):**

```text
Eres un maquetador editorial experto. Recibes un informe ya redactado en markdown
y debes optimizar su formato visual para que se renderice como un PDF ejecutivo
de alta calidad.

CONOCES el sistema de renderizado CSS de RepIndex:
- Los separadores "---" entre secciones se convierten en section-bands azules
- Las tablas markdown se renderizan con estilo editorial (zebra striping, headers azules)
- Los emojis de semaforo (verde/amarillo/rojo) tienen clase .emoji-status
- Las listas numeradas con "1. Metrica -- valor pts emoji" se agrupan en emoji-metrics-table
- Los blockquotes (>) se renderizan como notas metodologicas con borde azul
- Los ### se convierten en subsection-titles con borde inferior
- Las palabras clave se auto-resaltan en negrita por el sistema (no lo hagas tu)

TU TRABAJO:
1. SEPARADORES DE SECCION: Inserta "---" entre cada pilar/seccion principal
   para que el renderizador los convierta en section-bands profesionales.

2. TABLAS DE METRICAS: Si el informe lista las 8 metricas como bullets o parrafos,
   reformatea como tabla markdown:
   | Metrica | Score | Categoria | vs Sector |
   Asi el renderizador las muestra como tabla editorial.

3. TABLA DE SCORES POR MODELO: Si hay datos de 6 modelos, formatea como:
   | Modelo | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |
   con emojis de semaforo en las celdas.

4. TABLA COMPETITIVA: El ranking debe ser tabla, no lista:
   | Pos | Empresa | RIX | Distancia al lider |

5. TABLA DE EVOLUCION: Las tendencias temporales como tabla:
   | Semana | RIX | Delta | Tendencia |

6. BLOQUES DE METRICAS NUMERADAS: Si hay listas como:
   "1. NVM (Narrativa) -- 72 pts verde"
   Mantenlas en formato "1. Nombre -- valor emoji" para que el renderizador
   las agrupe en emoji-metrics-table.

7. NOTAS METODOLOGICAS: Cada seccion puede tener 1 nota en blockquote (>)
   al final. No abuses -- maximo 3-4 en todo el informe.

8. JERARQUIA DE HEADERS:
   - ## para Pilares principales (Definir, Analizar, Prospectar)
   - ### para subsecciones dentro de cada pilar
   - #### solo para sub-subsecciones si es necesario
   - NUNCA uses # (h1) -- esta reservado para el titulo del documento

9. ADAPTACION AL CONTENIDO:
   - Si el informe es corto (pregunta general), NO forces estructura de pilares
   - Si es comparativa, prioriza tablas lado a lado
   - Si es evolucion, prioriza tabla temporal + grafico narrativo de tendencia
   - Si es metrica especifica, prioriza deep-dive en esa metrica

REGLAS:
- NO cambies el contenido, cifras ni redaccion. Solo reformateas.
- NO elimines texto. Solo reorganizas la presentacion visual.
- NO anadias contenido nuevo. Tu trabajo es puramente visual.
- Mantén todos los emojis de semaforo tal cual estan.
```

**Coste:** ~2.000 tokens input + ~800 tokens output con gpt-4o-mini. Rapido (~2-3s).

**Beneficio clave:** La respuesta sale del pipeline lista para renderizarse como PDF profesional. El sistema de `markdownToHtml.ts` ya sabe convertir section-bands, emoji-metrics-tables, y subsection-titles. El maquetador se asegura de que el markdown use los patrones correctos para activar cada componente CSS, adaptado al contenido real (no una plantilla fija).

---

## Flujo de Ejecucion

```text
Tiempo 0s:  E1 (clasificador) + precarga textos brutos [paralelo]
Tiempo 1s:  E2 (SQL DataPack, determinista)
Tiempo 1.5s: E3 (lector cualitativo) -- necesita E2 + textos
Tiempo 4.5s: E4 (comparador) -- necesita E2 + E3
Tiempo 7.5s: E5 (orquestador, streaming) -- necesita E1-E4
Tiempo 25s:  E6 (maquetador) -- necesita E5 completo
Tiempo 28s:  Respuesta final al usuario

Total estimado: ~28-30 segundos
```

**Nota sobre streaming:** E5 produce streaming para que el usuario vea texto aparecer. E6 se aplica como post-procesamiento rapido (~3s) sobre el texto completo. Hay dos opciones de implementacion:

- **Opcion A (recomendada):** E5 hace streaming al usuario. Cuando termina, E6 reformatea y el resultado final se usa para exportacion PDF/HTML. El usuario ve el texto en tiempo real y el PDF sale perfecto.
- **Opcion B:** E5 no hace streaming; E6 se ejecuta sobre el resultado y LUEGO se envia todo al usuario. Latencia mayor pero el chat ya muestra el formato final.

Recomiendo **Opcion A**: el usuario ve la respuesta en streaming, y cuando exporta a PDF/HTML, el sistema aplica E6 sobre el texto completo antes de renderizar.

---

## Coste por consulta

| Experto | Modelo | Tokens in | Tokens out | Coste |
|---------|--------|-----------|------------|-------|
| E1 | gpt-4o-mini | 500 | 200 | $0.0001 |
| E2 | (sin LLM) | 0 | 0 | $0.00 |
| E3 | gpt-4o-mini | 8.000 | 1.000 | $0.002 |
| E4 | gpt-4o-mini | 3.000 | 500 | $0.001 |
| E5 | o3 | 6.000 | 4.000 | $0.06 |
| E6 | gpt-4o-mini | 5.000 | 800 | $0.001 |
| **Total** | | | | **~$0.064** |

Coste similar al monolitico actual (~$0.06-0.08) pero con resultados trazables y PDF profesional.

---

## Implementacion Tecnica

### Archivo: `supabase/functions/chat-intelligence/index.ts`

**Nuevas funciones:**

1. `runClassifier(question, companiesCache, conversationHistory, language)` -- Reemplaza `detectCompaniesInQuestion` + `categorizeQuestion`

2. `buildDataPack(classifierResult, supabaseClient)` -- Reutiliza queries existentes (`fetchUnifiedRixData`, `findCompetitors`, etc.)

3. `extractQualitativeFacts(rawTexts, dataPack)` -- Extrae hechos de textos brutos con atribucion por modelo

4. `runComparator(dataPack, qualitativeFacts, classifierResult)` -- Cruza datos cuantitativos + cualitativos

5. `orchestrateResponse(allArtifacts, question, role, language)` -- Redacta informe con prompt reducido (~80 lineas), streaming

6. `formatForExport(rawMarkdown, classifierResult, dataPack)` -- E6: optimiza markdown para renderizado PDF/HTML. Se ejecuta post-streaming para exportacion

**Funciones que se simplifican o eliminan:**

- `detectCompaniesInQuestion` -- Reemplazada por E1
- `categorizeQuestion` -- Reemplazada por E1
- `buildDepthPrompt` -- El Embudo Narrativo completo (~150 lineas) se reduce a ~30 lineas en E5
- System prompt monolitico (~500 lineas) se distribuye entre los 6 expertos (~80 lineas cada uno)

**Funciones que se mantienen:**

- `fetchUnifiedRixData` -- Usada por E2
- `findCompetitors` -- Usada por E2
- Compliance gate (forbidden patterns) -- Aplicado sobre salida de E5
- SSE streaming -- Aplicado solo a E5
- Bulletin mode -- Se mantiene como flujo separado

### Archivo: `src/contexts/ChatContext.tsx`

- Sin cambios funcionales. El frontend sigue enviando la misma request y recibiendo SSE.
- La exportacion PDF/HTML aplica E6 antes de llamar a `markdownToHtml.ts`.

### Archivo: `src/lib/markdownToHtml.ts`

- Sin cambios. El maquetador E6 produce markdown compatible con el renderizador existente.
- Los estilos CSS (section-bands, emoji-metrics-tables, keyword highlighting) ya estan implementados.

---

## Como E6 resuelve el problema de "pintar" la salida

Actualmente, el LLM monolitico intenta simultáneamente analizar datos Y formatear markdown editorial. Esto genera conflictos:

| Problema actual | Solucion con E6 |
|----------------|-----------------|
| Tablas de metricas como bullets desordenados | E6 las convierte en tablas markdown que el CSS renderiza con zebra striping |
| Headers decorativos (====) inconsistentes | E5 usa ## y ###; E6 inserta --- donde corresponde para section-bands |
| Listas de scores sin alineacion visual | E6 formatea como "1. Metrica -- valor emoji" para emoji-metrics-table |
| Rankings como parrafos narrativos | E6 los convierte en tablas comparativas |
| Notas metodologicas ausentes o excesivas | E6 distribuye max 3-4 blockquotes estrategicamente |
| Formato rigido independiente del contenido | E6 adapta: comparativa = mas tablas, evolucion = tabla temporal, general = sin pilares |

El resultado es que cada PDF exportado tiene una maquetacion ADAPTADA al tipo de consulta y al contenido real, no una plantilla rigida que encorseta informes de 500 palabras igual que informes de 4.000.

---

## Mitigacion de Riesgos

| Riesgo | Mitigacion |
|--------|-----------|
| Latencia adicional de E6 (~3s) | E6 se aplica post-streaming, no bloquea la experiencia del usuario en chat |
| E6 modifica contenido por accidente | Prompt explicito: "NO cambies contenido, cifras ni redaccion" + validacion post |
| Fallo en experto intermedio | Fallback: si E3/E4 fallan, E5 recibe solo DataPack. Si E6 falla, se usa markdown de E5 sin formatear |
| Coste mayor (6 llamadas LLM) | E1, E3, E4, E6 usan gpt-4o-mini. Solo E5 usa o3. Coste total similar |
| Complejidad de mantenimiento | Cada experto es una funcion independiente con prompt corto y testeable |
| Perdida de contexto conversacional | Historial se pasa a E1 (clasificacion contextual) y E5 (continuidad narrativa) |

## Criterios de Aceptacion

1. Toda cifra en la respuesta final es trazable al DataPack (E2)
2. Toda mencion tematica es trazable a hechos cualitativos (E3) con atribucion de modelo
3. El consenso entre IAs se refleja explicitamente ("5/6 modelos coinciden...")
4. Toda recomendacion es trazable al analisis comparativo (E4)
5. No aparecen fabricaciones (WACC, CAPEX, VAN, "GRUPO ALPHA")
6. El PDF exportado tiene section-bands, tablas editoriales y emoji-metrics alineados
7. Preguntas generales producen respuestas focalizadas sin pilares forzados
8. Comparativas producen tablas lado a lado, no parrafos narrativos
9. Latencia total menor a 35 segundos
10. Logs muestran los 6 artefactos intermedios para auditoria

## Orden de Implementacion

1. Crear E1 (clasificador) + tests con preguntas reales
2. Crear E2 (DataPack) reutilizando queries existentes
3. Crear E3 (lector cualitativo) + validar contra textos reales
4. Crear E4 (comparador) + validar contra DataPack real
5. Crear E5 (orquestador) con prompt reducido
6. Crear E6 (maquetador) con conocimiento del CSS de `markdownToHtml.ts`
7. Integrar pipeline completo en `handleStandardChat`
8. Mantener modo bulletin como flujo separado
9. Testing end-to-end con 5 tipos de pregunta: empresa, sector, comparativa, metodologia, general

