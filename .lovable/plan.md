## Problema

El Visor compila preguntas que el Agente RIX V2 rechaza siempre que el usuario deja la métrica por defecto:

> "ranking **de la métrica RIXc** … con desglose semanal."

El agente responde que **"RIXc" no forma parte de las 8 métricas canónicas** (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM) y aborta el informe.

### Causa

1. `src/lib/reports/filterState.ts` declara `AxisMetric = "RIXc" | NVM | …` y fija `axisMetrics` por defecto a `["RIXc"]`.
2. `src/components/reports/FilterPanel.tsx` ofrece `RIXc` como opción visible y como botón "Solo RIXc".
3. `src/lib/reports/compileQuestion.ts` lo emite literalmente como `"de la métrica RIXc"`.
4. RIXc Lite vive en fase silenciosa (tabla `rix_composite_scores`, panel admin) — el chat público **no lo conoce**. El agente sólo entiende las 8 métricas canónicas o la puntuación global RIX (`09_rix_score`).

Resultado: cualquier consulta del Visor con la métrica por defecto se rechaza.

---

## Plan

Sustituir la etiqueta/valor `RIXc` por **`RIX`** (puntuación RIX global), que es lo que el agente sí entiende y lo que conceptualmente espera el usuario al pedir un "ranking general".

### 1. `src/lib/reports/filterState.ts`
- Cambiar el tipo:
  ```ts
  export type AxisMetric = "RIX" | "NVM" | "DRM" | "SIM" | "RMM" | "CEM" | "GAM" | "DCM" | "CXM";
  ```
- En la lista `AXIS_METRICS_ALL`: reemplazar `"RIXc"` por `"RIX"`.
- En `createInitialFilterState()`: `axisMetrics: free<AxisMetric[]>(["RIX"])`.

### 2. `src/components/reports/FilterPanel.tsx`
- En `AXIS_METRIC_OPTIONS`: `{ value: "RIX", label: "RIX", hint: "Puntuación RIX global" }`.
- Botón "Solo RIXc" → "Solo RIX" y `setFilter(state, "axisMetrics", ["RIX"])`.
- Fallback `next.length === 0 ? ["RIX"] : next`.

### 3. `src/lib/reports/compileQuestion.ts`
- Cuando la única métrica seleccionada sea `"RIX"`, emitir:
  ```
  "del índice RIX global"
  ```
  en vez de `"de la métrica RIX"`. Esto evita que el agente interprete RIX como una métrica canónica inexistente y lo enruta a su lógica de score agregado (`09_rix_score`).
- Cuando haya varias métricas y entre ellas esté `"RIX"`, mantener la frase actual pero excluir `RIX` de la lista de métricas y añadir "incluyendo el índice RIX global".

### 4. Sin cambios en backend
- El agente V2 ya sabe responder por `09_rix_score`; no se toca `chat-intelligence-v2`.
- RIXc Lite (admin/fase silenciosa) sigue intacto, sólo se elimina del Visor público.

### Fuera de alcance
- Que el sector "Consultoría y Auditoría" tenga o no observaciones en el rango: depende del DataPack y no del Visor. La rama de respuesta "no hay datos" del agente es la correcta cuando ocurra.
- El anclaje de fechas a `lastBatchDate` ya se aplicó en la iteración anterior; este plan no lo revisita.

### Validación
- Recargar `/visor`: el chip por defecto debe leer **RIX** (no RIXc).
- Pulsar "Generar informe" sin tocar nada: la pregunta compilada debe contener `"del índice RIX global"` y el agente debe devolver un ranking, no un rechazo por métrica desconocida.
