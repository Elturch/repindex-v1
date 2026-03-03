

# Diagnostico del informe IBEX-35 del 03/03/2026

## Lo que ha fallado (3 fallos distintos)

### Fallo 1: El informe es un listado, no un analisis

El informe tiene ~1.000 palabras y es basicamente una enumeracion: Top-5, Bottom-5, Scorecard Sectorial, Radar de Riesgos, Recomendaciones. No hay desarrollo analitico, no hay interpretacion por metrica, no hay tablas comparativas, no hay explicacion de POR QUE cada empresa sube o baja.

**Causa raiz:** Para consultas de indice (Route B), los datos cualitativos son CERO:
- `dataPack.raw_texts` esta vacio (no hay textos brutos de IAs para "el IBEX-35")
- E3 (`extractQualitativeFacts`) recibe 0 textos y devuelve `null` (linea 2098)
- E4 (`runComparator`) recibe facts=null pero SI tiene snapshot — genera un JSON de fortalezas/debilidades generico
- E5 (Orquestador) recibe `HECHOS: null`, `ANALISIS: casi vacio`, y un DATAPACK con ranking + snapshot

Sin E3 ni E4 con sustancia, el LLM no tiene "carne" cualitativa para desarrollar un informe denso. Solo tiene numeros, asi que los lista.

### Fallo 2: Deltas por empresa fabricados

El informe dice "Banco Santander +3.2 pts", "Grifols -4.1 pts". Estos deltas POR EMPRESA no existen en el DataPack. La evolucion (linea 1686-1702) solo calcula deltas AGREGADOS del indice completo, no por empresa. El LLM invento los deltas individuales.

### Fallo 3: Secciones fabricadas siguen colándose

- "Radar de Riesgos Inminentes" con "nuevo gravamen fiscal 2026", "subidas del BCE"
- "Recomendaciones de Posicionamiento" con "narrativa fintech", "compromisos ESG externos"
- Ningun dato del DataPack respalda estas afirmaciones

Ademas, `handleEnrichRequest` (linea 4481) todavia dice "Pilar 1 → Pilar 2 → Pilar 3".

---

## Solucion: 4 cambios en `chat-intelligence/index.ts`

### Cambio 1: Enriquecer Route B con datos cualitativos por empresa

Actualmente Route B solo recopila metricas numericas. Hay que incluir tambien las columnas cualitativas de las empresas top-5 y bottom-5 para que E3 tenga material:

- Añadir a `indexColumns` las columnas: `"10_resumen"`, `"11_puntos_clave"`, `"22_explicacion"`, `"25_explicaciones_detalladas"`
- Tras identificar top-5 y bottom-5, extraer sus textos brutos y poblar `dataPack.raw_texts`, `dataPack.explicaciones_metricas` y `dataPack.puntos_clave`
- Asi E3 tendra textos reales de 10 empresas para analizar temas, consensos y divergencias

### Cambio 2: Calcular deltas POR EMPRESA (no solo agregado)

En la seccion de evolucion (lineas 1686-1702), ademas del delta global, calcular el delta semanal de cada empresa del ranking comparando su RIX de la ultima semana con la penultima. Inyectar este dato en `pack.ranking` como campo `delta`.

Asi el LLM tendra deltas reales por empresa y no necesitara inventarlos.

### Cambio 3: Añadir FORBIDDEN_PATTERNS para contenido restante

Patrones que faltan y que el informe actual demuestra que se cuelan:

```text
/radar\s+de\s+riesgos/i
/riesgos?\s+inminentes?/i
/recomendaciones?\s+de\s+posicionamiento/i
/gravamen\s+fiscal/i
/subidas?\s+(?:adicionales?\s+)?del\s+bce/i
/investor\s+day/i
/campana\s+de\s+verano/i
/narrativa\s+fintech/i
/compromisos?\s+esg\s+externos?/i
/reservas?\s+anticipadas?/i
```

### Cambio 4: Limpiar referencia a "Pilares" en handleEnrichRequest

Linea 4481: cambiar `"ESTRUCTURA EMBUDO — Resumen → Pilar 1 → Pilar 2 → Pilar 3 → Cierre"` por `"ESTRUCTURA — Resumen Ejecutivo → Análisis de Datos → Contexto Competitivo → Cierre"`.

---

## Resumen de impacto

| Cambio | Que resuelve | Riesgo |
|--------|-------------|--------|
| Datos cualitativos en Route B | E3/E4 tendran material real → informes con profundidad | Medio: mas columnas en query, controlar tamano |
| Deltas por empresa | Elimina deltas fabricados | Bajo: calculo determinista |
| FORBIDDEN_PATTERNS | Bloquea "Radar de Riesgos", "Recomendaciones de Posicionamiento" | Bajo: solo regex |
| Limpiar Pilares en enrich | Elimina ultima referencia a estructura obsoleta | Bajo: solo texto |

