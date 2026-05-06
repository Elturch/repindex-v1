## Problema

En `/informes`, los filtros **Top N** y **¿Qué quieres ver?** (orden) aparecen siempre con valores por defecto (`10` y `mejores`). Esto provoca dos efectos no deseados:

1. Aunque el usuario no toque esos filtros, la pregunta compilada siempre añade `"limitado a las 10 mejores"` (ver `compileQuestion.ts` líneas 61-73), contaminando consultas que no lo necesitan (visión general, divergencia, etc.).
2. Tras generar un informe, al volver al panel los campos no se reinician — el usuario arrastra elecciones residuales a la siguiente consulta.

## Cambios

### 1. `src/lib/reports/filterState.ts`
- `topN` por defecto: valor lógico `10` pero `origin: "free"` (ya está) — añadir bandera para que la UI lo muestre vacío hasta que el usuario lo toque.
- `order` por defecto: igual, mantener `"desc"` interno pero tratar como no-establecido si `origin === "free"`.
- Confirmar que `createInitialFilterState()` deja todo como `free`.

### 2. `src/lib/reports/compileQuestion.ts`
Sólo emitir la cláusula `"limitado a las N {mejores|peores|divergentes}"` cuando:
- `intent === "ranking"` (donde Top N es intrínseco), **o**
- `state.topN.origin === "user-set"` o `state.order.origin === "user-set"`.

En el resto de intents (visión general, comparativa, evolución, divergencia, perfil), si el usuario no fija explícitamente Top N u orden, **no** se añade la cláusula.

### 3. `src/components/reports/FilterPanel.tsx`
- **Top N**: input vacío (placeholder `"Top N (opcional)"`) cuando `origin === "free"`. Al escribir, pasa a `user-set`. Botón pequeño "limpiar" para volver a `free`.
- **¿Qué quieres ver?**: Select con placeholder `"— sin restricción —"` cuando `origin === "free"`. Añadir opción "Sin restricción" que devuelve a `free`.
- Mantener visibilidad por intent (sigue oculto en `perfil`, `evolucion`, etc.).

### 4. `src/pages/RixReports.tsx`
Tras generar un informe (botón "Generar informe", justo después de `navigate("/visor", …)`), resetear el estado:
```
setState(createInitialFilterState());
```
Así, cuando el usuario vuelve a `/informes`, encuentra el panel limpio. La rehidratación desde "Editar filtros" del visor sigue funcionando (usa `location.state.prefilFilters`).

### 5. `src/lib/reports/coherenceEngine.ts`
Regla R10 (Top N > scope): sólo emitir el aviso si `topN.origin === "user-set"` (ya no aplica si está libre).

## Validación

- Generar consulta de visión general IBEX-35 sin tocar Top N / orden → la pregunta compilada **no** debe contener `"limitado a las 10 mejores"`.
- Generar ranking IBEX-35 sin tocar Top N → sigue aplicándose Top N por defecto (10 mejores) porque el intent lo exige.
- Tras pulsar "Generar informe" y volver a `/informes` → panel completamente vacío (todos `free`).
- Editar filtros desde el visor → estado rehidratado correctamente, los `user-set` se conservan.

## Fuera de alcance

- Cambios en el backend / `chat-intelligence-v2`.
- Cambios en otros filtros (modelos, ventana temporal, granularidad).
