## Fix: Universo se auto-marca con IBEX-35 y limita los sectores

### Causa raíz
`runCoherence` en `coherenceEngine.ts` deriva `universe = ["IBEX-35"]` automáticamente desde tickers/sector. Una vez derivado, `FilterPanel` lo aplica como filtro vinculante, dejando solo 1 empresa visible al elegir "Salud y Farmacéutico" (solo ROVI está en IBEX-35).

### Cambios

**1. `src/lib/reports/coherenceEngine.ts`**
- **R1 (tickers→universo)**: solo derivar `universe` si los tickers seleccionados cubren un único `ibex_family_code`. Si hay varios, no derivar.
- **R2 (sector→universo)**: mantener la derivación solo cuando el sector contiene un único universo. Si el usuario marca un `sector` user-set que abarca múltiples universos y `universe` está `derived`, resetear `universe` a `free` con `[]`.
- **`getScopeTickers` y `computeScopeSize`**: aplicar el filtro `universe` solo cuando `state.universe.origin === "user-set"`. Los valores `derived` se ignoran al calcular el alcance.

**2. `src/components/reports/FilterPanel.tsx`**
- En `sectorOptions` y `tickerOptions`: aplicar el filtro por `universe` solo si `state.universe.origin === "user-set"`. Así el usuario ve todas las empresas del sector elegido (16 en Salud) en lugar de solo las del IBEX-35.

### Lo que NO se toca
`compileQuestion.ts`, `reportMemory.ts`, `RixViewer.tsx`, `ChatContext.tsx`, `LivePreview.tsx`, esquema DB, edge functions.

### Resultado esperado
- Elegir "Salud y Farmacéutico" → aparecen las 16 empresas del sector, sin filtrado fantasma por IBEX-35.
- El chip de Universo solo se marca como `user-set` cuando el usuario lo elige explícitamente, o como `derived` cuando todas las entidades coinciden en un único universo.
- Las advertencias R8/R10/R12 siguen funcionando.
