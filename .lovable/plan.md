
# Plan: Correccion integral de la estetica del informe exportado

## Problemas concretos encontrados en el HTML

1. **Negritas rotas**: `<strong>DICTAMEN</strong> PERICIAL`, `<strong>Grok y</strong> DeepSeek`, `<strong>Foco de</strong> riesgo`, `<strong>III</strong>. CONSTATACION` — el highlighter rompe titulos y frases
2. **Las 8 metricas NO se agrupan en tabla**: cada metrica queda como `<ol>` aislado de 1 `<li>`. El regex `metricLiPattern` falla porque:
   - Las metricas contienen `<strong>` tags dentro del `<li>` (ej. `<strong>Calidad de la Narrativa</strong>`)
   - El formato `68 🟡→ 🟢` tiene flecha y doble emoji que no matchea
3. **Titulos con numerales romanos (I-VIII) sin formato**: `processSubsectionTitles` no matchea porque el texto contiene `<strong>` inline (ej. `IV. <strong>ANALISIS</strong> POR METRICA`)
4. **Cabecera DICTAMEN no convertida a section-band**: `unifyHrTitleHeaders` rechaza texto largo con mezcla de mayusculas/minusculas
5. **Secciones V-VIII sin ninguna negrita**: el presupuesto de highlights se agota en la primera mitad

## Cambios en `src/lib/markdownToHtml.ts`

### Cambio 1 — Orden del pipeline: highlights DESPUES de procesamiento estructural

El problema raiz es que `highlightSmartKeywords` opera sobre el markdown crudo ANTES de la conversion HTML, pero genera `**texto**` que luego se convierte a `<strong>` dentro de titulos, metricas y seccion-bands, rompiendo todos los regex posteriores.

Solucion: mover `highlightSmartKeywords` para que se ejecute SOLO sobre el texto de parrafos (`<p>...</p>`) DESPUES de la conversion HTML completa. Asi:
- Los titulos de seccion nunca reciben auto-bold
- Las metricas en `<li>` nunca se rompen
- Las negritas solo aparecen en prosa narrativa

Implementacion concreta:
- En `convertMarkdownToHtml`, eliminar la llamada a `highlightSmartKeywords` al inicio (linea 828)
- Crear una nueva funcion `applyHighlightsToParas(html)` que:
  1. Extraiga el contenido de cada `<p>...</p>`
  2. Aplique `highlightSmartKeywords` solo a ese contenido
  3. Reinserte el resultado

### Cambio 2 — Corregir `metricLiPattern` para aceptar `<strong>` y flechas

El regex actual:
```
/^<li>(.+?)\s*[—\-–:]\s*(.+?)\s*((?:<span[^>]*>)?[\p{Emoji}]...)\s*<\/li>$/u
```

Necesita:
- Aceptar `<strong>` y `</strong>` dentro del nombre de metrica
- Aceptar `→` como separador entre emojis (ej. `🟡→ 🟢`)
- Aceptar emojis crudos sin span

Nuevo regex:
```
/^<li>(?:<strong>)?(.+?)(?:<\/strong>)?\s*[—\-–:]\s*(.+?)\s*([\p{Emoji_Presentation}\p{Extended_Pictographic}](?:\s*→?\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}])?)\s*<\/li>$/u
```

Aplicar el mismo fix tanto en `processNumberedMetricBlocks` (linea 1171) como en `regroupIsolatedMetrics` (linea 1320).

### Cambio 3 — `processSubsectionTitles`: limpiar `<strong>` antes de matchear

El texto que llega es `IV. <strong>ANALISIS</strong> POR METRICA`. El regex actual no matchea porque tiene tags HTML.

Fix: en `processSubsectionTitles`, antes de hacer el test del patron, limpiar tags `<strong>` y `</strong>` del texto. Esto ya se hace parcialmente (linea 1429) pero el resultado no se usa para el test de Roman numerals — el regex requiere que la linea NO empiece con `<`.

Solucion: mover la comprobacion `trimmed.startsWith('<')` para que solo excluya tags de bloque (`<div`, `<table`, `<ol>`, `<ul>`, `<h1`...) pero permita lineas que empiecen con texto inline como `<strong>`.

### Cambio 4 — `unifyHrTitleHeaders`: manejar cabecera DICTAMEN compuesta

El texto entre los dos `<hr>` es: `DICTAMEN PERICIAL DE REPUTACION ALGORITMICA Snapshot dominical canonico: 1 de marzo de 2026 Cobertura: 167 empresas...`

Esto es largo (>80 chars) y mezcla mayusculas/minusculas. El codigo actual intenta extraer el segmento uppercase inicial pero el regex `^([A-Z\s]+?)(?=\s+[a-z])` no matchea bien porque `ALGORÍTMICA` tiene tilde.

Fix: mejorar el regex para incluir caracteres acentuados en mayusculas: `^([A-ZÁÉÍÓÚÑ\s]+?)(?=\s+[a-záéíóúñ])` (ya esta asi en parte). El problema real es que `<strong>DICTAMEN</strong> PERICIAL...` llega con tags. Limpiar `<strong>` del titulo antes de analizar.

### Cambio 5 — Garantizar negritas en secciones finales

Con el cambio 1 (highlights solo en `<p>`), la distribucion mejora automaticamente porque ya no se desperdician highlights en titulos y metricas. Adicionalmente:
- Aumentar MAX_HIGHLIGHTS a 25
- En la garantia del 30% final, asegurar minimo 2 highlights (no solo 1) si hay candidatos disponibles

### Cambio 6 — CSS para emoji-status en tablas de metricas

Anadir regla CSS para que cuando un emoji de semaforo aparece dentro de una celda de tabla o de una `emoji-metrics-table`, tenga margen izquierdo y alineacion vertical correcta:

```css
.emoji-metrics-table .metric-status .emoji-status {
  margin-left: 0;
}
td .emoji-status {
  margin-left: 4px;
  vertical-align: middle;
}
```

## Resultado esperado

- La cabecera DICTAMEN se convierte en section-band (parte uppercase) + parrafo (metadatos)
- Los titulos I. a VIII. se formatean como `.subsection-title` con fondo y separador
- Las 8 metricas se agrupan en una unica `emoji-metrics-table` con columnas: #, Nombre, Valor, Semaforo
- Las negritas automaticas SOLO aparecen en parrafos narrativos, nunca en titulos ni metricas
- Las secciones V-VIII reciben su cuota proporcional de highlights
- Los emojis de semaforo estan correctamente alineados en tablas

## Archivo modificado

- `src/lib/markdownToHtml.ts` (unico archivo)
