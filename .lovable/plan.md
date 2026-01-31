
# Plan: Actualizar Descripción de DCM con Foco en Datos Estructurales e Impacto Reputacional

## Objetivo

Mejorar la descripción de DCM (Data Consistency Metric) para que:
1. Especifique qué datos estructurales se evalúan (actividad, liderazgo, estructura corporativa, relaciones)
2. Liste explícitamente los 6 modelos analizados
3. Conecte la inconsistencia con el impacto reputacional ("erosiona credibilidad y debilita el edificio reputacional")

## Cambios Propuestos

### Cambio 1: Actualizar `executiveDescription` de DCM

**Archivo**: `src/lib/rixMetricsGlossary.ts`
**Ubicación**: Línea 140

| Campo | Valor Actual | Valor Nuevo |
|-------|--------------|-------------|
| `executiveDescription` | "Evalúa la consistencia de la información sobre la empresa entre diferentes modelos de IA. Un DCM alto indica que ChatGPT, Gemini, Perplexity, etc. citan datos coherentes entre sí." | "Mide la coherencia de los datos estructurales clave de la empresa (actividad, liderazgo, estructura corporativa, relaciones) entre los 6 modelos de IA analizados (ChatGPT, Gemini, Perplexity, DeepSeek, Grok, Qwen). Un DCM alto indica que los modelos coinciden en los hechos fundamentales. La inconsistencia en estos datos erosiona la credibilidad y debilita el resto del edificio reputacional algorítmico." |

### Cambio 2: Actualizar `technicalDescription` de DCM

**Archivo**: `src/lib/rixMetricsGlossary.ts`
**Ubicación**: Línea 138

| Campo | Valor Actual | Valor Nuevo |
|-------|--------------|-------------|
| `technicalDescription` | "DCM = 1 - (σ_intermodelo / μ_intermodelo). Mide coherencia de información sobre la empresa entre diferentes modelos de IA (nombres, fechas, roles, cifras)." | "DCM = 1 - (σ_intermodelo / μ_intermodelo). Evalúa coherencia de datos estructurales (actividad principal, liderazgo ejecutivo, estructura accionarial, relaciones corporativas) entre los 6 modelos. Factores: coincidencia en CEO/presidente, sector declarado, fechas de fundación, cifras de empleados, principales accionistas." |

### Cambio 3: Actualizar `mappingJustification` de DCM

**Archivo**: `src/lib/rixMetricsGlossary.ts`
**Ubicación**: Línea 141

| Campo | Valor Actual | Valor Nuevo |
|-------|--------------|-------------|
| `mappingJustification` | "El nombre ejecutivo 'Coherencia Informativa' refleja que esta métrica mide consistencia entre modelos, NO capacidad digital ni innovación tecnológica." | "El nombre ejecutivo 'Coherencia Informativa' refleja que esta métrica mide estabilidad de datos estructurales clave entre modelos de IA. La inconsistencia en información fundamental (liderazgo, actividad, estructura) erosiona la credibilidad y debilita las demás métricas reputacionales. NO mide capacidad digital ni innovación tecnológica." |

### Cambio 4: Actualizar el prompt del glosario para LLMs

**Archivo**: `src/lib/rixMetricsGlossary.ts`
**Ubicación**: Función `getMetricsGlossaryPrompt()` (línea 213)

Añadir clarificación específica para DCM:

```
- **DCM** NO mide innovación digital. Mide COHERENCIA DE DATOS ESTRUCTURALES 
  (actividad, liderazgo, estructura, relaciones) entre los 6 modelos de IA. 
  La inconsistencia erosiona credibilidad.
```

## Archivos a Modificar

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `src/lib/rixMetricsGlossary.ts` | Actualizar `technicalDescription`, `executiveDescription` y `mappingJustification` de DCM | 138-141 |
| `src/lib/rixMetricsGlossary.ts` | Actualizar error común de DCM en `getMetricsGlossaryPrompt()` | 213 |

## Resultado

La página de Metodología (`/metodologia`) se actualizará automáticamente porque consume el glosario canónico. La card de DCM mostrará la nueva descripción que conecta:

1. **Qué datos**: actividad, liderazgo, estructura corporativa, relaciones
2. **Entre quiénes**: los 6 modelos (ChatGPT, Gemini, Perplexity, DeepSeek, Grok, Qwen)
3. **Por qué importa**: la inconsistencia erosiona credibilidad y debilita el edificio reputacional

## Impacto en Otros Componentes

| Componente | Efecto |
|------------|--------|
| `GlossaryDialog` | Se actualiza automáticamente |
| Página Metodología | Se actualiza automáticamente |
| Prompts del Agente Rix | Se actualizan vía `getMetricsGlossaryPrompt()` |
| Reportes PDF | Se actualizan vía `getMetricDefinitionsForAnnex()` |
