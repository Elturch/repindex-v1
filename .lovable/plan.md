## Objetivo
Cuando el usuario abre "Regenerar informe" desde el Visor, las fechas por defecto deben anclarse al **último barrido canónico disponible** y hacia atrás según el preset del informe original, en lugar de reusar las fechas (potencialmente desfasadas) del informe guardado.

## Comportamiento actual
`RegenerateDialog` re-siembra su estado local con `initialFilters` cada vez que se abre (efecto sobre `open`). Esos `initialFilters` vienen del informe guardado, así que si el informe se generó hace semanas, la ventana sigue terminando en la fecha vieja aunque ya haya barridos posteriores.

## Comportamiento propuesto
Al abrir el diálogo:

- Si `window.preset !== "custom"` y existe `lastBatchDate`, reanclar la ventana con `reanchorWindow(window, lastBatchDate)` (ya disponible en `src/lib/reports/filterState.ts`). Esto fija `to = lastBatchDate` y recalcula `from` según el preset (last_week / last_month / last_quarter / ytd).
- Si `preset === "custom"`, **no tocar** las fechas — el usuario las fijó explícitamente en el informe original.
- Si no hay `lastBatchDate` aún (query cargando), mantener el comportamiento actual.

Marcar el origin de la ventana reanclada como `"derived"` para indicar que viene del último barrido (consistente con cómo `RixReports.tsx` re-ancla el preset por defecto).

## Cambios

**Único archivo tocado: `src/components/reports/RegenerateDialog.tsx`**

En el `useEffect` que actualmente hace `setState(initialFilters)` cuando `open` cambia, añadir el reanclado:

```ts
useEffect(() => {
  if (!open) return;
  let seeded = initialFilters;
  if (lastBatchDate && initialFilters.window.value.preset !== "custom") {
    const reanchored = reanchorWindow(initialFilters.window.value, lastBatchDate);
    if (
      reanchored.from !== initialFilters.window.value.from ||
      reanchored.to !== initialFilters.window.value.to
    ) {
      seeded = setFilter(initialFilters, "window", reanchored, "derived");
    }
  }
  setState(seeded);
}, [open, initialFilters, lastBatchDate]);
```

Imports añadidos desde `@/lib/reports/filterState`: `reanchorWindow`, `setFilter`.

## Fuera de alcance
- No se toca `RixReports.tsx` (ya reancla correctamente para informes nuevos).
- No se toca el `FilterPanel`, ni la lógica de coherencia, ni `compileQuestion`.
- No se cambia el comportamiento cuando el preset es `custom` (fechas explícitas del usuario se respetan).
- No se modifica nada en backend / prompts / V2 (bloque ajeno a las reglas R20-R25).