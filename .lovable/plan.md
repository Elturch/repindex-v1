

# Mejoras de coherencia estetica en el informe exportado

## Problemas diagnosticados en el HTML actual

### 1. Negritas rotas y mal distribuidas
El auto-highlighter produce cortes absurdos:
- `<strong>DICTAMEN</strong> PERICIAL` — parte un titulo
- `<strong>Grok y</strong> DeepSeek` — parte una frase a mitad
- `<strong>Foco de</strong> riesgo` — idem
- Secciones V, VI, VII y VIII no tienen ninguna negrita

**Causa raiz**: El regex de nombres propios captura "Grok y" o "Foco de" como nombre propio porque "y" y "de" estan en la lista de conectores permitidos. Ademas, el bloque de texto donde esta el titulo "DICTAMEN PERICIAL..." se cuenta como un unico bloque gigante que consume varias negritas, dejando los bloques posteriores sin presupuesto.

### 2. Metricas numeradas no se reagrupan
Las 8 metricas (lineas tipo `1. Calidad de la Narrativa -- 68 🟡`) quedan cada una en su propio `<ol>` aislado. `regroupIsolatedMetrics` no las detecta porque busca emojis ya envueltos en `<span class="emoji-status">`, pero a esa altura del pipeline los emojis todavia son texto plano.

### 3. Cabecera principal no se convierte a section-band
El titulo "DICTAMEN PERICIAL DE REPUTACION ALGORITMICA..." esta entre dos `<hr>` pero `unifyHrTitleHeaders` lo rechaza porque el texto contiene minusculas y es demasiado largo. No es un section-band, es un titulo compuesto con subtexto.

### 4. Titulos de seccion con numerales romanos sin formato
"I. IDENTIFICACION DEL OBJETO", "IV. ANALISIS POR METRICA", "VII. CONCLUSIONES PERICIALES" son parrafos planos sin distincion visual.

## Plan de cambios

### Archivo: `src/lib/markdownToHtml.ts`

**Cambio 1 -- Corregir el regex de nombres propios (lineas ~652-672)**

El problema principal es que "y", "de", "del" actuan como conectores dentro del match, produciendo capturas como "Grok y" o "Foco de". Fix:
- Requerir que el match termine en una palabra capitalizada o acronimo (no en un conector).
- Excluir matches cuyo texto contenga solo 2 palabras y la segunda sea un conector.
- Tambien excluir matches que incluyan texto en mayusculas que forma parte de un titulo de seccion (todo mayusculas).

**Cambio 2 -- Aumentar MAX_HIGHLIGHTS y mejorar distribucion (lineas ~710-785)**

- Subir MAX_HIGHLIGHTS de 15 a 20 para informes largos como este (8+ secciones).
- Hacer el calculo del presupuesto proporcional al tamano del bloque (no solo al numero de candidatos), para que bloques largos de texto reciban mas cupo.
- Garantizar minimo 1 highlight en los ultimos 30% del documento aunque la prioridad general ya este agotada.

**Cambio 3 -- Arreglar regroupIsolatedMetrics para emojis sin envolver (lineas ~1275)**

El regex `metricLiPattern` busca `<span class="emoji...">` pero cuando se ejecuta, los emojis aun no se han envuelto. Cambiar el patron para que acepte tanto emojis crudos como emojis ya envueltos en span.

Regex actual:
```
/^<li>(.+?)\s*[—\-:]\s*(.+?)\s*(<span class="emoji[^"]*">(...)<\/span>)\s*<\/li>$/u
```
Regex corregido: aceptar tambien emoji crudo directamente:
```
/^<li>(.+?)\s*[—\-:]\s*(.+?)\s*((?:<span[^>]*>)?[\p{Emoji_Presentation}\p{Extended_Pictographic}](?:<\/span>)?(?:\s*→?\s*(?:<span[^>]*>)?[\p{Emoji_Presentation}\p{Extended_Pictographic}](?:<\/span>)?)?)\s*<\/li>$/u
```

**Cambio 4 -- Detectar titulos con numerales romanos como section-band o subsection**

Detectar lineas que comienzan con numeral romano seguido de titulo en mayusculas:
- Patron: `^(I|II|III|IV|V|VI|VII|VIII|IX|X)[.\s]+[A-Z][A-Z\s]+`
- Si el titulo es corto (<60 chars) y todo en mayusculas: convertir a `<div class="subsection-title">`
- Actualizar `processSubsectionTitles` para incluir este patron.

**Cambio 5 -- Mejorar unifyHrTitleHeaders para titulos compuestos**

Cuando el texto entre dos `<hr>` es largo y contiene mezcla de mayusculas/minusculas, no convertir a section-band sino dejarlo como un bloque destacado con clase `.report-dictamen-header` (un div con fondo gris claro, padding, y tipografia mas grande). Alternativamente, si el texto contiene linebreaks logicos, extraer solo la primera linea (la parte en mayusculas) como section-band y dejar el resto como parrafo normal.

**Cambio 6 -- CSS para nuevo estilo de cabecera de dictamen**

No se necesita un nuevo estilo especial: basta con que `unifyHrTitleHeaders` sea mas flexible. Si el texto entre `<hr>` es largo (>80 chars), tomar solo las primeras palabras en mayusculas como titulo de section-band y dejar el resto como primer parrafo.

## Resumen de impacto

- 1 archivo modificado: `src/lib/markdownToHtml.ts`
- Cambios en 5 funciones existentes, sin funciones nuevas
- Las negritas se distribuiran uniformemente en todo el documento
- Las 8 metricas se agruparan en tabla cohesiva
- Los titulos con numerales romanos tendran formato visual
- Sin cambios en backend ni componentes UI
