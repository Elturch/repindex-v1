## Problema

En el panel "Métricas a analizar" (y en el chip "Solo RIXc") los usuarios sólo ven las siglas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM). Hoy hay un `title=""` HTML nativo con una palabra (p.ej. "Visibilidad"), insuficiente y poco visible. Mucha gente no sabe qué mide cada inicial.

## Propuesta

Sustituir el `title` HTML por un **tooltip enriquecido (shadcn `Tooltip`)** que aparezca al pasar el ratón sobre cada chip de métrica, con:

1. **Nombre completo** de la métrica (sigla → expansión).
2. **Descripción corta** (1 línea) de qué mide.
3. Mismo tooltip aplicado al botón **"Solo RIXc"** y al botón **"Todas"** (con texto explicativo simple).

Diseño visual: usa el `Tooltip` ya existente (`src/components/ui/tooltip.tsx`), respetando tokens semánticos (sin colores hardcoded).

### Contenido propuesto por métrica

| Sigla | Nombre completo | Descripción corta |
|---|---|---|
| RIXc | RepIndex Composite | Índice compuesto de reputación algorítmica (agrega las 8 métricas). |
| NVM | Narrative Visibility Metric | Cuánto aparece la entidad en respuestas de los modelos. |
| DRM | Disagreement & Risk Metric | Riesgo reputacional y desacuerdo entre modelos. |
| SIM | Sentiment Intensity Metric | Tono y polaridad del sentimiento generado. |
| RMM | Reputational Mention Metric | Calidad y contexto de las menciones de marca. |
| CEM | Citation & Evidence Metric | Engagement / evidencias citadas por los modelos. |
| GAM | Governance Alignment Metric | Alineación con buen gobierno y ESG-G. |
| DCM | Diversity & Coverage Metric | Diversidad de fuentes y cobertura temática. |
| CXM | Customer Experience Metric | Experiencia de cliente percibida (sólo aplicable a empresas B2C; "N/A" en otras). |

> Los nombres completos los confirma el usuario antes de implementar (ver Pregunta).

## Archivos a tocar

- `src/components/reports/FilterPanel.tsx`
  - Ampliar el array `METRICS` añadiendo `fullName` y `description`.
  - Envolver cada chip de métrica en `<Tooltip><TooltipTrigger asChild>…</TooltipTrigger><TooltipContent>…</TooltipContent></Tooltip>`.
  - Quitar el `title={m.hint}` (sustituido por el tooltip).
  - Envolver también los botones "Todas" y "Solo RIXc" con su tooltip.
  - Asegurar que existe un `<TooltipProvider>` arriba (si no, añadirlo localmente alrededor del bloque de métricas).

No se tocan otros filtros, ni backend, ni el chat. Sólo presentación en el FilterPanel.

## Fuera de alcance

- Tooltips en otras zonas (radar, tablas de informe, chat). Se puede hacer en una iteración posterior.
- Cambios en el motor de informes o lógica de métricas.

## Pregunta abierta

Confirmar las **expansiones de las siglas** y los **textos cortos** de la tabla anterior antes de codificar (o aprobar tal cual).
