## Objetivo

Hacer que el panel de Stress Tests responda de un vistazo a la pregunta "¿esto está mejor que antes o no?", añadiendo (a) comparativa contra el run anterior y (b) un resumen ejecutivo automático del run seleccionado.

## Cambios en `src/components/admin/StressTestsPanel.tsx`

### 1. Cargar el run anterior comparable
- Al seleccionar un run, cargar también el último run previo con la **misma `family`** (`stress_runs` ordenado por `started_at desc`, primer registro con `started_at < seleccionado.started_at`).
- Cargar sus `stress_results` en paralelo (`prevResults`).
- Indexar ambos resultados por clave `case_id` (incluye scope + model_filter, ya es único en la matriz).

### 2. Calcular delta por celda
Para cada `case_id` presente en run actual o anterior, clasificar:
- `fixed`: antes fail/error → ahora pass.
- `regressed`: antes pass → ahora fail/error.
- `still_failing`: fail/error en ambos.
- `still_passing`: pass en ambos.
- `new`: sólo existe en el actual.
- `removed`: sólo existe en el anterior.

Y por **assert_id**: contar fallos en cada run y sacar `delta = fails_now − fails_prev`.

### 3. Tarjeta "Resumen ejecutivo" (arriba del heatmap)
Mostrar, en lenguaje claro y sin jerga:
- Veredicto global de una línea: `Mejora` / `Sin cambios` / `Regresión` con icono y color, según `passed_now − passed_prev`.
- KPIs grandes: `Pass X/Total (Δ +N)`, `Fail`, `Error`, `Latencia mediana ms (Δ)`.
- Bloque "Qué cambió":
  - Lista (máx 8) de casos `fixed` (verde, ✓).
  - Lista (máx 8) de casos `regressed` (rojo, ⚠, prioridad visual).
  - Contador `still_failing` con botón "Ver sólo los que siguen rotos" que filtra la tabla de resultados.
- Bloque "Asserts más fallados ahora" (top 5): `assert_id`, fallos actuales, delta vs run previo (verde si bajó, rojo si subió).
- Si no hay run previo de la misma familia: mostrar sólo KPIs absolutos con nota "Sin run previo de esta familia para comparar".

### 4. Heatmap con marcadores de delta
En cada celda del heatmap añadir un pequeño badge:
- `▲` verde si la celda pasó de fail→pass.
- `▼` rojo si pasó de pass→fail.
- Tooltip con "antes: pass/total · ahora: pass/total".

### 5. Filtro rápido en tabla de resultados
- Toggle group encima de la tabla: `Todos` · `Sólo fail/error` · `Sólo regresiones` · `Sólo arreglados`.
- El filtro `regresiones` y `arreglados` usa el diff calculado en el paso 2.

### 6. Modal de detalle: contexto del cambio
Añadir, sólo si hay run anterior, una línea de cabecera tipo:
- "Estado anterior: ✅ pass" · "Estado anterior: ❌ fail (3 asserts)" · "Caso nuevo".
Sin tocar el resto del modal.

## Detalles técnicos

- Todo el cálculo es **client-side** sobre los dos arrays ya cargados; no requiere cambios en edge functions ni en el esquema.
- Tipos: extender el tipo local `Result` con un campo derivado `diff: 'fixed'|'regressed'|'still_failing'|'still_passing'|'new'`.
- Memoizar el diff con `useMemo` dependiendo de `[results, prevResults]`.
- Tokens semánticos del design system (`text-emerald-600`, `text-red-600`, `bg-amber-500/20`, etc. ya en uso) — no introducir colores nuevos.
- Sin nuevas dependencias.

## Fuera de alcance

- No se cambia la lógica del runner ni los asserts.
- No se toca la base de datos.
- No se añade ranking detallado de asserts más allá del top 5 del resumen (puede venir en una iteración posterior si hace falta).
