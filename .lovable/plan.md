

# Fix: Metricas emoji no se agrupan en tabla

## Problema

Las 8 metricas (lineas 957-989 del HTML exportado) usan `<ul>` en vez de `<ol>`, pero los dos detectores de metricas (`processNumberedMetricBlocks` y `regroupIsolatedMetrics`) solo buscan `<ol>` y `</ol>`. Por eso nunca matchean y las metricas quedan como 8 listas sueltas de 1 item cada una.

## Solucion

Un unico cambio en `src/lib/markdownToHtml.ts`: hacer que ambas funciones acepten tanto `<ol>` como `<ul>`.

### Cambios concretos

**1. `processNumberedMetricBlocks` (lineas 1296-1315)**

- Linea 1303: `trimmed === '<ol>'` cambia a `trimmed === '<ol>' || trimmed === '<ul>'`
- Linea 1309: `trimmed === '</ol>'` cambia a `trimmed === '</ol>' || trimmed === '</ul>'`

**2. `regroupIsolatedMetrics` (lineas 1424-1426)**

- `singleMetricOlPattern`: de `/^<ol>\s*$/` a `/^<[ou]l>\s*$/`
- `closeOlPattern`: de `/^<\/ol>\s*$/` a `/^<\/[ou]l>\s*$/`

**3. Trailing whitespace en `metricLiPattern`**

El contenido real tiene espacios al final antes de `</li>` (ej. `69 pts 🟡  </li>`). Verificar que el `\s*` antes de `<\/li>` los absorbe (ya lo hace, OK).

## Resultado

Las 8 metricas se agruparan en una unica `emoji-metrics-table` con columnas: #, Nombre, Valor, Semaforo -- independientemente de si el markdown produce `<ul>` o `<ol>`.
