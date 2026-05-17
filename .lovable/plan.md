# Re-anclaje de fechas en "Regenerar informe" (opción B)

Al abrir el diálogo de regenerar, los 11 filtros se cargan exactamente como en el informe original. Solo el bloque de fechas mostrará un aviso sugerido si el preset relativo (`last_week` / `last_month` / `last_quarter` / `ytd`) ya no apunta al último barrido disponible. El usuario decide pulsando.

## Comportamiento

- Si `window.preset === "custom"` → nunca se sugiere nada (el usuario eligió fechas explícitas).
- Si el preset es relativo y `window.value.to !== lastBatchDate` → mostrar chip discreto bajo el bloque de fechas:
  *"📅 Actualizar al último barrido (DD/MM/YYYY)"* como botón secundario pequeño.
- Al pulsar: recalcular `from`/`to` según el preset, anclado a `lastBatchDate`, y marcar el filtro como `user-set` (decisión explícita del usuario).
- Si las fechas ya están al día, no se muestra nada → cero ruido visual.
- El resto de filtros (universo, sector, modelos, métricas, Top N, orden, source tier, granularidad, intent) se cargan tal cual, sin tocar su `origin`.

## Cambios técnicos

1. **`src/components/reports/RegenerateDialog.tsx`**
   - Recibir `lastBatchDate` (ya lo recibe) y calcular `needsReanchor` con un helper local.
   - Pasar `lastBatchDate` + callback `onReanchorWindow` a `FilterPanel` (o renderizar el chip directamente encima del panel — preferible mantenerlo en el bloque de fechas).

2. **`src/components/reports/FilterPanel.tsx`** (o el `FilterBlock` específico de fechas)
   - Dentro del bloque "Ventana temporal", si `lastBatchDate` y preset relativo y `to !== lastBatchDate`: renderizar un `<Button variant="outline" size="sm">` con icono `Calendar` y texto *"Actualizar a {DD/MM}"*.
   - Handler: recomputar `{from, to}` según preset usando `lastBatchDate` como ancla y llamar `setFilter(state, "window", newWindow, "user-set")`.

3. **Helper `reanchorWindow(preset, lastBatchDate)`** en `src/lib/reports/filterState.ts`
   - `last_week` → from = lastBatchDate - 6d, to = lastBatchDate
   - `last_month` → from = lastBatchDate - 29d, to = lastBatchDate
   - `last_quarter` → from = lastBatchDate - 89d, to = lastBatchDate
   - `ytd` → from = `${year}-01-01`, to = lastBatchDate

## Fuera de alcance

- No se toca `RixReports.tsx` (el flujo de creación nueva ya re-ancla solo).
- No se modifica el motor de coherencia ni `compileQuestion`.
- No se altera el resto de filtros en ningún caso.
