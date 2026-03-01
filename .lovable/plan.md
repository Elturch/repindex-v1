
# Plan: Refactorizacion profunda del pipeline de conversion HTML

## Diagnostico real (evidencia del HTML exportado)

El informe exportado tiene **cero section-bands, cero subsection-titles, cero emoji-metrics-tables**. Todo el documento es una sucesion plana de `<p>` sin jerarquia visual. Las causas raiz son:

1. **Los separadores `——————` (em-dash U+2014) estan inline**, no en lineas separadas. La continuacion de streaming del LLM concatena el texto sin saltos de linea, produciendo: `...activos.—————————— RESUMEN EJECUTIVO —————————— El presente informe...` todo en una sola linea. El detector de cabeceras decorativas busca un patron de 3 lineas y nunca lo encuentra.

2. **El caracter `—` (em-dash) no esta en el `separatorPattern`**. El regex actual incluye `\-` (guion) pero no `—` (em-dash).

3. **Titulos de seccion como `PILAR 1 – DEFINIR` quedan como `<p>` planos** porque `processSubsectionTitles` no tiene patron para `PILAR \d+` ni para `CIERRE`.

4. **Bullets inline (`• item1 • item2`) no se convierten a `<ul><li>`**. Quedan como texto plano dentro de parrafos.

5. **Negritas siguen aplicandose a fragmentos absurdos** como `<strong>PILAR</strong>`, `<strong>III</strong>`, `<strong>FEB</strong>`.

## Solucion: Pre-procesamiento de texto crudo antes de la conversion

### Cambio 1 — Nueva funcion `preprocessRawMarkdown(markdown)` al inicio del pipeline

Se ejecuta ANTES de cualquier otra transformacion. Hace tres operaciones:

**1a) Separar cabeceras inline con em-dashes:**
Detectar el patron `——{6,}\s*TITULO\s*——{6,}` (10+ em-dashes rodeando texto) incluso si esta inline con otro texto. Insertar saltos de linea para aislar la cabecera en 3 lineas propias (separador / titulo / separador).

Regex: `/([^—])(—{6,})\s*([^—]+?)\s*(—{6,})([^—])/g`
Reemplazo: `$1\n$2\n$3\n$4\n$5`

**1b) Convertir bullets inline a lineas separadas:**
Detectar `• texto` repetido en la misma linea y separar cada bullet en su propia linea.

Regex: `/\s*•\s*/g` cuando hay 2+ ocurrencias en la misma linea.

**1c) Detectar subsecciones numeradas inline:**
Patron `\d+\.\d+\s+[A-Z]` (ej. "1.1 Alcance", "2.3 Benchmark") que aparecen pegados al texto anterior. Insertar salto de linea antes de cada subseccion.

### Cambio 2 — Anadir `—` (em-dash) al `separatorPattern`

En `processDecorativeSectionHeaders`, cambiar:
```
/^[═=─\-\*~☰▬■□▪▫●○◆◇►◄▲▼]{4,}\s*$/
```
a:
```
/^[═=─—\-\*~☰▬■□▪▫●○◆◇►◄▲▼]{4,}\s*$/
```

### Cambio 3 — Ampliar patrones de `processSubsectionTitles`

Anadir patrones para detectar:
- `PILAR \d+ [–—] TITULO` (ej. "PILAR 1 – DEFINIR")
- `CIERRE` como titulo de seccion
- `RESUMEN EJECUTIVO` como titulo de seccion
- `\d+\.\d+\s+Texto` como subtitulo interno (ej. "2.3 Benchmark competitivo")

Estos patrones se aplican a lineas que ya fueron aisladas por el preprocesador.

### Cambio 4 — Mejorar `processUnorderedLists` para bullets con `•`

El procesador actual solo detecta `* texto`, `- texto`, `+ texto`. Anadir soporte para `• texto` como marcador de lista.

### Cambio 5 — Refinar `highlightSmartKeywords` para excluir acronimos y titulos

Excluir del auto-bolding:
- Palabras enteramente en mayusculas de 2-4 letras (acronimos como PILAR, III, FEB, EBA, BCE)
- Texto que ya es parte de un titulo de seccion (patron PILAR, CIERRE, RESUMEN)

### Cambio 6 — Orden del pipeline en `convertMarkdownToHtml`

El pipeline queda:
```
1. preprocessRawMarkdown()     ← NUEVO: separa cabeceras inline, bullets, subsecciones
2. processMarkdownTables()
3. Code blocks + inline code
4. Headers (h1-h6)
5. Horizontal rules
6. Blockquotes
7. Bold/italic
8. Links
9. processOrderedLists()
10. processUnorderedLists()     ← AMPLIADO: soporte para •
11. processDecorativeSectionHeaders()  ← CORREGIDO: incluye —
12. unifyHrTitleHeaders()
13. processEmojiResultBlocks()
14. processNumberedMetricBlocks()
15. regroupIsolatedMetrics()
16. processSubsectionTitles()  ← AMPLIADO: PILAR, CIERRE, subsecciones
17. wrapInParagraphs()
18. applyHighlightsToParas()   ← REFINADO: excluye acronimos
```

## Archivo modificado

- `src/lib/markdownToHtml.ts` (unico archivo)

## Resultado esperado

- `—————— RESUMEN EJECUTIVO ——————` se convierte en `.section-band` azul con bordes
- `—————— PILAR 1 — DEFINIR ——————` idem
- `—————— CIERRE ——————` idem
- `1.1 Alcance y proposito` se convierte en `.subsection-title` con borde inferior
- `• item1 • item2 • item3` se convierte en `<ul>` con `<li>` separados
- Las negritas automaticas solo afectan a prosa narrativa, nunca a acronimos ni titulos
- El informe pasa de ser un muro de `<p>` a tener jerarquia visual clara con bandas, subtitulos y listas
