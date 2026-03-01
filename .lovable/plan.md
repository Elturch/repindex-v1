
# Coherencia estetica del informe exportado

## Problemas detectados en el HTML actual

### 1. Cabeceras de seccion inconsistentes
- "RESUMEN EJECUTIVO" y "PILAR 1" se renderizan como `<hr> + <p> + <hr>` (lineas finas grises, texto plano sin fondo).
- "PILAR 2", "PILAR 3", "CIERRE" y "FUENTES" usan `.section-band` (fondo azul claro, bordes azules, aspecto profesional).
- Causa: el LLM usa `---` (markdown HR) para las primeras secciones y `════` para las posteriores. El parser solo convierte el patron `════/TITULO/════` a section-band, pero no detecta `---/TITULO/---`.

### 2. Emojis de semaforo (colores) mal situados
- En las celdas de la tabla, emojis como `🟢 🔴 🟡` aparecen inline pegados al texto sin separacion visual.
- En las lineas de metricas ("61 pts 🟡") cada metrica queda en su propia `<ol>` aislada (con un unico `<li>`), en lugar de agruparse en una tabla de metricas cohesiva. El parser `processNumberedMetricBlocks` requiere 2+ metricas consecutivas dentro de un mismo `<ol>`, pero como cada una esta separada por un parrafo explicativo, no se agrupan.

### 3. Negritas automaticas rompiendo frases
- `<strong>RESUMEN</strong> EJECUTIVO` — la auto-negrita partio el titulo.
- `<strong>Promedio Semana 2026</strong>-03-01` — partio una fecha.
- `<strong>Cuatro de</strong> seis IAs` — partio una frase a mitad.
- `<strong>Suba el</strong> ratio` — igual.
- Causa: el regex de nombres propios detecta "Promedio Semana" o "Cuatro de" como nombres propios por la mayuscula.

### 4. Sub-titulos internos sin formato
- Lineas como "Las 8 Metricas (promedio ponderado)", "3 Hallazgos", "3 Recomendaciones", "5 Mensajes para la Direccion" quedan como parrafos planos (`<p>`), sin distincion visual respecto al cuerpo de texto.

## Plan de cambios

### Archivo: `src/lib/markdownToHtml.ts`

**Cambio 1 — Detectar patron `<hr>/TITULO/<hr>` como section-band**
En `processDecorativeSectionHeaders` (o como post-proceso), detectar secuencias `<hr>\n<p>TEXTO</p>\n<hr>` donde TEXTO es un titulo corto en mayusculas y convertirlas a `<div class="section-band">`. Esto unifica el aspecto de todas las cabeceras de seccion.

**Cambio 2 — Mejorar posicionamiento de emojis de semaforo**
- En tablas: actualizar `processEmojis` para que los emojis de semaforo (circulos de colores) reciban una clase CSS especifica (`.emoji-status`) con separacion izquierda y alineacion vertical.
- Anadir CSS para `.emoji-status` en `emojiGridStyles` y `premiumTableStyles`.

**Cambio 3 — Agrupar metricas separadas por parrafos**
El patron real del LLM es:
```text
1. Metrica — 61 pts 🟡
<parrafo explicativo>
2. Metrica — 54 pts 🟡
<parrafo explicativo>
```
Cada metrica queda en un `<ol>` propio con 1 `<li>`. El fix: detectar este patron post-conversion (multiples `<ol>` de 1 `<li>` con metrica+emoji, separados por `<p>`) y reagruparlos en una tabla `emoji-metrics-table`, dejando los parrafos explicativos debajo de cada fila o como bloque aparte tras la tabla.

**Cambio 4 — Proteger titulos y fechas del auto-negrita**
En `highlightSmartKeywords`:
- Excluir matches que empiecen justo despues de `---` o `===` (lineas de cabecera).
- Excluir matches donde el texto capturado forme parte de una fecha (patron `\d{4}-\d{2}`).
- Filtrar falsos positivos de nombres propios: requerir que cada palabra tenga 3+ caracteres (excluir "de", "el", "las" como parte del match) y que no sean inicio de frase tras punto.
- Anadir lista de exclusion: palabras comunes que empiezan con mayuscula por estar al inicio de frase ("Cuatro", "Suba", "Vision", "Cinco", "Solo").

**Cambio 5 — Sub-titulos internos con formato visual**
Detectar lineas cortas (< 60 chars) que son text puro sin puntuacion final y que actuan como sub-titulos (ej. "3 Hallazgos", "Las 8 Metricas"). Convertirlas a `<h3>` o un `<div class="subsection-title">` con estilo editorial (negrita, tamano intermedio, algo de margen superior).

**Cambio 6 — CSS para coherencia visual**
- `.subsection-title`: font-size 15px, font-weight 600, margin-top 28px, border-bottom 1px solid, color var(--text).
- `.emoji-status`: margin-left 6px, vertical-align middle, font-size 1em.
- Ajustar `.section-band` para que el titulo tenga font-size 13px (no mas grande que los h2 del cuerpo).

## Resultado esperado

- Todas las cabeceras de seccion (RESUMEN EJECUTIVO, PILAR 1, PILAR 2, PILAR 3, CIERRE, FUENTES) tendran identico formato visual: banda con fondo `#f0f4f8` y bordes azules.
- Los emojis de semaforo en tablas estaran correctamente separados y alineados.
- Las metricas numeradas con emoji formaran una tabla cohesiva en lugar de listas de 1 elemento.
- Las negritas automaticas no partiran frases ni fechas.
- Los sub-titulos internos tendran distincion visual clara respecto al texto.
- Coherencia estetica total entre todas las secciones del informe.
