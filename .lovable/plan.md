

# Plan: Enriquecer Recomendaciones con Datos Reales y Razonamiento

## El problema

Las recomendaciones del informe final son pobres o inexistentes porque:

1. **E2 (DataPack) solo trae el RIX promedio de cada competidor** — no trae las 8 metricas desglosadas (NVM, DRM, SIM, etc.) de los competidores verificados. Sin ese desglose, es imposible saber "tu Autoridad de Fuentes esta 18 pts por debajo de Telefonica".

2. **E4 (Comparador) esta limitado a 4 recomendaciones y 1.000 tokens** — no tiene espacio para razonar con profundidad. Ademas, sin metricas de competidores, solo puede comparar contra un promedio generico.

3. **E5 (Orquestador) tiene prohibido razonar** — la regla "Toda recomendacion debe existir en ANALISIS. No inventes nuevas" impide que E5 use su capacidad de razonamiento para proponer soluciones basadas en los gaps que ve en los datos.

## La solucion

### 1. E2: Traer metricas desglosadas de competidores verificados

Actualmente (linea 1147) E2 solo pide `09_rix_score` para competidores. Ampliar la query para traer tambien las 8 metricas:

```text
Antes:  columns = "03_target_name", "05_ticker", "09_rix_score", batch_execution_date
Despues: columns = "03_target_name", "05_ticker", "09_rix_score", 
         "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score",
         "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score",
         batch_execution_date
```

Esto permite calcular:
- Media por metrica de los competidores verificados
- Gap empresa vs competidores en CADA metrica (no solo RIX global)
- Identificar exactamente DONDE esta el gap mas grande

Nuevo campo en DataPack:
```text
competidores_metricas_avg: {
  nvm: number | null, drm: number | null, sim: number | null, rmm: number | null,
  cem: number | null, gam: number | null, dcm: number | null, cxm: number | null
}
```

### 2. E4: Ampliar capacidad de analisis

- Subir max_tokens de 1.000 a 2.000 para dar espacio al razonamiento
- Subir limite de recomendaciones de 4 a 6
- Incluir en el prompt de E4 los gaps por metrica vs competidores (dato nuevo de E2)
- Anadir campo `razonamiento` a cada recomendacion: por que esta accion mejoraria esta metrica, basado en que evidencia
- Anadir campo `prioridad` (alta/media/baja) basado en el tamano del gap

Nueva estructura de recomendacion en E4:
```text
{
  "accion": "Mejorar la trazabilidad de fuentes primarias",
  "metrica_objetivo": "SIM (Autoridad de Fuentes)",
  "gap_numerico": "-18 pts vs competidores",
  "basado_en": "Solo 2/6 IAs encuentran fuentes institucionales",
  "razonamiento": "Los competidores (TEF, IBE) tienen SIM 70+ porque sus informes anuales estan indexados...",
  "prioridad": "alta"
}
```

### 3. E5: Permitir razonamiento propio basado en datos

Cambiar la regla restrictiva:

```text
Antes:  "Toda recomendacion debe existir en ANALISIS. No inventes nuevas."
Despues: "Las recomendaciones del ANALISIS son tu base. Puedes RAZONAR sobre ellas, 
          ampliarlas y conectarlas con los datos del DATAPACK para proponer soluciones 
          concretas. Pero TODA solucion debe estar anclada en un gap numerico real. 
          NUNCA inventes metricas, cifras ni herramientas que no esten en los datos."
```

Esto permite a E5:
- Tomar una recomendacion de E4 ("Mejorar SIM, gap -18") y RAZONAR sobre ella
- Conectarla con datos del memento, noticias, evolución temporal
- Proponer soluciones concretas ("Si tu SIM paso de 35 a 42 en 3 semanas tras publicar el informe anual, la estrategia de publicacion de documentos trazables funciona")
- Sin inventar DOIs, convenios ni KPIs ficticios

### 4. Inyectar datos de competidores en el userPrompt de E5

Anadir al bloque DATAPACK que recibe E5 los promedios por metrica de competidores:

```text
competidores_metricas_avg: {nvm: 68, drm: 72, sim: 65, rmm: 58, cem: 71, gam: 64, dcm: 69, cxm: 61}
```

Esto da a E5 la materia prima para escribir cosas como: "Tu Autoridad de Fuentes (42 pts) esta 23 puntos por debajo del promedio de tus competidores directos (65 pts). Solo Gemini y Perplexity encuentran fuentes institucionales de Aena, mientras que para Telefonica las 6 IAs localizan documentos regulatorios."

## Archivo modificado

`supabase/functions/chat-intelligence/index.ts`:

1. **DataPack interface** (linea 996): Anadir `competidores_metricas_avg`
2. **buildDataPack E2** (linea 1143-1191): Ampliar query de competidores para traer 8 metricas, calcular promedios por metrica
3. **ComparatorResult interface** (linea 1341): Ampliar estructura de recomendaciones con `razonamiento` y `prioridad`
4. **runComparator E4** (linea 1350): Subir tokens a 2.000, incluir gaps por metrica en prompt, ampliar a 6 recomendaciones
5. **buildOrchestratorPrompt E5** (linea 1459): Cambiar regla restrictiva por regla de razonamiento anclado, inyectar `competidores_metricas_avg` en userPrompt

## Resultado esperado

| Antes | Despues |
|-------|---------|
| "Mejorar SIM" (sin contexto) | "Tu Autoridad de Fuentes (42) esta 23 pts bajo tus competidores (65). Las IAs no encuentran documentos regulatorios trazables. La subida de 35 a 42 tras el ultimo informe anual sugiere que la publicacion sistematica de documentos indexables es la palanca mas efectiva." |
| Sin comparativa por metrica | Tabla: Empresa vs Media Competidores en cada metrica, con gaps y semaforos |
| E5 repite lo de E4 sin anadir valor | E5 conecta gaps con tendencias temporales, noticias y memento para proponer soluciones razonadas |
| 4 recomendaciones escuetas | 6 recomendaciones con razonamiento, prioridad y evidencia cruzada |

